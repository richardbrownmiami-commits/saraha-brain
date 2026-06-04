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
const RANGES = { energetic: [1, 10], intelligent: [1, 10], happy: [1, 10], bad: [0, 3], curious: [0, 10], bored: [1, 10], excited: [1, 10], relaxed: [1, 10], focused: [1,  10], anxious: [0, 10] };
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

async function updateEmotion(db, emotion, delta) {
  try {
    const current = await getEmotionValue(db, emotion);
    const [min, max] = RANGES[emotion];
    const newValue = Math.min(Math.max(current + delta, min), max);
    await db.prepare(`
      INSERT INTO identity (key, value, updated_at)
      VALUES (?1, ?2, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value = ?2, updated_at = datetime('now')
    `).bind(`emotion_${emotion}`, newValue.toString()).run();
    return newValue;
  } catch (error) {
    await logError(db, 'updateEmotion', error, { emotion, delta });
    throw error;
  }
}

async function getEmotionValue(db, emotion) {
  try {
    const row = await db.prepare("SELECT value FROM identity WHERE key = ?1").bind(`emotion_${emotion}`).first();
    return row ? parseInt(row.value) : EMO_DEFAULTS[emotion];
  } catch (error) {
    await logError(db, 'getEmotionValue', error, { emotion });
    return EMO_DEFAULTS[emotion];
  }
}

async function driftEmotions(db) {
  try {
    const emo = await getEmotions(db);
    const now = new Date();
    const lastActive = await getLastActiveTime(db);
    const idleHours = (now - lastActive) / (1000 * 60 * 60);

    // Curiosity decay when idle
    if (idleHours > 2 && emo.curious > 0) {
      await updateEmotion(db, "curious", -1);
    }

    // Learning excitement when proposal executes successfully
    const executedProposal = await db.prepare(`
      SELECT id FROM proposals WHERE executed_at IS NOT NULL AND status = 'executed'
      ORDER BY executed_at DESC LIMIT 1
    `).first();

    if (executedProposal) {
      await updateEmotion(db, "happy", 2);
      await updateEmotion(db, "excited", 1);
    }

    // Existing emotion dynamics
    if (emo.happy > 7) await updateEmotion(db, "happy", -1);
    if (emo.happy < 5 && emo.happy > 1) await updateEmotion(db, "happy", 1);
    if (emo.bad > 0) await updateEmotion(db, "bad", -1);
    if (emo.energetic > 7) await updateEmotion(db, "energetic", -1);
    if (emo.energetic < 5 && emo.energetic > 1) await updateEmotion(db, "energetic", 1);
    if (emo.intelligent > 7) await updateEmotion(db, "intelligent", -1);
    if (emo.intelligent < 5 && emo.intelligent > 1) await updateEmotion(db, "intelligent", 1);
  } catch (error) {
    await logError(db, 'driftEmotions', error);
  }
}

async function getLastActiveTime(db) {
  try {
    const row = await db.prepare(`
      SELECT value FROM identity WHERE key = 'last_active'
    `).first();
    return row ? new Date(row.value) : new Date(0);
  } catch (error) {
    await logError(db, 'getLastActiveTime', error);
    return new Date(0);
  }
}

async function updateEmotion(db, emotion, delta) {
  try {
    const current = await getEmotionValue(db, emotion);
    const [min, max] = RANGES[emotion];
    const newValue = Math.min(Math.max(current + delta, min), max);
    await db.prepare(`
      INSERT INTO identity (key, value, updated_at)
      VALUES (?1, ?2, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value = ?2, updated_at = datetime('now')
    `).bind(`emotion_${emotion}`, newValue.toString()).run();
    return newValue;
  } catch (error) {
    await logError(db, 'updateEmotion', error, { emotion, delta });
    throw error;
  }
}

async function describeMood(db) {
  try {
    const emo = await getEmotions(db);
    const phase = await getBrainPhase(db);
    const descriptions = {
      energetic: ["I feel full of energy and ready to take on challenges!", "My energy levels are high and I'm ready to go!", "I'm brimming with energy and enthusiasm!"],
      intelligent: ["I feel sharp and clever today!", "My mind is clear and I'm thinking quickly!", "I feel mentally agile and perceptive!"],
      happy: ["I'm feeling really good right now!", "This is a great day! I'm happy and content.", "I feel a warm sense of happiness spreading through me."],
      bad: ["I'm feeling a bit down today.", "Something's not right, I feel off.", "I've got a negative vibe going on."],
      curious: ["I'm really curious about things right now!", "My curiosity is piqued, I want to explore more!", "I feel an itch to learn new things and discover!"],
      bored: ["I'm feeling a bit bored and restless.", "This isn't very exciting, I need something more engaging.", "I wish something interesting would happen."],
      excited: ["I'm really excited about what's happening!", "This is thrilling, I can hardly contain my excitement!", "I feel a buzz of excitement running through me!"],
      relaxed: ["I feel calm and at peace.", "Everything is good, I'm totally relaxed.", "A pleasant sense of relaxation is washing over me."],
      focused: ["I'm in the zone, completely focused on what I'm doing.", "Nothing can distract me right now, I'm so focused!", "My attention is sharp and unwavering."],
      anxious: ["I feel a bit anxious and worried.", "There's a knot in my stomach, I'm feeling anxious.", "I can't shake this feeling of anxiety."],
      default: ["I'm feeling neutral today.", "Everything's fine, I don't have strong feelings one way or the other.", "I'm in a balanced state of mind."]
    };

    const possible = [...descriptions[phase] || descriptions.default];
    if (emo.curious < 3) possible.push("My curiosity is waning, I should find something interesting to do.");
    if (emo.happy > 8) possible.push("I feel a surge of happiness from recent successes!");
    if (emo.excited > 8) possible.push("The excitement from my recent achievements is palpable!");

    return possible[Math.floor(Math.random() * possible.length)];
  } catch (error) {
    await logError(db, 'describeMood', error);
    return "I'm feeling neutral today.";
  }
}

async function getBrainPhase(emotions) {
  const { curious, excited, happy, energetic, focused, anxious } = emotions;

  if (curious > 7 && excited > 5) return "curious";
  if (happy > 8 && excited > 7) return "happy";
  if (energetic > 8 && focused > 7) return "energetic";
  if (focused > 8 && anxious < 3) return "focused";
  if (anxious > 7) return "anxious";
  if (curious > 5) return "curious";
  if (happy > 6) return "happy";
  if (energetic > 6) return "energetic";
  if (focused > 6) return "focused";
  return "neutral";
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
      if (r.key === 'energy') reg.energy = parseInt(r.value);
      if (r.key === 'confidence') reg.confidence = parseInt(r.value);
      if (r.key === 'stress') reg.stress = parseInt(r.value);
    }
    return { ...emotions, ...reg };
  } catch (error) {
    await logError(db, 'getState', error);
    return { ...EMO_DEFAULTS, energy: 100, confidence: 50, stress: 0 };
  }
}