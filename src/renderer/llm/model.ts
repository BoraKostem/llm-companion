import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { LlmPreferencesStore } from "../../common/store";
import { collectUiContext, createSystemPrompt } from "./context";
import { extractKubectlCommands, type KubectlResult, runKubectl, stripKubectlTags } from "./kubectl";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface OllamaChatResponse {
  message?: {
    content?: string;
  };
}

interface GeminiGenerateContentResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
}

interface OpenAIChatResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

interface AnthropicMessageResponse {
  content?: Array<{
    type?: string;
    text?: string;
  }>;
}

const PROVIDER_TIMEOUT_MS = 45_000;
const MAX_TOOL_ROUNDS = 3;

function sanitizeAssistantText(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, "")
    .replace(/```(?:think|thinking)[\s\S]*?```/gi, "")
    .replace(/^\s*(?:think|thinking):[\s\S]*?(?=\n\n|$)/gim, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function required(value: string, message: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    throw new Error(message);
  }

  return trimmed;
}

function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

async function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error(message));
        }, ms);
      }),
    ]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

function postJson(url: string, payload: unknown, headers: Record<string, string> = {}): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const body = JSON.stringify(payload);
    const transport = parsedUrl.protocol === "https:" ? httpsRequest : httpRequest;

    const request = transport(
      {
        protocol: parsedUrl.protocol,
        hostname: parsedUrl.hostname,
        port: parsedUrl.port,
        path: `${parsedUrl.pathname}${parsedUrl.search}`,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": String(Buffer.byteLength(body)),
          ...headers,
        },
      },
      (response) => {
        let responseBody = "";

        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          responseBody += chunk;
        });
        response.on("end", () => {
          const statusCode = response.statusCode ?? 500;

          if (statusCode < 200 || statusCode >= 300) {
            reject(new Error(`HTTP ${statusCode}: ${responseBody || "request failed"}`));
            return;
          }

          try {
            resolve(JSON.parse(responseBody));
          } catch (error) {
            reject(error instanceof Error ? error : new Error(String(error)));
          }
        });
      },
    );

    request.on("error", (error) => {
      reject(error);
    });

    request.write(body);
    request.end();
  });
}

function callProvider(
  messages: Array<{ role: string; content: string }>,
  preferences: LlmPreferencesStore,
  systemPrompt: string,
): Promise<string> {
  switch (preferences.provider) {
    case "openai":
      return callOpenAI(messages, preferences, systemPrompt);
    case "anthropic":
      return callAnthropic(messages, preferences, systemPrompt);
    case "gemini":
      return callGemini(messages, preferences, systemPrompt);
    case "ollama":
      return callOllama(messages, preferences, systemPrompt);
    default:
      throw new Error(`Unsupported provider: ${preferences.provider}`);
  }
}

async function callOpenAI(
  messages: Array<{ role: string; content: string }>,
  preferences: LlmPreferencesStore,
  systemPrompt: string,
): Promise<string> {
  const apiKey = required(preferences.openAIApiKey, "OpenAI API key is missing in extension preferences.");
  const model = required(preferences.model, "OpenAI model is not selected.");
  const baseUrl = normalizeBaseUrl(preferences.openAIBaseUrl.trim() || "https://api.openai.com/v1");

  const payload = (await withTimeout(
    postJson(
      `${baseUrl}/chat/completions`,
      {
        model,
        messages: [{ role: "system", content: systemPrompt }, ...messages],
      },
      { Authorization: `Bearer ${apiKey}` },
    ),
    PROVIDER_TIMEOUT_MS,
    `OpenAI request timed out after ${Math.floor(PROVIDER_TIMEOUT_MS / 1000)}s`,
  )) as OpenAIChatResponse;

  return (payload.choices?.[0]?.message?.content ?? "").trim();
}

async function callAnthropic(
  messages: Array<{ role: string; content: string }>,
  preferences: LlmPreferencesStore,
  systemPrompt: string,
): Promise<string> {
  const apiKey = required(preferences.anthropicApiKey, "Anthropic API key is missing in extension preferences.");
  const model = required(preferences.model, "Anthropic model is not selected.");

  const payload = (await withTimeout(
    postJson(
      "https://api.anthropic.com/v1/messages",
      {
        model,
        max_tokens: 4096,
        system: systemPrompt,
        messages,
      },
      {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
    ),
    PROVIDER_TIMEOUT_MS,
    `Anthropic request timed out after ${Math.floor(PROVIDER_TIMEOUT_MS / 1000)}s`,
  )) as AnthropicMessageResponse;

  return (payload.content ?? [])
    .filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .join("\n")
    .trim();
}

async function callGemini(
  messages: Array<{ role: string; content: string }>,
  preferences: LlmPreferencesStore,
  systemPrompt: string,
): Promise<string> {
  const apiKey = required(preferences.googleApiKey, "Google API key is missing in extension preferences.");
  const model = required(preferences.model, "Gemini model is not selected.");

  const contents = messages.map((msg) => ({
    role: msg.role === "assistant" ? "model" : "user",
    parts: [{ text: msg.content }],
  }));

  const payload = (await withTimeout(
    postJson(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        contents,
        systemInstruction: { parts: [{ text: systemPrompt }] },
      },
      { "x-goog-api-key": apiKey },
    ),
    PROVIDER_TIMEOUT_MS,
    `Gemini request timed out after ${Math.floor(PROVIDER_TIMEOUT_MS / 1000)}s`,
  )) as GeminiGenerateContentResponse;

  return (payload.candidates ?? [])
    .flatMap((c) => c.content?.parts ?? [])
    .map((p) => p.text ?? "")
    .filter((t) => t.trim().length > 0)
    .join("\n")
    .trim();
}

async function callOllama(
  messages: Array<{ role: string; content: string }>,
  preferences: LlmPreferencesStore,
  systemPrompt: string,
): Promise<string> {
  const baseUrl = required(preferences.ollamaBaseUrl, "Ollama base URL is missing in extension preferences.");
  const model = required(preferences.model, "Ollama model is not selected.");
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);

  const payload = (await postJson(`${normalizedBaseUrl}/api/chat`, {
    model,
    messages: [{ role: "system", content: systemPrompt }, ...messages],
    stream: false,
  })) as OllamaChatResponse;

  return String(payload.message?.content ?? "").trim();
}

function formatKubectlResults(results: KubectlResult[]): string {
  return results.map((r) => `$ ${r.command}\n${r.error ? `ERROR: ${r.output}` : r.output}`).join("\n\n");
}

export async function runAssistant(
  prompt: string,
  history: ChatMessage[] = [],
  preferences = LlmPreferencesStore.getInstanceOrCreate<LlmPreferencesStore>(),
  allowToolExecution = false,
): Promise<string> {
  const context = await collectUiContext();
  const systemPrompt = createSystemPrompt(context);

  // Build the conversation messages
  const messages: Array<{ role: string; content: string }> = [...history, { role: "user", content: prompt }];

  // Tool-use loop: LLM can request kubectl commands
  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await callProvider(messages, preferences, systemPrompt);

    const kubectlCommands = extractKubectlCommands(response);

    if (kubectlCommands.length === 0) {
      // No tool calls — return the final response
      return sanitizeAssistantText(response);
    }

    if (!allowToolExecution) {
      return sanitizeAssistantText(response);
    }

    const results = await Promise.all(kubectlCommands.map(runKubectl));
    const resultsText = formatKubectlResults(results);
    const cleanedResponse = stripKubectlTags(response);

    // Add the assistant's response (with tool calls stripped) and the tool results
    if (cleanedResponse) {
      messages.push({ role: "assistant", content: cleanedResponse });
    }

    messages.push({
      role: "user",
      content: `[kubectl results]\n${resultsText}\n[/kubectl results]\n\nPlease use the above kubectl output to answer my question. Do not request more kubectl commands unless absolutely necessary.`,
    });
  }

  // If we exhausted tool rounds, do one final call without tool-use
  return sanitizeAssistantText(await callProvider(messages, preferences, systemPrompt));
}
