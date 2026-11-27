// 角色数据服务器化：以服务端云存档为唯一数据源，重算角色战斗快照
// - 基础属性：职业基础 + 逐级成长回放（含觉醒成长率）+ 等阶奖励
// - 装备属性：按存档中的装备数据重算（强化/宝石/套装/词条），客户端存档中的人物总属性不被信任
// - 未达标惩罚：装备需求等级高于角色等级时，装备属性按百分比扣减（配表：global.json equipment）
import { getRedis } from "./redis-service";
import {
  getClassById, getTierRules, getItemById, getEquipmentSetById, getGlobalConfig,
} from "./config-service";
import { getTalentMods } from "../../src/lib/talents";
import type { Combatant } from "./combat-service";

// 与客户端 gameStore 保持一致：觉醒继承兜底基础（客户端 awaken 使用的静态表）
const DEFAULT_CLASS_STATS: Record<string, Record<string, number>> = {
  warrior:  { hp: 150, mp: 30, atk: 15, def: 12, mag: 2, mdef: 8, agi: 6, luk: 5, con: 12, wil: 5 },
  mage:     { hp: 80,  mp: 100, atk: 5, def: 4, mag: 18, mdef: 12, agi: 7, luk: 8, con: 4, wil: 14 },
  assassin: { hp: 100, mp: 50, atk: 18, def: 6, mag: 4, mdef: 5, agi: 16, luk: 10, con: 6, wil: 7 },
  ranger:   { hp: 110, mp: 45, atk: 14, def: 7, mag: 6, mdef: 7, agi: 14, luk: 9, con: 8, wil: 8 },
  priest:   { hp: 100, mp: 80, atk: 6, def: 6, mag: 14, mdef: 14, agi: 6, luk: 7, con: 6, wil: 14 },
  warlock:  { hp: 90,  mp: 90, atk: 7, def: 5, mag: 16, mdef: 10, agi: 8, luk: 12, con: 5, wil: 12 },
};

const CLASS_CON_WIL_GROWTH: Record<string, { con: number; wil: number }> = {
  warrior:  { con: 2, wil: 1 },
  mage:     { con: 1, wil: 2 },
  priest:   { con: 1, wil: 2 },
  warlock:  { con: 1, wil: 2 },
  assassin: { con: 1, wil: 1 },
  ranger:   { con: 1, wil: 1 },
};

const COMBAT_MOD_KEYS = ['atkPct', 'defPct', 'magPct', 'mdefPct', 'critRate', 'critDmg', 'lifesteal', 'reflect', 'elemDmg', 'physRes', 'magRes'];

interface SaveItem {
  uid: string; id: string; name?: string; type?: string; slot?: string
  quality?: string; setId?: string; setTier?: number; enhanceLevel?: number
  stats?: Record<string, number>; affixes?: Record<string, number>; gems?: string[]
}

interface SavePlayer {
  id: string; name: string; classId: string; level: number; exp?: number
  hp: number; maxHp: number; mp: number; maxMp: number
  tier?: number; awakenCount?: number; skills?: string[]; element?: string
  con?: number; wil?: number
  /** 觉醒时记录的重算基准（新存档才有；旧存档回退到职业基础+15%继承不可回放，按等级钳制） */
  awakenBase?: Record<string, number>
}

export interface CharacterSnapshot {
  player: Combatant
  level: number
}

/** 装备需求等级：T1=1，T2=levelReq[0]，T3=levelReq[1]… */
function equipReqLevel(setTier: number | undefined, levelReq: number[]): number {
  const st = setTier || 1
  if (st <= 1) return 1
  return levelReq[st - 2] ?? levelReq[levelReq.length - 1] ?? 1
}

/** 未达标惩罚比例（0.3~1），与等阶解锁比例叠乘 */
export function equipLevelPenaltyScale(setTier: number | undefined, playerLevel: number): number {
  const g = (getGlobalConfig() as { equipment?: { penaltyPerLevelPct?: number; penaltyMinPct?: number } }).equipment || {}
  const per = g.penaltyPerLevelPct ?? 3
  const minPct = g.penaltyMinPct ?? 30
  const rules = getTierRules()
  const req = equipReqLevel(setTier, (rules?.levelReq as number[] | undefined) ?? [10, 25, 45, 70, 100, 135, 175, 220, 270])
  if (playerLevel >= req) return 1
  return Math.max(minPct / 100, 1 - ((req - playerLevel) * per) / 100)
}

/** 等阶解锁比例（与客户端 getEquipTierScale 一致） */
function tierScale(setTier: number | undefined, playerTier: number): number {
  const st = setTier || 1
  if (st <= playerTier) return 1
  return Math.max(0.05, playerTier / st)
}

/** 装备有效属性（强化 +10%/级；宝石平加；乘以等阶×等级惩罚比例） */
function effectiveStats(item: SaveItem, scale: number): Record<string, number> {
  const lv = item.enhanceLevel || 0
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(item.stats || {})) {
    if (typeof v !== 'number' || !v) continue
    const sv = scale < 1 ? Math.max(1, Math.round(v * scale)) : v
    out[k] = lv > 0 ? sv + Math.ceil(sv * 0.1 * lv) : sv
  }
  for (const gid of item.gems || []) {
    const def = getItemById(gid)
    for (const [k, v] of Object.entries((def?.stats as Record<string, number> | undefined) || {})) {
      if (typeof v === 'number' && v) out[k] = (out[k] || 0) + v
    }
  }
  return out
}

/** 套装加成（按套装配置表） */
function setBonuses(items: Array<SaveItem | null>): Record<string, number> {
  const counts = new Map<string, number>()
  for (const it of items) {
    if (itemHasSet(it)) counts.set(it!.setId!, (counts.get(it!.setId!) || 0) + 1)
  }
  const total: Record<string, number> = {}
  for (const [setId, count] of counts) {
    const set = getEquipmentSetById(setId) as { bonus?: Array<{ pieces: number; stats: Record<string, number> }> } | undefined
    if (!set?.bonus) continue
    for (const b of set.bonus) {
      if (count >= b.pieces) {
        for (const [k, v] of Object.entries(b.stats)) total[k] = (total[k] || 0) + v
      }
    }
  }
  return total
}
function itemHasSet(it: SaveItem | null | undefined): it is SaveItem {
  return !!it && typeof it.setId === 'string' && it.setId.length > 0
}

/** 从云存档重算角色战斗快照。无角色时返回 null。 */
export async function computeCharacterSnapshot(username: string): Promise<CharacterSnapshot | null> {
  let save: { data?: { player?: SavePlayer; equipment?: Record<string, SaveItem | null>; talents?: Record<string, Record<string, number>> } } | null = null
  try {
    const raw = await getRedis().get(`save:${username.toLowerCase()}`)
    if (raw) save = JSON.parse(raw)
  } catch { return null }
  // 存档为 zustand persist 格式：{ state: {...}, version }（兼容无包装的旧格式）
  const rawData = save?.data as unknown
  const wrapped = (typeof rawData === 'string' ? JSON.parse(rawData) : rawData) as { state?: Record<string, unknown> } & Record<string, unknown>
  const data = (wrapped?.state ?? wrapped) as { player?: SavePlayer; equipment?: Record<string, SaveItem | null>; talents?: Record<string, Record<string, number>> }
  const p = data?.player as SavePlayer | undefined
  if (!data || !p || !p.classId || !p.level) return null

  const cls = getClassById(p.classId) as { baseStats?: Record<string, number> } | undefined
  const awakenCount = p.awakenCount || 0

  // ── 1. 基础 + 逐级成长回放 ──
  // 觉醒后基准：新存档用 awakenBase；旧存档（无 awakenBase）回退为职业基础（继承部分不可回放，会被下方钳制逻辑兜住）
  const baseSrc: Record<string, number> = p.awakenBase
    || (awakenCount > 0 ? (DEFAULT_CLASS_STATS[p.classId] || DEFAULT_CLASS_STATS.warrior) : (cls?.baseStats || DEFAULT_CLASS_STATS.warrior))
  const stats: Record<string, number> = {
    maxHp: baseSrc.maxHp ?? baseSrc.hp ?? 100,
    maxMp: baseSrc.maxMp ?? baseSrc.mp ?? 50,
    atk: baseSrc.atk ?? 10, def: baseSrc.def ?? 10,
    mag: baseSrc.mag ?? 10, mdef: baseSrc.mdef ?? 8,
    agi: baseSrc.agi ?? 10, luk: baseSrc.luk ?? 5,
    con: baseSrc.con ?? 6, wil: baseSrc.wil ?? 6,
  }
  const growth = CLASS_CON_WIL_GROWTH[p.classId] || { con: 1, wil: 1 }
  const awakenMult = 1 + 0.2 * awakenCount
  const level = Math.max(1, Math.min(999, p.level))
  for (let l = 2; l <= level; l++) {
    stats.con += Math.ceil(growth.con * awakenMult)
    stats.wil += Math.ceil(growth.wil * awakenMult)
    stats.maxHp += Math.round((10 + growth.con * 8) * awakenMult)
    stats.maxMp += Math.round(5 * awakenMult)
    stats.atk += Math.round(2 * awakenMult)
    stats.def += Math.round(1 * awakenMult)
    stats.mag += Math.round(1 * awakenMult)
    stats.mdef += Math.round(1 * awakenMult)
    stats.agi += Math.round(1 * awakenMult)
  }

  // ── 2. 等阶奖励（tier 2..N 逐阶累加） ──
  const tier = Math.max(1, Math.min(9, p.tier || 1))
  const rules = getTierRules() as { rewards?: Array<Record<string, number> | null> } | null
  for (let t = 2; t <= tier; t++) {
    const r = rules?.rewards?.[t - 1]
    if (!r) continue
    for (const [k, v] of Object.entries(r)) {
      const key = k === 'hp' ? 'maxHp' : k === 'mp' ? 'maxMp' : k
      if (key in stats && typeof v === 'number') stats[key] += v
    }
  }

  // ── 3. 装备（强化/宝石/等阶解锁/未达标惩罚）+ 套装 ──
  const equipment = (data.equipment || {}) as Record<string, SaveItem | null>
  const equipped = Object.values(equipment).filter(Boolean) as SaveItem[]
  const mods: Record<string, number> = {}
  for (const it of equipped) {
    const scale = tierScale(it!.setTier, tier) * equipLevelPenaltyScale(it!.setTier, level)
    const eff = effectiveStats(it!, scale)
    for (const [k, v] of Object.entries(eff)) {
      const key = k === 'hp' ? 'maxHp' : k === 'mp' ? 'maxMp' : k
      if (key in stats) stats[key] += v
    }
    // 战斗词条（含强化加成）
    const lv = it!.enhanceLevel || 0
    for (const [k, v] of Object.entries(it!.affixes || {})) {
      if (!COMBAT_MOD_KEYS.includes(k) || typeof v !== 'number') continue
      mods[k] = (mods[k] || 0) + v + (lv > 0 ? Math.ceil(v * 0.1 * lv) : 0)
    }
  }
  for (const [k, v] of Object.entries(setBonuses(equipped))) {
    const key = k === 'hp' ? 'maxHp' : k === 'mp' ? 'maxMp' : k
    if (key in stats) stats[key] += v
    else if (COMBAT_MOD_KEYS.includes(k)) mods[k] = (mods[k] || 0) + v
  }

  // ── 4. 天赋（战斗词条） ──
  const talentMods = getTalentMods(data.talents?.[p.classId], p.classId)
  for (const [k, v] of Object.entries(talentMods.combat)) mods[k] = (mods[k] || 0) + v

  // ── 5. 组装 Combatant：当前血蓝取存档值并钳制到重算上限 ──
  const player: Combatant = {
    id: p.id, name: p.name,
    hp: Math.max(1, Math.min(stats.maxHp, Math.round(p.hp || stats.maxHp))),
    maxHp: stats.maxHp,
    mp: Math.max(0, Math.min(stats.maxMp, Math.round(p.mp || 0))),
    maxMp: stats.maxMp,
    atk: stats.atk, def: stats.def, mag: stats.mag, mdef: stats.mdef,
    agi: stats.agi, luk: stats.luk,
    con: stats.con, wil: stats.wil,
    skills: Array.isArray(p.skills) ? p.skills : [],
    element: p.element || 'none',
    statuses: [], cooldowns: {},
    mods,
  } as Combatant

  return { player, level }
}
