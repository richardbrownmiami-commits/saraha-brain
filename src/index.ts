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

const AVATAR_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Saraha â€“ Avatar</title>
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
