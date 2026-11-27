import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createRouter, publicQuery } from "../middleware";
import { requireAccount } from "../services/auth-service";
import { loadState } from "../services/char-state-service";
import {
  addLeaderboardScore,
  getLeaderboardTop,
  getPlayerRank,
} from "../services/redis-service";

export const leaderboardRouter = createRouter({
  submitScore: publicQuery
    .input(z.object({
      category: z.enum(["deepest_layer", "lawful_layer", "speedrun", "kills", "wealth", "gear_score"]),
      playerId: z.string().min(1).max(32),
      score: z.number().int().min(0),
      playerName: z.string().min(1).max(32),
      token: z.string().min(1).max(128),
      details: z.record(z.any()).optional(),
    }))
    .mutation(async ({ input }) => {
      let username: string;
      try {
        username = await requireAccount(input.token, input.playerId);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        throw new TRPCError({ code: msg === "FORBIDDEN" ? "FORBIDDEN" : "UNAUTHORIZED", message: "登录状态无效" });
      }
      // 服务端读分：击杀/守序层数/财富以存档为准，忽略客户端上报值
      let score = input.score;
      const rec = await loadState(username);
      if (rec?.state) {
        const st = rec.state;
        const p = st.player as { gold?: number } | undefined;
        if (input.category === "kills") {
          score = Math.max(0, Math.floor((st.taskState as { totals?: { kills?: number } } | undefined)?.totals?.kills ?? 0));
        } else if (input.category === "lawful_layer") {
          score = Math.max(0, Math.floor((st.lawful as { best?: number } | undefined)?.best ?? 1));
        } else if (input.category === "wealth") {
          score = Math.max(0, Math.floor(p?.gold ?? 0));
        } else if (input.category === "deepest_layer") {
          score = Math.max(0, Math.floor((st.player as { maxLayer?: number } | undefined)?.maxLayer ?? 1));
        }
      }
      await addLeaderboardScore(input.category, input.playerId, score, {
        name: input.playerName,
        ...input.details,
      });
      return { success: true };
    }),

  getTop: publicQuery
    .input(z.object({
      category: z.enum(["deepest_layer", "lawful_layer", "speedrun", "kills", "wealth", "gear_score"]),
      count: z.number().int().min(1).max(100).default(20),
    }))
    .query(async ({ input }) => {
      const list = await getLeaderboardTop(input.category, input.count);
      return list;
    }),

  getMyRank: publicQuery
    .input(z.object({
      category: z.enum(["deepest_layer", "lawful_layer", "speedrun", "kills", "wealth", "gear_score"]),
      playerId: z.string().min(1),
    }))
    .query(async ({ input }) => {
      const rank = await getPlayerRank(input.category, input.playerId);
      return { rank };
    }),
});
