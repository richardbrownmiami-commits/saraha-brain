const EMOTIONS = ["energetic", "intelligent", "happy", "bad"];

const RANGES = { energetic: [1, 10], intelligent: [1, 10], happy: [1, 10], bad: [0, 3] };

const DEFAULTS = { energetic: 5, intelligent: 5, happy: 5, bad: 0 };

export async function getEmotions(db) {
  const rows = await db.prepare("SELECT key, value FROM identity WHERE key LIKE 'emotion_%'").all();
  const result = { ...DEFAULTS };
  for (const r of rows.results) {
    const key = r.key.replace("emotion_", "");
    if (key in result) result[key] = Math.min(parseInt(r.value) || result[key], RANGES[key][1]);
  }
  return result;
}

export async function updateEmotion(db, name, delta) {
  const emotions = await getEmotions(db);
  const [min, max] = RANGES[name];
  const newVal = Math.max(min, Math.min(max, emotions[name] + delta));
  await db.prepare("INSERT INTO identity (key, value, updated_at) VALUES (?1, ?2, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = ?2, updated_at = datetime('now')")
    .bind("emotion_" + name, newVal.toString()).run();
  return newVal;
}

export async function setEmotions(db, vals) {
  for (const [name, val] of Object.entries(vals)) {
    if (name in RANGES) {
      const [min, max] = RANGES[name];
      const clamped = Math.max(min, Math.min(max, val ?? DEFAULTS[name]));
      await db.prepare("INSERT INTO identity (key, value, updated_at) VALUES (?1, ?2, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = ?2, updated_at = datetime('now')")
        .bind("emotion_" + name, clamped.toString()).run();
    }
  }
}
