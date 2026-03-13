import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const KUBECTL_TIMEOUT_MS = 15_000;
const MAX_OUTPUT_BYTES = 32_000;

// Only allow read-only subcommands
const ALLOWED_SUBCOMMANDS = new Set([
  "get",
  "describe",
  "logs",
  "top",
  "explain",
  "api-resources",
  "api-versions",
  "cluster-info",
  "version",
  "config",
  "auth",
]);

const BLOCKED_PATTERNS = [
  /\bapply\b/i,
  /\bdelete\b/i,
  /\bcreate\b/i,
  /\bpatch\b/i,
  /\breplace\b/i,
  /\bexec\b/i,
  /\battach\b/i,
  /\brun\b/i,
  /\bscale\b/i,
  /\brollout\b/i,
  /\bcordon\b/i,
  /\bdrain\b/i,
  /\btaint\b/i,
  /\blabel\b/i,
  /\bannotate\b/i,
  /\bport-forward\b/i,
  /\bproxy\b/i,
  /\bcp\b/i,
  /\bedit\b/i,
];

export interface KubectlResult {
  command: string;
  output: string;
  error: boolean;
}

interface ClusterStoreData {
  clusters?: Array<{
    id?: string;
    contextName?: string;
    kubeConfigPath?: string;
  }>;
}

function getFreelensDataDir(): string {
  // On Windows: %APPDATA%/Freelens, on macOS: ~/Library/Application Support/Freelens, on Linux: ~/.config/Freelens
  const appData =
    process.env.APPDATA ??
    (process.platform === "darwin"
      ? join(process.env.HOME ?? "", "Library", "Application Support")
      : join(process.env.HOME ?? "", ".config"));

  return join(appData, "Freelens");
}

async function getClusterConfig(clusterId: string): Promise<{ kubeConfigPath: string; contextName: string } | null> {
  try {
    const storePath = join(getFreelensDataDir(), "lens-cluster-store.json");
    const raw = await readFile(storePath, "utf8");
    const data = JSON.parse(raw) as ClusterStoreData;

    const cluster = (data.clusters ?? []).find((c) => c.id === clusterId);

    if (cluster?.kubeConfigPath && cluster?.contextName) {
      return {
        kubeConfigPath: cluster.kubeConfigPath,
        contextName: cluster.contextName,
      };
    }
  } catch {
    // Ignore — will fall back to default kubeconfig
  }

  return null;
}

function extractClusterIdFromRoute(route: string): string | undefined {
  // Freelens routes look like: /cluster/39de8ad0904c2d4004835e2cc8599df8/...
  const match = route.match(/\/cluster\/([a-f0-9]+)/i);

  return match?.[1];
}

function parseKubectlArgs(command: string): string[] {
  const args: string[] = [];
  let current = "";
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < command.length; i++) {
    const char = command[i];

    if (char === "'" && !inDouble) {
      inSingle = !inSingle;
    } else if (char === '"' && !inSingle) {
      inDouble = !inDouble;
    } else if (char === " " && !inSingle && !inDouble) {
      if (current) {
        args.push(current);
        current = "";
      }
    } else {
      current += char;
    }
  }

  if (current) {
    args.push(current);
  }

  return args;
}

function validateCommand(args: string[]): string | null {
  if (args.length === 0) {
    return "empty command";
  }

  // Strip leading "kubectl" if present
  const startIndex = args[0] === "kubectl" ? 1 : 0;
  const subcommand = args[startIndex]?.toLowerCase();

  if (!subcommand) {
    return "no subcommand provided";
  }

  if (!ALLOWED_SUBCOMMANDS.has(subcommand)) {
    return `subcommand "${subcommand}" is not allowed (read-only commands only)`;
  }

  const fullCommand = args.join(" ");

  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(fullCommand)) {
      return `command contains blocked pattern: ${pattern}`;
    }
  }

  return null;
}

export async function runKubectl(command: string): Promise<KubectlResult> {
  const rawArgs = parseKubectlArgs(command.trim());

  // Strip leading "kubectl"
  const args = rawArgs[0] === "kubectl" ? rawArgs.slice(1) : rawArgs;

  const validationError = validateCommand(rawArgs);

  if (validationError) {
    return {
      command: `kubectl ${args.join(" ")}`,
      output: `Blocked: ${validationError}`,
      error: true,
    };
  }

  // Try to resolve the active cluster's kubeconfig from Freelens
  const route = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const clusterId = extractClusterIdFromRoute(route);
  const clusterConfig = clusterId ? await getClusterConfig(clusterId) : null;

  const kubectlArgs = [...args];

  if (clusterConfig) {
    // Only inject if the user hasn't specified their own --kubeconfig or --context
    const argsStr = kubectlArgs.join(" ");

    if (!argsStr.includes("--kubeconfig")) {
      kubectlArgs.push("--kubeconfig", clusterConfig.kubeConfigPath);
    }

    if (!argsStr.includes("--context")) {
      kubectlArgs.push("--context", clusterConfig.contextName);
    }
  }

  const displayCommand = `kubectl ${args.join(" ")}`;

  return new Promise((resolve) => {
    execFile(
      "kubectl",
      kubectlArgs,
      { timeout: KUBECTL_TIMEOUT_MS, maxBuffer: MAX_OUTPUT_BYTES },
      (error, stdout, stderr) => {
        if (error) {
          resolve({
            command: displayCommand,
            output: stderr?.trim() || error.message,
            error: true,
          });

          return;
        }

        const output = stdout.trim();

        resolve({
          command: displayCommand,
          output: output.length > MAX_OUTPUT_BYTES ? `${output.slice(0, MAX_OUTPUT_BYTES)}\n... (truncated)` : output,
          error: false,
        });
      },
    );
  });
}

export function extractKubectlCommands(text: string): string[] {
  const commands: string[] = [];
  const pattern = /<kubectl>([\s\S]*?)<\/kubectl>/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    const cmd = match[1].trim();

    if (cmd) {
      commands.push(cmd);
    }
  }

  return commands;
}

export function stripKubectlTags(text: string): string {
  return text.replace(/<kubectl>[\s\S]*?<\/kubectl>/g, "").trim();
}
