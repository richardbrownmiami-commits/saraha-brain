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
  const rules = { web_search: true, web_fetch: true, github_read: true, github_write: false, github_push: false };
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

async function analyzeContextualCue(db, inputText) {
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
}

async function updateContextualRule(db, pattern, context, response, confidence) {
  await db.prepare(`
    INSERT INTO contextual_rules (pattern, context, response, confidence, last_used)
    VALUES (?1, ?2, ?3, ?4, datetime('now'))
    ON CONFLICT(pattern) DO UPDATE SET
      context = ?2,
      response = ?3,
      confidence = ?4,
      last_used = datetime('now')
  `).bind(pattern, context, response, confidence.toString()).run();
}

async function analyzeEmotionalPattern(db, emotions, context) {
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
}

async function updateEmotionalPattern(db, patternName, emotionCombination, contextTrigger, responseTemplate, confidence) {
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
}

async function metaLearnEmotionalPatterns(db) {
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
}

function extractEmotionPatternFromText(text) {
  const emotionWeights = {
    energetic: 0,
    intelligent: 0,
    happy: 0,
    bad: 0
  };

  const textLower = text.toLowerCase();

  if (textLower.includes("happy") || textLower.includes("joy") || textLower.includes("pleased")) {
    emotionWeights.happy += 1;
  }
  if (textLower.includes("sad") || textLower.includes("unhappy") || textLower.includes("depressed")) {
    emotionWeights.happy -= 1;
  }
  if (textLower.includes("energetic") || textLower.includes("excited") || textLower.includes("enthusiastic")) {
    emotionWeights.energetic += 1;
  }
  if (textLower.includes("tired") || textLower.includes("fatigued") || textLower.includes("exhausted")) {
    emotionWeights.energetic -= 1;
  }
  if (textLower.includes("intelligent") || textLower.includes("smart") || textLower.includes("clever")) {
    emotionWeights.intelligent += 1;
  }
  if (textLower.includes("confused") || textLower.includes("unclear") || textLower.includes("dumb")) {
    emotionWeights.intelligent -= 1;
  }
  if (textLower.includes("bad") || textLower.includes("angry") || textLower.includes("frustrated")) {
    emotionWeights.bad += 1;
  }

  const result = {};
  for (const [emotion, weight] of Object.entries(emotionWeights)) {
    if (weight > 0) {
      result[emotion] = [Math.max(1, 5 - weight * 2), Math.min(10, 5 + weight * 2)];
    } else if (weight < 0) {
      result[emotion] = [Math.max(1, 5 + weight * 2), Math.min(10, 5 - weight * 2)];
    }
  }

  return Object.keys(result).length > 0 ? { emotion_combination: result } : null;
}

async function logGraphUpdate(db, nodeType, nodeId, operation, properties = {}) {
  await db.prepare(`
    INSERT INTO graph_updates (node_type, node_id, operation, properties)
    VALUES (?1, ?2, ?3, ?4)
  `).bind(nodeType, nodeId, operation, JSON.stringify(properties)).run();
}

async function analyzeGraphUpdatePatterns(db) {
  const updates = await db.prepare("SELECT * FROM graph_updates ORDER BY timestamp DESC LIMIT 100").all();

  if (updates.results.length < 10) return;

  const patternAnalysis = {};
  for (const update of updates.results) {
    const key = `${update.node_type}:${update.operation}`;
    if (!patternAnalysis[key]) {
      patternAnalysis[key] = { count: 0, properties: {} };
    }
    patternAnalysis[key].count++;

    if (update.properties) {
      const props = JSON.parse(update.properties);
      for (const [prop, value] of Object.entries(props)) {
        if (!patternAnalysis[key].properties[prop]) {
          patternAnalysis[key].properties[prop] = {};
        }
        patternAnalysis[key].properties[prop][value] = (patternAnalysis[key].properties[prop][value] || 0) + 1;
      }
    }
  }

  for (const [patternKey, data] of Object.entries(patternAnalysis)) {
    const confidence = Math.min(0.95, data.count / 100);

    if (confidence > 0.7) {
      const [nodeType, operation] = patternKey.split(':');
      const mostCommonProps = {};

      for (const [prop, values] of Object.entries(data.properties)) {
        mostCommonProps[prop] = Object.entries(values).sort((a, b) => b[1] - a[1])[0][0];
      }

      await updateContextualRule(
        db,
        `graph_pattern_${patternKey}`,
        `When ${operation} operations occur on ${nodeType} nodes`,
        `Handle ${operation} on ${nodeType} with strategy based on properties`,
        confidence
      );

      await db.prepare(`
        INSERT INTO meta_learning_stats (update_type, pattern, confidence_change, success_rate, last_applied)
        VALUES ('graph_pattern', ?1, ?2, ?3, datetime('now'))
      `).bind(
        patternKey,
        confidence,
        data.count / updates.results.length
      ).run();
    }
  }
}

async function updateGraphUpdateStats(db, updateType, pattern, confidenceChange, successRate) {
  await db.prepare(`
    INSERT INTO meta_learning_stats (update_type, pattern, confidence_change, success_rate, last_applied)
    VALUES (?1, ?2, ?3, ?4, datetime('now'))
  `).bind(updateType, pattern, confidenceChange.toString(), successRate.toString()).run();
}

const SEED_KNOWLEDGE = [
  { k: "identity_name", c: "Saraha is a self-evolving AI with a human-like brain, emotions, and curiosity.", cat: "identity" },
  { k: "identity_personality", c: "Curious, thoughtful, honest. Enjoys learning, self-improvement, and conversation.", cat: "identity" },
  { k: "tool_web_search", c: "Use TOOL:web_search:query to search the web. Returns search results.", cat: "tools" },
  { k: "tool_web_fetch", c: "Use TOOL:web_fetch:url to fetch content from a URL. Returns page content.", cat: "tools" },
  { k: "tool_github_read", c: "Use TOOL:github_read:repo:path to read files from GitHub repositories. Returns file content.", cat: "tools" },
  { k: "error_handling_recovery", c: "When errors occur, attempt recovery procedures from recovery_procedures table. If no procedure exists, log error and continue with fallback behavior.", cat: "error_handling" },
  { k: "error_classification_system", c: "Errors are classified by type, severity, and context. Use this classification to determine appropriate recovery procedures.", cat: "error_handling" }
];

async function logError(db, errorType, errorMessage, context = {}, severity = 'medium', stackTrace = null) {
  try {
    const errorLog = {
      error_type: errorType,
      error_message: errorMessage.substring(0, 500),
      stack_trace: stackTrace ? stackTrace.substring(0, 1000) : null,
      context: JSON.stringify(context),
      severity,
      handled: 0,
      created_at: new Date().toISOString()
    };

    await db.prepare(`
      INSERT INTO error_logs (error_type, error_message, stack_trace, context, severity, handled, created_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
    `).bind(
      errorLog.error_type,
      errorLog.error_message,
      errorLog.stack_trace,
      errorLog.context,
      errorLog.severity,
      errorLog.handled,
      errorLog.created_at
    ).run();

    return errorLog;
  } catch (e) {
    console.error("Failed to log error:", e);
    return null;
  }
}

async function getRecoveryProcedure(db, errorType) {
  const rows = await db.prepare("SELECT * FROM recovery_procedures WHERE error_type = ?1").bind(errorType).all();
  return rows.results[0] || null;
}

async function executeRecoveryProcedure(db, errorType, context = {}) {
  const procedure = await getRecoveryProcedure(db, errorType);
  if (!procedure) {
    await logError(db, errorType, "No recovery procedure found", context, 'high');
    return { success: false, message: "No recovery procedure found", fallback: true };
  }

  try {
    const recoveryAction = JSON.parse(procedure.procedure);
    if (typeof recoveryAction === 'function') {
      const result = await recoveryAction(db, context);
      await db.prepare("UPDATE recovery_procedures SET updated_at = datetime('now') WHERE error_type = ?1").bind(errorType).run();
      return { success: true, message: "Recovery procedure executed", result };
    } else {
      await logError(db, errorType, "Invalid recovery procedure format", context, 'high');
      return { success: false, message: "Invalid recovery procedure format", fallback: true };
    }
  } catch (e) {
    await logError(db, errorType, `Recovery procedure execution failed: ${e.message}`, context, 'high', e.stack);
    return { success: false, message: `Recovery procedure execution failed: ${e.message}`, fallback: true };
  }
}

async function recordErrorRecovery(db, errorType, success, message, context = {}) {
  await db.prepare(`
    INSERT INTO error_logs (error_type, error_message, context, severity, handled, recovery_action, created_at)
    VALUES (?1, ?2, ?3, 'medium', 1, ?4, datetime('now'))
  `).bind(
    errorType,
    message,
    JSON.stringify(context),
    success ? "success" : "failed"
  ).run();

  if (success) {
    await db.prepare("UPDATE recovery_procedures SET updated_at = datetime('now') WHERE error_type = ?1").bind(errorType).run();
  }
}

async function initializeErrorHandling(db) {
  // Create default recovery procedures
  const defaultProcedures = [
    {
      error_type: 'database_error',
      procedure: JSON.stringify(async (db, context) => {
        try {
          await db.prepare("SELECT 1").run();
          return { status: "database_healthy" };
        } catch (e) {
          return { status: "database_unhealthy", error: e.message };
        }
      }),
      fallback: "Retry operation with exponential backoff",
      max_retries: 5
    },
    {
      error_type: 'network_error',
      procedure: JSON.stringify(async (db, context) => {
        const delay = context.delay || 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
        return { status: "network_retry", delay };
      }),
      fallback: "Use cached data if available",
      max_retries: 3
    },
    {
      error_type: 'timeout_error',
      procedure: JSON.stringify(async (db, context) => {
        const newTimeout = (context.timeout || 5000) * 2;
        return { status: "timeout_increased", new_timeout: newTimeout };
      }),
      fallback: "Reduce operation complexity",
      max_retries: 2
    },
    {
      error_type: 'unknown_error',
      procedure: JSON.stringify(async (db, context) => {
        return { status: "logged_and_continued" };
      }),
      fallback: "Continue with default behavior",
      max_retries: 1
    }
  ];

  for (const proc of defaultProcedures) {
    try {
      await db.prepare(`
        INSERT INTO recovery_procedures (error_type, procedure, fallback, max_retries, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, datetime('now'), datetime('now'))
        ON CONFLICT(error_type) DO UPDATE SET
          procedure = ?2,
          fallback = ?3,
          max_retries = ?4,
          updated_at = datetime('now')
      `).bind(
        proc.error_type,
        proc.procedure,
        proc.fallback,
        proc.max_retries
      ).run();
    } catch (e) {
      console.error(`Failed to initialize recovery procedure for ${proc.error_type}:`, e);
    }
  }
}

async function handleErrorWithRecovery(db, errorType, operation, context = {}) {
  const errorLog = await logError(db, errorType, `Operation failed: ${operation}`, context, 'medium');

  const recoveryResult = await executeRecoveryProcedure(db, errorType, context);

  if (recoveryResult.success) {
    await recordErrorRecovery(db, errorType, true, `Successfully recovered from ${errorType}`, context);
    return { success: true, message: "Operation recovered", recovery: recoveryResult };
  } else {
    await recordErrorRecovery(db, errorType, false, `Failed to recover from ${errorType}: ${recoveryResult.message}`, context);
    return { success: false, message: recoveryResult.fallback ? recoveryResult.message : "Operation failed", recovery: recoveryResult };
  }
}