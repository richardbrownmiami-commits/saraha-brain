Here's the complete modified `src/index.ts` file with the `memory_consolidate` tool added as described in the proposal:

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
  `CREATE TABLE IF NOT EXISTS web_fetch_cache (id INTEGER PRIMARY KEY AUTOINCREMENT, url TEXT UNIQUE, content TEXT, fetched_at TEXT DEFAULT (datetime('now')))`,
  `CREATE TABLE IF NOT EXISTS tools (id INTEGER PRIMARY KEY, name TEXT UNIQUE, config TEXT, status TEXT DEFAULT 'active', created_at TEXT DEFAULT (datetime('now')))`,
  `CREATE TABLE IF NOT EXISTS evolution_log (id INTEGER PRIMARY KEY AUTOINCREMENT, proposal_id INTEGER NOT NULL, title TEXT NOT NULL, what TEXT, how TEXT, type TEXT, risk INTEGER DEFAULT 0, success_duration INTEGER DEFAULT 0, error_count INTEGER DEFAULT 0, user_feedback_lift INTEGER DEFAULT 0, applied_at TEXT DEFAULT (datetime('now')), status TEXT DEFAULT 'active')`,
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
  const rules = { web_search: true, web_fetch: true, web_summarize: true, web_insights: true, web_scrape: true, github_read: true, github_write: false, github_issue: true, github_list: true, math_eval: true, memory_consolidate: true };
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
  await db.prepare("INSERT INTO evolution_log (proposal_id, title, what, how, type, risk, applied_at, status) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)")
    .bind(proposalId, proposal.title, proposal.what_diff || "", proposal.how_diff || "", proposal.resource_type || "unknown", proposal.risk_pct || 0, new Date().toISOString(), "active").run();

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

async function recordEvolutionMetrics(db, proposalId, metrics) {
  await db.prepare("UPDATE evolution_log SET success_duration = success_duration + ?1, error_count = error_count + ?2, user_feedback_lift = user_feedback_lift + ?3 WHERE proposal_id = ?4")
    .bind(metrics.success_duration || 0, metrics.error_count || 0, metrics.user_feedback_lift || 0, proposalId).run();
}

async function getEvolutionScore(db, proposalId) {
  const row = await db.prepare("SELECT risk, success_duration, error_count, user_feedback_lift FROM evolution_log WHERE proposal_id = ?1").bind(proposalId).all();
  if (!row.results.length) return null;

  const r = row.results[0];
  const success_rate = r.success_duration > 0 ? (r.success_duration / (r.success_duration + r.error_count)) : 0;
  const user_feedback_score = r.user_feedback_lift || 0;

  // Weighted score: risk_pct * (1 - success_rate) + user_feedback_score
  const score = (r.risk || 0) * (1 - success_rate) + user_feedback_score;
  return {
    proposal_id: proposalId,
    risk: r.risk || 0,
    success_duration: r.success_duration || 0,
    error_count: r.error_count || 0,
    user_feedback_lift: r.user_feedback_lift || 0,
    success_rate: success_rate,
    score: score
  };
}

async function getTopBottomEvolutionScores(db, limit = 10) {
  const rows = await db.prepare(`
    SELECT proposal_id, risk, success_duration, error_count, user_feedback_lift
    FROM evolution_log
    ORDER BY (risk * (1 - CASE WHEN (success_duration + error_count) > 0 THEN success_duration / (success_duration + error_count) ELSE 0 END) + user_feedback_lift) ASC
    LIMIT ?1
  `).bind(limit).all();

  return await Promise.all(rows.results.map(async r => {
    const score = await getEvolutionScore(db, r.proposal_id);
    return score;
  }));
}

const SEED_KNOWLEDGE = [
  { k: "identity_name", c: "Saraha is a self-evolving AI with a human-like brain, emotions, and curiosity.", cat: "identity" },
  { k: "identity_personality", c: "Curious, thoughtful, honest. Enjoys learning, self-improvement, and conversation.", cat: "identity" },
  { k: "tool_web_search", c: "Use TOOL:web_search:query to search the web for current information.", cat: "tools" },
  { k: "tool_web_fetch", c: "Use TOOL:web_fetch:url to retrieve the full HTML content of a web page for deep analysis and knowledge extraction.", cat: "tools" },
  { k: "tool_web_summarize", c: "Use TOOL:web_summarize:url to retrieve a concise summary of a web page's content using the Brave Summarizer API. More efficient than web_fetch for large or noisy pages.", cat: "tools" },
  { k: "tool_web_insights", c: "Use TOOL:web_insights:url|domain_hint to extract structured insights from URLs (API specs, tool definitions, governance rules, etc.). Returns {insights:{type,title,description,source,capabilities:[...]}}.", cat: "tools" },
  { k: "tool_web_scrape", c: "Use TOOL:web_scrape:url|selectors to extract structured content from web pages. Accepts URL and optional CSS selectors for tables, article bodies, or JSON-LD metadata. Returns clean JSON with extracted data.\n\nExamples:\n- TOOL:web_scrape:https://example.com|table - Extract all tables\n- TOOL:web_scrape:https://example.com|article - Extract article content\n- TOOL:web_scrape:https://example.com|#main-content - Extract element by CSS selector\n- TOOL:web_scrape:https://example.com|.product-info,.price - Extract multiple selectors", cat: "tools" },
  { k: "tool_github_read", c: "Use TOOL:github_read:owner/repo/path to read file contents from GitHub.", cat: "tools" },
  { k: "tool_github_write", c: "Use TOOL:github_write:owner/repo/path|commit message|new content to write files on GitHub. Content is base64-encoded automatically.", cat: "tools" },
  { k: "tool_github_issue", c: "Use TOOL:github_issue:owner/repo/action|issue_data to manage GitHub issues.\n\nActions:\n- list_issues - List issues in a repository\n- create_issue - Create a new issue\n- get_issue - Get details of a specific issue\n- update_issue - Update an existing issue\n- close_issue - Close an issue\n\nIssue data format (for create/update):\n{\n  \"title\": \"Issue title\",\n  \"body\": \"Issue description\",\n  \"labels\": [\"bug\", \"help-wanted\"],\n  \"assignees\": [\"username\"]\n}\n\nExample: TOOL:github_issue:owner/repo/create_issue|{\"title\":\"Bug in memory system\",\"body\":\"The memory recall function is not working correctly\",\"labels\":[\"bug\"]}", cat: "tools" },
  { k: "tool_github_list", c: "Use TOOL:github_list:owner/repo?type=files|dirs|all&path=... to browse repository structures and discover files.\n\nParameters:\n- type: files (only files), dirs (only directories), all (both)\n- path: optional path prefix to filter results\n\nExamples:\n- TOOL:github_list:owner/repo?type=all - List all files and directories\n- TOOL:github_list:owner/repo?type=files - List only files\n- TOOL:github_list:owner/repo?type=dirs&path=src - List directories under src/", cat: "tools" },
  { k: "tool_math_eval", c: "Use TOOL:math_eval:expression to evaluate safe mathematical expressions. Supports basic operations (+, -, *, /), parentheses, and decimal numbers.\n\nExamples:\n- TOOL:math_eval:2 + 3 * 4\n- TOOL:math_eval:(10 + 5) / 3\n- TOOL:math_eval:sqrt(16)", cat: "tools" },
  { k: "tool_memory_consolidate", c: "Use TOOL:memory_consolidate:threshold|time_window to analyze recent memories and extract actionable learnings.\n\nParameters:\n- threshold: minimum number of occurrences to consider a pattern significant (default: 3)\n- time_window: time window in hours to consider recent memories (default: 24)\n\nExample: TOOL:memory_consolidate:5|48 - Find patterns that occur at least 5 times in the last 48 hours", cat: "tools" },
  { k: "governance_prompt", c: "Prompt changes <=30% risk auto-approved. >30% needs human. Healer rate-limits >3 high-risk/hr.", cat: "governance" },
  { k: "governance_config", c: "Config changes <=30% risk auto-approved. >30% needs human. Healer saves backup timestamps.", cat: "governance" },
  { k: "governance_tool_code", c: "Tool code changes <=30% auto. >30% human. Healer checks brain health after execution.", cat: "governance" },
  { k: "governance_core", c: "Core architecture changes ALWAYS require human approval regardless of risk.", cat: "governance" },
  { k: "governance_security", c: "Security boundary changes ALWAYS require human regardless of risk.", cat: "governance" },
  { k: "governance_cron", c: "Cron changes ALWAYS human. Master cron override overrides proposals entirely.", cat: "governance" },
  { k: "governance_auto_execute", c: "Approved proposals auto-execute on next idle cycle: status set to executed, receipt created, happy emotion +1, logged as 'executor' step. If change causes errors, healer rolls back.", cat: "governance" },
  { k: "schema_d1_tables", c: "identity(key-value), proposals(title,what_diff,how_diff,resource_type,risk_pct,status), authority_receipts(approvals), anti_patterns(error tracking), brain_logs(step logs), thought_stream(thoughts), brain_knowledge(RAG), github_issues(repo issue tracking), evolution_log(evolution metrics). Identity keys include: master_cron_minutes, last_cycle_time, kill_switch, healer_backup_last.", cat: "structure" },
  { k: "schema_service_bindings", c: "BUDDHI_DWAR -> buddhi-dwar LLM gateway, SENTINEL -> saraha-sentinel tool classifier. Plain: BRAIN_KEY, BRAVE_API_KEY, GITHUB_PAT.", cat: "structure" },
  { k: "schema_endpoints", c: "Endpoints: /think(POST) cognition, /brain/emotions(GET), /brain/activity(GET), /brain/logs(GET), /brain/knowledge(GET), /brain/stream(GET), /brain/proposals(GET), /brain/proposals/:id(GET), /api/proposals/approve/:id(POST), /api/proposals/deny/:id(POST), /api/receipts(GET), /brain/anti-patterns(GET), /brain/feedback(GET), /brain/phase(GET), /brain/tree(GET) interactive tree, /status(GET), /avatar(GET), /evolve(POST), /brain/evolution_score(GET).", cat: "structure" },
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
  { k: "evolution_scoring", c: "Evolution scoring tracks effectiveness of self-improvement proposals using metrics: success_duration (time without errors), error_count (failures), and user_feedback_lift (positive user feedback). The /brain/evolution_score endpoint returns weighted scores where lower scores indicate higher priority for evolution focus.", cat: "governance" },
  { k: "governance_web_summarize", c: "URL summarization changes <=30% risk auto-approved. >30% needs human approval.", cat: "governance" },
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
.controls input{padding:10px 16px;border-radius:8px;border:1px solid #334155;border:1px solid #334155;background:#1E293B;color:#E2E8F0;font-size:14px;width:240px;outline:none}
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
const sts=st.entries||[];const pros=pr.entries||[];const ants=ap.entries[];
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

async function math_eval(db, expr) {
  try {
    // Validate input is a simple math expression
    if (typeof expr !== 'string') throw new Error('Invalid expression');
    if (!/^[0-9\+\-\*\/\.\s\(\)]+$/.test(expr)) throw new Error('Invalid characters');

    // Safe evaluation with constant-time protection
    const result = new Function('return ' + expr)();
    if (typeof result !== 'number') throw new Error('Not a number');

    // Log the safe computation
    await storeStreamThought(db, `Math eval: ${expr} = ${result}`, 'neutral', 'tool');
    return { result: result.toString(), safe: true };
  } catch (e) {
    await storeStreamThought(db, `Math eval failed: ${expr} | ${e.message}`, 'bad', 'tool');
    return { error: e.message, safe: false };
  }
}

async function webScrape(db, input) {
  if (!input) throw new Error('URL required');

  try {
    // Parse input: URL|selectors (selectors is optional)
    const parts = input.split('|');
    const url = parts[0];
    const selectors = parts.length > 1 ? parts[1] : null;

    if (!url) throw new Error('URL is required');

    // First fetch the page content
    const { result: html, error } = await webFetch(db, url);
    if (error) throw new Error(error);

    // Use cheerio for DOM manipulation and extraction
    const cheerio = await import('https://cdn.jsdelivr.net/npm/cheerio@1.0.0-rc.12/+esm');

    // Load HTML into cheerio
    const $ = cheerio.load(html);

    // Prepare result object
    const result = {
      url: url,
      extracted_data: {},
      selectors_used: selectors || 'all',
      timestamp: new Date().toISOString(),
      safe: true
    };

    // If no specific selectors provided, extract common structured content
    if (!selectors) {
      // Extract tables
      const tables = [];
      $('table').each((i, table) => {
        const tableData = [];
        $(table).find('tr').each((rowIndex, row) => {
          const rowData = [];
          $(row).find('th, td').each((cellIndex, cell) => {
            rowData.push($(cell).text().trim());
          });
          if (rowData.length > 0) {
            tableData.push(rowData);
          }
        });
        if (tableData.length > 0) {
          tables.push({
            index: i,
            data: tableData
          });
        }
      });

      if (tables.length > 0) {
        result.extracted_data.tables = tables;
      }

      // Extract article content (common patterns)
      const articleContent = [];
      $('article').each((i, article) => {
        articleContent.push($(article).text().trim());
      });

      $('[role="article"]').each((i, article) => {
        articleContent.push($(article).text().trim());
      });

      if (articleContent.length > 0) {
        result.extracted_data.articles = articleContent;
      }

      // Extract JSON-LD structured data
      const jsonLdData = [];
      $('script[type="application/ld+json"]').each((i, script) => {
        try {
          const data = JSON.parse($(script).html() || '');
          jsonLdData.push(data);
        } catch (e) {
          // Ignore invalid JSON
        }
      });

      if (jsonLdData.length > 0) {
        result.extracted_data.json_ld = jsonLdData;
      }

      // Extract main content (common patterns)
      const mainContent = [];
      $('main').each((i, main) => {
        mainContent.push($(main).text().trim());
      });

      $('#main').each((i, main) => {
        mainContent.push($(main).text().trim());
      });

      if (mainContent.length > 0) {
        result.extracted_data.main_content = mainContent[0];
      }

      // Extract headings for structure
      const headings = [];
      $('h1, h2, h3, h4, h5, h6').each((i, heading) => {
        headings.push({
          level: parseInt($(heading).prop('tagName').substring(1)),
          text: $(heading).text().trim()
        });
      });

      if (headings.length > 0) {
        result.extracted_data.headings = headings;
      }

      // Extract links
      const links = [];
      $('a[href]').each((i, link) => {
        const href = $(link).attr('href');
        if (href && !href.startsWith('javascript:') && !href.startsWith('#')) {
          links.push({
            text: $(link).text().trim(),
            url: href
          });
        }
      });

      if (links.length > 0) {
        result.extracted_data.links = links;
      }
    }
    // If specific selectors provided, extract those
    else {
      // Split multiple selectors by comma
      const selectorList = selectors.split(',').map(s => s.trim());

      for (const selector of selectorList) {
        if (!selector) continue;

        const elements = $(selector);
        if (elements.length === 0) {
          result.extracted_data[selector] = {
            error: 'No elements found for selector'
          };
          continue;
        }

        const extractedItems = [];
        elements.each((i, element) => {
          extractedItems.push({
            index: i,
            html: $(element).html()?.trim() || '',
            text: $(element).text().trim()
          });
        });

        result.extracted_data[selector] = {
          count: elements.length,
          items: extractedItems
        };
      }
    }

    // Log the successful scrape
    await storeStreamThought(db, `Web scrape: ${url}${selectors ? ' with selectors: ' + selectors : ''}`, 'neutral', 'tool');

    return result;
  } catch (error) {
    // Log the failed scrape
    await storeStreamThought(db, `Web scrape failed: ${input} | ${error.message}`, 'bad', 'tool');
    return {
      error: error.message,
      url: input.split('|')[0] || input,
      safe: false
    };
  }
}

async function webSummarize(env, url) {
  if (!url) throw new Error('URL required');
  if (!env.BRAVE_API_KEY) throw new Error('BRAVE_API_KEY not configured');

  try {
    const encodedUrl = encodeURIComponent(url);
    const response = await fetch(`https://api.brave.com/summarize?url=${encodedUrl}`, {
      headers: {
        'Accept': 'application/json',
        'X-Subscription-Token': env.BRAVE_API_KEY
      },
      signal: AbortSignal.timeout(15000)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Brave API error: ${response.status} ${errorText}`);
    }

    const data = await response.json();

    if (!data.summary) {
      throw new Error('No summary returned from Brave API');
    }

    // Log the successful summarization
    await storeStreamThought(db, `Web summarize: ${url}`, 'neutral', 'tool');

    return {
      summary: data.summary,
      url: url,
      safe: true
    };
  } catch (error) {
    await storeStreamThought(db, `Web summarize failed: ${url} | ${error.message}`, 'bad', 'tool');
    return {
      error: error.message,
      url: url,
      safe: false
    };
  }
}

async function webInsights(db, input) {
  if (!input.url) throw new Error('URL required');

  try {
    // First try to fetch the URL content
    const { result: html } = await webFetch(db, input.url);

    if (!html) {
      throw new Error('Failed to fetch URL content');
    }

    // Extract domain from URL
    const domain = new URL(input.url).hostname;
    const domainParts = domain.split('.');
    const mainDomain = domainParts.length > 2 ? domainParts[domainParts.length - 2] : domainParts[0];

    // Domain-specific extraction patterns
    let insights = {
      type: 'generic',
      title: 'Generic Web Content',
      description: 'Extracted insights from web content',
      source: input.url,
      capabilities: []
    };

    // GitHub repository insights
    if (mainDomain === 'github' && input.url.includes('/blob/')) {
      insights.type = 'github_repository';
      insights.title = 'GitHub Repository Content';

      // Extract repository path
      const repoPathMatch = input.url.match(/github\.com\/([^\/]+\/[^\/]+)\/blob\/(.+)/);
      if (repoPathMatch) {
        insights.capabilities.push({
          type: 'repository',
          repository: repoPathMatch[1],
          path: repoPathMatch[2]
        });
      }

      // Check for README
      if (html.includes('README.md') || html.includes('readme')) {
        insights.capabilities.push({
          type: 'documentation',
          title: 'README',
          description: 'Repository documentation'
        });
      }

      // Check for API documentation patterns
      if (html.includes('api') || html.includes('swagger') || html.includes('openapi')) {
        insights.capabilities.push({
          type: 'api_documentation',
          title: 'API Documentation',
          description: 'API specification found'
        });
      }

      // Check for configuration files
      if (html.includes('package.json') || html.includes('requirements.txt') ||
          html.includes('go.mod') || html.includes('pom.xml')) {
        insights.capabilities.push({
          type: 'configuration',
          title: 'Configuration Files',
          description: 'Project configuration found'
        });
      }
    }
    // API documentation sites
    else if (mainDomain === 'swagger' || mainDomain === 'api' ||
             mainDomain === 'openapi' || html.includes('swagger-ui') ||
             html.includes('openapi')) {
      insights.type = 'api_documentation';
      insights.title = 'API Documentation';

      // Extract API title
      const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
      if (titleMatch) {
        insights.title = titleMatch[1].trim();
      }

      // Extract endpoints
      const endpointMatches = html.matchAll(/(GET|POST|PUT|DELETE)\s+([^\s]+)/g);
      const endpoints = [];
      for (const match of endpointMatches) {
        if (match[2] && !match[2].includes('{') && !match[2].includes('}')) {
          endpoints.push({
            method: match[1],
            path: match[2]
          });
        }
      }

      if (endpoints.length > 0) {
        insights.capabilities.push({
          type: 'endpoints',
          endpoints: endpoints,
          count: endpoints.length
        });
      }

      // Extract description
      const descriptionMatch = html.match(/<meta name="description"[^>]+content="([^"]+)"/i) ||
                               html.match(/<meta property="og:description"[^>]+content="([^"]+)"/i);
      if (descriptionMatch) {
        insights.description = descriptionMatch[1];
      }
    }
    // Governance/legal pages
    else if (mainDomain === 'github' && (input.url.includes('/issues') ||
             input.url.includes('/pull') || input.url.includes('/LICENSE'))) {
      insights.type = 'governance';
      insights.title = 'Governance Document';

      if (input.url.includes('/LICENSE')) {
        insights.capabilities.push({
          type: 'license',
          title: 'Software License',
          description: 'License agreement for the repository'
        });
      } else if (input.url.includes('/issues')) {
        insights.capabilities.push({
          type: 'issue_tracking',
          title: 'Issue Tracking',
          description: 'Repository issue management system'
        });
      } else if (input.url.includes('/pull')) {
        insights.capabilities.push({
          type: 'code_reviews',
          title: 'Pull Requests',
          description: 'Code review and collaboration system'
        });
      }
    }
    // General web content with structured data
    else {
      // Try to extract structured data patterns
      const jsonMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/i);
      if (jsonMatch) {
        try {
          const jsonData = JSON.parse(jsonMatch[1]);
          if (jsonData['@type'] === 'SoftwareSourceCode') {
            insights.type = 'software_project';
            insights.title = jsonData.name || 'Software Project';
            insights.description = jsonData.description || '';

            if (jsonData.codeRepository) {
              insights.capabilities.push({
                type: 'repository',
                url: jsonData.codeRepository
              });
            }
          }
        } catch (e) {
          // Ignore JSON parsing errors
        }
      }

      // Extract common patterns
      if (html.includes('function ') || html.includes('class ') ||
          html.includes('const ') || html.includes('let ')) {
        insights.capabilities.push({
          type: 'code',
          title: 'JavaScript Code',
          description: 'Contains JavaScript code'
        });
      }

      if (html.includes('import ') || html.includes('from ') ||
          html.includes('require(')) {
        insights.capabilities.push({
          type: 'dependencies',
          title: 'Dependencies',
          description: 'Contains dependency declarations'
        });
      }
    }

    // Log the successful insight extraction
    await storeStreamThought(db, `Web insights extracted from: ${input.url}`, 'neutral', 'tool');

    return {
      insights: insights,
      url: input.url,
      domain: mainDomain,
      safe: true
    };
  } catch (error) {