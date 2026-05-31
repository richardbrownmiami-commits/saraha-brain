const MOODS = ["curious", "motivated", "confident", "thoughtful", "tired", "stuck"] as const;
export type Mood = typeof MOODS[number];

export async function getMood(db: D1Database): Promise<Mood> {
  const row: any = await db.prepare(
    "SELECT value FROM identity WHERE key = 'mood'"
  ).first();
  const mood = row?.value || "curious";
  return MOODS.includes(mood) ? mood : "curious";
}

export async function setMood(db: D1Database, mood: Mood): Promise<void> {
  await db.prepare(
    "INSERT INTO identity (key, value, updated_at) VALUES ('mood', ?1, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = ?1, updated_at = datetime('now')"
  ).bind(mood).run();
}

export function nextMood(current: Mood, success: boolean, energy: number): Mood {
  if (energy < 20) return "tired";
  if (!success) return "stuck";
  if (current === "stuck" && success) return "curious";
  if (current === "tired" && energy > 50) return "curious";
  if (success && energy > 70) return "confident";
  return current;
}
