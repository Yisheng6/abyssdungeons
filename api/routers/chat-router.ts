import { z } from "zod";
import { createRouter, publicQuery } from "../middleware";
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
    }))
    .mutation(async ({ input }) => {
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
