import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createRouter, publicQuery } from "../middleware";
import { requireAccount } from "../services/auth-service";
import { getWeeklyBoss, weeklyCategory } from "../services/weekly-service";
import { addLeaderboardScore, getLeaderboardTop, getPlayerRank } from "../services/redis-service";

export const weeklyRouter = createRouter({
  // 本周 Boss 信息
  boss: publicQuery.query(() => {
    const { weekId, endsAt, boss } = getWeeklyBoss();
    return { weekId, endsAt, boss };
  }),

  // 提交本周伤害成绩（保留最高分）
  submit: publicQuery
    .input(z.object({
      playerId: z.string().min(1).max(32),
      playerName: z.string().min(1).max(32),
      damage: z.number().int().min(0),
      token: z.string().min(1).max(128),
    }))
    .mutation(async ({ input }) => {
      try {
        await requireAccount(input.token, input.playerId);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        throw new TRPCError({ code: msg === "FORBIDDEN" ? "FORBIDDEN" : "UNAUTHORIZED", message: "登录状态无效" });
      }
      const { weekId } = getWeeklyBoss();
      const cat = weeklyCategory(weekId);
      // 只保留最高分：先查旧分
      const oldRank = await getPlayerRank(cat, input.playerId);
      await addLeaderboardScore(cat, input.playerId, input.damage, { name: input.playerName });
      const rank = await getPlayerRank(cat, input.playerId);
      return { success: true, rank, prevRank: oldRank };
    }),

  // 本周排行
  top: publicQuery
    .input(z.object({ count: z.number().int().min(1).max(100).default(20) }))
    .query(async ({ input }) => {
      const { weekId } = getWeeklyBoss();
      return getLeaderboardTop(weeklyCategory(weekId), input.count);
    }),
});
