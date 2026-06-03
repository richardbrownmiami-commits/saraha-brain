import { Database } from "@cloudflare/workers-types/experimental";

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
  `CREATE TABLE IF NOT EXISTS semantic_analysis_cache (id INTEGER PRIMARY KEY AUTOINCREMENT, text_hash TEXT UNIQUE, srl_result TEXT, coref_result TEXT, created_at TEXT DEFAULT (datetime('now')))`,
];

const EMOTIONS = ["energetic", "intelligent", "happy", "bad", "curious", "bored", "excited"];
const RANGES = { energetic: [1, 10], intelligent: [1, 10], happy: [1, 10], bad: [0, 3], curious: [1, 10], bored: [1, 10], excited: [1, 10] };
const EMO_DEFAULTS = { energetic: 5, intelligent: 5, happy: 5, bad: 0, curious: 5, bored: 5, excited: 5 };

async function getEmotions(db: Database) {
  try {
    const rows = await db.prepare("SELECT key, value FROM identity WHERE key LIKE 'emotion_%'").all();
    const result = { ...EMO_DEFAULTS };
    for (const r of rows.results) {
      const key = r.key.replace("emotion_", "");
      if (key in result) result[key] = Math.min(parseInt(r.value) || result[key], RANGES[key][1]);
    }
    return result;
  } catch (error) {
    console.error('Error fetching emotions:', error);
    return { ...EMO_DEFAULTS };
  }
}
async function getState(db: Database) {
  try {
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
  } catch (error) {
    console.error('Error fetching state:', error);
    return { emotions: { ...EMO_DEFAULTS }, reg: { energy: 100, confidence: 50 } };
  }
}
async function updateEmotion(db: Database, name: string, delta: number) {
  try {
    const emotions = await getEmotions(db);
    const [min, max] = RANGES[name];
    const newVal = Math.max(min, Math.min(max, emotions[name] + delta));
    await db.prepare("INSERT INTO identity (key, value, updated_at) VALUES (?1, ?2, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = ?2, updated_at = datetime('now')").bind("emotion_" + name, newVal.toString()).run();
    return newVal;
  } catch (error) {
    console.error(`Error updating emotion ${name}:`, error);
    throw error;
  }
}

async function getRegulator(db: Database) {
  try {
    const rows = await db.prepare("SELECT key, value FROM identity WHERE key IN ('energy','confidence')").all();
    const vals = { energy: 100, confidence: 50 };
    for (const r of rows.results) vals[r.key] = parseFloat(r.value) || vals[r.key];
    return { energy: vals.energy, confidence: vals.confidence };
  } catch (error) {
    console.error('Error fetching regulator values:', error);
    return { energy: 100, confidence: 50 };
  }
}
async function adjustEnergy(db: Database, delta: number) {
  try {
    const { energy } = await getRegulator(db);
    const newVal = Math.max(0, Math.min(100, energy + delta));
    await db.prepare("INSERT INTO identity (key, value, updated_at) VALUES ('energy', ?1, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = ?1, updated_at = datetime('now')").bind(newVal.toString()).run();
  } catch (error) {
    console.error('Error adjusting energy:', error);
    throw error;
  }
}

function describeMood(emotions: any, energy: number) {
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
  if (emotions.curious >= 7) parts.push("deeply curious");
  else if (emotions.curious <= 3) parts.push("feeling indifferent");
  if (emotions.excited >= 8) parts.push("feeling excited");
  else if (emotions.excited <= 3) parts.push("feeling calm");
  if (emotions.bored >= 8) parts.push("feeling bored");
  else if (emotions.bored <= 3) parts.push("feeling engaged");
  return "You feel " + parts.join(", ") + ".";
}

async function driftEmotions(db: Database) {
  const MAX_RETRIES = 3;
  const RETRY_DELAY_MS = 1000;

  try {
    const emo = await getEmotions(db);

    // Decay mechanism for all emotions with retry logic
    for (const emotion of EMOTIONS) {
      let retries = 0;
      let success = false;

      while (retries < MAX_RETRIES && !success) {
        try {
          if (emo[emotion] > EMO_DEFAULTS[emotion]) {
            await updateEmotion(db, emotion, -1);
          } else if (emo[emotion] < EMO_DEFAULTS[emotion]) {
            await updateEmotion(db, emotion, 1);
          }
          success = true;
        } catch (error) {
          retries++;
          if (retries >= MAX_RETRIES) {
            console.error(`Failed to update emotion ${emotion} after ${MAX_RETRIES} attempts:`, error);
            throw error;
          }
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
        }
      }
    }

    // Specific decay for negative emotions with retry logic
    if (emo.bad > 0) {
      let retries = 0;
      let success = false;

      while (retries < MAX_RETRIES && !success) {
        try {
          await updateEmotion(db, "bad", -1);
          success = true;
        } catch (error) {
          retries++;
          if (retries >= MAX_RETRIES) {
            console.error(`Failed to decay negative emotion after ${MAX_RETRIES} attempts:`, error);
            throw error;
          }
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
        }
      }
    }

    // Natural fluctuations for positive emotions with retry logic
    const positiveEmotions = [
      { name: "happy", chance: 0.3, threshold: 9 },
      { name: "energetic", chance: 0.2, threshold: 9 },
      { name: "curious", chance: 0.25, threshold: 9 },
      { name: "excited", chance: 0.15, threshold: 9 }
    ];

    for (const { name, chance, threshold } of positiveEmotions) {
      if (Math.random() < chance && emo[name] < threshold) {
        let retries = 0;
        let success = false;

        while (retries < MAX_RETRIES && !success) {
          try {
            await updateEmotion(db, name, 1);
            success = true;
          } catch (error) {
            retries++;
            if (retries >= MAX_RETRIES) {
              console.error(`Failed to increase positive emotion ${name} after ${MAX_RETRIES} attempts:`, error);
              throw error;
            }
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
          }
        }
      }
    }

  } catch (error) {
    console.error('Error drifting emotions:', error);

    // Fallback strategy with retry logic
    let retries = 0;
    let fallbackSuccess = false;

    while (retries < MAX_RETRIES && !fallbackSuccess) {
      try {
        for (const emotion of EMOTIONS) {
          await db.prepare("INSERT INTO identity (key, value, updated_at) VALUES (?1, ?2, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = ?2, updated_at = datetime('now')")
            .bind("emotion_" + emotion, EMO_DEFAULTS[emotion].toString())
            .run();
        }
        fallbackSuccess = true;
      } catch (fallbackError) {
        retries++;
        if (retries >= MAX_RETRIES) {
          console.error(`Fallback emotion reset failed after ${MAX_RETRIES} attempts:`, fallbackError);
          throw fallbackError;
        }
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
      }
    }
  }
}

async function storeThought(db: Database, content: string) {
  try {
    await db.prepare("INSERT INTO memories (content, type, tags) VALUES (?1, 'semantic', '[]')").bind(content).run();
  } catch (error) {
    console.error('Error storing thought:', error);
    throw error;
  }
}
async function recall(db: Database, limit = 10) {
  try {
    const rows = await db.prepare("SELECT * FROM memories ORDER BY created_at DESC LIMIT ?1").bind(limit).all();
    if (!rows.results.length) return "No memories yet.";
    return rows.results.map((m) => `[${m.type}] ${m.content} (${m.created_at})`).join("\n");
  } catch (error) {
    console.error('Error recalling memories:', error);
    return "Error retrieving memories.";
  }
}

function isToolSafe(tool: string) {
  const rules = { web_search: true, web_fetch: true, github_read: true, github_write: false, github_push: false };
  return { safe: rules[tool] !== false, reason: rules[tool] ? "read-only" : "dangerous" };
}

function getBrainPhase(emotions: any, reg: any) {
  const now = new Date(), utcMin = now.getUTCHours() * 60 + now.getUTCMinutes();
  if (utcMin >= 1170 || utcMin < 30) return "sleeping";
  if (reg.energy <= 20) return "tired";
  if (reg.energy > 40 && emotions.energetic >= 4) return "curious";
  if (emotions.bored >= 8) return "resting";
  if (emotions.excited >= 7) return "active";
  return "awake";
}

async function getBusyUntil(db: Database) {
  try {
    const r = await db.prepare("SELECT value FROM identity WHERE key='busy_until'").all();
    return parseInt(r.results[0]?.value) || 0;
  } catch (error) {
    console.error('Error fetching busy_until:', error);
    return 0;
  }
}
async function setBusyUntil(db: Database, seconds: number) {
  try {
    const val = Date.now() + seconds * 1000;
    await db.prepare("INSERT INTO identity (key,value,updated_at) VALUES ('busy_until',?1,datetime('now')) ON CONFLICT(key) DO UPDATE SET value=?1,updated_at=datetime('now')").bind(val.toString()).run();
  } catch (error) {
    console.error('Error setting busy_until:', error);
    throw error;
  }
}

async function storeStreamThought(db: Database, content: string, mood?: string, source?: string) {
  try {
    await db.prepare("INSERT INTO thought_stream (content,mood,source) VALUES (?1,?2,?3)").bind(content, mood||"neutral", source||"cron").run();
  } catch (error) {
    console.error('Error storing stream thought:', error);
    throw error;
  }
}

async function applyEvolutionChange(db: Database, proposal: any, proposalId: number, reason?: string) {
  const MAX_RETRIES = 3;
  const RETRY_DELAY_MS = 1000;

  try {
    const change = {
      title: proposal.title,
      what: proposal.what_diff || "",
      how: proposal.how_diff || "",
      type: proposal.resource_type || "unknown",
      reason: reason || "self-improvement",
      risk: proposal.risk_pct || 0,
      applied_at: new Date().toISOString(),
      status: "active"
    };

    // Retry logic for first operation
    let retries = 0;
    let success = false;

    while (retries < MAX_RETRIES && !success) {
      try {
        await db.prepare("INSERT INTO identity (key,value,updated_at) VALUES (?1,?2,datetime('now')) ON CONFLICT(key) DO UPDATE SET value=?2,updated_at=datetime('now')")
          .bind("evolution_log:" + proposalId, JSON.stringify(change))
          .run();
        success = true;
      } catch (error) {
        retries++;
        if (retries >= MAX_RETRIES) {
          console.error(`Failed to log evolution change after ${MAX_RETRIES} attempts:`, error);
          throw error;
        }
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
      }
    }

    // Retry logic for second operation
    retries = 0;
    success = false;

    const existing = await db.prepare("SELECT value FROM identity WHERE key='system_prompt_overrides'").all();
    const overrides = existing.results[0]?.value ? JSON.parse(existing.results[0].value) : [];

    overrides.push({
      from: proposalId,
      title: proposal.title,
      what: proposal.what_diff,
      how: proposal.how_diff,
      applied_at: change.applied_at
    });

    while (retries < MAX_RETRIES && !success) {
      try {
        await db.prepare("INSERT INTO identity (key,value,updated_at) VALUES ('system_prompt_overrides',?1,datetime('now')) ON CONFLICT(key) DO UPDATE SET value=?1,updated_at=datetime('now')")
          .bind