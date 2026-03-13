import { Common } from "@freelensapp/extensions";
import { makeObservable, observable } from "mobx";

export interface ExamplePreferencesModel {
  enabled: boolean;
}

export class ExamplePreferencesStore extends Common.Store.ExtensionStore<ExamplePreferencesModel> {
  @observable accessor enabled = false;

  constructor() {
    super({
      configName: "example-preferences-store",
      defaults: {
        enabled: false,
      },
    });

    makeObservable(this);
  }

  fromStore({ enabled }: ExamplePreferencesModel): void {
    this.enabled = enabled;
  }

  toJSON(): ExamplePreferencesModel {
    return { enabled: this.enabled };
  }
}

export type LlmProvider = "openai" | "anthropic" | "gemini" | "ollama";

export interface LlmPreferencesModel {
  provider: LlmProvider;
  model: string;
  openAIApiKey: string;
  openAIBaseUrl: string;
  anthropicApiKey: string;
  googleApiKey: string;
  ollamaBaseUrl: string;
}

export class LlmPreferencesStore extends Common.Store.ExtensionStore<LlmPreferencesModel> {
  @observable accessor provider: LlmProvider = "openai";
  @observable accessor model = "gpt-4o-mini";
  @observable accessor openAIApiKey = "";
  @observable accessor openAIBaseUrl = "";
  @observable accessor anthropicApiKey = "";
  @observable accessor googleApiKey = "";
  @observable accessor ollamaBaseUrl = "http://127.0.0.1:11434";

  constructor() {
    super({
      configName: "llm-preferences-store",
      defaults: {
        provider: "openai",
        model: "gpt-4o-mini",
        openAIApiKey: "",
        openAIBaseUrl: "",
        anthropicApiKey: "",
        googleApiKey: "",
        ollamaBaseUrl: "http://127.0.0.1:11434",
      },
    });

    makeObservable(this);
  }

  fromStore(data: LlmPreferencesModel): void {
    this.provider = data.provider;
    this.model = data.model;
    this.openAIApiKey = data.openAIApiKey;
    this.openAIBaseUrl = data.openAIBaseUrl;
    this.anthropicApiKey = data.anthropicApiKey;
    this.googleApiKey = data.googleApiKey;
    this.ollamaBaseUrl = data.ollamaBaseUrl;
  }

  toJSON(): LlmPreferencesModel {
    return {
      provider: this.provider,
      model: this.model,
      openAIApiKey: this.openAIApiKey,
      openAIBaseUrl: this.openAIBaseUrl,
      anthropicApiKey: this.anthropicApiKey,
      googleApiKey: this.googleApiKey,
      ollamaBaseUrl: this.ollamaBaseUrl,
    };
  }
}
