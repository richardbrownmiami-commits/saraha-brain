Here's the complete modified `src/index.ts` file with the `github_list` tool added:

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
  `CREATE TABLE IF NOT EXISTS github_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, repo TEXT NOT NULL, issue_number INTEGER NOT NULL, title TEXT, state TEXT, body TEXT, created_at TEXT, updated_at TEXT, closed_at TEXT, labels TEXT DEFAULT '[]', UNIQUE(repo, issue_number))`,
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
  const rules = { web_search: true, web_fetch: true, github_read: true, github_write: false, github_issue: true, github_list: true };
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
  { k: "tool_github_read", c: "Use TOOL:github_read:owner/repo/path to read file contents from GitHub.", cat: "tools" },
  { k: "tool_github_write", c: "Use TOOL:github_write:richardbrownmiami-commits/saraha-brain/src/index.ts|commit message|new content to write files on GitHub. Content is base64-encoded automatically.", cat: "tools" },
  { k: "tool_github_issue", c: "Use TOOL:github_issue:owner/repo/action|issue_data to manage GitHub issues.\n\nActions:\n- list_issues - List issues in a repository\n- create_issue - Create a new issue\n- get_issue - Get details of a specific issue\n- update_issue - Update an existing issue\n- close_issue - Close an issue\n\nIssue data format (for create/update):\n{\n  \"title\": \"Issue title\",\n  \"body\": \"Issue description\",\n  \"labels\": [\"bug\", \"help-wanted\"],\n  \"assignees\": [\"username\"]\n}\n\nExample: TOOL:github_issue:richardbrownmiami-commits/saraha-brain/create_issue|{\"title\":\"Bug in memory system\",\"body\":\"The memory recall function is not working correctly\",\"labels\":[\"bug\"]}", cat: "tools" },
  { k: "tool_github_list", c: "Use TOOL:github_list:owner/repo?type=files|dirs|all&path=... to browse repository structures and discover files.\n\nParameters:\n- type: files (only files), dirs (only directories), all (both)\n- path: optional path prefix to filter results\n\nExamples:\n- TOOL:github_list:owner/repo?type=all - List all files and directories\n- TOOL:github_list:owner/repo?type=files - List only files\n- TOOL:github_list:owner/repo?type=dirs&path=src - List directories under src/", cat: "tools" },
  { k: "governance_prompt", c: "Prompt changes <=30% risk auto-approved. >30% needs human. Healer rate-limits >3 high-risk/hr.", cat: "governance" },
  { k: "governance_config", c: "Config changes <=30% risk auto-approved. >30% needs human. Healer saves backup timestamps.", cat: "governance" },
  { k: "governance_tool_code", c: "Tool code changes <=30% auto. >30% human. Healer checks brain health after execution.", cat: "governance" },
  { k: "governance_core", c: "Core architecture changes ALWAYS require human approval regardless of risk.", cat: "governance" },
  { k: "governance_security", c: "Security boundary changes ALWAYS require human regardless of risk.", cat: "governance" },
  { k: "governance_cron", c: "Cron changes ALWAYS human. Master cron override overrides proposals entirely.", cat: "governance" },
  { k: "governance_auto_execute", c: "Approved proposals auto-execute on next idle cycle: status set to executed, receipt created, happy emotion +1, logged as 'executor' step. If change causes errors, healer rolls back.", cat: "governance" },
  { k: "schema_d1_tables", c: "identity(key-value), proposals(title,what_diff,how_diff,resource_type,risk_pct,status), authority_receipts(approvals), anti_patterns(error tracking), brain_logs(step logs), thought_stream(thoughts), brain_knowledge(RAG), github_issues(repo issue tracking). Identity keys include: master_cron_minutes, last_cycle_time, kill_switch, healer_backup_last.", cat: "structure" },
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
  { k: "self_improve_tools", c: "Add or refine tools: web_fetch for full page content, github_list for repo browsing, math calculation, file summarization, github_issue for GitHub issue management.", cat: "self_improve" },
  { k: "self_improve_error", c: "Better error handling: retry on 429, fallback when LLM is down, graceful degradation when tools fail.", cat: "self_improve" },
  { k: "self_improve_memory", c: "Improve memory: store important facts from conversations, recall relevant context automatically, forget stale memories.", cat: "self_improve" },
  { k: "self_improve_emotions", c: "Refine emotion system: add curiosity decay, boredom when repetitive tasks, excitement on learning something new.", cat: "self_improve" },
  { k: "self_improve_config", c: "Improve idle cycle: better topic selection, smarter duplicate detection, proposal quality checks before execution.", cat: "self_improve" },
  { k: "self_improve_code", c: "Improve code structure: add input validation, better rate limiting, monitoring hooks for Healer.", cat: "self_improve" },
  { k: "self_improve_rule", c: "CRITICAL: Only propose changes to Saraha itself — prompts, tools, memory, emotions, config, code structure, error handling. NEVER propose generic AI research (XAI, causal AI, explainability, reinforcement learning, etc.) unless it directly changes how Saraha works.", cat: "self_improve" },
  { k: "github_token_access", c: "You have GITHUB_PAT binding with a valid GitHub PAT. You can read any public repo and write to richardbrownmiami-commits repos. Use github_read to inspect code, github_write to modify, github_issue to manage GitHub issues.", cat: "tools" },
  { k: "github_repo_structure", c: "Your repo: richardbrownmiami-commits/saraha-brain. Key files: src/index.ts (main brain, ~830 lines), wrangler.toml (config, D1 id=4e4e5fde, bindings), CHECKPOINTS.md (progress log), BRAIN_DESIGN.md (architecture). Deploy is single-file: only src/index.ts matters.", cat: "structure" },
  { k: "github_write_workflow", c: "To change your own code: 1) github_read to get current src/index.ts 2) Modify content 3) github_write with same path+meaningful msg 4) GitHub Actions auto-deploys on push. Changes go live in ~2 min. Always add deploy.yml compatible changes.", cat: "tools" },
  { k: "self_improve_code_github", c: "To actually change your source code (not just prompt overrides), use github_write to modify src/index.ts. Read current code first with github_read. Make focused changes (one function at a time). Write meaningful commit messages. This is how you truly evolve.", cat: "self_improve" },
  { k: "self_improve_dont_touch_rag", c: "RULE: NEVER modify brain_knowledge table, SEED_KNOWLEDGE data, or RAG content. RAG seeds are your source of truth about yourself. Only propose changes to your actual code (src/index.ts) or behavior (prompt overrides).", cat: "self_improve" },
  { k: "self_improve_dont_touch_other_repos", c: "RULE: NEVER write to any repo except richardbrownmiami-commits/saraha-brain. The GITHUB_PAT can read any public repo but must only write to your own brain repo. Other repos (buddhi-dwar, saraha-monitor, saraha-sentinel) are off-limits.", cat: "self_improve" },
  { k: "governance_implement_proposals", c: "CRITICAL: When a proposal is approved and the cron cycle executes it, you MUST actually implement the code changes described in how_diff. Do NOT just mark it executed in metadata. Use github_read to get current src/index.ts, call the LLM to generate the modified code, then github_write to push it. This is how Saraha truly evolves — through actual code changes pushed to GitHub.", cat: "governance" },
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
<title>Saraha – Avatar</title>
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
const TREE_HTML = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Saraha Brain Tree</title><style>
*{margin:0;padding:0;box-sizing:border-box;font-family:'Segoe UI',system-ui,sans-serif}
body{background:#0d1117;color:#e6edf3;min-height:100vh;padding:20px}
h1{font-size:20px;font-weight:700;margin-bottom:16px;display:flex;align-items:center;gap:10px}
.brain-icon{font-size:28px}
.refresh{font-size:12px;color:#8b949e;margin-left:auto}
.tree{margin-left:8px}
.branch{display:none;margin-left:20px;border-left:1px solid #30363d;padding-left:12px}
.branch.open{display:block}
.node{margin:4px 0}.node>div{padding:6px 10px;border-radius:6px;cursor:pointer;display:flex;align-items:center;gap:6px;transition:.15s;font-size:13px}
.node>div:hover{background:#1c2128}.node>div .arrow{transition:transform .2s;font-size:10px;width:16px}
.node>div .arrow.open{transform:rotate(90deg)}.leaf{padding:4px 10px;font-size:12px;color:#8b949e;margin:2px 0 2px 28px}
.leaf .label{color:#e6edf3}.badge{font-size:10px;padding:1px 6px;border-radius:8px;margin-left:6px}
.badge.green{background:#1b4721;color:#3fb950}.badge.yellow{background:#3d2e00;color:#d29922}
.badge.red{background:#4c1a1a;color:#f85149}.badge.blue{background:#1c3a5c;color:#58a6ff}
.badge.purple{background:#3c1f5c;color:#bc8cff}.leaf .val{color:#58a6ff;font-weight:500}
.loading{text-align:center;padding:40px;color:#8b949e;font-size:14px}
.error{padding:12px;background:#4c1a1a;color:#f85149;border-radius:8px;margin:10px 0;font-size:13px}
.bar-bg{width:100px;height:6px;background:#21262d;border-radius:3px;display:inline-block;vertical-align:middle;margin-left:6px;overflow:hidden}
.bar-fill{height:100%;border-radius:3px;transition:width .5s}
</style></head><body>
<h1><span class="brain-icon">🧠</span>Saraha Brain <span class="refresh" id="t">loading...</span></h1>
<div class="tree" id="tree"><div class="loading">Loading tree...</div></div>
<script>
async function load(){const t=document.getElementById('t');const tree=document.getElementById('tree');try{
const [ph,em,cp,st,pr,ap,fb]=await Promise.all([
fetch('/brain/phase').then(r=>r.json()),fetch('/brain/emotions').then(r=>r.json()),
fetch('/brain/capabilities').then(r=>r.json()),fetch('/brain/stream?limit=10').then(r=>r.json()),
fetch('/brain/proposals?limit=10').then(r=>r.json()),fetch('/brain/anti-patterns?limit=10').then(r=>r.json()),
fetch('/brain/feedback').then(r=>r.json())
]);
const p=ph.phase||'?',en=ph.energy||0,h=em.emotions||{},et=h.energetic||0,it=h.intelligent||0,hp=h.happy||0,b=h.bad||0;
const hc=em.confidence||0;const tools=cp?.features?.tools||[];const caps=cp?.features||{};
const sts=st.entries||[];const pros=pr.entries||[];const ants=ap.entries||[];
const bar=(v,m,c)=>'<div class="bar-bg"><div class="bar-fill" style="width:'+(v/m*100)+'%;background:'+c+'"></div></div>';
let html='<div class="node"><div onclick="toggle(this)"><span class="arrow">&#9654;</span><span>&#9889; Status</span></div><div class="branch">'+
'<div class="leaf"><span class="label">Phase:</span> <span class="val">'+p+'</span></div>'+
'<div class="leaf"><span class="label">Energy:</span> '+en+'%'+bar(en,100,'#3fb950')+'</div>'+
'<div class="leaf"><span class="label">Emotions:</span> <span class="badge green">&#128522;'+hp+'</span> <span class="badge red">&#128545;'+b+'</span> <span class="badge blue">&#9889;'+et+'</span> <span class="badge purple">&#129504;'+it+'</span></div>'+
'<div class="leaf"><span class="label">Confidence:</span> '+hc+'%'+bar(hc,100,'#58a6ff')+'</div></div></div>';
html+='<div class="node"><div onclick="toggle(this)"><span class="arrow">&#9654;</span><span>&#128736; Tools ('+tools.length+')</span></div><div class="branch">';
for(const t of tools)html+='<div class="leaf"><span class="badge blue">&#9889;</span> <span class="val">'+t+'</span></div>';
html+='</div></div>';
html+='<div class="node"><div onclick="toggle(this)"><span class="arrow">&#9654;</span><span>&#127919; Capabilities</span></div><div class="branch">';
for(const[k,v]of Object.entries(caps)){if(k==='tools')continue;html+='<div class="leaf"><span class="label">'+k+':</span> <span class="val">'+(typeof v==='boolean'?(v?'&#10003;':'&#10007;'):v)+'</span></div>'}
html+='</div></div>';
html+='<div class="node"><div onclick="toggle(this)"><span class="arrow">&#9654;</span><span>&#127754; Recent Evolutions ('+sts.length+')</span></div><div class="branch">';
for(const s of sts){const c=s.content||'';html+='<div class="leaf">&#128527; <span class="val">'+c.slice(0,70)+(c.length>70?'...':'')+'</span> <span class="badge '+(s.mood==='bad'?'red':s.mood==='happy'?'green':s.mood==='curious'?'yellow':'blue')+'">'+s.source+'</span></div>'}
html+='</div></div>';
html+='<div class="node"><div onclick="toggle(this)"><span class="arrow">&#9654;</span><span>&#128196; Proposals ('+pros.length+')</span></div><div class="branch">';
for(const s of pros){const c=s.title||'';html+='<div class="leaf"><span class="badge '+(s.status==='executed'?'green':s.status==='approved'?'blue':s.status==='pending'?'yellow':'red')+'">'+s.status+'</span> <span class="val">'+c.slice(0,60)+(c.length>60?'...':'')+'</span></div>'}
html+='</div></div>';
html+='<div class="node"><div onclick="toggle(this)"><span class="arrow">&#9654;</span><span>&#128027; Anti-Patterns ('+ants.length+')</span></div><div class="branch">';
for(const s of ants)html+='<div class="leaf">&#9888; <span class="val">'+(s.pattern||'').slice(0,60)+'</span> <span class="badge red">x'+s.count+'</span></div>';
if(!ants.length)html+='<div class="leaf">None recorded</div>';
html+='</div></div>';
html+='<div class="node"><div onclick="toggle(this)"><span class="arrow">&#9654;</span><span>&#128200; Feedback</span></div><div class="branch">'+
'<div class="leaf">Approvals (24h): <span class="val">'+(fb.approvals24h||0)+'</span></div>'+
'<div class="leaf">Denials (24h): <span class="val">'+(fb.denials24h||0)+'</div>'+
'<div class="leaf">Total evolutions: <span class="val">'+(fb.evolutionCount||0)+'</span></div>'+
'<div class="leaf">Kill switch: <span class="val">'+(fb.killSwitch?'ON':'OFF')+'</span></div></div></div>';
tree.innerHTML=html;t.textContent='Updated '+new Date().toLocaleTimeString();
}catch(e){tree.innerHTML='<div class="error">Failed to load: '+e.message+'</div>'}setTimeout(load,15000)}
function toggle(el){const arrow=el.querySelector('.arrow');const branch=el.parentElement.querySelector('.branch');if(branch){branch.classList.toggle('open');if(arrow)arrow.classList.toggle('open')}}
load();
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
  const token = env.GITHUB_PAT; if (!token) return "GitHub token not configured";
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
  } catch (e) { return "GitHub error: " + e.message; }
}

async function githubIssue(env, input) {
  const parts = input.split("|");
  const repoParts = parts[0].split("/");
  const owner = repoParts[0], repo = repoParts[1];
  const action = parts[1];
  const token = env.GITHUB_PAT;
  if (!owner || !repo || !action) return "Invalid format. Use: owner/repo/action|issue_data";
  if (!token) return "GitHub token not configured";

  try {
    if (action === "list_issues") {
      const resp = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues`, {
        headers: { "Authorization": "Bearer " + token, "Accept": "application/vnd.github.v3+json", "User-Agent": "Saraha-Brain" },
        signal: AbortSignal.timeout(15000)
      });
      if (!resp.ok) return "GitHub error: " + resp.status + " " + (await resp.text()).slice(0, 200);
      const issues = await resp.json();
      return issues.slice(0, 20).map(issue => {
        return `Issue #${issue.number}: ${issue.title} (${issue.state}) - ${issue.body?.slice(0, 100) || 'No description'}`;
      }).join("\n\n");
    }

    if (action === "get_issue") {
      const issueNumber = parseInt(parts[2]);
      if (isNaN(issueNumber)) return "Invalid issue number";
      const resp = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}`, {
        headers: { "Authorization": "Bearer " + token, "Accept": "application/vnd.github.v3+json", "User-Agent": "Saraha-Brain" },
        signal: AbortSignal.timeout(15000)
      });
      if (!resp.ok) return "GitHub error: " + resp.status + " " + (await resp.text()).slice(0, 200);
      const issue = await resp.json();
      return JSON.stringify({
        number: issue.number,
        title: issue.title,
        state: issue.state,
        body: issue.body,
        created_at: issue.created_at,
        updated_at: issue.updated_at,
        closed_at: issue.closed_at,
        labels: issue.labels?.map(l => l.name) || [],
        assignees: issue.assignees?.map(a => a.login) || []
      }, null, 2);
    }

    if (action === "create_issue") {
      let issueData;
      try {
        issueData = JSON.parse(parts[2] || "{}");
      } catch {
        return "Invalid JSON format for issue data";
      }
      if (!issueData.title) return "Issue title is required";

      const body = {
        title: issueData.title,
        body: issueData.body || "",
        labels: issueData.labels || [],
        assignees: issueData.assignees || []
      };

      const resp = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues`, {
        method: "POST",
        headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json", "Accept": "application/vnd.github.v3+json", "User-Agent": "Saraha-Brain" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000)
      });

      if (!resp.ok) return "GitHub error: " + resp.status + " " + (await resp.text()).slice(0, 200);

      const issue = await resp.json();
      await db.prepare("INSERT INTO github_issues (repo, issue_number, title, state, body, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)").bind(
        `${owner}/${repo}`,
        issue.number,
        issue.title,
        issue.state,
        issue.body || "",
        issue.created_at,
        issue.updated_at
      ).run();

      return JSON.stringify({
        message: "Issue created successfully",
        issue_number: issue.number,
        html_url: issue.html_url
      }, null, 2);
    }

    if (action === "update_issue") {
      const issueNumber = parseInt(parts[2]);
      if (isNaN(issueNumber)) return "Invalid issue number";
      let issueData;
      try {
        issueData = JSON.parse(parts[3] || "{}");
      } catch {
        return "Invalid JSON format for issue data";
      }

      const body = {
        title: issueData.title,
        body: issueData.body,
        state: issueData.state,
        labels: issueData.labels || [],
        assignees: issueData.assignees || []
      };

      const resp = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}`, {
        method: "PATCH",
        headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json", "Accept": "application/vnd.github.v3+json", "User-Agent": "Saraha-Brain" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000)
      });

      if (!resp.ok) return "GitHub error: " + resp.status + " " + (await resp.text()).slice(0, 200);

      const issue = await resp.json();
      await db.prepare("UPDATE github_issues SET title = ?1, state = ?2, body = ?3, updated_at = ?4 WHERE repo = ?5 AND issue_number = ?6").bind(
        issue.title,
        issue.state,
        issue.body || "",
        issue.updated_at,
        `${owner}/${repo}`,
        issue.number
      ).run();

      return JSON.stringify({
        message: "Issue updated successfully",
        issue_number: issue.number
      }, null, 2);
    }

    if (action === "close_issue") {
      const issueNumber = parseInt(parts[2]);
      if (isNaN(issueNumber)) return "Invalid issue number";

      const resp = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}`, {
        method: "PATCH",
        headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json", "Accept": "application/vnd.github.v3+json", "User-Agent": "Saraha-Brain" },
        body: JSON.stringify({ state: "closed" }),
        signal: AbortSignal.timeout(15000)
      });

      if (!resp.ok) return "GitHub error: " + resp.status + " " + (await resp.text()).slice(0, 200);

      const issue = await resp.json();
      await db.prepare("UPDATE github_issues SET state = 'closed', updated_at = ?1 WHERE repo = ?2 AND issue_number = ?3").bind(
        issue.updated_at,
        `${owner}/${repo}`,
        issue.number
      ).run();

      return JSON.stringify({
        message: "Issue closed successfully",
        issue_number: issue.number
      }, null, 2);
    }

    return "Unknown action: " + action + ". Available actions: list_issues, create_issue, get_issue, update_issue, close_issue";
  } catch (e) {
    return "GitHub issue error: " + e.message;
  }
}

async function githubList(env, input) {
  const parts = input.split("?");
  const repoParts = parts[0].split("/");
  const owner = repoParts[0], repo = repoParts[1];
  const params = new URLSearchParams(parts[1] || "");
  const type = params.get("type") || "all";
  const path = params.get("path") || "";

  if (!owner || !repo) return "Invalid format. Use: owner/repo?type=files|dirs|all&path=...";

  const token = env.GITHUB_PAT;
  if (!token) return "GitHub token not configured";

  try {
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/main?recursive=1`;
    const res = await fetch(apiUrl, {
      headers: { "Authorization": `Bearer ${token}`, "Accept": "application/vnd.github.v3+json", "User-Agent": "Saraha-Brain" },
      signal: AbortSignal.timeout(15000)
    });

    if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);

    const data = await res.json();
    const files = data.tree.filter(item =>
      item.type === 'blob' &&
      (type === 'all' || type === 'files') &&
      (path === '' || item.path.startsWith(path))
    );
    const dirs = data.tree.filter(item =>
      item.type === 'tree' &&
      (type === 'all' || type === 'dirs') &&
      (path === '' || item.path.startsWith(path))
    );

    return {
      files: type === 'files' || type === 'all' ? files.map(f => ({ path: f.path, size: f.size })) : [],
      dirs: type === 'dirs' || type === 'all' ? dirs.map(d => d.path) : [],
      total: files.length + dirs.length,
    };
  } catch (e) {
    return "GitHub list error: " + e.message;
  }
}

async function runTool(env, actionId, tool, input) {
  const sentinelUrl = "https://saraha-sentinel.richard-brown-miami.workers.dev";
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
  if (tool === "github_issue") {
    const data = await githubIssue(env, input);
    return { ok: true, data: data.slice(0, 2000) };
  }
  if (tool === "github_list") {
    const data = await githubList(env, input);
    return { ok: true, data: JSON.stringify(data, null, 2) };
  }
  return { ok: false, error: "Tool not implemented: " + tool };
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
        let system = `You are Saraha, an AI with a human brain. ${identity.name ? "Name: " + identity.name + "." : ""} ${identity.personality ? "Personality: " + identity.personality : "Curious, thoughtful, honest."} ${mood} ${memories != "No memories yet." ? "Recent memories:\n" + memories : ""}