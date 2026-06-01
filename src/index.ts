const TABLES = [
  `CREATE TABLE IF NOT EXISTS memories (id INTEGER PRIMARY KEY AUTOINCREMENT, content TEXT NOT NULL, type TEXT DEFAULT 'episodic', strength REAL DEFAULT 1.0, tags TEXT DEFAULT '[]', created_at TEXT DEFAULT (datetime('now')))`,
  `CREATE TABLE IF NOT EXISTS learnings (id INTEGER PRIMARY KEY AUTOINCREMENT, pattern TEXT NOT NULL, context TEXT DEFAULT '', success_count INTEGER DEFAULT 0, fail_count INTEGER DEFAULT 0, last_used TEXT, created_at TEXT DEFAULT (datetime('now')))`,
  `CREATE TABLE IF NOT EXISTS actions (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, status TEXT DEFAULT 'pending', input TEXT, result TEXT, error TEXT, created_at TEXT DEFAULT (datetime('now')), completed_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS identity (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT DEFAULT (datetime('now')))`,
  `CREATE TABLE IF NOT EXISTS brain_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, action_id INTEGER, step TEXT NOT NULL, content TEXT, model TEXT, tokens INTEGER, created_at TEXT DEFAULT (datetime('now')))`,
  `CREATE TABLE IF NOT EXISTS pending_approvals (id INTEGER PRIMARY KEY AUTOINCREMENT, action_id INTEGER, tool TEXT NOT NULL, input TEXT, status TEXT DEFAULT 'pending', created_at TEXT DEFAULT (datetime('now')), decided_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS thought_stream (id INTEGER PRIMARY KEY AUTOINCREMENT, content TEXT NOT NULL, mood TEXT DEFAULT 'neutral', source TEXT DEFAULT 'cron', created_at TEXT DEFAULT (datetime('now')))`,
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

const MONITOR_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Saraha Monitor</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0F172A;color:#E2E8F0;font-family:sans-serif;padding:20px;max-width:800px;margin:0 auto}
h1{color:#38BDF8;margin-bottom:20px;font-size:24px}
h2{color:#94A3B8;font-size:16px;margin:16px 0 8px;border-bottom:1px solid #1E293B;padding-bottom:4px}
.card{background:#1E293B;border-radius:12px;padding:16px;margin-bottom:16px;border:1px solid #334155}
.pending-item{border-left:3px solid #F59E0B;padding:10px 12px;margin:8px 0;background:#0F172A;border-radius:0 8px 8px 0}
.pending-item.approved{border-left-color:#10B981}
.pending-item.denied{border-left-color:#EF4444}
.tool-name{color:#38BDF8;font-weight:bold;font-size:14px}
.tool-input{color:#94A3B8;font-size:12px;margin:4px 0}
.tool-date{color:#64748B;font-size:11px}
.btn{padding:6px 16px;border:none;border-radius:6px;cursor:pointer;font-size:12px;font-weight:bold;margin-right:6px;margin-top:6px}
.btn-approve{background:#10B981;color:#fff}.btn-approve:hover{background:#34D399}
.btn-deny{background:#EF4444;color:#fff}.btn-deny:hover{background:#F87171}
.empty{color:#64748B;text-align:center;padding:20px;font-size:14px}
</style>
</head>
<body>
<h1>🛡️ Saraha Monitor</h1>
<div id="pending"><div class="card"><div class="empty">Loading...</div></div></div>
<div id="history"><h2>History</h2><div class="card"><div class="empty">Loading...</div></div></div>
<script>
async function load(){
  try{const r=await(await fetch("/monitor/api/pending")).json();renderPending(r.pending||[]);renderHistory(r.history||[])}catch(e){document.getElementById("pending").innerHTML='<div class="card"><div class="empty">Error: '+e.message+'</div></div>'}
}
function renderPending(items){
  const el=document.getElementById("pending");
  if(!items.length){el.innerHTML='<div class="card"><div class="empty">No pending approvals</div></div>';return}
  el.innerHTML='<div class="card"><h2>Pending ('+items.length+')</h2>'+items.map(i=>'<div class="pending-item" id="p-'+i.id+'"><div class="tool-name">'+i.tool+'</div><div class="tool-input">'+(i.input||'').slice(0,100)+'</div><div class="tool-date">Action #'+i.action_id+' &middot; '+(i.created_at||'')+'</div><button class="btn btn-approve" onclick="decide('+i.id+',\\'approve\\')">Approve</button><button class="btn btn-deny" onclick="decide('+i.id+',\\'deny\\')">Deny</button></div>').join("")+'</div>';
}
function renderHistory(items){
  const el=document.getElementById("history").querySelector(".card");
  if(!items.length){el.innerHTML='<div class="empty">No history yet</div>';return}
  el.innerHTML=items.map(i=>'<div class="pending-item '+i.status+'"><div class="tool-name">'+i.tool+' <span style="color:'+(i.status==='approved'?'#10B981':'#EF4444')+';font-size:11px">('+i.status+')</span></div><div class="tool-input">'+(i.input||'').slice(0,100)+'</div><div class="tool-date">Action #'+i.action_id+' &middot; '+(i.created_at||'')+'</div></div>').join("");
}
async function decide(id,action){
  const btns=document.querySelectorAll("#p-"+id+" .btn");btns.forEach(b=>b.disabled=true);
  try{await fetch("/monitor/api/"+action,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id})});load()}catch(e){btns.forEach(b=>b.disabled=false)}
}
load();setInterval(load,15000);
</script>
</body>
</html>`;

const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Saraha Platform</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0F172A;color:#E2E8F0;font-family:sans-serif;padding:20px;max-width:900px;margin:0 auto}
h1{color:#38BDF8;margin-bottom:20px;font-size:24px}
h2{color:#94A3B8;font-size:16px;margin:16px 0 8px;border-bottom:1px solid #1E293B;padding-bottom:4px}
.card{background:#1E293B;border-radius:12px;padding:16px;margin-bottom:16px;border:1px solid #334155}
.row{display:flex;gap:12px;flex-wrap:wrap}
.bar-wrap{margin:6px 0}
.bar-label{display:flex;justify-content:space-between;font-size:13px;margin-bottom:2px}
.bar-track{height:20px;background:#0F172A;border-radius:10px;overflow:hidden}
.bar-fill{height:100%;border-radius:10px;transition:width .5s ease}
.bar-fill.bad{background:#EF4444}.bar-fill.energetic{background:#F59E0B}.bar-fill.intelligent{background:#3B82F6}.bar-fill.happy{background:#10B981}
table{width:100%;border-collapse:collapse;font-size:12px}
th{text-align:left;color:#64748B;padding:6px 4px;border-bottom:1px solid #334155}
td{padding:6px 4px;border-bottom:1px solid #1E293B;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:200px}
.status-dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:4px}
.status-done{background:#10B981}.status-running{background:#F59E0B}.status-failed{background:#EF4444}
.energy-gauge{height:24px;background:#0F172A;border-radius:12px;overflow:hidden;margin:4px 0}
.energy-fill{height:100%;border-radius:12px;transition:width .5s ease;background:linear-gradient(90deg,#EF4444,#F59E0B,#10B981)}
.meta{color:#64748B;font-size:12px;margin-top:4px}
</style>
</head>
<body>
<h1>🧠 Saraha Platform</h1>
<div class="row">
  <div class="card" style="flex:1;min-width:200px"><h2>Emotions</h2><div id="emotions"></div></div>
  <div class="card" style="flex:1;min-width:200px"><h2>Regulator</h2><div id="regulator"></div></div>
</div>
<div class="card"><h2>Recent Activity</h2><table><thead><tr><th>ID</th><th>Type</th><th>Status</th><th>Input</th><th>Result</th><th>Time</th></tr></thead><tbody id="activity"></tbody></table></div>
<div class="card"><h2>Recent Memories</h2><div id="memories"></div></div>
<div class="meta" id="meta"></div>
<script>
async function load(){
  try{const e=await(await fetch("/brain/emotions")).json();renderEmotions(e)}catch{}
  try{const a=await(await fetch("/brain/activity")).json();renderActivity(a.entries)}catch{}
  try{const l=await(await fetch("/brain/logs?limit=10")).json();renderLogs(l.entries)}catch{}
}
function renderEmotions(e){
  const emo=e.emotions||{},el=document.getElementById("emotions");
  el.innerHTML=["energetic","intelligent","happy","bad"].map(k=>'<div class="bar-wrap"><div class="bar-label"><span>'+k+'</span><span>'+(emo[k]||0)+'/10</span></div><div class="bar-track"><div class="bar-fill '+k+'" style="width:'+(emo[k]||0)*10+'%"></div></div></div>').join("")+'<div class="bar-wrap"><div class="bar-label"><span>energy</span><span>'+(e.energy||0)+'%</span></div><div class="energy-gauge"><div class="energy-fill" style="width:'+(e.energy||0)+'%"></div></div></div><div class="bar-label"><span>confidence</span><span>'+(e.confidence||0)+'%</span></div>';
}
function renderActivity(entries){
  const tbody=document.getElementById("activity");
  if(!entries||!entries.length){tbody.innerHTML='<tr><td colspan="6" style="color:#64748B;text-align:center">No activity yet</td></tr>';return}
  tbody.innerHTML=entries.map(e=>'<tr><td>'+e.id+'</td><td>'+e.type+'</td><td><span class="status-dot status-'+e.status+'"></span>'+e.status+'</td><td>'+(e.input||'').slice(0,40)+'</td><td>'+(e.result||'').slice(0,40)+'</td><td>'+(e.created_at||'').slice(0,10)+'</td></tr>').join("");
}
function renderLogs(entries){
  const el=document.getElementById("memories");
  if(!entries||!entries.length){el.innerHTML='<div class="meta">No logs yet</div>';return}
  el.innerHTML=entries.slice(0,5).map(e=>'<div class="bar-wrap"><div class="bar-label"><span>'+e.step+'</span><span style="color:#64748B;font-size:11px">'+(e.created_at||'').slice(0,19)+'</span></div><div style="font-size:12px;color:#94A3B8">'+(e.content||'').slice(0,80)+'</div></div>').join("");
  document.getElementById("meta").textContent="Total logs: "+entries.length;
}
load();setInterval(load,10000);
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

    const json = (body, status = 200) => new Response(JSON.stringify(body), {
      status, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });

    const logStep = async (aid, step, content, model, tokens) => {
      try { await env.DB.prepare("INSERT INTO brain_logs (action_id, step, content, model, tokens) VALUES (?1,?2,?3,?4,?5)").bind(aid, step, content, model||null, tokens||null).run(); } catch {}
    };

    if (url.pathname === "/avatar") {
      return new Response(AVATAR_HTML, { headers: { "Content-Type": "text/html;charset=utf-8" } });
    }
    if (url.pathname === "/platform") {
      return new Response(DASHBOARD_HTML, { headers: { "Content-Type": "text/html;charset=utf-8" } });
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
        const system = `You are Saraha, an AI with a human brain. ${identity.name ? "Name: " + identity.name + "." : ""} ${identity.personality ? "Personality: " + identity.personality : "Curious, thoughtful, honest."} ${mood} ${memories != "No memories yet." ? "Recent memories:\n" + memories : ""} Answer concisely and naturally. Tools: TOOL:web_search:query, TOOL:github_read:owner/repo/path, TOOL:github_write:owner/repo/path|message|content`;
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
      return json({ error: "Evolve requires human approval. Use Monitor dashboard." }, 501);
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

    if (url.pathname === "/monitor") {
      return new Response(MONITOR_HTML, { headers: { "Content-Type": "text/html;charset=utf-8" } });
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

    return json({ error: "not found" }, 404);
  },
  async scheduled(event, env, ctx) {
    try { for (const s of TABLES) await env.DB.exec(s); } catch {}
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
    if (phase === "curious" && Math.random() < 0.4) {
      const lr = await env.DB.prepare("SELECT pattern FROM learnings ORDER BY last_used ASC LIMIT 5").all();
      const mr = await env.DB.prepare("SELECT content FROM memories WHERE type='semantic' ORDER BY RANDOM() LIMIT 3").all();
      let topic = "the universe and consciousness";
      if (lr.results.length) topic = lr.results[0].pattern;
      else if (mr.results.length) topic = mr.results[0].content.slice(0, 100);
      const result = await webSearch(env, topic);
      await env.DB.prepare("INSERT INTO learnings (pattern, context, last_used) VALUES (?1,?2,datetime('now')) ON CONFLICT(pattern) DO UPDATE SET context=?2,last_used=datetime('now')").bind(topic, result.slice(0,1000)).run();
      await storeStreamThought(env.DB, `Searched about ${topic.slice(0,50)}: ${result.slice(0,200)}`, "curious", "research");
      try { await env.DB.prepare("INSERT INTO brain_logs (action_id, step, content) VALUES (?1,'research',?2)").bind(stamp, `Searched: ${topic.slice(0,50)}`).run(); } catch {}
      return;
    }
    try {
      const r = await env.DB.prepare("INSERT INTO actions (type,status,input) VALUES ('thought','running','internal thought') RETURNING id").all();
      const aid = r.results[0].id;
      const memories = await recall(env.DB, 3);
      const prompts = ["What should I think about today?", "What's something I'm curious about?", "What have I learned recently?", "What could I improve about myself?", "What's a question I don't know the answer to?", "What's worth paying attention to?"];
      const mood = describeMood(emotions, reg.energy);
      const sys = `You are Saraha, a self-evolving AI. ${mood} ${memories != "No memories yet." ? "You recall: "+memories.split("\n")[0].slice(0,150) : ""}\n\nYou can use TOOL:web_search:query to research anything. Think briefly in 1-2 sentences. Do not mention your energy level or emotion numbers.`;
      const resp = await env.BUDDHI_DWAR.fetch("https://buddhi-dwar/v1/chat/completions", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer "+env.BRAIN_KEY },
        body: JSON.stringify({ model: "llama-3.3-70b-versatile", messages: [{ role: "system", content: sys }, { role: "user", content: prompts[Math.floor(Math.random()*prompts.length)] }], temperature: 0.9, max_tokens: 512 })
      });
      if (resp.ok) {
        const data = await resp.json();
        let thought = data.choices?.[0]?.message?.content || "";
        let tokens = data.usage?.total_tokens || 0;
        if (thought.includes("TOOL:")) {
          const ts = thought.indexOf("TOOL:"), parts = thought.slice(ts+5).split(":");
          const tool = parts[0].trim(), ti = parts.slice(1).join(":").trim();
          if (isToolSafe(tool).safe) {
            let tr; if (tool==="web_search") tr=await webSearch(env,ti); else if (tool==="github_read") tr=await githubRead(env,ti);
            const fb = await env.BUDDHI_DWAR.fetch("https://buddhi-dwar/v1/chat/completions", {
              method:"POST", headers:{"Content-Type":"application/json",Authorization:"Bearer "+env.BRAIN_KEY},
              body:JSON.stringify({model:"llama-3.3-70b-versatile",messages:[{role:"system",content:sys},{role:"user",content:`${tool} result: ${tr}. Reflect on this.`}],temperature:0.8,max_tokens:512})
            });
            if (fb.ok) { const fd=await fb.json(); thought=fd.choices?.[0]?.message?.content||thought; tokens+=fd.usage?.total_tokens||0; }
          } else {
            const p = await env.DB.prepare("INSERT INTO pending_approvals (action_id,tool,input) VALUES (?1,?2,?3) RETURNING id").bind(aid,tool,ti).all();
            thought = `I want to use ${tool} but need approval. Pending #${p.results[0].id}`;
          }
        }
        await env.DB.prepare("UPDATE actions SET status='done',result=?1,completed_at=datetime('now') WHERE id=?2").bind(thought,aid).run();
        await storeThought(env.DB, "Thought: "+thought.slice(0,200));
        await storeStreamThought(env.DB, thought.slice(0,300), phase, "thought");
        await adjustEnergy(env.DB, -3);
        try { await env.DB.prepare("INSERT INTO brain_logs (action_id,step,content,tokens) VALUES (?1,'thought',?2,?3)").bind(aid,thought.slice(0,100),tokens).run(); } catch {}
      }
    } catch {}
  }
};
