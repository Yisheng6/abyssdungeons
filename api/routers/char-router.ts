// 角色操作路由：所有改动角色数据的接口（服务端权威，操作后返回最新存档状态）
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createRouter, publicQuery } from "../middleware";
import { requireAccount } from "../services/auth-service";
import { loadState, writeState } from "../services/char-state-service";
import { logOp } from "../services/oplog-service";
import * as ops from "../services/char-ops-service";
import { claimLootVoucher } from "../services/loot-voucher-service";

async function auth(token: string): Promise<string> {
  try {
    return await requireAccount(token);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    throw new TRPCError({ code: msg === "FORBIDDEN" ? "FORBIDDEN" : "UNAUTHORIZED", message: "登录状态无效" });
  }
}

/** 通用执行器：加载存档 → 执行操作 → 成功则写回 → 返回最新状态（全程记操作日志） */
async function run(
  token: string,
  op: string,
  fn: (s: Record<string, unknown>, username: string) => { success: boolean; message: string },
  allowNew = false,
) {
  const username = await auth(token);
  const rec = await loadState(username);
  if (!rec && !allowNew) throw new TRPCError({ code: "BAD_REQUEST", message: "存档不存在" });
  const state = rec?.state ?? {};
  const r = fn(state, username);
  let version = rec?.version ?? 0;
  if (r.success) version = await writeState(username, state);
  logOp(username, op, r.success, r.message, r.success ? version : undefined);
  return { ...r, state, version };
}

export const charRouter = createRouter({
  // ─── 角色 ───
  createPlayer: publicQuery
    .input(z.object({ token: z.string(), classId: z.string().max(32) }))
    .mutation(({ input }) => run(input.token, "createPlayer", (s, username) => ops.opCreatePlayer(s as never, input.classId, username), true)),

  switchClass: publicQuery
    .input(z.object({ token: z.string(), classId: z.string().max(32) }))
    .mutation(({ input }) => run(input.token, "switchClass", (s) => ops.opSwitchClass(s as never, input.classId))),

  // ─── 装备 ───
  equip: publicQuery
    .input(z.object({ token: z.string(), uid: z.string().max(64) }))
    .mutation(({ input }) => run(input.token, "equip", (s) => ops.opEquip(s as never, input.uid))),

  unequip: publicQuery
    .input(z.object({ token: z.string(), slot: z.string().max(16) }))
    .mutation(({ input }) => run(input.token, "unequip", (s) => ops.opUnequip(s as never, input.slot))),

  useItem: publicQuery
    .input(z.object({ token: z.string(), uid: z.string().max(64) }))
    .mutation(({ input }) => run(input.token, "useItem", (s) => ops.opUseConsumable(s as never, input.uid))),

  disassemble: publicQuery
    .input(z.object({ token: z.string(), uids: z.array(z.string().max(64)).min(1).max(50) }))
    .mutation(({ input }) => run(input.token, "disassemble", (s) => ops.opDisassemble(s as never, input.uids))),

  buy: publicQuery
    .input(z.object({ token: z.string(), itemId: z.string().max(64), qty: z.number().int().min(1).max(99) }))
    .mutation(({ input }) => run(input.token, "buy", (s) => ops.opBuyItem(s as never, input.itemId, input.qty))),

  // ─── 铁匠铺 ───
  enhance: publicQuery
    .input(z.object({ token: z.string(), uid: z.string().max(64), useProtect: z.boolean().optional(), useLucky: z.boolean().optional() }))
    .mutation(({ input }) => run(input.token, "enhance", (s) => ops.opEnhance(s as never, input.uid, !!input.useProtect, !!input.useLucky))),

  reforge: publicQuery
    .input(z.object({ token: z.string(), uid: z.string().max(64), useDiamond: z.boolean().optional() }))
    .mutation(({ input }) => run(input.token, "reforge", (s) => ops.opReforge(s as never, input.uid, !!input.useDiamond))),

  socketGem: publicQuery
    .input(z.object({ token: z.string(), uid: z.string().max(64), gemUid: z.string().max(64) }))
    .mutation(({ input }) => run(input.token, "socketGem", (s) => ops.opSocketGem(s as never, input.uid, input.gemUid))),

  unsocketGem: publicQuery
    .input(z.object({ token: z.string(), uid: z.string().max(64), gemIndex: z.number().int().min(0).max(5) }))
    .mutation(({ input }) => run(input.token, "unsocketGem", (s) => ops.opUnsocketGem(s as never, input.uid, input.gemIndex))),

  // ─── 成长 ───
  advanceTier: publicQuery
    .input(z.object({ token: z.string() }))
    .mutation(({ input }) => run(input.token, "advanceTier", (s) => ops.opAdvanceTier(s as never))),

  awaken: publicQuery
    .input(z.object({ token: z.string() }))
    .mutation(({ input }) => run(input.token, "awaken", (s) => ops.opAwaken(s as never))),

  learnTalent: publicQuery
    .input(z.object({ token: z.string(), nodeId: z.string().max(32) }))
    .mutation(({ input }) => run(input.token, "learnTalent", (s) => ops.opLearnTalent(s as never, input.nodeId))),

  respecTalents: publicQuery
    .input(z.object({ token: z.string() }))
    .mutation(({ input }) => run(input.token, "respecTalents", (s) => ops.opRespecTalents(s as never))),

  learnSkill: publicQuery
    .input(z.object({ token: z.string(), skillId: z.string().max(64) }))
    .mutation(({ input }) => run(input.token, "learnSkill", (s) => ops.opLearnSkill(s as never, input.skillId))),

  claimTask: publicQuery
    .input(z.object({ token: z.string(), taskId: z.string().max(32) }))
    .mutation(({ input }) => run(input.token, "claimTask", (s) => ops.opClaimTask(s as never, input.taskId))),

  // ─── 进度（探索计数/层数/秘境阶段/设置） ───
  track: publicQuery
    .input(z.object({ token: z.string(), kind: z.enum(["rooms", "kills", "layers", "bossKills"]), n: z.number().int().min(1).max(50).optional() }))
    .mutation(({ input }) => run(input.token, "track", (s) => ops.opTrackEvent(s as never, input.kind, input.n ?? 1))),

  updateMaxLayer: publicQuery
    .input(z.object({ token: z.string(), layer: z.number().int().min(1).max(1000) }))
    .mutation(({ input }) => run(input.token, "updateMaxLayer", (s) => ops.opUpdateMaxLayer(s as never, input.layer))),

  setLawfulLayer: publicQuery
    .input(z.object({ token: z.string(), layer: z.number().int().min(1).max(101) }))
    .mutation(({ input }) => run(input.token, "setLawfulLayer", (s) => ops.opSetLawfulLayer(s as never, input.layer))),

  setRiftStage: publicQuery
    .input(z.object({ token: z.string(), stage: z.number().int().min(1).max(6), cleared: z.boolean().optional() }))
    .mutation(({ input }) => run(input.token, "setRiftStage", (s) => ops.opSetRiftStage(s as never, input.stage, !!input.cleared))),

  /** 领取探索掉落（凭证制，服务端暂存的战利品入库） */
  claimLoot: publicQuery
    .input(z.object({ token: z.string(), voucher: z.string().max(64) }))
    .mutation(async ({ input }) => {
      const username = await auth(input.token);
      const r = await claimLootVoucher(username, input.voucher);
      logOp(username, "claimLoot", r.success, r.message, (r as { version?: number }).version);
      return r;
    }),

  updateSettings: publicQuery
    .input(z.object({ token: z.string(), patch: z.record(z.unknown()) }))
    .mutation(({ input }) => run(input.token, "updateSettings", (s) => ops.opUpdateSettings(s as never, input.patch))),

  /** 查询自己的操作日志（最新在前，最多 100 条） */
  opLog: publicQuery
    .input(z.object({ token: z.string(), limit: z.number().int().min(1).max(100).optional() }))
    .query(async ({ input }) => {
      const username = await auth(input.token);
      const { readOpLog } = await import("../services/oplog-service");
      return readOpLog(username, input.limit ?? 100);
    }),
});
