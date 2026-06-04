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

async function getEmotionValue(db, emotion) {
  const current = await getEmotions(db);
  return current[emotion] || EMO_DEFAULTS[emotion];
}

async function setEmotionValue(db, emotion, value) {
  try {
    const current = await getEmotions(db);
    const newValue = Math.max(RANGES[emotion][0], Math.min(value, RANGES[emotion][1]));
    await db.prepare("INSERT OR REPLACE INTO identity (key, value, updated_at) VALUES (?1, ?2, datetime('now'))")
      .bind(`emotion_${emotion}`, newValue.toString()).run();
    return newValue;
  } catch (error) {
    await logError(db, 'setEmotionValue', error, { emotion, value });
    throw error;
  }
}

async function recall(db, limit = 10) {
  // First get recent relevant memories from brain_knowledge
  const recentMemories = await db.prepare(
    `SELECT m.id, m.content, m.type, m.tags, m.strength, m.created_at
     FROM memories m
     WHERE m.content IN (
       SELECT key FROM brain_knowledge
       WHERE category IN ('episodic', 'semantic')
     )
     ORDER BY m.strength DESC, m.created_at DESC
     LIMIT ?1`
  ).bind(limit).all();

  if (recentMemories.results.length) {
    return recentMemories.results.map((m) =>
      `[${m.type}] ${m.content} (strength: ${m.strength}) (${m.created_at})`
    ).join("\n");
  }

  // Fallback to original behavior for new memories
  const rows = await db.prepare("SELECT * FROM memories ORDER BY created_at DESC LIMIT ?1").bind(limit).all();
  if (!rows.results.length) return "No memories yet.";
  return rows.results.map((m) => `[${m.type}] ${m.content} (${m.created_at})`).join("\n");
}

async function store(db, content, type = 'episodic', strength = 1.0, tags = []) {
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
    await logError(db, 'store', error, { content, type, strength, tags });
    throw error;
  }
}

async function searchKnowledge(db, query, category = null, limit = 5) {
  try {
    let sql = `SELECT key, content, category FROM brain_knowledge WHERE content LIKE ?1`;
    const params = [`%${query}%`];

    if (category) {
      sql += ` AND category = ?2`;
      params.push(category);
    }

    sql += ` ORDER BY created_at DESC LIMIT ?3`;
    const rows = await db.prepare(sql).bind(...params).all();

    return rows.results || [];
  } catch (error) {
    await logError(db, 'searchKnowledge', error, { query, category, limit });
    return [];
  }
}

async function storeKnowledge(db, key, content, category = 'general', source = 'user') {
  try {
    await db.prepare(`
      INSERT OR REPLACE INTO brain_knowledge (key, content, category, source, created_at)
      VALUES (?1, ?2, ?3, ?4, datetime('now'))
    `).bind(key, content, category, source).run();
  } catch (error) {
    await logError(db, 'storeKnowledge', error, { key, content, category, source });
    throw error;
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
  } catch (error) {
    await logError(db, 'setIdentity', error, { key, value });
    throw error;
  }
}

async function updateIdentity(db, key, value) {
  try {
    await db.prepare(`
      UPDATE identity
      SET value = ?2, updated_at = datetime('now')
      WHERE key = ?1
    `).bind(key, value).run();
  } catch (error) {
    await logError(db, 'updateIdentity', error, { key, value });
    throw error;
  }
}

async function storeBrainLog(db, actionId, tool, step, content = {}, model = null, tokens = 0) {
  try {
    await db.prepare(`
      INSERT INTO brain_logs (action_id, tool, step, content, model, tokens, created_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, datetime('now'))
    `).bind(
      actionId,
      tool,
      step,
      JSON.stringify(content),
      model,
      tokens
    ).run();
  } catch (error) {
    await logError(db, 'storeBrainLog', error, { actionId, tool, step, content, model, tokens });
    throw error;
  }
}

async function getProposals(db, status = null) {
  try {
    let query = "SELECT * FROM proposals";
    const params = [];

    if (status) {
      query += " WHERE status = ?1";
      params.push(status);
    }

    query += " ORDER BY created_at DESC";
    const rows = await db.prepare(query).bind(...params).all();

    return rows.results || [];
  } catch (error) {
    await logError(db, 'getProposals', error, { status });
    return [];
  }
}

async function getProposal(db, id) {
  try {
    const row = await db.prepare("SELECT * FROM proposals WHERE id = ?1").bind(id).first();
    return row || null;
  } catch (error) {
    await logError(db, 'getProposal', error, { id });
    return null;
  }
}

async function createProposal(db, title, whatDiff, howDiff, resourceType, riskPct = 0, researchSources = []) {
  try {
    const result = await db.prepare(`
      INSERT INTO proposals
      (title, what_diff, how_diff, resource_type, risk_pct, status, research_sources, created_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, datetime('now'))
    `).bind(
      title,
      whatDiff,
      howDiff,
      resourceType,
      riskPct,
      'pending',
      JSON.stringify(researchSources)
    ).run();

    return result.lastInsertRowid;
  } catch (error) {
    await logError(db, 'createProposal', error, { title, whatDiff, howDiff, resourceType, riskPct, researchSources });
    throw error;
  }
}

async function updateProposalStatus(db, id, status, decidedAt = null) {
  try {
    const updateData = {
      status,
      decided_at: decidedAt || (status === 'approved' || status === 'rejected' ? new Date().toISOString() : null)
    };

    await db.prepare(`
      UPDATE proposals
      SET status = ?1, decided_at = ?2
      WHERE id = ?3
    `).bind(updateData.status, updateData.decided_at, id).run();
  } catch (error) {
    await logError(db, 'updateProposalStatus', error, { id, status, decidedAt });
    throw error;
  }
}

async function storeAuthorityReceipt(db, proposalId, approvedBy, outcome, metrics = {}, prevRef = null) {
  try {
    await db.prepare(`
      INSERT INTO authority_receipts
      (proposal_id, approved_by, outcome, metrics, prev_ref, created_at)
      VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'))
    `).bind(
      proposalId,
      approvedBy,
      outcome,
      JSON.stringify(metrics),
      prevRef
    ).run();
  } catch (error) {
    await logError(db, 'storeAuthorityReceipt', error, { proposalId, approvedBy, outcome, metrics, prevRef });
    throw error;
  }
}

async function getLearnings(db, pattern = null) {
  try {
    let query = "SELECT * FROM learnings";
    const params = [];

    if (pattern) {
      query += " WHERE pattern = ?1";
      params.push(pattern);
    }

    query += " ORDER BY last_used DESC, success_count DESC";
    const rows = await db.prepare(query).bind(...params).all();

    return rows.results || [];
  } catch (error) {
    await logError(db, 'getLearnings', error, { pattern });
    return [];
  }
}

async function recordLearning(db, pattern, context = '', success = true) {
  try {
    const existing = await db.prepare("SELECT * FROM learnings WHERE pattern = ?1").bind(pattern).first();

    if (existing) {
      const updateData = {
        success_count: existing.success_count + (success ? 1 : 0),
        fail_count: existing.fail_count + (success ? 0 : 1),
        last_used: new Date().toISOString()
      };

      await db.prepare(`
        UPDATE learnings
        SET success_count = ?1, fail_count = ?2, last_used = ?3
        WHERE pattern = ?4
      `).bind(
        updateData.success_count,
        updateData.fail_count,
        updateData.last_used,
        pattern
      ).run();
    } else {
      await db.prepare(`
        INSERT INTO learnings (pattern, context, success_count, fail_count, last_used, created_at)
        VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'))
      `).bind(
        pattern,
        context,
        success ? 1 : 0,
        success ? 0 : 1,
        new Date().toISOString()
      ).run();
    }
  } catch (error) {
    await logError(db, 'recordLearning', error, { pattern, context, success });
    throw error;
  }
}

async function getActions(db, status = null) {
  try {
    let query = "SELECT * FROM actions";
    const params = [];

    if (status) {
      query += " WHERE status = ?1";
      params.push(status);
    }

    query += " ORDER BY created_at DESC";
    const rows = await db.prepare(query).bind(...params).all();

    return rows.results || [];
  } catch (error) {
    await logError(db, 'getActions', error, { status });
    return [];
  }
}

async function createAction(db, type, input = null, status = 'pending') {
  try {
    const result = await db.prepare(`
      INSERT INTO actions (type, status, input, created_at)
      VALUES (?1, ?2, ?3, datetime('now'))
    `).bind(type, status, input).run();

    return result.lastInsertRowid;
  } catch (error) {
    await logError(db, 'createAction', error, { type, input, status });
    throw error;
  }
}

async function updateActionStatus(db, id, status, result = null, error = null, completedAt = null) {
  try {
    await db.prepare(`
      UPDATE actions
      SET status = ?1, result = ?2, error = ?3, completed_at = ?4
      WHERE id = ?5
    `).bind(
      status,
      result,
      error,
      completedAt || new Date().toISOString(),
      id
    ).run();
  } catch (error) {
    await logError(db, 'updateActionStatus', error, { id, status, result, error, completedAt });
    throw error;
  }
}

async function getThoughtStream(db, limit = 20) {
  try {
    const rows = await db.prepare("SELECT * FROM thought_stream ORDER BY created_at DESC LIMIT ?1").bind(limit).all();
    return rows.results || [];
  } catch (error) {
    await logError(db, 'getThoughtStream', error, { limit });
    return [];
  }
}

async function addThought(db, content, mood = 'neutral', source = 'cron') {
  try {
    const result = await db.prepare(`
      INSERT INTO thought_stream (content, mood, source, created_at)
      VALUES (?1, ?2, ?3, datetime('now'))
    `).bind(content, mood, source).run();

    return result.lastInsertRowid;
  } catch (error) {
    await logError(db, 'addThought', error, { content, mood, source });
    throw error;
  }
}

async function getAntiPatterns(db) {
  try {
    const rows = await db.prepare("SELECT * FROM anti_patterns ORDER BY count DESC, last_seen DESC").all();
    return rows.results || [];
  } catch (error) {
    await logError(db, 'getAntiPatterns', error, {});
    return [];
  }
}

async function recordAntiPattern(db, pattern, rootCause, fix, linkedProposalId = null) {
  try {
    // Check if pattern already exists
    const existing = await db.prepare("SELECT * FROM anti_patterns WHERE pattern = ?1").bind(pattern).first();

    if (existing) {
      // Update existing record
      await db.prepare(`
        UPDATE anti_patterns
        SET root_cause = ?1, fix = ?2, count = count + 1, linked_proposal_id = ?3, last_seen = datetime('now')
        WHERE pattern = ?4
      `).bind(rootCause, fix, linkedProposalId, pattern).run();
    } else {
      // Insert new record
      await db.prepare(`
        INSERT INTO anti_patterns (pattern, root_cause, fix, linked_proposal_id, created_at, last_seen)
        VALUES (?1, ?2, ?3, ?4, datetime('now'), datetime('now'))
      `).bind(pattern, rootCause, fix, linkedProposalId).run();
    }
  } catch (error) {
    await logError(db, 'recordAntiPattern', error, { pattern, rootCause, fix, linkedProposalId });
    throw error;
  }
}

async function getContextualRules(db) {
  try {
    const rows =