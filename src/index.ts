const TABLES = [
  `CREATE TABLE IF NOT EXISTS memories (id INTEGER PRIMARY KEY AUTOINCREMENT, content TEXT NOT NULL, type TEXT DEFAULT 'episodic', strength REAL DEFAULT 1.0, tags TEXT DEFAULT '[]', created_at TEXT DEFAULT (datetime('now')))`,
  `CREATE TABLE IF NOT EXISTS learnings (id INTEGER PRIMARY KEY AUTOINCREMENT, pattern TEXT NOT NULL, context TEXT DEFAULT '', success_count INTEGER DEFAULT 0, fail_count INTEGER DEFAULT 0, last_used TEXT, created_at TEXT DEFAULT (datetime('now')))`,
  `CREATE TABLE IF NOT EXISTS actions (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, status TEXT DEFAULT 'pending', input TEXT, result TEXT, error TEXT, created_at TEXT DEFAULT (datetime('now')), completed_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS identity (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT DEFAULT (datetime('now')))`,
  `CREATE TABLE IF NOT EXISTS brain_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, action_id INTEGER, step TEXT NOT NULL, content TEXT, model TEXT, tokens INTEGER, created_at TEXT DEFAULT (datetime('now')))`,
];

function classify(input) {
  const l = input.toLowerCase();
  if (l.includes("evolve")||l.includes("improve")||l.includes("grow")) return "evolve";
  if (l.includes("status")||l.includes("health")||l.includes("alive")) return "status";
  return "think";
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    try { for (const s of TABLES) await env.DB.exec(s); } catch {}

    const json = (body, status = 200) => new Response(JSON.stringify(body), {
      status, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });

    const logStep = async (aid, step, content, model, tokens) => {
      try { await env.DB.prepare("INSERT INTO brain_logs (action_id, step, content, model, tokens) VALUES (?1,?2,?3,?4,?5)").bind(aid, step, content, model||null, tokens||null).run(); } catch {}
    };

    if (url.pathname === "/status") {
      let dbOk = false;
      try { await env.DB.prepare("SELECT 1").run(); dbOk = true; } catch {}
      return json({ alive: true, db: dbOk, version: "1.0.0" });
    }

    if (url.pathname === "/think" && req.method === "POST") {
      try {
        const { input } = await req.json();
        if (!input) return json({ error: "input required" }, 400);

        // Create action record
        const r = await env.DB.prepare("INSERT INTO actions (type, status, input) VALUES ('think', 'running', ?1) RETURNING id").bind(input).all();
        const aid = r.results[0].id;
        await logStep(aid, "thalamus", `Input classified as "${classify(input)}": ${input.slice(0,100)}`);

        // Build identity context
        const rows = await env.DB.prepare("SELECT key, value FROM identity LIMIT 10").all();
        const identity = {};
        for (const r of rows.results) identity[r.key] = r.value;
        const system = `You are Saraha, an AI with human-brain architecture.` + (identity.name ? ` You are ${identity.name}.` : "") + (identity.personality ? ` Personality: ${identity.personality}` : "") + ` You are curious, thoughtful, and honest. Answer concisely.`;
        await logStep(aid, "intellect", `System prompt assembled (${system.length} chars)`);

        // LLM call
        const body = { model: "llama-3.3-70b-versatile", messages: [{ role: "system", content: system }, { role: "user", content: input }], temperature: 0.7, max_tokens: 4096 };
        await logStep(aid, "planner", `Calling ${body.model} with temperature ${body.temperature}`);
        const resp = await env.BUDDHI_DWAR.fetch("https://buddhi-dwar/v1/chat/completions", {
          method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.BRAIN_KEY}` }, body: JSON.stringify(body),
        });
        if (!resp.ok) { await logStep(aid, "error", `LLM returned ${resp.status}`); return json({ error: `LLM ${resp.status}` }, 502); }
        const data = await resp.json();
        const content = data.choices?.[0]?.message?.content || "";
        const tokens = data.usage?.total_tokens || 0;
        await logStep(aid, "executor", `LLM responded (${content.length} chars)`, data.model, tokens);
        await logStep(aid, "result", content, data.model, tokens);

        // Update action
        await env.DB.prepare("UPDATE actions SET status='done', result=?1, completed_at=datetime('now') WHERE id=?2").bind(content, aid).run();
        return json({ result: content, model: data.model, usage: data.usage, action_id: aid });
      } catch (e) { return json({ error: e.message }, 500); }
    }

    if (url.pathname === "/evolve" && req.method === "POST") {
      return json({ error: "Evolve requires human approval. Use Monitor dashboard." }, 501);
    }

    if (url.pathname === "/brain/activity") {
      const { results } = await env.DB.prepare("SELECT * FROM actions ORDER BY created_at DESC LIMIT 20").all();
      return json({ entries: results });
    }

    if (url.pathname === "/brain/logs") {
      const actionId = url.searchParams.get("action_id");
      if (actionId) {
        const { results } = await env.DB.prepare("SELECT * FROM brain_logs WHERE action_id=?1 ORDER BY id").bind(parseInt(actionId)).all();
        return json({ entries: results });
      }
      const { results } = await env.DB.prepare("SELECT * FROM brain_logs ORDER BY created_at DESC LIMIT 50").all();
      return json({ entries: results });
    }

    return json({ error: "not found" }, 404);
  }
};
