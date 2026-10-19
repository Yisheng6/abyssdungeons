import { Target, Award, CheckCircle2 } from 'lucide-react'
import { useGameStore } from '@/stores/gameStore'
import { TASKS, type TaskDef } from '@/lib/tasks'

export default function Tasks() {
  const taskState = useGameStore((s) => s.taskState)
  const claimTaskReward = useGameStore((s) => s.claimTaskReward)
  const addPlayerExp = useGameStore((s) => s.addPlayerExp)
  const player = useGameStore((s) => s.player)

  // 跨天展示一致性（store 内追踪时已处理重置，这里兜底显示）
  const today = new Date().toISOString().slice(0, 10)
  const dailyFresh = taskState.dailyDate === today
  const daily = dailyFresh ? taskState.daily : { rooms: 0, kills: 0, layers: 0, bossKills: 0 }
  const dailyClaimed = dailyFresh ? taskState.dailyClaimed : []

  const renderTask = (t: TaskDef) => {
    const progress = t.scope === 'daily' ? daily[t.metric] : taskState.totals[t.metric]
    const claimed = (t.scope === 'daily' ? dailyClaimed : taskState.achClaimed).includes(t.id)
    const done = progress >= t.target
    const pct = Math.min(100, (progress / t.target) * 100)
    return (
      <div key={t.id} className="game-card flex items-center gap-3 p-3" style={{ opacity: claimed ? 0.55 : 1 }}>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{t.name}</span>
            <span className="text-[10px]" style={{ color: '#C9A84C' }}>+{t.exp} 经验</span>
          </div>
          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{t.desc}</div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full" style={{ backgroundColor: 'var(--bg-hover)' }}>
            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: done ? '#3FB950' : 'linear-gradient(90deg,#C9A84C,#F0D878)' }} />
          </div>
          <div className="mt-0.5 text-[10px]" style={{ color: 'var(--text-muted)' }}>{progress}/{t.target}</div>
        </div>
        {claimed ? (
          <CheckCircle2 size={20} style={{ color: '#3FB950' }} />
        ) : (
          <button disabled={!done || !player}
            onClick={() => { claimTaskReward(t.id, t.scope); addPlayerExp(t.exp) }}
            className="rounded-lg px-3 py-1.5 text-xs font-bold transition-all active:scale-95"
            style={{
              backgroundColor: done ? 'var(--accent)' : 'var(--bg-hover)',
              color: done ? 'var(--bg-primary)' : 'var(--text-muted)',
            }}>
            领取
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4 p-4">
      <section>
        <h2 className="mb-2 flex items-center gap-2 text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
          <Target size={15} style={{ color: 'var(--accent)' }} /> 每日任务
          <span className="text-[10px] font-normal" style={{ color: 'var(--text-muted)' }}>每日 0 点重置</span>
        </h2>
        <div className="space-y-2">{TASKS.filter((t) => t.scope === 'daily').map(renderTask)}</div>
      </section>
      <section>
        <h2 className="mb-2 flex items-center gap-2 text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
          <Award size={15} style={{ color: 'var(--accent)' }} /> 成就
        </h2>
        <div className="space-y-2">{TASKS.filter((t) => t.scope === 'achievement').map(renderTask)}</div>
      </section>
    </div>
  )
}
