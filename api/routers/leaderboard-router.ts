import { z } from "zod";
import { createRouter, publicQuery } from "../middleware";
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
      details: z.record(z.any()).optional(),
    }))
    .mutation(async ({ input }) => {
      await addLeaderboardScore(input.category, input.playerId, input.score, {
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
