import { think, BrainMessage, BrainResponse } from "../brain";
import { loadIdentity } from "./self";
import { getEmotion, getRegulator } from "../limbic/regulator";

export type TaskType = "think" | "evolve" | "status";

export interface TaskContext {
  type: TaskType;
  input: string;
  identity: Record<string, string>;
  emotion: string;
  energy: number;
  confidence: number;
}

export async function classifyInput(input: string): Promise<TaskType> {
  const lower = input.toLowerCase();
  if (lower.includes("evolve") || lower.includes("improve") || lower.includes("grow")) return "evolve";
  if (lower.includes("status") || lower.includes("health") || lower.includes("alive")) return "status";
  return "think";
}

export async function buildContext(env: any, input: string): Promise<TaskContext> {
  const type = await classifyInput(input);
  const identity = await loadIdentity(env.DB);
  const emotion = await getEmotion(env.DB);
  const reg = await getRegulator(env.DB);
  return { type, input, identity, emotion, energy: reg.energy, confidence: reg.confidence };
}

export async function route(env: any, ctx: TaskContext): Promise<BrainResponse> {
  const { loadIntellect } = await import("./intellect");
  const system = await loadIntellect(env, ctx);
  return think(env, system, [{ role: "user", content: ctx.input }]);
}
