import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { Sword, Shield, Backpack, Sparkles, Map, Trophy, LogOut, User, Settings, X } from 'lucide-react'
import { useGameStore, shouldAutoDisassemble, getDisassembleGold } from '@/stores/gameStore'
import { loadCatalogs, getTierName } from '@/lib/catalog'
import { trpc } from '@/providers/trpc'

// 职业中文名映射
const CLASS_NAMES: Record<string, string> = {
  warrior: '战士', mage: '法师', assassin: '刺客',
  ranger: '游侠', priest: '牧师', warlock: '术士',
}

const STAT_NAMES: Record<string, string> = {
  atk: '攻击力', def: '防御力', mag: '魔法力', mdef: '魔防', agi: '敏捷', luk: '幸运',
}

const SETTINGS_QUALITY_NAMES: Record<string, string> = {
  common: '普通', fine: '精致', rare: '稀有', epic: '史诗', legendary: '传说',
}

interface OfflineSummary {
  settled: boolean; seconds: number; capped: boolean; rooms: number; kills: number
  defeats: number; bossKills: number; exp: number; gold: number; diamonds: number
  startLayer: number; finalLayer: number
  items: Array<{
    itemId: string; name: string; type: string; quality: string; quantity: number
    stats?: Record<string, number>; affixes?: Record<string, number>; slot?: string
    setId?: string; setTier?: number; value?: number
  }>
  disassembledGold: number; keptCount: number
}

function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  return h > 0 ? `${h} 小时 ${m} 分钟` : `${m} 分钟`
}

const features = [
  { icon: Sword, label: '进入地牢', path: '/explore', desc: '自动探索 · 无限层数' },
  { icon: User, label: '角色面板', path: '/character', desc: '查看属性和技能' },
  { icon: Backpack, label: '背包', path: '/inventory', desc: '管理装备和道具' },
  { icon: Sparkles, label: '技能树', path: '/character', desc: '升级和学习技能' },
  { icon: Shield, label: '铁匠铺', path: '/blacksmith', desc: '强化 · 分解 · 合成' },
  { icon: Trophy, label: '排行榜', path: '#', desc: '查看全服排名' },
]

export default function Town() {
  const navigate = useNavigate()
  const playerName = localStorage.getItem('ad_user') || '冒险者'
  const player = useGameStore((s) => s.player)
  const settings = useGameStore((s) => s.settings)
  const updateSettings = useGameStore((s) => s.updateSettings)
  const [showSettings, setShowSettings] = useState(false)
  const [offlineResult, setOfflineResult] = useState<OfflineSummary | null>(null)
  const offlineSettleMut = trpc.game.offlineSettle.useMutation()

  // 预加载物品/技能目录（套装加成计算等依赖）
  useEffect(() => { loadCatalogs() }, [])

  // 离线挂机结算：上线时领取离线期间的探索收益
  useEffect(() => {
    const name = localStorage.getItem('ad_user')
    if (!name) return
    offlineSettleMut.mutateAsync({ playerName: name }).then((r) => {
      if (!r.settled || r.rooms <= 0) return
      const gs = useGameStore.getState()
      if (r.exp > 0) gs.addPlayerExp(r.exp)
      if (r.gold > 0) gs.addPlayerGold(r.gold)
      if (r.diamonds > 0) gs.addPlayerDiamonds(r.diamonds)
      if (r.finalLayer > (gs.player?.maxLayer || 1)) gs.updateMaxLayer(r.finalLayer)
      // 物品入包；符合自动分解条件的装备直接折算金币
      let disassembledGold = 0
      let kept = 0
      for (const it of r.items) {
        const item = {
          uid: `offline_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          id: it.itemId, name: it.name,
          type: it.type as never,
          quality: it.quality as never,
          quantity: it.quantity,
          slot: it.slot as never,
          stats: it.stats,
          affixes: it.affixes,
          setId: it.setId,
          setTier: it.setTier,
          value: it.value,
        }
        if (shouldAutoDisassemble(item, gs.settings)) {
          disassembledGold += getDisassembleGold(item) * it.quantity
        } else {
          gs.addItem(item)
          kept += it.quantity
        }
      }
      if (disassembledGold > 0) gs.addPlayerGold(disassembledGold)
      setOfflineResult({ ...r, disassembledGold, keptCount: kept })
    }).catch(() => { /* 结算失败不影响进入游戏 */ })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const logout = () => {
    localStorage.removeItem('ad_token')
    localStorage.removeItem('ad_user')
    navigate('/login')
  }

  return (
    <div className="flex min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      {/* Left: Character Panel */}
      <aside className="hidden w-[260px] flex-shrink-0 border-r p-4 lg:block" style={{ borderColor: 'var(--border-color)' }}>
        <div className="mb-4 text-center">
          <div className="mx-auto mb-2 flex h-16 w-16 items-center justify-center rounded-full" style={{ backgroundColor: 'var(--bg-hover)', border: '2px solid var(--accent)' }}>
            <User style={{ color: 'var(--accent)', width: 28, height: 28 }} />
          </div>
          <h3 className="font-bold" style={{ color: 'var(--text-primary)' }}>{playerName}</h3>
          <span className="inline-block rounded-full px-2 py-0.5 text-xs" style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--accent)' }}>
            {player ? `Lv.${player.level} ${CLASS_NAMES[player.classId] || player.classId} · ${getTierName(player.classId, player.tier || 1)}` : '点击角色面板创建角色'}
          </span>
        </div>

        {/* HP/MP */}
        <div className="mb-4 space-y-2">
          <div>
            <div className="mb-1 flex justify-between text-xs" style={{ color: 'var(--text-secondary)' }}>
              <span>HP</span><span>{player?.hp ?? 100}/{player?.maxHp ?? 100}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full" style={{ backgroundColor: 'var(--bg-hover)' }}>
              <div className="h-full rounded-full transition-all" style={{ width: `${player ? (player.hp / player.maxHp) * 100 : 100}%`, background: 'linear-gradient(90deg, #F85149, #3FB950)' }} />
            </div>
          </div>
          <div>
            <div className="mb-1 flex justify-between text-xs" style={{ color: 'var(--text-secondary)' }}>
              <span>MP</span><span>{player?.mp ?? 50}/{player?.maxMp ?? 50}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full" style={{ backgroundColor: 'var(--bg-hover)' }}>
              <div className="h-full rounded-full transition-all" style={{ width: `${player ? (player.mp / player.maxMp) * 100 : 100}%`, background: 'linear-gradient(90deg, #58A6FF, #79C0FF)' }} />
            </div>
          </div>
          {player && (
            <div>
              <div className="mb-1 flex justify-between text-xs" style={{ color: 'var(--text-secondary)' }}>
                <span>EXP</span><span>{player.exp}/{player.level * 100}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full" style={{ backgroundColor: 'var(--bg-hover)' }}>
                <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, (player.exp / (player.level * 100)) * 100)}%`, background: 'linear-gradient(90deg, #C9A84C, #F0D878)' }} />
              </div>
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="mb-4 grid grid-cols-2 gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
          {player ? (
            <>
              <div className="rounded p-1.5" style={{ backgroundColor: 'var(--bg-hover)' }}>攻击力: <span style={{ color: 'var(--text-primary)' }}>{player.atk}</span></div>
              <div className="rounded p-1.5" style={{ backgroundColor: 'var(--bg-hover)' }}>防御力: <span style={{ color: 'var(--text-primary)' }}>{player.def}</span></div>
              <div className="rounded p-1.5" style={{ backgroundColor: 'var(--bg-hover)' }}>魔法力: <span style={{ color: 'var(--text-primary)' }}>{player.mag}</span></div>
              <div className="rounded p-1.5" style={{ backgroundColor: 'var(--bg-hover)' }}>魔防: <span style={{ color: 'var(--text-primary)' }}>{player.mdef}</span></div>
              <div className="rounded p-1.5" style={{ backgroundColor: 'var(--bg-hover)' }}>敏捷: <span style={{ color: 'var(--text-primary)' }}>{player.agi}</span></div>
              <div className="rounded p-1.5" style={{ backgroundColor: 'var(--bg-hover)' }}>幸运: <span style={{ color: 'var(--text-primary)' }}>{player.luk}</span></div>
            </>
          ) : (
            <div className="col-span-2 rounded p-2 text-center text-xs" style={{ backgroundColor: 'var(--bg-hover)' }}>尚未创建角色</div>
          )}
        </div>

        <button onClick={logout} className="flex w-full items-center justify-center gap-1 rounded-lg border py-1.5 text-xs transition-colors" style={{ borderColor: 'var(--border-color)', color: 'var(--text-muted)' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--danger)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}>
          <LogOut size={14} /> 退出登录
        </button>
      </aside>

      {/* Center: Main Content */}
      <main className="flex flex-1 flex-col">
        {/* Top Nav */}
        <header className="flex h-12 items-center justify-between border-b px-4" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-card)' }}>
          <div className="flex items-center gap-2">
            <Sword size={18} style={{ color: 'var(--accent)' }} />
            <span className="text-sm font-bold" style={{ color: 'var(--accent)' }}>深渊地城</span>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}> / 深渊镇</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--accent)' }}>
              <span style={{ fontSize: 14 }}>$</span> 0
            </span>
            {/* Mobile logout button */}
            <button onClick={logout} className="flex items-center gap-1 rounded-lg border px-2 py-1 text-xs lg:hidden" style={{ borderColor: 'var(--border-color)', color: 'var(--text-muted)' }}>
              <LogOut size={12} /> 退出
            </button>
            <button onClick={() => setShowSettings(true)}
              className="flex items-center gap-1 rounded-lg border px-2 py-1 text-xs transition-colors"
              style={{ borderColor: 'var(--border-color)', color: 'var(--text-muted)' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--accent)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}>
              <Settings size={12} /> 设置
            </button>
          </div>
        </header>

        {/* Settings Modal */}
        {showSettings && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
            onClick={() => setShowSettings(false)}>
            <div className="w-full max-w-xs rounded-lg border p-4" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-card)' }}
              onClick={(e) => e.stopPropagation()}>
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>设置</span>
                <button onClick={() => setShowSettings(false)} style={{ color: 'var(--text-muted)' }}><X size={16} /></button>
              </div>

              <div className="space-y-2 text-xs">
                <div className="rounded p-2" style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-muted)' }}>
                  账号：{playerName}
                </div>

                {/* 装备自动分解 */}
                <div className="rounded p-2" style={{ backgroundColor: 'var(--bg-hover)' }}>
                  <div className="mb-1.5 flex items-center justify-between">
                    <span style={{ color: 'var(--text-secondary)' }}>装备自动分解</span>
                    <button
                      onClick={() => updateSettings({ autoDisassemble: !settings.autoDisassemble })}
                      className="rounded-full px-2.5 py-0.5 text-[10px] font-bold transition-colors"
                      style={{
                        backgroundColor: settings.autoDisassemble ? 'rgba(63,185,80,0.25)' : 'var(--bg-card)',
                        color: settings.autoDisassemble ? '#3FB950' : 'var(--text-muted)',
                        border: settings.autoDisassemble ? '1px solid #3FB950' : '1px solid var(--border-color)',
                      }}>
                      {settings.autoDisassemble ? '已开启' : '已关闭'}
                    </button>
                  </div>
                  {settings.autoDisassemble && (
                    <>
                      <div className="mb-1 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                        分解条件：品质 ≤ 以下选择的装备，拾取时直接分解为金币
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {(['common', 'fine', 'rare', 'epic', 'legendary'] as const).map((q) => (
                          <button key={q}
                            onClick={() => updateSettings({ autoDisassembleMaxQuality: q })}
                            className="rounded-full px-2 py-0.5 text-[10px] transition-colors"
                            style={{
                              backgroundColor: settings.autoDisassembleMaxQuality === q ? 'rgba(201,168,76,0.25)' : 'var(--bg-card)',
                              color: settings.autoDisassembleMaxQuality === q ? '#C9A84C' : 'var(--text-muted)',
                              border: settings.autoDisassembleMaxQuality === q ? '1px solid #C9A84C' : '1px solid transparent',
                            }}>
                            {SETTINGS_QUALITY_NAMES[q]}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                <button onClick={logout}
                  className="w-full rounded border py-1.5 transition-colors"
                  style={{ borderColor: 'var(--border-color)', color: 'var(--text-muted)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--danger)')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}>
                  退出登录
                </button>

                <div className="pt-1 text-center text-[10px]" style={{ color: 'var(--text-muted)' }}>深渊地城 · zhiyihw.com</div>
              </div>
            </div>
          </div>
        )}

        {/* 离线挂机结算弹窗 */}
        {offlineResult && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.65)' }}>
            <div className="w-full max-w-sm rounded-lg border p-4" style={{ borderColor: 'var(--accent)', backgroundColor: 'var(--bg-card)' }}>
              <div className="mb-1 text-center text-sm font-bold" style={{ color: 'var(--accent)' }}>离线探索结算</div>
              <div className="mb-3 text-center text-[11px]" style={{ color: 'var(--text-muted)' }}>
                你离线期间，角色在地牢中继续战斗了 {formatDuration(offlineResult.seconds)}
                {offlineResult.capped && '（已达 12 小时上限）'}
              </div>
              <div className="mb-3 grid grid-cols-2 gap-1.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
                <div className="rounded p-1.5" style={{ backgroundColor: 'var(--bg-hover)' }}>探索房间：<span style={{ color: 'var(--text-primary)' }}>{offlineResult.rooms}</span></div>
                <div className="rounded p-1.5" style={{ backgroundColor: 'var(--bg-hover)' }}>到达层数：<span style={{ color: 'var(--text-primary)' }}>第 {offlineResult.startLayer} → {offlineResult.finalLayer} 层</span></div>
                <div className="rounded p-1.5" style={{ backgroundColor: 'var(--bg-hover)' }}>击杀怪物：<span style={{ color: 'var(--text-primary)' }}>{offlineResult.kills}{offlineResult.bossKills > 0 ? `（含 Boss×${offlineResult.bossKills}）` : ''}</span></div>
                <div className="rounded p-1.5" style={{ backgroundColor: 'var(--bg-hover)' }}>战败次数：<span style={{ color: 'var(--text-primary)' }}>{offlineResult.defeats}</span></div>
                <div className="rounded p-1.5" style={{ backgroundColor: 'var(--bg-hover)' }}>经验：<span style={{ color: '#C9A84C' }}>+{offlineResult.exp}</span></div>
                <div className="rounded p-1.5" style={{ backgroundColor: 'var(--bg-hover)' }}>金币：<span style={{ color: '#C9A84C' }}>+{offlineResult.gold}</span></div>
                {offlineResult.diamonds > 0 && (
                  <div className="rounded p-1.5" style={{ backgroundColor: 'var(--bg-hover)' }}>钻石：<span style={{ color: '#79C0FF' }}>+{offlineResult.diamonds}</span></div>
                )}
                <div className="rounded p-1.5" style={{ backgroundColor: 'var(--bg-hover)' }}>物品入包：<span style={{ color: 'var(--text-primary)' }}>{offlineResult.keptCount} 件</span></div>
                {offlineResult.disassembledGold > 0 && (
                  <div className="col-span-2 rounded p-1.5" style={{ backgroundColor: 'var(--bg-hover)' }}>
                    自动分解：<span style={{ color: '#C9A84C' }}>+{offlineResult.disassembledGold} 金币</span>
                  </div>
                )}
              </div>
              <button onClick={() => setOfflineResult(null)}
                className="w-full rounded-lg py-2 text-sm font-bold"
                style={{ backgroundColor: 'var(--accent)', color: 'var(--bg-primary)' }}>
                收下收益
              </button>
            </div>
          </div>
        )}

        {/* Scene Description */}
        <div className="m-4 rounded-lg border p-4" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-card)' }}>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            你站在<strong style={{ color: 'var(--text-primary)' }}>深渊镇</strong>的石板广场上。远处传来铁匠铺的锤击声，
            空气中弥漫着淡淡的硫磺气息。镇子的边缘，一道漆黑的裂隙通向无尽的地下世界——
            那是所有冒险者梦想与噩梦开始的地方。
          </p>
          <p className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
            提示：选择「进入地牢」开始你的第一次探险。输入层级坐标（如 L=1, X=0, Y=0）或点击快速开始。
          </p>
        </div>

        {/* Feature Grid */}
        <div className="grid flex-1 grid-cols-2 gap-3 px-4 pb-4 sm:grid-cols-3">
          {features.map((f) => (
            <button key={f.label} onClick={() => { if (f.path !== '#') navigate(f.path) }}
              className="game-card flex flex-col items-center justify-center gap-2 p-6 text-center transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]">
              <f.icon size={28} style={{ color: 'var(--accent)' }} />
              <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{f.label}</span>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{f.desc}</span>
            </button>
          ))}
        </div>
      </main>
    </div>
  )
}
