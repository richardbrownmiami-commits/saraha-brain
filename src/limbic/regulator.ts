import { getMood } from "./emotions";

export async function getEmotion(db: D1Database): Promise<string> {
  return await getMood(db);
}

export async function getRegulator(db: D1Database): Promise<{ energy: number; confidence: number }> {
  const rows = await db.prepare("SELECT key, value FROM identity WHERE key IN ('energy','confidence')").all();
  const vals: Record<string, number> = { energy: 100, confidence: 50 };
  for (const r of rows.results as any[]) vals[r.key] = parseFloat(r.value) || vals[r.key];
  return { energy: vals.energy, confidence: vals.confidence };
}

export async function adjustEnergy(db: D1Database, delta: number): Promise<void> {
  const { energy } = await getRegulator(db);
  const newVal = Math.max(0, Math.min(100, energy + delta));
  await db.prepare(
    "INSERT INTO identity (key, value, updated_at) VALUES ('energy', ?1, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = ?1, updated_at = datetime('now')"
  ).bind(newVal.toString()).run();
}

export async function adjustConfidence(db: D1Database, delta: number): Promise<void> {
  const { confidence } = await getRegulator(db);
  const newVal = Math.max(0, Math.min(100, confidence + delta));
  await db.prepare(
    "INSERT INTO identity (key, value, updated_at) VALUES ('confidence', ?1, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = ?1, updated_at = datetime('now')"
  ).bind(newVal.toString()).run();
}
