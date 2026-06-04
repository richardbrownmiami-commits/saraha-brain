const TABLES = [
  `CREATE TABLE IF NOT EXISTS memories (id INTEGER PRIMARY KEY AUTOINCREMENT, content TEXT NOT NULL, type TEXT DEFAULT 'episodic', strength REAL DEFAULT 1.0, tags TEXT DEFAULT '[]', created_at TEXT DEFAULT (datetime('now')))`,
  `CREATE TABLE IF NOT EXISTS learnings (id INTEGER PRIMARY KEY AUTOINCREMENT, pattern TEXT NOT NULL, context TEXT DEFAULT '', success_count INTEGER DEFAULT 0, fail_count INTEGER DEFAULT 0, last_used TEXT, created_at TEXT DEFAULT (datetime('now')))`,
  `CREATE TABLE IF NOT EXISTS actions (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, status TEXT DEFAULT 'pending', input TEXT, result TEXT, error TEXT, created_at TEXT DEFAULT (datetime('now')), completed_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS identity (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT DEFAULT (datetime('now')))`,
  `CREATE TABLE IF NOT EXISTS brain_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action_id INTEGER NOT NULL,
    tool TEXT DEFAULT 'cognition',
    step TEXT NOT NULL,
    content TEXT,
    model TEXT,
    tokens INTEGER,
    created_at TEXT DEFAULT (datetime('now'))
  )`,
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
  )`,
  `CREATE TABLE IF NOT EXISTS tool_recovery_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tool_name TEXT NOT NULL UNIQUE,
    max_retries INTEGER DEFAULT 3,
    initial_delay_ms INTEGER DEFAULT 100,
    backoff_factor REAL DEFAULT 2.0,
    fallback_tool TEXT,
    notify_user INTEGER DEFAULT 0,
    recovery_strategy TEXT DEFAULT 'exponential_backoff',
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

class ToolRecoveryError extends Error {
  constructor(message, toolName, originalError) {
    super(message);
    this.name = "ToolRecoveryError";
    this.toolName = toolName;
    this.originalError = originalError;
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

        // Exponential backoff with jitter
        const delay = Math.pow(2, retries) * 100 + Math.random() * 100;
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

async function addToolRecoveryRules(db) {
  try {
    // Check if recovery rules already exist
    const existingRules = await db.prepare("SELECT COUNT(*) as count FROM tool_recovery_rules").bind().first().then(r => r.count);

    if (existingRules === 0) {
      // Insert default recovery rules for critical tools
      const defaultRules = [
        {
          tool_name: 'web_search',
          max_retries: 5,
          initial_delay_ms: 200,
          backoff_factor: 2.5,
          fallback_tool: 'fallback_web_search',
          notify_user: 1,
          recovery_strategy: 'exponential_backoff_with_fallback'
        },
        {
          tool_name: 'web_fetch',
          max_retries: 3,
          initial_delay_ms: 150,
          backoff_factor: 2.0,
          fallback_tool: null,
          notify_user: 0,
          recovery_strategy: 'exponential_backoff'
        },
        {
          tool_name: 'github_read',
          max_retries: 3,
          initial_delay_ms: 100,
          backoff_factor: 2.0,
          fallback_tool: null,
          notify_user: 0,
          recovery_strategy: 'exponential_backoff'
        },
        {
          tool_name: 'github_write',
          max_retries: 3,
          initial_delay_ms: 100,
          backoff_factor: 2.0,
          fallback_tool: null,
          notify_user: 1,
          recovery_strategy: 'exponential_backoff'
        },
        {
          tool_name: 'code_interpreter',
          max_retries: 4,
          initial_delay_ms: 300,
          backoff_factor: 3.0,
          fallback_tool: null,
          notify_user: 1,
          recovery_strategy: 'exponential_backoff'
        }
      ];

      for (const rule of defaultRules) {
        await db.prepare(`
          INSERT INTO tool_recovery_rules
          (tool_name, max_retries, initial_delay_ms, backoff_factor, fallback_tool, notify_user, recovery_strategy, created_at, updated_at)
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, datetime('now'), datetime('now'))
        `).bind(
          rule.tool_name,
          rule.max_retries,
          rule.initial_delay_ms,
          rule.backoff_factor,
          rule.fallback_tool,
          rule.notify_user,
          rule.recovery_strategy
        ).run();
      }

      console.log('Added default tool recovery rules');
    }
  } catch (error) {
    await logError(db, 'addToolRecoveryRules', error, { context: 'initial setup' });
    throw error;
  }
}

async function getRecoveryStrategy(db, toolName) {
  try {
    const result = await db.prepare(`
      SELECT max_retries, initial_delay_ms, backoff_factor, fallback_tool, notify_user, recovery_strategy
      FROM tool_recovery_rules
      WHERE tool_name = ?1
    `).bind(toolName).all();

    if (result.results.length > 0) {
      return result.results[0];
    }

    // Return default strategy if no specific rule exists
    return {
      max_retries: 3,
      initial_delay_ms: 100,
      backoff_factor: 2.0,
      fallback_tool: null,
      notify_user: 0,
      recovery_strategy: 'exponential_backoff'
    };
  } catch (error) {
    await logError(db, 'getRecoveryStrategy', error, { toolName });
    // Return conservative defaults on error
    return {
      max_retries: 3,
      initial_delay_ms: 100,
      backoff_factor: 2.0,
      fallback_tool: null,
      notify_user: 0,
      recovery_strategy: 'exponential_backoff'
    };
  }
}

async function isToolRecoverable(db, toolName, error) {
  try {
    const toolRules = {
      web_search: ['TemporaryNetworkError', 'RateLimitError'],
      github_write: ['DatabaseConstraintError', 'TemporaryNetworkError'],
      github_read: ['TemporaryNetworkError'],
      web_fetch: ['TemporaryNetworkError', 'RateLimitError'],
      code_interpreter: ['TemporaryNetworkError']
    };

    if (toolRules[toolName]?.includes(error.name)) {
      return true;
    }

    // Check if error is recoverable by default
    return error.name === 'TemporaryNetworkError' ||
           error.name === 'RateLimitError' ||
           error.name === 'DatabaseConstraintError';
  } catch (checkError) {
    await logError(db, 'isToolRecoverable', checkError, { toolName, error: error.name });
    return true; // Default to recoverable if we can't determine
  }
}

async function invokeToolWithRecovery(db, toolName, args, context = {}) {
  let lastError, retryCount = 0;
  const strategy = await getRecoveryStrategy(db, toolName);

  while (retryCount < strategy.max_retries) {
    try {
      const tool = { func: eval(toolName) };
      const result = await tool.func(db, ...args);

      if (result?.error) {
        const error = new Error(result.error.message || 'Tool error');
        error.name = result.error.type || 'ToolError';
        error.context = { tool: toolName, args, attempt: retryCount + 1 };

        if (await isToolRecoverable(db, toolName, error)) {
          retryCount++;
          const delay = Math.pow(strategy.backoff_factor, retryCount) * strategy.initial_delay_ms + Math.random() * 100;
          await new Promise(resolve => setTimeout(resolve, delay));

          // Log recovery attempt
          await storeBrainLog(db, null, toolName, 'recovery_attempt', {
            error_type: error.name,
            attempt: retryCount,
            delay_ms: delay,
            strategy: strategy.recovery_strategy
          });

          continue;
        }

        await logError(db, 'invokeToolWithRecovery', error, {
          tool: toolName,
          attempt: retryCount + 1,
          maxRetries: strategy.max_retries
        });
        return { error, shouldEscalate: true };
      }

      // Log successful execution
      await storeBrainLog(db, null, toolName, 'tool_success', {
        tokens: result.tokens || 0,
        attempt: retryCount + 1
      });

      return result;
    } catch (error) {
      lastError = error;
      error.context = { tool: toolName, args, attempt: retryCount + 1 };

      if (await isToolRecoverable(db, toolName, error) && retryCount < strategy.max_retries - 1) {
        retryCount++;
        const delay = Math.pow(strategy.backoff_factor, retryCount) * strategy.initial_delay_ms + Math.random() * 100;
        await new Promise(resolve => setTimeout(resolve, delay));

        // Log recovery attempt
        await storeBrainLog(db, null, toolName, 'recovery_attempt', {
          error_type: error.name,
          attempt: retryCount,
          delay_ms: delay,
          strategy: strategy.recovery_strategy
        });

        continue;
      }

      await logError(db, 'invokeToolWithRecovery', error, {
        tool: toolName,
        attempt: retryCount + 1,
        maxRetries: strategy.max_retries
      });
      return { error: lastError, shouldEscalate: true };
    }
  }

  const error = new ToolRecoveryError('Max retries exceeded', toolName, lastError);
  error.context = { tool: toolName, args, retries: strategy.max_retries };
  await logError(db, 'invokeToolWithRecovery', error, {
    tool: toolName,
    retries: strategy.max_retries
  });

  // Attempt fallback if available
  if (strategy.fallback_tool) {
    try {
      const fallbackResult = await invokeToolWithRecovery(db, strategy.fallback_tool, args, context);
      if (!fallbackResult.error) {
        await storeBrainLog(db, null, toolName, 'fallback_success', {
          fallback_tool: strategy.fallback_tool,
          original_tool: toolName
        });
        return fallbackResult;
      }
    } catch (fallbackError) {
      await logError(db, 'invokeToolWithRecovery', fallbackError, {
        tool: toolName,
        fallback_tool: strategy.fallback_tool,
        context: 'fallback execution failed'
      });
    }
  }

  return { error, shouldEscalate: true };
}

async function getRecentToolErrors(db, toolName, limit = 5) {
  try {
    const result = await db.prepare(`
      SELECT el.error_type, el.error_message, el.context, el.created_at
      FROM error_logs el
      JOIN brain_logs bl ON json_extract(el.context, '$.action_id') = bl.action_id
      WHERE bl.tool = ?1 AND el.handled = 0
      ORDER BY el.created_at DESC
      LIMIT ?2
    `).bind(toolName, limit).all();

    return result.results || [];
  } catch (error) {
    await logError(db, 'getRecentToolErrors', error, { toolName, limit });
    return [];
  }
}

async function fallback_web_search(db, query, context = {}) {
  try {
    // Use Brave Search API as fallback
    const braveApiKey = process.env.BRAVE_SEARCH_API_KEY;
    if (!braveApiKey) {
      throw new Error('Brave Search API key not configured');
    }

    const url = `https://api.brave.com/search?q=${encodeURIComponent(query)}&count=5`;
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'X-Subscription-Token': braveApiKey
      }
    });

    if (!response.ok) {
      throw new Error(`Brave API request failed with status ${response.status}`);
    }

    const data = await response.json();

    // Format results similar to primary web_search
    const results = data.web?.results?.map(item => ({
      title: item.title,
      url: item.url,
      description: item.description,
      content: item.page_age ? `Page age: ${item.page_age}` : null
    })) || [];

    return {
      results,
      query,
      source: 'brave_fallback',
      fallback_used: true
    };
  } catch (error) {
    await logError(db, 'fallback_web_search', error, { query });
    throw error;
  }
}

async function github_write(db, input, context = {}) {
  return invokeToolWithRecovery(db, 'github_write', [input, context]);
}

async function github_read(db, input, context = {}) {
  return invokeToolWithRecovery(db, 'github_read', [input, context]);
}

async function web_search(db, query, context = {}) {
  return invokeToolWithRecovery(db, 'web_search', [query, context]);
}

async function web_fetch(db, url, context = {}) {
  return invokeToolWithRecovery(db, 'web_fetch', [url, context]);
}

async function code_interpreter(db, code, context = {}) {
  return invokeToolWithRecovery(db, 'code_interpreter', [code, context]);
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

    // Add 'bad' emotion when tools fail repeatedly
    const errorCount = await db.prepare("SELECT COUNT(*) as count FROM error_logs WHERE handled = 0 AND created_at > datetime('now', '-1 hour')").bind().first().then(r => r.count);
    if (errorCount > 3) {
      await updateEmotion(db, "bad", 1);
    }
  } catch (error) {
    await logError(db, 'driftEmotions', error, { context: 'emotion drift' });
    throw error;
  }
}

async function storeThought(db, content, action_id = null, tool = 'cognition') {
  try {
    await db.prepare(`
      INSERT INTO brain_logs
      (action_id, tool, step, content, created_at)
      VALUES (?1, ?2, 'thought', ?3, datetime('now'))
    `).bind(
      action_id,
      tool,
      content
    ).run();
  } catch (error) {
    await logError(db, 'storeThought', error, { content, action_id, tool });
    throw error;
  }
}

async function storeBrainLog(db, action_id, tool, step, metadata = {}) {
  try {
    await db.prepare(`
      INSERT INTO brain_logs
      (action_id, tool, step, content, created_at)
      VALUES (?1, ?2, ?3, ?4, datetime('now'))
    `).bind(
      action_id,
      tool,
      step,
      JSON.stringify(metadata)
    ).run();
  } catch (error) {
    await logError(db, 'storeBrainLog', error, { action_id, tool, step, metadata });
    throw error;
  }
}

async function recall(db, limit = 10) {
  try {
    const rows = await db.prepare("SELECT * FROM memories ORDER BY created_at DESC LIMIT ?1").bind(limit).all();
    if (!rows.results.length) return [];
    return rows.results;
  } catch (error) {
    await logError(db, 'recall', error, { limit });
    return [];
  }
}