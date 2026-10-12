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

let items: CatalogItem[] = []
let itemById = new Map<string, CatalogItem>()
let sets: CatalogSet[] = []
let setById = new Map<string, CatalogSet>()
let skills: CatalogSkill[] = []
let skillById = new Map<string, CatalogSkill>()
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
    const [itemsData, setsData, skillsData] = await Promise.all([
      trpcGet('game.getItemCatalog'),
      trpcGet('game.getEquipmentSets'),
      trpcGet('game.getSkillCatalog'),
    ])
    items = (itemsData as CatalogItem[]) || []
    itemById = new Map(items.map((i) => [i.id, i]))
    sets = (setsData as CatalogSet[]) || []
    setById = new Map(sets.map((s) => [s.id, s]))
    skills = (skillsData as CatalogSkill[]) || []
    skillById = new Map(skills.map((s) => [s.id, s]))
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
