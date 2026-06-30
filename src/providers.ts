import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";

export type ProviderName = "openai" | "anthropic";

/**
 * Returns a Vercel AI SDK model instance for the requested provider.
 * This is the entire "switching providers" mechanism — the agent loop
 * doesn't know or care which one it's talking to.
 */
export function getModel(provider: ProviderName) {
  switch (provider) {
    case "openai":
      return openai("gpt-4o");
    case "anthropic":
      return anthropic("claude-sonnet-4-5");
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}
