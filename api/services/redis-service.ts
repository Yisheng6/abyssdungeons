// Redis Service Layer
// Handles: config caching, leaderboard, online status, chat history
import Redis from "ioredis";

let redis: Redis | null = null;

export function getRedis(): Redis {
  if (!redis) {
    const host = process.env.REDIS_HOST || "localhost";
    const port = parseInt(process.env.REDIS_PORT || "6379");
    const password = process.env.REDIS_PASSWORD || undefined;
    redis = new Redis({ host, port, password, retryStrategy: (times) => Math.min(times * 50, 2000) });
    redis.on("error", (err) => console.error("[Redis] error:", err.message));
    redis.on("connect", () => console.log("[Redis] connected"));
  }
  return redis;
}

export async function disconnectRedis() {
  if (redis) { await redis.quit(); redis = null; }
}

// ─── Config Cache ───
const CONFIG_CACHE_TTL = 3600; // 1 hour

export async function getCachedConfig<T>(key: string): Promise<T | null> {
  try {
    const r = getRedis();
    const cached = await r.get(`config:${key}`);
    if (cached) return JSON.parse(cached) as T;
    return null;
  } catch { return null; }
}

export async function setCachedConfig<T>(key: string, value: T): Promise<void> {
  try {
    const r = getRedis();
    await r.setex(`config:${key}`, CONFIG_CACHE_TTL, JSON.stringify(value));
  } catch { /* silent */ }
}

// ─── Leaderboard (Sorted Set) ───
export async function addLeaderboardScore(category: string, playerId: string, score: number, metadata?: Record<string, unknown>): Promise<void> {
  try {
    const r = getRedis();
    const member = JSON.stringify({ id: playerId, meta: metadata || {} });
    await r.zadd(`lb:${category}`, score, member);
    // Keep top 1000
    await r.zremrangebyrank(`lb:${category}`, 0, -1001);
  } catch { /* silent */ }
}

export async function getLeaderboardTop(category: string, count: number = 20): Promise<Array<{ player: string; score: number; rank: number; meta?: Record<string, unknown> }>> {
  try {
    const r = getRedis();
    const results = await r.zrevrange(`lb:${category}`, 0, count - 1, "WITHSCORES");
    const list: Array<{ player: string; score: number; rank: number; meta?: Record<string, unknown> }> = [];
    for (let i = 0; i < results.length; i += 2) {
      try {
        const parsed = JSON.parse(results[i]);
        list.push({ player: parsed.id, score: parseFloat(results[i + 1]), rank: Math.floor(i / 2) + 1, meta: parsed.meta });
      } catch { /* skip */ }
    }
    return list;
  } catch { return []; }
}

export async function getPlayerRank(category: string, playerId: string): Promise<number | null> {
  try {
    const r = getRedis();
    const members = await r.zrevrange(`lb:${category}`, 0, -1);
    for (let i = 0; i < members.length; i++) {
      try { if (JSON.parse(members[i]).id === playerId) return i + 1; }
      catch { /* skip */ }
    }
    return null;
  } catch { return null; }
}

// ─── Online Status ───
export async function setPlayerOnline(playerId: string, name: string, status: string = "online"): Promise<void> {
  try {
    const r = getRedis();
    await r.hset(`online`, playerId, JSON.stringify({ name, status, ts: Date.now() }));
  } catch { /* silent */ }
}

export async function setPlayerOffline(playerId: string): Promise<void> {
  try {
    const r = getRedis();
    await r.hdel(`online`, playerId);
  } catch { /* silent */ }
}

export async function getOnlinePlayers(): Promise<Array<{ id: string; name: string; status: string }>> {
  try {
    const r = getRedis();
    const data = await r.hgetall("online");
    const now = Date.now();
    const list: Array<{ id: string; name: string; status: string }> = [];
    for (const [id, val] of Object.entries(data)) {
      try {
        const parsed = JSON.parse(val);
        // Expire after 5 min inactivity
        if (now - parsed.ts < 300000) list.push({ id, name: parsed.name, status: parsed.status });
        else await r.hdel("online", id);
      } catch { /* skip */ }
    }
    return list;
  } catch { return []; }
}

// ─── Chat Messages ───
export async function addChatMessage(channel: string, senderId: string, senderName: string, content: string): Promise<void> {
  try {
    const r = getRedis();
    const msg = JSON.stringify({ senderId, senderName, content, ts: Date.now() });
    await r.lpush(`chat:${channel}`, msg);
    await r.ltrim(`chat:${channel}`, 0, 99); // Keep last 100
    // TTL for cleanup
    await r.expire(`chat:${channel}`, 86400); // 24h
  } catch { /* silent */ }
}

export async function getChatMessages(channel: string, count: number = 50): Promise<Array<{ senderId: string; senderName: string; content: string; time: number }>> {
  try {
    const r = getRedis();
    const msgs = await r.lrange(`chat:${channel}`, 0, count - 1);
    return msgs.reverse().map((m) => {
      const p = JSON.parse(m);
      return { senderId: p.senderId, senderName: p.senderName, content: p.content, time: p.ts };
    });
  } catch { return []; }
}

// ─── Player Session (for combat state) ───
export async function setPlayerSession(playerId: string, data: Record<string, unknown>): Promise<void> {
  try {
    const r = getRedis();
    await r.setex(`session:${playerId}`, 3600, JSON.stringify(data));
  } catch { /* silent */ }
}

export async function getPlayerSession<T>(playerId: string): Promise<T | null> {
  try {
    const r = getRedis();
    const data = await r.get(`session:${playerId}`);
    return data ? JSON.parse(data) : null;
  } catch { return null; }
}

export async function deletePlayerSession(playerId: string): Promise<void> {
  try {
    const r = getRedis();
    await r.del(`session:${playerId}`);
  } catch { /* silent */ }
}
