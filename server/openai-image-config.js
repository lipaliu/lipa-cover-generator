import { providerEnv } from "./provider-settings.js";
// Server-side only. Keep the engine ID independent from the provider's model ID.
export function openAIImageModel(env = providerEnv()) {
  return String(env.OPENAI_MODEL || "").trim() || "gpt-image-2";
}
