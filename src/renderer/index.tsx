/**
 * Copyright (c) Freelens Authors. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { Renderer } from "@freelensapp/extensions";
import { LlmPreferencesStore } from "../common/store";
import { LlmTopBarChat } from "./components/llm-chat/llm-topbar-chat";
import { LlmPreferenceHint, LlmPreferenceInput } from "./preferences/example-preference";

export default class LlmRendererExtension extends Renderer.LensExtension {
  async onActivate() {
    LlmPreferencesStore.getInstanceOrCreate<LlmPreferencesStore>().loadExtension(this);
  }

  appPreferences = [
    {
      title: "LLM Assistant",
      components: {
        Input: () => <LlmPreferenceInput />,
        Hint: () => <LlmPreferenceHint />,
      },
    },
  ];

  topBarItems = [
    {
      components: {
        Item: () => <LlmTopBarChat />,
      },
    },
  ];
}
