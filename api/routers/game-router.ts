import { z } from "zod";
import { createRouter, publicQuery } from "../middleware";
import {
  getClasses, getClassById, getTierRules, getSkillsByClass,
  getEnemiesByFamily, getBossByFamily, getRoomTypes,
  getThemeByLayer, getConsumables, getQualities,
  getElementMultiplier, getEnemyById,
  getItems, getEquipmentSets, getSkills,
} from "../services/config-service";
import { generateDungeon, getRoomDirections } from "../services/mapgen-service";
import { resolveCombat } from "../services/combat-service";
import {
  offlineStart, offlineHeartbeat, offlineStop, offlineStatus, offlineSettle,
  OFFLINE_BASE_HOURS,
} from "../services/offline-service";

const offlinePlayerSchema = z.object({
  level: z.number(), hp: z.number(), maxHp: z.number(),
  mp: z.number(), maxMp: z.number(),
  atk: z.number(), def: z.number(), mag: z.number(), mdef: z.number(),
  agi: z.number(), luk: z.number(), con: z.number(), wil: z.number(),
});

export const gameRouter = createRouter({
  // ─── Config APIs ───
  getClasses: publicQuery.query(() => {
    return getClasses().map((c) => ({
      id: c.id,
      name: c.name,
      role: c.role,
      difficulty: (c as unknown as Record<string, string>).difficulty || "中等",
      description: c.description,
      baseStats: c.baseStats,
      tiers: c.tiers ?? [],
    }));
  }),

  getTierRules: publicQuery.query(() => {
    return getTierRules();
  }),

  getClassDetail: publicQuery
    .input(z.object({ classId: z.string() }))
    .query(({ input }) => {
      const cls = getClassById(input.classId);
      if (!cls) return null;
      const skills = getSkillsByClass(input.classId);
      return { ...cls, skills: skills.map((s) => ({ id: s.id, name: s.name, type: s.type, description: s.description })) };
    }),

  getRoomTypes: publicQuery.query(() => getRoomTypes()),

  getConsumables: publicQuery.query(() => getConsumables()),

  // ─── 目录 API：总物品表 / 套装 / 技能表 ───
  getItemCatalog: publicQuery.query(() => getItems()),

  getEquipmentSets: publicQuery.query(() => getEquipmentSets()),

  getSkillCatalog: publicQuery.query(() =>
    getSkills().map((s) => ({
      id: s.id, name: s.name, classId: s.classId, type: s.type,
      element: s.element, mpCost: s.mpCost, cooldown: s.cooldown,
      description: s.description,
      learnable: !!s.learnable,
      learnLevel: s.learnLevel ?? null,
      learnCost: s.learnCost ?? null,
    }))
  ),

  // ─── Dungeon APIs ───
  generateDungeon: publicQuery
    .input(z.object({
      globalSeed: z.string().default("default"),
      layer: z.number().min(1).max(999999),
      x: z.number().default(0),
      y: z.number().default(0),
    }))
    .mutation(({ input }) => {
      const dungeon = generateDungeon({ globalSeed: input.globalSeed, layer: input.layer, x: input.x, y: input.y });
      return {
        seed: dungeon.seed,
        layer: dungeon.layer,
        theme: dungeon.theme,
        roomCount: dungeon.rooms.length,
        rooms: dungeon.rooms.map((r) => ({
          id: r.id,
          type: r.type,
          x: r.x,
          y: r.y,
          connections: r.connections,
          isEntrance: r.isEntrance,
          isExit: r.isExit,
          hasEnemies: !!r.enemies?.length,
          hasLoot: !!r.loot?.length,
        })),
        entranceRoomId: dungeon.entranceId,
        bossRoomId: dungeon.bossRoomId,
      };
    }),

  enterRoom: publicQuery
    .input(z.object({
      globalSeed: z.string().default("default"),
      layer: z.number(),
      x: z.number(),
      y: z.number(),
      roomId: z.number(),
    }))
    .mutation(({ input }) => {
      const dungeon = generateDungeon({ globalSeed: input.globalSeed, layer: input.layer, x: input.x, y: input.y });
      const room = dungeon.rooms.find((r) => r.id === input.roomId);
      if (!room) return null;

      const theme = getThemeByLayer(input.layer);
      const directions = getRoomDirections(dungeon.rooms, input.roomId);

      // Enemies: full stats from mapgen (already scaled by layer)
      const enemies = (room.enemies || []).map((e) => ({
        id: e.id, name: e.name, hp: e.hp, maxHp: e.maxHp,
        mp: e.mp, maxMp: e.maxMp, atk: e.atk, def: e.def,
        mag: e.mag, mdef: e.mdef, agi: e.agi, luk: e.luk,
        skills: e.skills, element: e.element, aiType: e.aiType,
        dropTable: e.dropTable,
      }));

      return {
        roomId: room.id,
        type: room.type,
        themeName: theme?.name || "未知地牢",
        themeDescription: theme?.description || "",
        directions,
        enemies,
        loot: room.loot || [],
        isEntrance: room.isEntrance,
        isExit: room.isExit,
      };
    }),

  // ─── Combat API ───
  combatTurn: publicQuery
    .input(z.object({
      player: z.object({
        id: z.string(), name: z.string(), hp: z.number(), maxHp: z.number(),
        mp: z.number(), maxMp: z.number(), atk: z.number(), def: z.number(),
        mag: z.number(), mdef: z.number(), agi: z.number(), luk: z.number(),
        con: z.number().optional(), wil: z.number().optional(),
        skills: z.array(z.string()), element: z.string().default("none"),
        statuses: z.array(z.object({ id: z.string(), name: z.string(), kind: z.string(), turns: z.number() })).optional(),
      }),
      enemies: z.array(z.object({
        id: z.string(), name: z.string(), hp: z.number(), maxHp: z.number(),
        mp: z.number(), maxMp: z.number(), atk: z.number(), def: z.number(),
        mag: z.number(), mdef: z.number(), agi: z.number(), luk: z.number(),
        con: z.number().optional(), wil: z.number().optional(),
        skills: z.array(z.string()), element: z.string(), aiType: z.string().optional(),
        statuses: z.array(z.object({ id: z.string(), name: z.string(), kind: z.string(), turns: z.number() })).optional(),
      })),
      action: z.object({
        type: z.enum(["attack", "skill", "item", "defend", "flee"]),
        targetId: z.string().optional(),
        skillId: z.string().optional(),
        itemId: z.string().optional(),
      }),
      turnSeed: z.number(),
      layer: z.number().optional(),
      enemyDropTables: z.array(z.object({
        enemyId: z.string(),
        dropTable: z.array(z.object({
          itemId: z.string(), name: z.string(), type: z.string(),
          chance: z.number(), quantityMin: z.number(), quantityMax: z.number(),
          quality: z.string(), minLayer: z.number().optional(),
        })).nullish(),
      })).optional(),
    }))
    .mutation(({ input }) => {
      const castStatuses = (list?: Array<{ id: string; name: string; kind: string; turns: number }>) =>
        list?.map((s) => ({ ...s, kind: s.kind as "physical" | "mental" }));
      const { logs, player, enemies, ended, victory, fled, drops } = resolveCombat(
        { ...input.player, statuses: castStatuses(input.player.statuses), isPlayer: true },
        input.enemies.map((e) => ({ ...e, statuses: castStatuses(e.statuses), isPlayer: false })),
        input.action,
        input.turnSeed,
        {
          layer: input.layer,
          enemyDropTables: input.enemyDropTables,
        }
      );

      return {
        logs,
        player: { hp: player.hp, mp: player.mp, maxHp: player.maxHp, maxMp: player.maxMp, statuses: player.statuses || [] },
        enemies: enemies.map((e) => ({
          id: e.id, name: e.name, hp: e.hp, maxHp: e.maxHp,
          mp: e.mp, maxMp: e.maxMp, atk: e.atk, def: e.def,
          mag: e.mag, mdef: e.mdef, agi: e.agi, luk: e.luk,
          skills: e.skills, element: e.element, aiType: e.aiType,
          statuses: e.statuses || [],
          dead: e.hp <= 0,
        })),
        ended,
        victory,
        fled,
        drops,
      };
    }),

  // ─── 离线挂机探索 ───
  offlineStart: publicQuery
    .input(z.object({ playerName: z.string(), player: offlinePlayerSchema, layer: z.number() }))
    .mutation(({ input }) => {
      offlineStart(input.playerName, input.player, input.layer);
      return { ok: true, maxHours: OFFLINE_BASE_HOURS };
    }),

  offlineHeartbeat: publicQuery
    .input(z.object({ playerName: z.string(), player: offlinePlayerSchema, layer: z.number() }))
    .mutation(({ input }) => {
      offlineHeartbeat(input.playerName, input.player, input.layer);
      return { ok: true };
    }),

  offlineStop: publicQuery
    .input(z.object({ playerName: z.string() }))
    .mutation(({ input }) => {
      offlineStop(input.playerName);
      return { ok: true };
    }),

  offlineStatus: publicQuery
    .input(z.object({ playerName: z.string() }))
    .query(({ input }) => ({
      ...offlineStatus(input.playerName),
      maxHours: OFFLINE_BASE_HOURS,
    })),

  offlineSettle: publicQuery
    .input(z.object({ playerName: z.string() }))
    .mutation(({ input }) => offlineSettle(input.playerName)),
});
