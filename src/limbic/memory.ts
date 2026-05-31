import { addMemory, recentMemories } from "../db";

export async function storeThought(db: D1Database, content: string): Promise<void> {
  await addMemory(db, content, "semantic");
}

export async function storeExperience(db: D1Database, content: string): Promise<void> {
  await addMemory(db, content, "episodic", ["experience"]);
}

export async function recall(db: D1Database, limit = 10): Promise<string> {
  const mems = await recentMemories(db, limit);
  if (!mems.length) return "No memories yet.";
  return mems.map((m: any) => `[${m.type}] ${m.content} (${m.created_at})`).join("\n");
}

export async function searchMemories(db: D1Database, query: string): Promise<any[]> {
  return (await db.prepare(
    "SELECT * FROM memories WHERE content LIKE ?1 ORDER BY strength DESC LIMIT 10"
  ).bind(`%${query}%`).all()).results;
}
