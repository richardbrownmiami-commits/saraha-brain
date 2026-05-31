import { Hono } from "hono";
import { initDB, addAction, updateAction } from "./db";
import { route, buildContext, TaskContext } from "./cortex/thalamus";
import { plan } from "./cortex/planner";
import { execute } from "./cortex/executor";
import { heartbeat } from "./autonomic/heartbeat";

export interface Env {
  DB: D1Database;
  BRAIN_KEY: string;
  BUDDHI_DWAR_URL: string;
  GITHUB_TOKEN: string;
}

const app = new Hono<{ Bindings: Env }>();

app.get("/status", async (c) => {
  const hb = await heartbeat(c.env);
  return c.json(hb);
});

app.post("/think", async (c) => {
  const { input } = await c.req.json();
  const ctx = await buildContext(c.env, input);
  const actionId = await addAction(c.env.DB, "think", input);

  try {
    const steps = await plan(c.env, ctx);
    if (steps.length > 1) {
      const result = await execute(c.env, ctx, steps);
      await updateAction(c.env.DB, actionId, "done", result);
      return c.json({ result, steps, emotion: ctx.emotion, energy: ctx.energy });
    }
    const resp = await route(c.env, ctx);
    await updateAction(c.env.DB, actionId, "done", resp.content);
    return c.json({ result: resp.content, model: resp.model, usage: resp.usage, emotion: ctx.emotion });
  } catch (e: any) {
    await updateAction(c.env.DB, actionId, "error", undefined, e.message);
    return c.json({ error: e.message }, 500);
  }
});

app.post("/evolve", async (c) => {
  const { goal } = await c.req.json();
  const { generateChanges, applyChanges } = await import("./autonomic/builder");
  const plan2 = await generateChanges(c.env, goal);
  const results = await applyChanges(c.env, plan2);
  return c.json({ plan: plan2, results });
});

app.get("/brain/activity", async (c) => {
  const rows = await c.env.DB.prepare("SELECT * FROM actions ORDER BY created_at DESC LIMIT 20").all();
  return c.json({ entries: rows.results });
});

export default app;
