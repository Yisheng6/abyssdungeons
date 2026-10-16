import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router'
import { ArrowLeft, Package, Beaker, Shield, Swords, Heart, Wind, Star, Droplets, Sparkles, X, BookOpen, Hammer } from 'lucide-react'
import { useGameStore, type Item, getEffectiveStats, getItemDisplayName, getDisassembleGold } from '@/stores/gameStore'
import { loadCatalogs, onCatalogLoaded, getSetInfo, getSkillInfo } from '@/lib/catalog'

const qualityColors: Record<string, string> = {
  common: '#8B949E', fine: '#3FB950', rare: '#58A6FF', epic: '#A371F7', legendary: '#C9A84C', mythic: '#F85149',
}

const qualityNames: Record<string, string> = {
  common: '普通', fine: '精致', rare: '稀有', epic: '史诗', legendary: '传说', mythic: '神话',
}

const slotIcons: Record<string, React.ReactNode> = {
  weapon: <Swords size={14} />, helmet: <Shield size={14} />, armor: <Shield size={14} />,
  leggings: <Shield size={14} />, boots: <Wind size={14} />, necklace: <Star size={14} />,
  ring: <Sparkles size={14} />,
}

const slotNames: Record<string, string> = {
  weapon: '武器', helmet: '头盔', armor: '胸甲', leggings: '护腿', boots: '靴子', necklace: '项链', ring: '戒指',
}

const statNames: Record<string, string> = {
  hp: '生命值', mp: '法力值', atk: '攻击力', def: '防御力', mag: '魔法力', mdef: '魔防', agi: '敏捷', luk: '幸运', con: '体质', wil: '意志',
}

const typeNames: Record<string, string> = {
  equipment: '装备', consumable: '消耗品', material: '材料', skillbook: '技能书', currency: '货币',
}

const filters = ['全部', '装备', '消耗品', '材料', '技能书'] as const
const filterTypeMap: Record<string, string> = { '装备': 'equipment', '消耗品': 'consumable', '材料': 'material', '技能书': 'skillbook' }

export default function Inventory() {
  const navigate = useNavigate()
  const store = useGameStore()
  const [activeFilter, setActiveFilter] = useState<(typeof filters)[number]>('全部')
  const [showAdvFilter, setShowAdvFilter] = useState(false)
  const [fQualities, setFQualities] = useState<string[]>([])
  const [fSlots, setFSlots] = useState<string[]>([])
  const [fStats, setFStats] = useState<string[]>([])
  const [fSetTier, setFSetTier] = useState<number>(0) // 0=任意
  const [fEnhance, setFEnhance] = useState<number>(0) // 0=任意, 5=+5以上, 10=+10以上

  const toggleIn = (arr: string[], v: string, set: (a: string[]) => void) =>
    set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v])

  const advFilterCount = fQualities.length + fSlots.length + fStats.length + (fSetTier > 0 ? 1 : 0) + (fEnhance > 0 ? 1 : 0)
  const clearAdvFilter = () => { setFQualities([]); setFSlots([]); setFStats([]); setFSetTier(0); setFEnhance(0) }
  const [selectedItem, setSelectedItem] = useState<Item | null>(null)
  const [useMsg, setUseMsg] = useState('')

  // 加载目录（套装名、技能名解析）
  const [, setCatalogReady] = useState(false)
  useEffect(() => {
    loadCatalogs()
    return onCatalogLoaded(() => setCatalogReady(true))
  }, [])

  useEffect(() => {
    if (!useMsg) return
    const t = setTimeout(() => setUseMsg(''), 2500)
    return () => clearTimeout(t)
  }, [useMsg])

  const inventory = store.inventory
  const equipment = store.equipment

  const filtered = (activeFilter === '全部' ? inventory
    : inventory.filter((i) => i.type === filterTypeMap[activeFilter]))
    .filter((i) => {
      // 高级筛选仅作用于装备
      if (i.type !== 'equipment') return advFilterCount === 0
      if (fQualities.length > 0 && !fQualities.includes(i.quality)) return false
      if (fSlots.length > 0 && !fSlots.includes(i.slot || '')) return false
      if (fStats.length > 0) {
        const eff = getEffectiveStats(i)
        if (!fStats.every((s) => (eff[s] || 0) > 0)) return false
      }
      if (fSetTier > 0 && (i.setTier || 0) !== fSetTier) return false
      if (fEnhance > 0 && (i.enhanceLevel || 0) < fEnhance) return false
      return true
    })

  // Equipped items list
  const equippedItems = Object.entries(equipment)
    .filter(([, item]) => item !== null)
    .map(([slot, item]) => ({ slot, item: item! }))

  const handleEquip = (item: Item) => {
    if (item.type !== 'equipment') return
    store.equipItem(item.uid)
    setSelectedItem(null)
  }

  const handleUnequip = (slot: string) => {
    store.unequipItem(slot as keyof typeof equipment)
  }

  const handleUse = (item: Item) => {
    if (item.type === 'consumable') {
      const r = store.useConsumable(item.uid)
      setUseMsg(r.message)
      if (r.success) {
        setSelectedItem((prev) => {
          if (!prev) return prev
          const still = store.inventory.find((i) => i.uid === prev.uid)
          return still || null
        })
      }
    } else if (item.type === 'skillbook') {
      const r = store.learnSkillFromBook(item.uid)
      setUseMsg(r.message)
      if (r.success) setSelectedItem(null)
    }
  }

  return (
    <div className="flex min-h-screen flex-col" style={{ backgroundColor: 'var(--bg-primary)' }}>
      {/* Header */}
      <header className="flex h-12 items-center gap-3 border-b px-4" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-card)' }}>
        <button onClick={() => navigate('/')} style={{ color: 'var(--text-muted)' }}><ArrowLeft size={20} /></button>
        <span className="font-bold" style={{ color: 'var(--text-primary)' }}>背包</span>
        <span className="ml-auto text-xs" style={{ color: 'var(--text-muted)' }}>{inventory.length} / 40</span>
      </header>

      {useMsg && (
        <div className="px-4 py-2 text-center text-sm font-medium"
          style={{ backgroundColor: 'rgba(63,185,80,0.15)', color: '#3FB950' }}>
          {useMsg}
        </div>
      )}

      <div className="flex flex-1 flex-col lg:flex-row">
        {/* Main Area */}
        <div className="flex-1 p-4">
          {/* Filters */}
          <div className="mb-3 flex flex-wrap gap-2">
            {filters.map((f) => (
              <button key={f} onClick={() => setActiveFilter(f)}
                className="rounded-full px-3 py-1 text-xs font-medium transition-colors"
                style={{
                  backgroundColor: activeFilter === f ? 'var(--accent)' : 'var(--bg-hover)',
                  color: activeFilter === f ? 'var(--bg-primary)' : 'var(--text-secondary)',
                }}>{f}</button>
            ))}
            {activeFilter === '装备' && (
              <button onClick={() => setShowAdvFilter((v) => !v)}
                className="rounded-full px-3 py-1 text-xs font-medium transition-colors"
                style={{
                  backgroundColor: showAdvFilter || advFilterCount > 0 ? 'rgba(163,113,247,0.3)' : 'var(--bg-hover)',
                  color: showAdvFilter || advFilterCount > 0 ? '#A371F7' : 'var(--text-secondary)',
                  border: advFilterCount > 0 ? '1px solid #A371F7' : '1px solid transparent',
                }}>
                筛选{advFilterCount > 0 ? ` (${advFilterCount})` : ''}
              </button>
            )}
          </div>

          {/* Advanced Filter Panel（仅装备页签） */}
          {activeFilter === '装备' && showAdvFilter && (
            <div className="mb-3 rounded-lg p-3" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)' }}>
              {([
                ['品质', Object.entries(qualityNames), fQualities, setFQualities, qualityColors] as const,
                ['部位', Object.entries(slotNames), fSlots, setFSlots, null] as const,
                ['词条属性', Object.entries(statNames), fStats, setFStats, null] as const,
              ]).map(([title, entries, sel, setSel, colors]) => (
                <div key={title as string} className="mb-2">
                  <div className="mb-1 text-[10px] font-bold" style={{ color: 'var(--text-muted)' }}>{title as string}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {(entries as [string, string][]).map(([code, label]) => {
                      const on = (sel as string[]).includes(code)
                      const c = colors ? (colors as Record<string, string>)[code] : '#A371F7'
                      return (
                        <button key={code}
                          onClick={() => toggleIn(sel as string[], code, setSel as (a: string[]) => void)}
                          className="rounded-full px-2.5 py-0.5 text-[10px] transition-colors"
                          style={{
                            backgroundColor: on ? 'rgba(163,113,247,0.25)' : 'var(--bg-hover)',
                            color: on ? c : 'var(--text-muted)',
                            border: on ? `1px solid ${c}` : '1px solid transparent',
                          }}>{label}</button>
                      )
                    })}
                  </div>
                </div>
              ))}
              <div className="mb-2 flex flex-wrap gap-4">
                <div>
                  <div className="mb-1 text-[10px] font-bold" style={{ color: 'var(--text-muted)' }}>套装阶级</div>
                  <div className="flex gap-1.5">
                    {[[0, '任意'], [1, '1阶'], [2, '2阶'], [3, '3阶']].map(([v, label]) => (
                      <button key={v} onClick={() => setFSetTier(v as number)}
                        className="rounded-full px-2.5 py-0.5 text-[10px]"
                        style={{
                          backgroundColor: fSetTier === v ? 'rgba(163,113,247,0.25)' : 'var(--bg-hover)',
                          color: fSetTier === v ? '#A371F7' : 'var(--text-muted)',
                        }}>{label}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="mb-1 text-[10px] font-bold" style={{ color: 'var(--text-muted)' }}>强化等级</div>
                  <div className="flex gap-1.5">
                    {[[0, '任意'], [5, '+5以上'], [10, '+10以上']].map(([v, label]) => (
                      <button key={v} onClick={() => setFEnhance(v as number)}
                        className="rounded-full px-2.5 py-0.5 text-[10px]"
                        style={{
                          backgroundColor: fEnhance === v ? 'rgba(163,113,247,0.25)' : 'var(--bg-hover)',
                          color: fEnhance === v ? '#A371F7' : 'var(--text-muted)',
                        }}>{label}</button>
                    ))}
                  </div>
                </div>
              </div>
              {advFilterCount > 0 && (
                <button onClick={clearAdvFilter} className="text-[10px] underline" style={{ color: 'var(--text-muted)' }}>
                  清空筛选
                </button>
              )}
            </div>
          )}

          {/* Equipped Section */}
          {equippedItems.length > 0 && (
            <div className="mb-4">
              <div className="mb-2 text-xs font-bold" style={{ color: 'var(--accent)' }}>已装备</div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {equippedItems.map(({ slot, item }) => (
                  <div key={slot} className="game-card flex items-center gap-2 p-2">
                    <div style={{ color: qualityColors[item.quality] }}>{slotIcons[item.slot || 'weapon']}</div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-bold" style={{ color: qualityColors[item.quality] }}>{getItemDisplayName(item)}</div>
                      <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                        {slotNames[slot]}
                        {item.setId && getSetInfo(item.setId) ? ` · ${getSetInfo(item.setId)!.name}` : ''}
                      </div>
                    </div>
                    <button onClick={() => handleUnequip(slot)} className="ml-1" style={{ color: 'var(--danger)' }}>
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Inventory Grid */}
          <div className="mb-2 text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>背包物品</div>
          {filtered.length === 0 ? (
            <div className="rounded-lg p-8 text-center text-sm" style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-muted)' }}>
              背包空空如也
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
              {filtered.map((item) => {
                const IconComp = item.type === 'equipment' ? Swords
                  : item.type === 'skillbook' ? BookOpen
                  : item.type === 'material' ? Hammer
                  : item.id.includes('hp') ? Heart
                  : item.id.includes('mp') ? Droplets
                  : item.type === 'consumable' ? Beaker
                  : Package
                return (
                  <button key={item.uid} onClick={() => setSelectedItem(item)}
                    className="game-card relative flex flex-col items-center justify-center p-2 transition-all hover:scale-[1.05]"
                    style={{ borderColor: selectedItem?.uid === item.uid ? qualityColors[item.quality] : 'var(--border-color)' }}>
                    <IconComp size={22} style={{ color: qualityColors[item.quality] }} />
                    <span className="mt-1 truncate text-[10px]" style={{ color: qualityColors[item.quality], maxWidth: '100%' }}>{getItemDisplayName(item)}</span>
                    {item.quantity > 1 && (
                      <span className="absolute bottom-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold"
                        style={{ backgroundColor: 'var(--accent)', color: 'var(--bg-primary)' }}>
                        {item.quantity}
                      </span>
                    )}
                    {item.type === 'equipment' && item.stats && (
                      <div className="absolute left-1 top-1 h-1.5 w-1.5 rounded-full" style={{ backgroundColor: '#3FB950' }} />
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Detail Panel */}
        {selectedItem && (
          <div className="w-full border-t p-4 lg:w-[320px] lg:border-l lg:border-t-0" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-card)' }}>
            <h3 className="text-lg font-bold" style={{ color: qualityColors[selectedItem.quality] }}>{getItemDisplayName(selectedItem)}</h3>
            <div className="mb-2 flex flex-wrap gap-2">
              <span className="rounded px-1.5 py-0.5 text-[10px] font-medium" style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-muted)' }}>
                {typeNames[selectedItem.type] || selectedItem.type}
              </span>
              <span className="rounded px-1.5 py-0.5 text-[10px] font-medium" style={{ backgroundColor: 'var(--bg-hover)', color: qualityColors[selectedItem.quality] }}>
                {qualityNames[selectedItem.quality]}
              </span>
              {selectedItem.setId && getSetInfo(selectedItem.setId) && (
                <span className="rounded px-1.5 py-0.5 text-[10px] font-medium" style={{ backgroundColor: 'rgba(201,168,76,0.15)', color: '#C9A84C' }}>
                  {getSetInfo(selectedItem.setId)!.name}
                </span>
              )}
            </div>
            {selectedItem.slot && (
              <div className="mb-2 text-xs" style={{ color: 'var(--text-muted)' }}>部位: {slotNames[selectedItem.slot] || selectedItem.slot}</div>
            )}
            <p className="mb-3 text-sm" style={{ color: 'var(--text-secondary)' }}>{selectedItem.desc}</p>
            {selectedItem.type === 'equipment' && (() => {
              const eff = getEffectiveStats(selectedItem)
              const affixes = selectedItem.affixes || {}
              const mainStats = Object.entries(eff).filter(([s]) => !(s in affixes))
              const affixStats = Object.entries(affixes).map(([s, v]) => {
                const lv = selectedItem.enhanceLevel || 0
                return [s, v + (lv > 0 ? Math.ceil(v * 0.1 * lv) : 0)] as const
              })
              return (
                <>
                  {mainStats.map(([stat, val]) => (
                    <div key={stat} className="mb-1 text-sm" style={{ color: '#3FB950' }}>
                      {statNames[stat] || stat} +{val}
                    </div>
                  ))}
                  {affixStats.length > 0 && (
                    <div className="mt-2 border-t pt-2" style={{ borderColor: 'var(--border-color)' }}>
                      <div className="mb-1 text-[10px] font-bold" style={{ color: 'var(--text-muted)' }}>随机词条</div>
                      {affixStats.map(([stat, val]) => (
                        <div key={stat} className="mb-1 text-sm" style={{ color: '#79C0FF' }}>
                          {statNames[stat] || stat} +{val}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )
            })()}
            {selectedItem.type === 'skillbook' && selectedItem.learnSkillId && (
              <div className="mb-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                可学习：{getSkillInfo(selectedItem.learnSkillId)?.name || selectedItem.learnSkillId}
              </div>
            )}
            {selectedItem.value !== undefined && (
              <div className="mb-2 text-xs" style={{ color: '#C9A84C' }}>价值: {selectedItem.value} 金币</div>
            )}
            {/* 套装加成说明 */}
            {selectedItem.setId && getSetInfo(selectedItem.setId) && (
              <div className="mb-3 rounded p-2 text-xs" style={{ backgroundColor: 'var(--bg-hover)' }}>
                <div className="mb-1 font-bold" style={{ color: '#C9A84C' }}>{getSetInfo(selectedItem.setId)!.name} 套装效果</div>
                {getSetInfo(selectedItem.setId)!.bonus.map((b) => (
                  <div key={b.pieces} style={{ color: 'var(--text-muted)' }}>
                    {b.pieces}件：{Object.entries(b.stats).map(([k, v]) => `${statNames[k] || k}+${v}`).join('、')}
                  </div>
                ))}
              </div>
            )}
            <div className="mt-4 flex gap-2">
              {selectedItem.type === 'equipment' && (
                <button onClick={() => handleEquip(selectedItem)} className="game-btn-primary flex-1 text-xs">装备</button>
              )}
              {selectedItem.type === 'equipment' && (
                <button onClick={() => {
                  const r = store.disassembleItem(selectedItem.uid)
                  setUseMsg(r.message)
                  if (r.success) setSelectedItem(null)
                }} className="game-btn-secondary flex-1 text-xs"
                  style={{ borderColor: '#C9A84C', color: '#C9A84C' }}>
                  分解（+{getDisassembleGold(selectedItem)} 金币）
                </button>
              )}
              {selectedItem.type === 'consumable' && (
                <button onClick={() => handleUse(selectedItem)} className="game-btn-primary flex-1 text-xs">使用</button>
              )}
              {selectedItem.type === 'skillbook' && (
                <button onClick={() => handleUse(selectedItem)} className="game-btn-primary flex-1 text-xs">学习</button>
              )}
              <button onClick={() => { store.removeItem(selectedItem.uid); setSelectedItem(null); }} className="game-btn-secondary text-xs" style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}>丢弃</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
