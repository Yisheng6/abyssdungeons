import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createRouter, publicQuery } from "../middleware";
import { requireAccount } from "../services/auth-service";
import {
  addChatMessage,
  getChatMessages,
  getOnlinePlayers,
} from "../services/redis-service";

export const chatRouter = createRouter({
  send: publicQuery
    .input(z.object({
      channel: z.enum(["world", "area", "party", "guild"]).default("world"),
      senderId: z.string().min(1).max(32),
      senderName: z.string().min(1).max(32),
      content: z.string().min(1).max(500),
      token: z.string().min(1).max(128),
    }))
    .mutation(async ({ input }) => {
      try {
        await requireAccount(input.token, input.senderId);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        throw new TRPCError({ code: msg === "FORBIDDEN" ? "FORBIDDEN" : "UNAUTHORIZED", message: "登录状态无效" });
      }
      await addChatMessage(input.channel, input.senderId, input.senderName, input.content);
      return { success: true };
    }),

  history: publicQuery
    .input(z.object({
      channel: z.enum(["world", "area", "party", "guild"]).default("world"),
      count: z.number().int().min(1).max(100).default(50),
    }))
    .query(async ({ input }) => {
      const msgs = await getChatMessages(input.channel, input.count);
      return msgs;
    }),

  onlinePlayers: publicQuery.query(async () => {
    const players = await getOnlinePlayers();
    return players;
  }),
});
