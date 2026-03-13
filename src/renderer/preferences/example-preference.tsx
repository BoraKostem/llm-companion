import { type CSSProperties, useEffect, useState } from "react";
import { providerDefaults } from "../../common/llm-config";
import { LlmPreferencesStore, type LlmProvider } from "../../common/store";

const preferences = LlmPreferencesStore.getInstanceOrCreate<LlmPreferencesStore>();

const providerOptions: Array<{ label: string; value: LlmProvider }> = [
  { label: "ChatGPT (OpenAI)", value: "openai" },
  { label: "Claude (Anthropic)", value: "anthropic" },
  { label: "Gemini (Google)", value: "gemini" },
  { label: "Ollama", value: "ollama" },
];

const styles: Record<string, CSSProperties> = {
  root: {
    display: "grid",
    gap: 14,
    maxWidth: 760,
    marginTop: 8,
  },
  field: {
    display: "grid",
    gap: 6,
  },
  label: {
    fontSize: 14,
    fontWeight: 600,
    color: "#c6ccd8",
  },
  control: {
    width: "100%",
    maxWidth: 420,
    minHeight: 36,
    borderRadius: 6,
    border: "1px solid #4b5568",
    background: "#1f2734",
    color: "#e6ebf5",
    padding: "8px 10px",
    boxSizing: "border-box",
  },
};

interface PreferencesFormState {
  provider: LlmProvider;
  openAIApiKey: string;
  openAIBaseUrl: string;
  anthropicApiKey: string;
  googleApiKey: string;
  ollamaBaseUrl: string;
}

function readFormState(): PreferencesFormState {
  return {
    provider: preferences.provider,
    openAIApiKey: preferences.openAIApiKey,
    openAIBaseUrl: preferences.openAIBaseUrl,
    anthropicApiKey: preferences.anthropicApiKey,
    googleApiKey: preferences.googleApiKey,
    ollamaBaseUrl: preferences.ollamaBaseUrl,
  };
}

export const LlmPreferenceInput = () => {
  const [form, setForm] = useState<PreferencesFormState>(() => readFormState());

  useEffect(() => {
    setForm(readFormState());
  }, []);

  const updateForm = <K extends keyof PreferencesFormState>(key: K, value: PreferencesFormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  return (
    <div style={styles.root}>
      <div style={styles.field}>
        <label style={styles.label} htmlFor="llm-provider">
          Provider
        </label>
        <select
          id="llm-provider"
          style={styles.control}
          value={form.provider}
          onChange={(event) => {
            const provider = event.target.value as LlmProvider;

            updateForm("provider", provider);
            preferences.provider = provider;
            preferences.model = providerDefaults[provider];
          }}
        >
          {providerOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div style={styles.field}>
        <label style={styles.label} htmlFor="llm-openai-key">
          OpenAI API Key
        </label>
        <input
          id="llm-openai-key"
          style={styles.control}
          type="password"
          value={form.openAIApiKey}
          placeholder="sk-..."
          onChange={(event) => {
            updateForm("openAIApiKey", event.target.value);
            preferences.openAIApiKey = event.target.value;
          }}
        />
      </div>

      <div style={styles.field}>
        <label style={styles.label} htmlFor="llm-openai-base-url">
          OpenAI Base URL (optional)
        </label>
        <input
          id="llm-openai-base-url"
          style={styles.control}
          type="text"
          value={form.openAIBaseUrl}
          placeholder="https://api.openai.com/v1"
          onChange={(event) => {
            updateForm("openAIBaseUrl", event.target.value);
            preferences.openAIBaseUrl = event.target.value;
          }}
        />
      </div>

      <div style={styles.field}>
        <label style={styles.label} htmlFor="llm-anthropic-key">
          Anthropic API Key
        </label>
        <input
          id="llm-anthropic-key"
          style={styles.control}
          type="password"
          value={form.anthropicApiKey}
          placeholder="sk-ant-..."
          onChange={(event) => {
            updateForm("anthropicApiKey", event.target.value);
            preferences.anthropicApiKey = event.target.value;
          }}
        />
      </div>

      <div style={styles.field}>
        <label style={styles.label} htmlFor="llm-google-key">
          Google API Key
        </label>
        <input
          id="llm-google-key"
          style={styles.control}
          type="password"
          value={form.googleApiKey}
          placeholder="AIza..."
          onChange={(event) => {
            updateForm("googleApiKey", event.target.value);
            preferences.googleApiKey = event.target.value;
          }}
        />
      </div>

      <div style={styles.field}>
        <label style={styles.label} htmlFor="llm-ollama-base-url">
          Ollama Base URL
        </label>
        <input
          id="llm-ollama-base-url"
          style={styles.control}
          type="text"
          value={form.ollamaBaseUrl}
          placeholder="http://127.0.0.1:11434"
          onChange={(event) => {
            updateForm("ollamaBaseUrl", event.target.value);
            preferences.ollamaBaseUrl = event.target.value;
          }}
        />
      </div>
    </div>
  );
};

export const LlmPreferenceHint = () => <span>Choose provider in settings and switch models from the chat panel.</span>;
