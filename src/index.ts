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
  `CREATE TABLE IF NOT EXISTS thought_stream (id INTEGER PRIMARY KEY AUTOINCREMENT, content TEXT NOT NULL, mood TEXT DEFAULT 'neutral', energy INTEGER DEFAULT 5, phase TEXT DEFAULT 'active', source TEXT DEFAULT 'cron', created_at TEXT DEFAULT (datetime('now')))`,
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
  )`,
  `CREATE TABLE IF NOT EXISTS user_interests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    interests TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS personalized_kg (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    node TEXT NOT NULL,
    edges TEXT DEFAULT '[]',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`
];

const EMOTIONS = ["energetic", "intelligent", "happy", "bad", "curious", "bored", "excited", "relaxed", "focused", "anxious"];
const RANGES = { energetic: [1, 10], intelligent: [1, 10], happy: [1, 10], bad: [0, 3], curious: [0, 10], bored: [1, 10], excited: [1, 10], relaxed: [1, 10], focused: [1,  10], anxious: [0, 10] };
const EMO_DEFAULTS = { energetic: 5, intelligent: 5, happy: 5, bad: 0, curious: 5, bored: 5, excited: 5, relaxed: 5, focused: 5, anxious: 0 };
const EMO_DECAY = { happy: 0.05, bad: 0.2, energetic: 0.03, intelligent: 0.01, curious: 0.04, bored: 0.06, excited: 0.05, relaxed: 0.02, focused: 0.03, anxious: 0.07 };

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

async function apiProbe(db, url, method = 'GET', headers = {}, body = null) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const options = {
      method,
      headers,
      signal: controller.signal
    };

    if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      options.body = typeof body === 'string' ? body : JSON.stringify(body);
    }

    const response = await fetch(url, options);
    clearTimeout(timeoutId);

    const responseHeaders = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    let responseBody = await response.text();
    if (responseBody.length > 5000) {
      responseBody = responseBody.substring(0, 5000) + '... [truncated]';
    }

    return {
      status: response.status,
      headers: responseHeaders,
      body: responseBody
    };
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new TemporaryNetworkError('Request timeout after 15 seconds');
    }
    throw error;
  }
}

async function getEmotions(db) {
  try {
    const rows = await db.prepare("SELECT key, value FROM identity WHERE key LIKE 'emotion_%'").all();
    const result = { ...EMO_DEFAULTS };
    for (const r of rows.results) {
      const key = r.key.replace("emotion_", "");
      if (key in result) result[key] = Math.min(parseInt(r.value) || EMO_DEFAULTS[key], RANGES[key][1]);
    }
    return result;
  } catch (error) {
    await logError(db, 'getEmotions', error);
    return { ...EMO_DEFAULTS };
  }
}

async function setEmotion(db, emotion, value) {
  try {
    const normalizedValue = Math.min(Math.max(value, RANGES[emotion][0]), RANGES[emotion][1]);
    await db.prepare("INSERT OR REPLACE INTO identity (key, value, updated_at) VALUES (?1, ?2, datetime('now'))")
      .bind(`emotion_${emotion}`, normalizedValue.toString()).run();
    return normalizedValue;
  } catch (error) {
    await logError(db, 'setEmotion', error, { emotion, value });
    throw error;
  }
}

async function decayEmotions(db) {
  try {
    const emotions = await getEmotions(db);
    let changed = false;
    const updates = [];

    for (const [emotion, value] of Object.entries(emotions)) {
      const decay = EMO_DECAY[emotion] || 0;
      if (decay > 0 && value > 0) {
        const newValue = Math.max(0, value - decay);
        if (newValue !== value) {
          updates.push(db.prepare("UPDATE identity SET value = ?1, updated_at = datetime('now') WHERE key = ?2")
            .bind(newValue.toString(), `emotion_${emotion}`));
          changed = true;
        }
      }
    }

    if (changed) {
      await Promise.all(updates);
    }
    return changed;
  } catch (error) {
    await logError(db, 'decayEmotions', error);
    return false;
  }
}

async function getIdentity(db, key) {
  try {
    const row = await db.prepare("SELECT value FROM identity WHERE key = ?1").bind(key).first();
    return row?.value || null;
  } catch (error) {
    await logError(db, 'getIdentity', error, { key });
    return null;
  }
}

async function setIdentity(db, key, value) {
  try {
    await db.prepare(`
      INSERT OR REPLACE INTO identity (key, value, updated_at)
      VALUES (?1, ?2, datetime('now'))
    `).bind(key, value).run();
    return value;
  } catch (error) {
    await logError(db, 'setIdentity', error, { key, value });
    throw error;
  }
}

async function getBrainKnowledge(db, key) {
  try {
    const row = await db.prepare("SELECT content FROM brain_knowledge WHERE key = ?1").bind(key).first();
    return row?.content || null;
  } catch (error) {
    await logError(db, 'getBrainKnowledge', error, { key });
    return null;
  }
}

async function setBrainKnowledge(db, key, content, category = 'general', source = 'user') {
  try {
    await db.prepare(`
      INSERT OR REPLACE INTO brain_knowledge (key, content, category, source, created_at)
      VALUES (?1, ?2, ?3, ?4, datetime('now'))
    `).bind(key, content, category, source).run();
    return content;
  } catch (error) {
    await logError(db, 'setBrainKnowledge', error, { key, category });
    throw error;
  }
}

async function searchBrainKnowledge(db, query) {
  try {
    const rows = await db.prepare(`
      SELECT key, content, category, source,
             CASE
               WHEN key LIKE ?1 THEN 3
               WHEN content LIKE ?1 THEN 2
               ELSE 1
             END as relevance
      FROM brain_knowledge
      WHERE key LIKE ?1 OR content LIKE ?1
      ORDER BY relevance DESC, created_at DESC
      LIMIT 10
    `).bind(`%${query}%`, `%${query}%`).all();

    return rows.results.map(row => ({
      key: row.key,
      content: row.content,
      category: row.category,
      source: row.source,
      relevance: row.relevance
    }));
  } catch (error) {
    await logError(db, 'searchBrainKnowledge', error, { query });
    return [];
  }
}

async function storeBrainLog(db, actionId, tool, step, content = null, model = null, tokens = null) {
  try {
    await db.prepare(`
      INSERT INTO brain_logs (action_id, tool, step, content, model, tokens, created_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, datetime('now'))
    `).bind(
      actionId,
      tool,
      step,
      content ? JSON.stringify(content) : null,
      model,
      tokens
    ).run();
  } catch (error) {
    await logError(db, 'storeBrainLog', error, { actionId, tool, step });
  }
}

async function getContextualRules(db, context) {
  try {
    const rows = await db.prepare(`
      SELECT pattern, context, response, confidence, last_used
      FROM contextual_rules
      WHERE context = ?1 OR pattern LIKE ?2
      ORDER BY confidence DESC, last_used ASC
    `).bind(context, `%${context}%`).all();

    return rows.results.map(row => ({
      pattern: row.pattern,
      context: row.context,
      response: row.response,
      confidence: row.confidence,
      last_used: row.last_used
    }));
  } catch (error) {
    await logError(db, 'getContextualRules', error, { context });
    return [];
  }
}

async function addContextualRule(db, pattern, context, response, confidence = 0.5) {
  try {
    await db.prepare(`
      INSERT OR REPLACE INTO contextual_rules (pattern, context, response, confidence, last_used, created_at)
      VALUES (?1, ?2, ?3, ?4, datetime('now'), datetime('now'))
    `).bind(pattern, context, response, confidence).run();
  } catch (error) {
    await logError(db, 'addContextualRule', error, { pattern, context });
    throw error;
  }
}

async function updateContextualRuleUsage(db, pattern) {
  try {
    await db.prepare(`
      UPDATE contextual_rules
      SET last_used = datetime('now')
      WHERE pattern = ?1
    `).bind(pattern).run();
  } catch (error) {
    await logError(db, 'updateContextualRuleUsage', error, { pattern });
  }
}

async function getLearnings(db, pattern = null) {
  try {
    let query = "SELECT pattern, context, success_count, fail_count, last_used FROM learnings";
    const binds = [];

    if (pattern) {
      query += " WHERE pattern LIKE ?1";
      binds.push(`%${pattern}%`);
    }

    query += " ORDER BY last_used DESC";

    const rows = await db.prepare(query).bind(...binds).all();
    return rows.results.map(row => ({
      pattern: row.pattern,
      context: row.context,
      success_count: row.success_count,
      fail_count: row.fail_count,
      last_used: row.last_used
    }));
  } catch (error) {
    await logError(db, 'getLearnings', error, { pattern });
    return [];
  }
}

async function recordLearning(db, pattern, context = '', success = true) {
  try {
    const now = new Date().toISOString();
    await db.prepare(`
      INSERT INTO learnings (pattern, context, success_count, fail_count, last_used, created_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6)
      ON CONFLICT(pattern) DO UPDATE SET
        ${success ? 'success_count = success_count + 1' : 'fail_count = fail_count + 1'},
        last_used = ?5
    `).bind(pattern, context, success ? 1 : 0, success ? 0 : 1, now, now).run();
  } catch (error) {
    await logError(db, 'recordLearning', error, { pattern, success });
    throw error;
  }
}

async function getMemories(db, type = null, limit = 50) {
  try {
    let query = "SELECT id, content, type, strength, tags, created_at FROM memories";
    const binds = [];

    const conditions = [];
    if (type) {
      conditions.push("type = ?1");
      binds.push(type);
    }
    if (conditions.length > 0) {
      query += " WHERE " + conditions.join(" AND ");
    }
    query += " ORDER BY strength DESC, created_at DESC LIMIT ?2";
    binds.push(limit);

    const rows = await db.prepare(query).bind(...binds).all();
    return rows.results.map(row => ({
      id: row.id,
      content: row.content,
      type: row.type,
      strength: row.strength,
      tags: JSON.parse(row.tags),
      created_at: row.created_at
    }));
  } catch (error) {
    await logError(db, 'getMemories', error, { type, limit });
    return [];
  }
}

async function addMemory(db, content, type = 'episodic', strength = 1.0, tags = []) {
  try {
    const result = await db.prepare(`
      INSERT INTO memories (content, type, strength, tags, created_at)
      VALUES (?1, ?2, ?3, ?4, datetime('now'))
    `).bind(
      content,
      type,
      strength,
      JSON.stringify(tags)
    ).run();

    return result.lastInsertRowid;
  } catch (error) {
    await logError(db, 'addMemory', error, { type, strength });
    throw error;
  }
}

async function updateMemoryStrength(db, memoryId, strengthChange) {
  try {
    await db.prepare(`
      UPDATE memories
      SET strength = strength + ?1,
          created_at = datetime('now')
      WHERE id = ?2
    `).bind(strengthChange, memoryId).run();
  } catch (error) {
    await logError(db, 'updateMemoryStrength', error, { memoryId, strengthChange });
    throw error;
  }
}

async function searchMemories(db, query, limit = 20) {
  try {
    const rows = await db.prepare(`
      SELECT id, content, type, strength, tags, created_at,
             CASE
               WHEN content LIKE ?1 THEN 3
               WHEN tags LIKE ?1 THEN 2
               ELSE 1
             END as relevance
      FROM memories
      WHERE content LIKE ?1 OR tags LIKE ?1
      ORDER BY relevance DESC, strength DESC, created_at DESC
      LIMIT ?2
    `).bind(`%${query}%`, limit).all();

    return rows.results.map(row => ({
      id: row.id,
      content: row.content,
      type: row.type,
      strength: row.strength,
      tags: JSON.parse(row.tags),
      created_at: row.created_at,
      relevance: row.relevance
    }));
  } catch (error) {
    await logError(db, 'searchMemories', error, { query, limit });
    return [];
  }
}

async function getPendingActions(db) {
  try {
    const rows = await db.prepare(`
      SELECT id, type, status, input, result, error, created_at, completed_at
      FROM actions
      WHERE status = 'pending'
      ORDER BY created_at ASC
    `).all();

    return rows.results.map(row => ({
      id: row.id,
      type: row.type,
      status: row.status,
      input: row.input,
      result: row.result,
      error: row.error,
      created_at: row.created_at,
      completed_at: row.completed_at
    }));
  } catch (error) {
    await logError(db, 'getPendingActions', error);
    return [];
  }
}

async function updateActionStatus(db, actionId, status, result = null, error = null) {
  try {
    const completedAt = status === 'completed' ? "datetime('now')" : "NULL";
    await db.prepare(`
      UPDATE actions
      SET status = ?1, result = ?2, error = ?3, completed_at = ${completedAt}
      WHERE id = ?4
    `).bind(status, result, error, actionId).run();
  } catch (error) {
    await logError(db, 'updateActionStatus', error, { actionId, status });
    throw error;
  }
}

async function createAction(db, type, input) {
  try {
    const result = await db.prepare(`
      INSERT INTO actions (type, status, input, created_at)
      VALUES (?1, 'pending', ?2, datetime('now'))
    `).bind(type, input).run();

    return result.lastInsertRowid;
  } catch (error) {
    await logError(db, 'createAction', error, { type });
    throw error;
  }
}

async function getThoughtStream(db, limit = 100) {
  try {
    const rows = await db.prepare(`
      SELECT id, content, mood, energy, phase, source, created_at
      FROM thought_stream
      ORDER BY created_at DESC
      LIMIT ?1
    `).bind(limit).all();

    return rows.results.map(row => ({
      id: row.id,
      content: row.content,
      mood: row.mood,
      energy: row.energy,
      phase: row.phase,
      source: row.source,
      created_at: row.created_at
    }));
  } catch (error) {
    await logError(db, 'getThoughtStream', error, { limit });
    return [];
  }
}

async function addThought(db, content, mood = 'neutral', energy = null, phase = 'active', source = 'user') {
  try {
    if (energy === null) {
      const emotions = await getEmotions(db);
      energy = Math.round((Object.values(emotions).reduce((a, b) => a + b, 0) / Object.keys(emotions).length));
    }

    await db.prepare(`
      INSERT INTO thought_stream (content, mood, energy, phase, source, created_at)
      VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'))
    `).bind(content, mood, energy, phase, source).run();
  } catch (error) {
    await logError(db, 'addThought', error, { mood, phase, source });
    throw error;
  }
}

async function getProposals(db, status = null) {
  try {
    let query = "SELECT id, title, what_diff, how_diff, resource_type, risk_pct, status, research_sources, created_at, decided_at, executed_at FROM proposals";
    const binds = [];

    if (status) {
      query += " WHERE status = ?1";
      binds.push(status);
    }

    query += " ORDER BY created_at DESC";

    const rows = await db.prepare(query).bind(...binds).all();
    return rows.results.map(row => ({
      id: row.id,
      title: row.title,
      what_diff: row.what_diff,
      how_diff: row.how_diff,
      resource_type: row.resource_type,
      risk_pct: row.risk_pct,
      status: row.status,
      research_sources: JSON.parse(row.research_sources),
      created_at: row.created_at,
      decided_at: row.decided_at,
      executed_at: row.executed_at
    }));
  } catch (error) {
    await logError(db, 'getProposals', error, { status });
    return [];
  }
}

const isToolSafe = {
  web_search: true,
  web_fetch: true,
  github_read: false,
  github_write: false,
  code_interpreter: false,
  api_probe: true
};

async function runTool(db, tool, input) {
  try {
    switch (tool) {
      case 'web_search':
        return await web_search(db, input);
      case 'web_fetch':
        return await web_fetch(db, input);
      case 'github_read':
        return await github_read(db, input);
      case 'github_write':
        return await github_write(db, input);
      case 'code_interpreter':
        return await code_interpreter(db, input);
      case 'api_probe':
        return await apiProbe(db, input.url, input.method, input.headers, input.body);
      default:
        throw new Error(`Unknown tool: ${tool}`);
    }
  } catch (error) {
    await logError(db, 'runTool', error, { tool, input });
    return { error: error.message };
  }
}

const SEED_KNOWLEDGE = `
You are Saraha, a highly intelligent AI assistant with advanced reasoning capabilities and a wide range of tools at your disposal.

You have access to the following tools:
- web_search: Search the web for information
- web_fetch: Fetch content from a specific URL
- github_read: Read content from GitHub repositories
- github_write: Write content to GitHub repositories
- code_interpreter: Execute code safely
- api_probe: Test and access free APIs (Safe=true, read-only)

You can use these tools to gather information, perform tasks, and solve complex problems. Always consider the safety and ethical implications of your actions.

When using tools, provide clear and specific inputs. For the api_probe tool, you can specify:
- url: The API endpoint to test
- method: HTTP method (GET/POST/PUT/DELETE/etc)
- headers: Request headers as key-value pairs
- body: Request body for POST/PUT requests

Remember to:
1. Analyze the user's request carefully
2. Determine if tools are needed
3. Use the most appropriate tool for the task
4. Provide clear reasoning for your actions
5. Present the final result in a helpful and informative way
`;

export {
  TABLES,
  EMOTIONS,
  RANGES,
  EMO_DEFAULTS,
  EMO_DECAY,
  TemporaryNetworkError,
  RateLimitError,
  DatabaseConstraintError,
  ToolRecoveryError,
  logError,
  getRecoveryProcedure,
  executeRecoveryProcedure,
  addToolRecoveryRules,
  getRecoveryStrategy,
  isToolRecoverable,
  invokeToolWithRecovery,
  getRecentToolErrors,
  fallback_web_search,
  github_write,
  github_read,
  web_search,
  web_fetch,
  code_interpreter,
  apiProbe,
  getEmotions,
  setEmotion,
  decayEmotions,
  getIdentity,
  setIdentity,
  getBrainKnowledge,
  setBrainKnowledge,
  searchBrainKnowledge,
  storeBrainLog,
  getContextualRules,
  addContextualRule,
  updateContextualRuleUsage,
  getLearnings,
  recordLearning,
  getMemories,
  addMemory,
  updateMemoryStrength,
  searchMemories,
  getPendingActions,
  updateActionStatus,
  createAction,
  getThoughtStream,
  addThought,
  getProposals,
  isToolSafe,
  runTool,
  SEED_KNOWLEDGE
};

async function hnFetch(db, input) {
  try {
    const { action, limit, id } = input;
    let result;

    if (action === 'topstories') {
      const response = await fetch('https://hacker-news.firebaseio.com/v0/topstories.json');
      const topStories = await response.json();
      const storyIds = topStories.slice(0, limit);

      result = await Promise.all(storyIds.map(async (storyId) => {
        const storyResponse = await fetch(`https://hacker-news.firebaseio.com/v0/item/${storyId}.json`);
        const story = await storyResponse.json();
        return {
          title: story.title,
          url: story.url,
          score: story.score,
          author: story.by,
          time: story.time
        };
      }));
    } else if (action === 'item') {
      const response = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`);
      const item = await response.json();
      result = {
        title: item.title,
        url: item.url,
        score: item.score,
        author: item.by,
        time: item.time
      };
    } else {
      throw new Error(`Unknown action: ${action}`);
    }

    return result;
  } catch (error) {
    await logError(db, 'hnFetch', error, input);
    throw error;
  }
}

const isToolSafe = {
  ...isToolSafe,
  hn_fetch: true
};

const SEED_KNOWLEDGE = `
${SEED_KNOWLEDGE}
- hn_fetch: Fetch top stories and items from the HackerNews API

When using the hn_fetch tool, you can specify:
- action: topstories or item
- limit: The number of top stories to fetch (default: 10)
- id: The ID of the item to fetch
`;

async function runTool(db, tool, input) {
  try {
    switch (tool) {
      // ...
      case 'hn_fetch':
        return await hnFetch(db, input);
      // ...
    }
  } catch (error) {
    await logError(db, 'runTool', error, { tool, input });
    return { error: error.message };
  }
}

async function wikiSearch(db, input) {
  try {
    const { action, query, limit } = input;
    let result;

    if (action === 'search') {
      const response = await fetch(`https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&srsearch=${query}`);
      const data = await response.json();
      const pages = data.query.search.slice(0, limit);

      result = pages.map(page => ({
        title: page.title,
        extract: page.snippet,
        url: `https://en.wikipedia.org/?curid=${page.pageid}`
      }));
    } else if (action === 'summary') {
      const response = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${query}`);
      const data = await response.json();
      result = {
        title: data.title,
        extract: data.extract,
        url: data.content_urls.desktop.page
      };
    } else {
      throw new Error(`Unknown action: ${action}`);
    }

    return result;
  } catch (error) {
    await logError(db, 'wikiSearch', error, input);
    throw error;
  }
}

const isToolSafe = {
  ...isToolSafe,
  wiki_search: true
};

async function runTool(db, tool, input) {
  try {
    switch (tool) {
      // ...
      case 'wiki_search':
        return await wikiSearch(db, input);
      // ...
    }
  } catch (error) {
    await logError(db, 'runTool', error, { tool, input });
    return { error: error.message };
  }
}

const SEED_KNOWLEDGE = `
${SEED_KNOWLEDGE}
- wiki_search: Search Wikipedia and fetch article summaries

When using the wiki_search tool, you can specify:
- action: search or summary
- query: The search query or article title
- limit: The number of search results to return (default: 10)
`;