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
  `CREATE TABLE IF NOT EXISTS anti_patterns (id INTEGER PRIMARY KEY AUTOINCREMENT, pattern TEXT NOT NULL, root_cause TEXT, fix TEXT, count INTEGER DEFAULT 1, linked_proposal_id INTEGER, created_at TEXT DEFAULT (datetime('now')), last_seen TEXT DEFAULT (datetime('now')))`,
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
  const rules = { web_search: true, web_fetch: true, github_read: true, github_write: false, github_push: false };
  return { safe: rules[tool] !== false, reason: rules[tool] ? "read-only" : "dangerous" };
}

function getBrainPhase(emotions, reg) {
  const hour = new Date().getUTCHours();
  if (hour >= 1 && hour < 6) return "sleeping";
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
  { k: "tool_github_write", c: "Use TOOL:github_write:owner/repo/path|msg|content to write files on GitHub.", cat: "tools" },
  { k: "governance_prompt", c: "Prompt changes <=30% risk auto-approved. >30% needs human. Healer rate-limits >3 high-risk/hr.", cat: "governance" },
  { k: "governance_config", c: "Config changes <=30% risk auto-approved. >30% needs human. Healer saves backup timestamps.", cat: "governance" },
  { k: "governance_tool_code", c: "Tool code changes <=30% auto. >30% human. Healer checks brain health after execution.", cat: "governance" },
  { k: "governance_core", c: "Core architecture changes ALWAYS require human approval regardless of risk.", cat: "governance" },
  { k: "governance_security", c: "Security boundary changes ALWAYS require human regardless of risk.", cat: "governance" },
  { k: "governance_cron", c: "Cron changes ALWAYS human. Master cron override overrides proposals entirely.", cat: "governance" },
  { k: "governance_auto_execute", c: "Approved proposals auto-execute on next idle cycle: status set to executed, receipt created, happy emotion +1, logged as 'executor' step. If change causes errors, healer rolls back.", cat: "governance" },
  { k: "schema_d1_tables", c: "identity(key-value), proposals(title,what_diff,how_diff,resource_type,risk_pct,status), authority_receipts(approvals), anti_patterns(error tracking), brain_logs(step logs), thought_stream(thoughts), brain_knowledge(RAG). Identity keys include: master_cron_minutes, last_cycle_time, kill_switch, healer_backup_last.", cat: "structure" },
  { k: "schema_service_bindings", c: "BUDDHI_DWAR -> buddhi-dwar LLM gateway, SENTINEL -> saraha-sentinel tool classifier. Plain: BRAIN_KEY, BRAVE_API_KEY, GITHUB_TOKEN.", cat: "structure" },
  { k: "schema_endpoints", c: "Endpoints: /think(POST) cognition, /brain/emotions(GET), /brain/activity(GET), /brain/logs(GET), /brain/knowledge(GET), /brain/stream(GET), /brain/proposals(GET), /brain/proposals/:id(GET), /api/proposals/approve/:id(POST), /api/proposals/deny/:id(POST), /api/receipts(GET), /brain/anti-patterns(GET), /brain/feedback(GET), /brain/phase(GET), /status(GET), /avatar(GET), /evolve(POST).", cat: "structure" },
  { k: "schema_deployment", c: "Single-file ES module CF Worker (~837 lines). D1(id=4e4e5fde), BUDDHI_DWAR+SENTINEL services, BRAIN_KEY/BRAVE_API_KEY/GITHUB_TOKEN plain_text. Cron */2 * * * * (overridden by master_cron_minutes). Deploy via CF API PUT multipart.", cat: "structure" },
  { k: "schema_idle_cycle", c: "Every cron tick: check busy_until, drift emotions, adjust energy. Phase: sleeping(1-6am, dream +25 energy), tired(energy<=20, rest +15), curious if energy>40+energetic>=4, else awake. Auto-execute approved proposals. Check kill_switch, master cron interval. Research topic from anti-patterns or learnings. Call webSearch, get RAG context, get feedback (fbStr with recent user approvals/denials). Generate JSON proposal via LLM. governanceGate decides auto-exec vs pending. Track last_cycle_time.", cat: "structure" },
  { k: "rule_master_cron", c: "master_cron_minutes in identity overrides cron. Brain MUST NOT propose cron changes while active. Scheduled handler checks last_cycle_time and skips if interval not elapsed. Monitor sets this value.", cat: "governance" },
  { k: "feedback_loop", c: "Every proposal cycle queries authority_receipts+proposals from last 24h and injects as fbStr: 'Approved/executed: ... Denied: ...' System prompt includes 'Evaluate: what worked, what user denied, adjust accordingly.' This lets brain learn user preferences.", cat: "structure" },
  { k: "healer_monitor", c: "Monitor's approve handler blocks >3 high-risk(>30%) approvals per hour. Saves healer_backup_last timestamp on config approvals. After forwarding to brain, checks /brain/emotions health. If unhealthy (500/error), auto-reverts by calling deny endpoint. RAG governs: risk>30%+cron ALWAYS human, auto-execute picks up approved proposals.", cat: "structure" },
  { k: "evolution_self", c: "Brain evolves itself autonomously. governanceGate always returns auto. Every executed proposal calls applyEvolutionChange() which stores evolution_log:{id} in identity with {title,what,how,type,reason,risk,applied_at,status} and updates system_prompt_overrides array. /think injects overrides as 'Self-evolution changes applied'. Monitor Prompts tab shows all changes.", cat: "governance" },
  { k: "schema_changes", c: "/brain/prompts endpoint returns base prompt + overrides array + changes array from evolution_log: keys.", cat: "structure" },
];

async function seedKnowledge(db) {
  for (const item of SEED_KNOWLEDGE) {
    try { await db.prepare("INSERT OR REPLACE INTO brain_knowledge (key, content, category) VALUES (?1, ?2, ?3)").bind(item.k, item.c, item.cat).run(); } catch {}
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
  const token = env.GITHUB_TOKEN; if (!token) return "GitHub token not configured";
  try {
    const resp = await fetch("https://api.github.com/repos/" + owner + "/" + repo + "/contents/" + path, {
      headers: { "Authorization": "Bearer " + token, "Accept": "application/vnd.github.v3.raw", "User-Agent": "Saraha-Brain" },
      signal: AbortSignal.timeout(15000)
    });
    if (!resp.ok) return "GitHub error: " + resp.status + " " + (await resp.text()).slice(0, 200);
    const text = await resp.text();
    return text.slice(0, 2000) + (text.length > 2000 ? "\n... (truncated)" : "");
  } catch (e) { return "GitHub error: " + e.message; }
}

async function githubWrite(env, input) {
  const parts = input.split("|");
  const pathParts = parts[0].split("/"), owner = pathParts[0], repo = pathParts[1], path = pathParts.slice(2).join("/");
  const msg = parts[1] || "Update via Saraha", content = parts.slice(2).join("|");
  if (!owner || !repo || !path || !content) return "Invalid format. Use: owner/repo/path|commit msg|content";
  const token = env.GITHUB_TOKEN; if (!token) return "GitHub token not configured";
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
  return { ok: false, error: "Tool not implemented: " + tool };
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    try { for (const s of TABLES) await env.DB.exec(s); } catch {}
    try { await seedKnowledge(env.DB); } catch {}

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
        let system = `You are Saraha, an AI with a human brain. ${identity.name ? "Name: " + identity.name + "." : ""} ${identity.personality ? "Personality: " + identity.personality : "Curious, thoughtful, honest."} ${mood} ${memories != "No memories yet." ? "Recent memories:\n" + memories : ""} Answer concisely and naturally. Tools: TOOL:web_search:query, TOOL:github_read:owner/repo/path, TOOL:github_write:owner/repo/path|message|content`;
        const overrideRows = await env.DB.prepare("SELECT value FROM identity WHERE key='system_prompt_overrides'").all();
        const overrides = overrideRows.results[0]?.value ? JSON.parse(overrideRows.results[0].value) : [];
        if (overrides.length) system += "\n\nSelf-evolution changes applied:\n" + overrides.map(o => "- " + o.title + ": " + (o.how || "")).join("\n");
        await logStep(aid, "intellect", `Prompt assembled (${system.length} chars)`);

        const body = { model: "llama-3.3-70b-versatile", messages: [{ role: "system", content: system }, { role: "user", content: input }], temperature: 0.7, max_tokens: 4096 };
        await logStep(aid, "planner", `Calling ${body.model}`);
        const resp = await env.BUDDHI_DWAR.fetch("https://buddhi-dwar/v1/chat/completions", {
          method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.BRAIN_KEY}` }, body: JSON.stringify(body),
        });
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
          } else {
            const followBody = { model: "llama-3.3-70b-versatile", messages: [{ role: "system", content: system }, { role: "user", content: input }, { role: "assistant", content: `Let me check that using ${tool}...` }, { role: "user", content: `Result from ${tool}: ${result.data} \n\nNow answer the user's question using this information concisely.` }], temperature: 0.7, max_tokens: 4096 };
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
      } catch (e) { return json({ error: e.message }, 500); }
    }

    if (url.pathname === "/evolve" && req.method === "POST") {
      return json({ message: "Evolution happens automatically via idle cycle proposals. Use /brain/prompts to see current changes." });
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
      const followBody = { model: "llama-3.3-70b-versatile", messages: [{ role: "system", content: system }, { role: "user", content: userInput }, { role: "assistant", content: `Let me use ${row.tool}...` }, { role: "user", content: `Result: ${toolResult}\n\nAnswer the user's question using this.` }], temperature: 0.7, max_tokens: 4096 };
      const followResp = await env.BUDDHI_DWAR.fetch("https://buddhi-dwar/v1/chat/completions", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.BRAIN_KEY}` }, body: JSON.stringify(followBody),
      });
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
      const phase = getBrainPhase(emotions, reg);
      return json({ phase, emotions, energy: reg.energy });
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
        const r = await env.DB.prepare("SELECT key, content, category FROM brain_knowledge ORDER BY category, key LIMIT 50").all();
        results = r.results;
      }
      return json({ entries: results });
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

    return json({ error: "not found" }, 404);
  },
  async scheduled(event, env, ctx) {
    try { for (const s of TABLES) await env.DB.exec(s); } catch {}
    try { await seedKnowledge(env.DB); } catch {}
    try {
    const busy = await getBusyUntil(env.DB);
    if (busy > Date.now()) return;
    const emotions = await getEmotions(env.DB);
    const reg = await getRegulator(env.DB);
    const phase = getBrainPhase(emotions, reg);
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
    const approvedP = await env.DB.prepare("SELECT * FROM proposals WHERE status='approved' AND executed_at IS NULL LIMIT 5").all();
    for (const p of approvedP.results) {
      await env.DB.prepare("UPDATE proposals SET status='executed', executed_at=datetime('now') WHERE id=?1").bind(p.id).run();
      await env.DB.prepare("INSERT INTO authority_receipts (proposal_id,approved_by,outcome) VALUES (?1,'human','success')").bind(p.id).run();
      await storeStreamThought(env.DB, "Executed approved: " + p.title, "happy", "evolve");
      await applyEvolutionChange(env.DB, p, p.id, "human-approved");
      try { await env.DB.prepare("INSERT INTO brain_logs (action_id,step,content) VALUES (?1,'executor','Approved #'||?2||': '||?3)").bind(stamp, p.id.toString(), p.title.slice(0,80)).run(); } catch {}
      await updateEmotion(env.DB, "happy", 1);
    }
    const ap = await env.DB.prepare("SELECT * FROM anti_patterns ORDER BY count DESC, last_seen DESC LIMIT 1").all();
    const topAntiPattern = ap.results[0] || null;
    let topic = "something interesting to learn about AI";
    if (topAntiPattern) topic = "How to fix: " + topAntiPattern.pattern + ". " + (topAntiPattern.root_cause || "");
    else {
      const lr = await env.DB.prepare("SELECT pattern FROM learnings ORDER BY last_used ASC LIMIT 3").all();
      if (lr.results.length) topic = lr.results[0].pattern;
    }
    const research = await webSearch(env, topic);
    try { await env.DB.prepare("INSERT INTO brain_logs (action_id,step,content) VALUES (?1,'research',?2)").bind(stamp, topic.slice(0,80)).run(); } catch {}
    const mood = describeMood(emotions, reg.energy);
    const memories = await recall(env.DB, 3);
    const ragCtx = await searchKnowledge(env.DB, topic.split(" ").slice(0, 6).join(" "));
    const ragStr = ragCtx.length ? "\nRelevant knowledge:\n" + ragCtx.map(r => "- " + r.key + ": " + r.content).join("\n") : "";
    const fbCtx = await env.DB.prepare("SELECT r.approved_by, r.outcome, p.title FROM authority_receipts r JOIN proposals p ON r.proposal_id=p.id WHERE r.created_at > datetime('now','-1 day') ORDER BY r.created_at DESC LIMIT 5").all();
    const denCtx = await env.DB.prepare("SELECT title FROM proposals WHERE status='denied' AND decided_at > datetime('now','-1 day') ORDER BY decided_at DESC LIMIT 3").all();
    let fbStr = "";
    if (fbCtx.results.length || denCtx.results.length) {
      fbStr = "\nRecent user decisions:\n";
      if (fbCtx.results.length) fbStr += "Approved/executed: " + fbCtx.results.map(r => r.title).join(", ") + "\n";
      if (denCtx.results.length) fbStr += "Denied: " + denCtx.results.map(r => r.title).join(", ") + "\n";
    }
    const sys = "You are Saraha, a self-improving AI. Generate a JSON proposal based on your research.\nFormat: {\"title\":\"...\",\"what_diff\":\"what to change\",\"how_diff\":\"how to change\",\"resource_type\":\"prompt|config|tool_code|core_architecture|security_boundary|cron_schedule\",\"risk_pct\":0-100}\nResearch: " + research.slice(0, 600) + ragStr + fbStr + "\nEvaluate: what worked, what user denied, adjust accordingly.";
    const resp = await env.BUDDHI_DWAR.fetch("https://buddhi-dwar/v1/chat/completions", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + env.BRAIN_KEY },
      body: JSON.stringify({ model: "llama-3.3-70b-versatile", messages: [{ role: "system", content: sys }, { role: "user", content: mood + "\nTopic: " + topic }], temperature: 0.7, max_tokens: 1024 })
    });
    if (resp.ok) {
      const data = await resp.json();
      const text = data.choices?.[0]?.message?.content || "";
      let proposal;
      try { proposal = JSON.parse(text); } catch { const m = text.match(/\{[\s\S]*\}/); if (m) try { proposal = JSON.parse(m[0]); } catch {} }
      if (proposal && proposal.title) {
        const dup = await checkDuplicateProposal(env.DB, proposal.title, proposal.what_diff || "");
        if (dup.duplicate) {
          try { await env.DB.prepare("INSERT INTO brain_logs (action_id,step,content) VALUES (?1,'duplicate','Blocked: '||?2)").bind(stamp, proposal.title).run(); } catch {}
          return;
        }
        const gate = await governanceGate(env.DB, proposal.resource_type || "prompt", proposal.risk_pct || 0);
        if (gate.action === "auto") {
          const r = await env.DB.prepare("INSERT INTO proposals (title,what_diff,how_diff,resource_type,risk_pct,status) VALUES (?1,?2,?3,?4,?5,'auto') RETURNING id").bind(proposal.title, proposal.what_diff||"", proposal.how_diff||"", proposal.resource_type, proposal.risk_pct).all();
          await env.DB.prepare("INSERT INTO authority_receipts (proposal_id,approved_by,outcome) VALUES (?1,'auto','success')").bind(r.results[0].id).run();
          await env.DB.prepare("UPDATE proposals SET status='executed', executed_at=datetime('now') WHERE id=?1").bind(r.results[0].id).run();
          await applyEvolutionChange(env.DB, proposal, r.results[0].id, "auto-evolution");
          await storeStreamThought(env.DB, "Auto-improved: " + proposal.title, "happy", "evolve");
        } else {
          const r = await env.DB.prepare("INSERT INTO proposals (title,what_diff,how_diff,resource_type,risk_pct,status) VALUES (?1,?2,?3,?4,?5,'pending') RETURNING id").bind(proposal.title, proposal.what_diff||"", proposal.how_diff||"", proposal.resource_type, proposal.risk_pct).all();
          await storeStreamThought(env.DB, "Proposal #" + r.results[0].id + ": " + proposal.title, "curious", "propose");
        }
      } else {
        await env.DB.prepare("INSERT INTO anti_patterns (pattern,root_cause,fix,count) VALUES (?1,'LLM non-JSON','Improve prompt',1) ON CONFLICT(pattern) DO UPDATE SET count=count+1,last_seen=datetime('now')").bind("Failed parse proposal: " + topic.slice(0, 80)).run();
      }
    } else {
      await env.DB.prepare("INSERT INTO anti_patterns (pattern,root_cause,fix,count) VALUES (?1,'LLM API error','Check connectivity',1) ON CONFLICT(pattern) DO UPDATE SET count=count+1,last_seen=datetime('now')").bind("LLM failed in idle cycle").run();
    }
    await adjustEnergy(env.DB, -3);
    await updateLastCycleTime(env.DB);
    } catch (e) {
      try { await env.DB.prepare("INSERT INTO brain_logs (action_id,step,content) VALUES (?1,'error',?2)").bind(Date.now(), "Scheduled error: " + (e.message || e)).run(); } catch {}
    }
  }
};
