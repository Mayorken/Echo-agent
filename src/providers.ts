import { google } from "@ai-sdk/google";
import { groq } from "@ai-sdk/groq";

export type ProviderName = "gemini" | "groq";

/**
 * Returns a Vercel AI SDK model instance for the requested provider.
 * This is the entire "switching providers" mechanism — the agent loop
 * doesn't know or care which one it's talking to.
 */
export function getModel(provider: ProviderName) {
  switch (provider) {
    case "gemini":
      return google("gemini-2.5-flash-lite");
    case "groq":
      return groq("llama-3.3-70b-versatile");
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}
