import { get as httpGet } from "node:http";
import { get as httpsGet } from "node:https";
import { Renderer } from "@freelensapp/extensions";
import { type CSSProperties, useEffect, useMemo, useState } from "react";
import { providerDefaults, providerModelOptions } from "../../../common/llm-config";
import { LlmPreferencesStore } from "../../../common/store";
import { extractKubectlCommands, stripKubectlTags } from "../../llm/kubectl";
import { type ChatMessage, runAssistant } from "../../llm/model";

interface OllamaTagsResponse {
  models?: Array<{
    name?: string;
    model?: string;
  }>;
}

interface OpenAiModelsResponse {
  data?: Array<{
    id?: string;
  }>;
}

interface AnthropicModelsResponse {
  data?: Array<{
    id?: string;
    type?: string;
  }>;
}

interface GeminiModelsResponse {
  models?: Array<{
    name?: string;
  }>;
}

const styles: Record<string, CSSProperties> = {
  topbarButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    border: "1px solid #5472d3",
    borderRadius: 6,
    background: "#2d3e7e",
    color: "#fff",
    padding: "4px 10px",
    cursor: "pointer",
  },
  panel: {
    position: "fixed",
    pointerEvents: "auto",
    userSelect: "text",
    WebkitUserSelect: "text",
    left: "clamp(72px, 18vw, 280px)",
    right: 0,
    bottom: 0,
    height: "min(42vh, 360px)",
    display: "flex",
    flexDirection: "column",
    borderTop: "1px solid #3b4a7d",
    background: "#0b1019",
    color: "#d8e2ff",
    zIndex: 2000,
    boxShadow: "0 -12px 28px rgba(0, 0, 0, 0.45)",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    padding: 10,
    borderBottom: "1px solid #2a355d",
    background: "#141c2b",
  },
  headerLeft: {
    display: "grid",
    gap: 8,
  },
  modelLabel: {
    display: "grid",
    gap: 4,
    fontSize: 12,
  },
  modelRow: {
    display: "grid",
    gridTemplateColumns: "1fr auto",
    alignItems: "center",
    gap: 6,
  },
  inputControl: {
    width: "100%",
    border: "1px solid #4f5f96",
    borderRadius: 6,
    background: "#0f1730",
    color: "#d8e2ff",
    padding: 6,
    boxSizing: "border-box",
  },
  closeButton: {
    border: "1px solid #4d5e97",
    background: "#1a2542",
    color: "#d8e2ff",
    borderRadius: 6,
    padding: "4px 8px",
  },
  refreshButton: {
    border: "1px solid #4d5e97",
    background: "#1a2542",
    color: "#d8e2ff",
    borderRadius: 6,
    padding: "4px 8px",
    fontSize: 12,
  },
  modelError: {
    color: "#ff9a9a",
    fontSize: 11,
  },
  messages: {
    flex: 1,
    userSelect: "text",
    WebkitUserSelect: "text",
    minHeight: 0,
    overflow: "auto",
    display: "grid",
    gap: 8,
    padding: 10,
  },
  message: {
    borderRadius: 8,
    position: "relative",
    cursor: "text",
    userSelect: "text",
    WebkitUserSelect: "text",
    padding: 8,
    whiteSpace: "pre-wrap",
    fontSize: 12,
  },
  userMessage: {
    background: "#1f377f",
  },
  assistantMessage: {
    background: "#19243f",
  },
  inputRow: {
    display: "grid",
    gap: 8,
    padding: 10,
    borderTop: "1px solid #2a355d",
    background: "#0f1625",
  },
  sendButton: {
    justifySelf: "end",
    border: "1px solid #5472d3",
    borderRadius: 6,
    background: "#2d3e7e",
    color: "#fff",
    padding: "6px 12px",
  },
  messageActions: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 8,
  },
  messageBody: {
    flex: 1,
    userSelect: "text",
    WebkitUserSelect: "text",
  },
  copyButton: {
    flexShrink: 0,
    border: "1px solid #4d5e97",
    background: "#11192f",
    color: "#d8e2ff",
    borderRadius: 6,
    padding: "2px 6px",
    fontSize: 11,
    cursor: "pointer",
  },
};

function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

function uniqueNonEmpty(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter((value) => value.length > 0)));
}

function requestJson(url: string, headers: Record<string, string> = {}): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const transport = parsedUrl.protocol === "https:" ? httpsGet : httpGet;

    const request = transport(url, { headers }, (response) => {
      let body = "";

      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => {
        const statusCode = response.statusCode ?? 500;

        if (statusCode < 200 || statusCode >= 300) {
          reject(new Error(`HTTP ${statusCode}`));
          return;
        }

        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      });
    });

    request.on("error", (error) => {
      reject(error);
    });
  });
}

function extractNamesFromTags(payload: unknown): string[] {
  const models = (payload as OllamaTagsResponse).models ?? [];

  return uniqueNonEmpty(models.map((model) => model.name ?? model.model ?? ""));
}

function extractNamesFromV1Models(payload: unknown): string[] {
  const data = (payload as OpenAiModelsResponse).data ?? [];

  return uniqueNonEmpty(data.map((item) => item.id ?? ""));
}

async function fetchOllamaModelNames(baseUrl: string): Promise<string[]> {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  const attempts: Array<{ path: string; parser: (payload: unknown) => string[] }> = [
    { path: "/api/tags", parser: extractNamesFromTags },
    { path: "/v1/models", parser: extractNamesFromV1Models },
  ];

  const errors: string[] = [];

  for (const attempt of attempts) {
    try {
      const payload = await requestJson(`${normalizedBaseUrl}${attempt.path}`);
      const names = attempt.parser(payload);

      if (names.length > 0) {
        return names;
      }

      errors.push(`${attempt.path}: empty model list`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      errors.push(`${attempt.path}: ${message}`);
    }
  }

  throw new Error(errors.join(" | "));
}

async function fetchOpenAIModelNames(apiKey: string, baseUrl: string): Promise<string[]> {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl.trim() || "https://api.openai.com/v1");
  const payload = await requestJson(`${normalizedBaseUrl}/models`, {
    Authorization: `Bearer ${apiKey}`,
  });

  const data = (payload as OpenAiModelsResponse).data ?? [];
  const names = uniqueNonEmpty(data.map((item) => item.id ?? ""));

  // Filter to chat models only (exclude embeddings, tts, dall-e, whisper, etc.)
  const chatModels = names.filter(
    (name) =>
      /^(gpt-|o[1-9]|chatgpt-)/.test(name) &&
      !/instruct|embed|tts|whisper|dall-e|realtime|audio|search|moderation/.test(name),
  );

  if (chatModels.length > 0) {
    return chatModels.sort();
  }

  // If filtering removed everything (custom endpoint), return all
  if (names.length > 0) {
    return names.sort();
  }

  throw new Error("No models found");
}

async function fetchAnthropicModelNames(apiKey: string): Promise<string[]> {
  const payload = await requestJson("https://api.anthropic.com/v1/models", {
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
  });

  const data = (payload as AnthropicModelsResponse).data ?? [];
  const names = uniqueNonEmpty(data.map((item) => item.id ?? ""));

  if (names.length > 0) {
    return names.sort();
  }

  throw new Error("No models found");
}

async function fetchGeminiModelNames(apiKey: string): Promise<string[]> {
  const payload = await requestJson(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
  );

  const models = (payload as GeminiModelsResponse).models ?? [];
  const names = uniqueNonEmpty(
    models
      .map((m) => m.name ?? "")
      .filter((name) => name.startsWith("models/"))
      .map((name) => name.replace("models/", ""))
      .filter((name) => /gemini/.test(name) && !/aqa|embed|vision/.test(name)),
  );

  if (names.length > 0) {
    return names.sort();
  }

  throw new Error("No models found");
}

export const LlmTopBarChat = () => {
  const preferences = useMemo(() => LlmPreferencesStore.getInstanceOrCreate<LlmPreferencesStore>(), []);
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState(() => preferences.model);
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelLoadError, setModelLoadError] = useState<string | null>(null);
  const [modelRefreshVersion, setModelRefreshVersion] = useState(0);
  const [pendingKubectlCommands, setPendingKubectlCommands] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;

    const loadModelOptions = async () => {
      const provider = preferences.provider;

      setModelLoadError(null);
      setLoadingModels(true);

      const fallback = providerDefaults[provider];

      try {
        let options: string[];

        switch (provider) {
          case "openai":
            options = await fetchOpenAIModelNames(preferences.openAIApiKey, preferences.openAIBaseUrl);
            break;
          case "anthropic":
            options = await fetchAnthropicModelNames(preferences.anthropicApiKey);
            break;
          case "gemini":
            options = await fetchGeminiModelNames(preferences.googleApiKey);
            break;
          case "ollama":
            options = await fetchOllamaModelNames(preferences.ollamaBaseUrl);
            break;
          default:
            options = [fallback];
        }

        if (cancelled) {
          return;
        }

        setModelOptions(options);

        const nextModel =
          !preferences.model.trim() || !options.includes(preferences.model.trim())
            ? (options[0] ?? fallback)
            : preferences.model;

        preferences.model = nextModel;
        setSelectedModel(nextModel);
      } catch (error) {
        if (cancelled) {
          return;
        }

        const message = error instanceof Error ? error.message : `Failed to load ${provider} models.`;

        // Fall back to hardcoded list if API key is missing or request fails
        const hardcoded = provider !== "ollama" ? providerModelOptions[provider] : [];

        if (hardcoded.length > 0) {
          setModelOptions(hardcoded);
          setSelectedModel(
            preferences.model.trim() && hardcoded.includes(preferences.model.trim()) ? preferences.model : hardcoded[0],
          );
          setModelLoadError(`Using default model list (${message})`);
        } else {
          setModelOptions([]);
          setSelectedModel("");
          setModelLoadError(`Could not load models (${message})`);
        }
      } finally {
        if (!cancelled) {
          setLoadingModels(false);
        }
      }
    };

    void loadModelOptions();

    return () => {
      cancelled = true;
    };
  }, [
    preferences,
    preferences.provider,
    preferences.ollamaBaseUrl,
    preferences.openAIApiKey,
    preferences.openAIBaseUrl,
    preferences.anthropicApiKey,
    preferences.googleApiKey,
    modelRefreshVersion,
  ]);

  const send = async () => {
    const prompt = input.trim();

    if (!prompt || running) {
      return;
    }

    const isConfirmation = /^(y|yes|ok|okay|sure|go ahead|proceed|do it|run it)$/i.test(prompt);

    setInput("");
    setRunning(true);
    setMessages((current) => [...current, { role: "user", content: prompt }]);

    try {
      const rawResponse = await runAssistant(
        prompt,
        messages,
        preferences,
        pendingKubectlCommands.length > 0 && isConfirmation,
      );
      const kubectlCommands = extractKubectlCommands(rawResponse);
      const cleanedResponse = stripKubectlTags(rawResponse);
      const response =
        cleanedResponse ||
        (kubectlCommands.length > 0
          ? [
              `I'll run the following command${kubectlCommands.length > 1 ? "s" : ""}:`,
              "",
              ...kubectlCommands.map((command) => `- \`${command}\``),
              "",
              "Shall I proceed?",
            ].join("\n")
          : rawResponse);

      setPendingKubectlCommands(kubectlCommands);
      setMessages((current) => [...current, { role: "assistant", content: response }]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error while requesting model.";

      setMessages((current) => [...current, { role: "assistant", content: `Error: ${message}` }]);
      Renderer.Component.Notifications.error(`LLM request failed: ${message}`);
    } finally {
      setRunning(false);
    }
  };

  return (
    <>
      <button style={styles.topbarButton} onClick={() => setOpen(!open)}>
        <Renderer.Component.Icon material="smart_toy" small />
        <span>LLM</span>
      </button>

      {open && (
        <div data-llm-chat-root="true" style={styles.panel}>
          <div style={styles.header}>
            <div style={styles.headerLeft}>
              <strong>Cluster Assistant</strong>
              <label style={styles.modelLabel}>
                <span>Model</span>
                <div style={styles.modelRow}>
                  <select
                    style={styles.inputControl}
                    value={selectedModel}
                    disabled={loadingModels || modelOptions.length === 0}
                    onChange={(event) => {
                      const nextModel = event.target.value;

                      setSelectedModel(nextModel);
                      preferences.model = nextModel;
                    }}
                  >
                    {modelOptions.map((model) => (
                      <option key={model} value={model}>
                        {model}
                      </option>
                    ))}
                  </select>

                  <button
                    style={styles.refreshButton}
                    disabled={loadingModels}
                    onClick={() => setModelRefreshVersion((value) => value + 1)}
                  >
                    {loadingModels ? "..." : "Refresh"}
                  </button>
                </div>

                {modelLoadError && <span style={styles.modelError}>{modelLoadError}</span>}
              </label>
            </div>

            <div style={{ display: "flex", gap: 6 }}>
              <button style={styles.closeButton} disabled={messages.length === 0} onClick={() => setMessages([])}>
                Clear
              </button>
              <button style={styles.closeButton} onClick={() => setOpen(false)}>
                Close
              </button>
            </div>
          </div>

          <div style={styles.messages}>
            {messages.length === 0 && (
              <div style={{ ...styles.message, ...styles.assistantMessage }}>
                Ask about resources in your current Freelens context.
              </div>
            )}

            {messages.map((message, index) => (
              <div
                key={`${message.role}-${index}-${message.content.slice(0, 12)}`}
                style={{
                  ...styles.message,
                  ...(message.role === "user" ? styles.userMessage : styles.assistantMessage),
                }}
              >
                <div style={styles.messageActions}>
                  <div style={styles.messageBody}>{message.content}</div>
                  <button style={styles.copyButton} onClick={() => void navigator.clipboard.writeText(message.content)}>
                    Copy
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div style={styles.inputRow}>
            <textarea
              style={styles.inputControl}
              rows={3}
              value={input}
              placeholder="Ask about current namespace, pods, and resources..."
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void send();
                }
              }}
            />
            <button style={styles.sendButton} disabled={running} onClick={() => void send()}>
              {running ? "Running..." : "Send"}
            </button>
          </div>
        </div>
      )}
    </>
  );
};
