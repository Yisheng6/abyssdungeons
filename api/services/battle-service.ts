// 服务端战斗会话：战斗状态全程托管在服务端（Redis），客户端只发出招选择
// - start：开战时登记玩家快照 + 敌人列表 + 掉落表，会话 TTL 30 分钟
// - tick：服务端校验节奏（≥800ms/回合）后推进一个回合，返回增量状态
// - 结束后会话即销毁；经验在服务端按敌人强度与层数结算，防止伪造
import { randomBytes } from "crypto";
import { getRedis } from "./redis-service";
import { resolveCombat, type Combatant, type CombatAction } from "./combat-service";
import { getItemById } from "./config-service";

const SESSION_TTL = 1800; // 30 分钟
const TICK_MIN_INTERVAL = 800; // 服务端控速：每回合至少 800ms
const MAX_ROUNDS = 90;

interface BattleSession {
  id: string;
  mode: string;
  layer: number;
  round: number;
  player: Combatant;      // 快照属性 + 实时 hp/mp/statuses/cooldowns
  enemies: Combatant[];   // 含 uid
  dropTables: Array<{ enemyId: string; dropTable?: unknown[] }>;
  lastTickAt: number;
  createdAt: number;
}

const key = (username: string) => `battle:${username.toLowerCase()}`;

async function load(username: string): Promise<BattleSession | null> {
  try {
    const raw = await getRedis().get(key(username));
    return raw ? (JSON.parse(raw) as BattleSession) : null;
  } catch { return null; }
}

async function store(username: string, s: BattleSession): Promise<void> {
  await getRedis().setex(key(username), SESSION_TTL, JSON.stringify(s));
}

export async function startBattle(username: string, init: {
  mode: string; layer: number; player: Combatant; enemies: Combatant[];
  dropTables: Array<{ enemyId: string; dropTable?: unknown[] }>;
}): Promise<{ battleId: string }> {
  const session: BattleSession = {
    id: randomBytes(12).toString("hex"),
    mode: init.mode,
    layer: init.layer,
    round: 0,
    player: init.player,
    enemies: init.enemies,
    dropTables: init.dropTables,
    lastTickAt: 0,
    createdAt: Date.now(),
  };
  await store(username, session);
  return { battleId: session.id };
}

export type TickResult =
  | { ok: true; logs: string[]; player: { hp: number; mp: number; statuses: unknown[]; cooldowns: Record<string, number> };
      enemies: Array<{ uid?: string; id: string; name: string; hp: number; maxHp: number; statuses: unknown[]; dead: boolean }>;
      ended: boolean; victory: boolean; fled: boolean; drops: unknown[]; expGain: number; round: number }
  | { ok: false; code: "NO_BATTLE" | "STALE" | "TOO_FAST" | "MAX_ROUNDS" };

export async function tickBattle(username: string, battleId: string, action: CombatAction): Promise<TickResult> {
  const s = await load(username);
  if (!s || s.id !== battleId) return { ok: false, code: "NO_BATTLE" };
  const now = Date.now();
  if (now - s.lastTickAt < TICK_MIN_INTERVAL) return { ok: false, code: "TOO_FAST" };
  if (s.round >= MAX_ROUNDS) {
    await getRedis().del(key(username));
    return { ok: false, code: "MAX_ROUNDS" };
  }

  // 吃药（与进攻动作同回合）：服务端按配置表校验治疗量，防止伪造治疗数值
  let potionLog: string | null = null;
  if (action.itemId) {
    const item = getItemById(action.itemId);
    const heal = (item?.effect as Record<string, number> | undefined)?.heal ?? 0;
    if (heal > 0 && s.player.hp > 0) {
      s.player.hp = Math.min(s.player.maxHp, s.player.hp + heal);
      potionLog = `你使用了 ${item!.name}，恢复 ${heal} 点生命`;
    }
  }

  // 未指定目标时默认攻击第一个存活敌人
  const fixedAction: CombatAction = { ...action };
  if (!fixedAction.targetId) {
    const firstAlive = s.enemies.find((e) => e.hp > 0);
    if (firstAlive) fixedAction.targetId = firstAlive.uid ?? firstAlive.id;
  }

  const { logs, player, enemies, ended, victory, fled, drops } = resolveCombat(
    s.player, s.enemies, fixedAction, now + s.round,
    { layer: s.layer, enemyDropTables: s.dropTables as never },
  );
  if (potionLog) logs.unshift(potionLog);
  s.round += 1;
  s.lastTickAt = now;

  let expGain = 0;
  if (ended && victory) {
    // 经验服务端结算：基础 10 + 层数×3 + 敌人强度，Boss（HP≥500）双倍
    const lv = s.layer;
    expGain = Math.floor(s.enemies.reduce((sum, e) => {
      const base = 10 + lv * 3 + Math.ceil((e.maxHp || 30) / 20) + (e.atk || 5);
      return sum + ((e.maxHp || 0) >= 500 ? base * 2 : base);
    }, 0));
    await getRedis().del(key(username));
  } else if (ended) {
    await getRedis().del(key(username));
  } else {
    await store(username, s);
  }

  return {
    ok: true, logs,
    player: { hp: player.hp, mp: player.mp, statuses: player.statuses || [], cooldowns: player.cooldowns || {} },
    enemies: enemies.map((e) => ({ uid: e.uid, id: e.id, name: e.name, hp: e.hp, maxHp: e.maxHp, statuses: e.statuses || [], dead: e.hp <= 0 })),
    ended, victory, fled, drops: drops as unknown[], expGain, round: s.round,
  };
}

export async function abandonBattle(username: string): Promise<void> {
  try { await getRedis().del(key(username)); } catch { /* silent */ }
}
