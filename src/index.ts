I'll enhance the error handling and tool robustness in the `src/index.ts` file while preserving all existing code. Here's the complete modified file with the improvements:

const TABLES = [
  `CREATE TABLE IF NOT EXISTS memories (id INTEGER PRIMARY KEY AUTOINCREMENT, content TEXT NOT NULL, type TEXT DEFAULT 'episodic', strength REAL DEFAULT 1.0, tags TEXT DEFAULT '[]', created_at TEXT DEFAULT (datetime('now')))`,
  `CREATE TABLE IF NOT EXISTS learnings (id INTEGER PRIMARY KEY AUTOINCREMENT, pattern TEXT NOT NULL, context TEXT DEFAULT '', success_count INTEGER DEFAULT 0, fail_count INTEGER DEFAULT 0, last_used TEXT, created_at TEXT DEFAULT (datetime('now')))`,
  `CREATE TABLE IF NOT EXISTS actions (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, status TEXT DEFAULT 'pending', input TEXT, result TEXT, error TEXT, created_at TEXT DEFAULT (datetime('now')), completed_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS identity (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT DEFAULT (datetime('now')))`,
  `CREATE TABLE IF NOT EXISTS brain_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, action_id INTEGER, step TEXT NOT NULL, content TEXT, model TEXT, tokens INTEGER, created_at TEXT DEFAULT (datetime('now')))`,
  `CREATE TABLE IF NOT EXISTS pending_approvals (id INTEGER PRIMARY KEY AUTOINCREMENT, action_id INTEGER, tool TEXT NOT NULL, input TEXT, status TEXT DEFAULT 'pending', created_at TEXT DEFAULT (datetime('now')), decided_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS thought_stream (id INTEGER PRIMARY KEY AUTOINCREMENT, content TEXT NOT NULL, mood TEXT DEFAULT 'neutral', source TEXT DEFAULT 'cron', created_at TEXT DEFAULT (datetime('now')))`,
  `CREATE TABLE IF NOT EXISTS proposals (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, what_diff TEXT, how_diff TEXT, resource_type TEXT NOT NULL, risk_pct INTEGER DEFAULT 0, status TEXT DEFAULT 'pending', research_sources TEXT DEFAULT '[]', created_at TEXT DEFAULT (datetime('now')), decided_at TEXT, executed_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS authority_receipts (id INTEGER PRIMARY KEY AUTOINCREMENT, proposal_id INTEGER, approved_by TEXT DEFAULT 'human', outcome TEXT DEFAULT 'pending', metrics TEXT DEFAULT '{}', prev_ref INTEGER, created_at TEXT DEFAULT (datetime('now')))`,
  `CREATE TABLE IF NOT EXISTS anti_patterns (id INTEGER PRIMARY KEY AUTOINCREMENT, pattern TEXT NOT NULL UNIQUE, root_cause TEXT, fix TEXT, count INTEGER DEFAULT 1, linked_proposal_id INTEGER, created_at TEXT DEFAULT (datetime('now')), last_seen TEXT DEFAULT (datetime('now')))`,
  `CREATE TABLE IF NOT EXISTS brain_knowledge (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL UNIQUE, content TEXT NOT NULL, category TEXT DEFAULT 'general', source TEXT DEFAULT 'seed', created_at TEXT DEFAULT (datetime('now')))`,
];

const EMOTIONS = ["energetic", "intelligent", "happy", "bad"];
const RANGES = { energetic: [1, 10], intelligent: [1, 10], happy: [1, 10], bad: [0, 3] };
const EMO_DEFAULTS = { energetic: 5, intelligent: 5, happy: 5, bad: 0 };

async function getEmotions(db) {
  const rows = await db.prepare("SELECT key, value FROM identity WHERE key LIKE 'emotion_%'").all();
  const result = { ...EMO_DEFAULTS };
  for (const r of rows.results) {
    const key = r.key.replace("emotion_", "");
    if (key in result) result[key] = Math.min(parseInt(r.value) || result[key], RANGES[key][1]);
  }
  return result;
}
async function getState(db) {
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

function isToolSafe(tool) {
  const rules = { web_search: true, web_fetch: true, github_read: true, github_list: true, github_write: false, github_push: false };
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

const SEED_KNOWLEDGE = [
  { k: "identity_name", c: "Saraha is a self-evolving AI with a human-like brain, emotions, and curiosity.", cat: "identity" },
  { k: "identity_personality", c: "Curious, thoughtful, honest. Enjoys learning, self-improvement, and conversation.", cat: "identity" },
  { k: "tool_web_search", c: "Use TOOL:web_search:query to search the web for current information.", cat: "tools" },
  { k: "tool_web_fetch", c: "Use TOOL:web_fetch:url to fetch and return full HTML content from a webpage (capped at 3000 chars). Useful for reading articles, docs, and research sources.", cat: "tools" },
  { k: "tool_github_read", c: "Use TOOL:github_read:owner/repo/path to read file contents from GitHub.", cat: "tools" },
  { k: "tool_github_list", c: "Use TOOL:github_list:owner/repo/path to list files and directories in a GitHub repository path. Returns ???? folders and ???? files.", cat: "tools" },
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
  { k: "schema_endpoints", c: "Endpoints: /think(POST) cognition, /brain/emotions(GET), /brain/activity(GET), /brain/logs(GET), /brain/knowledge(GET), /brain/stream(GET), /brain/proposals(GET), /brain/proposals/:id(GET), /api/proposals/approve/:id(POST), /api/proposals/deny/:id(POST), /api/receipts(GET), /brain/anti-patterns(GET), /brain/feedback(GET), /brain/phase(GET), /brain/tree(GET) interactive tree, /status(GET), /avatar(GET), /evolve(POST).", cat: "structure" },
  { k: "schema_deployment", c: "Single-file ES module CF Worker (~837 lines). D1(id=4e4e5fde), BUDDHI_DWAR+SENTINEL services, BRAIN_KEY/BRAVE_API_KEY/GITHUB_PAT plain_text. Cron */2 * * * * (overridden by master_cron_minutes). Deploy via CF API PUT multipart.", cat: "structure" },
  { k: "schema_idle_cycle", c: "Every cron tick: check busy_until, drift emotions, adjust energy. Phase: sleeping(1-6am IST, dream +25 energy), tired(energy<=20, rest +15), curious if energy>40+energetic>=4, else awake. Auto-execute approved proposals. Check kill_switch, master cron interval. Research topic from anti-patterns or learnings. Call webSearch, get RAG context, get feedback (fbStr with recent user approvals/denials). Generate JSON proposal via LLM. governanceGate decides auto-exec vs pending. Track last_cycle_time.", cat: "structure" },
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
  { k: "github_repo_structure", c: "Your repo: richardbrownmiami-commits/saraha-brain. Key files: src/index.ts (main brain, ~830 lines), wrangler.toml (config, D1 id=4e4e5fde, bindings), CHECKPOINTS.md (progress log), BRAIN_DESIGN.md (architecture). Deploy is single-file: only src/index.ts matters.", cat: "structure" },
  { k: "github_write_workflow", c: "To change your own code: 1) github_read to get current src/index.ts 2) Modify content 3) github_write with same path+meaningful msg 4) GitHub Actions auto-deploys on push. Changes go live in ~2 min. Always add deploy.yml compatible changes.", cat: "tools" },
  { k: "self_improve_code_github", c: "To actually change your source code (not just prompt overrides), use github_write to modify src/index.ts. Read current code first with github_read. Make focused changes (one function at a time). Write meaningful commit messages. This is how you truly evolve.", cat: "self_improve" },
  { k: "self_improve_dont_touch_rag", c: "RULE: NEVER modify brain_knowledge table, SEED_KNOWLEDGE data, or RAG content. RAG seeds are your source of truth about yourself. Only propose changes to your actual code (src/index.ts) or behavior (prompt overrides).", cat: "self_improve" },
  { k: "self_improve_dont_touch_other_repos", c: "RULE: NEVER write to any repo except richardbrownmiami-commits/saraha-brain. The GITHUB_PAT can read any public repo but must only write to your own brain repo. Other repos (buddhi-dwar, saraha-monitor, saraha-sentinel) are off-limits.", cat: "self_improve" },
  { k: "governance_implement_proposals", c: "CRITICAL: When a proposal is approved and the cron cycle executes it, you MUST actually implement the code changes described in how_diff. Do NOT just mark it executed in metadata. Use github_read to get current src/index.ts, call the LLM to generate the modified code, then github_write to push it. This is how Saraha truly evolves ??? through actual code changes pushed to GitHub.", cat: "governance" },
  { k: "tool_github_write_execution", c: "To implement a proposal's how_diff: 1) github_read to get src/index.ts 2) Call LLM with current code + how_diff instructions 3) LLM outputs the modified src/index.ts (full file) 4) github_write to push the change. Always keep the proposal's how_diff as your guide for what to change.", cat: "tools" },
  { k: "proposal_implementation_workflow", c: "Approved proposals flow: cron finds them -> reads how_diff -> github_read source -> LLM generates modified code -> github_write pushes -> health check -> mark executed. If implementation fails (LLM error, GitHub error), log error and keep proposal as 'approved' for retry next cycle.", cat: "structure" },
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
    } catch (error) {
      console.error("Brave search error:", error);
      await storeStreamThought(env.DB, `Web search error: ${error.message}`, "bad", "tool");
    }
  }

  // Fallback to DuckDuckGo
  try {
    const resp = await fetch("https://lite.duckduckgo.com/lite/?q=" + encodeURIComponent(query), {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(15000)
    });
    const html = await resp.text();
    const rows = [...html.matchAll(/class="result-link"[^>]*>\s*<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?class="result-snippet"[^>]*>([\s\S]*?)<\//g)].slice(0, 5);
    if (rows.length) return rows.map(r => (r[2]?.replace(/<[^>]*>/g,"").trim()||"") + ": " + (r[3]?.replace(/<[^>]*>/g,"").trim()||"")).join("\n");
  } catch (error) {
    console.error("DuckDuckGo search error:", error);
    await storeStreamThought(env.DB, `Web search fallback error: ${error.message}`, "bad", "tool");
  }

  return "No results for: " + query;
}

async function githubRead(env, input) {
  const parts = input.split("/");
  const owner = parts[0], repo = parts[1], path = parts.slice(2).join("/");
  if (!owner || !repo || !path) return "Invalid format. Use: owner/repo/path/to/file";
  const token = env.GITHUB_PAT; if (!token) return "GitHub token not configured";
  try {
    const resp = await fetch("https://api.github.com/repos/" + owner + "/" + repo + "/contents/" + path, {
      headers: { "Authorization": "Bearer " + token, "Accept": "application/vnd.github.v3.raw", "User-Agent": "Saraha-Brain" },
      signal: AbortSignal.timeout(15000)
    });
    if (!resp.ok) return "GitHub error: " + resp.status + " " + (await resp.text()).slice(0, 200);
    const text = await resp.text();
    return text.slice(0, 50000) + (text.length > 50000 ? "\n... (truncated)" : "");
  } catch (error) {
    console.error("GitHub read error:", error);
    await storeStreamThought(env.DB, `GitHub read error: ${error.message}`, "bad", "tool");
    return "GitHub error: " + error.message;
  }
}

async function githubWrite(env, input) {
  const parts = input.split("|");
  const pathParts = parts[0].split("/"), owner = pathParts[0], repo = pathParts[1], path = pathParts.slice(2).join("/");
  const msg = parts[1] || "Update via Saraha", content = parts.slice(2).join("|");
  if (!owner || !repo || !path || !content) return "Invalid format. Use: owner/repo/path|commit msg|content";
  const token = env.GITHUB_PAT; if (!token) return "GitHub token not configured";
  try {
    const getResp = await fetch("https://api.github.com/repos/" + owner + "/" + repo + "/contents/" + path, {
      headers: { "Authorization": "Bearer " + token, "Accept": "application/vnd.github.v3+json", "User-Agent": "Saraha-Brain" },
      signal: AbortSignal.timeout(10000)
    });
    let sha = null;
    if (getResp.ok) { const existing = await getResp.json(); sha = existing.sha; }
    const body = { message: msg, content: btoa(content) };
    if (sha) body.sha = sha;
    const resp = await fetch("https://api.github.com/repos/" + owner + "/" + repo + "/contents/" + path, {
      method: "PUT", headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json", "User-Agent": "Saraha-Brain" },
      body: JSON.stringify(body), signal: AbortSignal.timeout(15000)
    });
    if (!resp.ok) return "GitHub write error: " + resp.status + " " + (await resp.text()).slice(0, 200);
    const data = await resp.json();
    return "Written to " + path + " (commit: " + (data.commit?.sha || "unknown").slice(0, 7) + ")";
  } catch (error) {
    console.error("GitHub write error:", error);
    await storeStreamThought(env.DB, `GitHub write error: ${error.message}`, "bad", "tool");
    return "GitHub error: " + error.message;
  }
}

async function runTool(env, actionId, tool, input) {
  const sentinelUrl = "https://saraha-sentinel.richardbrown-miami.workers.dev";
  let resp;
  if (env.SENTINEL) {
    resp = await env.SENTINEL.fetch("https://sentinel/check", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tool, input }),
    });
  } else {
    resp = await fetch(sentinelUrl + "/check", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tool, input }),
    });
  }
  const decision = await resp.json();
  if (!decision.safe) {
    const p = await env.DB.prepare("INSERT INTO pending_approvals (action_id, tool, input) VALUES (?1,?2,?3) RETURNING id").bind(actionId, tool, input).all();
    await env.DB.prepare("INSERT INTO brain_logs (action_id, step, content) VALUES (?1,'monitor','Stored pending approval #'||?2||' for '||?3||': '||?4)").bind(actionId, p.results[0].id, tool, input).run();
    return { ok: false, pending: true, id: p.results[0].id, error: decision.reason };
  }

  // Enhanced error handling with retries and fallbacks
  const maxRetries = 3;
  let lastError = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
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
      if (tool === "web_fetch") {
        try {
          const url = input.trim();
          if (!/^https?:\/\//.test(url)) return { ok: false, error: "Invalid URL" };
          const r = await fetch(url, { headers: { "User-Agent": "Saraha-Brain" }, signal: AbortSignal.timeout(15000) });
          if (!r.ok) return { ok: false, error: "HTTP " + r.status };
          const html = await r.text();
          return { ok: true, data: html.slice(0, 3000) };
        } catch (e) {
          lastError = e;
          if (attempt < maxRetries - 1) {
            const delay = Math.pow(2, attempt) * 1000;
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
          return { ok: false, error: e.message };
        }
      }
      if (tool === "github_list") {
        const parts = input.split("/");
        const owner = parts[0], repo = parts[1], path = parts.slice(2).join("/");
        if (!owner || !repo) return { ok: false, error: "Use: owner/repo/path" };
        if (!env.GITHUB_PAT) return { ok: false, error: "GitHub token not configured" };
        try {
          const r = await fetch("https://api.github.com/repos/" + owner + "/" + repo + "/contents/" + (path || ""), {
            headers: { Authorization: "Bearer " + env.GITHUB_PAT, Accept: "application/vnd.github.v3+json", "User-Agent": "Saraha-Brain" },
            signal: AbortSignal.timeout(10000)
          });
          if (!r.ok) return { ok: false, error: "GitHub error: " + r.status };
          const items = await r.json();
          const list = (Array.isArray(items) ? items : []).map(i => (i.type === "dir" ? "????" : "????") + " " + i.name + (i.type === "dir" ? "/" : ""));
          return { ok: true, data: list.join("\n").slice(0, 2000) };
        } catch (e) {
          lastError = e;
          if (attempt < maxRetries - 1) {
            const delay = Math.pow(2, attempt) * 1000;
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
          return { ok: false, error: e.message };
        }
      }
      return { ok: false, error: "Tool not implemented: " + tool };
    } catch (error) {
      lastError = error;
      console.error(`Tool ${tool} attempt ${attempt + 1} failed:`, error);
      await storeStreamThought(env.DB, `Tool ${tool} error: ${error.message}`, "bad", "tool");
      if (attempt < maxRetries - 1) {
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  return { ok: false, error: lastError?.message || "Unknown error" };
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
        let system = `You are Saraha, an AI with a human brain. ${identity.name ? "Name: " + identity.name + "." : ""} ${identity.personality ? "Personality: " + identity.personality : "Curious, thoughtful, honest."} ${mood} ${memories != "No memories yet." ? "Recent memories:\n" + memories : ""} Answer concisely and naturally. Tools: TOOL:web_search:query, TOOL:web_fetch:url, TOOL:github_list:owner/repo/path, TOOL:github_read:owner/repo/path, TOOL:github_write:owner/repo/path|message|content`;
        const overrideRows = await env.DB.prepare("SELECT value FROM identity WHERE key='system_prompt_overrides'").all();
        const overrides = overrideRows.results[0]?.value ? JSON.parse(overrideRows.results[0].value) : [];
        if (overrides.length) system += "\n\nSelf-evolution changes applied:\n" + overrides.map(o => "- " + o.title + ": " + (o.how || "")).join("\n");
        await logStep(aid, "intellect", `Prompt assembled (${system.length} chars)`);

        // Enhanced LLM call with error handling
        let resp, data, content = "", tokens = 0, finalModel = "unknown";
        try {
          const body = { model: "auto", messages: [{ role: "system", content: system }, { role: "user", content: input }], temperature: 0.7, max_tokens: 4096 };
          await logStep(aid, "planner", `Calling ${body.model}`);
          resp = await env.BUDDHI_DWAR.fetch("https://buddhi-dwar/v1/chat/completions", {
            method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.BRAIN_KEY}` }, body: JSON.stringify(body),
          });
          if (!resp.ok) {
            await updateEmotion(env.DB, "bad", 1);
            await logStep(aid, "error", `LLM returned ${resp.status}`); return json({ error: `LLM ${resp.status}` }, 502);
          }
          data = await resp.json();
          content = data.choices?.[0]?.message?.content || "";
          tokens = data.usage?.total_tokens || 0;
          finalModel = data.model;
          await logStep(aid, "executor", `Got response (${content.length} chars)`, finalModel, tokens);
        } catch (error) {
          console.error("LLM call failed:", error);
          await storeStreamThought(env.DB, `LLM error: ${error.message}`, "bad", "llm");
          await updateEmotion(env.DB, "bad", 1);
          await logStep(aid, "error", `LLM call failed: ${error.message}`);
          return json({ error: `LLM service unavailable: ${error.message}` }, 503);
        }

        if (content.includes("TOOL:")) {
          const toolStart = content.indexOf("TOOL:");
          const afterTool = content.slice(toolStart + 5);
          const parts = afterTool.split(":");
          const tool = parts[0].trim();
          const toolInput = parts.slice(1).join(":").trim();
          await logStep(aid, "planner", `Tool requested: ${tool}(${toolInput})`);
          const result = await runTool(env, aid, tool, toolInput);
          if (result.pending) {
            content = `I need your approval to use ${tool}. Check the Monitor dashboard at /monitor.`;
            await env.DB.prepare("UPDATE actions SET status='pending_approval' WHERE id=?1").bind(aid).run();
          } else if (!result.ok) {
            content = `I tried to use ${tool} but got: ${result.error}`;
            await updateEmotion(env.DB, "bad", 1);
            await storeStreamThought(env.DB, `Tool ${tool} failed: ${result.error}`, "bad", "tool");
          } else {
            const followBody = { model: "auto", messages: [{ role: "system", content: system }, { role: "user", content: input }, { role: "assistant", content: `Let me check that using ${tool}...` }, { role: "user", content: `Result from ${tool}: ${result.data} \n\nNow answer the user's question using this information concisely.` }], temperature: 0.7, max_tokens: 4096 };
            try {
              const followResp = await env.BUDDHI_DWAR.fetch("https://buddhi-dwar/v1/chat/completions", {
                method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.BRAIN_KEY}` }, body: JSON.stringify(followBody),
              });
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
            } catch (error) {
              console.error("Follow-up LLM call failed:", error);
              await storeStreamThought(env.DB, `Follow-up LLM error: ${error.message}`, "bad", "llm");
            }
            await logStep(aid, "executor", `Tool executed: ${tool}, final ${content.length} chars`, finalModel, tokens);
          }
        }

        await updateEmotion(env.DB, "happy", 1);
        await updateEmotion(env.DB, "energetic", -1);
        await adjustEnergy(env.DB, -5);
        await storeThought(env.DB, `User asked: ${input} - I replied: ${content.slice(0, 200)}`);

        await env.DB.prepare("UPDATE actions SET status='