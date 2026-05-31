import { think, BrainMessage } from "../brain";
import { TaskContext } from "./thalamus";

export interface Step {
  id: number;
  description: string;
  tool?: string;
  input?: string;
}

export async function plan(env: any, ctx: TaskContext): Promise<Step[]> {
  const planningPrompt = [
    "Break this task into numbered steps. Each step can optionally use a tool (web, github).",
    "Format: JSON array of {id, description, tool?, input?}",
    "Available tools: web (fetch URLs, search), github (push code, read files)",
    `Task: ${ctx.input}`,
    "Return ONLY valid JSON, no markdown.",
  ].join("\n");

  const resp = await think(env, planningPrompt, [{ role: "user", content: ctx.input }], { temperature: 0.3 });
  const json = resp.content.replace(/```json?/gi, "").replace(/```/g, "").trim();
  try {
    return JSON.parse(json);
  } catch {
    return [{ id: 1, description: ctx.input }];
  }
}
