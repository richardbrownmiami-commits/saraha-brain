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
  `CREATE TABLE IF NOT EXISTS error_patterns (id INTEGER PRIMARY KEY AUTOINCREMENT, pattern TEXT NOT NULL UNIQUE, context TEXT, severity INTEGER DEFAULT 3, resolution TEXT, created_at TEXT DEFAULT (datetime('now')), last_seen TEXT DEFAULT (datetime('now')))`,
  `CREATE TABLE IF NOT EXISTS user_feedback (id INTEGER PRIMARY KEY AUTOINCREMENT, response_id INTEGER, feedback_type TEXT NOT NULL, content TEXT, sentiment_score REAL, processed INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')))`,
  `CREATE TABLE IF NOT EXISTS feedback_analysis (id INTEGER PRIMARY KEY AUTOINCREMENT, feedback_id INTEGER, emotion_impact TEXT, context_accuracy TEXT, improvement_suggestions TEXT, confidence_change REAL, created_at TEXT DEFAULT (datetime('now')))`,
  `CREATE TABLE IF NOT EXISTS emotional_resonance_cache (id INTEGER PRIMARY KEY AUTOINCREMENT, text_hash TEXT UNIQUE, emotional_context TEXT, subtext_analysis TEXT, confidence_score REAL, created_at TEXT DEFAULT (datetime('now')))`,
  `CREATE TABLE IF NOT EXISTS contextual_understanding_cache (id INTEGER PRIMARY KEY AUTOINCREMENT, text_hash TEXT UNIQUE, idiom_score REAL, sarcasm_score REAL, figurative_score REAL, context_analysis TEXT, confidence REAL, created_at TEXT DEFAULT (datetime('now')))`,
  `CREATE TABLE IF NOT EXISTS meta_learning_patterns (id INTEGER PRIMARY KEY AUTOINCREMENT, pattern_hash TEXT UNIQUE, emotional_pattern TEXT, context_pattern TEXT, response_pattern TEXT, success_count INTEGER DEFAULT 0, fail_count INTEGER DEFAULT 0, last_used TEXT, created_at TEXT DEFAULT (datetime('now')))`,
  `CREATE TABLE IF NOT EXISTS emotion_context_mapping (id INTEGER PRIMARY KEY AUTOINCREMENT, emotion TEXT NOT NULL, context_type TEXT NOT NULL, context_value TEXT, strength REAL DEFAULT 1.0, last_seen TEXT DEFAULT (datetime('now')), UNIQUE(emotion, context_type, context_value))`,
  `CREATE TABLE IF NOT EXISTS hierarchical_learning_state (id INTEGER PRIMARY KEY AUTOINCREMENT, level INTEGER NOT NULL, state_data TEXT NOT NULL, last_updated TEXT DEFAULT (datetime('now')), UNIQUE(level))`,
  `CREATE TABLE IF NOT EXISTS graph_updates (id INTEGER PRIMARY KEY AUTOINCREMENT, update_type TEXT NOT NULL, entity_type TEXT, entity_id TEXT, changes TEXT, timestamp TEXT DEFAULT (datetime('now')), processed INTEGER DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS graph_patterns (id INTEGER PRIMARY KEY AUTOINCREMENT, pattern_hash TEXT UNIQUE, pattern_graph TEXT, frequency INTEGER DEFAULT 1, last_seen TEXT DEFAULT (datetime('now')))`,
  `CREATE TABLE IF NOT EXISTS gnn_model_state (id INTEGER PRIMARY KEY AUTOINCREMENT, model_version TEXT NOT NULL, state_data TEXT NOT NULL, performance_metrics TEXT, last_trained TEXT DEFAULT (datetime('now')))`
];

const EMOTIONS = ["energetic", "intelligent", "happy", "bad", "curious", "bored", "excited"];
const RANGES = { energetic: [1, 10], intelligent: [1, 10], happy: [1, 10], bad: [0, 3], curious: [1, 10], bored: [1, 10], excited: [1, 10] };
const EMO_DEFAULTS = { energetic: 5, intelligent: 5, happy: 5, bad: 0, curious: 5, bored: 5, excited: 5 };

// Enhanced error classification system
type ErrorClassification = {
  type: 'database' | 'network' | 'validation' | 'timeout' | 'unknown';
  severity: 'low' | 'medium' | 'high' | 'critical';
  context?: string;
};

class EnhancedError extends Error {
  classification: ErrorClassification;
  timestamp: string;
  recoveryAttempts: number;

  constructor(message: string, classification: ErrorClassification) {
    super(message);
    this.name = 'EnhancedError';
    this.classification = classification;
    this.timestamp = new Date().toISOString();
    this.recoveryAttempts = 0;
  }
}

async function classifyError(error: unknown): Promise<ErrorClassification> {
  if (error instanceof Error) {
    if (error.message.includes('database') || error.message.includes('SQL')) {
      return { type: 'database', severity: 'high', context: error.message };
    } else if (error.message.includes('network') || error.message.includes('fetch')) {
      return { type: 'network', severity: 'high', context: error.message };
    } else if (error.message.includes('validation') || error.message.includes('invalid')) {
      return { type: 'validation', severity: 'medium', context: error.message };
    } else if (error.message.includes('timeout')) {
      return { type: 'timeout', severity: 'critical', context: error.message };
    }
  }
  return { type: 'unknown', severity: 'low', context: error instanceof Error ? error.message : 'Unknown error' };
}

async function handleError(db: Database, error: unknown, context: string = 'general'): Promise<void> {
  const classification = await classifyError(error);
  classification.context = `${context}: ${classification.context}`;

  try {
    await db.prepare(`
      INSERT INTO error_patterns (pattern, context, severity, resolution, last_seen)
      VALUES (?1, ?2, ?3, ?4, datetime('now'))
      ON CONFLICT(pattern) DO UPDATE SET
        context = excluded.context,
        severity = CASE
          WHEN excluded.severity > error_patterns.severity THEN excluded.severity
          ELSE error_patterns.severity
        END,
        resolution = excluded.resolution,
        last_seen = datetime('now')
    `)
    .bind(
      classification.context,
      classification.context,
      classification.severity === 'critical' ? 5 :
      classification.severity === 'high' ? 4 :
      classification.severity === 'medium' ? 3 : 2,
      `Automatic recovery attempted for ${classification.type} error`
    )
    .run();
  } catch (dbError) {
    console.error('Failed to log error to database:', dbError);
  }

  console.error(`[${classification.severity.toUpperCase()}] ${classification.type.toUpperCase()} Error (${context}):`, error);
}

async function recoverFromError(db: Database, error: EnhancedError): Promise<boolean> {
  error.recoveryAttempts++;

  try {
    switch (error.classification.type) {
      case 'database':
        // Attempt database recovery
        await db.prepare("SELECT 1").run();
        return true;

      case 'network':
        // Network errors might need retry logic
        if (error.recoveryAttempts < 3) {
          await new Promise(resolve => setTimeout(resolve, 1000 * error.recoveryAttempts));
          return true;
        }
        return false;

      case 'validation':
        // Validation errors might need input correction
        return false;

      case 'timeout':
        // Critical errors that might need system reset
        if (error.recoveryAttempts === 1) {
          // Attempt graceful degradation
          return true;
        }
        return false;

      default:
        return false;
    }
  } catch (recoveryError) {
    await handleError(db, recoveryError, `recovery_attempt_${error.classification.type}`);
    return false;
  }
}

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
    const enhancedError = new EnhancedError('Error fetching emotions', {
      type: 'database',
      severity: 'high',
      context: 'emotion_retrieval'
    });
    await handleError(db, enhancedError);
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
    const enhancedError = new EnhancedError('Error fetching state', {
      type: 'database',
      severity: 'high',
      context: 'state_retrieval'
    });
    await handleError(db, enhancedError);
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
    const enhancedError = new EnhancedError(`Error updating emotion ${name}`, {
      type: 'database',
      severity: 'high',
      context: `emotion_update_${name}`
    });
    await handleError(db, enhancedError);
    throw enhancedError;
  }
}

async function getRegulator(db: Database) {
  try {
    const rows = await db.prepare("SELECT key, value FROM identity WHERE key IN ('energy','confidence')").all();
    const vals = { energy: 100, confidence: 50 };
    for (const r of rows.results) vals[r.key] = parseFloat(r.value) || vals[r.key];
    return { energy: vals.energy, confidence: vals.confidence };
  } catch (error) {
    const enhancedError = new EnhancedError('Error fetching regulator values', {
      type: 'database',
      severity: 'high',
      context: 'regulator_retrieval'
    });
    await handleError(db, enhancedError);
    return { energy: 100, confidence: 50 };
  }
}

async function adjustEnergy(db: Database, delta: number) {
  try {
    const { energy } = await getRegulator(db);
    const newVal = Math.max(0, Math.min(100, energy + delta));
    await db.prepare("INSERT INTO identity (key, value, updated_at) VALUES ('energy', ?1, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = ?1, updated_at = datetime('now')").bind(newVal.toString()).run();
  } catch (error) {
    const enhancedError = new EnhancedError('Error adjusting energy', {
      type: 'database',
      severity: 'high',
      context: 'energy_adjustment'
    });
    await handleError(db, enhancedError);
    throw enhancedError;
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
            const enhancedError = new EnhancedError(`Failed to update emotion ${emotion} after ${MAX_RETRIES} attempts`, {
              type: 'database',
              severity: 'high',
              context: `emotion_decay_${emotion}`
            });
            await handleError(db, enhancedError);
            throw enhancedError;
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
            const enhancedError = new EnhancedError(`Failed to decay negative emotion after ${MAX_RETRIES} attempts`, {
              type: 'database',
              severity: 'high',
              context: 'negative_emotion_decay'
            });
            await handleError(db, enhancedError);
            throw enhancedError;
          }