import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createRouter, publicQuery } from "../middleware";
import { requireAccount } from "../services/auth-service";
import { startBattle, tickBattle, abandonBattle } from "../services/battle-service";
import type { Combatant } from "../services/combat-service";

const statusSchema = z.object({ id: z.string(), name: z.string(), kind: z.string(), turns: z.number() });

const combatantSchema = z.object({
  id: z.string(), uid: z.string().optional(), name: z.string(),
  hp: z.number(), maxHp: z.number(), mp: z.number(), maxMp: z.number(),
  atk: z.number(), def: z.number(), mag: z.number(), mdef: z.number(),
  agi: z.number(), luk: z.number(), con: z.number().optional(), wil: z.number().optional(),
  skills: z.array(z.string()), element: z.string(), aiType: z.string().optional(),
  statuses: z.array(statusSchema).optional(),
  cooldowns: z.record(z.number()).optional(),
  mods: z.object({
    atkPct: z.number().optional(), defPct: z.number().optional(),
    magPct: z.number().optional(), mdefPct: z.number().optional(),
    critRate: z.number().optional(), critDmg: z.number().optional(),
    lifesteal: z.number().optional(), reflect: z.number().optional(),
    elemDmg: z.number().optional(), physRes: z.number().optional(), magRes: z.number().optional(),
  }).optional(),
});

async function auth(token: string): Promise<string> {
  try {
    return await requireAccount(token);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    throw new TRPCError({ code: msg === "FORBIDDEN" ? "FORBIDDEN" : "UNAUTHORIZED", message: "登录状态无效" });
  }
}

export const battleRouter = createRouter({
  start: publicQuery
    .input(z.object({
      token: z.string().min(1).max(128),
      mode: z.enum(["explore", "lawful", "rift", "weekly"]),
      layer: z.number().int().min(1).max(999999),
      player: combatantSchema,
      enemies: z.array(combatantSchema).min(1).max(6),
      dropTables: z.array(z.object({ enemyId: z.string(), dropTable: z.array(z.any()).nullish() })).optional(),
    }))
    .mutation(async ({ input }) => {
      const username = await auth(input.token);
      const cast = (c: z.infer<typeof combatantSchema>): Combatant => ({
        ...c, isPlayer: false,
        statuses: c.statuses?.map((s) => ({ ...s, kind: s.kind as never })),
      } as Combatant);
      const r = await startBattle(username, {
        mode: input.mode,
        layer: input.layer,
        player: { ...cast(input.player), isPlayer: true },
        enemies: input.enemies.map(cast),
        dropTables: input.dropTables || [],
      });
      return r;
    }),

  tick: publicQuery
    .input(z.object({
      token: z.string().min(1).max(128),
      battleId: z.string().min(1).max(64),
      action: z.object({
        type: z.enum(["attack", "skill", "item", "defend", "flee"]),
        targetId: z.string().optional(),
        skillId: z.string().optional(),
        itemId: z.string().optional(),
      }),
    }))
    .mutation(async ({ input }) => {
      const username = await auth(input.token);
      const r = await tickBattle(username, input.battleId, input.action);
      if (!r.ok) {
        const code = r.code === "TOO_FAST" ? "TOO_MANY_REQUESTS" : "BAD_REQUEST";
        throw new TRPCError({ code, message: r.code });
      }
      return r;
    }),

  abandon: publicQuery
    .input(z.object({ token: z.string().min(1).max(128) }))
    .mutation(async ({ input }) => {
      const username = await auth(input.token);
      await abandonBattle(username);
      return { success: true };
    }),
});
