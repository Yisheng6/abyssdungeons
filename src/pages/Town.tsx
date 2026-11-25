import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import PixIcon from '@/components/PixIcon'
import { useGameStore, shouldAutoDisassemble, getDisassembleGold, getExpNeed } from '@/stores/gameStore'
import { loadCatalogs, getTierName } from '@/lib/catalog'
import { trpc } from '@/providers/trpc'

const CLASS_NAMES: Record<string, string> = {
  warrior: '战士', mage: '法师', assassin: '刺客',
  ranger: '游侠', priest: '牧师', warlock: '术士',
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

function Bar({ label, cur, max, gradient }: { label: string; cur: number; max: number; gradient: string }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-[11px]" style={{ color: 'var(--text-secondary)' }}>
        <span>{label}</span><span>{cur}/{max}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full" style={{ backgroundColor: 'var(--bg-hover)' }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, max > 0 ? (cur / max) * 100 : 0)}%`, background: gradient }} />
      </div>
    </div>
  )
}

export default function Town() {
  const navigate = useNavigate()
  const player = useGameStore((s) => s.player)
  const [offlineResult, setOfflineResult] = useState<OfflineSummary | null>(null)
  const offlineSettleMut = trpc.game.offlineSettle.useMutation()
  const playerName = localStorage.getItem('ad_user') || '冒险者'

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
    <div className="flex flex-1 flex-col gap-4 p-4" style={{ backgroundColor: 'var(--bg-primary)' }}>
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

      {/* ═══ 上半区：角色卡 + 深渊横幅 ═══ */}
      <div className="grid gap-4 xl:grid-cols-[340px_1fr]">
        {/* 角色卡（仿 DD 左侧纸娃娃面板） */}
        <div className="game-card flex flex-col items-center rounded-xl p-4">
          <div className="mx-auto mb-2 flex h-24 w-24 items-center justify-center overflow-hidden"
            style={{ backgroundColor: 'var(--bg-hover)', border: '2px solid var(--accent)' }}>
            {player?.classId
              ? <img src={`/sprites/class_${player.classId}.png`} alt="" style={{ width: 88, height: 88, objectFit: 'contain', imageRendering: 'pixelated' }} />
              : <PixIcon name="user" size={40} />}
          </div>
          <h3 className="font-bold" style={{ color: 'var(--text-primary)' }}>{playerName}</h3>
          <span className="mt-1 inline-block rounded-full px-2 py-0.5 text-[11px]" style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--accent)' }}>
            {player ? `Lv.${player.level} ${CLASS_NAMES[player.classId] || player.classId} · ${getTierName(player.classId, player.tier || 1)}` : '尚未创建角色'}
          </span>
          <div className="mt-3 w-full space-y-2">
            <Bar label="HP" cur={player?.hp ?? 100} max={player?.maxHp ?? 100} gradient="linear-gradient(90deg, #F85149, #3FB950)" />
            <Bar label="MP" cur={player?.mp ?? 50} max={player?.maxMp ?? 50} gradient="linear-gradient(90deg, #58A6FF, #79C0FF)" />
            {player && <Bar label="EXP" cur={player.exp} max={getExpNeed(player.level)} gradient="linear-gradient(90deg, #C9A84C, #F0D878)" />}
          </div>
          {player && (
            <div className="mt-3 grid w-full grid-cols-3 gap-1.5 text-[11px]" style={{ color: 'var(--text-secondary)' }}>
              <div className="rounded p-1.5 text-center" style={{ backgroundColor: 'var(--bg-hover)' }}>攻击 <span className="font-bold" style={{ color: 'var(--text-primary)' }}>{player.atk}</span></div>
              <div className="rounded p-1.5 text-center" style={{ backgroundColor: 'var(--bg-hover)' }}>防御 <span className="font-bold" style={{ color: 'var(--text-primary)' }}>{player.def}</span></div>
              <div className="rounded p-1.5 text-center" style={{ backgroundColor: 'var(--bg-hover)' }}>魔法 <span className="font-bold" style={{ color: 'var(--text-primary)' }}>{player.mag}</span></div>
              <div className="rounded p-1.5 text-center" style={{ backgroundColor: 'var(--bg-hover)' }}>魔防 <span className="font-bold" style={{ color: 'var(--text-primary)' }}>{player.mdef}</span></div>
              <div className="rounded p-1.5 text-center" style={{ backgroundColor: 'var(--bg-hover)' }}>敏捷 <span className="font-bold" style={{ color: 'var(--text-primary)' }}>{player.agi}</span></div>
              <div className="rounded p-1.5 text-center" style={{ backgroundColor: 'var(--bg-hover)' }}>幸运 <span className="font-bold" style={{ color: 'var(--text-primary)' }}>{player.luk}</span></div>
            </div>
          )}
          <button onClick={() => navigate('/character')}
            className="mt-3 w-full rounded-lg border py-1.5 text-xs transition-colors"
            style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--accent)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-secondary)')}>
            查看完整面板 →
          </button>
        </div>

        {/* 右侧：剧情横幅 + 两个深渊入口大卡 */}
        <div className="flex flex-col gap-4">
          {/* 像素场景横幅：深渊裂隙 + 篝火营地 */}
          <div className="game-card relative overflow-hidden rounded-xl p-0" style={{ minHeight: 120 }}>
            <img src="/images/town-banner.png" alt="深渊镇"
              className="block w-full"
              style={{ imageRendering: 'pixelated', objectFit: 'cover', maxHeight: 180 }} />
            <div className="absolute bottom-0 left-0 right-0 px-4 py-2"
              style={{ background: 'linear-gradient(transparent, rgba(21,15,30,0.9))' }}>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)', textShadow: '0 1px 2px #000' }}>
                你站在<strong style={{ color: 'var(--text-primary)' }}>深渊镇</strong>的石板广场上。镇子边缘，一道漆黑的裂隙通向无尽的地下世界——
                那是所有冒险者梦想与噩梦开始的地方。
              </p>
            </div>
          </div>
          {/* 混乱深渊 */}
          <button onClick={() => navigate('/explore')}
            className="group relative flex-1 overflow-hidden rounded-xl border p-5 text-left transition-all duration-200 hover:scale-[1.005]"
            style={{ borderColor: 'var(--accent)', background: 'linear-gradient(135deg, rgba(201,168,76,0.14) 0%, var(--bg-card) 55%)', minHeight: 110 }}>
            <PixIcon name="abyss" size={110} className="absolute -bottom-4 -right-3 opacity-[0.12] transition-transform duration-300 group-hover:rotate-6 group-hover:scale-110" />
            <div className="relative flex h-full flex-col justify-between gap-3">
              <div>
                <div className="mb-1 flex items-center gap-2">
                  <PixIcon name="abyss" size={20} />
                  <span className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>混乱深渊</span>
                </div>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>随机遇敌 · 无限深入 · 离线也能持续战斗 · 100 波必遇 Boss</p>
              </div>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  <span style={{ color: 'var(--text-muted)' }}>最深抵达 </span>
                  <span className="text-base font-bold" style={{ color: 'var(--accent)' }}>第 {player?.maxLayer ?? 1} 层</span>
                </div>
                <span className="rounded-lg px-5 py-2 text-sm font-bold transition-transform group-hover:scale-105"
                  style={{ backgroundColor: 'var(--accent)', color: 'var(--bg-primary)' }}>
                  朝深处探索 →
                </span>
              </div>
            </div>
          </button>
          {/* 守序深渊 */}
          <button onClick={() => navigate('/lawful')}
            className="group relative flex-1 overflow-hidden rounded-xl border p-5 text-left transition-all duration-200 hover:scale-[1.005]"
            style={{ borderColor: 'var(--border-color)', background: 'linear-gradient(135deg, rgba(88,166,255,0.10) 0%, var(--bg-card) 55%)', minHeight: 110 }}>
            <PixIcon name="temple" size={110} className="absolute -bottom-4 -right-3 opacity-[0.12] transition-transform duration-300 group-hover:rotate-6 group-hover:scale-110" />
            <div className="relative flex h-full flex-col justify-between gap-3">
              <div>
                <div className="mb-1 flex items-center gap-2">
                  <PixIcon name="temple" size={20} />
                  <span className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>守序深渊</span>
                </div>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>秩序守卫镇守的规则之地 · 稳定产出宝石与材料</p>
              </div>
              <div className="flex justify-end">
                <span className="rounded-lg border px-5 py-2 text-sm font-bold transition-transform group-hover:scale-105"
                  style={{ borderColor: '#58A6FF', color: '#58A6FF' }}>
                  进入守序 →
                </span>
              </div>
            </div>
          </button>
        </div>
      </div>

    </div>
  )
}
