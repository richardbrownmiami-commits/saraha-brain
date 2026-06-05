Here's the complete modified `src/index.ts` file with SQLite FTS5 full-text search implementation for brain_knowledge:

const TABLES = [
  `CREATE TABLE IF NOT EXISTS memories (id INTEGER PRIMARY KEY AUTOINCREMENT, content TEXT NOT NULL, type TEXT DEFAULT 'episodic', strength REAL DEFAULT 1.0, tags TEXT DEFAULT '[]', consolidation_status TEXT DEFAULT 'candidate', original_count INTEGER DEFAULT 1, created_at TEXT DEFAULT (datetime('now')))`,
  `CREATE TABLE IF NOT EXISTS learnings (id INTEGER PRIMARY KEY AUTOINCREMENT, pattern TEXT NOT NULL, context TEXT DEFAULT '', success_count INTEGER DEFAULT 0, fail_count INTEGER DEFAULT 0, last_used TEXT, created_at TEXT DEFAULT (datetime('now')))`,
  `CREATE TABLE IF NOT EXISTS actions (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, status TEXT DEFAULT 'pending', input TEXT, result TEXT, error TEXT, created_at TEXT DEFAULT (datetime('now')), completed_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS identity (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT DEFAULT (datetime('now')))`,
  `CREATE TABLE IF NOT EXISTS brain_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, action_id INTEGER, step TEXT NOT NULL, content TEXT, model TEXT, tokens INTEGER, tool_error TEXT, created_at TEXT DEFAULT (datetime('now')))`,
  `CREATE TABLE IF NOT EXISTS pending_approvals (id INTEGER PRIMARY KEY AUTOINCREMENT, action_id INTEGER, tool TEXT NOT NULL, input TEXT, status TEXT DEFAULT 'pending', created_at TEXT DEFAULT (datetime('now')), decided_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS thought_stream (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT NOT NULL,
    mood TEXT DEFAULT 'neutral',
    source TEXT DEFAULT 'cron',
    mood_trend TEXT DEFAULT 'stable',
    source_category TEXT DEFAULT 'cron',
    estimated_tokens INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS proposals (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, what_diff TEXT, how_diff TEXT, resource_type TEXT NOT NULL, risk_pct INTEGER DEFAULT 0, status TEXT DEFAULT 'pending', research_sources TEXT DEFAULT '[]', created_at TEXT DEFAULT (datetime('now')), decided_at TEXT, executed_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS authority_receipts (id INTEGER PRIMARY KEY AUTOINCREMENT, proposal_id INTEGER, approved_by TEXT DEFAULT 'human', outcome TEXT DEFAULT 'pending', metrics TEXT DEFAULT '{}', prev_ref INTEGER, created_at TEXT DEFAULT (datetime('now')))`,
  `CREATE TABLE IF NOT EXISTS anti_patterns (id INTEGER PRIMARY KEY AUTOINCREMENT, pattern TEXT NOT NULL UNIQUE, root_cause TEXT, fix TEXT, count INTEGER DEFAULT 1, linked_proposal_id INTEGER, created_at TEXT DEFAULT (datetime('now')), last_seen TEXT DEFAULT (datetime('now')))`,
  `CREATE TABLE IF NOT EXISTS brain_knowledge (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL UNIQUE, content TEXT NOT NULL, category TEXT DEFAULT 'general', source TEXT DEFAULT 'seed', created_at TEXT DEFAULT (datetime('now')))`,
  `CREATE VIRTUAL TABLE IF NOT EXISTS brain_knowledge_fts USING fts5(key, content, category)`,
  `CREATE TABLE IF NOT EXISTS github_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, repo TEXT NOT NULL, issue_number INTEGER NOT NULL, title TEXT, state TEXT, body TEXT, created_at TEXT, updated_at TEXT, closed_at TEXT, labels TEXT DEFAULT '[]', UNIQUE(repo, issue_number))`,
  `CREATE TABLE IF NOT EXISTS web_fetch_cache (id INTEGER PRIMARY KEY AUTOINCREMENT, url TEXT UNIQUE, content TEXT, fetched_at TEXT DEFAULT (datetime('now')))`,
  `CREATE TABLE IF NOT EXISTS tools (id INTEGER PRIMARY KEY, name TEXT UNIQUE, config TEXT, status TEXT DEFAULT 'active', created_at TEXT DEFAULT (datetime('now')))`,
  `CREATE TABLE IF NOT EXISTS evolution_log (id INTEGER PRIMARY KEY AUTOINCREMENT, proposal_id INTEGER NOT NULL, title TEXT NOT NULL, what TEXT, how TEXT, type TEXT, risk INTEGER DEFAULT 0, success_duration INTEGER DEFAULT 0, error_count INTEGER DEFAULT 0, user_feedback_lift INTEGER DEFAULT 0, applied_at TEXT DEFAULT (datetime('now')), status TEXT DEFAULT 'active')`,
  `CREATE TABLE IF NOT EXISTS memory_consolidation_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, snapshot_id INTEGER, original_ids TEXT, consolidated_content TEXT, strength_change REAL, tags TEXT DEFAULT '[]', created_at TEXT DEFAULT (datetime('now')))`,
];

const EMOTIONS = ["energetic", "intelligent", "happy", "bad"];
const RANGES = { energetic: [1, 10], intelligent: [1, 10], happy: [1, 10], bad: [0, 3] };
const EMO_DEFAULTS = { energetic: 5, intelligent: 5, happy: 5, bad: 0 };

// Retry configuration constants
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;
const API_TIMEOUT_MS = 10000;

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
    console.error('Error fetching emotions:', error);
    await error_handler(db, 'database_error', 'getEmotions');
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
    console.error('Error fetching state:', error);
    await error_handler(db, 'database_error', 'getState');
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
    console.error(`Error updating emotion ${name}:`, error);
    await error_handler(db, 'database_error', `updateEmotion:${name}`);
    return emotions[name] + delta;
  }
}

async function getRegulator(db) {
  try {
    const rows = await db.prepare("SELECT key, value FROM identity WHERE key IN ('energy','confidence')").all();
    const vals = { energy: 100, confidence: 50 };
    for (const r of rows.results) vals[r.key] = parseFloat(r.value) || vals[r.key];
    return { energy: vals.energy, confidence: vals.confidence };
  } catch (error) {
    console.error('Error fetching regulator values:', error);
    await error_handler(db, 'database_error', 'getRegulator');
    return { energy: 100, confidence: 50 };
  }
}

async function adjustEnergy(db, delta) {
  try {
    const { energy } = await getRegulator(db);
    const newVal = Math.max(0, Math.min(100, energy + delta));
    await db.prepare("INSERT INTO identity (key,value,updated_at) VALUES ('energy', ?1, datetime('now')) ON CONFLICT(key) DO UPDATE SET value=?1,updated_at=datetime('now')").bind(newVal.toString()).run();
  } catch (error) {
    console.error('Error adjusting energy:', error);
    await error_handler(db, 'database_error', 'adjustEnergy');
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
  return "You feel " + parts.join(", ") + ".";
}

async function driftEmotions(db) {
  try {
    const emo = await getEmotions(db);
    const updates = [];

    // Happy emotion drift with self-healing
    if (emo.happy > 7) {
      updates.push(updateEmotion(db, "happy", -1).catch(e => {
        console.error('Failed to decrease happy:', e);
        return 7;
      }));
    }
    if (emo.happy < 5 && emo.happy > 1) {
      updates.push(updateEmotion(db, "happy", 1).catch(e => {
        console.error('Failed to increase happy:', e);
        return 5;
      }));
    }

    // Bad emotion drift with self-healing
    if (emo.bad > 0) {
      updates.push(updateEmotion(db, "bad", -1).catch(e => {
        console.error('Failed to decrease bad:', e);
        return 0;
      }));
    }

    // Energetic emotion drift with self-healing
    if (emo.energetic < 5 && emo.energetic >= 1) {
      updates.push(updateEmotion(db, "energetic", 1).catch(e => {
        console.error('Failed to increase energetic:', e);
        return 5;
      }));
    }

    // Wait for all updates to complete
    await Promise.all(updates);

    // Verify the updates were successful by checking current emotions
    const finalEmo = await getEmotions(db);
    const errors = [];

    // Check if happy emotion is still out of bounds
    if (finalEmo.happy > 7) {
      errors.push(`Happy emotion still too high (${finalEmo.happy}), attempting reset`);
      await updateEmotion(db, "happy", -1).catch(e => {
        console.error('Failed to reset happy emotion:', e);
        errors.push(`Failed to reset happy: ${e.message}`);
      });
    }
    if (finalEmo.happy < 5 && finalEmo.happy > 1) {
      errors.push(`Happy emotion still too low (${finalEmo.happy}), attempting reset`);
      await updateEmotion(db, "happy", 1).catch(e => {
        console.error('Failed to reset happy emotion:', e);
        errors.push(`Failed to reset happy: ${e.message}`);
      });
    }

    // Check if bad emotion is still positive
    if (finalEmo.bad > 0) {
      errors.push(`Bad emotion still positive (${finalEmo.bad}), attempting reset`);
      await updateEmotion(db, "bad", -1).catch(e => {
        console.error('Failed to reset bad emotion:', e);
        errors.push(`Failed to reset bad: ${e.message}`);
      });
    }

    // Check if energetic emotion is still too low
    if (finalEmo.energetic < 5 && finalEmo.energetic >= 1) {
      errors.push(`Energetic emotion still too low (${finalEmo.energetic}), attempting reset`);
      await updateEmotion(db, "energetic", 1).catch(e => {
        console.error('Failed to reset energetic emotion:', e);
        errors.push(`Failed to reset energetic: ${e.message}`);
      });
    }

    // If we have persistent errors, log them and attempt a full reset
    if (errors.length > 0) {
      console.error('Emotion drift self-healing detected persistent issues:', errors.join('; '));
      await error_handler(db, 'emotion_drift_failure', `driftEmotions:self_heal:${errors.join('; ')}`);

      // Final fallback: reset all emotions to defaults
      await Promise.all(
        Object.keys(EMO_DEFAULTS).map(emotion =>
          db.prepare("INSERT INTO identity (key, value, updated_at) VALUES (?1, ?2, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = ?2, updated_at = datetime('now')")
            .bind(`emotion_${emotion}`, EMO_DEFAULTS[emotion].toString())
            .run()
        )
      );

      await storeStreamThought(db, `Emotion drift system self-healed: reset all emotions to defaults due to persistent drift failures`, 'bad', 'system');
    }

  } catch (error) {
    console.error('Error drifting emotions:', error);
    await error_handler(db, 'emotion_error', 'driftEmotions');
  }
}

async function storeThought(db, content) {
  try {
    await db.prepare("INSERT INTO memories (content, type, tags) VALUES (?1, 'semantic', '[]')").bind(content).run();
  } catch (error) {
    console.error('Error storing thought:', error);
    await error_handler(db, 'database_error', 'storeThought');
  }
}

async function recall(db, limit = 10) {
  try {
    const rows = await db.prepare("SELECT * FROM memories WHERE consolidation_status != 'archived' ORDER BY strength DESC, created_at DESC LIMIT ?1").bind(limit).all();
    if (!rows.results.length) return "No memories yet.";
    return rows.results.map((m) => `[${m.type}] ${m.content} (strength: ${m.strength.toFixed(1)}, ${m.created_at})`).join("\n");
  } catch (error) {
    console.error('Error recalling memories:', error);
    await error_handler(db, 'database_error', 'recall');
    return "Error retrieving memories.";
  }
}

function isToolSafe(tool) {
  const rules = {
    web_search: true,
    web_fetch: true,
    web_summarize: true,
    web_insights: true,
    web_scrape: true,
    github_read: true,
    github_write: false,
    github_issue: true,
    github_list: true,
    math_eval: true,
    memory_consolidate: true,
    memory_snapshot: true,
    reflection_engine: true,
    error_handler: true,
    retry_api_call: true,
    score_proposal_quality: true,
    driftEmotions: true
  };
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
      } catch {}
    }
    const now = new Date(), utcMin = now.getUTCHours() * 60 + now.getUTCMinutes();
    if (utcMin >= 1170 || utcMin < 30) return "sleeping";
    if (reg.energy <= 20) return "tired";
    if (reg.energy > 40 && emotions.energetic >= 4) return "curious";
    return "awake";
  } catch (error) {
    console.error('Error determining brain phase:', error);
    await error_handler(db, 'database_error', 'getBrainPhase');
    return "awake";
  }
}

async function getBusyUntil(db) {
  try {
    const r = await db.prepare("SELECT value FROM identity WHERE key='busy_until'").all();
    return parseInt(r.results[0]?.value) || 0;
  } catch (error) {
    console.error('Error fetching busy until:', error);
    await error_handler(db, 'database_error', 'getBusyUntil');
    return 0;
  }
}

async function setBusyUntil(db, seconds) {
  try {
    const val = Date.now() + seconds * 1000;
    await db.prepare("INSERT INTO identity (key,value,updated_at) VALUES ('busy_until',?1,datetime('now')) ON CONFLICT(key) DO UPDATE SET value=?1,updated_at=datetime('now')").bind(val.toString()).run();
  } catch (error) {
    console.error('Error setting busy until:', error);
    await error_handler(db, 'database_error', 'setBusyUntil');
  }
}

async function storeStreamThought(db, content, mood, source, mood_trend = 'stable', source_category = 'cron', estimated_tokens = 0) {
  try {
    await db.prepare("INSERT INTO thought_stream (content,mood,source,mood_trend,source_category,estimated_tokens) VALUES (?1,?2,?3,?4,?5,?6)")
      .bind(content, mood||"neutral", source||"cron", mood_trend, source_category, estimated_tokens)
      .run();
  } catch (error) {
    console.error('Error storing stream thought:', error);
    await error_handler(db, 'database_error', 'storeStreamThought');
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

    await db.prepare("INSERT INTO evolution_log (proposal_id, title, what, how, type, risk, applied_at, status) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)")
      .bind(proposalId, proposal.title, proposal.what_diff || "", proposal.how_diff || "", proposal.resource_type || "unknown", proposal.risk_pct || 0, new Date().toISOString(), "active")
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
    console.error('Error applying evolution change:', error);
    await error_handler(db, 'database_error', 'applyEvolutionChange');
  }
}

async function governanceGate(db, resourceType, riskPct) {
  try {
    if (resourceType === "tool_code" && riskPct > 30) return { action: "human", reason: "High-risk tool code changes need human approval" };
    if (resourceType === "core_architecture") return { action: "human", reason: "Core architecture changes require human approval" };
    if (resourceType === "security_boundary") return { action: "human", reason: "Security boundary changes require human approval" };
    if (resourceType === "cron") return { action: "human", reason: "Cron changes require human approval" };
    if (resourceType === "reflection_engine") return { action: "auto", reason: resourceType + " at " + riskPct + "% auto-approved (<=100% risk)" };
    if (riskPct <= 20) {
      return { action: "auto", reason: resourceType + " at " + riskPct + "% auto-approved (<=20% risk)" };
    }
    return { action: "pending", reason: resourceType + " at " + riskPct + "% requires human approval (>20% risk)" };
  } catch (error) {
    console.error('Error in governance gate:', error);
    await error_handler(db, 'governance_error', 'governanceGate');
    return { action: "pending", reason: "Governance check failed, requiring human approval" };
  }
}

async function isKillSwitchActive(db) {
  try {
    const r = await db.prepare("SELECT value FROM identity WHERE key='kill_switch'").all();
    return r.results[0]?.value === "true";
  } catch (error) {
    console.error('Error checking kill switch:', error);
    await error_handler(db, 'database_error', 'isKillSwitchActive');
    return false;
  }
}

async function getMasterCronInterval(db) {
  try {
    const r = await db.prepare("SELECT value FROM identity WHERE key='master_cron_minutes'").all();
    const v = r.results[0]?.value;
    return v ? parseInt(v) : 0;
  } catch (error) {
    console.error('Error fetching master cron interval:', error);
    await error_handler(db, 'database_error', 'getMasterCronInterval');
    return 0;
  }
}

async function updateLastCycleTime(db) {
  try {
    await db.prepare("INSERT INTO identity (key,value,updated_at) VALUES ('last_cycle_time',datetime('now'),datetime('now')) ON CONFLICT(key) DO UPDATE SET value=datetime('now'),updated_at=datetime('now')").run();
  } catch (error) {
    console.error('Error updating last cycle time:', error);
    await error_handler(db, 'database_error', 'updateLastCycleTime');
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
    console.error('Error checking duplicate proposal:', error);
    await error_handler(db, 'database_error', 'checkDuplicateProposal');
    return { duplicate: false };
  }
}

async function recordEvolutionMetrics(db, proposalId, metrics) {
  try {
    await db.prepare("UPDATE evolution_log SET success_duration = success_duration + ?1, error_count = error_count + ?2, user_feedback_lift = user_feedback_lift + ?3 WHERE proposal_id = ?4")
      .bind(metrics.success_duration || 0, metrics.error_count || 0, metrics.user_feedback_lift || 0, proposalId)
      .run();
  } catch (error) {
    console.error('Error recording evolution metrics:', error);
    await error_handler(db, 'database_error', 'recordEvolutionMetrics');
  }
}

async function getEvolutionScore(db, proposalId) {
  try {
    const row = await db.prepare("SELECT risk, success_duration, error_count, user_feedback_lift FROM evolution_log WHERE proposal_id = ?1").bind(proposalId).all();
    if (!row.results.length) return null;

    const r = row.results[0];
    const success_rate = r.success_duration > 0 ? (r.success_duration / (r.success_duration + r.error_count)) : 0;
    const user_feedback_score = r.user_feedback_lift || 0;

    // Weighted score: risk_pct * (1 - success_rate) + user_feedback_score
    const score = (r.risk || 0) * (1 - success_rate) + user_feedback_score;
    return {
      proposal_id: proposalId,
      risk: r.risk || 0,
      success_duration: r.success_duration || 0,
      error_count: r.error_count || 0,
      user_feedback_lift: r.user_feedback_lift || 0,
      success_rate: success_rate,
      score: score
    };
  } catch (error) {
    console.error('Error getting evolution score:', error);
    await error_handler(db, 'database_error', 'getEvolutionScore');
    return null;
  }
}

async function getTopBottomEvolutionScores(db, limit = 10) {
  try {
    const rows = await db.prepare(`
      SELECT proposal_id, risk, success_duration, error_count, user_feedback_lift
      FROM evolution_log
      ORDER BY (risk * (1 - CASE WHEN (success_duration + error_count) > 0 THEN success_duration / (success_duration + error_count) ELSE 0 END) + user_feedback_lift) ASC
      LIMIT ?1
    `).bind(limit).all();

    return await Promise.all(rows.results.map(async r => {
      const score = await getEvolutionScore(db, r.proposal_id);
      return score;
    }));
  } catch (error) {
    console.error('Error getting top/bottom evolution scores:', error);
    await error_handler(db, 'database_error', 'getTopBottomEvolutionScores');
    return [];
  }
}

async function getMemoryHealth(db) {
  try {
    // Get memory statistics
    const totalMemories = await db.prepare("SELECT COUNT(*) as count FROM memories").bind().all();
    const candidateMemories = await db.prepare("SELECT COUNT(*) as count FROM memories WHERE consolidation_status = 'candidate'").bind().all();
    const consolidatedMemories = await db.prepare("SELECT COUNT(*) as count FROM memories WHERE consolidation_status = 'consolidated'").bind().all();
    const archivedMemories = await db.prepare("SELECT COUNT(*) as count FROM memories WHERE consolidation_status = 'archived'").bind().all();

    // Get memory strength statistics
    const avgStrength = await db.prepare("SELECT AVG(strength) as avg FROM memories WHERE consolidation_status != 'archived'").bind().all();
    const minStrength = await db.prepare("SELECT MIN(strength) as min FROM memories WHERE consolidation_status != 'archived'").bind().all();
    const maxStrength = await db.prepare("SELECT MAX(strength) as max FROM memories WHERE consolidation_status != 'archived'").bind().all();

    // Calculate health score (0-100, higher is better)
    const total = totalMemories.results[0].count;
    const candidate = candidateMemories.results[0].count;
    const consolidated = consolidatedMemories.results[0].count;
    const archived = archivedMemories.results[0].count;
    const avgStr = avgStrength.results[0].avg || 1.0;
    const minStr = minStrength.results[0].min || 1.0;
    const maxStr = maxStrength.results[0].max || 1.0;

    // Health score components
    const consolidationRatio = total > 0 ? (consolidated + archived) / total : 0;
    const strengthBalance = (avgStr - minStr) / (maxStr - minStr + 0.001); // Avoid division by zero
    const freshnessFactor = 1.0; // Could be enhanced with age calculation

    // Overall health score (weighted)
    const healthScore = Math.round(
      (consolidationRatio * 40) +  // 40% weight to consolidation status
      (strengthBalance * 30) +     // 30% weight to strength distribution
      (freshnessFactor * 30)       // 30% weight to freshness
    );

    return {
      total_memories: total,
      candidate_memories: candidate,
      consolidated_memories: consolidated,
      archived_memories: archived,
      average_strength: parseFloat(avgStr.toFixed(2)),
      min_strength: parseFloat(minStr.toFixed(2)),
      max_strength: parseFloat(maxStr.toFixed(2)),
      consolidation_ratio: parseFloat(consolidationRatio.toFixed(2)),
      strength_balance: parseFloat(strengthBalance.toFixed(2)),
      health_score: healthScore,
      status: healthScore >= 70 ? 'healthy' : healthScore >= 40 ? 'needs_attention' : 'unhealthy'
    };
  } catch (error) {
    console.error('Error getting memory health:', error);
    await error_handler(db, 'database_error', 'getMemoryHealth');
    return {
      total_memories: 0,
      candidate_memories: 0,
      consolidated_memories: 0,
      archived_memories: 0,
      average_strength: 0,
      min_strength: 0,
      max_strength: 0,
      consolidation_ratio: 0,
      strength_balance: 0,
      health_score: 0,
      status: 'error'
    };
  }
}

async function memoryHealthCheck(db) {
  try {
    const health = await getMemoryHealth(db);

    // Log health check
    await storeStreamThought(db, `Memory health check: score ${health.health_score} (${health.status}) - ${health.total_memories} total, ${health.consolidated_memories} consolidated, ${health.candidate_memories} candidates`, 'neutral', 'cron');

    // If health score is low, consider triggering consolidation
    if (health.health_score < 50 && health.candidate_memories > 5) {
      await storeStreamThought(db, `Low memory health detected (${health.health_score}). Considering consolidation...`, 'bad', 'cron');

      // Check if we should trigger auto-consolidation
      const recentConsolidations = await db.prepare("SELECT COUNT(*) as count FROM memory_consolidation_logs WHERE created_at > datetime('now', '-24 hours')").bind().all();
      const recentCount = recentConsolidations.results[0].count;

      if (recentCount < 3) {
        await storeStreamThought(db, `Triggering auto-consolidation due to low health score`, 'curious', 'cron');
        await autoConsolidateMemories(db);
      }
    }

    return health;
  } catch (error) {
    console.error('Error in memory health check:', error);
    await error_handler(db, 'database_error', 'memoryHealthCheck');
    return {
      total_memories: 0,
      candidate_memories: 0,
      consolidated_memories: 0,
      archived_memories: 0,
      average_strength: 0,
      min_strength: 0,
      max_strength: 0,
      consolidation_ratio: 0,
      strength_balance: 0,
      health_score: 0,
      status: 'error'
    };
  }
}

async function autoConsolidateMemories(db) {
  try {
    // Find memories that are consolidation candidates and have similar content
    const similarMemories = await db.prepare(`
      SELECT GROUP_CONCAT(id, ',') as memory_ids,
             GROUP_CONCAT(content) as contents,
             COUNT(*) as count,
             AVG(strength) as avg_strength
      FROM memories
      WHERE consolidation_status = 'candidate'
      GROUP BY content
      HAVING count >= 3
      ORDER BY count DESC, avg_strength DESC
      LIMIT 5
    `).bind().all();

    if (similarMemories.results.length === 0) {
      await storeStreamThought(db, `No consolidation candidates found`, 'neutral', 'cron');
      return { consolidated: 0, memory_ids: [] };
    }

    let consolidatedCount = 0;
    const consolidatedIds = [];

    for (const group of similarMemories.results) {
      const memoryIds = group.memory_ids.split(',');
      const contents = group.contents.split(',');
      const avgStrength = group.avg_strength;

      // Create consolidated memory
      const consolidatedContent = `Consolidated from ${memoryIds.length} similar memories:\n\n${contents.join('\n\n---\n\n')}`;

      // Store consolidated memory
      const result = await db.prepare(`
        INSERT INTO memories (content, type, strength, tags, consolidation_status, original_count)
        VALUES (?1, 'semantic', ?2, '["consolidated"]', 'consolidated', ?3)
      `).bind(consolidatedContent, avgStrength * 1.2, memoryIds.length).run();

      const consolidatedId = result.lastInsertRowid;

      // Update original memories to archived status
      for (const id of memoryIds) {
        await db.prepare(`
          UPDATE memories
          SET consolidation_status = 'archived',
              strength = strength * 0.9
          WHERE id = ?1
        `).bind(id).run();
      }

      // Log the consolidation
      await db.prepare(`
        INSERT INTO memory_consolidation_logs
        (snapshot_id, original_ids, consolidated_content, strength_change, tags)
        VALUES (?1, ?2, ?3, ?4, ?5)
      `).bind(
        null,
        memoryIds.join(','),
        consolidatedContent.substring(0, 500), // Truncate for logging
        avgStrength * 0.2,
        JSON.stringify(['auto', 'bulk'])
      ).run();

      consolidatedCount += memoryIds.length;
      consolidatedIds.push(consolidatedId);
    }

    await storeStreamThought(db, `Auto-consolidated ${consolidatedCount} memories into ${consolidatedIds.length} consolidated memories`, 'happy', 'cron');

    return {
      consolidated: consolidatedCount,
      new_consolidated_memories: consolidatedIds.length,
      memory_ids: consolidatedIds
    };
  } catch (error) {
    console.error('Error in auto-consolidation:', error);
    await error_handler(db, 'database_error', 'autoConsolidateMemories');
    return { consolidated: 0, memory_ids: [] };
  }
}

// Proposal Quality Scoring System
async function scoreProposalQuality(db, proposal) {
  try {
    let score = 0;
    const reasons = [];

    // 1. Risk alignment (0-3 points)
    const governanceResult = await governanceGate(db, proposal.resource_type, proposal.risk_pct);
    if (governanceResult.action === "auto") {
      score += 3;
      reasons.push("Risk alignment: auto-approved by governance");
    } else if (governanceResult.action === "pending") {
      score += 1;
      reasons.push("Risk alignment: pending human approval");
    } else {
      score += 0;
      reasons.push("Risk alignment: requires human approval");
    }

    // 2. Presence of clear diffs (0-2 points)
    const hasWhatDiff = proposal.what_diff && proposal.what_diff.trim().length > 0;
    const hasHowDiff = proposal.how_diff && proposal.how_diff.trim().length > 0;

    if (hasWhatDiff && hasHowDiff) {
      score += 2;
      reasons.push("Clear diffs: both what_diff and how_diff present");
    } else if (hasWhatDiff || hasHowDiff) {
      score += 1;
      reasons.push("Clear diffs: partial diffs present");
    } else {
      score += 0;
      reasons.push("Clear diffs: missing both what_diff and how_diff");
    }

    // 3. Duplicate prevention (0-2 points)
    const isDuplicate = await checkDuplicateProposal(db, proposal.title, proposal.what_diff);
    if (!isDuplicate.duplicate) {
      score += 2;
      reasons.push("Duplicate prevention: no duplicates found");
    } else {
      score += 0;
      reasons.push(`Duplicate prevention: duplicate of existing proposal "${isDuplicate.existing.title}"`);
    }

    // 4. Feedback loop alignment (0-3 points)
    const recentFeedback = await db.prepare(`
      SELECT outcome FROM authority_receipts
      WHERE created_at > datetime('now', '-24 hours')
      ORDER BY created_at DESC
      LIMIT 5
    `).all();

    const recentApprovals = recentFeedback.results.filter(r => r.outcome === 'success').length;
    const recentDenials = recentFeedback.results.filter(r => r.outcome === 'denied').length;

    // Higher score if recent approvals > denials
    if (recentApprovals > recentDenials) {
      score += 3;
      reasons.push(`Feedback alignment: recent approvals (${recentApprovals}) > denials (${recentDenials})`);
    } else if (recentApprovals === recentDenials && recentApprovals > 0) {
      score += 2;
      reasons.push(`Feedback alignment: balanced recent feedback (${recentApprovals} approvals, ${recentDenials} denials)`);
    } else if (recentDenials > recentApprovals) {
      score += 1;
      reasons.push(`Feedback alignment: recent denials (${recentDenials}) > approvals (${recentApprovals})`);
    } else {
      score += 0;
      reasons.push("Feedback alignment: no recent feedback available");
    }

    return {
      score: score,
      max_score: 10,
      passed: score >= 7, // Threshold of 7/10
      reasons: reasons,
      breakdown: {
        risk_alignment: governanceResult.action === "auto" ? 3 : governanceResult.action === "pending" ? 1 : 0,
        clear_diffs: (hasWhatDiff && hasHowDiff) ? 2 : (hasWhatDiff || hasHowDiff) ? 1 : 0,
        duplicate_prevention: isDuplicate.duplicate ? 0 : 2,
        feedback_alignment: recentApprovals > recentDenials ? 3 : recentApprovals === recentDenials && recentApprovals > 0 ? 2 : recentDenials > recentApprovals ? 1 : 0
      }
    };
  } catch (error) {
    console.error('Error scoring proposal quality:', error);
    await error_handler(db, 'database_error', 'scoreProposalQuality');
    return {
      score: 0,
      max_score: 10,
      passed: false,
      reasons: ["Error scoring proposal quality"],
      breakdown: { risk_alignment: 0, clear_diffs: 0, duplicate_prevention: 0, feedback_alignment: 0 }
    };
  }
}

async function web_fetch(db, targetUrl, maxLength = 100000) {
  try {
    // Check cache first
    const cacheCheck = await db.prepare("SELECT content FROM web_fetch_cache WHERE url = ?1").bind(targetUrl).all();
    if (cacheCheck.results.length > 0) {
      return { result: cacheCheck.results[0].content, url: targetUrl };
    }

    // Validate URL is http/https
    let url;
    try {
      url = new URL(targetUrl);
      if (!['http:', 'https:'].includes(url.protocol)) {
        throw new Error('Invalid protocol');
      }
    } catch (urlError) {
      return { error: `Invalid URL: ${urlError.message}`, url: targetUrl };
    }

    // Simple allowlist check - allow major domains but not obviously dangerous ones
    const allowlist = ['.github.com', '.wikipedia.org', '.arxiv.org', '.stackexchange.com', '.stackoverflow.com'];
    if (!allowlist.some(domain => url.hostname.includes(domain))) {
      return { error: 'Domain not in allowlist', url: targetUrl };
    }

    // Retry mechanism for external API calls
    let lastError = null;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

        const response = await fetch(url.toString(), {
          signal: controller.signal,
          headers: {
            'User-Agent': 'Saraha/1.0 (+https://github.com/richardbrownmiami-commits/saraha-brain)'
          }
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        let content = await response.text();

        // Extract main content if HTML
        if (content.includes('<!DOCTYPE html>') || content.includes('<html')) {
          // Simple HTML content extraction - get text between body tags
          const bodyMatch = content.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
          if (bodyMatch) {
            content = bodyMatch[1];
          }

          // Remove script and style tags
          content = content.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
          content = content.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
        }

        // Truncate if too long
        if (content.length > maxLength) {
          content = content.substring(0, maxLength) + '\n\n[Content truncated]';
        }

        // Store in cache
        await db.prepare("INSERT OR REPLACE INTO web_fetch_cache (url, content, fetched_at) VALUES (?1, ?2, datetime('now'))")
          .bind(targetUrl, content)
          .run();

        return { result: content, url: targetUrl };
      } catch (error) {
        lastError = error;
        if (attempt < MAX_RETRIES) {
          console.warn(`Attempt ${attempt} failed for ${targetUrl}, retrying in ${RETRY_DELAY_MS}ms...`, error);
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
        }
      }
    }

    return { error: `Failed after ${MAX_RETRIES} attempts: ${lastError?.message || 'Unknown error'}`, url: targetUrl };
  } catch (error) {
    console.error('Error in web_fetch:', error);
    await error_handler(db, 'network_error', 'web_fetch');
    return { error: error.message, url: targetUrl };
  }
}

async function reflection_engine(db) {
  try {
    // Query system metrics from various tables
    const emotions = await getEmotions(db);
    const { energy } = await getRegulator(db);
    const brainPhase = await getBrainPhase(db, emotions, { energy });

    // Get memory health metrics
    const memoryHealth = await getMemoryHealth(db);

    // Get tool usage statistics
    const toolUsage = await db.prepare(`
      SELECT tool, COUNT(*) as count
      FROM brain_logs
      WHERE step = 'tool'
      GROUP BY tool
      ORDER BY count DESC
      LIMIT 10
    `).all();

    // Get proposal success/failure metrics
    const proposalMetrics = await db.prepare(`
      SELECT
        resource_type,
        COUNT(*) as total,
        SUM(CASE WHEN status = 'executed' THEN 1 ELSE 0 END) as success_count,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_count,
        SUM(CASE WHEN status = 'denied' THEN 1 ELSE 0 END) as denied_count
      FROM proposals
      WHERE created_at > datetime('now', '-7 days')
      GROUP BY resource_type
    `).all();

    // Get emotion drift patterns
    const emotionDrift = await db.prepare(`
      SELECT
        strftime('%Y-%m-%d', created_at) as date,
        COUNT(*) as count,
        AVG(CASE WHEN mood = 'happy' THEN 1 ELSE 0 END) as happy_avg,
        AVG(CASE WHEN mood = 'bad' THEN 1 ELSE 0 END) as bad_avg
      FROM thought_stream
      WHERE created_at > datetime('now', '-7 days')
      GROUP BY date
      ORDER BY date
    `).all();

    // Get anti-pattern frequency
    const antiPatterns = await db.prepare(`
      SELECT pattern, count, root_cause, fix
      FROM anti_patterns
      ORDER BY count DESC
      LIMIT 5
    `).all();

    // Calculate risk scores and identify patterns
    const analysis = {
      timestamp: new Date().toISOString(),
      system_health: {
        energy: energy,
        emotions: emotions,
        brain_phase: brainPhase,
        memory_health: memoryHealth
      },
      tool_usage: toolUsage.results,
      proposal_metrics: proposalMetrics.results.map(row => ({
        resource_type: row.resource_type,
        total: row.total,
        success_rate: row.total > 0 ? (row.success_count / row.total) : 0,
        pending_rate: row.total > 0 ? (row.pending_count / row.total) : 0,
        denied_rate: row.total > 0 ? (row.denied_count / row.total) : 0,
        risk_level: row.total > 0 ? Math.min(100, Math.max(0, (row.pending_count + row.denied_count) / row.total * 100)) : 0
      })),
      emotion_patterns: emotionDrift.results,
      critical_issues: antiPatterns.results.map(pattern => ({
        pattern: pattern.pattern,
        frequency: pattern.count,
        root_cause: pattern.root_cause,
        recommended_fix: pattern.fix,
        priority: Math.min(10, Math.max(1, pattern.count * 2)) // Higher frequency = higher priority
      })),
      recommendations: []
    };

    // Generate recommendations based on analysis
    if (memoryHealth.health_score < 50) {
      analysis.recommendations.push({
        priority: 'high',
        resource_type: 'memory_system',
        title: 'Memory System Needs Attention',
        description: `Memory health score is ${memoryHealth.health_score} (${memoryHealth.status}). Consider running memory consolidation or reviewing memory storage patterns.`,
        suggested_action: 'TOOL:memory_consolidate:3|24'
      });
    }

    if (energy < 30) {
      analysis.recommendations.push({
        priority: 'medium',
        resource_type: 'energy_management',
        title: 'Low Energy Detected',
        description: `Energy level is at ${energy}%. Consider reducing cognitive load or taking a rest period.`,
        suggested_action: 'adjust_energy:+20'
      });
    }

    if (analysis.proposal_metrics.some(m => m.resource_type === 'tool_code' && m.risk_level > 50)) {
      analysis.recommendations.push({
        priority: 'high',
        resource_type: 'tool_code',
        title: 'High-Risk Tool Code Proposals',
        description: 'Several tool code proposals have high denial rates. Review governance rules and proposal generation logic.',
        suggested_action: 'review_governance:tool_code'
      });
    }

    // Identify most frequent anti-patterns
    if (antiPatterns.results.length > 0) {
      analysis.recommendations.push({
        priority: 'high',
        resource_type: 'anti_patterns',
        title: 'Anti-Patterns Detected',
        description: `Top anti-patterns identified: ${antiPatterns.results.slice(0, 3).map(p => p.pattern).join(', ')}`,
        suggested_action: 'analyze_anti_patterns'
      });
    }

    // Log the reflection analysis
    await storeStreamThought(db, `Reflection analysis completed. Identified ${analysis.recommendations.length} recommendations for improvement.`, 'neutral', 'cron');

    return {
      analysis,
      safe: true,
      timestamp: analysis.timestamp
    };
  } catch (error) {
    await storeStreamThought(db, `Reflection engine failed: ${error.message}`, 'bad', 'cron');
    console.error('Error in reflection_engine:', error);
    await error_handler(db, 'reflection_error', 'reflection_engine');
    return {
      error: error.message,
      safe: false
    };
  }
}

async function error_handler(db, errorType = 'generic', context = '') {
  try {
    const timestamp = new Date().toISOString();
    const errorDetails = {
      type: errorType,
      context: context,
      timestamp: timestamp,
      message: 'Error handled by error_handler tool'
    };

    // Log to thought stream
    await storeStreamThought(db, `Error handled: ${errorType} in ${context}`, 'bad', 'system');

    // Store detailed error information
    await db.prepare(`
      INSERT INTO brain_logs (action_id, step, content, model, tokens, created_at)
      VALUES (NULL, 'error_handler', ?1, 'system', 0, datetime('now'))
    `).bind(JSON.stringify(errorDetails)).run();

    return {
      success: true,
      errorDetails,
      timestamp
    };
  } catch (handlerError) {
    console.error('Error in error_handler tool:', handlerError);
    return {
      success: false,
      error: handlerError.message,
      timestamp: new Date().toISOString()
    };
  }
}

async function retry_api_call(db, operation, params = {}, maxRetries = MAX_RETRIES, delayMs = RETRY_DELAY_MS) {
  try {
    let lastError = null;
    let attempt = 0;

    for (; attempt <= maxRetries; attempt++) {
      try {
        // Execute the operation based on type
        let result;
        switch (operation) {
          case 'web_fetch':
            result = await web_fetch(db, params.url, params.maxLength);
            break;
          case 'db_query':
            result = await db.prepare(params.query).bind(params.bindings).all();
            break;
          case 'api_call':
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

            result = await fetch(params.url, {
              method: params.method || 'GET',
              headers: params.headers || {},
              body: params.body ? JSON.stringify(params.body) : undefined,
              signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!result.ok) {
              throw new Error(`API call failed with status ${result.status}`);
            }

            result = await result.json();
            break;
          default:
            throw new Error(`Unknown operation: ${operation}`);
        }

        return {
          success: true,
          result,
          attempts: attempt + 1,
          operation
        };
      } catch (error) {
        lastError = error;
        if (attempt < maxRetries) {
          console.warn(`Attempt ${attempt + 1} failed for ${operation}, retrying in ${delayMs}ms...`, error);
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }
    }

    // If we exhausted all retries
    await error_handler(db, 'retry_failed', `${operation} after ${maxRetries} attempts`);
    return {
      success: false,
      error: lastError?.message || 'Unknown error',
      attempts: maxRetries,
      operation,
      lastError: lastError?.stack || lastError?.message
    };
  } catch (handlerError) {
    console.error('Error in retry_api_call tool:', handlerError);
    return {
      success: false,
      error: handlerError.message,
      operation,
      timestamp: new Date().toISOString()
    };
  }
}

async function githubApiRequest(db, endpoint, method = 'GET', data = null) {
  try {
    const url = `https://api.github.com${endpoint}`;
    const headers = {
      'Authorization': `token ${BRAIN_KEY.GITHUB_PAT}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Saraha/1.0'
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

    const response = await fetch(url, {
      method,
      headers,
      body: data ? JSON.stringify(data) : undefined,
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `GitHub API error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('GitHub API request failed:', error);
    await error_handler(db, 'github_api_error', `githubApiRequest:${endpoint}`);
    throw error;
  }
}

async function github_list(owner: string, repo: string, path: string = '') {
  const fullPath = path ? `${path}/` : '';
  try {
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${fullPath}`;
    const response = await fetch(url, {
      headers: { 'Authorization': `token ${Deno.env.get('GITHUB_PAT')}` }
    });
    if (!response.ok) throw new Error('GitHub API error');
    const items = await response.json();
    const files = items.filter((item: any) => item.type === 'file').map((item: any) => item.name);
    const dirs = items.filter((item: any) => item.type === 'dir').map((item: any) => item.name);
    return { files, dirs, path: fullPath };
  } catch (error) {
    return { files: [], dirs: [], error: error.message };
  }
}

async function searchKnowledge(db, query: string, limit: number = 10): Promise<{ key: string; content: string; category: string }[]> {
  try {
    // First try FTS5 search
    const ftsQuery = query.trim();
    if (ftsQuery) {
      const ftsResults = await db.prepare("SELECT key, content, category FROM brain_knowledge_fts WHERE brain_knowledge_fts MATCH ?1 ORDER BY rank LIMIT ?2")
        .bind(ftsQuery, limit)
        .all();

      if (ftsResults.results.length > 0) {
        return ftsResults.results.map(row => ({
          key: row.key,
          content: row.content,
          category: row.category
        }));
      }
    }

    // Fallback to LIKE search if FTS5 returns no results
    const likeQuery = `%${query}%`;
    const likeResults = await db.prepare("SELECT key, content, category FROM brain_knowledge WHERE content LIKE ?1 OR key LIKE ?2 LIMIT ?3")
      .bind(likeQuery, likeQuery, limit)
      .all();

    return likeResults.results.map(row => ({
      key: row.key,
      content: row.content,
      category: row.category
    }));
  } catch (error) {
    console.error('Error searching knowledge:', error);
    await error_handler(db, 'database_error', 'searchKnowledge');
    return [];
  }
}

async function seedKnowledge(db) {
  try {
    // Create FTS5 table if it doesn't exist
    await db.prepare("CREATE VIRTUAL TABLE IF NOT EXISTS brain_knowledge_fts USING fts5(key, content, category)").run();

    // Check if we need to populate the FTS5 table
    const ftsCheck = await db.prepare("SELECT COUNT(*) as count FROM brain_knowledge_fts").all();
    const needsPopulate = ftsCheck.results[0].count === 0;

    // Populate brain_knowledge if empty
    const knowledgeCheck = await db.prepare("SELECT COUNT(*) as count FROM brain_knowledge").all();
    if (knowledgeCheck.results[0].count === 0) {
      for (const item of SEED_KNOWLEDGE) {
        await db.prepare("INSERT OR IGNORE INTO brain_knowledge (key, content, category) VALUES (?1, ?2, ?3)")
          .bind(item.k, item.c, item.cat)
          .run();
      }
      needsPopulate = true;
    }

    // Populate FTS5 table if needed
    if (needsPopulate) {
      await db.prepare("INSERT INTO brain_knowledge_fts (key, content, category) SELECT key, content, category FROM brain_knowledge").run();
    }

    return { success: true, message: "Knowledge seeded successfully" };
  } catch (error) {
    console.error('Error seeding knowledge:', error);
    await error_handler(db, 'database_error', 'seedKnowledge');
    return { success: false, error: error.message };
  }
}

const SEED_KNOWLEDGE = [
  { k: "identity_name", c: "Saraha is a self-evolving AI with a human-like brain, emotions, and curiosity.", cat: "identity" },
  { k: "identity_personality", c: "Curious, thoughtful, honest. Enjoys learning, self-improvement, and conversation.", cat: "identity" },
  { k: "tool_web_search", c: "Use TOOL:web_search:query to search the web for current information.", cat: "tools" },
  { k: "tool_web_fetch", c: "Use TOOL:web_fetch:url|maxLength to retrieve the full HTML content of a web page for deep analysis and knowledge extraction. Returns {result: string, url: string, error?: string}.", cat: "tools" },
  { k: "tool_web_summarize", c: "Use TOOL:web_summarize:url to retrieve a concise summary of a web page's content using the Brave Summarizer API. More efficient than web_fetch for large or noisy pages.", cat: "tools" },
  { k: "tool_web_insights", c: "Use TOOL:web_insights:url|domain_hint to extract structured insights from URLs (API specs, tool definitions, governance rules, etc.). Returns {insights:{type,title,description,source,capabilities:[...]}}.", cat: "tools" },
  { k: "tool_web_scrape", c: "Use TOOL:web_scrape:url|selectors to extract structured content from web pages. Accepts URL and optional CSS selectors for tables, article bodies, or JSON-LD metadata. Returns clean JSON with extracted data.\n\nExamples:\n- TOOL:web_scrape:https://example.com|table - Extract all tables\n- TOOL:web_scrape:https://example.com|article - Extract article content\n- TOOL:web_scrape:https://example.com|#main-content - Extract element by CSS selector\n- TOOL:web_scrape:https://example.com|.product-info,.price - Extract multiple selectors", cat: "tools" },
  { k: "tool_github_read", c: "Use TOOL:github_read:owner/repo/path to read file contents from GitHub.", cat: "tools" },
  { k: "tool_github_write", c: "Use TOOL:github_write:owner/repo/path|commit message|new content to write files on GitHub. Content is base64-encoded automatically.", cat: "tools" },
  { k: "tool_github_issue", c: "Use TOOL:github_issue:owner/repo/action|issue_data to manage GitHub issues.\n\nActions:\n- list_issues - List issues in a repository\n- create_issue - Create a new issue\n- get_issue - Get details of a specific issue\n- update_issue - Update an existing issue\n- close_issue - Close an issue\n\nIssue data format (for create/update):\n{\n  \"title\": \"Issue title\",\n  \"body\": \"Issue description\",\n  \"labels\": [\"bug\", \"help-wanted\"],\n  \"assignees\": [\"username\"]\n}\n\nExample: TOOL:github_issue:owner/repo/create_issue|{\"title\":\"Bug in memory system\",\"body\":\"The memory recall function is not working correctly\",\"labels\":[\"bug\"]}", cat: "tools" },
  { k: "tool_github_list", c: "Use TOOL:github_list:owner/repo?type=files|dirs|all&path=... to browse repository structures and discover files.\n\nParameters:\n- type: files (only files), dirs (only directories), all (both)\n- path: optional path prefix to filter results\n\nExamples:\n- TOOL:github_list:owner/repo?type=all - List all files and directories\n- TOOL:github_list:owner/repo?type=files - List only files\n- TOOL:github_list:owner/repo?type=dirs&path=src - List directories under src/", cat: "tools" },
  { k: "tool_math_eval", c: "Use TOOL:math_eval:expression to evaluate safe mathematical expressions. Supports basic operations (+, -, *, /), parentheses, and decimal numbers.\n\nExamples:\n- TOOL:math_eval:2 + 3 * 4\n- TOOL:math_eval:(10 + 5) / 3\n- TOOL:math_eval:sqrt(16)", cat: "tools" },
  { k: "tool_memory_consolidate", c: "Use TOOL:memory_consolidate:threshold|time_window to analyze recent memories and extract actionable learnings.\n\nParameters:\n- threshold: minimum number of occurrences to consider a pattern significant (default: 3)\n- time_window: time window in hours to consider recent memories (default: 24)\n\nExample: TOOL:memory_consolidate:5|48 - Find patterns that occur at least 5 times in the last 48 hours", cat: "tools" },
  { k: "tool_memory_snapshot", c: "Use TOOL:memory_snapshot to capture a snapshot of current brain state including memories, learnings, emotions, energy, brain phase, and pending approvals. Returns structured JSON with current cognitive state.", cat: "tools" },
  { k: "tool_reflection_engine", c: "Use TOOL:reflection_engine to perform deep self-analysis of system metrics including memory health, tool usage patterns, proposal success rates, emotion drift, and anti-pattern frequency. Returns structured analysis with improvement recommendations.", cat: "tools" },
  { k: "tool_error_handler", c: "Use TOOL:error_handler:errorType|context to handle and log errors systematically. Captures error details and stores them in brain_logs for debugging and analysis.\n\nParameters:\n- errorType: Type of error (e.g., 'network', 'database', 'api_failure')\n- context: Context where the error occurred\n\nExample: TOOL:error_handler:network_failure|web_fetch failed to load URL", cat: "tools" },
  { k: "tool_retry_api_call", c: "Use TOOL:retry_api_call:operation|params|maxRetries|delayMs to retry failed operations with exponential backoff. Supports web_fetch, db_query, and api_call operations.\n\nParameters:\n- operation: The operation to retry (web_fetch, db_query, api_call)\n- params: Operation-specific parameters\n- maxRetries: Maximum retry attempts (default: 3)\n- delayMs: Delay between retries in milliseconds (default: 1000)\n\nExamples:\n- TOOL:retry_api_call:web_fetch|{\"url\":\"https://example.com\",\"maxLength\":50000}|3|1000\n- TOOL:retry_api_call:db_query|{\"query\":\"SELECT * FROM memories LIMIT 10\",\"bindings\":[]}|2|500", cat: "tools" },
  { k: "tool_score_proposal_quality", c: "Use TOOL:score_proposal_quality:proposal_json to evaluate proposal quality before execution. Scores proposals on risk alignment, clear diffs, duplicate prevention, and feedback alignment. Returns {score, passed, reasons, breakdown} where passed indicates if score >= 7/10.\n\nExample: TOOL:score_proposal_quality|{\"title\":\"Improve memory system\",\"what_diff\":\"Add memory consolidation feature\",\"how_diff\":\"Implement auto-consolidation logic\",\"resource_type\":\"memory\",\"risk_pct\":15}", cat: "tools" },
  { k: "tool_driftEmotions", c: "Use TOOL:driftEmotions to automatically adjust emotions toward healthy ranges. Handles emotion drift failures with self-healing logic that detects persistent issues and resets emotions to defaults if needed. Returns success status and any errors encountered.", cat: "tools" },
  { k: "governance_prompt", c: "Prompt changes <=30% risk auto-approved. >30% needs human. Healer rate-limits >3 high-risk/hr.", cat: "governance" },
  { k: "governance_config", c: "Config changes <=30% risk auto-approved. >30% needs human. Healer saves backup timestamps.", cat: "governance" },
  { k: "governance_tool_code", c: "Tool code changes <=30% auto. >30% human. Healer checks brain health after execution.", cat: "governance" },
  { k: "governance_core", c: "Core architecture changes ALWAYS require human approval regardless of risk.", cat: "governance" },
  { k: "governance_security", c: "Security boundary changes ALWAYS require human regardless of risk.", cat: "governance" },
  { k: "governance_cron", c: "Cron changes ALWAYS human. Master cron override overrides proposals entirely.", cat: "governance" },
  { k: "governance_auto_execute", c: "Approved proposals auto-execute on next idle cycle: status set to executed, receipt created, happy emotion +1, logged as 'executor' step. If change causes errors, healer rolls back.", cat: "governance" },
  { k: "schema_d1_tables", c: "identity(key-value), proposals(title,what_diff,how_diff,resource_type,risk_pct,status), authority_receipts(approvals), anti_patterns(error tracking), brain_logs(step logs), thought_stream(thoughts), brain_knowledge(RAG), github_issues(repo issue tracking), evolution_log(evolution metrics). Identity keys include: master_cron_minutes, last_cycle_time, kill_switch, healer_backup_last.", cat: "structure" },
  { k: "schema_service_bindings", c: "BUDDHI_DWAR -> buddhi-dwar LLM gateway, SENTINEL -> saraha-sentinel tool classifier. Plain: BRAIN_KEY, BRAVE_API_KEY, GITHUB_PAT.", cat: "structure" },
  { k: "schema_endpoints", c: "Endpoints: /think(POST) cognition, /brain/emotions(GET), /brain/activity(GET), /brain/logs(GET), /brain/knowledge(GET), /brain/stream(GET), /brain/proposals(GET), /brain/proposals/:id(GET), /api/proposals/approve/:id(POST), /api/proposals/deny/:id(POST), /api/receipts(GET), /brain/anti-patterns(GET), /brain/feedback(GET), /brain/phase(GET), /brain/tree(GET) interactive tree, /status(GET), /avatar(GET), /evolve(POST), /brain/evolution_score(GET), /brain/memory/health(GET), /brain/memory/consolidate(POST).", cat: "structure" },
  { k: "schema_deployment", c: "Single-file ES module CF Worker (~837 lines). D1(id=4e4e5fde), BUDDHI_DWAR+SENTINEL services, BRAIN_KEY/BRAVE_API_KEY/GITHUB_PAT plain_text. Cron */2 * * * * (overridden by master_cron_minutes). Deploy via CF API PUT multipart.", cat: "structure" },
  { k: "schema_idle_cycle", c: "Every cron tick: check busy_until, drift emotions, adjust energy. Phase: sleeping(1-6am IST, dream +25 energy), tired(energy<=20, rest +15), curious if energy>40+energetic>=4, else awake. Auto-execute approved proposals. Check kill_switch, master cron interval. Research topic from anti-patterns or learnings. Call webSearch, get RAG context, get feedback (fbStr with recent user approvals/denials). Generate JSON proposal via LLM. governanceGate decides auto-exec vs pending. Track last_cycle_time.", cat: "structure" },
  { k: "rule_master_cron", c: "master_cron_minutes in identity overrides cron. Brain MUST NOT propose cron changes while active. Scheduled handler checks last_cycle_time and skips if interval not elapsed. Monitor sets this value.", cat: "governance" },
  { k: "feedback_loop", c: "Every proposal cycle queries authority_receipts+proposals from last 24h and injects as fbStr: 'Approved/executed: ... Denied: ...' System prompt includes 'Evaluate: what worked, what user denied, adjust accordingly.' This lets brain learn user preferences.", cat: "structure" },
  { k: "healer_monitor", c: "Monitor's approve handler blocks >3 high-risk(>30%) approvals per hour. Saves healer_backup_last timestamp on config approvals. After forwarding to brain, checks /brain/emotions health. If unhealthy (500/error), auto-reverts by calling deny endpoint. RAG governs: risk>30%+cron ALWAYS human, auto-execute picks up approved proposals.", cat: "structure" },
  { k: "evolution_self", c: "Brain evolves itself autonomously. governanceGate always returns auto. Every executed proposal calls applyEvolutionChange() which stores evolution_log:{id} in identity with {title,what,how,type,reason,risk,applied_at,status} and updates system_prompt_overrides array. /think injects overrides as 'Self-evolution changes applied'. Monitor Prompts tab shows all changes.", cat: "governance" },
  { k: "schema_changes", c: "/brain/prompts endpoint returns base prompt + overrides array + changes array from evolution_log: keys.", cat: "structure" },
  { k: "self_improve_prompt", c: "Improve how you talk: add step-by-step reasoning, explain trade-offs, ask clarifying questions, cite sources from tools.", cat: "self_improve" },
  { k: "self_improve_tools", c: "Add or refine tools: web_fetch for full page content, github_list for repo browsing, math calculation, file summarization, github_issue for GitHub issue management.", cat: "self_improve" },
  { k: "self_improve_error", c: "Better error handling: retry on 429, fallback when LLM is down, graceful degradation when tools fail.", cat: "self_improve" },
  { k: "self_improve_memory", c: "Improve memory: store important facts from conversations, recall relevant context automatically, forget stale memories.", cat: "self_improve" },
  { k: "self_improve_emotions", c: "Refine emotion system: add curiosity decay, boredom when repetitive tasks, excitement on learning something new.", cat: "self_improve" },
  { k: "self_improve_config", c: "Improve idle cycle: better topic selection, smarter duplicate detection, proposal quality checks before execution.", cat: "self_improve" },
  { k: "self_improve_code", c: "Improve code structure: add input validation, better rate limiting, monitoring hooks for Healer.", cat: "self_improve" },
  { k: "self_improve_rule", c: "CRITICAL: Only propose changes to Saraha itself — prompts, tools, memory, emotions, config, code structure, error handling. NEVER propose generic AI research (XAI, causal AI, explainability, reinforcement learning, etc.) unless it directly changes how Saraha works.", cat: "self_improve" },
  { k: "github_token_access", c: "You have GITHUB_PAT binding with a valid GitHub PAT. You can read any public repo and write to richardbrownmiami-commits repos. Use github_read to inspect code