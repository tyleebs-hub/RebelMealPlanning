import "server-only";
import Anthropic from "@anthropic-ai/sdk";

export const isAiConfigured = Boolean(process.env.ANTHROPIC_API_KEY);
export const AI_MODEL = "claude-sonnet-4-6";

let cached: Anthropic | null = null;
function client(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set");
  if (!cached) cached = new Anthropic();
  return cached;
}

export type ToolDef = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
};

export type Validated<T> = { ok: true; value: T } | { ok: false; error: string };

// Call Sonnet forcing a single tool and return the validated tool input. The
// system prompt + stable context are cached (prefix); volatile content is the
// user message. Retries once with the validation failure fed back.
export async function forcedTool<T>(opts: {
  system: string;
  cachedContext: string;
  userContent: string;
  tool: ToolDef;
  validate: (input: unknown) => Validated<T>;
}): Promise<T> {
  const c = client();

  const runOnce = async (extra?: string): Promise<unknown> => {
    const res = await c.messages.create({
      model: AI_MODEL,
      max_tokens: 4000,
      system: [
        { type: "text", text: opts.system },
        { type: "text", text: opts.cachedContext, cache_control: { type: "ephemeral" } },
      ],
      // strict guarantees the tool input validates against the schema.
      tools: [{ ...opts.tool, strict: true } as unknown as Anthropic.Tool],
      tool_choice: { type: "tool", name: opts.tool.name },
      messages: [
        { role: "user", content: extra ? `${opts.userContent}\n\n${extra}` : opts.userContent },
      ],
    });
    const block = res.content.find((b) => b.type === "tool_use");
    if (!block || block.type !== "tool_use") throw new Error("Model returned no tool call");
    return block.input;
  };

  let v = opts.validate(await runOnce());
  if (!v.ok) {
    v = opts.validate(
      await runOnce(`Your previous answer was rejected: ${v.error} Return the tool again, corrected.`),
    );
    if (!v.ok) throw new Error(v.error);
  }
  return v.value;
}

export type ChatMessage = { role: "user" | "assistant"; content: string };

// Conversational completion. System + cached context, then the conversation.
// If a (non-forced) tool is passed, the model may also emit structured actions;
// returns the assistant text plus any tool input (null if it didn't call it).
export async function chatComplete(opts: {
  system: string;
  cachedContext: string;
  messages: ChatMessage[];
  tool?: ToolDef;
}): Promise<{ text: string; toolInput: unknown | null }> {
  const res = await client().messages.create({
    model: AI_MODEL,
    max_tokens: 1500,
    system: [
      { type: "text", text: opts.system },
      { type: "text", text: opts.cachedContext, cache_control: { type: "ephemeral" } },
    ],
    messages: opts.messages,
    ...(opts.tool ? { tools: [opts.tool as unknown as Anthropic.Tool] } : {}),
  });
  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
  const toolBlock = res.content.find((b) => b.type === "tool_use");
  return { text, toolInput: toolBlock && toolBlock.type === "tool_use" ? toolBlock.input : null };
}
