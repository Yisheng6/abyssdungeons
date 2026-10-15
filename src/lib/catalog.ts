// ═══ 游戏目录缓存库：总物品表 / 套装 / 技能表 ═══
// 从服务器拉取一次后缓存，全应用同步读取（掉落解析、套装加成、技能学习等）

export interface CatalogItem {
  id: string; name: string
  type: 'equipment' | 'consumable' | 'material' | 'currency' | 'skillbook'
  slot?: 'weapon' | 'helmet' | 'armor' | 'leggings' | 'boots' | 'necklace' | 'ring'
  classId?: string
  setId?: string; setTier?: number
  quality: 'common' | 'fine' | 'rare' | 'epic' | 'legendary' | 'mythic'
  stats?: Record<string, number>
  effect?: Record<string, unknown>
  desc?: string; value?: number; stackSize?: number
  learnSkillId?: string
}

export interface CatalogSet {
  id: string; name: string; classId: string; tier: number
  pieces: string[]
  bonus: Array<{ pieces: number; stats: Record<string, number> }>
}

export interface CatalogSkill {
  id: string; name: string; classId: string; type: string
  element: string; mpCost: number; cooldown: number
  description: string
  learnable: boolean; learnLevel: number | null; learnCost: number | null
}

export interface CatalogClass {
  id: string; name: string; role: string; difficulty: string
  description: string; baseStats: Record<string, number>
  tiers: string[]
}

export interface TierRules {
  maxTier: number
  levelReq: number[]
  layerReq: number[]
  goldCost: number[]
  materialReq: Array<{ id: string; name: string; count: number } | null>
  rewards: Array<Record<string, number> | null>
}

let items: CatalogItem[] = []
let itemById = new Map<string, CatalogItem>()
let sets: CatalogSet[] = []
let setById = new Map<string, CatalogSet>()
let skills: CatalogSkill[] = []
let skillById = new Map<string, CatalogSkill>()
let classes: CatalogClass[] = []
let classById = new Map<string, CatalogClass>()
let tierRules: TierRules | null = null
let loaded = false
let loading: Promise<void> | null = null
const listeners = new Set<() => void>()

async function trpcGet(path: string): Promise<unknown> {
  const res = await fetch(`/api/trpc/${path}`, { credentials: 'include' })
  if (!res.ok) throw new Error(`catalog fetch ${path} failed: ${res.status}`)
  const data = await res.json()
  return data?.result?.data?.json ?? data?.result?.data
}

/** 拉取全部目录（幂等，可重复调用） */
export function loadCatalogs(): Promise<void> {
  if (loaded) return Promise.resolve()
  if (loading) return loading
  loading = (async () => {
    const [itemsData, setsData, skillsData, classesData, rulesData] = await Promise.all([
      trpcGet('game.getItemCatalog'),
      trpcGet('game.getEquipmentSets'),
      trpcGet('game.getSkillCatalog'),
      trpcGet('game.getClasses'),
      trpcGet('game.getTierRules'),
    ])
    items = (itemsData as CatalogItem[]) || []
    itemById = new Map(items.map((i) => [i.id, i]))
    sets = (setsData as CatalogSet[]) || []
    setById = new Map(sets.map((s) => [s.id, s]))
    skills = (skillsData as CatalogSkill[]) || []
    skillById = new Map(skills.map((s) => [s.id, s]))
    classes = (classesData as CatalogClass[]) || []
    classById = new Map(classes.map((c) => [c.id, c]))
    tierRules = (rulesData as TierRules) || null
    loaded = true
    listeners.forEach((fn) => fn())
  })().catch((e) => {
    console.error('[catalog] 加载失败', e)
  }).finally(() => {
    loading = null
  })
  return loading
}

/** 订阅目录加载完成事件（用于触发组件刷新），返回取消函数 */
export function onCatalogLoaded(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export const catalogsLoaded = () => loaded
export const getItemInfo = (id: string) => itemById.get(id)
export const getSetInfo = (id: string) => setById.get(id)
export const getSkillInfo = (id: string) => skillById.get(id)
export const getSkillName = (id: string) => skillById.get(id)?.name ?? id
export const getSkillMpCost = (id: string, fallback = 10) => skillById.get(id)?.mpCost ?? fallback
export const getLearnableSkills = (classId: string) =>
  skills.filter((s) => s.classId === classId && s.learnable)
export const getClassSkills = (classId: string) =>
  skills.filter((s) => s.classId === classId)

/** 计算一套装备当前激活的套装加成 */
export function computeSetBonuses(
  equipped: Array<{ setId?: string } | null>
): Record<string, number> {
  const counts = new Map<string, number>()
  for (const item of equipped) {
    if (item?.setId) counts.set(item.setId, (counts.get(item.setId) || 0) + 1)
  }
  const total: Record<string, number> = {}
  for (const [setId, count] of counts) {
    const set = setById.get(setId)
    if (!set) continue
    for (const b of set.bonus) {
      if (count >= b.pieces) {
        for (const [stat, val] of Object.entries(b.stats)) {
          total[stat] = (total[stat] || 0) + val
        }
      }
    }
  }
  return total
}

// ═══ 职业等阶 ═══
export const getTierRules = () => tierRules
export const getClassInfo = (id: string) => classById.get(id)
/** 某职业某阶称号（1 起）；目录未加载时回退到静态表 */
export function getTierName(classId: string, tier: number): string {
  const list = classById.get(classId)?.tiers
  if (list && list.length > 0) return list[Math.min(Math.max(tier, 1), list.length) - 1]
  return FALLBACK_TIER_NAMES[classId]?.[Math.min(Math.max(tier, 1), 9) - 1] ?? `等阶${tier}`
}

/** 静态等阶名兜底（目录未加载 / 离线时使用） */
export const FALLBACK_TIER_NAMES: Record<string, string[]> = {
  warrior: ['战徒', '武者', '战士', '大战士', '战尊', '战王', '战帝', '圣战者', '战神'],
  mage: ['魔法侍从', '魔法学徒', '魔法师', '大魔法师', '魔导士', '大魔导士', '大魔导师', '圣魔导师', '法神'],
  assassin: ['潜徒', '潜行者', '刺客', '大刺客', '影刺', '王刺', '帝刺', '圣影刺客', '暗影主宰'],
  ranger: ['巡猎学徒', '巡猎者', '游侠', '大游侠', '风狩猎手', '辉耀箭师', '圣殿猎尊', '圣羽射手', '万猎之主'],
  priest: ['侍僧', '神官', '祭祀', '大祭祀', '主教', '大主教', '红衣主教', '枢机主教', '圣者'],
  warlock: ['暗影侍徒', '咒术学徒', '术士', '大术士', '咒魔导士', '灾厄大魔导', '魂引师', '暗影圣者', '万咒之主'],
}
