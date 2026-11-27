// 云存档：Redis 按账号存整包存档 JSON
// 安全模型：客户端不可直接写存档（无 put 接口）。
// 所有存档变更必须经由 char/battle/mail 等服务端接口完成，
// 服务端在对应操作中完成校验、计算并写库（版本号自增）。
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createRouter, publicQuery } from "../middleware";
import { requireAccount } from "../services/auth-service";
import { getRedis } from "../services/redis-service";

const SAVE_KEY = (u: string) => `save:${u.toLowerCase()}`;

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
});
