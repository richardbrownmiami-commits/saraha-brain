import { initDB } from "../db";

export interface HeartbeatStatus {
  alive: boolean;
  db: boolean;
  uptime: number;
  memory: number;
  lastBeat: string;
}

let startTime = Date.now();

export async function heartbeat(env: any): Promise<HeartbeatStatus> {
  let dbOk = false;
  try {
    await initDB(env.DB);
    dbOk = true;
  } catch {}
  return {
    alive: true,
    db: dbOk,
    uptime: Math.floor((Date.now() - startTime) / 1000),
    memory: 0,
    lastBeat: new Date().toISOString(),
  };
}
