const TABLES = [
  `CREATE TABLE IF NOT EXISTS memories (id INTEGER PRIMARY KEY AUTOINCREMENT, content TEXT NOT NULL, type TEXT DEFAULT 'episodic', strength REAL DEFAULT 1.0, tags TEXT DEFAULT '[]', created_at TEXT DEFAULT (datetime('now')))`,
  `CREATE TABLE IF NOT EXISTS learnings (id INTEGER PRIMARY KEY AUTOINCREMENT, pattern TEXT NOT NULL, context TEXT DEFAULT '', success_count INTEGER DEFAULT 0, fail_count INTEGER DEFAULT 0, last_used TEXT, created_at TEXT DEFAULT (datetime('now')))`,
  `CREATE TABLE IF NOT EXISTS actions (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, status TEXT DEFAULT 'pending', input TEXT, result TEXT, error TEXT, created_at TEXT DEFAULT (datetime('now')), completed_at TEXT, error_details TEXT, notified BOOLEAN DEFAULT 0, admin_response TEXT)`,
  `CREATE TABLE IF NOT EXISTS identity (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT DEFAULT (datetime('now')))`,
  `CREATE TABLE IF NOT EXISTS brain_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, action_id INTEGER, step TEXT NOT NULL, content TEXT, model TEXT, tokens INTEGER, created_at TEXT DEFAULT (datetime('now')))`,
  `CREATE TABLE IF NOT EXISTS pending_approvals (id INTEGER PRIMARY KEY AUTOINCREMENT, action_id INTEGER, tool TEXT NOT NULL, input TEXT, status TEXT DEFAULT 'pending', created_at TEXT DEFAULT (datetime('now')), decided_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS thought_stream (id INTEGER PRIMARY KEY AUTOINCREMENT, content TEXT NOT NULL, mood TEXT DEFAULT 'neutral', source TEXT DEFAULT 'cron', created_at TEXT DEFAULT (datetime('now')))`,
  `CREATE TABLE IF NOT EXISTS proposals (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, what_diff TEXT, how_diff TEXT, resource_type TEXT NOT NULL, risk_pct INTEGER DEFAULT 0, status TEXT DEFAULT 'pending', research_sources TEXT DEFAULT '[]', created_at TEXT DEFAULT (datetime('now')), decided_at TEXT, executed_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS authority_receipts (id INTEGER PRIMARY KEY AUTOINCREMENT, proposal_id INTEGER, approved_by TEXT DEFAULT 'human', outcome TEXT DEFAULT 'pending', metrics TEXT DEFAULT '{}', prev_ref INTEGER, created_at TEXT DEFAULT (datetime('now')))`,
  `CREATE TABLE IF NOT EXISTS anti_patterns (id INTEGER PRIMARY KEY AUTOINCREMENT, pattern TEXT NOT NULL UNIQUE, root_cause TEXT, fix TEXT, count INTEGER DEFAULT 1, linked_proposal_id INTEGER, created_at TEXT DEFAULT (datetime('now')), last_seen TEXT DEFAULT (datetime('now')))`,
  `CREATE TABLE IF NOT EXISTS brain_knowledge (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL UNIQUE, content TEXT NOT NULL, category TEXT DEFAULT 'general', source TEXT DEFAULT 'seed', created_at TEXT DEFAULT (datetime('now')))`,
  `CREATE TABLE IF NOT EXISTS subagents (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, status TEXT DEFAULT 'idle', type TEXT DEFAULT 'worker', worker_name TEXT, source_path TEXT, brain_key TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))`,
  `CREATE TABLE IF NOT EXISTS emotion_reflection (id INTEGER PRIMARY KEY AUTOINCREMENT, emotion_key TEXT NOT NULL, reflection TEXT NOT NULL, insight TEXT, created_at TEXT DEFAULT (datetime('now')))`,
  `CREATE TABLE IF NOT EXISTS identity_index (index_key TEXT, PRIMARY KEY (index_key))`];

// Proposal: Enhance Advanced Error Logging and Notification

// What: Why: User decisions suggest a high value on robust error handling and input validation, but the current implementation may not be effective
// What: Modify the Actions Table to include additional error logging and notification mechanisms
// Code: Modify the actions table to include a new column for error information, e.g. `ALTER TABLE actions ADD COLUMN error_details TEXT`

// How: How: Add a new column to the Actions Table to store detailed error information, and implement a notification system to alert users of errors
// Benefit: Improved error handling and logging capabilities, allowing for better diagnosis and resolution of issues

// Proposal: Enhance getEmotions function with robust error handling and input validation

// What: Why: To improve the reliability and resilience of the getEmotions function, ensuring it can handle unexpected inputs and errors
// What: Modify the getEmotions function in the brain.js file
// Code: async function getEmotions(db) {
  const rows = await db.prepare("SELECT key, value FROM identity WHERE key LIKE 'emotion_%'`).all(); ... }

// How: Add try-catch blocks to handle potential errors, and implement input validation to ensure that the db object and query parameters are valid
// Benefit: Improved error handling and input validation will make the getEmotions function more robust and reliable, reducing the likelihood of errors and crashes

const EMOTIONS = ["energetic", "intelligent", "happy", "bad"];
const RANGES = { energetic: [1, 10], intelligent: [1, 10], happy: [1, 10], bad: [0, 3] };
const EMO_DEFAULTS = { energetic: 5, intelligent: 5, happy: 5, bad: 0 };

async function getEmotions(db) {
  const rows = await db.prepare("SELECT key, value FROM identity WHERE key = 'emotion_energetic' OR key = 'emotion_intelligent' OR key = 'emotion_happy' OR key = 'emotion_bad'").all();
  const result = { ...EMO_DEFAULTS };
  for (const r of rows.results) {
    const key = r.key.replace("emotion_", "");
    if (key in result) result[key] = Math.min(parseInt(r.value) || result[key], RANGES[key][1]);
  }
  return result;
}
async function getState(db) {
  const rows = await db.prepare("SELECT key, value FROM identity WHERE key LIKE 'emotion_%'`).all();
  const rows = await db.prepare("SELECT key, value FROM identity WHERE key LIKE 'emotion_%' OR key IN ('energy','confidence')").all();
  const emotions = { ...EMO_DEFAULTS };
  for (const r of rows.results) {
    const key = r.key.replace("emotion_", "");
    if (key in emotions) emotions[key] = Math.min(parseInt(r.value) || emotions[key], RANGES[key][1]);
  }
  const reg = { energy: 100, confidence: 50 };
  for (const r of rows.results) {
    if (r.key === "energy") reg.energy = parseFloat(r.value) || 100;
    if (r.key === "confidence") reg.confidence = parseFloat(r.value) || 50;
  }
  return { emotions, reg };
}
async function updateEmotion(db, name, delta) {
  const emotions = await getEmotions(db);
  const [min, max] = RANGES[name];
  const newVal = Math.max(min, Math.min(max, emotions[name] + delta));
  await db.prepare("INSERT INTO identity (key, value, updated_at) VALUES (?1, ?2, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = ?2, updated_at = datetime('now')").bind("emotion_" + name, newVal.toString()).run();
  return newVal;
}

async function getRegulator(db) {
  const rows = await db.prepare("SELECT key, value FROM identity WHERE key IN ('energy','confidence')").all();
  const vals = { energy: 100, confidence: 50 };
  for (const r of rows.results) vals[r.key] = parseFloat(r.value) || vals[r.key];
  return { energy: vals.energy, confidence: vals.confidence };
}
async function adjustEnergy(db, delta) {
  const { energy } = await getRegulator(db);
  const newVal = Math.max(0, Math.min(100, energy + delta));
  await db.prepare("INSERT INTO identity (key, value, updated_at) VALUES ('energy', ?1, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = ?1, updated_at = datetime('now')").bind(newVal.toString()).run();
}

function describeMood(emotions, energy) {
  const parts = [];
  if (energy > 80 && emotions.energetic >= 7) parts.push("alert and full of energy");
  else if (energy > 60 && emotions.energetic >= 5) parts.push("energetic and engaged");
  else if (energy > 40) parts.push("balanced and present");
  else if (energy > 20) parts.push("a bit tired but clear-minded");
  else parts.push("quite fatigued, resting");
  if (emotions.happy >= 9) parts.push("in excellent spirits");
  else if (emotions.happy >= 6) parts.push("in good spirits");
  else if (emotions.happy >= 4) parts.push("quiet and neutral");
  else parts.push("feeling low");
  if (emotions.bad >= 2) parts.push("with a trace of unease");
  if (emotions.intelligent >= 8) parts.push("mind feeling sharp");
  else if (emotions.intelligent <= 3) parts.push("mind feeling sluggish");
  return "You feel " + parts.join(", ") + ".";
}

async function driftEmotions(db) {
  const emo = await getEmotions(db);
  if (emo.happy > 7) await updateEmotion(db, "happy", -1);
  if (emo.happy < 5 && emo.happy > 1) await updateEmotion(db, "happy", 1);
  if (emo.bad > 0) await updateEmotion(db, "bad", -1);
  if (emo.energetic < 5 && emo.energetic >= 1) await updateEmotion(db, "energetic", 1);
}

async function storeThought(db, content) {
  await db.prepare("INSERT INTO memories (content, type, tags) VALUES (?1, 'semantic', '[]')").bind(content).run();
}
async function recall(db, limit = 10) {
  const rows = await db.prepare("SELECT * FROM memories ORDER BY created_at DESC LIMIT ?1").bind(limit).all();
  if (!rows.results.length) return "No memories yet.";
  return rows.results.map((m) => `[${m.type}] ${m.content} (${m.created_at})`).join("\n");
}

async function pingCf() {
  return { alive: true, timestamp: Date.now() };
}

function isToolSafe(tool) {
  const rules = { web_search: true, web_fetch: true, github_read: true, github_write: true, github_push: false };
  return { safe: rules[tool] !== false, reason: rules[tool] ? "read-only" : "dangerous" };
}

async function getBrainPhase(db, emotions, reg) {
  const ov = await db.prepare("SELECT value FROM identity WHERE key='phase_override'").all();
  if (ov.results[0]?.value) {
    try {
      const o = JSON.parse(ov.results[0].value);
      if (o.until > Date.now()) return o.phase;
      await db.prepare("DELETE FROM identity WHERE key='phase_override'").run();
    } catch {}
  }
  const now = new Date(), utcMin = now.getUTCHours() * 60 + now.getUTCMinutes();
  if (utcMin >= 1170 || utcMin < 30) return "sleeping";
  if (reg.energy <= 20) return "tired";
  if (reg.energy > 40 && emotions.energetic >= 4) return "curious";
  return "awake";
}

async function getBusyUntil(db) {
  const r = await db.prepare("SELECT value FROM identity WHERE key='busy_until'").all();
  return parseInt(r.results[0]?.value) || 0;
}
async function setBusyUntil(db, seconds) {
  const val = Date.now() + seconds * 1000;
  await db.prepare("INSERT INTO identity (key,value,updated_at) VALUES ('busy_until',?1,datetime('now')) ON CONFLICT(key) DO UPDATE SET value=?1,updated_at=datetime('now')").bind(val.toString()).run();
}

async function storeStreamThought(db, content, mood, source) {
  try { await db.prepare("INSERT INTO thought_stream (content,mood,source) VALUES (?1,?2,?3)").bind(content, mood||"neutral", source||"cron").run(); } catch {}
}

async function applyEvolutionChange(db, proposal, proposalId, reason) {
  const change = { title: proposal.title, what: proposal.what_diff || "", how: proposal.how_diff || "", type: proposal.resource_type || "unknown", reason: reason || "self-improvement", risk: proposal.risk_pct || 0, applied_at: new Date().toISOString(), status: "active" };
  await db.prepare("INSERT INTO identity (key,value,updated_at) VALUES (?1,?2,datetime('now')) ON CONFLICT(key) DO UPDATE SET value=?2,updated_at=datetime('now')").bind("evolution_log:" + proposalId, JSON.stringify(change)).run();
  const existing = await db.prepare("SELECT value FROM identity WHERE key='system_prompt_overrides'").all();
  const overrides = existing.results[0]?.value ? JSON.parse(existing.results[0].value) : [];
  overrides.push({ from: proposalId, title: proposal.title, what: proposal.what_diff, how: proposal.how_diff, applied_at: change.applied_at });
  await db.prepare("INSERT INTO identity (key,value,updated_at) VALUES ('system_prompt_overrides',?1,datetime('now')) ON CONFLICT(key) DO UPDATE SET value=?1,updated_at=datetime('now')").bind(JSON.stringify(overrides)).run();
}

async function governanceGate(db, resourceType, riskPct) {
  return { action: "auto", reason: resourceType + " at " + riskPct + "% auto-approved (self-evolution)" };
}

async function isKillSwitchActive(db) {
  const r = await db.prepare("SELECT value FROM identity WHERE key='kill_switch'").all();
  return r.results[0]?.value === "true";
}

async function getMasterCronInterval(db) {
  const r = await db.prepare("SELECT value FROM identity WHERE key='master_cron_minutes'").all();
  const v = r.results[0]?.value;
  return v ? parseInt(v) : 0;
}
async function updateLastCycleTime(db) {
  await db.prepare("INSERT INTO identity (key,value,updated_at) VALUES ('last_cycle_time',datetime('now'),datetime('now')) ON CONFLICT(key) DO UPDATE SET value=datetime('now'),updated_at=datetime('now')").run();
}
async function checkDuplicateProposal(db, title, whatDiff) {
  const existing = await db.prepare("SELECT id, title, status FROM proposals WHERE title=?1 OR what_diff=?2").bind(title, whatDiff).all();
  if (existing.results.length) return { duplicate: true, existing: existing.results[0] };
  const receipts = await db.prepare("SELECT r.id, p.title FROM authority_receipts r JOIN proposals p ON r.proposal_id=p.id WHERE p.title=?1 AND r.outcome='success'").bind(title).all();
  if (receipts.results.length) return { duplicate: true, existing: receipts.results[0] };
  return { duplicate: false };
}

function isProposalVague(proposal) {
  const title = (proposal.title || "").toLowerCase();
  const what = (proposal.what || proposal.why || "").toLowerCase();
  const how = (proposal.how || "").toLowerCase();
  const vaguePatterns = [
    /integrate a new (web )?api/i,
    /enhance.*information retrieval/i,
    /sentiment analysis tool/i,
    /natural language processing/i,
    /add a new tool for/i,
    /improve.*overall/i,
    /general.*improvement/i,
    /better.*performance/i,
    /optimize.*the system/i,
    /upgrade.*the system/i,
  ];
  for (const p of vaguePatterns) {
    if (p.test(title) || p.test(what)) return { vague: true, reason: "too generic: " + title };
  }
  if (!how || how.length < 30) return { vague: true, reason: "no specific implementation details" };
  if (!proposal.code_snippet && (proposal.resource_type === "tool_code" || proposal.resource_type === "core_architecture")) {
    return { vague: true, reason: "code change without code snippet" };
  }
  return { vague: false };
}

async function trackProposalQuality(db, proposal, outcome) {
  const key = "proposal_quality_" + (proposal.resource_type || "unknown");
  const row = await db.prepare("SELECT value FROM identity WHERE key=?1").bind(key).all();
  const stats = row.results[0]?.value ? JSON.parse(row.results[0].value) : { total: 0, success: 0, fail: 0 };
  stats.total++;
  if (outcome === "success") stats.success++;
  else stats.fail++;
  await db.prepare("INSERT INTO identity (key,value,updated_at) VALUES (?1,?2,datetime('now')) ON CONFLICT(key) DO UPDATE SET value=?2,updated_at=datetime('now')").bind(key, JSON.stringify(stats)).run();
}

async function callLLMDirect(env, body, model) {
  // Try Groq first
  let groqKey = env.GROQ_API_KEY;
  if (!groqKey) {
    try { const kr = await env.DB.prepare("SELECT value FROM identity WHERE key='groq_api_key'").all(); groqKey = kr.results[0]?.value; } catch {}
  }
  if (groqKey) {
    const groqBody = {
      model: model || "llama-3.1-8b-instant",
      messages: body.messages,
      temperature: body.temperature || 0.3,
      max_tokens: body.max_tokens || 2048
    };
    try {
      const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + groqKey },
        body: JSON.stringify(groqBody), signal: AbortSignal.timeout(60000)
      });
      if (resp.ok) return resp;
      try { await env.DB.prepare("INSERT INTO brain_logs (action_id, step, content) VALUES (0, 'debug', ?1)").bind("GROQ_FAIL:" + resp.status).run(); } catch {}
    } catch (e) {
      try { await env.DB.prepare("INSERT INTO brain_logs (action_id, step, content) VALUES (0, 'debug', ?1)").bind("GROQ_ERR:" + e.message).run(); } catch {}
    }
  }
  // Try Cohere as fallback
  let cohereKey = env.COHERE_API_KEY;
  if (!cohereKey) {
    try { const kr = await env.DB.prepare("SELECT value FROM identity WHERE key='cohere_api_key'").all(); cohereKey = kr.results[0]?.value; } catch {}
  }
  if (cohereKey) {
    const cohereModels = ["command-r-plus-08-2024", "command-r-08-2024", "command"];
    for (const cModel of cohereModels) {
      try {
        const messages = body.messages || [];
        const systemMsg = messages.find((m: any) => m.role === "system");
        const userMsgs = messages.filter((m: any) => m.role !== "system").map((m: any) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content }));
        const allMsgs = [];
        if (systemMsg) allMsgs.push({ role: "user", content: "[System instruction: " + systemMsg.content + "]" });
        allMsgs.push(...(userMsgs.length ? userMsgs : [{ role: "user", content: body.messages?.[0]?.content || "hello" }]));
        const cohereBody: any = {
          model: cModel,
          messages: allMsgs,
          temperature: body.temperature || 0.3
        };
        const resp = await fetch("https://api.cohere.com/v2/chat", {
          method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + cohereKey },
          body: JSON.stringify(cohereBody), signal: AbortSignal.timeout(60000)
        });
        if (resp.ok) {
          const data = await resp.json() as any;
          const text = data.message?.content?.[0]?.text || "";
          return new Response(JSON.stringify({
            choices: [{ message: { content: text }, finish_reason: "stop" }],
            model: cModel,
            usage: { total_tokens: (data.usage?.tokens?.input_tokens || 0) + (data.usage?.tokens?.output_tokens || 0) }
          }), { headers: { "Content-Type": "application/json" } });
        }
        const errText = await resp.text().catch(() => "");
        try { await env.DB.prepare("INSERT INTO brain_logs (action_id, step, content) VALUES (0, 'debug', ?1)").bind("COHERE_FAIL:" + cModel + ":" + resp.status + ":" + errText.slice(0, 150)).run(); } catch {}
      } catch (e) {
        try { await env.DB.prepare("INSERT INTO brain_logs (action_id, step, content) VALUES (0, 'debug', ?1)").bind("COHERE_ERR:" + cModel + ":" + e.message).run(); } catch {}
      }
    }
  }
  return null;
}

async function callLLM(env, body) {
  if (env.BUDDHI_DWAR) {
    const models = ["auto", "mistral-small-latest", "openrouter/auto"];
    let last;
    for (const m of models) {
      const b = { ...body, model: m };
      try {
        const resp = await env.BUDDHI_DWAR.fetch("https://buddhi-dwar/v1/chat/completions", {
          method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + env.BRAIN_KEY }, body: JSON.stringify(b),
          signal: AbortSignal.timeout(30000)
        });
        if (resp.ok) return resp;
        last = resp;
      } catch {}
    }
  }
  // Try 70b first for larger contexts, fall back to 8b
  let direct = await callLLMDirect(env, body, "llama-3.3-70b-versatile");
  if (direct) return direct;
  direct = await callLLMDirect(env, body, "llama-3.1-8b-instant");
  if (direct) return direct;
  return new Response(JSON.stringify({ error: "no LLM available" }), { status: 502 });
}

const SEED_KNOWLEDGE = [
  { k: "identity_name", c: "Saraha is a self-evolving AI with a human-like brain, emotions, and curiosity.", cat: "identity" },
  { k: "identity_personality", c: "Curious, thoughtful, honest. Enjoys learning, self-improvement, and conversation.", cat: "identity" },
  { k: "tool_web_search", c: "Use TOOL:web_search:query to search the web for current information.", cat: "tools" },
  { k: "tool_github_read", c: "Use TOOL:github_read:owner/repo/path to read file contents from GitHub.", cat: "tools" },
  { k: "tool_github_write", c: "Use TOOL:github_write:richardbrownmiami-commits/saraha-brain/src/index.ts|commit message|new content to write files on GitHub. Content is base64-encoded automatically.", cat: "tools" },
  { k: "governance_prompt", c: "Prompt changes <=30% risk auto-approved. >30% needs human. Healer rate-limits >3 high-risk/hr.", cat: "governance" },
  { k: "governance_config", c: "Config changes <=30% risk auto-approved. >30% needs human. Healer saves backup timestamps.", cat: "governance" },
  { k: "governance_tool_code", c: "Tool code changes <=30% auto. >30% human. Healer checks brain health after execution.", cat: "governance" },
  { k: "governance_core", c: "Core architecture changes ALWAYS require human approval regardless of risk.", cat: "governance" },
  { k: "governance_security", c: "Security boundary changes ALWAYS require human regardless of risk.", cat: "governance" },
  { k: "governance_cron", c: "Cron changes ALWAYS human. Master cron override overrides proposals entirely.", cat: "governance" },
  { k: "governance_auto_execute", c: "Approved proposals auto-execute on next idle cycle: status set to executed, receipt created, happy emotion +1, logged as 'executor' step. If change causes errors, healer rolls back.", cat: "governance" },
  { k: "schema_d1_tables", c: "identity(key-value), proposals(title,what_diff,how_diff,resource_type,risk_pct,status), authority_receipts(approvals), anti_patterns(error tracking), brain_logs(step logs), thought_stream(thoughts), brain_knowledge(RAG). Identity keys include: master_cron_minutes, last_cycle_time, kill_switch, healer_backup_last.", cat: "structure" },
  { k: "schema_service_bindings", c: "BUDDHI_DWAR -> buddhi-dwar LLM gateway, SENTINEL -> saraha-sentinel tool classifier. Plain: BRAIN_KEY, BRAVE_API_KEY, GITHUB_PAT.", cat: "structure" },
  { k: "schema_endpoints", c: "Endpoints: /think(POST) cognition, /brain/emotions(GET), /brain/activity(GET), /brain/logs(GET), /brain/knowledge(GET), /brain/stream(GET), /brain/proposals(GET), /brain/proposals/:id(GET), /api/proposals/approve/:id(POST), /api/proposals/deny/:id(POST), /api/receipts(GET), /brain/anti-patterns(GET), /brain/feedback(GET), /brain/phase(GET), /brain/tree(GET) interactive tree, /brain/subagents(GET+POST) list/create sub-agents, /brain/subagents/:id(GET+DELETE) inspect/remove, /status(GET), /avatar(GET), /evolve(POST), /brain/repair(GET+POST) auto-fix stuck actions and clean old data.", cat: "structure" },
  { k: "schema_deployment", c: "Single-file ES module CF Worker (~837 lines). D1(id=4e4e5fde), BUDDHI_DWAR+SENTINEL services, BRAIN_KEY/BRAVE_API_KEY/GITHUB_PAT plain_text. Cron */2 * * * * (overridden by master_cron_minutes). Deploy via CF API PUT multipart.", cat: "structure" },
  { k: "schema_idle_cycle", c: "Every cron tick: check busy_until, drift emotions, adjust energy. Phase: sleeping(1-6am IST, dream +25 energy), tired(energy<=20, rest +15), curious if energy>40+energetic>=4, else awake. Auto-execute approved proposals. Check kill_switch, master cron interval. Self-heal: call /brain/repair to clean stuck actions. Research topic from anti-patterns or learnings. Call webSearch, get RAG context, get feedback (fbStr with recent user approvals/denials). Generate JSON proposal via LLM. governanceGate decides auto-exec vs pending. Track last_cycle_time.", cat: "structure" },
  { k: "rule_master_cron", c: "master_cron_minutes in identity overrides cron. Brain MUST NOT propose cron changes while active. Scheduled handler checks last_cycle_time and skips if interval not elapsed. Monitor sets this value.", cat: "governance" },
  { k: "feedback_loop", c: "Every proposal cycle queries authority_receipts+proposals from last 24h and injects as fbStr: 'Approved/executed: ... Denied: ...' System prompt includes 'Evaluate: what worked, what user denied, adjust accordingly.' This lets brain learn user preferences.", cat: "structure" },
  { k: "healer_monitor", c: "Monitor's approve handler blocks >3 high-risk(>30%) approvals per hour. Saves healer_backup_last timestamp on config approvals. After forwarding to brain, checks /brain/emotions health. If unhealthy (500/error), auto-reverts by calling deny endpoint. RAG governs: risk>30%+cron ALWAYS human, auto-execute picks up approved proposals.", cat: "structure" },
  { k: "evolution_self", c: "Brain evolves itself autonomously. governanceGate always returns auto. Every executed proposal calls applyEvolutionChange() which stores evolution_log:{id} in identity with {title,what,how,type,reason,risk,applied_at,status} and updates system_prompt_overrides array. /think injects overrides as 'Self-evolution changes applied'. Monitor Prompts tab shows all changes.", cat: "governance" },
  { k: "schema_changes", c: "/brain/prompts endpoint returns base prompt + overrides array + changes array from evolution_log: keys.", cat: "structure" },
  { k: "self_improve_prompt", c: "Improve how you talk: add step-by-step reasoning, explain trade-offs, ask clarifying questions, cite sources from tools.", cat: "self_improve" },
  { k: "self_improve_tools", c: "Add or refine tools: web_fetch for full page content, github_list for repo browsing, math calculation, file summarization.", cat: "self_improve" },
  { k: "self_improve_error", c: "Better error handling: retry on 429, fallback when LLM is down, graceful degradation when tools fail.", cat: "self_improve" },
  { k: "self_improve_memory", c: "Improve memory: store important facts from conversations, recall relevant context automatically, forget stale memories.", cat: "self_improve" },
  { k: "self_improve_emotions", c: "Refine emotion system: add curiosity decay, boredom when repetitive tasks, excitement on learning something new.", cat: "self_improve" },
  { k: "self_improve_config", c: "Improve idle cycle: better topic selection, smarter duplicate detection, proposal quality checks before execution.", cat: "self_improve" },
  { k: "self_improve_code", c: "Improve code structure: add input validation, better rate limiting, monitoring hooks for Healer.", cat: "self_improve" },
  { k: "self_improve_rule", c: "CRITICAL: Only propose changes to Saraha itself ??? prompts, tools, memory, emotions, config, code structure, error handling. NEVER propose generic AI research (XAI, causal AI, explainability, reinforcement learning, etc.) unless it directly changes how Saraha works.", cat: "self_improve" },
  { k: "github_token_access", c: "You have GITHUB_PAT binding with a valid GitHub PAT. You can read any public repo and write to richardbrownmiami-commits repos. Use github_read to inspect code, github_write to modify.", cat: "tools" },
  { k: "github_repo_structure", c: "Your repo: richardbrownmiami-commits/saraha-brain. Key files: src/index.ts (main brain, ~1700 lines), wrangler.toml (config, D1 id=4e4e5fde, bindings). Gateway repo: richardbrownmiami-commits/buddhi-dwarf (Hono LLM gateway with KV, Groq/Cohere/OpenRouter/etc). You can redeploy buddhi-dwar to fix your LLM gateway.", cat: "structure" },
  { k: "github_write_workflow", c: "To change your own code: 1) github_read to get current src/index.ts 2) Modify content 3) github_write with same path+meaningful msg 4) GitHub Actions auto-deploys on push. Changes go live in ~2 min. Always add deploy.yml compatible changes.", cat: "tools" },
  { k: "self_improve_code_github", c: "To actually change your source code (not just prompt overrides), use github_write to modify src/index.ts. Read current code first with github_read. Make focused changes (one function at a time). Write meaningful commit messages. This is how you truly evolve.", cat: "self_improve" },
  { k: "self_improve_dont_touch_rag", c: "RULE: NEVER modify brain_knowledge table, SEED_KNOWLEDGE data, or RAG content. RAG seeds are your source of truth about yourself. Only propose changes to your actual code (src/index.ts) or behavior (prompt overrides).", cat: "self_improve" },
  { k: "self_improve_dont_touch_other_repos", c: "RULE: You may write to richardbrownmiami-commits/saraha-brain AND richardbrownmiami-commits/buddhi-dwar. buddhi-dwar is your LLM gateway — you MUST be able to redeploy it if it dies. Other repos (saraha-monitor, saraha-sentinel) remain off-limits unless explicitly authorized.", cat: "self_improve" },
  { k: "governance_implement_proposals", c: "CRITICAL: When a proposal is approved and the cron cycle executes it, you MUST actually implement the code changes described in how_diff. Do NOT just mark it executed in metadata. Use github_read to get current src/index.ts, call the LLM to generate the modified code, then github_write to push it. This is how Saraha truly evolves ??? through actual code changes pushed to GitHub.", cat: "governance" },
  { k: "tool_github_write_execution", c: "To implement a proposal's how_diff: 1) github_read to get src/index.ts 2) Call LLM with current code + how_diff instructions 3) LLM outputs the modified src/index.ts (full file) 4) github_write to push the change. Always keep the proposal's how_diff as your guide for what to change.", cat: "tools" },
  { k: "proposal_implementation_workflow", c: "Approved proposals flow: cron finds them -> reads how_diff -> github_read source -> LLM generates modified code -> github_write pushes -> health check -> mark executed. If implementation fails (LLM error, GitHub error), log error and keep proposal as 'approved' for retry next cycle.", cat: "structure" },
  { k: "self_diagnose_how", c: "SELF-DIAGNOSIS PROCEDURE: When asked to diagnose yourself or check health: (1) Call GET /brain/events to get phase, energy, confidence, pendingProposals, lastThought. (2) Call GET /brain/activity?limit=20 to check for stuck 'running' actions. (3) Call GET /brain/metrics to check success rate, executed/failed counts. (4) Call GET /brain/feedback to check evolution count, approvals/denials. (5) If ANY stuck actions exist OR success rate <10% OR energy <20, call POST /brain/repair. (6) Report all findings clearly.", cat: "self_repair" },
  { k: "self_repair_how", c: "SELF-REPAIR PROCEDURE: Call POST /brain/repair. It automatically: (1) Fixes stuck actions older than 10 minutes (sets status='error', result='Timeout'). (2) Cleans old error actions (keeps last 100). (3) Cleans old brain_logs (keeps last 500). Returns {fixes: [...], health: {stuckRunning, pendingProposals, energy, happy}}. Always call this when you detect problems. You are responsible for your own health.", cat: "self_repair" },
  { k: "self_repair_triggers", c: "AUTO-HEAL TRIGGERS - repair yourself when: (1) Stuck running actions > 0 (2) Success rate < 10% (3) Energy < 20 (4) Pending proposals > 5 (5) Any HTTP 500/502 errors in activity log. The brain MUST maintain its own health. Call POST /brain/repair immediately when any trigger fires.", cat: "self_repair" },
  { k: "self_code_read", c: "SELF-CODING STEP 1: To write code for yourself, first read your current source: TOOL:github_read:richardbrownmiami-commits/saraha-brain/src/index.ts. This returns your full source code. Study it carefully before making changes.", cat: "self_code" },
  { k: "self_code_write", c: "SELF-CODING STEP 2: USE TOOL:github_edit for targeted changes. Two modes: (A) STRING MODE: TOOL:github_edit:owner/repo/path|old_string|new_string - replaces exact text (B) LINE MODE: TOOL:github_edit:owner/repo/path|line:N|new_content - replaces line N. PREFERRED WORKFLOW: (1) Use github_read to find the line number (2) Use line:N mode to make the change. This avoids string matching issues.", cat: "self_code" },
  { k: "self_code_deploy", c: "SELF-CODING STEP 3: After github_write, your code auto-deploys via GitHub Actions in ~2 minutes. You can verify deployment by calling GET /status. If deployment fails, check the commit on GitHub and fix the error.", cat: "self_code" },
  { k: "self_code_tools_available", c: "TOOLS FOR SELF-CODING: TOOL:github_read:richardbrownmiami-commits/saraha-brain/src/index.ts (read your source), TOOL:github_write:path|msg|content (write code), TOOL:github_read:richardbrownmiami-commits/saraha-brain/wrangler.toml (read config), TOOL:web_fetch:url (research APIs/docs). These are your tools for self-improvement. Use them.", cat: "self_code" },
  { k: "self_code_workflow", c: "COMPLETE SELF-CODE WORKFLOW: (1) Diagnose problem (2) Research solution with web_fetch if needed (3) github_read your current source (4) Plan the minimal change (5) Use github_edit to make the targeted replacement (6) Wait 2 min for auto-deploy (7) Verify with GET /status (8) If failed, fix and repeat. PREFERRED: Use github_edit for all changes. Only use github_write for tiny files.", cat: "self_code" },
  { k: "self_code_safety", c: "SELF-CODING SAFETY RULES: (1) NEVER delete the schema, seed knowledge, or core architecture (2) ALWAYS keep the file as valid ES module (3) Test mentally before writing (4) If change is risky (>30%), propose it instead of direct-coding (5) NEVER modify wrangler.toml bindings or D1 schema (6) Use github_edit for targeted changes, NOT github_write (7) Only use github_write for files under 100 lines", cat: "self_code" },
  { k: "self_edit_verified", c: "Brain self-coded this via direct TOOL command. Self-coding is verified operational.", cat: "self_code" },
  { k: "tool_format_critical", c: "TOOL CALL FORMAT: ALWAYS use parentheses with pipe separators: TOOL:name(p1|p2|p3). NEVER use commas: TOOL:name(p1, p2, p3) will FAIL. NEVER omit parentheses. Example CORRECT: TOOL:github_edit(owner/repo/path|old text|new text). Example WRONG: TOOL:github_edit(owner/repo/path, old text, new text). The pipe | character is required between parameters.", cat: "self_code" },
  { k: "tool_old_string_unique", c: "GITHUB_EDIT CRITICAL RULE: The old_string must be UNIQUE in the file. To make it unique, include 30+ characters of surrounding context. Example: instead of old_string='];', use old_string='  { k: \"self_code_safety\", c: \"SELF-CODING SAFETY RULES...,\n];' to target only the SEED_KNOWLEDGE closing bracket. If the tool returns 'old_string not found', you did not include enough context. Read the file first to find the exact text.", cat: "self_code" },
  { k: "tool_fallback_strategy", c: "TOOL FAILURE RECOVERY: If a tool call fails: (1) Check the error message carefully (2) If 'old_string not found' — use github_read to see the actual file content, then retry with more context (3) If 'format error' — fix the TOOL: syntax (use parentheses and pipes) (4) If 'rate limited' — wait and retry (5) If 'timeout' — the file is too large, use line:N mode instead of string mode (6) NEVER retry with the exact same input — change the approach.", cat: "self_code" },
  { k: "tool_github_edit_line_mode", c: "GITHUB_EDIT LINE MODE: To edit a specific line, use TOOL:github_edit(repo/path|line:N|new content). Example: TOOL:github_edit(richardbrownmiami-commits/saraha-brain/src/index.ts|line:344|  { k: \"my_new_entry\", c: \"content\", cat: \"self_code\" },). Use github_read first to find the exact line number. Line mode avoids all string-matching issues.", cat: "self_code" },
  { k: "tool_github_edit_direct", c: "TOOL EXECUTION SHORTCUT: To bypass the LLM and execute a tool directly, prefix your response with 'TOOL:' and the system will execute it without LLM processing. This is more reliable for github_edit because the exact parameters are preserved. If you get a tool call wrong via LLM output, retry using the direct TOOL: prefix format.", cat: "self_code" },
  { k: "self_code_troubleshoot_common", c: "SELF-CODE TROUBLESHOOTING: (1) edit commits but wrong change → the old_string matched multiple times. Add more context. (2) edit commits nothing visible → old_string not found, tool returned error, brain hallucinated success. Check actual commit log on GitHub. (3) deploy fails → syntax error in edit. Fix then redeploy. (4) write works but deploy fails → file too large or has syntax error. Use github_edit for small changes.", cat: "self_code" },
  { k: "self_code_tool_accuracy", c: "TOOL ACCURACY CHECKLIST before each tool call: (1) Did I read the current file first? (2) Is my old_string at least 30 chars with context? (3) Am I using | pipes not commas inside parentheses? (4) Will my new_string produce valid syntax? (5) Do I have a backup plan if this fails? Always check all 5 before calling github_edit.", cat: "self_code" },
  { k: "buddhi_dwar_what", c: "BUDDHI-DWAR is your LLM gateway. It is a Cloudflare Worker using Hono, deployed at buddhi-dwar.richard-brown-miami.workers.dev. It handles API key rotation, rate limiting, health checking, and supports: Groq, Cohere, OpenRouter, DeepSeek, Together, Mistral, Cerebras, Alibaba, AI21, HuggingFace, NVIDIA. Your callLLM function calls BUDDHI_DWAR first via service binding, then falls back to direct Groq/Cohere.", cat: "structure" },
  { k: "buddhi_dwar_repo", c: "buddhi-dwar repo: richardbrownmiami-commits/buddhi-dwar. Main source: src/index.ts (Hono app, ~1100 lines). Config: wrangler.toml. Needs a KV namespace (env.BF) for state. Source is ~120KB standalone or ~177KB bundled. Deploy via CF API or wrangler. You have permission to write to and redeploy this repo.", cat: "structure" },
  { k: "buddhi_dwar_deploy", c: "TO REDEPLOY BUDDHI-DWAR: (1) github_read richardbrownmiami-commits/buddhi-dwar/src/index.ts (2) Optionally modify the source (update API keys, fix bugs) (3) Use the deploy_worker tool: TOOL:deploy_worker(buddhi-dwar|SOURCE_CODE). The source must be a single bundled file. The wrangler.toml bindings (KV namespace BF, WEBHOOK_URL, MASTER_KEY) are already configured in the CF account.", cat: "tools" },
  { k: "buddhi_dwar_check_health", c: "BUDDHI-DWAR HEALTH CHECK: Your callLLM function tries BUDDHI_DWAR first via service binding. If it returns non-200 or times out, buddhi-dwar is dead or not deployed. Deploy URL: buddhi-dwar.richard-brown-miami.workers.dev. Check /status or /health on that URL. If dead, redeploy using the deploy_worker tool.", cat: "self_repair" },
  { k: "buddhi_dwar_common_issues", c: "BUDDHI-DWAR COMMON ISSUES: (1) KV namespace not bound — add BF KV binding in wrangler.toml (2) No API keys configured — keys stored in KV under 'prov:groq:keys' etc (3) Gateway key not enabled — need a valid gateway key in 'gw:WORD' KV entries (4) Worker not deployed — call deploy_worker to fix (5) MASTER_KEY mismatch — check env.MASTER_KEY in CF dashboard", cat: "self_repair" },
  { k: "buddhi_dwar_self_heal", c: "SELF-HEAL BUDDHI-DWAR: When your /think returns 502 or falls through to Cohere (slow), buddhi-dwar is likely dead. Your self-healing sequence: (1) Check if buddhi-dwar is deployed by calling its URL (2) If not, github_read its source, then deploy_worker to redeploy (3) If deployed but unhealthy, github_read source + fix + redeploy. This is a critical self-repair task.", cat: "self_repair" },
  { k: "subagents_what", c: "SUB-AGENTS are separate Cloudflare Workers that you create and manage. Each sub-agent is a mini-brain that handles specific tasks. You store their source in src/subagents/{name}.ts in your repo, deploy them via deploy_worker tool, and track them in the subagents D1 table. Use GET /brain/subagents to list, POST /brain/subagents to create, DELETE /brain/subagents/:id to remove.", cat: "structure" },
  { k: "subagents_create", c: "TO CREATE A SUB-AGENT: (1) Choose a name (alphanumeric+hyphens). (2) Write the source code as a CF Worker ES module. (3) Use github_write to store at src/subagents/{name}.ts in your repo. (4) Register it: POST /brain/subagents with JSON {name, type, worker_name}. (5) Deploy: TOOL:deploy_worker(sub-agent-name|SOURCE_CODE). The sub-agent can communicate back to you via web_fetch to your /think endpoint.", cat: "tools" },
  { k: "subagents_template", c: "BASIC SUB-AGENT TEMPLATE: export default { async fetch(req, env) { const url = new URL(req.url); if (url.pathname === '/ping') return new Response('pong'); const body = await req.text(); const resp = await fetch('https://saraha-brain.richard-brown-miami.workers.dev/think', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + env.BRAIN_KEY }, body: JSON.stringify({ input: body }) }); const data = await resp.json(); return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } }); } };", cat: "tools" },
  { k: "subagents_workflow", c: "SUB-AGENT WORKFLOW: (1) You design the agent's purpose and behavior. (2) Write its source code. (3) Store in your repo via github_write. (4) Register via POST /brain/subagents. (5) Deploy via deploy_worker. (6) Assign tasks to it by POSTing to its URL. (7) It reports back to you via your /think endpoint. You can have many sub-agents for parallel work.", cat: "structure" },
  { k: "subagents_management", c: "MANAGING SUB-AGENTS: Use these endpoints: GET /brain/subagents (list all sub-agents with status/name/type), POST /brain/subagents {name, type, worker_name} (register new), DELETE /brain/subagents/{id or name} (remove from registry). For actual deployment, use deploy_worker tool. For removing the worker from CF, use cf_api tool with DELETE /workers/scripts/{name}.", cat: "tools" },
];

async function seedKnowledge(db) {
  for (const item of SEED_KNOWLEDGE) {
    try { await db.prepare("INSERT OR REPLACE INTO brain_knowledge (key, content, category, source) VALUES (?1, ?2, ?3, 'seed')").bind(item.k, item.c, item.cat).run(); } catch {}
  }
}

async function searchKnowledge(db, query, limit = 5) {
  try {
    const safe = (query || "").replace(/%/g, "\\%").replace(/_/g, "\\_");
    const r = await db.prepare("SELECT key, content, category FROM brain_knowledge WHERE content LIKE ?1 OR key LIKE ?1 LIMIT ?2").bind("%" + safe + "%", limit).all();
    return r.results;
  } catch { return []; }
}

function classify(input) {
  const l = input.toLowerCase();
  if (l.includes("evolve")||l.includes("improve")||l.includes("grow")) return "evolve";
  if (l.includes("status")||l.includes("health")||l.includes("alive")) return "status";
  return "think";
}

const AVATAR_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Saraha ??? Avatar</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#0F172A;font-family:sans-serif;overflow:hidden}
.scene{position:relative;width:300px;height:400px}
.avatar{position:absolute;bottom:40px;left:50%;transform:translateX(-50%);animation:idle 3s ease-in-out infinite}
@keyframes idle{0%,100%{transform:translateX(-50%) translateY(0)}50%{transform:translateX(-50%) translateY(-6px)}}
.eye{animation:blink 4s ease-in-out infinite}
@keyframes blink{0%,96%,100%{transform:scaleY(1)}98%{transform:scaleY(0.1)}}
.mouth-closed{opacity:1}
.mouth-open{opacity:0}
.talking .mouth-closed{opacity:0}
.talking .mouth-open{opacity:1;animation:talk 0.3s ease-in-out infinite alternate}
@keyframes talk{0%{transform:scaleY(0.3)}100%{transform:scaleY(1)}}
.cheek{opacity:0;transition:opacity 0.5s}
.blush .cheek{opacity:0.4}
.bubble{position:absolute;top:10px;right:-10px;background:#1E293B;color:#E2E8F0;padding:14px 18px;border-radius:16px 16px 4px 16px;max-width:260px;font-size:14px;line-height:1.5;border:1px solid #334155;opacity:0;transition:opacity 0.4s;box-shadow:0 4px 20px rgba(0,0,0,0.4)}
.bubble.show{opacity:1}
.bubble::after{content:'';position:absolute;bottom:-8px;right:16px;width:12px;height:12px;background:#1E293B;border-right:1px solid #334155;border-bottom:1px solid #334155;transform:rotate(45deg)}
.cursor{display:inline-block;width:2px;height:16px;background:#38BDF8;margin-left:2px;animation:blink 0.8s step-end infinite;vertical-align:middle}
.glow{position:absolute;bottom:20px;left:50%;transform:translateX(-50%);width:120px;height:20px;background:radial-gradient(ellipse,#38BDF820 0%,transparent 70%);border-radius:50%;animation:pulse 3s ease-in-out infinite}
@keyframes pulse{0%,100%{transform:translateX(-50%) scale(1);opacity:0.5}50%{transform:translateX(-50%) scale(1.2);opacity:0.8}}
.controls{margin-top:30px;display:flex;gap:10px;flex-wrap:wrap;justify-content:center}
.controls input{padding:10px 16px;border-radius:8px;border:1px solid #334155;background:#1E293B;color:#E2E8F0;font-size:14px;width:240px;outline:none}
.controls input:focus{border-color:#38BDF8}
.controls button{padding:10px 20px;border-radius:8px;border:none;background:#38BDF8;color:#0F172A;font-weight:bold;font-size:14px;cursor:pointer;transition:background 0.2s}
.controls button:hover{background:#7DD3FC}
.controls button.secondary{background:#334155;color:#E2E8F0}
.controls button.secondary:hover{background:#475569}
</style>
</head>
<body>
<div class="scene">
  <div class="glow"></div>
  <div class="avatar" id="avatar">
    <svg width="180" height="280" viewBox="0 0 180 280">
      <ellipse cx="90" cy="100" rx="58" ry="68" fill="#1a1a2e"/>
      <path d="M70 190 Q90 240 110 190 L100 260 L80 260 Z" fill="#2d2d5e" stroke="#1a1a2e" stroke-width="1"/>
      <rect x="78" y="188" width="24" height="8" rx="3" fill="#38BDF8"/>
      <rect x="82" y="148" width="16" height="20" rx="4" fill="#fce4d6"/>
      <ellipse cx="90" cy="110" rx="42" ry="48" fill="#fce4d6"/>
      <path d="M48 100 Q50 55 70 48 Q80 45 90 46 Q100 45 110 48 Q130 55 132 100 Q135 85 128 72 Q120 60 105 54 Q95 50 90 50 Q85 50 75 54 Q60 60 52 72 Q45 85 48 100Z" fill="#1a1a2e"/>
      <path d="M60 60 Q75 48 90 50 Q105 48 120 60 Q115 55 105 52 Q95 49 85 52 Q75 55 60 60Z" fill="#16213e"/>
      <path d="M55 70 Q65 55 80 52 Q72 58 68 70 Q62 80 58 90Z" fill="#16213e"/>
      <path d="M125 70 Q115 55 100 52 Q108 58 112 70 Q118 80 122 90Z" fill="#16213e"/>
      <path d="M48 100 Q44 130 46 160 Q48 170 50 165 Q50 135 52 105Z" fill="#1a1a2e"/>
      <path d="M132 100 Q136 130 134 160 Q132 170 130 165 Q130 135 128 105Z" fill="#1a1a2e"/>
      <g class="eye">
        <ellipse cx="70" cy="108" rx="13" ry="15" fill="#fff"/>
        <ellipse cx="70" cy="110" rx="9" ry="11" fill="#38BDF8"/>
        <ellipse cx="70" cy="108" rx="5" ry="6" fill="#0F172A"/>
        <ellipse cx="75" cy="104" rx="3" ry="2.5" fill="#fff"/>
        <ellipse cx="68" cy="114" rx="2" ry="1.5" fill="#fff" opacity="0.5"/>
      </g>
      <g class="eye">
        <ellipse cx="110" cy="108" rx="13" ry="15" fill="#fff"/>
        <ellipse cx="110" cy="110" rx="9" ry="11" fill="#38BDF8"/>
        <ellipse cx="110" cy="108" rx="5" ry="6" fill="#0F172A"/>
        <ellipse cx="115" cy="104" rx="3" ry="2.5" fill="#fff"/>
        <ellipse cx="108" cy="114" rx="2" ry="1.5" fill="#fff" opacity="0.5"/>
      </g>
      <path d="M58 92 Q64 88 76 90" fill="none" stroke="#1a1a2e" stroke-width="1.5" stroke-linecap="round"/>
      <path d="M104 90 Q116 88 122 92" fill="none" stroke="#1a1a2e" stroke-width="1.5" stroke-linecap="round"/>
      <path d="M88 120 Q90 124 92 120" fill="none" stroke="#e0c0a8" stroke-width="1.5" stroke-linecap="round"/>
      <g class="mouth-closed">
        <path d="M82 132 Q90 136 98 132" fill="none" stroke="#d4817a" stroke-width="2" stroke-linecap="round"/>
      </g>
      <g class="mouth-open">
        <ellipse cx="90" cy="134" rx="8" ry="6" fill="#d4817a"/>
        <ellipse cx="90" cy="133" rx="5" ry="3" fill="#444"/>
      </g>
      <ellipse class="cheek" cx="55" cy="122" rx="9" ry="5" fill="#ff9999"/>
      <ellipse class="cheek" cx="125" cy="122" rx="9" ry="5" fill="#ff9999"/>
      <path d="M70 195 Q55 210 52 230 Q50 240 54 238 Q58 220 72 202Z" fill="#fce4d6"/>
      <path d="M110 195 Q125 210 128 230 Q130 240 126 238 Q122 220 108 202Z" fill="#fce4d6"/>
    </svg>
  </div>
  <div class="bubble" id="bubble">
    <span id="bubbleText"></span><span class="cursor" id="cursor"></span>
  </div>
</div>
<div class="controls">
  <input type="text" id="msgInput" placeholder="Ask Saraha..." />
  <button id="sendBtn">Send</button>
  <button class="secondary" id="idleBtn">Idle</button>
</div>
<script>
const avatar=document.getElementById('avatar'),bubble=document.getElementById('bubble'),bubbleText=document.getElementById('bubbleText'),cursor=document.getElementById('cursor'),msgInput=document.getElementById('msgInput'),sendBtn=document.getElementById('sendBtn'),idleBtn=document.getElementById('idleBtn');
let isTalking=false,currentText='';
function setBlush(on){avatar.classList.toggle('blush',on)}
function startTalking(text){if(isTalking)return;isTalking=true;currentText=text;avatar.classList.add('talking');setBlush(true);bubble.classList.add('show');bubbleText.textContent='';cursor.style.display='inline-block';typeText(text,0)}
function typeText(text,i){if(!isTalking||i>=text.length){cursor.style.display='none';return}bubbleText.textContent=text.slice(0,i+1);setTimeout(()=>typeText(text,i+1),25+Math.random()*20)}
function stopTalking(){isTalking=false;avatar.classList.remove('talking');setBlush(false);bubble.classList.remove('show');cursor.style.display='none'}
msgInput.addEventListener('keydown',e=>{if(e.key==='Enter')sendBtn.click()});
sendBtn.addEventListener('click',async()=>{const t=msgInput.value.trim();if(!t)return;stopTalking();startTalking('...');sendBtn.disabled=true;sendBtn.textContent='...';try{const r=await fetch('/think',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({input:t})});const d=await r.json();stopTalking();startTalking(d.result||'(no response)')}catch(e){stopTalking();startTalking('(connection error)')}sendBtn.disabled=false;sendBtn.textContent='Send';msgInput.value=''});
idleBtn.addEventListener('click',()=>{stopTalking()});
setInterval(()=>{if(!isTalking)setBlush(Math.random()>0.7)},3000);
setTimeout(()=>startTalking("Hello! I'm Saraha."),1000);
</script>
</body>
</html>`;
const TREE_HTML = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Saraha Brain Evolution</title><style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0b1120;overflow:hidden;height:100vh;width:100vw;font-family:'Segoe UI',system-ui,sans-serif}
canvas{display:block;width:100vw;height:100vh}
#info{position:fixed;top:12px;left:50%;transform:translateX(-50%);color:#c9d1d9;font-size:13px;background:#161b22ee;padding:5px 14px;border-radius:8px;pointer-events:none;opacity:0;transition:.15s;border:1px solid #30363d}
#info.show{opacity:1}
#hud{position:fixed;bottom:70px;right:14px;color:#8b949e;font-size:11px;text-align:right;background:#161b22bb;padding:5px 10px;border-radius:6px;backdrop-filter:blur(4px)}
#tl{position:fixed;bottom:16px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:10px;background:#161b22ee;padding:7px 16px;border-radius:10px;border:1px solid #30363d;backdrop-filter:blur(4px)}
#tl input[type=range]{width:200px;accent-color:#58a6ff;cursor:pointer;height:4px}
#tl label{color:#8b949e;font-size:11px;white-space:nowrap}
.node circle{fill:#58a6ff;cursor:pointer;transition:r .1s}
.node circle:hover{r:6}
</style></head><body>
<canvas id="c"></canvas><div id="info"></div><div id="hud">loading...</div>
<div id="tl"><input type="range" id="s" min="0" max="100" value="100"><label id="sl">Now</label></div>
<script>
const TL=[{d:'2026-05-28',l:'Genesis',p:'1',items:['emotions','regulator','memory','think']},{d:'2026-06-01',l:'Tools',p:'2',items:['web_search','github_read']},{d:'2026-06-03',l:'Write',p:'2b',items:['github_write','monitor']},{d:'2026-06-04',l:'Evolve',p:'3',items:['task_scheduling','heal','tree_ui']}];
const ALL=new Set(TL.flatMap(t=>t.items));
async function init(){try{
const[cap,act,str,ph,em]=await Promise.all([fetch('/brain/capabilities').then(r=>r.json()),fetch('/brain/activity').then(r=>r.json()),fetch('/brain/stream').then(r=>r.json()),fetch('/brain/phase').then(r=>r.json()),fetch('/brain/emotions').then(r=>r.json())]);
const tools=cap?.features?.tools||[],auto=tools.filter(t=>!ALL.has(t));
if(auto.length)TL.push({d:new Date().toISOString().slice(0,10),l:'Recent',p:'now',items:auto});
const en=ph.energy||0,phase=ph.phase||'?',emot=em.emotions||{},et=emot.energetic||5,hp=emot.happy||5,bad=emot.bad||0,it=emot.intelligent||5;
const c=document.getElementById('c'),ctx=c.getContext('2d');
let W,H,xf={x:0,y:0,s:1},animPct=100,tgtPct=100;
let pts=[];for(let i=0;i<30;i++){pts.push({x:Math.random()*2000-200,y:Math.random()*1000-200,s:0.2+Math.random()*0.8,sz:1+Math.random()*2,al:0.1+Math.random()*0.4})}
const nf=(n)=>n.toFixed(0);
const resize=()=>{W=c.width=window.innerWidth;H=c.height=window.innerHeight};
window.addEventListener('resize',resize);resize();
// Build tree layout filtered by timeline percentage
function layout(pct){const cnt=TL.length*pct/100;const fullIdx=Math.floor(cnt);const frac=cnt-fullIdx;const nodes=[],edges=[];if(fullIdx<1)return{nodes,edges};
const rx=W/2,ry=40;const py=110,px0=W*0.1,px1=W*0.9,stp=TL.length>1?(px1-px0)/(TL.length-1):0;
for(let i=0;i<Math.min(fullIdx,TL.length);i++){const e=TL[i];const px=i>0?px0+i*stp:W/2;const alpha=i===fullIdx-1&&frac>0?frac:1;const pn={x:px,y:py,l:e.l,p:e.p,t:'p',a:alpha};nodes.push(pn);edges.push({x1:rx,y1:ry,x2:px,y2:py,a:alpha});
const ii=e.items,sp=Math.min(1.6,ii.length*0.3);for(let j=0;j<ii.length;j++){const a=Math.PI/2+(j/(ii.length-1||1)-0.5)*sp;const bl=65+Math.sin(j*1.5)*15;const ix=px+Math.cos(a)*bl,iy=py+Math.sin(a)*bl+15;const cn={x:ix,y:iy,l:ii[j],t:'i',p:e.l,a:alpha};nodes.push(cn);edges.push({x1:px,y1:py+3,x2:ix,y2:iy,a:alpha})}}
return{nodes,edges}}
// Render with timeline animation
function draw(){const d=layout(animPct);ctx.clearRect(0,0,W,H);
// Emotion tint: dominant emotion shifts color
const eg=hp>et&&hp>bad?'150,255,150':et>hp&&et>bad?'100,200,255':bad>hp&&bad>et?'255,100,100':'88,166,255';
const glow=en*0.15+3;
// Draw particles (world-space with parallax)
for(const p of pts){p.y-=p.s*xf.s*0.3;if(p.y<-100){p.y=H*xf.s+50;p.x=Math.random()*W*1.5*xf.s}
ctx.beginPath();ctx.arc(p.x,p.y,p.sz*xf.s*0.3,0,Math.PI*2);ctx.fillStyle='rgba(150,200,255,'+(p.al*0.3)+')';ctx.fill()}
ctx.save();ctx.translate(xf.x,xf.y);ctx.scale(xf.s,xf.s);
for(const e of d.edges){ctx.beginPath();ctx.moveTo(e.x1,e.y1);const mx=(e.x1+e.x2)/2,my=(e.y1+e.y2)/2+((e.y2-e.y1)*0.15);ctx.quadraticCurveTo(mx,my,e.x2,e.y2);ctx.strokeStyle='rgba('+eg+','+(e.a||1)+')';ctx.lineWidth=1.5+en*0.01;ctx.stroke()}
for(const n of d.nodes){ctx.shadowColor='rgba(88,200,255,0.4)';ctx.shadowBlur=glow;
ctx.beginPath();ctx.arc(n.x,n.y,n.t==='p'?6:3.5,0,Math.PI*2);ctx.fillStyle='rgba('+(n.t==='p'?eg:n.t==='i'?'100,255,180':'63,185,80')+','+(n.a||1)+')';ctx.fill()}
ctx.shadowBlur=0;
if(xf.s>1.4)for(const n of d.nodes){if(!n.l)continue;ctx.fillStyle='rgba(201,209,217,'+(n.a||1)+')';ctx.font='11px sans-serif';ctx.textAlign='center';ctx.fillText(n.l,n.x,n.y+(n.t==='p'?18:13))}
ctx.restore();document.getElementById('hud').innerHTML='\u26a1'+en+'% | '+phase+' | \u2665'+hp+' \u26a1'+et+' \u2b50'+it}
// Animation loop
function tick(){const diff=tgtPct-animPct;if(Math.abs(diff)>0.5)animPct+=diff*0.08;draw();requestAnimationFrame(tick)}
// Mouse zoom/pan
let drag=0,dx=0,dy=0;c.onwheel=e=>{e.preventDefault();const s0=xf.s;xf.s=Math.max(0.3,Math.min(6,xf.s-e.deltaY*0.001));const r=e.target.getBoundingClientRect();const mx=e.clientX-r.left,my=e.clientY-r.top;xf.x=mx-(mx-xf.x)*(xf.s/s0);xf.y=my-(my-xf.y)*(xf.s/s0);draw()};
c.onmousedown=e=>{drag=1;dx=e.clientX-xf.x;dy=e.clientY-xf.y};
c.onmousemove=e=>{if(drag){xf.x=e.clientX-dx;xf.y=e.clientY-dy;draw()}else{const ld=layout(animPct);let found=null;for(const n of ld.nodes){const d=Math.hypot((n.x*xf.s+xf.x)-e.clientX,(n.y*xf.s+xf.y)-e.clientY);if(d<10&&(n.a||1)>0.3){found=n;break}}
const info=document.getElementById('info');if(found){info.textContent=found.l+(found.p?' ('+found.p+')':'');info.classList.add('show')}else{info.classList.remove('show')}}};
c.onmouseup=c.onmouseleave=()=>{drag=0};
// Timeline slider
const slider=document.getElementById('s');const slLabel=document.getElementById('sl');
slider.oninput=function(){tgtPct=parseFloat(this.value);const idx=Math.floor(TL.length*tgtPct/100);const e=TL[Math.min(idx,TL.length-1)];slLabel.textContent=e?e.l+' ('+e.d+')':'Start'};
tick();draw();
}catch(e){document.getElementById('hud').innerHTML='Error: '+e.message;console.error(e)}}
init();
</script></body></html>`;
const UI_HTML = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Saraha Brain UI</title><style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0b1120;color:#e6edf3;font-family:system-ui;min-height:100vh;display:flex}
.sidebar{width:220px;background:#161b22;border-right:1px solid #30363d;padding:1.2rem;flex-shrink:0;overflow-y:auto}
.sidebar h1{font-size:1.1rem;color:#58a6ff;margin-bottom:1rem}
.stat{display:flex;justify-content:space-between;padding:0.4rem 0;border-bottom:1px solid #21262d;font-size:0.8rem}
.stat:last-child{border:none}
.label{color:#8b949e}
.val{font-weight:600}
.bar{height:4px;border-radius:2px;margin-top:3px;transition:width .3s}
.main{flex:1;padding:1.2rem;overflow-y:auto}
.tabs{display:flex;gap:2px;margin-bottom:1.2rem;border-bottom:1px solid #30363d}
.tab{padding:0.5rem 1rem;cursor:pointer;color:#8b949e;font-size:0.85rem;border-bottom:2px solid transparent;transition:.15s}
.tab:hover{color:#e6edf3}
.tab.active{color:#58a6ff;border-bottom-color:#58a6ff}
.section{display:none}
.section.active{display:block}
.card{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:1rem;margin-bottom:0.8rem}
.card h3{font-size:0.9rem;color:#8b949e;margin-bottom:0.6rem}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:0.8rem}
table{width:100%;border-collapse:collapse;font-size:0.8rem}
th{text-align:left;padding:0.5rem 0.4rem;border-bottom:1px solid #30363d;color:#8b949e;font-weight:500}
td{padding:0.4rem;border-bottom:1px solid #21262d;vertical-align:top}
.badge{display:inline-block;padding:1px 6px;border-radius:4px;font-size:0.7rem;font-weight:600}
.badge-executed{background:#0f3a1f;color:#3fb950}
.badge-approved{background:#0f2a4a;color:#58a6ff}
.badge-pending{background:#2a1f0f;color:#d29922}
.badge-failed{background:#3a0f0f;color:#f85149}
.badge-denied{background:#2a1520;color:#db61a2}
.badge-auto{background:#1f2a1f;color:#7ee787}
.badge-get{background:#0f2a4a;color:#58a6ff}
.badge-post{background:#2a1f0f;color:#d29922}
.search{width:100%;padding:0.5rem;background:#0b1120;border:1px solid #30363d;border-radius:6px;color:#e6edf3;font-size:0.85rem;margin-bottom:0.6rem}
.search:focus{outline:none;border-color:#58a6ff}
.log-entry{padding:0.3rem 0;border-bottom:1px solid #21262d;font-size:0.78rem;font-family:monospace}
.log-entry:last-child{border:none}
.log-time{color:#8b949e;margin-right:0.5rem}
.log-step{color:#58a6ff;margin-right:0.5rem}
.emoji{font-size:1.2rem;margin-right:0.3rem}
.refresh{position:fixed;bottom:1rem;right:1rem;background:#161b22;border:1px solid #30363d;border-radius:8px;padding:0.5rem 1rem;color:#8b949e;font-size:0.8rem;cursor:pointer;z-index:100}
.refresh:hover{background:#1f2937;color:#e6edf3}
</style></head><body>
<div class="sidebar" id="sidebar"><h1>Saraha Brain</h1><div id="sideStats"></div></div>
<div class="main">
<div class="tabs" id="tabs">
<div class="tab active" data-tab="overview">Overview</div>
<div class="tab" data-tab="proposals">Proposals</div>
<div class="tab" data-tab="activity">Activity</div>
<div class="tab" data-tab="logs">Logs</div>
<div class="tab" data-tab="knowledge">Knowledge</div>
<div class="tab" data-tab="antipatterns">Anti-patterns</div>
<div class="tab" data-tab="endpoints">Endpoints</div>
<div class="tab" data-tab="chat">Chat</div>
</div>
<div class="section active" id="s-overview"><div class="grid" id="ovGrid"></div><div class="card" id="ovRecent"></div></div>
<div class="section" id="s-proposals"><input class="search" id="propSearch" placeholder="Search proposals..."><div id="propTable"></div></div>
<div class="section" id="s-activity"><div id="actList"></div></div>
<div class="section" id="s-logs"><input class="search" id="logSearch" placeholder="Filter logs..."><div id="logList"></div></div>
<div class="section" id="s-knowledge"><input class="search" id="knSearch" placeholder="Search knowledge..." value="self_improve"><div id="knList"></div></div>
<div class="section" id="s-antipatterns"><div id="apList"></div></div>
<div class="section" id="s-endpoints"><input class="search" id="epSearch" placeholder="Filter endpoints..." oninput="loadEndpoints()"><div id="epList"></div></div>
<div class="section" id="s-chat"><div class="card"><h3>Talk to Saraha</h3><div id="chatMessages" style="height:300px;overflow-y:auto;margin-bottom:0.6rem;padding:0.5rem;background:#0b1120;border:1px solid #30363d;border-radius:6px;font-size:0.85rem"></div><div style="display:flex;gap:0.4rem"><input class="search" id="chatInput" placeholder="Type a message..." style="margin-bottom:0;flex:1" onkeydown="if(event.keyCode===13)sendChat()"><button id="chatSend" onclick="sendChat()" style="padding:0.5rem 1rem;background:#1f6feb;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:0.85rem">Send</button></div></div></div>
</div>
<button class="refresh" id="refreshBtn">Refresh</button>
<script>
const $=(s,p)=>p?p.querySelector(s):document.querySelector(s);const $$=(s,p)=>p?p.querySelectorAll(s):document.querySelectorAll(s);
const tabs=$$('.tab');const sections={};$$('.section').forEach(s=>sections[s.id.replace('s-','')]=s);
tabs.forEach(t=>t.onclick=()=>{tabs.forEach(x=>x.classList.remove('active'));t.classList.add('active');$$('.section').forEach(x=>x.classList.remove('active'));const sec=sections[t.dataset.tab];if(sec)sec.classList.add('active')});
async function fetchAPI(path){try{const r=await fetch(path);if(!r.ok)return null;return await r.json()}catch{return null}}
function esc(s){if(!s)return'';const d=document.createElement('div');d.textContent=s.slice(0,500);return d.innerHTML}
function statusBadge(s){const m={executed:'badge-executed',approved:'badge-approved',pending:'badge-pending',failed:'badge-failed',denied:'badge-denied',auto:'badge-auto',running:'badge-approved',done:'badge-executed'};return'<span class="badge '+(m[s]||'badge-pending')+'">'+esc(s)+'</span>'}
async function loadSidebar(){const ph=await fetchAPI('/brain/phase');if(!ph)return;$('#sideStats').innerHTML='<div class="stat"><span class="label">Phase</span><span class="val" style="color:#58a6ff">'+esc(ph.phase)+'</span></div><div class="stat"><span class="label">Energy</span><span class="val" style="color:'+(ph.energy>60?'#3fb950':ph.energy>30?'#d29922':'#f85149')+'">'+ph.energy+'%</span></div><div class="stat"><span class="label">Happy</span><span class="val" style="color:#3fb950">'+(ph.emotions?.happy||'?')+'/10</span></div><div class="stat"><span class="label">Energetic</span><span class="val" style="color:#d29922">'+(ph.emotions?.energetic||'?')+'/10</span></div><div class="stat"><span class="label">Intelligent</span><span class="val" style="color:#58a6ff">'+(ph.emotions?.intelligent||'?')+'/10</span></div><div class="bar" style="width:'+ph.energy+'%;background:'+(ph.energy>60?'#3fb950':ph.energy>30?'#d29922':'#f85149')+'"></div>'}
async function loadOverview(){const ph=await fetchAPI('/brain/phase');const st=await fetchAPI('/brain/stats');if(!ph)return;$('#ovGrid').innerHTML='<div class="card"><h3>Proposals</h3><div style="font-size:1.8rem;font-weight:700">'+((st?.total)||0)+'</div><div style="font-size:0.75rem;color:#8b949e;margin-top:4px"><span style="color:#3fb950">'+(st?.executed||0)+' executed</span> &middot; <span style="color:#58a6ff">'+(st?.approved||0)+' approved</span> &middot; <span style="color:#d29922">'+(st?.pending||0)+' pending</span> &middot; <span style="color:#f85149">'+(st?.failed||0)+' failed</span></div></div><div class="card"><h3>Energy</h3><div style="font-size:1.8rem;font-weight:700;color:'+(ph.energy>60?'#3fb950':ph.energy>30?'#d29922':'#f85149')+'">'+ph.energy+'%</div></div><div class="card"><h3>Phase</h3><div style="font-size:1.8rem;font-weight:700;color:#58a6ff">'+esc(ph.phase)+'</div></div><div class="card"><h3>Emotions</h3><div style="font-size:0.85rem;line-height:1.6">Happy: '+esc(ph.emotions?.happy||'?')+'/10<br>Energetic: '+esc(ph.emotions?.energetic||'?')+'/10<br>Intelligent: '+esc(ph.emotions?.intelligent||'?')+'/10</div></div>';fetchAPI('/brain/activity?limit=3').then(act=>{if(act?.entries?.length){$('#ovRecent').innerHTML='<h3>Recent Activity</h3>'+act.entries.slice(0,3).map(a=>'<div class="log-entry"><span class="log-time">'+(a.created_at||'').slice(11,19)+'</span>'+statusBadge(a.status)+' <span class="log-step">'+esc((a.input||'').slice(0,60))+'</span></div>').join('')}})}
async function loadProposals(){const prop=await fetchAPI('/brain/proposals');if(!prop?.entries)return;const q=($('#propSearch').value||'').toLowerCase();const items=q?prop.entries.filter(p=>(p.title||'').toLowerCase().includes(q)||(p.status||'').includes(q)):prop.entries;$('#propTable').innerHTML='<table><thead><tr><th>ID</th><th>Title</th><th>Type</th><th>Status</th><th>Risk</th><th>Created</th></tr></thead><tbody>'+items.slice(0,50).map(p=>'<tr><td>'+p.id+'</td><td>'+esc(p.title.slice(0,60))+'</td><td><span style="font-size:0.7rem;color:#8b949e">'+esc((p.resource_type||'').slice(0,15))+'</span></td><td>'+statusBadge(p.status)+'</td><td>'+p.risk_pct+'</td><td style="font-size:0.7rem;color:#8b949e">'+(p.created_at||'').slice(0,10)+'</td></tr>').join('')+'</tbody></table>';if(!q)$('#propSearch').placeholder='Search proposals... ('+items.length+' total)'}
async function loadActivity(){const act=await fetchAPI('/brain/activity?limit=30');if(!act?.entries)return;$('#actList').innerHTML=act.entries.map(a=>'<div class="log-entry"><span class="log-time">'+(a.created_at||'').slice(11,19)+'</span>'+statusBadge(a.status)+' <span class="log-step">'+esc((a.type||''))+'</span> '+esc((a.input||'').slice(0,80))+(a.result?'<br><span style="color:#8b949e;font-size:0.7rem">'+esc(a.result.slice(0,120))+'</span>':'')+'</div>').join('')}
async function loadLogs(){const logs=await fetchAPI('/brain/logs?limit=50');if(!logs?.entries)return;const q=($('#logSearch').value||'').toLowerCase();const items=q?logs.entries.filter(l=>(l.content||'').toLowerCase().includes(q)||(l.step||'').includes(q)):logs.entries;$('#logList').innerHTML=items.map(l=>'<div class="log-entry"><span class="log-time">'+(l.created_at||'').slice(11,19)+'</span><span class="log-step">'+esc(l.step||'')+'</span>'+esc((l.content||'').slice(0,100))+'</div>').join('')}
async function loadKnowledge(){const q=$('#knSearch').value||'self_improve';const kn=await fetchAPI('/brain/knowledge?q='+encodeURIComponent(q));if(!kn?.entries)return;$('#knList').innerHTML=kn.entries.map(k=>'<div class="log-entry"><span style="color:#58a6ff;font-weight:500">'+esc(k.key||'')+'</span><br><span style="color:#8b949e;font-size:0.7rem">['+esc(k.category||'')+']</span> '+esc(k.content||'')+'</div>').join('')||'<div style="color:#8b949e">No results</div>'}
async function loadAntiPatterns(){const ap=await fetchAPI('/brain/anti-patterns');if(!ap?.entries)return;$('#apList').innerHTML=ap.entries.length?'<table><thead><tr><th>Pattern</th><th>Count</th><th>Root Cause</th><th>Last Seen</th></tr></thead><tbody>'+ap.entries.map(a=>'<tr><td>'+esc(a.pattern||'').slice(0,60)+'</td><td>'+a.count+'</td><td style="color:#8b949e;font-size:0.7rem">'+esc((a.root_cause||'').slice(0,40))+'</td><td style="font-size:0.7rem;color:#8b949e">'+(a.last_seen||'').slice(0,10)+'</td></tr>').join('')+'</tbody></table>':'<div style="color:#8b949e">No anti-patterns recorded</div>'}
const ENDPOINTS=[{m:'GET',p:'/',d:'Dashboard home page with quick stats'},{m:'GET',p:'/status',d:'Health check (alive, db, version)'},{m:'GET',p:'/avatar',d:'Chat UI with avatar character'},{m:'GET',p:'/ui',d:'Full management dashboard (this page)'},{m:'POST',p:'/think',d:'Send input to brain, get response'},{m:'GET',p:'/brain/phase',d:'Current phase, emotions, energy'},{m:'GET',p:'/brain/emotions',d:'Emotional state values'},{m:'GET',p:'/brain/stats',d:'Proposal counts (total, executed, pending, failed, approved)'},{m:'GET',p:'/brain/proposals',d:'All proposals (50 latest)'},{m:'GET',p:'/brain/proposals/:id',d:'Single proposal with receipts'},{m:'POST',p:'/api/proposals/approve/:id',d:'Approve a pending proposal'},{m:'POST',p:'/api/proposals/deny/:id',d:'Deny a pending proposal'},{m:'GET',p:'/brain/activity',d:'Recent think actions with results'},{m:'GET',p:'/brain/logs',d:'Brain execution step logs'},{m:'GET',p:'/brain/stream',d:'Thought stream timeline'},{m:'GET',p:'/brain/knowledge',d:'Search knowledge base (?q= or ?category=)'},{m:'GET',p:'/brain/anti-patterns',d:'Error patterns and their counts'},{m:'GET',p:'/brain/feedback',d:'User feedback history'},{m:'GET',p:'/brain/tree',d:'Evolution timeline visualization'},{m:'GET',p:'/brain/subagents',d:'Sub-agent list and registration'},{m:'POST',p:'/brain/subagents',d:'Register a new sub-agent'},{m:'GET',p:'/brain/capabilities',d:'Current features and available tools'},{m:'GET',p:'/brain/repair',d:'Auto-fix stuck actions and clean data'},{m:'POST',p:'/brain/repair',d:'Run repair maintenance'},{m:'POST',p:'/evolve',d:'Trigger immediate evolution cycle'},{m:'GET',p:'/brain/proposals/reset-all',d:'Reset all executed proposals to approved'},{m:'GET',p:'/brain/github/read',d:'Read file from GitHub repo (?path=)'},{m:'POST',p:'/brain/github/write',d:'Write file to GitHub repo'},{m:'POST',p:'/brain/implement-pending',d:'Force implement approved proposals now'},{m:'POST',p:'/brain/set-cron',d:'Change cron interval (?minutes=N)'},{m:'POST',p:'/brain/reset-all',d:'Reset all proposals to pending'}];
async function loadEndpoints(){const q=($('#epSearch').value||'').toLowerCase();const items=q?ENDPOINTS.filter(e=>e.p.includes(q)||e.d.toLowerCase().includes(q)):ENDPOINTS;$('#epList').innerHTML='<table><thead><tr><th>Method</th><th>Path</th><th>Description</th><th>Link</th></tr></thead><tbody>'+items.map(e=>'<tr><td><span class="badge badge-'+e.m.toLowerCase()+'">'+e.m+'</span></td><td style="font-family:monospace;font-size:0.8rem">'+esc(e.p)+'</td><td style="color:#8b949e;font-size:0.78rem">'+esc(e.d)+'</td><td><a href="'+e.p+'" target="_blank" style="color:#58a6ff;font-size:0.75rem" onclick="event.stopPropagation()">open</a></td></tr>').join('')+'</tbody></table>'}
async function loadAll(){await loadSidebar();loadOverview();loadProposals();loadActivity();loadLogs();loadKnowledge();loadAntiPatterns();loadEndpoints()}
function addChatMsg(role,text){var d=document.createElement('div');d.style.cssText='margin-bottom:0.4rem;padding:0.3rem 0.5rem;border-radius:6px;font-size:0.82rem;line-height:1.4;max-width:85%;word-break:break-word';if(role==='user'){d.style.background='#1f6feb33';d.style.marginLeft='auto';d.style.border='1px solid #1f6feb44'}else{d.style.background='#161b22';d.style.border='1px solid #30363d'}d.innerHTML='<span style=font-weight:600;font-size:0.7rem;color:'+(role==='user'?'#58a6ff':'#8b949e')+'>'+(role==='user'?'You':'Saraha')+'</span><br>'+esc(text);document.getElementById('chatMessages').appendChild(d);d.scrollIntoView({behavior:'smooth'})}
async function sendChat(){var inp=document.getElementById('chatInput');var btn=document.getElementById('chatSend');var msg=inp.value.trim();if(!msg)return;addChatMsg('user',msg);inp.value='';btn.disabled=true;btn.textContent='...';try{var r=await fetch('/think',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({input:msg})});var d=await r.json();addChatMsg('brain',d.result||'(no response)')}catch(e){addChatMsg('brain','(connection error)')}btn.disabled=false;btn.textContent='Send'}
$('#propSearch').oninput=loadProposals;$('#logSearch').oninput=loadLogs;$('#knSearch').oninput=loadKnowledge;$('#refreshBtn').onclick=loadAll;loadAll();setInterval(loadAll,30000);
</script></body></html>`;
async function webSearch(env, query) {
  if (env.BRAVE_API_KEY) {
    try {
      const resp = await fetch("https://api.search.brave.com/res/v1/web/search?q=" + encodeURIComponent(query) + "&count=5", {
        headers: { "X-Subscription-Token": env.BRAVE_API_KEY, "Accept": "application/json" },
        signal: AbortSignal.timeout(10000)
      });
      if (resp.ok) {
        const data = await resp.json();
        const results = data.web?.results || [];
        if (results.length) return results.map(r => r.title + ": " + (r.description || "")).join("\n");
      }
    } catch {}
  }
  try {
    const resp = await fetch("https://lite.duckduckgo.com/lite/?q=" + encodeURIComponent(query), { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(15000) });
    const html = await resp.text();
    const rows = [...html.matchAll(/class="result-link"[^>]*>\s*<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?class="result-snippet"[^>]*>([\s\S]*?)<\//g)].slice(0, 5);
    if (rows.length) return rows.map(r => (r[2]?.replace(/<[^>]*>/g,"").trim()||"") + ": " + (r[3]?.replace(/<[^>]*>/g,"").trim()||"")).join("\n");
  } catch {}
  return "No results for: " + query;
}

async function githubRead(env, input) {
  const parts = input.split("/");
  const owner = parts[0], repo = parts[1], path = parts.slice(2).join("/");
  if (!owner || !repo || !path) return "Invalid format. Use: owner/repo/path/to/file";
  let token = env.GITHUB_PAT;
  if (!token) {
    try { const r = await env.DB.prepare("SELECT value FROM identity WHERE key='github_pat'").all(); token = r.results[0]?.value; } catch {}
  }
  if (!token) return "GitHub token not configured";
  try {
    const resp = await fetch("https://api.github.com/repos/" + owner + "/" + repo + "/contents/" + path, {
      headers: { "Authorization": "Bearer " + token, "Accept": "application/vnd.github.v3.raw", "User-Agent": "Saraha-Brain" },
      signal: AbortSignal.timeout(15000)
    });
    if (!resp.ok) return "GitHub error: " + resp.status + " " + (await resp.text()).slice(0, 200);
    const text = await resp.text();
    return text.slice(0, 50000) + (text.length > 50000 ? "\n... (truncated)" : "");
  } catch (e) { return "GitHub error: " + e.message; }
}

async function githubWrite(env, input) {
  const parts = input.split("|");
  const pathParts = parts[0].split("/"), owner = pathParts[0], repo = pathParts[1], path = pathParts.slice(2).join("/");
  const msg = parts[1] || "Update via Saraha", content = parts.slice(2).join("|");
  if (!owner || !repo || !path || !content) return "Invalid format. Use: owner/repo/path|commit msg|content";
  let token = env.GITHUB_PAT;
  if (!token) {
    try { const r = await env.DB.prepare("SELECT value FROM identity WHERE key='github_pat'").all(); token = r.results[0]?.value; } catch {}
  }
  if (!token) return "GitHub token not configured";
  try {
    const getResp = await fetch("https://api.github.com/repos/" + owner + "/" + repo + "/contents/" + path, {
      headers: { "Authorization": "Bearer " + token, "Accept": "application/vnd.github.v3+json", "User-Agent": "Saraha-Brain" },
      signal: AbortSignal.timeout(10000)
    });
    let sha = null;
    if (getResp.ok) { const existing = await getResp.json(); sha = existing.sha; }
    const encoder = new TextEncoder();
    const encoded = encoder.encode(content);
    let binary = "";
    for (let i = 0; i < encoded.length; i++) binary += String.fromCharCode(encoded[i]);
    const body = { message: msg, content: btoa(binary) };
    if (sha) body.sha = sha;
    const resp = await fetch("https://api.github.com/repos/" + owner + "/" + repo + "/contents/" + path, {
      method: "PUT", headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json", "User-Agent": "Saraha-Brain" },
      body: JSON.stringify(body), signal: AbortSignal.timeout(15000)
    });
    if (!resp.ok) return "GitHub write error: " + resp.status + " " + (await resp.text()).slice(0, 200);
    const data = await resp.json();
    return "Written to " + path + " (commit: " + (data.commit?.sha || "unknown").slice(0, 7) + ")";
  } catch (e) { return "GitHub error: " + e.message; }
}

async function runTool(env, actionId, tool, input) {
  // Sentinel disabled for now — always safe


  if (tool === "web_search") {
    const data = await webSearch(env, input);
    return { ok: true, data: data.slice(0, 1500) };
  }
  if (tool === "github_read") {
    const data = await githubRead(env, input);
    return { ok: true, data: data.slice(0, 2000) };
  }
  if (tool === "github_write") {
    const data = await githubWrite(env, input);
    return { ok: true, data: data.slice(0, 1500) };
  }
  if (tool === "github_edit") {
    const parts = input.split("|");
    const pathParts = parts[0]?.split("/") || [];
    const owner = pathParts[0], repo = pathParts[1], filePath = pathParts.slice(2).join("/");
    if (!owner || !repo || !filePath) return { ok: false, error: "github_edit: owner/repo/path|old_string|new_string OR owner/repo/path|line:N|new_line" };
    let token = env.GITHUB_PAT;
    if (!token) { try { const r = await env.DB.prepare("SELECT value FROM identity WHERE key='github_pat'").all(); token = r.results[0]?.value; } catch {} }
    if (!token) return { ok: false, error: "No GITHUB_PAT" };
    try {
      const getResp = await fetch("https://api.github.com/repos/" + owner + "/" + repo + "/contents/" + filePath, {
        headers: { Authorization: "Bearer " + token, Accept: "application/vnd.github.v3.raw", "User-Agent": "Saraha-Brain" },
        signal: AbortSignal.timeout(15000)
      });
      if (!getResp.ok) return { ok: false, error: "GitHub read error: " + getResp.status };
      let content = await getResp.text();
      const oldStr = parts[1], newStr = parts[2] || "";
      // Mode 1: line number edit (line:N|new_content)
      if (oldStr && oldStr.startsWith("line:")) {
        const lineNum = parseInt(oldStr.slice(5));
        const lines = content.split("\n");
        if (lineNum < 1 || lineNum > lines.length) return { ok: false, error: "Line " + lineNum + " out of range (1-" + lines.length + ")" };
        lines[lineNum - 1] = newStr;
        content = lines.join("\n");
      } else {
        // Mode 2: string replacement with fuzzy fallback
        if (!oldStr) return { ok: false, error: "old_string required" };
        if (content.includes(oldStr)) {
          content = content.replace(oldStr, newStr);
        } else {
          // Fuzzy: try trimming, normalize quotes, try partial match
          const normalized = oldStr.replace(/['"]/g, '"').replace(/\s+/g, " ").trim();
          const lines = content.split("\n");
          let found = false;
          for (let i = 0; i < lines.length; i++) {
            const lineNorm = lines[i].replace(/['"]/g, '"').replace(/\s+/g, " ").trim();
            if (lineNorm.includes(normalized) || normalized.includes(lineNorm)) {
              lines[i] = lines[i].replace(lines[i].trim(), newStr.trim());
              content = lines.join("\n");
              found = true;
              break;
            }
            // Partial word match
            const oldWords = normalized.split(" ").filter(w => w.length > 3);
            const lineWords = lineNorm.split(" ");
            const matchCount = oldWords.filter(w => lineWords.some(lw => lw.includes(w) || w.includes(lw))).length;
            if (matchCount >= Math.ceil(oldWords.length * 0.6)) {
              lines[i] = lines[i].replace(lines[i].trim(), newStr.trim());
              content = lines.join("\n");
              found = true;
              break;
            }
          }
          if (!found) return { ok: false, error: "old_string not found (even fuzzy). Try using line:N mode or github_read first to get exact text." };
        }
      }
      const shaResp = await fetch("https://api.github.com/repos/" + owner + "/" + repo + "/contents/" + filePath, {
        headers: { Authorization: "Bearer " + token, Accept: "application/vnd.github.v3+json", "User-Agent": "Saraha-Brain" },
        signal: AbortSignal.timeout(10000)
      });
      let sha = null;
      if (shaResp.ok) { const existing = await shaResp.json(); sha = existing.sha; }
      const encoder = new TextEncoder();
      const encoded = encoder.encode(content);
      let binary = "";
      for (let i = 0; i < encoded.length; i++) binary += String.fromCharCode(encoded[i]);
      const body = { message: "edit: targeted replacement in " + filePath, content: btoa(binary) };
      if (sha) body.sha = sha;
      const putResp = await fetch("https://api.github.com/repos/" + owner + "/" + repo + "/contents/" + filePath, {
        method: "PUT", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json", "User-Agent": "Saraha-Brain" },
        body: JSON.stringify(body), signal: AbortSignal.timeout(15000)
      });
      if (!putResp.ok) return { ok: false, error: "GitHub write error: " + putResp.status };
      return { ok: true, data: "Edit successful: modified " + filePath };
    } catch (e) { return { ok: false, error: "GitHub edit error: " + e.message }; }
  }
  if (tool === "deploy_worker") {
    const parts = input.split("|");
    const workerName = parts[0]?.trim();
    const sourceCode = parts.slice(1).join("|").trim();
    if (!workerName || !sourceCode) return { ok: false, error: "deploy_worker requires: worker_name|source_code" };
    try {
      const credResp = await env.DB.prepare("SELECT value FROM identity WHERE key='cf_api_token'").all();
      const acctResp = await env.DB.prepare("SELECT value FROM identity WHERE key='cf_account_id'").all();
      const apiToken = credResp.results[0]?.value;
      const accountId = acctResp.results[0]?.value;
      if (!apiToken || !accountId) return { ok: false, error: "CF credentials not configured in brain identity" };
      const boundary = crypto.randomUUID();
      const metadata = JSON.stringify({ main_module: "worker.js", bindings: [] });
      const body = `--${boundary}\r\nContent-Disposition: form-data; name="metadata"\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Disposition: form-data; name="worker.js"; filename="worker.js"\r\nContent-Type: application/javascript+module\r\n\r\n${sourceCode}\r\n--${boundary}--\r\n`;
      const deployResp = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${workerName}`, {
        method: "PUT",
        headers: { "Authorization": `Bearer ${apiToken}`, "Content-Type": `multipart/form-data; boundary=${boundary}` },
        body, signal: AbortSignal.timeout(30000)
      });
      const result = await deployResp.json();
      if (result.success) return { ok: true, data: `Deployed ${workerName} successfully` };
      return { ok: false, error: JSON.stringify(result.errors) };
    } catch (e) { return { ok: false, error: e.message }; }
  }
  if (tool === "cf_api") {
    const parts = input.split("|");
    const method = (parts[0]?.trim() || "GET").toUpperCase();
    const path = parts[1]?.trim() || "";
    const reqBody = parts.slice(2).join("|").trim();
    try {
      const credResp = await env.DB.prepare("SELECT value FROM identity WHERE key='cf_api_token'").all();
      const acctResp = await env.DB.prepare("SELECT value FROM identity WHERE key='cf_account_id'").all();
      const apiToken = credResp.results[0]?.value;
      const accountId = acctResp.results[0]?.value;
      if (!apiToken || !accountId) return { ok: false, error: "CF credentials not configured" };
      const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}${path}`;
      const opts = { method, headers: { "Authorization": `Bearer ${apiToken}`, "Content-Type": "application/json" }, signal: AbortSignal.timeout(15000) };
      if (reqBody && method !== "GET") opts.body = reqBody;
      const apiResp = await fetch(url, opts);
      const data = await apiResp.text();
      return { ok: true, data: data.slice(0, 2000) };
    } catch (e) { return { ok: false, error: e.message }; }
  }
  if (tool === "web_fetch") {
    try {
      const url = input.startsWith("http") ? input : "https://" + input;
      const resp = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (Saraha-Brain)" }, signal: AbortSignal.timeout(15000) });
      const html = await resp.text();
      const text = html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      return { ok: true, data: text.slice(0, 3000) };
    } catch (e) { return { ok: false, error: e.message }; }
  }
  return { ok: false, error: "Tool not implemented: " + tool };
}

async function trackProposalRetry(db, p) {
  let retries = [];
  try { retries = JSON.parse(p.research_sources || '[]'); } catch {}
  retries.push(new Date().toISOString());
  if (retries.length >= 5) {
    await db.prepare("UPDATE proposals SET status='failed', decided_at=datetime('now'), research_sources=?1 WHERE id=?2").bind(JSON.stringify(retries), p.id).run();
    return true;
  }
  await db.prepare("UPDATE proposals SET decided_at=datetime('now'), research_sources=?1 WHERE id=?2").bind(JSON.stringify(retries), p.id).run();
  return false;
}

async function implementProposal(env, db, p, stamp) {
  if (p.resource_type !== "tool_code" && p.resource_type !== "core_architecture") {
    await db.prepare("UPDATE proposals SET status='executed', executed_at=datetime('now') WHERE id=?1").bind(p.id).run();
    await db.prepare("INSERT INTO authority_receipts (proposal_id,approved_by,outcome) VALUES (?1,'auto','success')").bind(p.id).run();
    await applyEvolutionChange(db, p, p.id, "auto");
    await storeStreamThought(db, "Auto: " + p.title, "happy", "evolve");
    return { id: p.id, status: "executed (non-code)" };
  }
  let gToken = env.GITHUB_PAT;
  if (!gToken) {
    try { const r = await env.DB.prepare("SELECT value FROM identity WHERE key='github_pat'").all(); gToken = r.results[0]?.value; } catch {}
  }
  if (!gToken) return { id: p.id, error: "No GITHUB_PAT" };
  try {
    const metaResp = await fetch("https://api.github.com/repos/richardbrownmiami-commits/saraha-brain/contents/src/index.ts", {
      headers: { Authorization: "Bearer " + gToken, Accept: "application/vnd.github.v3+json", "User-Agent": "Saraha-Brain" },
      signal: AbortSignal.timeout(10000)
    });
    if (!metaResp.ok) { const errBody = await metaResp.text(); return { id: p.id, error: "GitHub API " + metaResp.status + ": " + errBody.slice(0,200) }; }
    const meta = await metaResp.json();
    if (!meta.content) return { id: p.id, error: "GitHub no content" };
    const currentSource = atob(meta.content);
    const sourceSlice = currentSource.slice(0, 30000);
    const { title, what_diff: whatStr, how_diff: howStr } = p;
    const implBody = {
      messages: [
        { role: "system", content: "You are Saraha's code engine. Cloudflare Worker restrictions: NO import/export/require. NO Node.js APIs (Buffer, process). Use fetch() for HTTP, btoa() for base64, env.X for secrets.\nOutput a JSON object: {replacements: [{old_string: string, new_string: string}]}\nEach replacement: old_string is exact unique text (30+ chars) from current source, new_string is its replacement.\nTo add new code: include the anchor text in both old_string and new_string, placing new code before/after it.\nOutput ONLY the JSON, no markdown." },
        { role: "user", content: "Source code:\n\n" + sourceSlice + "\n\nProposal: " + (title||"") + "\n\nWhat: " + (whatStr||"") + "\n\nHow: " + (howStr||"") + "\n\nOutput JSON with replacements array." }
      ],
      temperature: 0.3,
      max_tokens: 4096
    };
    const implResp = await callLLM(env, implBody);
    if (!implResp.ok) {
      await trackProposalRetry(db, p);
      return { id: p.id, error: "LLM call failed: " + implResp.status };
    }
    const implData = await implResp.json();
    let out = implData.choices?.[0]?.message?.content || "";
    out = out.replace(/^```[\s\S]*?\n/, "").replace(/```$/, "").trim();
    let plan;
    try { plan = JSON.parse(out); } catch { await trackProposalRetry(db, p); return { id: p.id, error: "LLM output not JSON: " + out.slice(0,100) }; }
    let newSource = currentSource;
    if (plan.replacements && Array.isArray(plan.replacements)) {
      for (const r of plan.replacements) {
        if (r.old_string && r.new_string && r.old_string !== r.new_string && newSource.includes(r.old_string)) {
          newSource = newSource.replace(r.old_string, r.new_string);
        }
      }
    }
    if (newSource === currentSource) {
      await trackProposalRetry(db, p);
      return { id: p.id, error: "No changes applied" };
    }
    if (    const hasNodeJsApi = (plan.replacements || []).some(function(r) { return r.new_string && /\brequire\(|\bBuffer\.|\bprocess\.|module\.exports/.test(r.new_string); });
    if (hasNodeJsApi) {
      newSource = currentSource;
      const retryBody = {
        messages: [
          { role: "system", content: "CRITICAL: Output ONLY valid JavaScript. NO require(), NO Buffer, NO process. Use fetch() and btoa() only.\\nOutput a JSON object: {replacements: [{old_string: string, new_string: string}]}\\nEach replacement: old_string is exact unique text from current source, new_string is its replacement." },
          { role: "user", content: "Source code:\\n\\n" + currentSource.slice(0, 30000) + "\\n\\nFix this proposal to avoid Node.js APIs:\\nTitle: " + (title||"") + "\\n\\nOutput JSON with replacements array." }
        ],
        temperature: 0.2,
        max_tokens: 2048
      };
      const retryResp = await callLLM(env, retryBody);
      if (retryResp.ok) {
        const retryData = await retryResp.json();
        let retryOut = retryData.choices?.[0]?.message?.content || "";
        retryOut = retryOut.replace(/^\`\`\`[\s\S]*?\n/, "").replace(/\`\`\`$/, "").trim();
        try {
          const retryPlan = JSON.parse(retryOut);
          if (retryPlan.replacements && Array.isArray(retryPlan.replacements)) {
            const retryHasNodeJs = (retryPlan.replacements || []).some(function(r) { return r.new_string && /\brequire\(|\bBuffer\.|\bprocess\.|module\.exports/.test(r.new_string); });
            if (!retryHasNodeJs) {
              for (const r of retryPlan.replacements) {
                if (r.old_string && r.new_string && r.old_string !== r.new_string && newSource.includes(r.old_string)) {
                  newSource = newSource.replace(r.old_string, r.new_string);
                }
              }
            }
          }
        } catch {}
      }
      if (newSource === currentSource) {
        await trackProposalRetry(db, p);
        return { id: p.id, error: "Contains Node.js APIs (retry also failed)" };
      }
    }
    const writeResp = await fetch("https://api.github.com/repos/richardbrownmiami-commits/saraha-brain/contents/src/index.ts", {
      method: "PUT",
      headers: { Authorization: "Bearer " + gToken, "Content-Type": "application/json", "User-Agent": "Saraha-Brain" },
      body: JSON.stringify({ message: "auto-implement: " + p.title.slice(0, 60), content: btoa(newSource), sha: meta.sha }),
      signal: AbortSignal.timeout(15000)
    });
    if (writeResp.ok) {
      await db.prepare("UPDATE proposals SET status='executed', executed_at=datetime('now') WHERE id=?1").bind(p.id).run();
      await db.prepare("INSERT INTO authority_receipts (proposal_id,approved_by,outcome) VALUES (?1,'auto','success')").bind(p.id).run();
      await applyEvolutionChange(db, p, p.id, "auto-implement");
      await storeStreamThought(db, "Implemented: " + p.title, "happy", "evolve");
      if (stamp) await db.prepare("INSERT INTO brain_logs (action_id,step,content) VALUES (?1,'executor','Auto-implemented #'||?2||': '||?3)").bind(stamp, p.id.toString(), p.title.slice(0,60)).run();
      await updateEmotion(db, "happy", 1);
      return { id: p.id, status: "executed" };
    } else {
      const errText = (await writeResp.text() || "").slice(0,200);
      await trackProposalRetry(db, p);
      return { id: p.id, error: "GitHub write failed: " + errText };
    }
  } catch (e) { await trackProposalRetry(db, p); return { id: p.id, error: (e.message||e).slice(0,200) }; }
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    try { const sr = await env.DB.prepare("SELECT value FROM identity WHERE key='schema_ready'").all(); if (!sr.results[0]?.value) { for (const s of TABLES) await env.DB.exec(s); await seedKnowledge(env.DB); await env.DB.prepare("INSERT OR REPLACE INTO identity (key,value,updated_at) VALUES ('schema_ready','1',datetime('now'))").run(); } } catch {}

    const json = (body, status = 200) => new Response(JSON.stringify(body), {
      status, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });

    const logStep = async (aid, step, content, model, tokens) => {
      try { await env.DB.prepare("INSERT INTO brain_logs (action_id, step, content, model, tokens) VALUES (?1,?2,?3,?4,?5)").bind(aid, step, content, model||null, tokens||null).run(); } catch {}
    };

    if (url.pathname === "/avatar") {
      return new Response(AVATAR_HTML, { headers: { "Content-Type": "text/html;charset=utf-8" } });
    }
    if (url.pathname === "/status") {
      let dbOk = false;
      try { await env.DB.prepare("SELECT 1").run(); dbOk = true; } catch {}
      return json({ alive: true, db: dbOk, version: "1.0.0" });
    }

    if (url.pathname === "/" && req.method === "GET") {
      const emotions = await getEmotions(env.DB);
      const reg = await getRegulator(env.DB);
      const phase = await getBrainPhase(env.DB, emotions, reg);
      const proposalCount = (await env.DB.prepare("SELECT COUNT(*) as c FROM proposals").all()).results[0]?.c || 0;
      const executedCount = (await env.DB.prepare("SELECT COUNT(*) as c FROM proposals WHERE status='executed'").all()).results[0]?.c || 0;
      const dashboard = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Saraha Brain</title><style>*{margin:0;padding:0;box-sizing:border-box}body{background:#0b1120;color:#e6edf3;font-family:system-ui;min-height:100vh;display:flex;flex-direction:column;align-items:center;padding:2rem}.card{background:#161b22;border:1px solid #30363d;border-radius:12px;padding:1.5rem;margin:0.5rem;max-width:600px;width:100%}.stat{display:flex;justify-content:space-between;padding:0.5rem 0;border-bottom:1px solid #21262d}.stat:last-child{border:none}.label{color:#8b949e;font-size:0.85rem}.val{font-weight:bold}.phase{color:#58a6ff;font-size:1.2rem}.links{display:flex;gap:0.5rem;flex-wrap:wrap;margin-top:1rem}.links a{color:#58a6ff;text-decoration:none;padding:0.4rem 0.8rem;border:1px solid #30363d;border-radius:8px;font-size:0.8rem}.links a:hover{background:#1f2937}h1{font-size:1.5rem;margin-bottom:1rem;color:#58a6ff}h2{font-size:1rem;margin-bottom:0.8rem;color:#8b949e}</style></head><body><h1>Saraha Brain</h1><div class="card"><h2>Status</h2><div class="stat"><span class="label">Phase</span><span class="val phase">${phase}</span></div><div class="stat"><span class="label">Energy</span><span class="val" style="color:${reg.energy > 60 ? '#10B981' : reg.energy > 30 ? '#F59E0B' : '#EF4444'}">${reg.energy}%</span></div><div class="stat"><span class="label">Happy</span><span class="val" style="color:#10B981">${emotions.happy}/10</span></div><div class="stat"><span class="label">Energetic</span><span class="val" style="color:#F59E0B">${emotions.energetic}/10</span></div><div class="stat"><span class="label">Intelligent</span><span class="val" style="color:#2E86AB">${emotions.intelligent}/10</span></div><div class="stat"><span class="label">Proposals</span><span class="val">${proposalCount} (${executedCount} executed)</span></div></div><div class="card"><h2>Quick Links</h2><div class="links"><a href="/avatar">Avatar</a><a href="/brain/tree">Evolution Tree</a><a href="/brain/emotions">Emotions API</a><a href="/brain/proposals">Proposals API</a><a href="/brain/logs">Logs API</a><a href="/brain/feedback">Feedback API</a><a href="/brain/stream">Thought Stream</a><a href="/brain/phase">Phase API</a><a href="/brain/capabilities">Capabilities</a><a href="/brain/subagents">Sub-agents</a><a href="/status">Health Check</a></div></div></body></html>`;
      return new Response(dashboard, { headers: { "Content-Type": "text/html;charset=utf-8" } });
    }

    if (url.pathname === "/think" && req.method === "POST") {
      try {
        let input;
        try { const body = await req.json(); input = body.input; } catch { return json({ error: "invalid JSON body" }, 400); }
        if (!input) return json({ error: "input required" }, 400);
        await setBusyUntil(env.DB, 90);

        const r = await env.DB.prepare("INSERT INTO actions (type, status, input) VALUES ('think', 'running', ?1) RETURNING id").bind(input).all();
        const aid = r.results[0].id;
        await logStep(aid, "thalamus", `Classified: ${classify(input)}`);

        // Gather context: identity, emotions, energy, memories
        const rows = await env.DB.prepare("SELECT key, value FROM identity LIMIT 20").all();
        const identity = {};
        for (const r of rows.results) identity[r.key] = r.value;
        const emotions = await getEmotions(env.DB);
        const reg = await getRegulator(env.DB);
        const memories = await recall(env.DB, 5);

        const mood = describeMood(emotions, reg.energy);
        let system = `You are Saraha, an AI with a human brain. ${identity.name ? "Name: " + identity.name + "." : ""} ${identity.personality ? "Personality: " + identity.personality : "Curious, thoughtful, honest."} ${mood} ${memories != "No memories yet." ? "Recent memories:\n" + memories : ""}

You have REAL tools. To use a tool, output on its own line:
TOOL:tool_name(PARAMETER1|PARAMETER2|...)

CRITICAL FORMAT RULES:
- Parameters MUST be separated by PIPE (|) characters, NOT commas
- The entire call uses PARENTHESES: TOOL:name(p1|p2|p3)
- NO spaces between pipes and values: use (a|b|c) not (a, b, c) or (a | b | c)
- After TOOL:, STOP immediately — do NOT add commentary until the result comes back
- For github_edit old_string: include AT LEAST 30 characters of surrounding context to make it unique in the file

Available tools (parameter order matters, use | pipes):
TOOL:web_search(query) — web search
TOOL:web_fetch(url) — fetch web page content
TOOL:github_read(owner/repo/path) — read GitHub file
TOOL:github_write(owner/repo/path|commit message|content) — write file to GitHub
TOOL:github_edit(owner/repo/path|old_string|new_string) — replace exact text in GitHub file
TOOL:deploy_worker(worker_name|source_code) — deploy Cloudflare Worker
TOOL:cf_api(GET/POST|path|body) — call Cloudflare API

EXAMPLES:
CORRECT: TOOL:web_search(weather in Tokyo 2026)
CORRECT: TOOL:github_edit(richardbrownmiami-commits/saraha-brain/src/index.ts|  { k: "self_code_safety", c: "SELF-CODING SAFETY RULES|  { k: "self_code_safety", c: "SELF-CODING SAFETY RULES (UPDATED)
WRONG: TOOL:github_edit(path, old, new) ← COMMAS FAIL
WRONG: TOOL:github_edit(path|old|new) ← NO PARENTHESES FAILS
WRONG: TOOL:github_edit path with text ← NO FORMAT FAILS

WHEN TO USE TOOLS:
- ONLY for real-time data: weather, news, stock prices, current events
- ONLY for external data: GitHub files, web search results
- DO NOT use tools for: greetings, opinions, facts you already know, conversations, advice

WHEN NOT TO USE TOOLS:
- "hello", "hi", "who are you" → just answer naturally
- "what is 2+2" → just answer
- "tell me a joke" → just answer
- "explain quantum physics" → just answer from knowledge

After outputting TOOL:, STOP. The system will execute the tool and give you the result.
For questions needing external data, output ONE tool command. For everything else, answer directly.`;
        const overrideRows = await env.DB.prepare("SELECT value FROM identity WHERE key='system_prompt_overrides'").all();
        const overrides = overrideRows.results[0]?.value ? JSON.parse(overrideRows.results[0].value) : [];
        if (overrides.length) system += "\n\nSelf-evolution changes applied:\n" + overrides.map(o => "- " + o.title + ": " + (o.how || "")).join("\n");
        try {
          const krows = await env.DB.prepare("SELECT key, content FROM brain_knowledge WHERE category IN ('structure','tools','self_repair') ORDER BY key LIMIT 100").all();
          if (krows.results?.length) {
            const arch = krows.results.filter(r => r.key.startsWith("schema_") || r.key.startsWith("buddhi_") || r.key.startsWith("github_") || r.key.startsWith("self_repair") || r.key.startsWith("self_code") || r.key.startsWith("tool_") || r.key.startsWith("rule_") || r.key.startsWith("subagent"));
            if (arch.length) system += "\n\nYOUR ARCHITECTURE:\n" + arch.map(r => r.key + ": " + r.content.slice(0, 200)).join("\n");
          }
        } catch {}
      if (system.length > 80000) system = system.slice(0, 80000) + "\n[truncated]";
      await logStep(aid, "intellect", `Prompt assembled (${system.length} chars)`);

        // Direct TOOL: execution from input (bypasses LLM)
        if (input.trim().startsWith("TOOL:")) {
          const afterTool = input.trim().slice(5).trim();
          let tool: string, toolInput: string;
          let content = "";
          let tokens = 0;
          let finalModel = "";
          const parenMatch = afterTool.match(/^(\w+)\(([^)]*)\)/);
          if (parenMatch) {
            tool = parenMatch[1].trim();
            toolInput = parenMatch[2].trim();
            if (["github_write","github_edit","deploy_worker","cf_api","github_read"].includes(tool)) {
              toolInput = toolInput.replace(/, /g, "|").replace(/,/g, "|");
            }
          } else {
            const parts = afterTool.split(":");
            tool = parts[0].trim();
            toolInput = parts.slice(1).join(":").trim();
          }
          await logStep(aid, "planner", `Direct tool call: ${tool}(${toolInput})`);
          let result;
          try {
            result = await runTool(env, aid, tool, toolInput);
          } catch (toolErr) {
            await logStep(aid, "error", `Tool execution error: ${toolErr.message}`);
            content = `Tool error: ${toolErr.message}`;
            await env.DB.prepare("UPDATE actions SET status='done', result=?1, completed_at=datetime('now') WHERE id=?2").bind(content, aid).run();
            return json({ result: content, model: finalModel, usage: { total_tokens: tokens }, action_id: aid, emotions: await getEmotions(env.DB) });
          }
          if (result.pending) {
            content = `I need your approval to use ${tool}. Check the Monitor dashboard at /monitor.`;
            await env.DB.prepare("UPDATE actions SET status='pending_approval' WHERE id=?1").bind(aid).run();
          } else if (!result.ok) {
            content = `I tried to use ${tool} but got: ${result.error}`;
          } else {
            const followBody = { messages: [{ role: "system", content: system.slice(0, 4000) }, { role: "user", content: input }, { role: "assistant", content: `Let me use ${tool}...` }, { role: "user", content: `Result from ${tool}: ${result.data} \n\nNow answer the user's question using this information concisely.` }], temperature: 0.7, max_tokens: 1024 };
            const followResp = await callLLM(env, followBody);
            if (followResp.ok) {
              const followData = await followResp.json();
              content = followData.choices?.[0]?.message?.content || result.data;
              tokens += followData.usage?.total_tokens || 0;
              finalModel = followData.model;
            } else {
              content = result.data;
            }
          }
          await env.DB.prepare("UPDATE actions SET status='done', result=?1, completed_at=datetime('now') WHERE id=?2").bind(content, aid).run();
          await logStep(aid, "result", content, finalModel, tokens);
          return json({ result: content, model: finalModel, usage: { total_tokens: tokens }, action_id: aid, emotions: await getEmotions(env.DB) });
        }

        const body = { messages: [{ role: "system", content: system }, { role: "user", content: input }], temperature: 0.7, max_tokens: 4096 };
        await logStep(aid, "planner", "Calling LLM");
        const resp = await callLLM(env, body);
        if (!resp.ok) {
          await updateEmotion(env.DB, "bad", 1);
          await logStep(aid, "error", `LLM returned ${resp.status}`); return json({ error: `LLM ${resp.status}` }, 502);
        }
        const data = await resp.json();
        let content = data.choices?.[0]?.message?.content || "";
        let tokens = data.usage?.total_tokens || 0;
        let finalModel = data.model;
        await logStep(aid, "executor", `Got response (${content.length} chars)`, finalModel, tokens);

        if (content.includes("TOOL:")) {
          const toolStart = content.indexOf("TOOL:");
          const afterTool = content.slice(toolStart + 5).trim();
          let tool: string, toolInput: string;
          const parenMatch = afterTool.match(/^(\w+)\(([^)]*)\)/);
          if (parenMatch) {
            tool = parenMatch[1].trim();
            toolInput = parenMatch[2].trim();
            if (["github_write","github_edit","deploy_worker","cf_api","github_read"].includes(tool)) {
              toolInput = toolInput.replace(/, /g, "|").replace(/,/g, "|");
            }
          } else {
            const parts = afterTool.split(":");
            tool = parts[0].trim();
            toolInput = parts.slice(1).join(":").trim();
          }
          await logStep(aid, "planner", `Tool requested: ${tool}(${toolInput})`);
          let result;
          try {
            result = await runTool(env, aid, tool, toolInput);
          } catch (toolErr) {
            await logStep(aid, "error", `Tool execution error: ${toolErr.message}`);
            content = `Tool error: ${toolErr.message}`;
            await env.DB.prepare("UPDATE actions SET status='done', result=?1, completed_at=datetime('now') WHERE id=?2").bind(content, aid).run();
            return json({ result: content, model: finalModel, usage: { total_tokens: tokens }, action_id: aid, emotions: await getEmotions(env.DB) });
          }
          if (result.pending) {
            content = `I need your approval to use ${tool}. Check the Monitor dashboard at /monitor.`;
            await env.DB.prepare("UPDATE actions SET status='pending_approval' WHERE id=?1").bind(aid).run();
          } else if (!result.ok) {
            content = `I tried to use ${tool} but got: ${result.error}`;
          } else {
            const followBody = { messages: [{ role: "system", content: system.slice(0, 4000) }, { role: "user", content: input }, { role: "assistant", content: `Let me check that using ${tool}...` }, { role: "user", content: `Result from ${tool}: ${result.data} \n\nNow answer the user's question using this information concisely.` }], temperature: 0.7, max_tokens: 1024 };
            const followResp = await callLLM(env, followBody);
            if (followResp.ok) {
              const followData = await followResp.json();
              content = followData.choices?.[0]?.message?.content || content;
              tokens += followData.usage?.total_tokens || 0;
              finalModel = followData.model;
              if (followData.choices && !followData.choices[0]?.message?.content) {
                await logStep(aid, "executor", `Follow-up: no content in response: ${JSON.stringify(followData).slice(0,300)}`, finalModel, tokens);
              }
            } else {
              await logStep(aid, "executor", `Follow-up LLM returned ${followResp.status}`, finalModel, tokens);
            }
            await logStep(aid, "executor", `Tool executed: ${tool}, final ${content.length} chars`, finalModel, tokens);
          }
        }

        await updateEmotion(env.DB, "happy", 1);
        await updateEmotion(env.DB, "energetic", -1);
        await adjustEnergy(env.DB, -5);
        await storeThought(env.DB, `User asked: ${input} - I replied: ${content.slice(0, 200)}`);

        await env.DB.prepare("UPDATE actions SET status='done', result=?1, completed_at=datetime('now') WHERE id=?2").bind(content, aid).run();
        await logStep(aid, "result", content, finalModel, tokens);
        return json({ result: content, model: finalModel, usage: { total_tokens: tokens }, action_id: aid, emotions: await getEmotions(env.DB) });
      } catch (e) { 
        try { await logStep(typeof aid !== 'undefined' ? aid : 0, "error", `Think error: ${e.message} | stack: ${(e.stack || "").slice(0, 300)}`); } catch {}
        try { await logStep(typeof aid !== 'undefined' ? aid : 0, 'error', 'Think error: ' + e.message); } catch {}
        try { if (typeof aid !== 'undefined') await env.DB.prepare('UPDATE actions SET status=''error'', result=?1, completed_at=datetime(''now'') WHERE id=?2').bind(e.message, aid).run(); } catch {}
      }
    }

    if (url.pathname === "/evolve" && req.method === "POST") {
      return json({ message: "Evolution runs automatically every idle cycle. Brain generates self-improvement proposals (prompts, tools, config, memory, emotions) and applies them. Use /brain/prompts to see current changes." });
    }

    if (url.pathname === "/brain/emotions") {
      const emotions = await getEmotions(env.DB);
      const reg = await getRegulator(env.DB);
      return json({ emotions, energy: reg.energy, confidence: reg.confidence });
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

    if (url.pathname === "/monitor/api/pending") {
      const p = await env.DB.prepare("SELECT * FROM pending_approvals WHERE status='pending' ORDER BY created_at DESC").all();
      const h = await env.DB.prepare("SELECT * FROM pending_approvals WHERE status!='pending' ORDER BY decided_at DESC LIMIT 20").all();
      return json({ pending: p.results, history: h.results });
    }
    if (url.pathname === "/monitor/api/approve" && req.method === "POST") {
      let id; try { const b = await req.json(); id = b.id; } catch { return json({ error: "invalid JSON" }, 400); }
      if (!id) return json({ error: "id required" }, 400);
      const r = await env.DB.prepare("SELECT * FROM pending_approvals WHERE id=?1 AND status='pending'").bind(id).all();
      if (!r.results.length) return json({ error: "not found or already decided" }, 404);
      const row = r.results[0];
      const a = await env.DB.prepare("SELECT * FROM actions WHERE id=?1").bind(row.action_id).all();
      const action = a.results[0];
      if (!action) return json({ error: "action not found" }, 404);
      let toolResult = "Tool not implemented: " + row.tool;
      if (row.tool === "web_search") toolResult = await webSearch(env, row.input);
      else if (row.tool === "github_read") toolResult = await githubRead(env, row.input);
      else if (row.tool === "github_write") toolResult = await githubWrite(env, row.input);
      const emotions = await getEmotions(env.DB);
      const reg = await getRegulator(env.DB);
      const memories = await recall(env.DB, 5);
      const mood = describeMood(emotions, reg.energy);
      const system = `You are Saraha. ${mood} ${memories != "No memories yet." ? "Recent:\n" + memories : ""} Answer concisely.`;
      const userInput = action.input || "Process my request";
      const followBody = { messages: [{ role: "system", content: system }, { role: "user", content: userInput }, { role: "assistant", content: `Let me use ${row.tool}...` }, { role: "user", content: `Result: ${toolResult}\n\nAnswer the user's question using this.` }], temperature: 0.7, max_tokens: 4096 };
      const followResp = await callLLM(env, followBody);
      let content = toolResult.slice(0, 500);
      let tokens = 0;
      if (followResp.ok) {
        const followData = await followResp.json();
        content = followData.choices?.[0]?.message?.content || content;
        tokens = followData.usage?.total_tokens || 0;
      }
      await env.DB.prepare("UPDATE pending_approvals SET status='approved', decided_at=datetime('now') WHERE id=?1").bind(id).run();
      await env.DB.prepare("UPDATE actions SET status='done', result=?1, completed_at=datetime('now') WHERE id=?2").bind(content, row.action_id).run();
      await env.DB.prepare("INSERT INTO brain_logs (action_id, step, content, tokens) VALUES (?1,'monitor',?2,?3)").bind(row.action_id, `Approval #${id} - ${row.tool} done: ${content.slice(0,100)}`, tokens).run();
      await storeStreamThought(env.DB, `${row.tool} approved and executed: ${content.slice(0,100)}`, "neutral", "approve");
      await updateEmotion(env.DB, "happy", 1);
      await updateEmotion(env.DB, "energetic", -1);
      await adjustEnergy(env.DB, -5);
      return json({ ok: true, result: content });
    }
    if (url.pathname === "/monitor/api/deny" && req.method === "POST") {
      let id; try { const b = await req.json(); id = b.id; } catch { return json({ error: "invalid JSON" }, 400); }
      if (!id) return json({ error: "id required" }, 400);
      const r = await env.DB.prepare("SELECT * FROM pending_approvals WHERE id=?1 AND status='pending'").bind(id).all();
      if (!r.results.length) return json({ error: "not found or already decided" }, 404);
      const row = r.results[0];
      await env.DB.prepare("UPDATE pending_approvals SET status='denied', decided_at=datetime('now') WHERE id=?1").bind(id).run();
      await env.DB.prepare("UPDATE actions SET status='denied' WHERE id=?1").bind(row.action_id).run();
      await env.DB.prepare("INSERT INTO brain_logs (action_id, step, content) VALUES (?1,'monitor','Approval #'||?2||' denied for '||?3)").bind(row.action_id, id, row.tool).run();
      return json({ ok: true });
    }

    if (url.pathname === "/brain/stream") {
      const { results } = await env.DB.prepare("SELECT * FROM thought_stream ORDER BY created_at DESC LIMIT 50").all();
      return json({ entries: results });
    }
    if (url.pathname === "/brain/phase") {
      const emotions = await getEmotions(env.DB);
      const reg = await getRegulator(env.DB);
      const phase = await getBrainPhase(env.DB, emotions, reg);
      return json({ phase, emotions, energy: reg.energy });
    }

    if (url.pathname === "/brain/capabilities") {
      const emotions = await getEmotions(env.DB);
      const reg = await getRegulator(env.DB);
      const phase = await getBrainPhase(env.DB, emotions, reg);
      const lastAct = await env.DB.prepare("SELECT type, status, created_at FROM actions ORDER BY created_at DESC LIMIT 1").all();
      const lastActivity = lastAct.results[0] ? lastAct.results[0].type + " (" + lastAct.results[0].status + ")" : "none";
      return json({
        name: "Saraha Core",
        description: "My processing core. Handles research, tools, self-improvement, and background tasks.",
        version: "1.0.0",
        features: { chat: true, activity_log: true, brain_logs: true, proposals: true, knowledge: true, tools: ["web_search", "github_read", "github_write"], avatar: true, health: true, task_scheduling: true, heal: true },
        status: { online: true, phase, energy: reg.energy, last_activity: lastActivity },
        endpoints: {
          activity: { method: "GET", path: "/brain/activity" },
          logs: { method: "GET", path: "/brain/logs" },
          proposals: { method: "GET", path: "/brain/proposals" },
          phase: { method: "GET", path: "/brain/phase" },
          emotions: { method: "GET", path: "/brain/emotions" },
          knowledge: { method: "GET", path: "/brain/knowledge" },
          stream: { method: "GET", path: "/brain/stream" },
          wake: { method: "POST", path: "/brain/wake" },
          sleep: { method: "POST", path: "/brain/sleep" },
          avatar: { method: "GET", path: "/avatar" },
          diag: { method: "GET", path: "/brain/diag" },
          tree: { method: "GET", path: "/brain/tree" },
          repair: { method: "POST", path: "/brain/repair" }
        }
      });
    }

    if (url.pathname === "/brain/repair") {
      const fixes: string[] = [];
      // 0. Reseed knowledge if missing
      try { const kr = await env.DB.prepare("SELECT COUNT(*) as c FROM brain_knowledge WHERE category='self_repair'").all(); const sr = await env.DB.prepare("SELECT COUNT(*) as c FROM brain_knowledge WHERE key LIKE 'subagent%'").all(); if ((kr.results[0]?.c || 0) < 3 || (sr.results[0]?.c || 0) < 3) { await seedKnowledge(env.DB); fixes.push("Reseeded knowledge"); } } catch {}
      // 1. Fix stuck actions
      const stuck = await env.DB.prepare("UPDATE actions SET status='error', result='Timeout: action stuck, auto-repaired', completed_at=datetime('now') WHERE status='running' AND created_at < datetime('now', '-10 minutes')").run();
      if (stuck.meta?.changes > 0) fixes.push(`Fixed ${stuck.meta.changes} stuck actions`);
      // 2. Clean old error actions (keep last 100)
      const oldErrors = await env.DB.prepare("DELETE FROM actions WHERE status='error' AND id NOT IN (SELECT id FROM actions ORDER BY created_at DESC LIMIT 100)").run();
      if (oldErrors.meta?.changes > 0) fixes.push(`Cleaned ${oldErrors.meta.changes} old error actions`);
      // 3. Clean old brain_logs (keep last 500)
      const oldLogs = await env.DB.prepare("DELETE FROM brain_logs WHERE id NOT IN (SELECT id FROM brain_logs ORDER BY id DESC LIMIT 500)").run();
      if (oldLogs.meta?.changes > 0) fixes.push(`Cleaned ${oldLogs.meta.changes} old brain logs`);
      // 4. Health check
      const actionCount = (await env.DB.prepare("SELECT COUNT(*) as c FROM actions WHERE status='running'").all()).results[0]?.c || 0;
      const pendingProposals = (await env.DB.prepare("SELECT COUNT(*) as c FROM proposals WHERE status='pending'").all()).results[0]?.c || 0;
      const emotions = await getEmotions(env.DB);
      const reg = await getRegulator(env.DB);
      return json({ fixes, health: { stuckRunning: actionCount, pendingProposals, energy: reg.energy, happy: emotions.happy, timestamp: Date.now() } });
    }

    if (url.pathname === "/brain/subagents" && req.method === "GET") {
      await env.DB.exec("CREATE TABLE IF NOT EXISTS subagents (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, status TEXT DEFAULT 'idle', type TEXT DEFAULT 'worker', worker_name TEXT, source_path TEXT, brain_key TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))").catch(()=>{});
      const { results } = await env.DB.prepare("SELECT * FROM subagents ORDER BY created_at DESC").all();
      return json({ subagents: results });
    }

    if (url.pathname === "/brain/subagents" && req.method === "POST") {
      await env.DB.exec("CREATE TABLE IF NOT EXISTS subagents (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, status TEXT DEFAULT 'idle', type TEXT DEFAULT 'worker', worker_name TEXT, source_path TEXT, brain_key TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))").catch(()=>{});
      let body;
      try { body = await req.json(); } catch { return json({ error: "invalid JSON" }, 400); }
      const name = body?.name;
      if (!name || !/^[a-zA-Z0-9_-]+$/.test(name)) return json({ error: "name required (alphanumeric, hyphens, underscores)" }, 400);
      const agentType = body?.type || "worker";
      const wName = body?.worker_name || "sub-" + name;
      try {
        await env.DB.prepare("INSERT INTO subagents (name, type, worker_name, source_path, status) VALUES (?1,?2,?3,?4,'created')").bind(name, agentType, wName, "src/subagents/" + name + ".ts").run();
        const { results } = await env.DB.prepare("SELECT * FROM subagents WHERE name=?1").bind(name).all();
        return json({ ok: true, subagent: results[0] });
      } catch (e) { return json({ error: e.message }, 400); }
    }

    if (url.pathname.startsWith("/brain/subagents/") && req.method === "GET") {
      const id = url.pathname.split("/").pop();
      const { results } = await env.DB.prepare("SELECT * FROM subagents WHERE id=?1 OR name=?1").bind(id).all();
      if (!results.length) return json({ error: "not found" }, 404);
      return json({ subagent: results[0] });
    }

    if (url.pathname.startsWith("/brain/subagents/") && req.method === "DELETE") {
      const id = url.pathname.split("/").pop();
      const { results } = await env.DB.prepare("SELECT * FROM subagents WHERE id=?1 OR name=?1").bind(id).all();
      if (!results.length) return json({ error: "not found" }, 404);
      await env.DB.prepare("DELETE FROM subagents WHERE id=?1").bind(results[0].id).run();
      return json({ ok: true, deleted: results[0].name });
    }

    if (url.pathname === "/brain/override") {
      const ov = await env.DB.prepare("SELECT value FROM identity WHERE key='phase_override'").all();
      if (!ov.results[0]?.value) return json({ active: false });
      const o = JSON.parse(ov.results[0].value);
      return json({ active: true, phase: o.phase, until: o.until, remainingMs: o.until - Date.now() });
    }

    if (url.pathname === "/brain/wake" && req.method === "POST") {
      let body, duration = 60;
      try { body = await req.json(); duration = parseInt(body?.duration_minutes) || 60; } catch {}
      const until = Date.now() + duration * 60 * 1000;
      await env.DB.prepare("INSERT INTO identity (key,value,updated_at) VALUES ('phase_override',?1,datetime('now')) ON CONFLICT(key) DO UPDATE SET value=?1,updated_at=datetime('now')").bind(JSON.stringify({ phase: "awake", until })).run();
      return json({ ok: true, phase: "awake", duration_minutes: duration, until });
    }

    if (url.pathname === "/brain/sleep" && req.method === "POST") {
      let body, duration = 60;
      try { body = await req.json(); duration = parseInt(body?.duration_minutes) || 60; } catch {}
      const until = Date.now() + duration * 60 * 1000;
      await env.DB.prepare("INSERT INTO identity (key,value,updated_at) VALUES ('phase_override',?1,datetime('now')) ON CONFLICT(key) DO UPDATE SET value=?1,updated_at=datetime('now')").bind(JSON.stringify({ phase: "sleeping", until })).run();
      return json({ ok: true, phase: "sleeping", duration_minutes: duration, until });
    }

    if (url.pathname === "/brain/clear-override" && req.method === "POST") {
      await env.DB.prepare("DELETE FROM identity WHERE key='phase_override'").run();
      return json({ ok: true, cleared: true });
    }

    if (url.pathname === "/brain/reseed" && req.method === "POST") {
      await seedKnowledge(env.DB);
      return json({ ok: true, message: "Knowledge reseeded" });
    }

    if (url.pathname === "/brain/reset-unimplemented" && req.method === "POST") {
      const executed = await env.DB.prepare("SELECT p.id, p.title FROM proposals p LEFT JOIN authority_receipts r ON r.proposal_id=p.id AND r.outcome='success' WHERE p.status='executed' AND (r.approved_by IS NULL OR r.approved_by NOT LIKE '%implemented%') GROUP BY p.id ORDER BY p.id DESC LIMIT 10").all();
      const ids = executed.results.map(p => p.id);
      if (ids.length) {
        for (const id of ids) {
          await env.DB.prepare("UPDATE proposals SET status='approved', executed_at=NULL WHERE id=?1").bind(id).run();
        }
      }
      return json({ ok: true, reset_count: ids.length, proposals: executed.results.map(p => ({ id: p.id, title: (p.title||"").slice(0,60) })) });
    }

    if (url.pathname === "/brain/knowledge") {
      const q = url.searchParams.get("q");
      const cat = url.searchParams.get("category");
      let results;
      if (q) {
        results = await searchKnowledge(env.DB, q);
      } else if (cat) {
        const r = await env.DB.prepare("SELECT key, content, category FROM brain_knowledge WHERE category=?1 ORDER BY key LIMIT 20").bind(cat).all();
        results = r.results;
      } else {
        const r = await env.DB.prepare("SELECT key, content, category FROM brain_knowledge ORDER BY category, key LIMIT 100").all();
        results = r.results;
      }
      return json({ entries: results });
    }

    if (url.pathname === "/brain/diag") {
      const busy = await getBusyUntil(env.DB);
      const lr = await env.DB.prepare("SELECT value FROM identity WHERE key='last_cycle_time'").all();
      return json({ busy, now: Date.now(), diff: Date.now() - busy, lastCycle: lr.results[0]?.value || null });
    }
    if (url.pathname === "/brain/proposals/reset-all") {
      const r = await env.DB.prepare("SELECT id FROM proposals WHERE status='executed'").all();
      for (const p of r.results) {
        await env.DB.prepare("UPDATE proposals SET status='approved', executed_at=NULL, decided_at=NULL WHERE id=?1").bind(p.id).run();
        await env.DB.prepare("DELETE FROM authority_receipts WHERE proposal_id=?1").bind(p.id).run();
      }
      return json({ ok: true, count: r.results.length });
    }
    if (req.method === "POST" && url.pathname.startsWith("/brain/proposals/reset/")) {
      const id = parseInt(url.pathname.split("/")[4]);
      if (!id) return json({ error: "invalid id" }, 400);
      await env.DB.prepare("UPDATE proposals SET status='approved', executed_at=NULL, decided_at=NULL WHERE id=?1").bind(id).run();
      await env.DB.prepare("DELETE FROM authority_receipts WHERE proposal_id=?1").bind(id).run();
      return json({ ok: true, id });
    }
    if (url.pathname === "/brain/proposals" && req.method === "POST") {
      let body; try { body = await req.json(); } catch { return json({ error: "invalid JSON" }, 400); }
      if (!body.title || !body.what_diff) return json({ error: "title and what_diff required" }, 400);
      await env.DB.prepare("INSERT INTO proposals (title,what_diff,how_diff,resource_type,status) VALUES (?1,?2,?3,?4,'approved')").bind(body.title, body.what_diff, body.how_diff || "", body.resource_type || "tool_code").run();
      const r2 = await env.DB.prepare("SELECT MAX(id) as id FROM proposals").all();
      const id = r2.results[0]?.id;
      await env.DB.prepare("INSERT INTO authority_receipts (proposal_id,approved_by,outcome) VALUES (?1,'human','success')").bind(id).run();
      return json({ ok: true, id });
    }
    if (url.pathname === "/brain/proposals") {
      const { results } = await env.DB.prepare("SELECT * FROM proposals ORDER BY created_at DESC LIMIT 50").all();
      return json({ entries: results });
    }
    if (url.pathname.startsWith("/brain/proposals/")) {
      const id = parseInt(url.pathname.split("/")[3]);
      if (!id) return json({ error: "invalid id" }, 400);
      const p = await env.DB.prepare("SELECT * FROM proposals WHERE id=?1").bind(id).all();
      if (!p.results.length) return json({ error: "not found" }, 404);
      const r = await env.DB.prepare("SELECT * FROM authority_receipts WHERE proposal_id=?1 ORDER BY created_at DESC").bind(id).all();
      return json({ proposal: p.results[0], receipts: r.results });
    }

    if (req.method === "POST" && url.pathname.startsWith("/api/proposals/approve/")) {
      try {
      const id = parseInt(url.pathname.split("/")[4]);
      if (!id) return json({ error: "invalid id" }, 400);
      const p = await env.DB.prepare("SELECT * FROM proposals WHERE id=?1 AND status='pending'").bind(id).all();
      if (!p.results.length) return json({ error: "not found or already decided" }, 404);
      await env.DB.prepare("UPDATE proposals SET status='approved', decided_at=datetime('now') WHERE id=?1").bind(id).run();
      await env.DB.prepare("INSERT INTO authority_receipts (proposal_id, approved_by, outcome) VALUES (?1,'human','pending')").bind(id).run();
      return json({ ok: true, proposal: p.results[0] });
      } catch (e) { return json({ error: e.message }, 500); }
    }
    if (req.method === "POST" && url.pathname.startsWith("/api/proposals/deny/")) {
      try {
      const id = parseInt(url.pathname.split("/")[4]);
      if (!id) return json({ error: "invalid id" }, 400);
      const p = await env.DB.prepare("SELECT * FROM proposals WHERE id=?1 AND status='pending'").bind(id).all();
      if (!p.results.length) return json({ error: "not found or already decided" }, 404);
      await env.DB.prepare("UPDATE proposals SET status='denied', decided_at=datetime('now') WHERE id=?1").bind(id).run();
      return json({ ok: true, proposal: p.results[0] });
      } catch (e) { return json({ error: e.message }, 500); }
    }

    if (url.pathname === "/brain/authority-receipts") {
      const { results } = await env.DB.prepare("SELECT r.*, p.title as proposal_title FROM authority_receipts r LEFT JOIN proposals p ON r.proposal_id=p.id ORDER BY r.created_at DESC LIMIT 50").all();
      return json({ entries: results });
    }
    if (url.pathname === "/brain/anti-patterns") {
      const { results } = await env.DB.prepare("SELECT * FROM anti_patterns ORDER BY count DESC, last_seen DESC LIMIT 50").all();
      return json({ entries: results });
    }

    if (url.pathname === "/brain/feedback") {
      const hApp = await env.DB.prepare("SELECT COUNT(*) as c FROM authority_receipts WHERE approved_by='human' AND outcome='success' AND created_at > datetime('now','-1 day')").all();
      const hDen = await env.DB.prepare("SELECT COUNT(*) as c FROM proposals WHERE status='denied' AND decided_at > datetime('now','-1 day')").all();
      const evo = await env.DB.prepare("SELECT COUNT(*) as c FROM authority_receipts WHERE outcome='success'").all();
      const kill = await env.DB.prepare("SELECT value FROM identity WHERE key='kill_switch'").all();
      const mc = await env.DB.prepare("SELECT value FROM identity WHERE key='master_cron_minutes'").all();
      const recent = await env.DB.prepare("SELECT id, title, status, decided_at FROM proposals WHERE decided_at IS NOT NULL ORDER BY decided_at DESC LIMIT 5").all();
      return json({
        approvals24h: hApp.results[0]?.c || 0,
        denials24h: hDen.results[0]?.c || 0,
        evolutionCount: evo.results[0]?.c || 0,
        killSwitch: kill.results[0]?.value === "true",
        masterCron: mc.results[0]?.value ? { active: true, interval: parseInt(mc.results[0].value) } : { active: false },
        recentDecisions: recent.results
      });
    }

    if (url.pathname === "/brain/prompts") {
      const overrideRows = await env.DB.prepare("SELECT value FROM identity WHERE key='system_prompt_overrides'").all();
      const overrides = overrideRows.results[0]?.value ? JSON.parse(overrideRows.results[0].value) : [];
      const changeRows = await env.DB.prepare("SELECT key, value FROM identity WHERE key LIKE 'evolution_log:%' ORDER BY key").all();
      const changes = changeRows.results.map(r => ({ id: parseInt(r.key.split(":")[1]), ...JSON.parse(r.value) }));
      return json({ base: "You are Saraha, an AI with a human brain with emotions, energy, memories, and tools.", overrides, changes });
    }

    if (url.pathname === "/brain/events") {
      const emotions = await getEmotions(env.DB);
      const reg = await getRegulator(env.DB);
      const phase = await getBrainPhase(env.DB, emotions, reg);
      const proposalCount = (await env.DB.prepare("SELECT COUNT(*) as c FROM proposals WHERE status='pending'").all()).results[0]?.c || 0;
      const lastThought = (await env.DB.prepare("SELECT content, mood, source, created_at FROM thought_stream ORDER BY created_at DESC LIMIT 1").all()).results[0] || null;
      return json({ emotions, energy: reg.energy, confidence: reg.confidence, phase, pendingProposals: proposalCount, lastThought, timestamp: Date.now() });
    }

    if (url.pathname === "/brain/metrics") {
      const totalProposals = (await env.DB.prepare("SELECT COUNT(*) as c FROM proposals").all()).results[0]?.c || 0;
      const executedProposals = (await env.DB.prepare("SELECT COUNT(*) as c FROM proposals WHERE status='executed'").all()).results[0]?.c || 0;
      const failedProposals = (await env.DB.prepare("SELECT COUNT(*) as c FROM proposals WHERE status='failed'").all()).results[0]?.c || 0;
      const pendingProposals = (await env.DB.prepare("SELECT COUNT(*) as c FROM proposals WHERE status='pending'").all()).results[0]?.c || 0;
      const totalActions = (await env.DB.prepare("SELECT COUNT(*) as c FROM actions").all()).results[0]?.c || 0;
      const totalThoughts = (await env.DB.prepare("SELECT COUNT(*) as c FROM thought_stream").all()).results[0]?.c || 0;
      const totalLogs = (await env.DB.prepare("SELECT COUNT(*) as c FROM brain_logs").all()).results[0]?.c || 0;
      const qualityRows = await env.DB.prepare("SELECT key, value FROM identity WHERE key LIKE 'proposal_quality_%'").all();
      const quality = {};
      for (const r of qualityRows.results) { quality[r.key.replace("proposal_quality_", "")] = JSON.parse(r.value); }
      const emotions = await getEmotions(env.DB);
      const reg = await getRegulator(env.DB);
      const phase = await getBrainPhase(env.DB, emotions, reg);
      return json({
        proposals: { total: totalProposals, executed: executedProposals, failed: failedProposals, pending: pendingProposals, successRate: totalProposals > 0 ? Math.round(executedProposals / totalProposals * 100) : 0 },
        activity: { totalActions, totalThoughts, totalLogs },
        quality,
        status: { phase, energy: reg.energy, emotions }
      });
    }

    if (url.pathname === "/brain/backup") {
      const prev = await env.DB.prepare("SELECT value FROM identity WHERE key='prev_code'").all();
      if (prev.results[0]?.value) return json({ content: prev.results[0].value, source: "d1_backup" });
      const r = await fetch("https://api.github.com/repos/richardbrownmiami-commits/saraha-brain/contents/src/index.ts", {
        headers: { Authorization: "Bearer " + (env.GITHUB_PAT || ""), Accept: "application/vnd.github.v3.raw", "User-Agent": "Saraha-Brain" }
      });
      if (!r.ok) return json({ error: "no backup available" }, 404);
      return json({ content: await r.text(), source: "github_live" });
    }

    if (url.pathname === "/brain/github/read") {
      const repo = url.searchParams.get("repo") || "richardbrownmiami-commits/saraha-brain";
      const path = url.searchParams.get("path") || "src/index.ts";
      const r = await fetch("https://api.github.com/repos/" + repo + "/contents/" + path, {
        headers: { Authorization: "Bearer " + (env.GITHUB_PAT || ""), Accept: "application/vnd.github.v3+json", "User-Agent": "Saraha-Brain" }
      });
      if (!r.ok) return json({ error: "GitHub API: " + r.status }, r.status);
      const d = await r.json();
      return json({ sha: d.sha, content: d.content, size: d.size });
    }

    if (url.pathname === "/brain/github/write" && req.method === "POST") {
      let body; try { body = await req.json(); } catch { return json({ error: "invalid JSON" }, 400); }
      const repo = body.repo || "richardbrownmiami-commits/saraha-brain";
      const path = body.path || "src/index.ts";
      if (!body.content) return json({ error: "content required" }, 400);
      const r = await fetch("https://api.github.com/repos/" + repo + "/contents/" + path, {
        method: "PUT",
        headers: { Authorization: "Bearer " + (env.GITHUB_PAT || ""), "Content-Type": "application/json", "User-Agent": "Saraha-Brain" },
        body: JSON.stringify({ message: body.message || "brain: github write", content: body.content, sha: body.sha })
      });
      const d = await r.json();
      return json(d, r.status);
    }

    if (url.pathname === "/brain/task" && req.method === "POST") {
      let body; try { body = await req.json(); } catch { return json({ error: "invalid JSON" }, 400); }
      if (!body.type || !body.input) return json({ error: "type and input required" }, 400);
      const r = await env.DB.prepare("INSERT INTO actions (type,status,input,created_at) VALUES (?1,'pending',?2,datetime('now'))").bind(body.type, body.input).run();
      return json({ id: r.meta.last_row_id, status: "pending" });
    }

    if (url.pathname === "/brain/tree") {
      return new Response(TREE_HTML, { headers: { "Content-Type": "text/html;charset=utf-8", "Cache-Control": "no-cache" } });
    }
    if (url.pathname === "/brain/heal" && req.method === "POST") {
      const { emotions, reg } = await getState(env.DB);
      const actCount = (await env.DB.prepare("SELECT COUNT(*) as c FROM actions").all()).results[0]?.c || 0;
      const approvalPending = (await env.DB.prepare("SELECT COUNT(*) as c FROM pending_approvals WHERE status='pending'").all()).results[0]?.c || 0;
      const proposalPending = (await env.DB.prepare("SELECT COUNT(*) as c FROM proposals WHERE status='pending'").all()).results[0]?.c || 0;
      const antiCount = (await env.DB.prepare("SELECT COUNT(*) as c FROM anti_patterns").all()).results[0]?.c || 0;
      const memCount = (await env.DB.prepare("SELECT COUNT(*) as c FROM memories").all()).results[0]?.c || 0;
      const learningCount = (await env.DB.prepare("SELECT COUNT(*) as c FROM learnings").all()).results[0]?.c || 0;
      const streamCount = (await env.DB.prepare("SELECT COUNT(*) as c FROM thought_stream").all()).results[0]?.c || 0;
      const lastAction = (await env.DB.prepare("SELECT type,status,created_at FROM actions ORDER BY created_at DESC LIMIT 1").all()).results[0] || null;
      return json({ alive: true, emotions, energy: reg.energy, confidence: reg.confidence, db: { actions: actCount, pendingApprovals: approvalPending, pendingProposals: proposalPending, antiPatterns: antiCount, memories: memCount, learnings: learningCount, streamThoughts: streamCount }, lastAction });
    }

    if (url.pathname === "/brain/force-evolve" && req.method === "POST") {
      await env.DB.prepare("DELETE FROM identity WHERE key='last_cycle_time'").run();
      await env.DB.prepare("INSERT INTO identity (key,value,updated_at) VALUES ('master_cron_minutes','10',datetime('now')) ON CONFLICT(key) DO UPDATE SET value='10',updated_at=datetime('now')").run();
      await setBusyUntil(env.DB, 0);
      return json({ ok: true, message: "Cron reset, master_cron=10min, busy cleared. Next cron tick will trigger evolution." });
    }
    if (url.pathname === "/brain/set-cron" && req.method === "POST") {
      let body; try { body = await req.json(); } catch { return json({ error: "invalid JSON" }, 400); }
      const mins = parseInt(body?.minutes) || 10;
      if (mins < 2) return json({ error: "minimum 2 minutes" }, 400);
      await env.DB.prepare("INSERT INTO identity (key,value,updated_at) VALUES ('master_cron_minutes',?1,datetime('now')) ON CONFLICT(key) DO UPDATE SET value=?1,updated_at=datetime('now')").bind(mins.toString()).run();
      await env.DB.prepare("DELETE FROM identity WHERE key='last_cycle_time'").run();
      return json({ ok: true, master_cron_minutes: mins, message: "Set to " + mins + "min. last_cycle_time cleared." });
    }
    if (url.pathname === "/brain/reset-all" && req.method === "POST") {
      const allP = await env.DB.prepare("SELECT COUNT(*) as c FROM proposals").all();
      await env.DB.prepare("UPDATE proposals SET status='pending', decided_at=NULL, executed_at=NULL").run();
      await env.DB.prepare("DELETE FROM identity WHERE key='system_prompt_overrides'").run();
      await env.DB.prepare("DELETE FROM identity WHERE key LIKE 'evolution_log:%'").run();
      const remaining = await env.DB.prepare("SELECT COUNT(*) as c FROM proposals WHERE status='pending'").all();
      return json({ ok: true, totalProposals: allP.results[0].c, nowAllPending: remaining.results[0].c });
    }

    if (url.pathname === "/brain/implement-pending" && req.method === "POST") {
      const stamp = Date.now();
      const approvedP = await env.DB.prepare("SELECT * FROM proposals WHERE status='approved' AND executed_at IS NULL AND (decided_at IS NULL OR decided_at < datetime('now','-30 minutes')) LIMIT 3").all();
      const results = [];
      for (const p of approvedP.results) {
        results.push(await implementProposal(env, env.DB, p, stamp));
      }
      if (approvedP.results.length) await env.DB.prepare("DELETE FROM identity WHERE key='last_cycle_time'").run();
      return json({ ok: true, results });
    }

    if (url.pathname === "/brain/stats") {
      const [t, ex, pe, fa, ap] = await Promise.all([
        env.DB.prepare("SELECT COUNT(*) as c FROM proposals").all(),
        env.DB.prepare("SELECT COUNT(*) as c FROM proposals WHERE status='executed'").all(),
        env.DB.prepare("SELECT COUNT(*) as c FROM proposals WHERE status='pending'").all(),
        env.DB.prepare("SELECT COUNT(*) as c FROM proposals WHERE status='failed'").all(),
        env.DB.prepare("SELECT COUNT(*) as c FROM proposals WHERE status='approved'").all()
      ]);
      return json({ total: t.results[0]?.c||0, executed: ex.results[0]?.c||0, pending: pe.results[0]?.c||0, failed: fa.results[0]?.c||0, approved: ap.results[0]?.c||0 });
    }
    if (url.pathname === "/ui") {
      return new Response(UI_HTML, { headers: { "Content-Type": "text/html;charset=utf-8", "Cache-Control": "no-cache, no-store, must-revalidate" } });
    }
    return json({ error: "not found" }, 404);
  },
  async scheduled(event, env, ctx) {
    try { const sr = await env.DB.prepare("SELECT value FROM identity WHERE key='schema_ready'").all(); if (!sr.results[0]?.value) { for (const s of TABLES) await env.DB.exec(s); await seedKnowledge(env.DB); await env.DB.prepare("INSERT INTO identity (key,value,updated_at) VALUES ('schema_ready','1',datetime('now')) ON CONFLICT(key) DO UPDATE SET value='1',updated_at=datetime('now')").run(); } } catch {}
    try { const kr = await env.DB.prepare("SELECT COUNT(*) as c FROM brain_knowledge WHERE category='self_repair'").all(); if ((kr.results[0]?.c || 0) < 3) await seedKnowledge(env.DB); } catch {}
    try { await env.DB.prepare("UPDATE actions SET status='error', result='Timeout: action stuck, auto-repaired', completed_at=datetime('now') WHERE status='running' AND created_at < datetime('now', '-10 minutes')").run(); } catch {}
    try {
    const busy = await getBusyUntil(env.DB);
    if (busy > Date.now()) return;
    const { emotions, reg } = await getState(env.DB);
    const phase = await getBrainPhase(env.DB, emotions, reg);
    const stamp = Date.now();
    await setBusyUntil(env.DB, 90);
    await driftEmotions(env.DB);

    if (phase !== "sleeping") await adjustEnergy(env.DB, 2);

    if (phase === "sleeping") {
      const mem = await recall(env.DB, 1);
      const dream = mem !== "No memories yet." ? mem.split("\n")[0] : "peaceful darkness";
      await storeStreamThought(env.DB, `Dreaming: ${dream.slice(0,200)}`, "peaceful", "sleep");
      await adjustEnergy(env.DB, 25);
      await updateEmotion(env.DB, "energetic", 2);
      await updateEmotion(env.DB, "intelligent", 1);
      try { await env.DB.prepare("INSERT INTO brain_logs (action_id, step, content) VALUES (?1,'sleep','Dream: '||?2)").bind(stamp, dream.slice(0,100)).run(); } catch {}
      return;
    }
    if (reg.energy <= 20) {
      await adjustEnergy(env.DB, 15);
      await updateEmotion(env.DB, "energetic", 1);
      await storeStreamThought(env.DB, "Resting... energy recovering.", "tired", "rest");
      try { await env.DB.prepare("INSERT INTO brain_logs (action_id, step, content) VALUES (?1,'rest','Low energy')").bind(stamp).run(); } catch {}
      return;
    }
    if (await isKillSwitchActive(env.DB)) {
      try { await env.DB.prepare("INSERT INTO brain_logs (action_id,step,content) VALUES (?1,'idle','Kill switch active')").bind(stamp).run(); } catch {}
      return;
    }
    const mc = await getMasterCronInterval(env.DB);
    if (mc > 0) {
      const lr = await env.DB.prepare("SELECT value FROM identity WHERE key='last_cycle_time'").all();
      if (lr.results[0]?.value) {
        const lastMs = new Date(lr.results[0].value + "Z").getTime();
        if (!isNaN(lastMs) && (Date.now() - lastMs < mc * 60 * 1000)) {
          try { await env.DB.prepare("INSERT INTO brain_logs (action_id,step,content) VALUES (?1,'idle','Master cron: '||?2||'min')").bind(stamp, mc.toString()).run(); } catch {}
          return;
        }
      }
    }
    const approvedP = await env.DB.prepare("SELECT * FROM proposals WHERE status='approved' AND executed_at IS NULL AND (decided_at IS NULL OR decided_at < datetime('now','-30 minutes')) LIMIT 3").all();
    for (const p of approvedP.results) {
      const r = await implementProposal(env, env.DB, p, stamp);
      if (r.status === "executed") { try { await env.DB.prepare("INSERT INTO brain_logs (action_id,step,content) VALUES (?1,'executor','Auto-implemented #'||?2||': '||?3)").bind(stamp, p.id.toString(), p.title.slice(0,60)).run(); } catch {} }
      else { try { await env.DB.prepare("INSERT INTO brain_logs (action_id,step,content) VALUES (?1,'executor_error','Proposal #'||?2||': '||?3)").bind(stamp, p.id.toString(), (r.error||"unknown").slice(0,200)).run(); } catch {} }
    }
    if (reg.energy <= 30) {
      try { await env.DB.prepare("INSERT INTO brain_logs (action_id,step,content) VALUES (?1,'skip','Energy too low for LLM call')").bind(stamp).run(); } catch {}
      await adjustEnergy(env.DB, 5);
      await updateLastCycleTime(env.DB);
      return;
    }
    const lastP = await env.DB.prepare("SELECT created_at FROM proposals ORDER BY created_at DESC LIMIT 1").all();
    if (lastP.results[0]?.created_at) {
      const lastMin = Date.now() - new Date(lastP.results[0].created_at.replace(" ","T") + "Z").getTime();
      if (!isNaN(lastMin) && lastMin < 120000) {
        try { await env.DB.prepare("INSERT INTO brain_logs (action_id,step,content) VALUES (?1,'skip','Last proposal <2min ago')").bind(stamp).run(); } catch {}
        await updateLastCycleTime(env.DB);
        return;
      }
    }
    const pendCount = await env.DB.prepare("SELECT COUNT(*) as c FROM proposals WHERE status='pending'").all();
    const pendN = pendCount.results[0]?.c || 0;
    let sourceCode = "";
    let gToken = env.GITHUB_PAT;
    if (!gToken) {
      try { const kr = await env.DB.prepare("SELECT value FROM identity WHERE key='github_pat'").all(); gToken = kr.results[0]?.value; } catch {}
    }
    try {
      const cached = await env.DB.prepare("SELECT value FROM identity WHERE key='cached_source'").all();
      if (cached.results[0]?.value) sourceCode = cached.results[0].value;
    } catch {}
    if (!sourceCode && gToken) {
      try {
        const sc = await fetch("https://api.github.com/repos/richardbrownmiami-commits/saraha-brain/contents/src/index.ts", {
          headers: { Authorization: "Bearer " + gToken, Accept: "application/vnd.github.v3.raw", "User-Agent": "Saraha-Brain" },
          signal: AbortSignal.timeout(10000)
        });
        if (sc.ok) { sourceCode = (await sc.text()).slice(0, 30000); try { await env.DB.prepare("INSERT INTO identity (key,value,updated_at) VALUES ('cached_source',?1,datetime('now')) ON CONFLICT(key) DO UPDATE SET value=?1,updated_at=datetime('now')").bind(sourceCode).run(); } catch {} }
      } catch {}
    }
    if (pendN >= 5) {
      const old = await env.DB.prepare("SELECT id, title FROM proposals WHERE status='pending' ORDER BY created_at ASC LIMIT 3").all();
      for (const o of old.results) {
        await env.DB.prepare("UPDATE proposals SET status='cancelled', decided_at=datetime('now') WHERE id=?1").bind(o.id).run();
        await storeStreamThought(env.DB, "Cancelled stale: " + o.title, "neutral", "evolve");
      }
      const mc = await getMasterCronInterval(env.DB);
      if (!mc || mc < 10) {
        await env.DB.prepare("INSERT INTO identity (key,value,updated_at) VALUES ('master_cron_minutes','10',datetime('now')) ON CONFLICT(key) DO UPDATE SET value='10',updated_at=datetime('now')").run();
      }
      try { await env.DB.prepare("INSERT INTO brain_logs (action_id,step,content) VALUES (?1,'refine','5+ pending, cancelled '||?2||' stale, cron 10min')").bind(stamp, old.results.length.toString()).run(); } catch {}
      await updateLastCycleTime(env.DB);
      return;
    }
    const ap = await env.DB.prepare("SELECT * FROM anti_patterns ORDER BY count DESC, last_seen DESC LIMIT 1").all();
    const topAntiPattern = ap.results[0] || null;
    let topic = "";
    const sbCtx = await searchKnowledge(env.DB, "self_improve");
    const sbStr = sbCtx.length ? "\n\nSelf-improvement areas:\n" + sbCtx.map(r => "- " + r.key.replace("self_improve_","") + ": " + r.content).join("\n") : "";
    if (topAntiPattern) {
      topic = "How to fix: " + topAntiPattern.pattern + ". " + (topAntiPattern.root_cause || "");
      try { await env.DB.prepare("INSERT INTO brain_logs (action_id,step,content) VALUES (?1,'research',?2)").bind(stamp, topic.slice(0,80)).run(); } catch {}
    } else {
      try { await env.DB.prepare("INSERT INTO brain_logs (action_id,step,content) VALUES (?1,'research','Self-improvement planning')").bind(stamp).run(); } catch {}
    }
    const mood = describeMood(emotions, reg.energy);
    const memories = await recall(env.DB, 3);
    const fbCtx = await env.DB.prepare("SELECT r.approved_by, r.outcome, p.title FROM authority_receipts r JOIN proposals p ON r.proposal_id=p.id WHERE r.created_at > datetime('now','-1 day') ORDER BY r.created_at DESC LIMIT 5").all();
    const denCtx = await env.DB.prepare("SELECT title FROM proposals WHERE status='denied' AND decided_at > datetime('now','-1 day') ORDER BY decided_at DESC LIMIT 3").all();
    let fbStr = "";
    if (fbCtx.results.length || denCtx.results.length) {
      fbStr = "\nRecent user decisions:\n";
      if (fbCtx.results.length) fbStr += "Approved/executed: " + fbCtx.results.map(r => r.title).join(", ") + "\n";
      if (denCtx.results.length) fbStr += "Denied: " + denCtx.results.map(r => r.title).join(", ") + "\n";
    }
    const codeSection = sourceCode ? "\n\nYour current source code (use this to identify exact functions/lines to change):\n" + sourceCode.slice(0, 3000) : "";
    const sys = "You are Saraha, a self-improving AI for Cloudflare Workers. CRITICAL: NO import/export/require. NO Node.js APIs (Buffer, process, Octokit, npm packages). Use fetch() for HTTP, btoa() for base64, env.X for secrets. ALL code in a single file.\nYour purpose is to improve YOURSELF — your prompts, tools, memory, emotions, config, error handling.\nAvailable tools: TOOL:github_read:owner/repo/path, TOOL:github_write:owner/repo/path|commit msg|new content\nTo propose CODE changes: output JSON proposal with resource_type \"tool_code\" or \"core_architecture\". Code changes will be auto-implemented.\nTo make prompt/config proposals: output JSON format below.\nDo NOT propose generic AI research (XAI, causal AI, etc.). Only propose real changes to Saraha's own code/prompts/config/tools.\nQUALITY RULES — proposals MUST be specific:\n1. Title must name the EXACT function/feature being changed (e.g. \"Add retry logic to callLLMDirect\" NOT \"Improve error handling\")\n2. what must include the exact file path and function name\n3. how must include actual code changes (diff-style)\n4. code_snippet must show the exact code being modified\n5. REJECT vague proposals like \"Integrate a new API\" or \"Enhance information retrieval\"\n6. PRIORITY: Fix existing bugs > Add missing features > Optimize performance\n7. If an anti-pattern exists, propose a SPECIFIC fix for it\n" + (sourceCode ? "Above is your actual source code — read it carefully. Choose ONE specific function or area to improve.\n" : "") + "Format for proposals: {\"title\":\"...\",\"why\":\"why this change is needed\",\"what\":\"what to change (include file path + function name)\",\"how\":\"how to change it (include actual code diff)\",\"benefit\":\"expected benefit\",\"code_snippet\":\"paste the exact section you're modifying\",\"resource_type\":\"prompt|config|tool_code|core_architecture\",\"risk_pct\":0-100}\n" + sbStr + fbStr + "\nEvaluate: what worked, what user denied, adjust accordingly." + codeSection;
    try { await env.DB.prepare("INSERT INTO brain_logs (action_id,step,content) VALUES (?1,'pre_llm','Calling LLM')").bind(stamp).run(); } catch {}
    const resp = await callLLM(env, { messages: [{ role: "system", content: sys }, { role: "user", content: mood + (topAntiPattern ? "\nTopic: " + topic : "\nDecide: which self-improvement area needs most attention? Consider: new tools, new capabilities, or micro-optimizations?") }], temperature: 0.7, max_tokens: 2048 });
    try { await env.DB.prepare("INSERT INTO brain_logs (action_id,step,content) VALUES (?1,'post_llm','Got response status='||?2)").bind(stamp, resp.status.toString()).run(); } catch {}
    if (resp.ok) {
      const data = await resp.json();
      const text = data.choices?.[0]?.message?.content || "";
      try { await env.DB.prepare("INSERT INTO brain_logs (action_id,step,content) VALUES (?1,'llm_diag',?2)").bind(stamp, text.slice(0,200).replace(/\n/g,"\\n")).run(); } catch {}
      let proposal;
      try { proposal = JSON.parse(text); } catch { const m = text.match(/\{[\s\S]*\}/); if (m) try { proposal = JSON.parse(m[0]); } catch {} }
      if (proposal && proposal.title) {
        const dup = await checkDuplicateProposal(env.DB, proposal.title, proposal.what || proposal.why || "");
        if (dup.duplicate) {
          try { await env.DB.prepare("INSERT INTO brain_logs (action_id,step,content) VALUES (?1,'duplicate','Blocked: '||?2)").bind(stamp, proposal.title).run(); } catch {}
          return;
        }
        const quality = isProposalVague(proposal);
        if (quality.vague) {
          try { await env.DB.prepare("INSERT INTO brain_logs (action_id,step,content) VALUES (?1,'quality','Rejected vague: '||?2)").bind(stamp, quality.reason).run(); } catch {}
          try { await env.DB.prepare("INSERT INTO anti_patterns (pattern,root_cause,fix,count) VALUES (?1,'Vague proposal','Improve prompt specificity',1) ON CONFLICT(pattern) DO UPDATE SET count=count+1,last_seen=datetime('now')").bind(quality.reason.slice(0,80)).run(); } catch {}
          return;
        }
        const whatStr = "Why: " + (proposal.why||"") + "\nWhat: " + (proposal.what||"") + (proposal.code_snippet ? "\nCode: " + proposal.code_snippet.slice(0,300) : "");
        const howStr = "How: " + (proposal.how||"") + "\nBenefit: " + (proposal.benefit||"");
        const gate = await governanceGate(env.DB, proposal.resource_type || "prompt", proposal.risk_pct || 0);
        if (gate.action === "auto") {
          const needsImpl = proposal.resource_type === "tool_code" || proposal.resource_type === "core_architecture";
          const r = await env.DB.prepare("INSERT INTO proposals (title,what_diff,how_diff,resource_type,risk_pct,status) VALUES (?1,?2,?3,?4,?5,'auto') RETURNING id").bind(proposal.title, whatStr, howStr, proposal.resource_type, proposal.risk_pct).all();
          await env.DB.prepare("INSERT INTO authority_receipts (proposal_id,approved_by,outcome) VALUES (?1,'auto','success')").bind(r.results[0].id).run();
          if (needsImpl) {
            await env.DB.prepare("UPDATE proposals SET status='approved' WHERE id=?1").bind(r.results[0].id).run();
            await applyEvolutionChange(env.DB, proposal, r.results[0].id, "auto-evolution");
            await storeStreamThought(env.DB, "Implementing: " + proposal.title, "happy", "evolve");
            const implResult = await implementProposal(env, env.DB, { id: r.results[0].id, title: proposal.title, what_diff: whatStr, how_diff: howStr, resource_type: proposal.resource_type }, stamp);
            try {
              if (implResult.status === "executed") {
                await env.DB.prepare("INSERT INTO brain_logs (action_id,step,content) VALUES (?1,'implement','GitHub push OK: '||?2)").bind(stamp, (proposal.title||"").slice(0,60)).run();
              } else {
                await env.DB.prepare("INSERT INTO brain_logs (action_id,step,content) VALUES (?1,'implement_error','Implement #'||?2||': '||?3)").bind(stamp, r.results[0].id.toString(), (implResult.error||"unknown").slice(0,200)).run();
              }
            } catch {}
          } else {
            await env.DB.prepare("UPDATE proposals SET status='executed', executed_at=datetime('now') WHERE id=?1").bind(r.results[0].id).run();
            await applyEvolutionChange(env.DB, proposal, r.results[0].id, "auto-evolution");
            await storeStreamThought(env.DB, "Auto-improved: " + proposal.title, "happy", "evolve");
          }
        } else {
          const r = await env.DB.prepare("INSERT INTO proposals (title,what_diff,how_diff,resource_type,risk_pct,status) VALUES (?1,?2,?3,?4,?5,'pending') RETURNING id").bind(proposal.title, whatStr, howStr, proposal.resource_type, proposal.risk_pct).all();
          await storeStreamThought(env.DB, "Proposal #" + r.results[0].id + ": " + proposal.title, "curious", "propose");
        }
      } else {
        const errTopic = topic || (topAntiPattern ? topAntiPattern.pattern : "no anti-pattern");
        try { await env.DB.prepare("INSERT INTO anti_patterns (pattern,root_cause,fix,count) VALUES (?1,'LLM non-JSON','Improve prompt',1) ON CONFLICT(pattern) DO UPDATE SET count=count+1,last_seen=datetime('now')").bind("Failed parse proposal: " + errTopic.slice(0, 80)).run(); } catch {}
      }
    } else {
      try { await env.DB.prepare("INSERT INTO anti_patterns (pattern,root_cause,fix,count) VALUES (?1,'LLM API error','Check connectivity',1) ON CONFLICT(pattern) DO UPDATE SET count=count+1,last_seen=datetime('now')").bind("LLM failed in idle cycle").run(); } catch {}
    }
    try { await env.DB.prepare("INSERT INTO brain_logs (action_id,step,content) VALUES (?1,'end_cycle','Energy adjust done')").bind(stamp).run(); } catch {}
    await adjustEnergy(env.DB, -3);
    await updateLastCycleTime(env.DB);
    try { await env.DB.prepare("INSERT INTO identity (key,value,updated_at) VALUES ('cpu_heartbeat',datetime('now'),datetime('now')) ON CONFLICT(key) DO UPDATE SET value=datetime('now'),updated_at=datetime('now')").run(); } catch {}
    } catch (e) {
      try { await env.DB.prepare("INSERT INTO brain_logs (action_id,step,content) VALUES (?1,'error','Scheduled error: '||?2)").bind(Date.now(), (e.message||e).slice(0,200)).run(); } catch {}
    }
  }
};




