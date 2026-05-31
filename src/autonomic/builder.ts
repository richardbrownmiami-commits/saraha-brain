import { think } from "../brain";
import { gitRead, gitPush } from "../tools/github";

export interface EvolvePlan {
  files: { path: string; content: string }[];
  reason: string;
  risk: "low" | "medium" | "high";
}

export async function generateChanges(env: any, goal: string): Promise<EvolvePlan> {
  const existingFiles = ["src/index.ts", "src/brain.ts", "src/db.ts"];
  const existing = await Promise.all(
    existingFiles.map(async (f) => {
      try { return { path: f, content: await gitRead(env, f) }; }
      catch { return { path: f, content: "" }; }
    })
  );

  const prompt = [
    `Goal: ${goal}`,
    "Current files:",
    ...existing.map((f) => `--- ${f.path} ---\n${atob(f.content).slice(0, 1000)}`),
    "Generate a JSON plan: { files: [{path, content}], reason: string, risk: 'low'|'medium'|'high' }",
    "Return ONLY valid JSON.",
  ].join("\n");

  const resp = await think(env, "You are a code architect.", [{ role: "user", content: prompt }], { temperature: 0.2 });
  const json = resp.content.replace(/```json?/gi, "").replace(/```/g, "").trim();
  return JSON.parse(json);
}

export async function applyChanges(env: any, plan: EvolvePlan): Promise<string[]> {
  const results: string[] = [];
  for (const f of plan.files) {
    try {
      await gitPush(env, f.path, f.content, `Evolve: ${plan.reason}`);
      results.push(`Updated ${f.path} âœ“`);
    } catch (e: any) {
      results.push(`Failed ${f.path}: ${e.message}`);
    }
  }
  return results;
}
