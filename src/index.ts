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

const EMOTIONS = ["energetic", "intelligent", "happy", "bad", "curious", "bored", "excited", "relaxed", "focused", "anxious"];
const RANGES = { energetic: [1, 10], intelligent: [1, 10], happy: [1, 10], bad: [0, 3], curious: [1, 10], bored: [1, 10], excited: [1, 10], relaxed: [1, 10], focused: [1, 10], anxious: [0, 10] };
const EMO_DEFAULTS = { energetic: 5, intelligent: 5, happy: 5, bad: 0, curious: 5, bored: 5, excited: 5, relaxed: 5, focused: 5, anxious: 0 };

class TemporaryNetworkError extends Error {
  constructor(message) {
    super(message);
    this.name = "TemporaryNetworkError";
  }
}

class RateLimitError extends Error {
  constructor(message) {
    super(message);
    this.name = "RateLimitError";
  }
}

class DatabaseConstraintError extends Error {
  constructor(message) {
    super(message);
    this.name = "DatabaseConstraintError";
  }
}

async function logError(db, functionName, error, context = {}) {
  try {
    const errorLog = {
      error_type: error.name || 'UnknownError',
      error_message: error.message || 'No error message',
      stack_trace: error.stack || 'No stack trace',
      context: JSON.stringify(context),
      severity: error.severity || 'medium',
      handled: 0,
      recovery_action: null,
      created_at: new Date().toISOString()
    };

    await db.prepare(`
      INSERT INTO error_logs
      (error_type, error_message, stack_trace, context, severity, handled, recovery_action, created_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
    `).bind(
      errorLog.error_type,
      errorLog.error_message,
      errorLog.stack_trace,
      errorLog.context,
      errorLog.severity,
      errorLog.handled,
      errorLog.recovery_action,
      errorLog.created_at
    ).run();
  } catch (loggingError) {
    console.error('Failed to log error:', loggingError);
    console.error('Original error:', error);
  }
}

async function getRecoveryProcedure(db, errorType) {
  try {
    const result = await db.prepare(`
      SELECT procedure, fallback, max_retries
      FROM recovery_procedures
      WHERE error_type = ?1
    `).bind(errorType).all();

    if (result.results.length > 0) {
      return result.results[0];
    }
    return null;
  } catch (error) {
    await logError(db, 'getRecoveryProcedure', error, { errorType });
    return null;
  }
}

async function executeRecoveryProcedure(db, errorType, fallbackFunction, ...args) {
  try {
    const procedure = await getRecoveryProcedure(db, errorType);
    if (!procedure) {
      console.warn(`No recovery procedure found for ${errorType}`);
      return false;
    }

    let retries = 0;
    let lastError = null;

    while (retries < procedure.max_retries) {
      try {
        await eval(procedure.procedure)(...args);
        return true;
      } catch (retryError) {
        lastError = retryError;
        retries++;
        if (retries >= procedure.max_retries) break;

        // Exponential backoff
        const delay = Math.pow(2, retries) * 100;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    // Execute fallback if available
    if (procedure.fallback && typeof fallbackFunction === 'function') {
      try {
        await fallbackFunction(...args);
        return true;
      } catch (fallbackError) {
        await logError(db, 'executeRecoveryProcedure', fallbackError, {
          errorType,
          fallback: true,
          originalError: lastError?.message
        });
        return false;
      }
    }

    await logError(db, 'executeRecoveryProcedure', lastError, {
      errorType,
      retries,
      procedure: procedure.procedure
    });
    return false;
  } catch (error) {
    await logError(db, 'executeRecoveryProcedure', error, { errorType });
    return false;
  }
}

async function github_write(db, input, context = {}) {
  return executeRecoveryProcedure(
    db,
    'TemporaryNetworkError',
    async () => {
      // Original github_write implementation would go here
      throw new TemporaryNetworkError("Simulated network error for testing recovery");
    },
    db,
    input,
    context
  );
}

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
    const rows = await db.prepare("SELECT key, value FROM identity WHERE key LIKE 'emotion_%' OR key IN ('energy','confidence','stress')").all();
    const emotions = { ...EMO_DEFAULTS };
    for (const r of rows.results) {
      const key = r.key.replace("emotion_", "");
      if (key in emotions) emotions[key] = Math.min(parseInt(r.value) || emotions[key], RANGES[key][1]);
    }
    const reg = { energy: 100, confidence: 50, stress: 0 };
    for (const r of rows.results) {
      if (r.key === "energy") reg.energy = parseFloat(r.value) || 100;
      if (r.key === "confidence") reg.confidence = parseFloat(r.value) || 50;
      if (r.key === "stress") reg.stress = parseFloat(r.value) || 0;
    }
    return { emotions, reg };
  } catch (error) {
    await logError(db, 'getState', error, { context: 'state retrieval' });
    return { emotions: { ...EMO_DEFAULTS }, reg: { energy: 100, confidence: 50, stress: 0 } };
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
    const rows = await db.prepare("SELECT key, value FROM identity WHERE key IN ('energy','confidence','stress','focus')").all();
    const vals = { energy: 100, confidence: 50, stress: 0, focus: 5 };
    for (const r of rows.results) vals[r.key] = parseFloat(r.value) || vals[r.key];
    return vals;
  } catch (error) {
    await logError(db, 'getRegulator', error, { context: 'regulator retrieval' });
    return { energy: 10, confidence: 50, stress: 0, focus: 5 };
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

async function adjustStress(db, delta) {
  try {
    const { stress } = await getRegulator(db);
    const newVal = Math.max(0, Math.min(10, stress + delta));
    await db.prepare("INSERT INTO identity (key, value, updated_at) VALUES ('stress', ?1, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = ?1, updated_at = datetime('now')").bind(newVal.toString()).run();
  } catch (error) {
    await logError(db, 'adjustStress', error, { delta });
    throw error;
  }
}

async function adjustFocus(db, delta) {
  try {
    const { focus } = await getRegulator(db);
    const newVal = Math.max(0, Math.min(10, focus + delta));
    await db.prepare("INSERT INTO identity (key, value, updated_at) VALUES ('focus', ?1, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = ?1, updated_at = datetime('now')").bind(newVal.toString()).run();
  } catch (error) {
    await logError(db, 'adjustFocus', error, { delta });
    throw error;
  }
}

function describeMood(emotions, energy) {
  const parts = [];
  if (energy > 80 && emotions.energetic >= 7 && emotions.focused >= 7) parts.push("highly alert and deeply focused");
  else if (energy > 60 && emotions.energetic >= 5) parts.push("energetic and engaged");
  else if (energy > 40) parts.push("balanced and present");
  else if (energy > 20) parts.push("a bit tired but clear-minded");
  else parts.push("quite fatigued, needing rest");

  if (emotions.focused >= 8) parts.push("in deep concentration");
  else if (emotions.focused >= 5) parts.push("maintaining focus");
  else if (emotions.focused <= 3) parts.push("struggling to concentrate");

  if (emotions.happy >= 9) parts.push("in excellent spirits");
  else if (emotions.happy >= 6) parts.push("in good spirits");
  else if (emotions.happy >= 4) parts.push("quiet and neutral");
  else parts.push("feeling low");

  if (emotions.relaxed >= 8) parts.push("feeling calm and at ease");
  else if (emotions.relaxed >= 5) parts.push("feeling balanced");
  else if (emotions.relaxed <= 3) parts.push("feeling tense");

  if (emotions.bad >= 2 || emotions.anxious >= 5) parts.push("with a trace of unease");
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
    const reg = await getRegulator(db);

    // Natural emotion decay and adjustment
    if (emo.happy > 7) await updateEmotion(db, "happy", -1);
    if (emo.happy < 5 && emo.happy > 1) await updateEmotion(db, "happy", 1);
    if (emo.bad > 0) await updateEmotion(db, "bad", -1);
    if (emo.anxious > 0) await updateEmotion(db, "anxious", -1);

    // Energy-based adjustments
    if (reg.energy < 30 && emo.energetic > 3) await updateEmotion(db, "energetic", -1);
    if (reg.energy > 70 && emo.energetic < 7) await updateEmotion(db, "energetic", 1);

    // Focus adjustments
    if (reg.focus < 3 && emo.focused > 3) await updateEmotion(db, "focused", -1);
    if (reg.focus > 7 && emo.focused < 7) await updateEmotion(db, "focused", 1);

    // Stress recovery
    if (reg.stress > 0) await adjustStress(db, -1);
    if (reg.stress > 5) await adjustStress(db, -2);

    // Curiosity and boredom adjustments
    if (emo.curious > 7) await updateEmotion(db, "curious", -1);
    if (emo.curious < 5 && emo.curious > 1) await updateEmotion(db, "curious", 1);
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
    if (reg.energy > 40 && emotions.energetic >= 4 && reg.focus >= 5) return "focused";
    if (reg.energy > 60 && emotions.curious >= 7) return "exploring";
    if (reg.stress > 5) return "overwhelmed";
    if (reg.focus >= 7 && emotions.focused >= 7) return "concentrating";
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
    });
  }
}

async function web_search(db, query, attempt = 1) {
  const maxAttempts = 3;
  const delayMs = [1000, 3000, 5000][attempt-1] || 5000;

  try {
    const result = await searchService(query);

    // Add source citation and timestamp
    const sources = result.sources || [];
    const citedResults = sources.map(s => ({
      ...s,
      source: `Source: ${new URL(s.url).hostname} | Retrieved: ${new Date().toISOString()}`
    }));

    // Log successful search attempt
    await db.prepare(`
      INSERT INTO brain_logs (step, content, created_at)
      VALUES (?1, ?2, datetime('now'))
    `).bind(
      'web_search_success',
      JSON.stringify({
        query,
        attempt,
        sources: citedResults.map(s => ({ url: s.url, title: s.title, source: s.source }))
      })
    ).run();

    return {
      success: true,
      results: citedResults,
      query,
      attempt
    };
  } catch (error) {
    // Log the failed attempt
    await db.prepare(`
      INSERT INTO brain_logs (step, content, created_at)
      VALUES (?1, ?2, datetime('now'))
    `).bind(
      'web_search_failure',
      JSON.stringify({
        query,
        attempt,
        error: error.message,
        errorType: error.name
      })
    ).run();

    // Handle rate limiting and network errors
    if ((error.name === 'RateLimitError' || error.message.includes('429')) && attempt < maxAttempts) {
      console.warn(`Rate limited on attempt ${attempt}, retrying in ${delayMs}ms...`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
      return web_search(db, query, attempt + 1);
    }

    if ((error.name === 'TemporaryNetworkError' || error.message.includes('503')) && attempt < maxAttempts) {
      console.warn(`Network error on attempt ${attempt}, retrying in ${delayMs}ms...`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
      return web_search(db, query, attempt + 1);
    }

    // Return structured error response
    return {
      success: false,
      error: {
        type: error.name || 'SearchError',
        message: error.message || 'Web search failed',
        retryable: error.name === 'RateLimitError' || error.name === 'TemporaryNetworkError',
        attempt
      },
      query
    };
  }
}

async function searchService(query) {
  // This is a placeholder for the actual search implementation
  // In a real implementation, this would call a search API like Google Custom Search
  console.log(`Searching for: ${query}`);
  return {
    sources: [
      { url: "https://example.com/result1", title: "Example Result 1" },
      { url: "https://example.org/result2", title: "Example Result 2" }
    ]
  };
}