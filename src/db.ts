export const SCHEMA = `
CREATE TABLE IF NOT EXISTS memories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'episodic',
  strength REAL DEFAULT 1.0,
  tags TEXT DEFAULT '[]',
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);
CREATE INDEX IF NOT EXISTS idx_memories_created ON memories(created_at);

CREATE TABLE IF NOT EXISTS learnings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pattern TEXT NOT NULL,
  context TEXT DEFAULT '',
  success_count INTEGER DEFAULT 0,
  fail_count INTEGER DEFAULT 0,
  last_used TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  input TEXT,
  result TEXT,
  error TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS capabilities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  description TEXT DEFAULT '',
  enabled INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS patterns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  prompt_hash TEXT UNIQUE NOT NULL,
  original_prompt TEXT NOT NULL,
  rewritten_prompt TEXT,
  success INTEGER DEFAULT 0,
  model TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS identity (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now'))
);
`;

export async function initDB(db: D1Database): Promise<void> {
  await db.exec(SCHEMA);
}

export async function addMemory(db: D1Database, content: string, type = "episodic", tags: string[] = []): Promise<void> {
  await db.prepare("INSERT INTO memories (content, type, tags) VALUES (?1, ?2, ?3)").bind(content, type, JSON.stringify(tags)).run();
}

export async function recentMemories(db: D1Database, limit = 10): Promise<any[]> {
  return (await db.prepare("SELECT * FROM memories ORDER BY created_at DESC LIMIT ?1").bind(limit).all()).results;
}

export async function addAction(db: D1Database, type: string, input: string): Promise<number> {
  const r = await db.prepare("INSERT INTO actions (type, input) VALUES (?1, ?2) RETURNING id").bind(type, input).first();
  return (r as any).id;
}

export async function updateAction(db: D1Database, id: number, status: string, result?: string, error?: string): Promise<void> {
  await db.prepare("UPDATE actions SET status = ?1, result = ?2, error = ?3, completed_at = datetime('now') WHERE id = ?4").bind(status, result || null, error || null, id).run();
}
