import { z } from "zod";
import { createRouter, publicQuery } from "../middleware";
import {
  listMails, unreadCount, markRead, deleteMail, claimAttachments, sendMailOnce,
} from "../services/mail-service";

const playerInput = z.object({ playerName: z.string().min(1).max(32) });

export const mailRouter = createRouter({
  // 邮件列表（顺带确保欢迎邮件送达）
  list: publicQuery.input(playerInput).query(({ input }) => {
    sendMailOnce(
      input.playerName,
      "welcome",
      "欢迎来到深渊地城",
      "冒险者，欢迎来到深渊地城！\n\n这是一点见面礼，希望能助你闯过深渊的前几层。\n\n—— 深渊议会",
      [
        { kind: "gold", amount: 500 },
        { kind: "diamonds", amount: 50 },
        { kind: "item", itemId: "hp_medium", quantity: 10 },
      ]
    );
    return listMails(input.playerName).map((m) => ({
      id: m.id, title: m.title, content: m.content,
      attachments: m.attachments, createdAt: m.createdAt, expiresAt: m.expiresAt,
      read: m.read, claimed: m.claimed, tag: m.tag,
    }));
  }),

  unread: publicQuery.input(playerInput).query(({ input }) => ({
    count: unreadCount(input.playerName),
  })),

  read: publicQuery
    .input(playerInput.extend({ mailId: z.string() }))
    .mutation(({ input }) => ({ success: markRead(input.playerName, input.mailId) })),

  claim: publicQuery
    .input(playerInput.extend({ mailId: z.string() }))
    .mutation(({ input }) => claimAttachments(input.playerName, input.mailId)),

  remove: publicQuery
    .input(playerInput.extend({ mailId: z.string() }))
    .mutation(({ input }) => deleteMail(input.playerName, input.mailId)),
});
