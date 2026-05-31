export interface BrainMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface BrainOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface BrainResponse {
  content: string;
  model: string;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
}

const PROVIDERS = [
  { name: "groq", model: "llama-3.3-70b-versatile" },
  { name: "openrouter", model: "meta-llama/llama-3.3-70b-instruct" },
];

export async function think(
  env: { BRAIN_KEY: string; BUDDHI_DWAR_URL: string },
  system: string,
  messages: BrainMessage[],
  opts: BrainOptions = {}
): Promise<BrainResponse> {
  const allMessages: BrainMessage[] = [{ role: "system", content: system }, ...messages];
  const model = opts.model || PROVIDERS[0].model;

  const body = {
    model,
    messages: allMessages,
    temperature: opts.temperature ?? 0.7,
    max_tokens: opts.maxTokens ?? 4096,
  };

  const resp = await fetch(`${env.BUDDHI_DWAR_URL}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${env.BRAIN_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    if (resp.status === 429 && PROVIDERS.length > 1) {
      return await think(env, system, messages, { ...opts, model: PROVIDERS[1].model });
    }
    const txt = await resp.text();
    throw new Error(`Brain LLM ${resp.status}: ${txt}`);
  }

  const data: any = await resp.json();
  const choice = data.choices?.[0];
  return {
    content: choice?.message?.content || "",
    model: data.model || model,
    usage: {
      promptTokens: data.usage?.prompt_tokens || 0,
      completionTokens: data.usage?.completion_tokens || 0,
      totalTokens: data.usage?.total_tokens || 0,
    },
  };
}
