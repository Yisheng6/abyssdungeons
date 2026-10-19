import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { Sword, Shield, Backpack, Sparkles, Trophy, User } from 'lucide-react'
import { useGameStore, shouldAutoDisassemble, getDisassembleGold } from '@/stores/gameStore'
import { loadCatalogs } from '@/lib/catalog'
import { trpc } from '@/providers/trpc'

// 职业中文名映射

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

const quickActions = [
  { icon: User, label: '角色面板', path: '/character' },
  { icon: Backpack, label: '背包', path: '/inventory' },
  { icon: Sparkles, label: '技能树', path: '/character' },
  { icon: Shield, label: '铁匠铺', path: '/blacksmith' },
  { icon: Trophy, label: '排行榜', path: '#' },
]

export default function Town() {
  const navigate = useNavigate()
  const player = useGameStore((s) => s.player)
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

  return (
    <div className="flex min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      {/* Center: Main Content */}
      <main className="flex flex-1 flex-col">
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

        {/* Scene Description — compact banner */}
        <div className="m-4 mb-3 rounded-lg border px-4 py-3" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-card)' }}>
          <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            你站在<strong style={{ color: 'var(--text-primary)' }}>深渊镇</strong>的石板广场上。远处传来铁匠铺的锤击声，
            空气中弥漫着淡淡的硫磺气息。镇子的边缘，一道漆黑的裂隙通向无尽的地下世界——
            那是所有冒险者梦想与噩梦开始的地方。
          </p>
        </div>

        <div className="flex flex-1 flex-col gap-3 px-4 pb-4">
          {/* Hero: 进入地牢 */}
          <button onClick={() => navigate('/explore')}
            className="group relative flex-1 overflow-hidden rounded-xl border p-6 text-left transition-all duration-200 hover:scale-[1.005]"
            style={{ borderColor: 'var(--accent)', background: 'linear-gradient(135deg, rgba(201,168,76,0.14) 0%, var(--bg-card) 55%)', minHeight: 180 }}>
            {/* 背景装饰 */}
            <Sword size={170} className="absolute -right-6 -bottom-8 opacity-[0.07] transition-transform duration-300 group-hover:scale-110 group-hover:rotate-6" style={{ color: 'var(--accent)' }} />
            <div className="relative flex h-full flex-col justify-between gap-4">
              <div>
                <div className="mb-1 flex items-center gap-2">
                  <Sword size={22} style={{ color: 'var(--accent)' }} />
                  <span className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>进入地牢</span>
                </div>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>自动探索 · 无限层数 · 离线也能持续战斗</p>
              </div>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="flex gap-4 text-xs" style={{ color: 'var(--text-secondary)' }}>
                  <div>
                    <div style={{ color: 'var(--text-muted)' }}>最深抵达</div>
                    <div className="mt-0.5 text-base font-bold" style={{ color: 'var(--accent)' }}>第 {player?.maxLayer ?? 1} 层</div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--text-muted)' }}>离线挂机</div>
                    <div className="mt-0.5 text-base font-bold" style={{ color: 'var(--text-primary)' }}>12 小时</div>
                  </div>
                </div>
                <span className="rounded-lg px-5 py-2 text-sm font-bold transition-transform group-hover:scale-105"
                  style={{ backgroundColor: 'var(--accent)', color: 'var(--bg-primary)' }}>
                  开始探索 →
                </span>
              </div>
            </div>
          </button>

          {/* Quick actions — compact tiles */}
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {quickActions.map((f) => (
              <button key={f.label} onClick={() => { if (f.path !== '#') navigate(f.path) }}
                className="game-card flex items-center justify-center gap-2 rounded-lg px-2 py-3 transition-all duration-200 hover:scale-[1.03] active:scale-[0.97]"
                style={{ opacity: f.path === '#' ? 0.45 : 1 }}>
                <f.icon size={16} style={{ color: 'var(--accent)' }} />
                <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{f.label}</span>
              </button>
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}
