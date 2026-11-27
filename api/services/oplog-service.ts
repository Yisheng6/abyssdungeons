// 操作日志服务：记录玩家所有改动存档的操作（审计/防刷排查用）
// 存储：Redis List `oplog:{用户名}`，每条 {t, op, ok, detail, v}
// 每个玩家保留最近 300 条，超出自动截断；写日志失败不影响业务操作
import { getRedis } from "./redis-service";

const KEY = (u: string) => `oplog:${u.toLowerCase()}`;
const MAX_ENTRIES = 300;

export interface OpLogEntry {
  t: number;        // 时间戳
  op: string;       // 操作名：enhance / equip / battle_settle / mail_claim ...
  ok: boolean;      // 是否成功
  detail: string;   // 描述（一般是操作返回的 message）
  v?: number;       // 操作后的存档版本号
}

/** 追加一条操作日志（fire-and-forget，绝不阻塞主流程） */
export function logOp(username: string, op: string, ok: boolean, detail: string, version?: number): void {
  const entry: OpLogEntry = { t: Date.now(), op, ok, detail: String(detail || "").slice(0, 200), v: version };
  void (async () => {
    try {
      const r = getRedis();
      const k = KEY(username);
      await r.lpush(k, JSON.stringify(entry));
      await r.ltrim(k, 0, MAX_ENTRIES - 1);
    } catch {
      // 日志写失败不影响业务
    }
  })();
}

/** 读取玩家操作日志（最新在前），供后台管理/客服查询 */
export async function readOpLog(username: string, limit = 100): Promise<OpLogEntry[]> {
  try {
    const raw = await getRedis().lrange(KEY(username), 0, Math.max(0, limit - 1));
    return raw.map((s) => JSON.parse(s) as OpLogEntry);
  } catch {
    return [];
  }
}
