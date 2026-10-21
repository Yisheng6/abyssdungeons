import { useState } from 'react'
import { Sparkles, RotateCcw, Lock, Check } from 'lucide-react'
import { useGameStore } from '@/stores/gameStore'
import {
  TALENT_TREES, getSpentTalentPoints, getBranchSpent, canLearnTalent,
  getRespecCost, getTalentMods, TALENT_NODE_DESC_KEYS, tierGate, type TalentNode,
} from '@/lib/talents'

export default function Talents() {
  const player = useGameStore((s) => s.player)
  const talents = useGameStore((s) => s.talents)
  const inCombat = useGameStore((s) => s.inCombat)
  const learnTalent = useGameStore((s) => s.learnTalent)
  const respecTalents = useGameStore((s) => s.respecTalents)
  const [msg, setMsg] = useState('')

  if (!player) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <div className="game-card p-6 text-center text-xs" style={{ color: 'var(--text-muted)' }}>请先在角色面板创建角色</div>
      </div>
    )
  }

  const tree = TALENT_TREES[player.classId] || []
  const ranks = talents[player.classId] || {}
  const spent = getSpentTalentPoints(ranks)
  const available = player.level - spent
  const respecCost = getRespecCost(player.level)
  const mods = getTalentMods(ranks, player.classId)

  const learn = (nodeId: string) => {
    const r = learnTalent(nodeId)
    setMsg(r.message)
  }

  const respec = () => {
    if (!window.confirm(`重置全部天赋需要 ${respecCost} 金币，确定洗点？`)) return
    const r = respecTalents()
    setMsg(r.message)
  }

  const renderNode = (n: TalentNode, branchId: string, branchTheme: string) => {
    const rank = ranks[n.id] || 0
    const err = canLearnTalent(ranks, player.classId, n.id, available)
    const learnable = !err && !inCombat
    const maxed = rank >= n.maxRank
    const tierLocked = (getBranchSpent(ranks, player.classId, branchId) < tierGate(n.tier))
    return (
      <button key={n.id} onClick={() => learn(n.id)} disabled={!learnable}
        className="game-card w-full p-2.5 text-left transition-all disabled:cursor-not-allowed"
        style={{
          borderColor: rank > 0 ? branchTheme : 'var(--border-color)',
          opacity: rank > 0 || learnable ? 1 : 0.55,
          boxShadow: rank > 0 ? `0 0 8px ${branchTheme}33` : undefined,
        }}>
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-xs font-bold" style={{ color: rank > 0 ? branchTheme : 'var(--text-primary)' }}>
            {maxed ? <Check size={12} /> : tierLocked ? <Lock size={11} /> : null}
            {n.name}
          </span>
          <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{rank}/{n.maxRank}</span>
        </div>
        <div className="mt-0.5 text-[10px]" style={{ color: 'var(--text-secondary)' }}>{n.desc}</div>
        {/* 等级圆点 */}
        <div className="mt-1.5 flex gap-1">
          {Array.from({ length: n.maxRank }).map((_, i) => (
            <span key={i} className="h-1.5 w-4 rounded-full"
              style={{ backgroundColor: i < rank ? branchTheme : 'var(--bg-hover)' }} />
          ))}
        </div>
      </button>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-4">
      {/* 头部 */}
      <div className="flex flex-shrink-0 flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
          <Sparkles size={15} style={{ color: 'var(--accent)' }} /> 天赋树
        </h2>
        <div className="flex items-center gap-3 text-xs">
          <span style={{ color: 'var(--text-secondary)' }}>
            可用天赋点 <span className="font-bold" style={{ color: available > 0 ? 'var(--accent)' : 'var(--text-muted)' }}>{available}</span>
            <span style={{ color: 'var(--text-muted)' }}>（每级 +1，当前 Lv.{player.level}）</span>
          </span>
          <button onClick={respec} disabled={spent === 0 || inCombat}
            className="flex items-center gap-1 rounded border px-2 py-1 text-[11px] disabled:opacity-40"
            style={{ borderColor: 'var(--border-color)', color: 'var(--text-muted)' }}>
            <RotateCcw size={11} /> 洗点 {respecCost} 金
          </button>
        </div>
      </div>

      {inCombat && (
        <div className="flex-shrink-0 rounded border px-3 py-1.5 text-[11px]" style={{ borderColor: '#F85149', color: '#F85149' }}>
          战斗中无法修改天赋
        </div>
      )}
      {msg && (
        <div className="flex-shrink-0 text-[11px]" style={{ color: 'var(--text-secondary)' }}>{msg}</div>
      )}

      {/* 天赋汇总 */}
      {spent > 0 && (
        <div className="flex flex-shrink-0 flex-wrap gap-x-3 gap-y-1 rounded-lg border px-3 py-2 text-[10px]"
          style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-card)', color: 'var(--text-secondary)' }}>
          <span style={{ color: 'var(--text-muted)' }}>当前加成：</span>
          {Object.entries({ ...mods.combat, ...mods.utility }).map(([k, v]) => (
            <span key={k}>{TALENT_NODE_DESC_KEYS[k] || k} +{v}{['killHeal', 'killMp'].includes(k) ? '' : '%'}</span>
          ))}
        </div>
      )}

      {/* 三分支树 */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto sm:grid-cols-3">
        {tree.map((branch) => (
          <div key={branch.id} className="flex flex-col gap-2">
            <div className="flex items-center justify-between rounded-lg border px-3 py-1.5"
              style={{ borderColor: branch.theme, backgroundColor: 'var(--bg-card)' }}>
              <span className="text-xs font-bold" style={{ color: branch.theme }}>{branch.name}</span>
              <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                已投入 {getBranchSpent(ranks, player.classId, branch.id)} 点
              </span>
            </div>
            {branch.nodes.map((n, i) => (
              <div key={n.id} className="relative">
                {i > 0 && <div className="absolute -top-2 left-1/2 h-2 w-px" style={{ backgroundColor: 'var(--border-color)' }} />}
                {renderNode(n, branch.id, branch.theme)}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
