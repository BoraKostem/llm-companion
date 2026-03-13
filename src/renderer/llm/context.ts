import { runKubectl } from "./kubectl";

export interface UiContext {
  route: string;
  screenContent: string;
}

const MAX_SCREEN_CHARS = 8_000;

interface RouteKubectlMapping {
  pattern: RegExp;
  description: string;
  commands: (match: RegExpMatchArray) => string[];
}

const ROUTE_MAPPINGS: RouteKubectlMapping[] = [
  {
    pattern: /\/pods\/([^/]+)\/([^/]+)/,
    description: "viewing pod details",
    commands: (m) => [`kubectl get pod ${m[2]} -n ${m[1]} -o wide`, `kubectl describe pod ${m[2]} -n ${m[1]}`],
  },
  {
    pattern: /\/pods(?:\/([^/]+))?/,
    description: "viewing pods list",
    commands: (m) => [m[1] ? `kubectl get pods -n ${m[1]} -o wide` : "kubectl get pods -A -o wide"],
  },
  {
    pattern: /\/deployments\/([^/]+)\/([^/]+)/,
    description: "viewing deployment details",
    commands: (m) => [
      `kubectl get deployment ${m[2]} -n ${m[1]} -o wide`,
      `kubectl describe deployment ${m[2]} -n ${m[1]}`,
    ],
  },
  {
    pattern: /\/deployments(?:\/([^/]+))?/,
    description: "viewing deployments list",
    commands: (m) => [m[1] ? `kubectl get deployments -n ${m[1]} -o wide` : "kubectl get deployments -A -o wide"],
  },
  {
    pattern: /\/services\/([^/]+)\/([^/]+)/,
    description: "viewing service details",
    commands: (m) => [`kubectl get service ${m[2]} -n ${m[1]} -o wide`, `kubectl describe service ${m[2]} -n ${m[1]}`],
  },
  {
    pattern: /\/services(?:\/([^/]+))?/,
    description: "viewing services list",
    commands: (m) => [m[1] ? `kubectl get services -n ${m[1]} -o wide` : "kubectl get services -A -o wide"],
  },
  {
    pattern: /\/configmaps\/([^/]+)\/([^/]+)/,
    description: "viewing configmap details",
    commands: (m) => [`kubectl describe configmap ${m[2]} -n ${m[1]}`],
  },
  {
    pattern: /\/configmaps(?:\/([^/]+))?/,
    description: "viewing configmaps list",
    commands: (m) => [m[1] ? `kubectl get configmaps -n ${m[1]}` : "kubectl get configmaps -A"],
  },
  {
    pattern: /\/secrets\/([^/]+)\/([^/]+)/,
    description: "viewing secret details",
    commands: (m) => [`kubectl describe secret ${m[2]} -n ${m[1]}`],
  },
  {
    pattern: /\/secrets(?:\/([^/]+))?/,
    description: "viewing secrets list",
    commands: (m) => [m[1] ? `kubectl get secrets -n ${m[1]}` : "kubectl get secrets -A"],
  },
  {
    pattern: /\/statefulsets\/([^/]+)\/([^/]+)/,
    description: "viewing statefulset details",
    commands: (m) => [
      `kubectl get statefulset ${m[2]} -n ${m[1]} -o wide`,
      `kubectl describe statefulset ${m[2]} -n ${m[1]}`,
    ],
  },
  {
    pattern: /\/statefulsets(?:\/([^/]+))?/,
    description: "viewing statefulsets list",
    commands: (m) => [m[1] ? `kubectl get statefulsets -n ${m[1]} -o wide` : "kubectl get statefulsets -A -o wide"],
  },
  {
    pattern: /\/daemonsets\/([^/]+)\/([^/]+)/,
    description: "viewing daemonset details",
    commands: (m) => [
      `kubectl get daemonset ${m[2]} -n ${m[1]} -o wide`,
      `kubectl describe daemonset ${m[2]} -n ${m[1]}`,
    ],
  },
  {
    pattern: /\/daemonsets(?:\/([^/]+))?/,
    description: "viewing daemonsets list",
    commands: (m) => [m[1] ? `kubectl get daemonsets -n ${m[1]} -o wide` : "kubectl get daemonsets -A -o wide"],
  },
  {
    pattern: /\/replicasets(?:\/([^/]+))?/,
    description: "viewing replicasets list",
    commands: (m) => [m[1] ? `kubectl get replicasets -n ${m[1]} -o wide` : "kubectl get replicasets -A -o wide"],
  },
  {
    pattern: /\/jobs\/([^/]+)\/([^/]+)/,
    description: "viewing job details",
    commands: (m) => [`kubectl describe job ${m[2]} -n ${m[1]}`],
  },
  {
    pattern: /\/jobs(?:\/([^/]+))?/,
    description: "viewing jobs list",
    commands: (m) => [m[1] ? `kubectl get jobs -n ${m[1]} -o wide` : "kubectl get jobs -A -o wide"],
  },
  {
    pattern: /\/cronjobs\/([^/]+)\/([^/]+)/,
    description: "viewing cronjob details",
    commands: (m) => [`kubectl describe cronjob ${m[2]} -n ${m[1]}`],
  },
  {
    pattern: /\/cronjobs(?:\/([^/]+))?/,
    description: "viewing cronjobs list",
    commands: (m) => [m[1] ? `kubectl get cronjobs -n ${m[1]}` : "kubectl get cronjobs -A"],
  },
  {
    pattern: /\/ingresses\/([^/]+)\/([^/]+)/,
    description: "viewing ingress details",
    commands: (m) => [`kubectl describe ingress ${m[2]} -n ${m[1]}`],
  },
  {
    pattern: /\/ingresses(?:\/([^/]+))?/,
    description: "viewing ingresses list",
    commands: (m) => [m[1] ? `kubectl get ingresses -n ${m[1]}` : "kubectl get ingresses -A"],
  },
  {
    pattern: /\/networkpolicies(?:\/([^/]+))?/,
    description: "viewing network policies list",
    commands: (m) => [m[1] ? `kubectl get networkpolicies -n ${m[1]}` : "kubectl get networkpolicies -A"],
  },
  {
    pattern: /\/namespaces/,
    description: "viewing namespaces",
    commands: () => ["kubectl get namespaces"],
  },
  {
    pattern: /\/nodes\/([^/]+)/,
    description: "viewing node details",
    commands: (m) => [`kubectl describe node ${m[1]}`],
  },
  {
    pattern: /\/nodes/,
    description: "viewing nodes list",
    commands: () => ["kubectl get nodes -o wide"],
  },
  {
    pattern: /\/persistentvolumeclaims\/([^/]+)\/([^/]+)/,
    description: "viewing PVC details",
    commands: (m) => [`kubectl describe pvc ${m[2]} -n ${m[1]}`],
  },
  {
    pattern: /\/persistentvolumeclaims(?:\/([^/]+))?/,
    description: "viewing PVCs list",
    commands: (m) => [m[1] ? `kubectl get pvc -n ${m[1]}` : "kubectl get pvc -A"],
  },
  {
    pattern: /\/storageclasses/,
    description: "viewing storage classes",
    commands: () => ["kubectl get storageclasses"],
  },
  {
    pattern: /\/persistentvolumes/,
    description: "viewing persistent volumes",
    commands: () => ["kubectl get pv"],
  },
  {
    pattern: /\/events(?:\/([^/]+))?/,
    description: "viewing events",
    commands: (m) => [
      m[1]
        ? `kubectl get events -n ${m[1]} --sort-by=.lastTimestamp`
        : "kubectl get events -A --sort-by=.lastTimestamp",
    ],
  },
  {
    pattern: /\/endpoints(?:\/([^/]+))?/,
    description: "viewing endpoints",
    commands: (m) => [m[1] ? `kubectl get endpoints -n ${m[1]}` : "kubectl get endpoints -A"],
  },
  {
    pattern: /\/serviceaccounts(?:\/([^/]+))?/,
    description: "viewing service accounts",
    commands: (m) => [m[1] ? `kubectl get serviceaccounts -n ${m[1]}` : "kubectl get serviceaccounts -A"],
  },
  {
    pattern: /\/roles(?:\/([^/]+))?/,
    description: "viewing roles",
    commands: (m) => [m[1] ? `kubectl get roles -n ${m[1]}` : "kubectl get roles -A"],
  },
  {
    pattern: /\/clusterroles/,
    description: "viewing cluster roles",
    commands: () => ["kubectl get clusterroles"],
  },
  {
    pattern: /\/rolebindings(?:\/([^/]+))?/,
    description: "viewing role bindings",
    commands: (m) => [m[1] ? `kubectl get rolebindings -n ${m[1]}` : "kubectl get rolebindings -A"],
  },
  {
    pattern: /\/clusterrolebindings/,
    description: "viewing cluster role bindings",
    commands: () => ["kubectl get clusterrolebindings"],
  },
  {
    // Cluster overview
    pattern: /\/cluster\/[a-f0-9]+\/?$/,
    description: "viewing cluster overview",
    commands: () => ["kubectl get nodes -o wide", "kubectl get namespaces"],
  },
];

function cleanText(raw: string): string {
  const lines = raw
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 0);

  let text = lines.join("\n");

  if (text.length > MAX_SCREEN_CHARS) {
    text = `${text.slice(0, MAX_SCREEN_CHARS)}\n... (truncated)`;
  }

  return text;
}

async function getRouteContext(route: string): Promise<{ description: string; content: string }> {
  for (const mapping of ROUTE_MAPPINGS) {
    const match = route.match(mapping.pattern);

    if (match) {
      console.log("[LLM] route matched:", mapping.description);

      const results = await Promise.all(mapping.commands(match).map(runKubectl));
      const content = results.map((r) => `$ ${r.command}\n${r.error ? `ERROR: ${r.output}` : r.output}`).join("\n\n");

      return { description: mapping.description, content };
    }
  }

  return { description: "unknown view", content: "" };
}

export async function collectUiContext(): Promise<UiContext> {
  const route = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const { description, content } = await getRouteContext(route);

  const screenContent = cleanText(content);

  console.log("[LLM] route:", route, "view:", description, "content length:", screenContent.length);

  return { route, screenContent };
}

export function createSystemPrompt(context: UiContext): string {
  const screenSection = context.screenContent
    ? `## What the user sees on screen right now\n\`\`\`\n${context.screenContent}\n\`\`\``
    : "No screen content could be captured.";

  return [
    "You are a Kubernetes assistant inside Freelens.",
    "",
    screenSection,
    "",
    "## kubectl tool",
    "You have access to kubectl to query the cluster. To run a command, wrap it in <kubectl> tags:",
    "<kubectl>kubectl get pods -n kube-system</kubectl>",
    "",
    "Rules:",
    "- Only read-only commands are allowed (get, describe, logs, top, explain, api-resources, api-versions, cluster-info, version).",
    "- Destructive commands (apply, delete, create, exec, etc.) are blocked.",
    "- You can run multiple commands by using multiple <kubectl> tags.",
    "- IMPORTANT: Before running any kubectl command, you MUST first tell the user what command you plan to run and ask for confirmation. Output something like:",
    '  "I\'ll run the following command to get that information:\\n\\n`kubectl get pods -n kube-system`\\n\\nShall I proceed?"',
    "- Only output <kubectl> tags AFTER the user has confirmed (said yes, ok, sure, go ahead, etc.).",
    "- If the user's message is a direct confirmation (yes, ok, sure, go ahead, y, proceed) to a previous command proposal, go ahead and run the command.",
    '- When the user asks to "list pods" or similar direct requests, propose the command first.',
    "",
    "## Context",
    `Current UI route: ${context.route}`,
    "Use the screen content above to understand what the user is currently looking at.",
    "Use kubectl to gather additional cluster information when needed.",
  ].join("\n");
}
