/**
 * Offline Explore Service（离线挂机探索）
 *
 * 玩家在线探索时定期心跳上报角色快照；若玩家下线（心跳停止），
 * 下次上线时服务器根据真实流逝时间快速模拟战斗并结算收益。
 *
 * - 基础离线时长上限：12 小时
 * - 节奏：每 18 秒模拟 1 个房间
 * - 每 12 个房间推进 1 层，第 12 个房间为 Boss 房
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import {
  getEnemiesByFamily,
  getBossByFamily,
  getThemeByLayer,
  rollDrops,
  getItemById,
} from "./config-service";
import { rollEquipmentInstance } from "./equipgen-service";

// ─── 常量 ───
export const OFFLINE_BASE_HOURS = 12;
const OFFLINE_MAX_MS = OFFLINE_BASE_HOURS * 3600 * 1000;
const ROOM_SECONDS = 18;
const ROOMS_PER_LAYER = 12;
/** 心跳超过该间隔视为已离线 */
const HEARTBEAT_TIMEOUT_MS = 60 * 1000;

const DATA_DIR = join(process.cwd(), "data");
const STORE_FILE = join(DATA_DIR, "offline-sessions.json");

// ─── 类型 ───
export interface OfflinePlayerSnapshot {
  level: number; hp: number; maxHp: number; mp: number; maxMp: number;
  atk: number; def: number; mag: number; mdef: number;
  agi: number; luk: number; con: number; wil: number;
}

interface OfflineSession {
  playerName: string;
  player: OfflinePlayerSnapshot;
  layer: number;
  startTs: number;
  lastHeartbeat: number;
}

export interface OfflineSettleItem {
  itemId: string; name: string; type: string; quality: string; quantity: number;
  stats?: Record<string, number>; affixes?: Record<string, number>; slot?: string;
  setId?: string; setTier?: number; value?: number;
}

export interface OfflineSettleResult {
  settled: boolean;
  seconds: number;
  capped: boolean;
  rooms: number;
  kills: number;
  defeats: number;
  bossKills: number;
  exp: number;
  gold: number;
  diamonds: number;
  startLayer: number;
  finalLayer: number;
  items: OfflineSettleItem[];
  message?: string;
}

// ─── 会话存储（文件持久化）───
const sessions = new Map<string, OfflineSession>();
let loaded = false;

function loadSessions(): void {
  if (loaded) return;
  loaded = true;
  try {
    if (existsSync(STORE_FILE)) {
      const raw = JSON.parse(readFileSync(STORE_FILE, "utf-8")) as OfflineSession[];
      for (const s of raw) sessions.set(s.playerName, s);
    }
  } catch {
    // 损坏则忽略，从新开始
  }
}

function saveSessions(): void {
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(STORE_FILE, JSON.stringify([...sessions.values()]), "utf-8");
  } catch {
    // 写盘失败不影响内存状态
  }
}

// ─── 会话操作 ───
export function offlineStart(playerName: string, player: OfflinePlayerSnapshot, layer: number): void {
  loadSessions();
  const now = Date.now();
  sessions.set(playerName, { playerName, player, layer, startTs: now, lastHeartbeat: now });
  saveSessions();
}

export function offlineHeartbeat(playerName: string, player: OfflinePlayerSnapshot, layer: number): void {
  loadSessions();
  const s = sessions.get(playerName);
  if (!s) {
    offlineStart(playerName, player, layer);
    return;
  }
  s.player = player;
  s.layer = layer;
  s.lastHeartbeat = Date.now();
  saveSessions();
}

export function offlineStop(playerName: string): void {
  loadSessions();
  if (sessions.delete(playerName)) saveSessions();
}

export function offlineStatus(playerName: string): { active: boolean; elapsedMs: number; layer: number } {
  loadSessions();
  const s = sessions.get(playerName);
  if (!s) return { active: false, elapsedMs: 0, layer: 1 };
  return { active: true, elapsedMs: Date.now() - s.startTs, layer: s.layer };
}

// ─── 战斗模拟（快速公式法）───
interface SimState {
  hp: number; kills: number; defeats: number; bossKills: number;
  exp: number; gold: number; diamonds: number;
  itemMap: Map<string, OfflineSettleItem>;
}

function simulateBattle(
  player: OfflinePlayerSnapshot,
  enemies: Array<{ id: string; hp: number; atk: number; def: number; isBoss: boolean }>,
  layer: number,
  rng: () => number,
  st: SimState
): void {
  // 玩家进攻能力：取物理/魔法中较强的一侧（自动战斗会用技能）
  const off = Math.max(player.atk, player.mag * 1.6);
  // 玩家承伤减免：防御 + 体质加成
  const mitigation = player.def + player.con * 0.2;
  // 闪避：敏捷差带来的期望减伤系数
  for (const e of enemies) {
    const pdmg = Math.max(1, Math.round(off * (0.9 + rng() * 0.2) - e.def * 0.8));
    const rounds = Math.ceil(e.hp / pdmg);
    const edmg = Math.max(1, Math.round(e.atk - mitigation));
    const dodgeFactor = Math.max(0.6, 1 - player.agi * 0.004);
    const incoming = Math.round(edmg * rounds * dodgeFactor * (0.85 + rng() * 0.3));
    // 生命回复（体质）抵消部分伤害
    const regen = Math.round(player.con * 0.3 * rounds);
    st.hp -= Math.max(0, incoming - regen);
    if (st.hp <= 0) {
      st.defeats += 1;
      st.hp = player.maxHp; // 复活继续（与在线探索一致）
    }
    st.kills += 1;
    if (e.isBoss) st.bossKills += 1;
    // 经验：与在线一致 10 + 层数×3 + HP/20 + atk，boss 双倍
    const base = 10 + layer * 3 + Math.ceil(e.hp / 20) + e.atk;
    st.exp += e.isBoss ? base * 2 : base;
    // 掉落
    const drops = rollDrops(e.id, layer, rng);
    for (const d of drops) {
      const cat = getItemById(d.itemId);
      const type = d.type || cat?.type || "material";
      if (type === "currency") {
        if (d.itemId === "gem_diamond") st.diamonds += d.quantity;
        else st.gold += d.quantity * (cat?.value ?? 1);
        continue;
      }
      // 装备：每件单独随机实例（品质重roll、主属性浮动、随机词条），不叠加
      if (type === "equipment" && cat) {
        const rolled = rollEquipmentInstance(cat, rng);
        st.itemMap.set(`${d.itemId}#${st.itemMap.size}_${Math.floor(rng() * 1e9)}`, {
          itemId: d.itemId,
          name: rolled.displayName,
          type,
          quality: rolled.quality,
          quantity: 1,
          stats: rolled.stats,
          affixes: rolled.affixes,
          slot: cat.slot,
          setId: cat.setId,
          setTier: cat.setTier,
          value: cat.value,
        });
        continue;
      }
      const key = d.itemId;
      const existing = st.itemMap.get(key);
      if (existing) existing.quantity += d.quantity;
      else st.itemMap.set(key, {
        itemId: d.itemId,
        name: d.name || cat?.name || d.itemId,
        type,
        quality: d.quality || cat?.quality || "common",
        quantity: d.quantity,
      });
    }
  }
}

function scaleEnemy(base: Record<string, number>, layer: number, eliteMult: number, bossHpMult: number, bossAtkMult: number) {
  const layerMult = 1 + (layer - 1) * 0.08;
  return {
    hp: Math.round((base.hp ?? 30) * eliteMult * layerMult * bossHpMult),
    atk: Math.round((base.atk ?? 5) * eliteMult * layerMult * bossAtkMult),
    def: Math.round((base.def ?? 3) * eliteMult * layerMult * (bossAtkMult > 1 ? 3 : 1)),
  };
}

// ─── 结算 ───
export function offlineSettle(playerName: string): OfflineSettleResult {
  loadSessions();
  const empty: OfflineSettleResult = {
    settled: false, seconds: 0, capped: false, rooms: 0, kills: 0, defeats: 0,
    bossKills: 0, exp: 0, gold: 0, diamonds: 0, startLayer: 1, finalLayer: 1, items: [],
  };
  const s = sessions.get(playerName);
  if (!s) return empty;

  const now = Date.now();
  // 心跳刚停不久 → 玩家可能只是切页面/刷新，不结算，保留会话
  if (now - s.lastHeartbeat < HEARTBEAT_TIMEOUT_MS) {
    return { ...empty, message: "exploring" };
  }

  // 离线区间：从最后一次心跳算起
  const rawMs = now - s.lastHeartbeat;
  const effMs = Math.min(rawMs, OFFLINE_MAX_MS);
  const capped = rawMs > OFFLINE_MAX_MS;
  const totalRooms = Math.floor(effMs / 1000 / ROOM_SECONDS);

  // 清理会话（结算一次性）
  sessions.delete(playerName);
  saveSessions();

  if (totalRooms <= 0) return { ...empty, seconds: Math.floor(effMs / 1000), capped };

  const rng = Math.random;
  const st: SimState = {
    hp: s.player.maxHp, kills: 0, defeats: 0, bossKills: 0,
    exp: 0, gold: 0, diamonds: 0, itemMap: new Map(),
  };
  const startLayer = s.layer;

  // 层数推进规则：打完一层 Boss 且该层战败 ≤3 次才推进；打不动就留在当前层刷
  let layer = startLayer;
  let roomInLayer = 0;
  let bossKilledLayer = false;
  let defeatsLayer = 0;

  for (let room = 1; room <= totalRooms; room++) {
    roomInLayer += 1;
    const isBossRoom = roomInLayer === ROOMS_PER_LAYER;
    const theme = getThemeByLayer(layer);
    const roll = rng();
    const defeatsBefore = st.defeats;

    if (isBossRoom && theme) {
      // Boss 房
      const family = theme.enemyFamilies[Math.floor(rng() * theme.enemyFamilies.length)];
      const boss = getBossByFamily(family);
      if (boss) {
        const bossKillsBefore = st.bossKills;
        const sc = scaleEnemy(boss.baseStats, layer, 1, 8, 3);
        simulateBattle(s.player, [{ id: boss.id, ...sc, isBoss: true }], layer, rng, st);
        if (st.bossKills > bossKillsBefore) bossKilledLayer = true;
      }
    } else if (roll < 0.68 && theme) {
      // 普通/精英战斗：1-3 只怪
      const family = theme.enemyFamilies[Math.floor(rng() * theme.enemyFamilies.length)];
      const pool = getEnemiesByFamily(family);
      if (pool.length > 0) {
        const count = 1 + Math.floor(rng() * 3);
        const enemies = Array.from({ length: count }, () => {
          const tpl = pool[Math.floor(rng() * pool.length)];
          const elite = rng() < 0.12;
          const sc = scaleEnemy(tpl.baseStats, layer, elite ? 1.5 : 1, 1, 1);
          return { id: tpl.id, ...sc, isBoss: false };
        });
        simulateBattle(s.player, enemies, layer, rng, st);
      }
    } else if (roll < 0.78) {
      // 宝箱房：金币
      st.gold += Math.round((20 + layer * 5) * (0.8 + rng() * 0.4));
    } else if (roll < 0.83) {
      // 陷阱房
      st.hp -= Math.round(10 + layer * 2);
      if (st.hp <= 0) { st.defeats += 1; st.hp = s.player.maxHp; }
    } else {
      // 安全房/平静：恢复
      st.hp = Math.min(s.player.maxHp, st.hp + Math.round(s.player.maxHp * 0.25));
    }

    defeatsLayer += st.defeats - defeatsBefore;
    if (roomInLayer === ROOMS_PER_LAYER) {
      if (bossKilledLayer && defeatsLayer <= 3) layer += 1;
      roomInLayer = 0;
      bossKilledLayer = false;
      defeatsLayer = 0;
    }
  }

  const finalLayer = layer;

  return {
    settled: true,
    seconds: Math.floor(effMs / 1000),
    capped,
    rooms: totalRooms,
    kills: st.kills,
    defeats: st.defeats,
    bossKills: st.bossKills,
    exp: st.exp,
    gold: st.gold,
    diamonds: st.diamonds,
    startLayer,
    finalLayer,
    items: [...st.itemMap.values()].slice(0, 80),
  };
}
