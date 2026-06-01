import { addMemory, recentMemories } from "../db";

export async function storeThought(db, content) {
  await addMemory(db, content, "semantic");
}

export async function storeExperience(db, content) {
  await addMemory(db, content, "episodic", ["experience"]);
}

export async function recall(db, limit = 10) {
  const mems = await recentMemories(db, limit);
  if (!mems.length) return "No memories yet.";
  return mems.map((m) => `[${m.type}] ${m.content} (${m.created_at})`).join("\n");
}

export async function searchMemories(db, query) {
  return (await db.prepare(
    "SELECT * FROM memories WHERE content LIKE ?1 ORDER BY strength DESC LIMIT 10"
  ).bind(`%${query}%`).all()).results;
}
