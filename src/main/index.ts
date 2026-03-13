import { Main } from "@freelensapp/extensions";
import { LlmPreferencesStore } from "../common/store";

export default class LlmMainExtension extends Main.LensExtension {
  async onActivate() {
    await LlmPreferencesStore.getInstanceOrCreate<LlmPreferencesStore>().loadExtension(this);
  }
}
