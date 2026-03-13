import type { LlmProvider } from "./store";

export const providerDefaults: Record<LlmProvider, string> = {
  openai: "gpt-4o-mini",
  anthropic: "claude-3-5-sonnet-latest",
  gemini: "gemini-2.0-flash",
  ollama: "llama3.1",
};

export const providerModelOptions: Record<Exclude<LlmProvider, "ollama">, string[]> = {
  openai: ["gpt-4o-mini", "gpt-4.1-mini", "gpt-4.1", "o4-mini"],
  anthropic: ["claude-3-5-sonnet-latest", "claude-3-7-sonnet-latest"],
  gemini: ["gemini-2.0-flash", "gemini-2.5-flash", "gemini-2.5-pro"],
};
