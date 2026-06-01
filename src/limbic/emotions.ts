const EMOTIONS = ["energetic", "intelligent", "happy", "bad"] as const;
export type EmotionName = typeof EMOTIONS[number];

const RANGES: Record<EmotionName, [number, number]> = {
  energetic: [1, 10], intelligent: [1, 10], happy: [1, 10], bad: [0, 3],
};

const DEFAULTS: Record<EmotionName, number> = {
  energetic: 5, intelligent: 5, happy: 5, bad: 0,
};

export async function getEmotions(db: D1Database): Promise<Record<EmotionName, number>> {
  const rows = await db.prepare("SELECT key, value FROM identity WHERE key LIKE 'emotion_%'").all();
  const result = { ...DEFAULTS };
  for (const r of rows.results as any[]) {
    const key = r.key.replace("emotion_", "") as EmotionName;
    if (key in result) result[key] = Math.min(parseInt(r.value) || result[key], RANGES[key][1]);
  }
  return result;
}

export async function updateEmotion(db: D1Database, name: EmotionName, delta: number): Promise<number> {
  const emotions = await getEmotions(db);
  const [min, max] = RANGES[name];
  const newVal = Math.max(min, Math.min(max, emotions[name] + delta));
  await db.prepare("INSERT INTO identity (key, value, updated_at) VALUES (?1, ?2, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = ?2, updated_at = datetime('now')")
    .bind("emotion_" + name, newVal.toString()).run();
  return newVal;
}

export async function setEmotions(db: D1Database, vals: Partial<Record<EmotionName, number>>): Promise<void> {
  for (const [name, val] of Object.entries(vals)) {
    const eName = name as EmotionName;
    if (eName in RANGES) {
      const [min, max] = RANGES[eName];
      const clamped = Math.max(min, Math.min(max, val ?? DEFAULTS[eName]));
      await db.prepare("INSERT INTO identity (key, value, updated_at) VALUES (?1, ?2, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = ?2, updated_at = datetime('now')")
        .bind("emotion_" + eName, clamped.toString()).run();
    }
  }
}
