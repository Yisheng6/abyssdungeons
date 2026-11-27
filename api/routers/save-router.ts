// 云存档：Redis 按账号存整包存档 JSON
// - 版本号乐观锁：put 必须携带当前 baseVersion，不一致视为冲突（其他设备已存更新版本）
// - 限频：每账号 5 秒最多写一次，防止客户端异常刷写
// - 单存档上限 512KB（正常存档约几十 KB）
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createRouter, publicQuery } from "../middleware";
import { requireAccount } from "../services/auth-service";
import { getRedis } from "../services/redis-service";

const SAVE_KEY = (u: string) => `save:${u.toLowerCase()}`;
const MAX_SAVE_BYTES = 512 * 1024;
const MIN_INTERVAL_MS = 5000;
const lastSaveAt = new Map<string, number>();

async function auth(token: string): Promise<string> {
  try {
    return await requireAccount(token);
  } catch {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "登录状态无效" });
  }
}

export const saveRouter = createRouter({
  get: publicQuery
    .input(z.object({ token: z.string().min(1).max(128) }))
    .query(async ({ input }) => {
      const username = await auth(input.token);
      const raw = await getRedis().get(SAVE_KEY(username));
      if (!raw) return { found: false as const };
      try {
        const rec = JSON.parse(raw) as { v: number; data: string; t: number };
        return { found: true as const, version: rec.v, data: rec.data, updatedAt: rec.t };
      } catch {
        return { found: false as const };
      }
    }),

  put: publicQuery
    .input(z.object({
      token: z.string().min(1).max(128),
      baseVersion: z.number().int().min(0),
      data: z.string().min(2).max(MAX_SAVE_BYTES),
    }))
    .mutation(async ({ input }) => {
      const username = await auth(input.token);
      const now = Date.now();
      const last = lastSaveAt.get(username) || 0;
      if (now - last < MIN_INTERVAL_MS) {
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "保存过于频繁" });
      }
      const key = SAVE_KEY(username);
      const raw = await getRedis().get(key);
      const curV = raw ? ((JSON.parse(raw) as { v: number }).v || 0) : 0;
      if (input.baseVersion !== curV) {
        // 冲突：另一设备已写入更新版本，由客户端拉取覆盖本地
        return { success: false as const, conflict: true as const, version: curV };
      }
      await getRedis().set(key, JSON.stringify({ v: curV + 1, data: input.data, t: now }));
      lastSaveAt.set(username, now);
      return { success: true as const, conflict: false as const, version: curV + 1 };
    }),
});
