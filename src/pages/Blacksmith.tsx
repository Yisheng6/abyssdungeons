import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router'
import { ArrowLeft, Hammer, Sparkles, Recycle, FlaskConical, Shield, Star, RefreshCw, Gem } from 'lucide-react'
import {
  useGameStore, type Item,
  getEffectiveStats, getItemDisplayName, getEnhanceCost, getDisassembleGold,
  ENHANCE_MAX_LEVEL, ENHANCE_SUCCESS_RATES, STAT_NAMES, PCT_AFFIX_KEYS, getSocketCount,
} from '@/stores/gameStore'
import { loadCatalogs, getItemInfo } from '@/lib/catalog'
import { getReforgeGoldCost, REFORGE_DIAMOND_COST, QUALITY_MAX_AFFIXES } from '@/lib/affixes'

const qualityColors: Record<string, string> = {
  common: '#8B949E', fine: '#3FB950', rare: '#58A6FF', epic: '#A371F7', legendary: '#C9A84C', mythic: '#F85149',
}

const statNames: Record<string, string> = {
  hp: '生命', mp: '法力', atk: '攻击', def: '防御', mag: '魔法', mdef: '魔防', agi: '敏捷', luk: '幸运',
}

type Tab = 'enhance' | 'reforge' | 'socket' | 'disassemble' | 'craft'

export default function Blacksmith() {
  const navigate = useNavigate()
  const store = useGameStore()
  const [tab, setTab] = useState<Tab>('enhance')
  const [selectedUid, setSelectedUid] = useState<string | null>(null)
  const [useProtect, setUseProtect] = useState(false)
  const [useLucky, setUseLucky] = useState(false)
  const [msg, setMsg] = useState('')
  const [msgOk, setMsgOk] = useState(true)

  useEffect(() => { loadCatalogs() }, [])

  useEffect(() => {
    if (!msg) return
    const t = setTimeout(() => setMsg(''), 4000)
    return () => clearTimeout(t)
  }, [msg])

  const player = store.player
  const inventory = store.inventory

  // 所有可强化的装备：已装备 + 背包内
  const equippedList = Object.entries(store.equipment)
    .filter(([, item]) => item !== null)
    .map(([slot, item]) => ({ item: item as Item, equipped: true, slot }))
  const bagEquipment = inventory
    .filter((i) => i.type === 'equipment')
    .map((item) => ({ item, equipped: false, slot: '' }))
  const allEquipment = [...equippedList, ...bagEquipment]

  const selected = allEquipment.find((e) => e.item.uid === selectedUid) || null
  const selectedLevel = selected?.item.enhanceLevel || 0
  const cost = selected ? getEnhanceCost(selectedLevel) : null
  const goldCost = selected ? Math.max(10, Math.floor((selected.item.value || 50) * (selectedLevel + 1) * 0.5)) : 0
  const successRate = selected && selectedLevel < ENHANCE_MAX_LEVEL
    ? Math.min(100, ENHANCE_SUCCESS_RATES[selectedLevel] + (useLucky ? 15 : 0))
    : 0

  const shardCount = store.countItemById('enhance_shard')
  const lowCount = store.countItemById('enhance_stone_low')
  const midCount = store.countItemById('enhance_stone_mid')
  const highCount = store.countItemById('enhance_stone_high')
  const protectCount = store.countItemById('enhance_protect')
  const luckyCount = store.countItemById('enhance_lucky')

  const stoneHave = cost ? store.countItemById(cost.stoneId) : 0

  const doEnhance = () => {
    if (!selected) return
    const r = store.enhanceItem(selected.item.uid, { useProtect, useLucky })
    setMsg(r.message)
    setMsgOk(r.success)
  }

  const doReforge = (useDiamond: boolean) => {
    if (!selected) return
    const r = store.reforgeAffixes(selected.item.uid, useDiamond)
    setMsg(r.message)
    setMsgOk(r.success)
  }

  const doSocket = (gemUid: string) => {
    if (!selected) return
    const r = store.socketGem(selected.item.uid, gemUid)
    setMsg(r.message)
    setMsgOk(r.success)
  }

  const doUnsocket = (gemIndex: number) => {
    if (!selected) return
    const r = store.unsocketGem(selected.item.uid, gemIndex)
    setMsg(r.message)
    setMsgOk(r.success)
  }

  // 背包中的可镶嵌宝石
  const bagGems = inventory.filter((i) => getItemInfo(i.id)?.gem)

  const doDisassemble = (item: Item) => {
    const r = store.disassembleItem(item.uid)
    setMsg(r.message)
    setMsgOk(r.success)
  }

  const doCraft = (recipe: 'low' | 'mid' | 'high') => {
    const r = store.craftStone(recipe)
    setMsg(r.message)
    setMsgOk(r.success)
  }

  const nextStats = selected && selectedLevel < ENHANCE_MAX_LEVEL
    ? getEffectiveStats({ ...selected.item, enhanceLevel: selectedLevel + 1 })
    : null
  const curStats = selected ? getEffectiveStats(selected.item) : null

  const recipes = [
    { id: 'low' as const, name: '下级强化石', need: '强化石碎片 ×10', have: shardCount, needN: 10, color: qualityColors.fine },
    { id: 'mid' as const, name: '中级强化石', need: '下级强化石 ×3', have: lowCount, needN: 3, color: qualityColors.rare },
    { id: 'high' as const, name: '上级强化石', need: '中级强化石 ×3', have: midCount, needN: 3, color: qualityColors.epic },
  ]

  return (
    <div className="flex min-h-screen flex-col" style={{ backgroundColor: 'var(--bg-primary)' }}>
      {msg && (
        <div className="px-4 py-2 text-center text-sm font-medium"
          style={{
            backgroundColor: msgOk ? 'rgba(63,185,80,0.15)' : 'rgba(248,81,73,0.15)',
            color: msgOk ? '#3FB950' : '#F85149',
          }}>
          {msg}
        </div>
      )}

      {/* 材料栏 */}
      <div className="flex flex-wrap gap-2 border-b px-4 py-2 text-xs" style={{ borderColor: 'var(--border-color)', color: 'var(--text-muted)' }}>
        <span>碎片 <b style={{ color: 'var(--text-primary)' }}>{shardCount}</b></span>
        <span style={{ color: qualityColors.fine }}>下级石 <b>{lowCount}</b></span>
        <span style={{ color: qualityColors.rare }}>中级石 <b>{midCount}</b></span>
        <span style={{ color: qualityColors.epic }}>上级石 <b>{highCount}</b></span>
        <span style={{ color: qualityColors.rare }}>保护符 <b>{protectCount}</b></span>
        <span style={{ color: qualityColors.epic }}>幸运石 <b>{luckyCount}</b></span>
      </div>

      {/* Tabs */}
      <div className="flex border-b" style={{ borderColor: 'var(--border-color)' }}>
        {([['enhance', '装备强化', Sparkles], ['reforge', '词条重铸', RefreshCw], ['socket', '宝石镶嵌', Gem], ['disassemble', '装备分解', Recycle], ['craft', '材料合成', FlaskConical]] as const).map(([id, label, Icon]) => (
          <button key={id} onClick={() => setTab(id)}
            className="flex items-center gap-1 px-4 pb-2 pt-2 text-sm font-medium"
            style={{ color: tab === id ? 'var(--accent)' : 'var(--text-muted)', borderBottom: tab === id ? '2px solid var(--accent)' : '2px solid transparent' }}>
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      <div className="flex flex-1 flex-col lg:flex-row">
        {/* ═══ 强化 ═══ */}
        {tab === 'enhance' && (
          <>
            <div className="flex-1 p-4">
              {allEquipment.length === 0 ? (
                <div className="rounded-lg p-8 text-center text-sm" style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-muted)' }}>
                  还没有装备，去地牢刷一些吧
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                  {allEquipment.map(({ item, equipped }) => (
                    <button key={item.uid} onClick={() => setSelectedUid(item.uid)}
                      className="game-card relative p-2 text-left transition-all hover:scale-[1.02]"
                      style={{ borderColor: selectedUid === item.uid ? qualityColors[item.quality] : 'var(--border-color)' }}>
                      {equipped && (
                        <span className="absolute right-1 top-1 rounded px-1 text-[9px] font-bold" style={{ backgroundColor: 'var(--accent)', color: 'var(--bg-primary)' }}>已装备</span>
                      )}
                      <div className="text-xs font-bold" style={{ color: qualityColors[item.quality] }}>{getItemDisplayName(item)}</div>
                      <div className="mt-1 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                        {Object.entries(getEffectiveStats(item)).map(([k, v]) => `${statNames[k] || k}+${v}`).join(' ')}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* 强化面板 */}
            {selected && (
              <div className="w-full border-t p-4 lg:w-[320px] lg:border-l lg:border-t-0" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-card)' }}>
                <h3 className="text-lg font-bold" style={{ color: qualityColors[selected.item.quality] }}>
                  {getItemDisplayName(selected.item)}
                </h3>
                {selectedLevel >= ENHANCE_MAX_LEVEL ? (
                  <div className="mt-3 text-sm" style={{ color: '#C9A84C' }}>已达最高强化等级 +{ENHANCE_MAX_LEVEL}</div>
                ) : (
                  <>
                    <div className="mt-3 space-y-1 text-xs">
                      <div className="flex justify-between" style={{ color: 'var(--text-muted)' }}>
                        <span>成功率</span>
                        <span style={{ color: successRate >= 80 ? '#3FB950' : successRate >= 50 ? '#C9A84C' : '#F85149' }}>{successRate}%</span>
                      </div>
                      <div className="flex justify-between" style={{ color: 'var(--text-muted)' }}>
                        <span>{cost!.stoneName}</span>
                        <span style={{ color: stoneHave >= cost!.count ? '#3FB950' : '#F85149' }}>{stoneHave}/{cost!.count}</span>
                      </div>
                      <div className="flex justify-between" style={{ color: 'var(--text-muted)' }}>
                        <span>金币</span>
                        <span style={{ color: (player?.gold ?? 0) >= goldCost ? '#3FB950' : '#F85149' }}>{player?.gold ?? 0}/{goldCost}</span>
                      </div>
                    </div>

                    {/* 属性对比 */}
                    {curStats && nextStats && (
                      <div className="mt-3 rounded p-2 text-xs" style={{ backgroundColor: 'var(--bg-hover)' }}>
                        <div className="mb-1 font-bold" style={{ color: 'var(--text-secondary)' }}>+{selectedLevel} → +{selectedLevel + 1}</div>
                        {Object.keys(nextStats).map((k) => (
                          <div key={k} className="flex justify-between" style={{ color: 'var(--text-muted)' }}>
                            <span>{statNames[k] || k}</span>
                            <span>
                              {curStats[k] || 0} → <b style={{ color: '#3FB950' }}>{nextStats[k]}</b>
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* 失败惩罚说明 */}
                    <div className="mt-2 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                      {selectedLevel >= 10 ? '失败降 2 级' : selectedLevel >= 5 ? '失败降 1 级' : '失败不掉级'}
                    </div>

                    {/* 辅助道具 */}
                    <div className="mt-3 space-y-2 text-xs">
                      <label className="flex items-center gap-2" style={{ color: protectCount > 0 ? 'var(--text-secondary)' : 'var(--text-muted)' }}>
                        <input type="checkbox" checked={useProtect} onChange={(e) => setUseProtect(e.target.checked)} disabled={protectCount === 0} />
                        <Shield size={12} /> 使用保护符（剩 {protectCount}）失败不掉级
                      </label>
                      <label className="flex items-center gap-2" style={{ color: luckyCount > 0 ? 'var(--text-secondary)' : 'var(--text-muted)' }}>
                        <input type="checkbox" checked={useLucky} onChange={(e) => setUseLucky(e.target.checked)} disabled={luckyCount === 0} />
                        <Star size={12} /> 使用幸运石（剩 {luckyCount}）成功率 +15%
                      </label>
                    </div>

                    <button onClick={doEnhance} className="game-btn-primary mt-4 w-full">
                      <Sparkles size={14} className="mr-1 inline" /> 强化
                    </button>
                  </>
                )}
              </div>
            )}
          </>
        )}

        {/* ═══ 词条重铸 ═══ */}
        {tab === 'reforge' && (
          <>
            <div className="flex-1 p-4">
              <div className="mb-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                重铸装备的副词条（主属性与强化等级不变）。金币重铸词条数量随机；钻石重铸必出满词条且数值偏高。
              </div>
              {allEquipment.length === 0 ? (
                <div className="rounded-lg p-8 text-center text-sm" style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-muted)' }}>
                  还没有装备，去地牢刷一些吧
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                  {allEquipment.map(({ item, equipped }) => (
                    <button key={item.uid} onClick={() => setSelectedUid(item.uid)}
                      className="game-card relative p-2 text-left transition-all hover:scale-[1.02]"
                      style={{ borderColor: selectedUid === item.uid ? qualityColors[item.quality] : 'var(--border-color)' }}>
                      {equipped && (
                        <span className="absolute right-1 top-1 rounded px-1 text-[9px] font-bold" style={{ backgroundColor: 'var(--accent)', color: 'var(--bg-primary)' }}>已装备</span>
                      )}
                      <div className="text-xs font-bold" style={{ color: qualityColors[item.quality] }}>{getItemDisplayName(item)}</div>
                      <div className="mt-1 text-[10px]" style={{ color: '#3FB950' }}>
                        {item.affixes && Object.keys(item.affixes).length > 0
                          ? Object.entries(item.affixes).map(([k, v]) => `${STAT_NAMES[k] || k}+${v}${PCT_AFFIX_KEYS.has(k) ? '%' : ''}`).join(' ')
                          : '无副词条'}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* 重铸面板 */}
            {selected && (
              <div className="w-full border-t p-4 lg:w-[320px] lg:border-l lg:border-t-0" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-card)' }}>
                <h3 className="text-lg font-bold" style={{ color: qualityColors[selected.item.quality] }}>
                  {getItemDisplayName(selected.item)}
                </h3>
                {(QUALITY_MAX_AFFIXES[selected.item.quality] ?? 0) <= 0 ? (
                  <div className="mt-3 text-sm" style={{ color: 'var(--text-muted)' }}>普通品质没有副词条，无法重铸</div>
                ) : (
                  <>
                    <div className="mt-3 rounded p-2 text-xs" style={{ backgroundColor: 'var(--bg-hover)' }}>
                      <div className="mb-1 font-bold" style={{ color: 'var(--text-secondary)' }}>
                        当前词条（上限 {QUALITY_MAX_AFFIXES[selected.item.quality]} 条）
                      </div>
                      {selected.item.affixes && Object.keys(selected.item.affixes).length > 0 ? (
                        Object.entries(selected.item.affixes).map(([k, v]) => (
                          <div key={k} className="flex justify-between" style={{ color: 'var(--text-muted)' }}>
                            <span>{STAT_NAMES[k] || k}</span>
                            <span style={{ color: '#3FB950' }}>+{v}{PCT_AFFIX_KEYS.has(k) ? '%' : ''}</span>
                          </div>
                        ))
                      ) : (
                        <div style={{ color: 'var(--text-muted)' }}>无副词条</div>
                      )}
                    </div>

                    <div className="mt-3 space-y-1 text-xs">
                      <div className="flex justify-between" style={{ color: 'var(--text-muted)' }}>
                        <span>金币重铸</span>
                        <span style={{ color: (player?.gold ?? 0) >= getReforgeGoldCost(selected.item.setTier || 1, selected.item.quality) ? '#3FB950' : '#F85149' }}>
                          金币 ×{getReforgeGoldCost(selected.item.setTier || 1, selected.item.quality)}
                        </span>
                      </div>
                      <div className="flex justify-between" style={{ color: 'var(--text-muted)' }}>
                        <span>钻石重铸（满词条·高值）</span>
                        <span style={{ color: (player?.diamonds ?? 0) >= REFORGE_DIAMOND_COST ? '#58A6FF' : '#F85149' }}>
                          <Gem size={10} className="mr-1 inline" />×{REFORGE_DIAMOND_COST}
                        </span>
                      </div>
                    </div>

                    <button onClick={() => doReforge(false)} className="game-btn-primary mt-4 w-full">
                      <RefreshCw size={14} className="mr-1 inline" /> 金币重铸
                    </button>
                    <button onClick={() => doReforge(true)}
                      className="mt-2 w-full rounded px-3 py-2 text-sm font-bold"
                      style={{ backgroundColor: 'rgba(88,166,255,0.15)', color: '#58A6FF', border: '1px solid rgba(88,166,255,0.4)' }}>
                      <Gem size={14} className="mr-1 inline" /> 钻石重铸
                    </button>
                  </>
                )}
              </div>
            )}
          </>
        )}

        {/* ═══ 宝石镶嵌 ═══ */}
        {tab === 'socket' && (
          <>
            <div className="flex-1 p-4">
              <div className="mb-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                孔位数由品质决定：精良/稀有 1 孔，史诗/传说 2 孔，神话 3 孔。拆卸宝石会返还背包。
              </div>
              {allEquipment.length === 0 ? (
                <div className="rounded-lg p-8 text-center text-sm" style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-muted)' }}>
                  还没有装备，去地牢刷一些吧
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                  {allEquipment.map(({ item, equipped }) => (
                    <button key={item.uid} onClick={() => setSelectedUid(item.uid)}
                      className="game-card relative p-2 text-left transition-all hover:scale-[1.02]"
                      style={{ borderColor: selectedUid === item.uid ? qualityColors[item.quality] : 'var(--border-color)' }}>
                      {equipped && (
                        <span className="absolute right-1 top-1 rounded px-1 text-[9px] font-bold" style={{ backgroundColor: 'var(--accent)', color: 'var(--bg-primary)' }}>已装备</span>
                      )}
                      <div className="text-xs font-bold" style={{ color: qualityColors[item.quality] }}>{getItemDisplayName(item)}</div>
                      <div className="mt-1 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                        孔位 {(item.gems || []).length}/{getSocketCount(item.quality)}
                        {(item.gems || []).length > 0 && (
                          <span style={{ color: '#A371F7' }}>（{(item.gems || []).map((g) => getItemInfo(g)?.name || g).join('、')}）</span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* 镶嵌面板 */}
            {selected && (
              <div className="w-full border-t p-4 lg:w-[320px] lg:border-l lg:border-t-0" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-card)' }}>
                <h3 className="text-lg font-bold" style={{ color: qualityColors[selected.item.quality] }}>
                  {getItemDisplayName(selected.item)}
                </h3>
                {getSocketCount(selected.item.quality) <= 0 ? (
                  <div className="mt-3 text-sm" style={{ color: 'var(--text-muted)' }}>普通品质没有孔位</div>
                ) : (
                  <>
                    <div className="mt-3 space-y-2">
                      {Array.from({ length: getSocketCount(selected.item.quality) }).map((_, idx) => {
                        const gid = (selected.item.gems || [])[idx]
                        const gdef = gid ? getItemInfo(gid) : null
                        return (
                          <div key={idx} className="flex items-center justify-between rounded p-2 text-xs" style={{ backgroundColor: 'var(--bg-hover)' }}>
                            {gdef ? (
                              <>
                                <span style={{ color: qualityColors[gdef.quality] }}>
                                  <Gem size={11} className="mr-1 inline" />{gdef.name}
                                  <span className="ml-1" style={{ color: '#3FB950' }}>
                                    {Object.entries(gdef.stats || {}).map(([k, v]) => `${STAT_NAMES[k] || k}+${v}`).join(' ')}
                                  </span>
                                </span>
                                <button onClick={() => doUnsocket(idx)} className="rounded px-2 py-0.5 text-[10px] font-bold"
                                  style={{ backgroundColor: 'rgba(248,81,73,0.15)', color: '#F85149' }}>
                                  卸下
                                </button>
                              </>
                            ) : (
                              <span style={{ color: 'var(--text-muted)' }}>空孔位</span>
                            )}
                          </div>
                        )
                      })}
                    </div>

                    {(selected.item.gems || []).length < getSocketCount(selected.item.quality) && (
                      <div className="mt-4">
                        <div className="mb-2 text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>背包宝石</div>
                        {bagGems.length === 0 ? (
                          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>没有可镶嵌的宝石，守序 Boss 与高层怪物会掉落</div>
                        ) : (
                          <div className="space-y-1">
                            {bagGems.map((g) => {
                              const gdef = getItemInfo(g.id)
                              return (
                                <button key={g.uid} onClick={() => doSocket(g.uid)}
                                  className="flex w-full items-center justify-between rounded p-2 text-xs transition-all hover:scale-[1.01]"
                                  style={{ backgroundColor: 'var(--bg-hover)', border: '1px solid var(--border-color)' }}>
                                  <span style={{ color: qualityColors[g.quality] }}>
                                    <Gem size={11} className="mr-1 inline" />{gdef?.name || g.name} ×{g.quantity}
                                  </span>
                                  <span style={{ color: '#3FB950' }}>
                                    {Object.entries(gdef?.stats || {}).map(([k, v]) => `${STAT_NAMES[k] || k}+${v}`).join(' ')}
                                  </span>
                                </button>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </>
        )}

        {/* ═══ 分解 ═══ */}
        {tab === 'disassemble' && (
          <div className="flex-1 p-4">
            <div className="mb-3 text-xs" style={{ color: 'var(--text-muted)' }}>
              分解背包中的装备获得金币（已装备的物品不会被分解）
            </div>
            {bagEquipment.length === 0 ? (
              <div className="rounded-lg p-8 text-center text-sm" style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-muted)' }}>
                背包中没有可分解的装备
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {bagEquipment.map(({ item }) => (
                  <div key={item.uid} className="game-card p-2">
                    <div className="text-xs font-bold" style={{ color: qualityColors[item.quality] }}>{getItemDisplayName(item)}</div>
                    <div className="mt-1 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                      可得金币 ×{getDisassembleGold(item)}
                    </div>
                    <button onClick={() => doDisassemble(item)}
                      className="mt-2 w-full rounded px-2 py-1 text-[10px] font-bold"
                      style={{ backgroundColor: 'rgba(248,81,73,0.15)', color: '#F85149', border: '1px solid rgba(248,81,73,0.4)' }}>
                      <Recycle size={10} className="mr-1 inline" /> 分解
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ═══ 合成 ═══ */}
        {tab === 'craft' && (
          <div className="flex-1 p-4">
            <div className="space-y-3">
              {recipes.map((r) => {
                const can = r.have >= r.needN
                return (
                  <div key={r.id} className="game-card flex items-center justify-between">
                    <div>
                      <div className="text-sm font-bold" style={{ color: r.color }}>{r.name}</div>
                      <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        材料: {r.need}（现有 {r.have}）
                      </div>
                    </div>
                    <button onClick={() => doCraft(r.id)} disabled={!can}
                      className="rounded px-3 py-1.5 text-xs font-bold"
                      style={{
                        backgroundColor: can ? 'var(--accent)' : 'var(--bg-hover)',
                        color: can ? 'var(--bg-primary)' : 'var(--text-muted)',
                      }}>
                      合成
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
