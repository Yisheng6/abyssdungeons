import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { computeSetBonuses, getSkillInfo, getItemInfo } from '@/lib/catalog'
import { getSpentTalentPoints, canLearnTalent, getRespecCost, getTalentMods, mergeMods } from '@/lib/talents'

// ─── Types ───

export interface Player {
  id: string; name: string; classId: string; level: number
  hp: number; maxHp: number; mp: number; maxMp: number
  atk: number; def: number; mag: number; mdef: number; agi: number; luk: number
  /** 体质：生命上限/少量物防/生命回复/物理异常抵抗 */ con: number
  /** 意志：精神抗性/少量魔防/魔力回复 */ wil: number
  skills: string[]; element: string; exp: number; gold: number
  /** 钻石：付费货币 */ diamonds: number
  /** 职业等阶 1-9 */ tier: number
  /** 地牢最深到达层数 */ maxLayer: number
}

/** 等阶规则（与 game-configs/classes.json 的 tierRules 保持一致，作为离线兜底） */
export const TIER_RULES = {
  maxTier: 9,
  levelReq: [10, 25, 45, 70, 100, 135, 175, 220, 270],
  layerReq: [1, 5, 10, 16, 22, 30, 38, 46, 55],
  goldCost: [0, 800, 1600, 3000, 5000, 8000, 12000, 18000, 26000],
  materialReq: [null, null, null,
    { id: 'soul_shard', name: '灵魂碎片', count: 3 },
    { id: 'soul_shard', name: '灵魂碎片', count: 6 },
    { id: 'ancient_rune', name: '远古符文', count: 3 },
    { id: 'ancient_rune', name: '远古符文', count: 6 },
    { id: 'dragon_scale', name: '龙鳞', count: 3 },
    { id: 'dragon_scale', name: '龙鳞', count: 6 },
  ] as Array<{ id: string; name: string; count: number } | null>,
  rewards: [null, ...Array.from({ length: 8 }, (_, i) => {
    const t = i + 2
    return { hp: 20 * t, mp: 12 * t, atk: 3 * t, def: 2 * t, mag: 3 * t, mdef: 2 * t, agi: 1 * t, luk: 1 * t }
  })] as Array<Record<string, number> | null>,
}

/** 职业专属晋升材料（6-7阶用 A，8-9阶用 B），下标 = 目标阶 - 1 */
export const CLASS_TIER_MATS: Record<string, Array<{ id: string; name: string; count: number } | null>> = {
  warrior:  [null, null, null, null, null, { id: 'war_blood', name: '战神之血', count: 3 }, { id: 'war_blood', name: '战神之血', count: 6 }, { id: 'war_soul', name: '不灭战魂', count: 3 }, { id: 'war_soul', name: '不灭战魂', count: 6 }],
  mage:     [null, null, null, null, null, { id: 'elemental_crystal', name: '元素魔晶', count: 3 }, { id: 'elemental_crystal', name: '元素魔晶', count: 6 }, { id: 'arcane_essence', name: '奥术之源', count: 3 }, { id: 'arcane_essence', name: '奥术之源', count: 6 }],
  assassin: [null, null, null, null, null, { id: 'shadow_fang', name: '暗影之牙', count: 3 }, { id: 'shadow_fang', name: '暗影之牙', count: 6 }, { id: 'void_soul', name: '虚无之魂', count: 3 }, { id: 'void_soul', name: '虚无之魂', count: 6 }],
  ranger:   [null, null, null, null, null, { id: 'storm_feather', name: '风暴翎羽', count: 3 }, { id: 'storm_feather', name: '风暴翎羽', count: 6 }, { id: 'beast_spirit', name: '万兽之魄', count: 3 }, { id: 'beast_spirit', name: '万兽之魄', count: 6 }],
  priest:   [null, null, null, null, null, { id: 'holy_crystal', name: '圣光结晶', count: 3 }, { id: 'holy_crystal', name: '圣光结晶', count: 6 }, { id: 'divine_grace', name: '神恩之露', count: 3 }, { id: 'divine_grace', name: '神恩之露', count: 6 }],
  warlock:  [null, null, null, null, null, { id: 'demon_horn', name: '恶魔之角', count: 3 }, { id: 'demon_horn', name: '恶魔之角', count: 6 }, { id: 'abyss_core', name: '深渊之核', count: 3 }, { id: 'abyss_core', name: '深渊之核', count: 6 }],
}

export interface Item {
  uid: string; id: string; name: string
  type: 'equipment' | 'consumable' | 'material' | 'currency' | 'skillbook'
  slot?: 'weapon' | 'helmet' | 'armor' | 'leggings' | 'boots' | 'necklace' | 'ring'
  quality: 'common' | 'fine' | 'rare' | 'epic' | 'legendary' | 'mythic'
  quantity: number; desc: string; stats?: Record<string, number>
  /** 装备副词条（随机生成，已合并进 stats，此字段用于展示区分） */
  affixes?: Record<string, number>
  setId?: string; setTier?: number; value?: number
  effect?: Record<string, unknown>; learnSkillId?: string
  enhanceLevel?: number
}

// ─── 装备强化规则 ───
export const ENHANCE_MAX_LEVEL = 15
/** 索引 = 当前强化等级，值 = 升到下一级的成功率(%) */
export const ENHANCE_SUCCESS_RATES = [100, 100, 100, 90, 90, 80, 75, 70, 60, 50, 45, 40, 35, 30, 25]

/** 强化等级对应的石头类型与数量 */
export function getEnhanceCost(level: number): { stoneId: string; stoneName: string; count: number } {
  if (level < 5) return { stoneId: 'enhance_stone_low', stoneName: '下级强化石', count: level + 1 }
  if (level < 10) return { stoneId: 'enhance_stone_mid', stoneName: '中级强化石', count: level - 4 }
  return { stoneId: 'enhance_stone_high', stoneName: '上级强化石', count: level - 9 }
}

/** 强化后的有效属性：每级 +10%（向上取整） */
export function getEffectiveStats(item: Item): Record<string, number> {
  const lv = item.enhanceLevel || 0
  if (!item.stats) return {}
  if (lv <= 0) return { ...item.stats }
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(item.stats)) {
    out[k] = v + Math.ceil(v * 0.1 * lv)
  }
  return out
}

/** 装备显示名（带强化等级） */
export function getItemDisplayName(item: Item): string {
  const lv = item.enhanceLevel || 0
  return lv > 0 ? `${item.name} +${lv}` : item.name
}

/** 词条是否为百分比类型（显示 +N%） */
export const PCT_AFFIX_KEYS = new Set([
  'atkPct', 'defPct', 'magPct', 'mdefPct', 'critRate', 'critDmg',
  'lifesteal', 'reflect', 'expGain', 'goldGain', 'physRes', 'magRes',
])

/** 战斗修正类词条键（传入 combatTurn 的 player.mods） */
const COMBAT_MOD_KEYS = ['atkPct', 'defPct', 'magPct', 'mdefPct', 'critRate', 'critDmg', 'lifesteal', 'reflect', 'elemDmg', 'physRes', 'magRes']
/** 收益类词条键（经验/金币/击杀回复） */
const UTILITY_MOD_KEYS = ['expGain', 'goldGain', 'killHeal', 'killMp']

/** 聚合全身装备的词条（含强化加成） */
export function getEquipmentAffixMods(equipment: Equipment): { combat: Record<string, number>; utility: Record<string, number> } {
  const combat: Record<string, number> = {}
  const utility: Record<string, number> = {}
  for (const item of Object.values(equipment)) {
    if (!item?.affixes) continue
    const lv = item.enhanceLevel || 0
    for (const [k, v] of Object.entries(item.affixes)) {
      const eff = v + (lv > 0 ? Math.ceil(v * 0.1 * lv) : 0)
      if (COMBAT_MOD_KEYS.includes(k)) combat[k] = (combat[k] || 0) + eff
      else if (UTILITY_MOD_KEYS.includes(k)) utility[k] = (utility[k] || 0) + eff
    }
  }
  return { combat, utility }
}

/** 玩家总修正 = 装备词条 + 天赋（战斗用 combat，收益用 utility） */
export function getPlayerMods(): { combat: Record<string, number>; utility: Record<string, number> } {
  const s = useGameStore.getState()
  const eq = getEquipmentAffixMods(s.equipment)
  const classId = s.player?.classId || ''
  return mergeMods(eq, getTalentMods(s.talents?.[classId], classId))
}

/** 分解装备可获得的金币（品质 + 套装阶级 + 强化等级） */
export function getDisassembleGold(item: Item): number {
  const base: Record<string, number> = { common: 20, fine: 50, rare: 120, epic: 300, legendary: 800, mythic: 2000 }
  return (base[item.quality] || 20) + (item.setTier || 0) * 100 + (item.enhanceLevel || 0) * 50
}

/** 品质等级排序（用于自动分解阈值比较） */
export const QUALITY_RANK: Record<string, number> = {
  common: 0, fine: 1, rare: 2, epic: 3, legendary: 4, mythic: 5,
}

export interface AutoDisassembleRules {
  /** 选中的品质会被分解（多选） */
  qualities: string[]
  /** 限定的部位（空 = 全部部位） */
  slots: string[]
  /** 套装阶级 ≤ 此值才分解（-1 = 不限） */
  maxSetTier: number
  /** 强化等级 ≤ 此值才分解（-1 = 不限） */
  maxEnhance: number
  /** 含这些词条的装备保留不分解 */
  keepAffixes: string[]
}

export const DEFAULT_DISASSEMBLE_RULES: AutoDisassembleRules = {
  qualities: ['common'],
  slots: [],
  maxSetTier: -1,
  maxEnhance: -1,
  keepAffixes: [],
}

export interface GameSettings {
  /** 装备自动分解开关 */
  autoDisassemble: boolean
  /** 自动分解品质阈值（旧版兼容字段） */
  autoDisassembleMaxQuality: string
  /** 自动分解多条件规则 */
  autoDisassembleRules?: AutoDisassembleRules
  /** HP 低于阈值自动喝药开关 */
  autoPotion?: boolean
  /** 自动喝药 HP 阈值百分比（30/50/70） */
  autoPotionThreshold?: number
}

/** 判断装备是否符合自动分解条件（多条件组合） */
export function shouldAutoDisassemble(item: Item, settings: GameSettings): boolean {
  if (!settings.autoDisassemble || item.type !== 'equipment') return false
  const r = settings.autoDisassembleRules
  if (!r) {
    // 旧版兼容：品质 ≤ 阈值
    return (QUALITY_RANK[item.quality] ?? 0) <= (QUALITY_RANK[settings.autoDisassembleMaxQuality] ?? 0)
  }
  if (r.qualities.length > 0 && !r.qualities.includes(item.quality)) return false
  if (r.slots.length > 0 && !r.slots.includes(item.slot || '')) return false
  if (r.maxSetTier >= 0 && (item.setTier || 0) > r.maxSetTier) return false
  if (r.maxEnhance >= 0 && (item.enhanceLevel || 0) > r.maxEnhance) return false
  if (r.keepAffixes.length > 0 && item.affixes && r.keepAffixes.some((k) => k in (item.affixes || {}))) return false
  return true
}

export interface TaskProgress { rooms: number; kills: number; layers: number; bossKills: number }

export interface TaskState {
  /** 当前每日任务所属日期（YYYY-MM-DD），跨天自动重置 */
  dailyDate: string
  daily: TaskProgress
  dailyClaimed: string[]
  totals: TaskProgress
  achClaimed: string[]
}

const EMPTY_PROGRESS: TaskProgress = { rooms: 0, kills: 0, layers: 0, bossKills: 0 }

export const DEFAULT_TASK_STATE: TaskState = {
  dailyDate: '',
  daily: { ...EMPTY_PROGRESS },
  dailyClaimed: [],
  totals: { ...EMPTY_PROGRESS },
  achClaimed: [],
}

/** 装备部位中文名 */
export const SLOT_NAMES: Record<string, string> = {
  weapon: '武器', helmet: '头盔', armor: '胸甲', leggings: '护腿', boots: '靴子', necklace: '项链', ring: '戒指',
}

/** 全部属性/词条中文名（含百分比、战斗特效、收益类词条） */
export const STAT_NAMES: Record<string, string> = {
  hp: '生命值', mp: '法力值', atk: '攻击力', def: '防御力', mag: '魔法力', mdef: '魔防', agi: '敏捷', luk: '幸运', con: '体质', wil: '意志',
  atkPct: '攻击力%', defPct: '防御力%', magPct: '魔法力%', mdefPct: '魔防%',
  critRate: '暴击率', critDmg: '暴击伤害', lifesteal: '吸血', reflect: '反伤', elemDmg: '附加元素伤害',
  expGain: '经验获取', goldGain: '金币获取', killHeal: '击杀回血', killMp: '击杀回蓝',
  physRes: '物理异常抗性', magRes: '精神异常抗性',
}

export interface Equipment {
  weapon: Item | null; helmet: Item | null; armor: Item | null
  leggings: Item | null; boots: Item | null; necklace: Item | null
  ring1: Item | null; ring2: Item | null
}

/** Each class only saves: player + what's EQUIPPED. Backpack is shared. */
export interface ClassSave {
  player: Player
  equipment: Equipment
}

interface Enemy {
  id: string; name: string; hp: number; maxHp: number
  mp: number; maxMp: number; atk: number; def: number
  mag: number; mdef: number; agi: number; luk: number
  skills: string[]; element: string; aiType?: string
}

interface RoomInfo {
  roomId: number; type: string; themeName: string; themeDescription: string
  directions: Array<{ direction: string; roomId: number }>
  enemies: Array<{ id: string; name: string; hp: number; maxHp: number }>
  loot: Array<{
    itemId: string; name?: string; type?: string; quality?: string; quantity: number
    slot?: Item['slot']; stats?: Record<string, number>; affixes?: Record<string, number>
    desc?: string; value?: number
    setId?: string; setTier?: number; effect?: Record<string, unknown>; learnSkillId?: string
  }>
  isEntrance: boolean; isExit: boolean
}

interface GameState {
  // ─── Auth ───
  isLoggedIn: boolean; playerName: string

  // ─── Multi-Class: per-class saves (player + equipped gear only) ───
  classSaves: Record<string, ClassSave>
  activeClassId: string
  lastClassSwitch: number
  switchCooldownMs: number

  // ─── SHARED backpack (all classes see the same items) ───
  inventory: Item[]

  // ─── Settings ───
  settings: GameSettings
  taskState: TaskState
  lawful: { layer: number; best: number }
  /** 天赋：classId -> nodeId -> rank */
  talents: Record<string, Record<string, number>>

  // ─── Runtime: current class ───
  player: Player | null
  equipment: Equipment

  // ─── Dungeon ───
  currentDungeon: { seed: string; layer: number; x: number; y: number; theme: string; roomCount: number } | null
  currentRoomId: number; exploredRooms: Set<number>
  roomInfo: RoomInfo | null
  dungeonRooms: Array<{ id: number; type: string; x: number; y: number; connections: number[]; explored: boolean }>

  // ─── 探索临时物品栏（结束探索后自动转入背包）───
  tempBag: Item[]

  // ─── Combat ───
  inCombat: boolean; combatEnemies: Enemy[]; combatLogs: string[]
  combatEnded: boolean; combatVictory: boolean
  /** 玩家战斗中的异常状态（瞬态，不持久化） */
  playerStatuses: Array<{ id: string; name: string; kind: string; turns: number }>

  // ─── Auto Explore (挂机) ───
  isAutoExploring: boolean
  /** 守序深渊战斗进行中（持久化：刷新后自动续战） */
  lawfulInBattle: boolean
  autoExploreLogs: string[]
  autoExploreStats: { roomsExplored: number; enemiesKilled: number; itemsFound: number; currentLayer: number }

  // ─── Actions ───
  setLoggedIn: (v: boolean) => void
  setPlayerName: (v: string) => void
  updateSettings: (patch: Partial<GameSettings>) => void
  trackTaskEvent: (kind: keyof TaskProgress, n?: number) => void
  claimTaskReward: (taskId: string, scope: 'daily' | 'achievement') => void
  setLawfulLayer: (layer: number) => void

  // 天赋树
  learnTalent: (nodeId: string) => { success: boolean; message: string }
  respecTalents: () => { success: boolean; message: string }

  createPlayer: (classId: string, classStats: Record<string, number>) => boolean
  switchClass: (classId: string) => { success: boolean; message: string }
  getClassCooldownRemaining: () => number
  getSavedClassIds: () => string[]

  setPlayer: (p: Player | null) => void
  updatePlayerHp: (hp: number) => void
  updatePlayerMp: (mp: number) => void
  addPlayerExp: (amount: number) => void
  addPlayerGold: (amount: number) => void
  spendGold: (amount: number) => boolean

  // Class tier (等阶)
  advanceTier: () => { success: boolean; message: string }
  updateMaxLayer: (layer: number) => void

  // Equipment (affects current class save)
  equipItem: (itemUid: string) => void
  unequipItem: (slot: keyof Equipment) => void
  getEquipSlot: (item: Item) => keyof Equipment | null
  syncClassEquipment: () => void

  // Shared inventory
  addItem: (item: Item) => void
  removeItem: (itemUid: string) => void
  addPlayerDiamonds: (amount: number) => void

  // 探索临时物品栏
  addTempItem: (item: Item) => void
  disassembleTempItem: (itemUid: string) => { success: boolean; message: string }
  transferTempBag: () => number

  // Skills & item usage
  learnSkill: (skillId: string) => { success: boolean; message: string }
  learnSkillFromBook: (itemUid: string) => { success: boolean; message: string }
  useConsumable: (itemUid: string) => { success: boolean; message: string }

  // Blacksmith (铁匠铺)
  enhanceItem: (itemUid: string, options?: { useProtect?: boolean; useLucky?: boolean }) => { success: boolean; message: string }
  disassembleItem: (itemUid: string) => { success: boolean; message: string }
  craftStone: (recipe: 'low' | 'mid' | 'high') => { success: boolean; message: string }
  countItemById: (itemId: string) => number

  // Dungeon
  setCurrentDungeon: (d: GameState['currentDungeon']) => void
  setCurrentRoomId: (id: number) => void
  setRoomInfo: (r: RoomInfo | null) => void
  setDungeonRooms: (r: GameState['dungeonRooms']) => void
  addExploredRoom: (id: number) => void
  resetExploredRooms: () => void

  // Combat
  setInCombat: (v: boolean) => void
  setCombatEnemies: (e: Enemy[]) => void
  addCombatLog: (log: string) => void
  setCombatEnded: (v: boolean) => void
  setCombatVictory: (v: boolean) => void
  setPlayerStatuses: (s: Array<{ id: string; name: string; kind: string; turns: number }>) => void
  resetCombat: () => void
  resetDungeon: () => void

  // Auto Explore
  setAutoExploring: (v: boolean) => void
  addAutoLog: (log: string) => void
  updateAutoStats: (stats: Partial<GameState['autoExploreStats']>) => void
  clearAutoLogs: () => void
}

const defaultEquipment: Equipment = {
  weapon: null, helmet: null, armor: null,
  leggings: null, boots: null, necklace: null, ring1: null, ring2: null,
}

const equipSlots: Record<string, keyof Equipment> = {
  weapon: 'weapon', helmet: 'helmet', armor: 'armor',
  leggings: 'leggings', boots: 'boots', necklace: 'necklace',
  ring: 'ring1',
}

const DEFAULT_CLASS_STATS: Record<string, Record<string, number>> = {
  warrior:  { hp: 150, mp: 30, atk: 15, def: 12, mag: 2, mdef: 8, agi: 6, luk: 5, con: 12, wil: 5 },
  mage:     { hp: 80,  mp: 100, atk: 5, def: 4, mag: 18, mdef: 12, agi: 7, luk: 8, con: 4, wil: 14 },
  assassin: { hp: 100, mp: 50, atk: 18, def: 6, mag: 4, mdef: 5, agi: 16, luk: 10, con: 6, wil: 7 },
  ranger:   { hp: 110, mp: 45, atk: 14, def: 7, mag: 6, mdef: 7, agi: 14, luk: 9, con: 8, wil: 8 },
  priest:   { hp: 100, mp: 80, atk: 6, def: 6, mag: 14, mdef: 14, agi: 6, luk: 7, con: 6, wil: 14 },
  warlock:  { hp: 90,  mp: 90, atk: 7, def: 5, mag: 16, mdef: 10, agi: 8, luk: 12, con: 5, wil: 12 },
}

/** 每级体质/意志成长（战士主体质，法系主意志） */
const CLASS_CON_WIL_GROWTH: Record<string, { con: number; wil: number }> = {
  warrior:  { con: 2, wil: 1 },
  mage:     { con: 1, wil: 2 },
  priest:   { con: 1, wil: 2 },
  warlock:  { con: 1, wil: 2 },
  assassin: { con: 1, wil: 1 },
  ranger:   { con: 1, wil: 1 },
}

/** 派生战斗数值（体质/意志） */
export function getDerivedStats(p: { con?: number; wil?: number }) {
  const con = p.con || 0, wil = p.wil || 0
  return {
    physResist: Math.min(con * 0.6, 60),   // % 物理异常抵抗
    magResist: Math.min(wil * 0.6, 60),    // % 精神异常抵抗
    hpRegen: Math.floor(con * 0.3),        // 每回合回血
    mpRegen: Math.floor(wil * 0.5),        // 每回合回蓝
    bonusDef: Math.floor(con * 0.2),       // 物防加成
    bonusMdef: Math.floor(wil * 0.2),      // 魔防加成
  }
}

const STORAGE_KEY = 'abyss-game-save'

// ─── 初始技能：每个职业创建/切换时自动学会前两个职业技能 ───
const STARTER_SKILLS: Record<string, string[]> = {
  warrior: ['shield_bash', 'heavy_strike'],
  mage: ['fireball', 'frostbolt'],
  assassin: ['shadow_step', 'backstab'],
  ranger: ['aimed_shot', 'multishot'],
  priest: ['heal', 'holy_light'],
  warlock: ['corruption', 'life_drain'],
}

/** 套装加成：计算装备套装带来的属性增减（需目录已加载，否则返回空） */
function setBonusDelta(oldEquip: Equipment, newEquip: Equipment): Record<string, number> {
  const oldB = computeSetBonuses(Object.values(oldEquip))
  const newB = computeSetBonuses(Object.values(newEquip))
  const delta: Record<string, number> = {}
  for (const k of new Set([...Object.keys(oldB), ...Object.keys(newB)])) {
    const d = (newB[k] || 0) - (oldB[k] || 0)
    if (d !== 0) delta[k] = d
  }
  return delta
}

/** 把玩家属性调整应用到 player 和 classSaves */
function applyStatDelta(p: Player, delta: Record<string, number>): Player {
  const np = { ...p }
  for (const [stat, val] of Object.entries(delta)) {
    if (stat === 'hp' || stat === 'maxHp') {
      np.maxHp += val; np.hp = Math.min(np.maxHp, np.hp + Math.max(0, val))
    } else if (stat === 'mp' || stat === 'maxMp') {
      np.maxMp += val; np.mp = Math.min(np.maxMp, np.mp + Math.max(0, val))
    } else if (stat in np) {
      (np as unknown as Record<string, number>)[stat] += val
    }
  }
  return np
}

export const useGameStore = create<GameState>()(
  persist(
    (set, get) => ({
      // ─── Initial ───
      isLoggedIn: false, playerName: '',
      classSaves: {}, activeClassId: '',
      lastClassSwitch: 0, switchCooldownMs: 5000,
      inventory: [],
      settings: { autoDisassemble: false, autoDisassembleMaxQuality: 'common', autoDisassembleRules: { ...DEFAULT_DISASSEMBLE_RULES }, autoPotion: false, autoPotionThreshold: 50 },
      taskState: { ...DEFAULT_TASK_STATE, daily: { ...EMPTY_PROGRESS }, totals: { ...EMPTY_PROGRESS } },
      lawful: { layer: 1, best: 0 },
      talents: {},
      player: null, equipment: { ...defaultEquipment },
      currentDungeon: null, currentRoomId: 0, exploredRooms: new Set(),
      roomInfo: null, dungeonRooms: [],
      tempBag: [],
      inCombat: false, combatEnemies: [], combatLogs: [],
      combatEnded: false, combatVictory: false,
      playerStatuses: [],
      isAutoExploring: false, lawfulInBattle: false, autoExploreLogs: [],
      autoExploreStats: { roomsExplored: 0, enemiesKilled: 0, itemsFound: 0, currentLayer: 0 },

      // ─── Auth ───
      setLoggedIn: (v) => set({ isLoggedIn: v }),
      setPlayerName: (v) => set({ playerName: v }),
      updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),

      // ─── 任务追踪 ───
      trackTaskEvent: (kind, n = 1) => {
        const today = new Date().toISOString().slice(0, 10)
        const ts = { ...get().taskState }
        // 跨天重置每日进度
        if (ts.dailyDate !== today) {
          ts.dailyDate = today
          ts.daily = { ...EMPTY_PROGRESS }
          ts.dailyClaimed = []
        }
        ts.daily = { ...ts.daily, [kind]: ts.daily[kind] + n }
        ts.totals = { ...ts.totals, [kind]: ts.totals[kind] + n }
        set({ taskState: ts })
      },

      setLawfulLayer: (layer) => set((s) => ({ lawful: { layer, best: Math.max(s.lawful.best, layer) } })),

      // ─── 天赋树 ───
      learnTalent: (nodeId) => {
        const s = get()
        if (s.inCombat) return { success: false, message: '战斗中无法修改天赋' }
        const p = s.player
        if (!p) return { success: false, message: '请先创建角色' }
        const ranks = s.talents[p.classId] || {}
        const spent = getSpentTalentPoints(ranks)
        const available = p.level - spent
        const err = canLearnTalent(ranks, p.classId, nodeId, available)
        if (err) return { success: false, message: err }
        set({ talents: { ...s.talents, [p.classId]: { ...ranks, [nodeId]: (ranks[nodeId] || 0) + 1 } } })
        return { success: true, message: '天赋已激活' }
      },

      respecTalents: () => {
        const s = get()
        if (s.inCombat) return { success: false, message: '战斗中无法洗点' }
        const p = s.player
        if (!p) return { success: false, message: '请先创建角色' }
        const spent = getSpentTalentPoints(s.talents[p.classId])
        if (spent === 0) return { success: false, message: '尚未投入任何天赋点' }
        const cost = getRespecCost(p.level)
        if (!s.spendGold(cost)) return { success: false, message: `金币不足（需要 ${cost}）` }
        set((st) => ({ talents: { ...st.talents, [p.classId]: {} } }))
        return { success: true, message: `已重置全部天赋（花费 ${cost} 金币）` }
      },


      claimTaskReward: (taskId, scope) => {
        const ts = { ...get().taskState }
        if (scope === 'daily') ts.dailyClaimed = [...ts.dailyClaimed, taskId]
        else ts.achClaimed = [...ts.achClaimed, taskId]
        set({ taskState: ts })
      },

      // ─── Create Player ───
      createPlayer: (classId, classStats) => {
        const state = get()
        const name = state.playerName || localStorage.getItem('ad_user') || '冒险者'
        const stats = classStats || DEFAULT_CLASS_STATS[classId] || DEFAULT_CLASS_STATS.warrior

        const newPlayer: Player = {
          id: `p_${Date.now()}`, name, classId, level: 1,
          hp: stats.hp || 100, maxHp: stats.hp || 100,
          mp: stats.mp || 50, maxMp: stats.mp || 50,
          atk: stats.atk || 10, def: stats.def || 10,
          mag: stats.mag || 10, mdef: stats.mdef || 8,
          agi: stats.agi || 10, luk: stats.luk || 5,
          con: stats.con ?? 6, wil: stats.wil ?? 6,
          skills: [...(STARTER_SKILLS[classId] || [])], element: 'none', exp: 0, gold: 0, diamonds: 0,
          tier: 1, maxLayer: 1,
        }

        const classSave: ClassSave = { player: newPlayer, equipment: { ...defaultEquipment } }

        // Starter items go to SHARED inventory
        const starterItems = getStarterItems(classId)
        const newInventory = [...state.inventory]
        for (const item of starterItems) {
          const existing = newInventory.find((i) => i.id === item.id && i.type === 'consumable')
          if (existing && item.type === 'consumable') {
            existing.quantity += item.quantity
          } else {
            newInventory.push(item)
          }
        }

        set({
          classSaves: { ...state.classSaves, [classId]: classSave },
          activeClassId: classId,
          player: newPlayer,
          equipment: { ...defaultEquipment },
          inventory: newInventory,
        })
        return true
      },

      // ─── Switch Class: backpack stays, equipment swaps ───
      switchClass: (targetClassId) => {
        const state = get()
        if (state.inCombat) return { success: false, message: '战斗中无法更换职业' }
        const now = Date.now()
        const elapsed = now - state.lastClassSwitch

        if (elapsed < state.switchCooldownMs) {
          return { success: false, message: `冷却中，还需 ${Math.ceil((state.switchCooldownMs - elapsed) / 1000)} 秒` }
        }
        if (targetClassId === state.activeClassId) {
          return { success: false, message: '已是当前职业' }
        }
        if (state.inCombat) {
          return { success: false, message: '战斗中无法切换' }
        }

        // 1. Save current class: player + equipment (inventory stays shared, no save needed)
        const updatedSaves = { ...state.classSaves }
        if (state.activeClassId && state.player) {
          updatedSaves[state.activeClassId] = {
            player: { ...state.player },
            equipment: { ...state.equipment },
          }
        }

        // 2. Load or create target class
        let targetSave = updatedSaves[targetClassId]
        if (!targetSave) {
          const stats = DEFAULT_CLASS_STATS[targetClassId] || DEFAULT_CLASS_STATS.warrior
          const name = state.playerName || localStorage.getItem('ad_user') || '冒险者'
          targetSave = {
            player: {
              id: `p_${Date.now()}`, name, classId: targetClassId, level: 1,
              hp: stats.hp || 100, maxHp: stats.hp || 100,
              mp: stats.mp || 50, maxMp: stats.mp || 50,
              atk: stats.atk || 10, def: stats.def || 10,
              mag: stats.mag || 10, mdef: stats.mdef || 8,
              agi: stats.agi || 10, luk: stats.luk || 5,
              con: stats.con ?? 6, wil: stats.wil ?? 6,
              skills: [...(STARTER_SKILLS[targetClassId] || [])], element: 'none', exp: 0, gold: 0, diamonds: 0,
              tier: 1, maxLayer: 1,
            },
            equipment: { ...defaultEquipment },
          }
        }

        set({
          classSaves: { ...updatedSaves, [targetClassId]: targetSave },
          activeClassId: targetClassId,
          lastClassSwitch: now,
          player: targetSave.player,
          equipment: targetSave.equipment,
          // inventory is NOT changed — shared!
        })

        return { success: true, message: '职业切换成功' }
      },

      getClassCooldownRemaining: () => {
        const s = get()
        return Math.max(0, s.switchCooldownMs - (Date.now() - s.lastClassSwitch))
      },

      getSavedClassIds: () => Object.keys(get().classSaves),

      // ─── Player ───
      setPlayer: (p) => set({ player: p }),

      updatePlayerHp: (hp) => {
        const s = get()
        if (!s.player) return
        const newPlayer = { ...s.player, hp: Math.max(0, Math.min(s.player.maxHp, hp)) }
        const newSaves = { ...s.classSaves }
        if (s.activeClassId) newSaves[s.activeClassId] = { ...newSaves[s.activeClassId], player: newPlayer }
        set({ player: newPlayer, classSaves: newSaves })
      },

      updatePlayerMp: (mp) => {
        const s = get()
        if (!s.player) return
        const newPlayer = { ...s.player, mp: Math.max(0, Math.min(s.player.maxMp, mp)) }
        const newSaves = { ...s.classSaves }
        if (s.activeClassId) newSaves[s.activeClassId] = { ...newSaves[s.activeClassId], player: newPlayer }
        set({ player: newPlayer, classSaves: newSaves })
      },

      addPlayerExp: (amount) => {
        const s = get()
        if (!s.player) return
        const np = { ...s.player, exp: s.player.exp + amount }
        // 支持连升多级
        const growth = CLASS_CON_WIL_GROWTH[np.classId] || { con: 1, wil: 1 }
        while (np.exp >= np.level * 100) {
          np.exp -= np.level * 100
          np.level += 1
          np.con = (np.con || 0) + growth.con
          np.wil = (np.wil || 0) + growth.wil
          np.maxHp += 10 + growth.con * 8; np.hp = np.maxHp  // 基础生命 = 原生生命 + 体质×系数
          np.maxMp += 5; np.mp = np.maxMp
          np.atk += 2; np.def += 1
          np.mag += 1; np.mdef += 1
          np.agi += 1
        }
        const ns = { ...s.classSaves }
        if (s.activeClassId) ns[s.activeClassId] = { ...ns[s.activeClassId], player: np }
        set({ player: np, classSaves: ns })
      },

      addPlayerGold: (amount) => {
        const s = get()
        if (!s.player) return
        const np = { ...s.player, gold: s.player.gold + amount }
        const ns = { ...s.classSaves }
        if (s.activeClassId) ns[s.activeClassId] = { ...ns[s.activeClassId], player: np }
        set({ player: np, classSaves: ns })
      },

      spendGold: (amount) => {
        const s = get()
        if (!s.player || s.player.gold < amount) return false
        const np = { ...s.player, gold: s.player.gold - amount }
        const ns = { ...s.classSaves }
        if (s.activeClassId) ns[s.activeClassId] = { ...ns[s.activeClassId], player: np }
        set({ player: np, classSaves: ns })
        return true
      },

      // ─── Class tier (等阶) ───
      updateMaxLayer: (layer) => {
        const s = get()
        if (!s.player) return
        if (layer <= (s.player.maxLayer || 1)) return
        const np = { ...s.player, maxLayer: layer }
        const ns = { ...s.classSaves }
        if (s.activeClassId) ns[s.activeClassId] = { ...ns[s.activeClassId], player: np }
        set({ player: np, classSaves: ns })
      },

      advanceTier: () => {
        const s = get()
        if (s.inCombat) return { success: false, message: '战斗中无法进阶' }
        const p = s.player
        if (!p) return { success: false, message: '尚未创建角色' }
        const cur = p.tier || 1
        if (cur >= TIER_RULES.maxTier) return { success: false, message: '已达最高等阶' }
        const idx = cur // 目标等阶 = cur+1，规则数组下标 = 目标-1
        const lvReq = TIER_RULES.levelReq[idx] ?? 1
        const layerReq = TIER_RULES.layerReq[idx] ?? 1
        const goldCost = TIER_RULES.goldCost[idx] ?? 0
        const matReq = CLASS_TIER_MATS[p.classId]?.[idx] ?? TIER_RULES.materialReq[idx]
        if (p.level < lvReq) return { success: false, message: `等级不足（需要 Lv.${lvReq}）` }
        if ((p.maxLayer || 1) < layerReq) return { success: false, message: `探索层数不足（需要到达第 ${layerReq} 层）` }
        if (p.gold < goldCost) return { success: false, message: `金币不足（需要 ${goldCost}）` }
        if (matReq) {
          const have = s.countItemById(matReq.id)
          if (have < matReq.count) {
            return { success: false, message: `材料不足：${matReq.name} ${have}/${matReq.count}` }
          }
        }
        // 消耗金币 + 材料
        let inventory = [...s.inventory]
        if (matReq) {
          let need = matReq.count
          inventory = inventory.map((it) => {
            if (it.id !== matReq.id || need <= 0) return it
            const take = Math.min(it.quantity, need)
            need -= take
            return { ...it, quantity: it.quantity - take }
          }).filter((it) => it.quantity > 0)
        }
        const reward = TIER_RULES.rewards[idx] || {}
        const np: Player = applyStatDelta({ ...p, tier: cur + 1, gold: p.gold - goldCost }, reward)
        const ns = { ...s.classSaves }
        if (s.activeClassId) ns[s.activeClassId] = { ...ns[s.activeClassId], player: np }
        set({ player: np, classSaves: ns, inventory })
        return { success: true, message: `进阶成功！当前等阶：${cur + 1}` }
      },

      // ─── Equipment ───
      equipItem: (itemUid) => {
        const s = get()
        if (s.inCombat) return // 战斗中无法更换装备
        const idx = s.inventory.findIndex((i) => i.uid === itemUid)
        if (idx === -1) return
        const item = s.inventory[idx]
        if (item.type !== 'equipment') return

        const slot = get().getEquipSlot(item)
        if (!slot) return

        // Remove from inventory
        const newInv = [...s.inventory]
        newInv.splice(idx, 1)

        // If slot occupied, return old equip to inventory
        const oldEquip = s.equipment[slot]
        if (oldEquip) newInv.push(oldEquip)

        const newEquip = { ...s.equipment, [slot]: item }

        // Apply stat bonuses (effective stats incl. enhance level + set bonus delta)
        let newPlayer = s.player ? { ...s.player } : null
        const effStats = getEffectiveStats(item)
        if (newPlayer) {
          for (const [stat, val] of Object.entries(effStats)) {
            if (stat in newPlayer) (newPlayer as Record<string, number>)[stat] += val
          }
        }
        // Remove old equip stats
        if (newPlayer && oldEquip) {
          for (const [stat, val] of Object.entries(getEffectiveStats(oldEquip))) {
            if (stat in newPlayer) (newPlayer as Record<string, number>)[stat] -= val
          }
        }
        // Set bonus delta (hp/mp 走 maxHp/maxMp 通道)
        if (newPlayer) {
          const delta = setBonusDelta(s.equipment, newEquip)
          newPlayer = applyStatDelta(newPlayer, delta)
        }

        // Sync to classSave
        const ns = { ...s.classSaves }
        if (s.activeClassId) {
          ns[s.activeClassId] = { player: newPlayer || ns[s.activeClassId].player, equipment: newEquip }
        }

        set({ inventory: newInv, equipment: newEquip, player: newPlayer, classSaves: ns })
      },

      unequipItem: (slot) => {
        const s = get()
        if (s.inCombat) return // 战斗中无法卸下装备
        const item = s.equipment[slot]
        if (!item) return

        const newEquip = { ...s.equipment, [slot]: null }
        const newInv = [...s.inventory, item]

        // Remove stat bonuses (effective stats)
        let newPlayer = s.player ? { ...s.player } : null
        if (newPlayer) {
          for (const [stat, val] of Object.entries(getEffectiveStats(item))) {
            if (stat in newPlayer) (newPlayer as Record<string, number>)[stat] -= val
          }
        }
        // Set bonus delta
        if (newPlayer) {
          const delta = setBonusDelta(s.equipment, newEquip)
          newPlayer = applyStatDelta(newPlayer, delta)
        }

        const ns = { ...s.classSaves }
        if (s.activeClassId) {
          ns[s.activeClassId] = { player: newPlayer || ns[s.activeClassId].player, equipment: newEquip }
        }

        set({ inventory: newInv, equipment: newEquip, player: newPlayer, classSaves: ns })
      },

      getEquipSlot: (item) => {
        if (!item.slot) return null
        if (item.slot === 'ring') return get().equipment.ring1 ? 'ring2' : 'ring1'
        return equipSlots[item.slot] || null
      },

      syncClassEquipment: () => {
        const s = get()
        if (!s.activeClassId) return
        const ns = { ...s.classSaves }
        ns[s.activeClassId] = { ...ns[s.activeClassId], equipment: { ...s.equipment } }
        set({ classSaves: ns })
      },

      // ─── Shared Inventory ───
      addItem: (item) => {
        const s = get()
        // 非装备类按 id 堆叠
        if (item.type !== 'equipment') {
          const existing = s.inventory.find((i) => i.id === item.id && i.type !== 'equipment')
          if (existing) {
            set({
              inventory: s.inventory.map((i) =>
                i.uid === existing.uid ? { ...i, quantity: i.quantity + item.quantity } : i
              )
            })
            return
          }
        }
        set({ inventory: [...s.inventory, { ...item, uid: item.uid || `i_${Date.now()}_${Math.random().toString(36).slice(2)}` }] })
      },

      removeItem: (itemUid) => {
        set({ inventory: get().inventory.filter((i) => i.uid !== itemUid) })
      },

      // ─── 技能学习 ───
      learnSkill: (skillId) => {
        const s = get()
        if (s.inCombat) return { success: false, message: '战斗中无法学习技能' }
        const p = s.player
        if (!p) return { success: false, message: '请先创建角色' }
        const skill = getSkillInfo(skillId)
        if (!skill) return { success: false, message: '技能不存在（目录未加载）' }
        if (skill.classId !== p.classId) return { success: false, message: '职业不符，无法学习' }
        if (p.skills.includes(skillId)) return { success: false, message: '已掌握该技能' }
        const reqLevel = skill.learnLevel || 1
        if (p.level < reqLevel) return { success: false, message: `需要等级 ${reqLevel}` }
        const cost = skill.learnCost || 0
        if (p.gold < cost) return { success: false, message: `金币不足（需要 ${cost}）` }

        const np = { ...p, skills: [...p.skills, skillId], gold: p.gold - cost }
        const ns = { ...s.classSaves }
        if (s.activeClassId) ns[s.activeClassId] = { ...ns[s.activeClassId], player: np }
        set({ player: np, classSaves: ns })
        return { success: true, message: `学会了【${skill.name}】！` }
      },

      learnSkillFromBook: (itemUid) => {
        const s = get()
        if (s.inCombat) return { success: false, message: '战斗中无法学习技能' }
        const p = s.player
        if (!p) return { success: false, message: '请先创建角色' }
        const item = s.inventory.find((i) => i.uid === itemUid)
        if (!item || item.type !== 'skillbook' || !item.learnSkillId) {
          return { success: false, message: '该物品无法学习' }
        }
        const skill = getSkillInfo(item.learnSkillId)
        if (!skill) return { success: false, message: '技能不存在（目录未加载）' }
        if (skill.classId !== p.classId) return { success: false, message: `职业不符，需要【${skill.classId}】职业` }
        if (p.skills.includes(item.learnSkillId)) return { success: false, message: '已掌握该技能' }

        const np = { ...p, skills: [...p.skills, item.learnSkillId] }
        const ns = { ...s.classSaves }
        if (s.activeClassId) ns[s.activeClassId] = { ...ns[s.activeClassId], player: np }
        // 消耗技能书
        const newInv = s.inventory
          .map((i) => (i.uid === itemUid ? { ...i, quantity: i.quantity - 1 } : i))
          .filter((i) => i.quantity > 0)
        set({ player: np, classSaves: ns, inventory: newInv })
        return { success: true, message: `学会了【${skill.name}】！` }
      },

      // ─── 使用消耗品 ───
      useConsumable: (itemUid) => {
        const s = get()
        const p = s.player
        if (!p) return { success: false, message: '请先创建角色' }
        const item = s.inventory.find((i) => i.uid === itemUid)
        if (!item || item.type !== 'consumable') return { success: false, message: '该物品无法使用' }
        const effect = item.effect || getItemInfo(item.id)?.effect
        if (!effect) return { success: false, message: '该物品无法在背包中使用' }

        let msg = ''
        if (typeof effect.heal === 'number') {
          const before = p.hp
          const np = { ...p, hp: Math.min(p.maxHp, p.hp + (effect.heal as number)) }
          const ns = { ...s.classSaves }
          if (s.activeClassId) ns[s.activeClassId] = { ...ns[s.activeClassId], player: np }
          set({ player: np, classSaves: ns })
          msg = `恢复了 ${np.hp - before} 点生命`
        } else if (typeof effect.restoreMp === 'number') {
          const before = p.mp
          const np = { ...p, mp: Math.min(p.maxMp, p.mp + (effect.restoreMp as number)) }
          const ns = { ...s.classSaves }
          if (s.activeClassId) ns[s.activeClassId] = { ...ns[s.activeClassId], player: np }
          set({ player: np, classSaves: ns })
          msg = `恢复了 ${np.mp - before} 点法力`
        } else {
          return { success: false, message: '该物品需要在战斗中使用' }
        }

        const newInv = get().inventory
          .map((i) => (i.uid === itemUid ? { ...i, quantity: i.quantity - 1 } : i))
          .filter((i) => i.quantity > 0)
        set({ inventory: newInv })
        return { success: true, message: msg }
      },

      // ─── 铁匠铺：装备强化 / 分解 / 合成 ───
      countItemById: (itemId) => {
        return get().inventory.filter((i) => i.id === itemId).reduce((sum, i) => sum + i.quantity, 0)
      },

      enhanceItem: (itemUid, options) => {
        const s = get()
        if (s.inCombat) return { success: false, message: '战斗中无法强化装备' }
        const p = s.player
        if (!p) return { success: false, message: '请先创建角色' }

        // 找装备：背包 或 已装备
        const invIdx = s.inventory.findIndex((i) => i.uid === itemUid)
        let equipSlot: keyof Equipment | null = null
        let item: Item | null = null
        if (invIdx >= 0) {
          item = s.inventory[invIdx]
        } else {
          for (const [slot, eq] of Object.entries(s.equipment)) {
            if (eq && eq.uid === itemUid) {
              equipSlot = slot as keyof Equipment
              item = eq
              break
            }
          }
        }
        if (!item) return { success: false, message: '装备不存在' }
        if (item.type !== 'equipment') return { success: false, message: '只能强化装备' }

        const curLevel = item.enhanceLevel || 0
        if (curLevel >= ENHANCE_MAX_LEVEL) return { success: false, message: '已达最高强化等级' }

        // 消耗核算
        const cost = getEnhanceCost(curLevel)
        const goldCost = Math.max(10, Math.floor((item.value || 50) * (curLevel + 1) * 0.5))
        const haveStone = s.inventory.filter((i) => i.id === cost.stoneId).reduce((n, i) => n + i.quantity, 0)
        if (haveStone < cost.count) return { success: false, message: `${cost.stoneName}不足（需要 ${cost.count}，现有 ${haveStone}）` }
        if (p.gold < goldCost) return { success: false, message: `金币不足（需要 ${goldCost}）` }

        // 保护符 / 幸运石
        const useProtect = !!options?.useProtect
        const useLucky = !!options?.useLucky
        if (useProtect && s.inventory.filter((i) => i.id === 'enhance_protect').reduce((n, i) => n + i.quantity, 0) < 1) {
          return { success: false, message: '没有强化保护符' }
        }
        if (useLucky && s.inventory.filter((i) => i.id === 'enhance_lucky').reduce((n, i) => n + i.quantity, 0) < 1) {
          return { success: false, message: '没有幸运强化石' }
        }

        // 扣材料与金币
        const removeById = (inv: Item[], id: string, n: number): Item[] => {
          let left = n
          return inv.map((i) => {
            if (i.id !== id || left <= 0) return i
            const take = Math.min(i.quantity, left)
            left -= take
            return { ...i, quantity: i.quantity - take }
          }).filter((i) => i.quantity > 0)
        }
        let newInv = removeById([...s.inventory], cost.stoneId, cost.count)
        if (useLucky) newInv = removeById(newInv, 'enhance_lucky', 1)

        // 判定
        const rate = Math.min(100, ENHANCE_SUCCESS_RATES[curLevel] + (useLucky ? 15 : 0))
        const roll = Math.random() * 100
        const success = roll < rate
        let newLevel = curLevel
        let protectedUsed = false
        let message: string

        if (success) {
          newLevel = curLevel + 1
          message = `强化成功！${item.name} +${newLevel}`
        } else {
          if (curLevel >= 5) {
            if (useProtect) {
              protectedUsed = true
              newInv = removeById(newInv, 'enhance_protect', 1)
              message = `强化失败，保护符生效，保持 +${curLevel}`
            } else {
              newLevel = curLevel >= 10 ? curLevel - 2 : curLevel - 1
              message = `强化失败！${item.name} 降为 +${newLevel}`
            }
          } else {
            message = `强化失败，等级保持 +${curLevel}`
          }
        }

        // 应用新等级
        const newItem: Item = { ...item, enhanceLevel: newLevel }
        if (invIdx >= 0) {
          newInv = newInv.map((i) => (i.uid === itemUid ? newItem : i))
        }
        const newEquip = equipSlot ? { ...s.equipment, [equipSlot]: newItem } : s.equipment

        // 已装备：调整玩家属性（新旧有效属性差值）
        let np: Player = { ...p, gold: p.gold - goldCost }
        if (equipSlot) {
          const delta: Record<string, number> = {}
          const oldEff = getEffectiveStats(item)
          const newEff = getEffectiveStats(newItem)
          for (const k of new Set([...Object.keys(oldEff), ...Object.keys(newEff)])) {
            delta[k] = (newEff[k] || 0) - (oldEff[k] || 0)
          }
          np = applyStatDelta(np, delta)
        }

        const ns = { ...s.classSaves }
        if (s.activeClassId) ns[s.activeClassId] = { player: np, equipment: newEquip }
        set({ inventory: newInv, equipment: newEquip, player: np, classSaves: ns })

        return { success, message: `${message}（成功率 ${rate}%${protectedUsed ? '，消耗保护符×1' : ''}）` }
      },

      disassembleItem: (itemUid) => {
        const s = get()
        const item = s.inventory.find((i) => i.uid === itemUid)
        if (!item) return { success: false, message: '物品不存在' }
        if (item.type !== 'equipment') return { success: false, message: '只能分解装备' }

        const gold = getDisassembleGold(item)
        const newInv = s.inventory.filter((i) => i.uid !== itemUid)
        set({ inventory: newInv })
        get().addPlayerGold(gold)
        return { success: true, message: `分解 ${getItemDisplayName(item)}，获得金币 ×${gold}` }
      },

      disassembleTempItem: (itemUid) => {
        const s = get()
        const item = s.tempBag.find((i) => i.uid === itemUid)
        if (!item) return { success: false, message: '物品不存在' }
        if (item.type !== 'equipment') return { success: false, message: '只能分解装备' }
        const gold = getDisassembleGold(item)
        set({ tempBag: s.tempBag.filter((i) => i.uid !== itemUid) })
        get().addPlayerGold(gold)
        return { success: true, message: `分解 ${getItemDisplayName(item)}，获得金币 ×${gold}` }
      },

      addTempItem: (item) => {
        const s = get()
        // 非装备类可堆叠
        if (item.type !== 'equipment') {
          const existing = s.tempBag.find((i) => i.id === item.id)
          if (existing) {
            set({ tempBag: s.tempBag.map((i) => (i.id === item.id ? { ...i, quantity: i.quantity + item.quantity } : i)) })
            return
          }
        }
        set({ tempBag: [...s.tempBag, item] })
      },

      transferTempBag: () => {
        const s = get()
        const count = s.tempBag.length
        if (count === 0) return 0
        let inventory = [...s.inventory]
        for (const item of s.tempBag) {
          if (item.type !== 'equipment') {
            const existing = inventory.find((i) => i.id === item.id)
            if (existing) {
              inventory = inventory.map((i) => (i.id === item.id ? { ...i, quantity: i.quantity + item.quantity } : i))
              continue
            }
          }
          inventory.push(item)
        }
        set({ tempBag: [], inventory })
        return count
      },

      addPlayerDiamonds: (amount) => {
        const s = get()
        if (!s.player) return
        const np = { ...s.player, diamonds: (s.player.diamonds || 0) + amount }
        const ns = { ...s.classSaves }
        if (s.activeClassId) ns[s.activeClassId] = { ...ns[s.activeClassId], player: np }
        set({ player: np, classSaves: ns })
      },

      craftStone: (recipe) => {
        const s = get()
        const recipes = {
          low: { from: 'enhance_shard', fromName: '强化石碎片', need: 10, to: 'enhance_stone_low', toName: '下级强化石' },
          mid: { from: 'enhance_stone_low', fromName: '下级强化石', need: 3, to: 'enhance_stone_mid', toName: '中级强化石' },
          high: { from: 'enhance_stone_mid', fromName: '中级强化石', need: 3, to: 'enhance_stone_high', toName: '上级强化石' },
        } as const
        const r = recipes[recipe]
        const have = s.inventory.filter((i) => i.id === r.from).reduce((n, i) => n + i.quantity, 0)
        if (have < r.need) return { success: false, message: `${r.fromName}不足（需要 ${r.need}，现有 ${have}）` }

        let left = r.need
        let newInv = s.inventory.map((i) => {
          if (i.id !== r.from || left <= 0) return i
          const take = Math.min(i.quantity, left)
          left -= take
          return { ...i, quantity: i.quantity - take }
        }).filter((i) => i.quantity > 0)

        const cat = getItemInfo(r.to)
        const existing = newInv.find((i) => i.id === r.to)
        if (existing) {
          newInv = newInv.map((i) => (i.id === r.to ? { ...i, quantity: i.quantity + 1 } : i))
        } else {
          newInv = [...newInv, {
            uid: `stone_${Date.now()}`, id: r.to, name: r.toName,
            type: 'material' as const, quality: (cat?.quality || 'fine') as Item['quality'],
            quantity: 1, desc: cat?.desc || r.toName, value: cat?.value,
          }]
        }
        set({ inventory: newInv })
        return { success: true, message: `合成成功：${r.toName} ×1` }
      },

      // ─── Dungeon ───
      setCurrentDungeon: (d) => set({ currentDungeon: d }),
      setCurrentRoomId: (id) => set({ currentRoomId: id }),
      setRoomInfo: (r) => set({ roomInfo: r }),
      setDungeonRooms: (r) => set({ dungeonRooms: r }),
      addExploredRoom: (id) => set((s) => ({ exploredRooms: new Set([...s.exploredRooms, id]) })),
      resetExploredRooms: () => set({ exploredRooms: new Set() }),

      // ─── Combat ───
      setInCombat: (v) => set({ inCombat: v }),
      setCombatEnemies: (e) => set({ combatEnemies: e }),
      addCombatLog: (log) => set((s) => ({ combatLogs: [...s.combatLogs, log] })),
      setCombatEnded: (v) => set({ combatEnded: v }),
      setCombatVictory: (v) => set({ combatVictory: v }),
      setPlayerStatuses: (s) => set({ playerStatuses: s }),
      resetCombat: () => set({ inCombat: false, combatEnemies: [], combatLogs: [], combatEnded: false, combatVictory: false, playerStatuses: [] }),
      resetDungeon: () => set({ currentDungeon: null, currentRoomId: 0, exploredRooms: new Set(), roomInfo: null, dungeonRooms: [] }),

      // Auto Explore
      setAutoExploring: (v) => set({ isAutoExploring: v }),
      addAutoLog: (log) => set((s) => ({ autoExploreLogs: [...s.autoExploreLogs.slice(-49), `[${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}] ${log}`] })),
      updateAutoStats: (stats) => set((s) => ({ autoExploreStats: { ...s.autoExploreStats, ...stats } })),
      clearAutoLogs: () => set({ autoExploreLogs: [] }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        isLoggedIn: state.isLoggedIn,
        playerName: state.playerName,
        classSaves: state.classSaves,
        activeClassId: state.activeClassId,
        lastClassSwitch: state.lastClassSwitch,
        switchCooldownMs: state.switchCooldownMs,
        inventory: state.inventory,        // SHARED — persisted once
        player: state.player,
        equipment: state.equipment,
        tempBag: state.tempBag,          // 未结算的探索战利品
        settings: state.settings,
        taskState: state.taskState,
        lawful: state.lawful,
        talents: state.talents,
        isAutoExploring: state.isAutoExploring,
        lawfulInBattle: state.lawfulInBattle,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.exploredRooms = new Set()
          state.combatLogs = []
          state.inCombat = false
          state.playerStatuses = []
          state.tempBag = state.tempBag || []
          state.lawful = state.lawful || { layer: 1, best: 0 }
          state.talents = state.talents || {}
          state.taskState = state.taskState || { ...DEFAULT_TASK_STATE, daily: { ...EMPTY_PROGRESS }, totals: { ...EMPTY_PROGRESS } }
          state.settings = { autoDisassemble: false, autoDisassembleMaxQuality: 'common', autoPotion: false, autoPotionThreshold: 50, ...(state.settings || {}) }
          if (!state.settings.autoDisassembleRules) {
            const th = QUALITY_RANK[state.settings.autoDisassembleMaxQuality] ?? 0
            state.settings.autoDisassembleRules = {
              ...DEFAULT_DISASSEMBLE_RULES,
              qualities: Object.keys(QUALITY_RANK).filter((q) => (QUALITY_RANK[q] ?? 0) <= th),
            }
          }
          state.combatEnemies = []
          state.combatEnded = false
          state.combatVictory = false
          state.isAutoExploring = state.isAutoExploring || false
          state.lawfulInBattle = state.lawfulInBattle || false
          state.autoExploreLogs = []
          // 旧存档迁移：没有技能的角色补发初始技能
          const fixSkills = (p: Player | null | undefined) => {
            if (p && p.skills.length === 0 && STARTER_SKILLS[p.classId]) {
              p.skills = [...STARTER_SKILLS[p.classId]]
            }
            if (p) {
              if (p.diamonds == null) p.diamonds = 0
              if (!p.tier || p.tier < 1) p.tier = 1
              if (!p.maxLayer || p.maxLayer < 1) p.maxLayer = 1
              // 体质/意志迁移：基础值 + (等级-1)×成长，并一次性补体质生命
              if (p.con == null || p.wil == null) {
                const base = DEFAULT_CLASS_STATS[p.classId] || DEFAULT_CLASS_STATS.warrior
                const g = CLASS_CON_WIL_GROWTH[p.classId] || { con: 1, wil: 1 }
                p.con = (base.con ?? 6) + (p.level - 1) * g.con
                p.wil = (base.wil ?? 6) + (p.level - 1) * g.wil
                const bonus = p.con * 8
                p.maxHp += bonus
                p.hp = Math.min(p.maxHp, p.hp + bonus)
              }
            }
          }
          fixSkills(state.player)
          Object.values(state.classSaves || {}).forEach((cs) => fixSkills(cs?.player))
          // 旧货币（铜币/银币/旧金币）折合金币
          const LEGACY: Record<string, number> = { coin_copper: 1, coin_silver: 10 }
          let goldFromLegacy = 0
          state.inventory = (state.inventory || []).filter((it) => {
            if (LEGACY[it.id]) { goldFromLegacy += it.quantity * LEGACY[it.id]; return false }
            if (it.id === 'coin_gold' && it.type === 'currency') { goldFromLegacy += it.quantity * 100; return false }
            return true
          })
          if (goldFromLegacy > 0 && state.player) {
            state.player.gold += goldFromLegacy
          }
        }
      },
    }
  )
)

// ─── Starter Items ───
function getStarterItems(classId: string): Item[] {
  const common: Item[] = [
    { uid: `hp_${Date.now()}_1`, id: 'hp_small', name: '小型生命药水', type: 'consumable', quality: 'common', quantity: 5, desc: '恢复 50 点 HP' },
    { uid: `hp_${Date.now()}_2`, id: 'mp_small', name: '小型法力药水', type: 'consumable', quality: 'common', quantity: 3, desc: '恢复 30 点 MP' },
    { uid: `scroll_${Date.now()}`, id: 'scroll_town', name: '回城卷轴', type: 'consumable', quality: 'fine', quantity: 1, desc: '返回城镇' },
  ]

  const weapons: Record<string, Item> = {
    warrior:  { uid: `w_${Date.now()}`, id: 'sword_trainee', name: '训练用剑', type: 'equipment', slot: 'weapon', quality: 'common', quantity: 1, desc: '新兵训练用的铁剑', stats: { atk: 3 } },
    mage:     { uid: `w_${Date.now()}`, id: 'wand_apprentice', name: '学徒法杖', type: 'equipment', slot: 'weapon', quality: 'common', quantity: 1, desc: '法师学徒的基础法杖', stats: { mag: 3 } },
    assassin: { uid: `w_${Date.now()}`, id: 'dagger_trainee', name: '训练匕首', type: 'equipment', slot: 'weapon', quality: 'common', quantity: 1, desc: '轻巧的训练匕首', stats: { atk: 3, agi: 1 } },
    ranger:   { uid: `w_${Date.now()}`, id: 'bow_trainee', name: '训练短弓', type: 'equipment', slot: 'weapon', quality: 'common', quantity: 1, desc: '基础训练短弓', stats: { atk: 2, agi: 1 } },
    priest:   { uid: `w_${Date.now()}`, id: 'mace_trainee', name: '祈祷之锤', type: 'equipment', slot: 'weapon', quality: 'common', quantity: 1, desc: '祭司训练用锤', stats: { atk: 1, mag: 2 } },
    warlock:  { uid: `w_${Date.now()}`, id: 'orb_trainee', name: '灵魂之球', type: 'equipment', slot: 'weapon', quality: 'common', quantity: 1, desc: '术士训练用法器', stats: { mag: 3 } },
  }

  return [...common, weapons[classId] || weapons.warrior]
}
