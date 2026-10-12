import "server-only";
import Anthropic from "@anthropic-ai/sdk";

export const isAiConfigured = Boolean(process.env.ANTHROPIC_API_KEY);
export const AI_MODEL = "claude-sonnet-5-5";

let cached: Anthropic | null = null;
function client(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set");
  if (!cached) cached = new Anthropic();
  return cached;
}

// If the model declines a request, the API re-runs it on another model inside
// the same call (Claude API only). Meal planning should never trip this; it's
// a safety net so a false positive doesn't surface as an error.
const FALLBACK = {
  betas: ["server-side-fallback-2026-07-01"],
  fallbacks: "default" as const,
};

export type ToolDef = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
};

export type Validated<T> = { ok: true; value: T } | { ok: false; error: string };

// Ask for JSON matching `schema` (structured outputs guarantee the shape) and
// return the validated value. The system prompt + stable context are cached
// (prefix); volatile content is the user message. Retries once with the
// validation failure fed back.
export async function structuredOutput<T>(opts: {
  system: string;
  cachedContext: string;
  userContent: string;
  schema: Record<string, unknown>;
  validate: (input: unknown) => Validated<T>;
}): Promise<T> {
  const c = client();

  const runOnce = async (extra?: string): Promise<unknown> => {
    const res = await c.beta.messages.create({
      model: AI_MODEL,
      // Thinking counts toward max_tokens, so leave room beyond the JSON itself.
      max_tokens: 16000,
      output_config: { effort: "medium", format: { type: "json_schema", schema: opts.schema } },
      ...FALLBACK,
      system: [
        { type: "text", text: opts.system },
        { type: "text", text: opts.cachedContext, cache_control: { type: "ephemeral" } },
      ],
      messages: [
        { role: "user", content: extra ? `${opts.userContent}\n\n${extra}` : opts.userContent },
      ],
    });
    if (res.stop_reason === "refusal") throw new Error("The planner declined this request. Try again.");
    if (res.stop_reason === "max_tokens") throw new Error("The planner ran out of room before finishing. Try again.");
    const text = res.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    try {
      return JSON.parse(text);
    } catch {
      throw new Error("The planner returned an unreadable answer. Try again.");
    }
  };

  let v = opts.validate(await runOnce());
  if (!v.ok) {
    v = opts.validate(
      await runOnce(`Your previous answer was rejected: ${v.error} Return the JSON again, corrected.`),
    );
    if (!v.ok) throw new Error(v.error);
  }
  return v.value;
}

export type ChatMessage = { role: "user" | "assistant"; content: string };

// Conversational completion. System + cached context, then the conversation.
// If a tool is passed, the model may also emit structured actions; returns the
// assistant text plus any tool input (null if it didn't call it).
export async function chatComplete(opts: {
  system: string;
  cachedContext: string;
  messages: ChatMessage[];
  tool?: ToolDef;
}): Promise<{ text: string; toolInput: unknown | null }> {
  const res = await client().beta.messages.create({
    model: AI_MODEL,
    max_tokens: 8000,
    output_config: { effort: "low" }, // brainstorm chat: quick replies
    ...FALLBACK,
    system: [
      { type: "text", text: opts.system },
      { type: "text", text: opts.cachedContext, cache_control: { type: "ephemeral" } },
    ],
    messages: opts.messages,
    ...(opts.tool ? { tools: [opts.tool as unknown as Anthropic.Beta.BetaTool] } : {}),
  });
  if (res.stop_reason === "refusal") {
    return { text: "Sorry, I can't help with that one. Try asking another way.", toolInput: null };
  }
  const text = res.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
  const toolBlock = res.content.find((b) => b.type === "tool_use");
  return { text, toolInput: toolBlock && toolBlock.type === "tool_use" ? toolBlock.input : null };
}
