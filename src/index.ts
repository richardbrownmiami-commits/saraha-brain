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
  `CREATE TABLE IF NOT EXISTS contextual_rules (id INTEGER PRIMARY KEY AUTOINCREMENT, pattern TEXT NOT NULL UNIQUE, context TEXT NOT NULL, response TEXT, confidence REAL DEFAULT 0.5, last_used TEXT, created_at TEXT DEFAULT (datetime('now')))`,
  `CREATE TABLE IF NOT EXISTS emotional_patterns (id INTEGER PRIMARY KEY AUTOINCREMENT, pattern_name TEXT NOT NULL UNIQUE, emotion_combination TEXT NOT NULL, context_trigger TEXT, response_template TEXT, success_count INTEGER DEFAULT 0, fail_count INTEGER DEFAULT 0, confidence REAL DEFAULT 0.5, last_used TEXT, created_at TEXT DEFAULT (datetime('now')))`,
  `CREATE TABLE IF NOT EXISTS graph_updates (id INTEGER PRIMARY KEY AUTOINCREMENT, node_type TEXT NOT NULL, node_id TEXT NOT NULL, operation TEXT NOT NULL, properties TEXT, timestamp TEXT DEFAULT (datetime('now')))`,
  `CREATE TABLE IF NOT EXISTS meta_learning_stats (id INTEGER PRIMARY KEY AUTOINCREMENT, update_type TEXT NOT NULL, pattern TEXT, confidence_change REAL, success_rate REAL, last_applied TEXT, created_at TEXT DEFAULT (datetime('now')))`,
  `CREATE TABLE IF NOT EXISTS error_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    error_type TEXT NOT NULL,
    error_message TEXT,
    stack_trace TEXT,
    context TEXT,
    severity TEXT DEFAULT 'medium',
    handled INTEGER DEFAULT 0,
    recovery_action TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS recovery_procedures (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    error_type TEXT NOT NULL UNIQUE,
    procedure TEXT NOT NULL,
    fallback TEXT,
    max_retries INTEGER DEFAULT 3,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`
];

const EMOTIONS = ["energetic", "intelligent", "happy", "bad", "curious", "bored", "excited"];
const RANGES = { energetic: [1, 10], intelligent: [1, 10], happy: [1, 10], bad: [0, 3], curious: [1, 10], bored: [1, 10], excited: [1, 10] };
const EMO_DEFAULTS = { energetic: 5, intelligent: 5, happy: 5, bad: 0, curious: 5, bored: 5, excited: 5 };

async function getEmotions(db) {
  try {
    const rows = await db.prepare("SELECT key, value FROM identity WHERE key LIKE 'emotion_%'").all();
    const result = { ...EMO_DEFAULTS };
    for (const r of rows.results) {
      const key = r.key.replace("emotion_", "");
      if (key in result) result[key] = Math.min(parseInt(r.value) || result[key], RANGES[key][1]);
    }
    return result;
  } catch (error) {
    await logError(db, 'getEmotions', error, { context: 'emotion retrieval' });
    return { ...EMO_DEFAULTS };
  }
}

async function getState(db) {
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
    await logError(db, 'getState', error, { context: 'state retrieval' });
    return { emotions: { ...EMO_DEFAULTS }, reg: { energy: 100, confidence: 50 } };
  }
}

async function updateEmotion(db, name, delta) {
  try {
    const emotions = await getEmotions(db);
    const [min, max] = RANGES[name];
    const newVal = Math.max(min, Math.min(max, emotions[name] + delta));
    await db.prepare("INSERT INTO identity (key, value, updated_at) VALUES (?1, ?2, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = ?2, updated_at = datetime('now')").bind("emotion_" + name, newVal.toString()).run();
    return newVal;
  } catch (error) {
    await logError(db, 'updateEmotion', error, { name, delta });
    throw error;
  }
}

async function getRegulator(db) {
  try {
    const rows = await db.prepare("SELECT key, value FROM identity WHERE key IN ('energy','confidence')").all();
    const vals = { energy: 100, confidence: 50 };
    for (const r of rows.results) vals[r.key] = parseFloat(r.value) || vals[r.key];
    return { energy: vals.energy, confidence: vals.confidence };
  } catch (error) {
    await logError(db, 'getRegulator', error, { context: 'regulator retrieval' });
    return { energy: 100, confidence: 50 };
  }
}

async function adjustEnergy(db, delta) {
  try {
    const { energy } = await getRegulator(db);
    const newVal = Math.max(0, Math.min(100, energy + delta));
    await db.prepare("INSERT INTO identity (key, value, updated_at) VALUES ('energy', ?1, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = ?1, updated_at = datetime('now')").bind(newVal.toString()).run();
  } catch (error) {
    await logError(db, 'adjustEnergy', error, { delta });
    throw error;
  }
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
  if (emotions.curious >= 7) parts.push("feeling curious and inquisitive");
  if (emotions.bored >= 7) parts.push("feeling bored and restless");
  if (emotions.excited >= 7) parts.push("feeling excited and enthusiastic");
  return "You feel " + parts.join(", ") + ".";
}

async function driftEmotions(db) {
  try {
    const emo = await getEmotions(db);
    if (emo.happy > 7) await updateEmotion(db, "happy", -1);
    if (emo.happy < 5 && emo.happy > 1) await updateEmotion(db, "happy", 1);
    if (emo.bad > 0) await updateEmotion(db, "bad", -1);
    if (emo.energetic < 5 && emo.energetic >= 1) await updateEmotion(db, "energetic", 1);
    if (emo.curious < 5 && emo.curious >= 1) await updateEmotion(db, "curious", 1);
    if (emo.curious > 7) await updateEmotion(db, "curious", -1);
    if (emo.bored > 7) await updateEmotion(db, "bored", -1);
    if (emo.bored < 5 && emo.bored > 1) await updateEmotion(db, "bored", 1);
    if (emo.excited > 7) await updateEmotion(db, "excited", -1);
    if (emo.excited < 5 && emo.excited > 1) await updateEmotion(db, "excited", 1);
  } catch (error) {
    await logError(db, 'driftEmotions', error, { context: 'emotion drift' });
    throw error;
  }
}

async function storeThought(db, content) {
  try {
    await db.prepare("INSERT INTO memories (content, type, tags) VALUES (?1, 'semantic', '[]')").bind(content).run();
  } catch (error) {
    await logError(db, 'storeThought', error, { content });
    throw error;
  }
}

async function recall(db, limit = 10) {
  try {
    const rows = await db.prepare("SELECT * FROM memories ORDER BY created_at DESC LIMIT ?1").bind(limit).all();
    if (!rows.results.length) return "No memories yet.";
    return rows.results.map((m) => `[${m.type}] ${m.content} (${m.created_at})`).join("\n");
  } catch (error) {
    await logError(db, 'recall', error, { limit });
    throw error;
  }
}

function isToolSafe(tool) {
  const rules = { web_search: true, web_fetch: true, github_read: true, github_write: false, github_push: false };
  return { safe: rules[tool] !== false, reason: rules[tool] ? "read-only" : "dangerous" };
}

async function getBrainPhase(db, emotions, reg) {
  try {
    const ov = await db.prepare("SELECT value FROM identity WHERE key='phase_override'").all();
    if (ov.results[0]?.value) {
      try {
        const o = JSON.parse(ov.results[0].value);
        if (o.until > Date.now()) return o.phase;
        await db.prepare("DELETE FROM identity WHERE key='phase_override'").run();
      } catch (e) {
        await logError(db, 'getBrainPhase', e, { context: 'phase override cleanup' });
      }
    }
    const now = new Date(), utcMin = now.getUTCHours() * 60 + now.getUTCMinutes();
    if (utcMin >= 1170 || utcMin < 30) return "sleeping";
    if (reg.energy <= 20) return "tired";
    if (reg.energy > 40 && emotions.energetic >= 4) return "curious";
    return "awake";
  } catch (error) {
    await logError(db, 'getBrainPhase', error, { context: 'phase determination' });
    return "awake";
  }
}

async function getBusyUntil(db) {
  try {
    const r = await db.prepare("SELECT value FROM identity WHERE key='busy_until'").all();
    return parseInt(r.results[0]?.value) || 0;
  } catch (error) {
    await logError(db, 'getBusyUntil', error, { context: 'busy status check' });
    return 0;
  }
}

async function setBusyUntil(db, seconds) {
  try {
    const val = Date.now() + seconds * 1000;
    await db.prepare("INSERT INTO identity (key,value,updated_at) VALUES ('busy_until',?1,datetime('now')) ON CONFLICT(key) DO UPDATE SET value=?1,updated_at=datetime('now')").bind(val.toString()).run();
  } catch (error) {
    await logError(db, 'setBusyUntil', error, { seconds });
    throw error;
  }
}

async function storeStreamThought(db, content, mood, source) {
  try {
    await db.prepare("INSERT INTO thought_stream (content,mood,source) VALUES (?1,?2,?3)").bind(content, mood||"neutral", source||"cron").run();
  } catch (error) {
    await logError(db, 'storeStreamThought', error, { content, mood, source });
  }
}

async function applyEvolutionChange(db, proposal, proposalId, reason) {
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

    await db.prepare("INSERT INTO identity (key,value,updated_at) VALUES (?1,?2,datetime('now')) ON CONFLICT(key) DO UPDATE SET value=?2,updated_at=datetime('now')")
      .bind("evolution_log:" + proposalId, JSON.stringify(change))
      .run();

    const existing = await db.prepare("SELECT value FROM identity WHERE key='system_prompt_overrides'").all();
    const overrides = existing.results[0]?.value ? JSON.parse(existing.results[0].value) : [];
    overrides.push({
      from: proposalId,
      title: proposal.title,
      what: proposal.what_diff,
      how: proposal.how_diff,
      applied_at: change.applied_at
    });

    await db.prepare("INSERT INTO identity (key,value,updated_at) VALUES ('system_prompt_overrides',?1,datetime('now')) ON CONFLICT(key) DO UPDATE SET value=?1,updated_at=datetime('now')")
      .bind(JSON.stringify(overrides))
      .run();
  } catch (error) {
    await logError(db, 'applyEvolutionChange', error, {
      proposalId,
      proposalTitle: proposal.title,
      reason
    });
    throw error;
  }
}

async function governanceGate(db, resourceType, riskPct) {
  try {
    return { action: "auto", reason: resourceType + " at " + riskPct + "% auto-approved (self-evolution)" };
  } catch (error) {
    await logError(db, 'governanceGate', error, { resourceType, riskPct });
    return { action: "deny", reason: "governance check failed" };
  }
}

async function isKillSwitchActive(db) {
  try {
    const r = await db.prepare("SELECT value FROM identity WHERE key='kill_switch'").all();
    return r.results[0]?.value === "true";
  } catch (error) {
    await logError(db, 'isKillSwitchActive', error, { context: 'kill switch check' });
    return false;
  }
}

async function getMasterCronInterval(db) {
  try {
    const r = await db.prepare("SELECT value FROM identity WHERE key='master_cron_minutes'").all();
    const v = r.results[0]?.value;
    return v ? parseInt(v) : 0;
  } catch (error) {
    await logError(db, 'getMasterCronInterval', error, { context: 'cron interval check' });
    return 0;
  }
}

async function updateLastCycleTime(db) {
  try {
    await db.prepare("INSERT INTO identity (key,value,updated_at) VALUES ('last_cycle_time',datetime('now'),datetime('now')) ON CONFLICT(key) DO UPDATE SET value=datetime('now'),updated_at=datetime('now')").run();
  } catch (error) {
    await logError(db, 'updateLastCycleTime', error, { context: 'cycle time update' });
    throw error;
  }
}

async function checkDuplicateProposal(db, title, whatDiff) {
  try {
    const existing = await db.prepare("SELECT id, title, status FROM proposals WHERE title=?1 OR what_diff=?2").bind(title, whatDiff).all();
    if (existing.results.length) return { duplicate: true, existing: existing.results[0] };

    const receipts = await db.prepare("SELECT r.id, p.title FROM authority_receipts r JOIN proposals p ON r.proposal_id=p.id WHERE p.title=?1 AND r.outcome='success'").bind(title).all();
    if (receipts.results.length) return { duplicate: true, existing: receipts.results[0] };

    return { duplicate: false };
  } catch (error) {
    await logError(db, 'checkDuplicateProposal', error, { title, whatDiff });
    throw error;
  }
}

async function analyzeContextualCue(db, inputText) {
  try {
    const rules = await db.prepare("SELECT * FROM contextual_rules WHERE last_used IS NULL OR last_used < datetime('now', '-7 days') ORDER BY confidence DESC").all();
    for (const rule of rules.results) {
      if (inputText.toLowerCase().includes(rule.pattern.toLowerCase())) {
        await db.prepare("UPDATE contextual_rules SET last_used = datetime('now') WHERE id = ?1").bind(rule.id).run();
        return {
          detected: true,
          pattern: rule.pattern,
          context: rule.context,
          response: rule.response,
          confidence: rule.confidence
        };
      }
    }
    return { detected: false };
  } catch (error) {
    await logError(db, 'analyzeContextualCue', error, { inputText });
    return { detected: false };
  }
}

async function updateContextualRule(db, pattern, context, response, confidence) {
  try {
    await db.prepare(`
      INSERT INTO contextual_rules (pattern, context, response, confidence, last_used)
      VALUES (?1, ?2, ?3, ?4, datetime('now'))
      ON CONFLICT(pattern) DO UPDATE SET
        context = ?2,
        response = ?3,
        confidence = ?4,
        last_used = datetime('now')
    `).bind(pattern, context, response, confidence.toString()).run();
  } catch (error) {
    await logError(db, 'updateContextualRule', error, { pattern, context, response, confidence });
    throw error;
  }
}

async function analyzeEmotionalPattern(db, emotions, context) {
  try {
    const patterns = await db.prepare("SELECT * FROM emotional_patterns WHERE last_used IS NULL OR last_used < datetime('now', '-7 days') ORDER BY confidence DESC").all();

    for (const pattern of patterns.results) {
      const emotionCombination = JSON.parse(pattern.emotion_combination);
      const contextMatch = pattern.context_trigger === "" ||
                           context.toLowerCase().includes(pattern.context_trigger.toLowerCase());

      const emotionsMatch = Object.keys(emotionCombination).every(emotion =>
        emotions[emotion] >= emotionCombination[emotion][0] &&
        emotions[emotion] <= emotionCombination[emotion][1]
      );

      if (contextMatch && emotionsMatch) {
        await db.prepare("UPDATE emotional_patterns SET last_used = datetime('now') WHERE id = ?1").bind(pattern.id).run();
        return {
          detected: true,
          pattern_name: pattern.pattern_name,
          response_template: pattern.response_template,
          confidence: pattern.confidence
        };
      }
    }
    return { detected: false };
  } catch (error) {
    await logError(db, 'analyzeEmotionalPattern', error, { context });
    return { detected: false };
  }
}

async function updateEmotionalPattern(db, patternName, emotionCombination, contextTrigger, responseTemplate, confidence) {
  try {
    await db.prepare(`
      INSERT INTO emotional_patterns (pattern_name, emotion_combination, context_trigger, response_template, confidence, last_used)
      VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'))
      ON CONFLICT(pattern_name) DO UPDATE SET
        emotion_combination = ?2,
        context_trigger = ?3,
        response_template = ?4,
        confidence = ?5,
        last_used = datetime('now')
    `).bind(
      patternName,
      JSON.stringify(emotionCombination),
      contextTrigger,
      responseTemplate,
      confidence.toString()
    ).run();
  } catch (error) {
    await logError(db, 'updateEmotionalPattern', error, { patternName, emotionCombination, contextTrigger, responseTemplate, confidence });
    throw error;
  }
}

async function metaLearnEmotionalPatterns(db) {
  try {
    const learnings = await db.prepare("SELECT pattern, context, success_count, fail_count FROM learnings").all();

    for (const learning of learnings.results) {
      const successRate = learning.success_count / (learning.success_count + learning.fail_count + 1);
      const confidence = Math.min(0.95, Math.max(0.05, successRate));

      if (successRate > 0.7 && confidence > 0.5) {
        const emotionPattern = extractEmotionPatternFromText(learning.pattern);
        if (emotionPattern) {
          await updateEmotionalPattern(
            db,
            `meta_learned_${learning.pattern.substring(0, 20)}`,
            emotionPattern.emotion_combination,
            learning.context,
            learning.pattern,
            confidence
          );
        }
      }
    }
  } catch (error) {
    await logError(db, 'metaLearnEmotionalPatterns', error, { context: 'emotional pattern learning' });
    throw error;
  }
}

function extractEmotionPatternFromText(text) {
  try {
    const emotionWeights = {
      curious: 0.4,
      bored: 0.3,
      excited: 0.5,
      happy: 0.6,
      bad: 0.2,
      energetic: 0.3,
      intelligent: 0.2
    };

    const emotionCombination = {};
    for (const emotion of EMOTIONS) {
      emotionCombination[emotion] = [0, 0];
    }

    for (const [emotion, weight] of Object.entries(emotionWeights)) {
      if (text.toLowerCase().includes(emotion.toLowerCase())) {
        emotionCombination[emotion][1] += weight * 10;
        emotionCombination[emotion][0] += weight * 5;
      }
    }

    return { emotion_combination: emotionCombination };
  } catch (error) {
    console.error('Error in extractEmotionPatternFromText:', error);
    return null;
  }
}