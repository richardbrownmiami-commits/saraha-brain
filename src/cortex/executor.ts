import { think } from "../brain";
import { Step } from "./planner";
import { TaskContext } from "./thalamus";

export async function execute(env: any, ctx: TaskContext, steps: Step[]): Promise<string> {
  const results: string[] = [];

  for (const step of steps) {
    if (step.tool === "web") {
      const { webSearch } = await import("../tools/web");
      try {
        const data = await webSearch(step.input || step.description);
        results.push(`Step ${step.id} (web): ${data.slice(0, 1000)}`);
      } catch (e: any) {
        results.push(`Step ${step.id} (web) failed: ${e.message}`);
      }
    } else if (step.tool === "github") {
      const { gitRead } = await import("../tools/github");
      try {
        const data = await gitRead(env, step.input || "");
        results.push(`Step ${step.id} (github): OK`);
      } catch (e: any) {
        results.push(`Step ${step.id} (github) failed: ${e.message}`);
      }
    } else {
      results.push(`Step ${step.id}: ${step.description}`);
    }
  }

  const summary = [
    `You completed ${steps.length} step(s) for task: ${ctx.input}`,
    ...results,
    "Summarize what was done and any results.",
  ].join("\n");

  const resp = await think(env, "You are summarizing completed work.", [{ role: "user", content: summary }]);
  return resp.content;
}
