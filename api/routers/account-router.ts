import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createRouter, publicQuery } from "../middleware";
import {
  registerAccount, loginAccount, logoutToken, verifyToken,
  checkLoginRateLimit, clientIp, USERNAME_RE,
} from "../services/auth-service";

const usernameSchema = z.string().regex(USERNAME_RE, "用户名需 2-16 位，只能包含字母、数字、下划线");
const passwordSchema = z.string().min(6, "密码至少 6 位").max(32, "密码最长 32 位");

export const accountRouter = createRouter({
  register: publicQuery
    .input(z.object({ username: usernameSchema, password: passwordSchema }))
    .mutation(async ({ input }) => {
      const result = await registerAccount(input.username, input.password);
      if (!result.ok) throw new TRPCError({ code: "BAD_REQUEST", message: result.message });
      return { success: true };
    }),

  login: publicQuery
    .input(z.object({ username: z.string().min(1).max(32), password: z.string().min(1).max(64) }))
    .mutation(async ({ input, ctx }) => {
      const ip = clientIp(ctx.req);
      if (!(await checkLoginRateLimit(ip))) {
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "尝试次数过多，请 10 分钟后再试" });
      }
      const result = await loginAccount(input.username, input.password);
      if (!result.ok) throw new TRPCError({ code: "UNAUTHORIZED", message: result.message });
      return { token: result.token!, username: result.username };
    }),

  logout: publicQuery
    .input(z.object({ token: z.string().min(1).max(128) }))
    .mutation(async ({ input }) => {
      await logoutToken(input.token);
      return { success: true };
    }),

  /** 校验令牌有效性（前端启动时调用，失效则强制重新登录） */
  me: publicQuery
    .input(z.object({ token: z.string().min(1).max(128) }))
    .query(async ({ input }) => {
      const username = await verifyToken(input.token);
      if (!username) throw new TRPCError({ code: "UNAUTHORIZED", message: "登录已过期，请重新登录" });
      return { username };
    }),
});
