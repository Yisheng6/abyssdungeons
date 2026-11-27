import { useState, useRef } from 'react'
import { Crown, Swords, Trophy, Skull } from 'lucide-react'
import { useGameStore } from '@/stores/gameStore'
import { confirmSwitchBattle, snapshotBattleStats, battleHijacked, releaseBattle } from '@/lib/battle-switch'
import { trpc } from '@/providers/trpc'
import { runServerBattle } from '@/lib/battle-client'
import { applyServerState } from '@/lib/char-api'
import BattleStage from '@/components/BattleStage'

const ELEMENT_NAMES: Record<string, string> = {
  none: '无', fire: '火', ice: '冰', water: '水', earth: '土', wind: '风', void: '虚空',
}

export default function Weekly() {
  const player = useGameStore((s) => s.player)
  const [logs, setLogs] = useState<string[]>([])
  const bsInCombat = useGameStore((s) => s.inCombat)
  const [battling, setBattling] = useState(false)
  const [bestDamage, setBestDamage] = useState(0)
  const battlingRef = useRef(false)

  const bossQ = trpc.weekly.boss.useQuery(undefined, { refetchInterval: 60000 })
  const topQ = trpc.weekly.top.useQuery({ count: 10 })

  const addLog = (l: string) => setLogs((prev) => [...prev.slice(-80), l])

  if (!player) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <div className="game-card p-6 text-center text-xs" style={{ color: 'var(--text-muted)' }}>请先在角色面板创建角色</div>
      </div>
    )
  }

  const boss = bossQ.data?.boss
  const endsAt = bossQ.data?.endsAt
  const remain = endsAt ? Math.max(0, endsAt - Date.now()) : 0
  const remainDays = Math.floor(remain / 86400000)
  const remainHours = Math.floor((remain % 86400000) / 3600000)

  const fight = async () => {
    if (battlingRef.current || !player || !boss) return
    const gs = useGameStore.getState()
    if ((gs.inCombat || gs.isAutoExploring) && !confirmSwitchBattle('weekly')) return
    battlingRef.current = true
    setBattling(true)
    useGameStore.setState({ lawfulInBattle: true })
    gs.setInCombat(true)
    gs.setBattleMode('weekly')
    const snap = snapshotBattleStats() // 本场战斗属性快照：战斗中换装不影响本场
    gs.setPlayerStatuses([])
    gs.setCombatEnemies([{ ...boss, uid: `${boss.id}#0` }])
    addLog(`═══ 每周挑战 · ${boss.name} ═══`)
    addLog('规则：90 回合内尽量造成更多伤害，取本周最好成绩上榜')

    let damage = 0
    const bossMaxHp = boss.maxHp
    let settle: import('@/lib/battle-client').RunBattleResult['settle'] = null
    try {
      // 服务端战斗会话：状态托管在服务端，通过 onTick 统计对 Boss 的伤害
      const res = await runServerBattle({
        mode: 'weekly',
        layer: 60,
        enemies: [{ ...boss, uid: `${boss.id}#0` }],
        snap,
        isAborted: () => battleHijacked('weekly'),
        onLog: addLog,
        onTick: (r) => {
          const b = r.enemies.find((e) => e.id === boss.id)
          if (b) damage = bossMaxHp - b.hp
        },
      })
      settle = res.settle
    } finally {
      releaseBattle('weekly')
    }

    if (battleHijacked('weekly')) {
      // 战斗已被切换走：复位本地状态，不做结算
      battlingRef.current = false
      setBattling(false)
      return
    }
    // 结算：伤害/奖励/上榜均由服务端完成
    if (settle) {
      applyServerState(settle)
      damage = Math.max(0, Math.round(settle.weeklyDamage || damage))
    } else {
      damage = Math.max(0, Math.round(damage))
    }
    addLog(`═══ 挑战结束：总伤害 ${damage} ═══`)
    setBestDamage((d) => Math.max(d, damage))
    if (settle && settle.weeklyDamage > 0) {
      if (settle.exp > 0 || settle.gold > 0) addLog(`获得经验 ${settle.exp}、金币 ${settle.gold}`)
      if (settle.levelUps > 0) addLog(`★ 升级！等级提升 ${settle.levelUps} 级，全属性成长 ★`)
      addLog('成绩已提交至本周伤害榜')
      topQ.refetch()
    }
    // 战败复活：等待 5 秒后满血复活
    if (useGameStore.getState().player && useGameStore.getState().player!.hp <= 0) {
      addLog('你被 Boss 击倒了……5 秒后复活')
      await new Promise((r) => setTimeout(r, 5000))
      const afterR = useGameStore.getState()
      if (afterR.player) {
        afterR.updatePlayerHp(afterR.player.maxHp)
        afterR.updatePlayerMp(afterR.player.maxMp)
      }
      addLog('已复活并恢复全部状态')
    }
    battlingRef.current = false
    setBattling(false)
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-4">
      <div className="flex flex-shrink-0 items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
          <Crown size={15} style={{ color: 'var(--accent)' }} /> 每周 Boss 挑战
        </h2>
        <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          本周剩余 <span className="font-bold" style={{ color: 'var(--accent)' }}>{remainDays}天{remainHours}时</span>
        </div>
      </div>

      {/* Boss 卡 */}
      {boss && (
        <div className="game-card flex-shrink-0 p-3" style={{ borderColor: '#F85149' }}>
          <div className="mb-1 flex items-center gap-1.5">
            <Skull size={14} style={{ color: '#F85149' }} />
            <span className="text-sm font-bold" style={{ color: '#F85149' }}>{boss.name}</span>
            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>（{ELEMENT_NAMES[boss.element] || boss.element}系）</span>
          </div>
          <div className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
            HP {boss.hp} · 攻击 {boss.atk} · 防御 {boss.def} · 魔法 {boss.mag} · 魔防 {boss.mdef}
          </div>
          <div className="mt-1 text-[10px]" style={{ color: 'var(--text-muted)' }}>
            90 回合内造成的总伤害即成绩，伤害越高奖励越多；可重复挑战，取最好成绩。
          </div>
          <button onClick={fight} disabled={battling}
            className="mt-2 flex items-center gap-2 rounded-lg px-6 py-2 text-sm font-bold transition-all hover:scale-[1.03] active:scale-[0.97] disabled:opacity-50"
            style={{ background: 'var(--accent)', color: '#fff' }}>
            <Swords size={15} /> {battling ? '战斗中…' : '发起挑战'}
          </button>
          {bestDamage > 0 && (
            <span className="ml-3 text-xs" style={{ color: 'var(--text-secondary)' }}>本次最好：{bestDamage}</span>
          )}
        </div>
      )}

      {/* 本周排行 */}
      <div className="game-card flex-shrink-0 p-3">
        <div className="mb-1.5 flex items-center gap-1.5 text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
          <Trophy size={13} style={{ color: 'var(--accent)' }} /> 本周伤害榜
        </div>
        {(topQ.data || []).length === 0 && (
          <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>暂无成绩，来当本周第一个挑战者！</div>
        )}
        <div className="space-y-0.5">
          {(topQ.data || []).slice(0, 10).map((r) => (
            <div key={r.player} className="flex justify-between text-[11px]" style={{ color: 'var(--text-secondary)' }}>
              <span>#{r.rank} {r.meta?.name || r.player}</span>
              <span className="font-mono">{r.score}</span>
            </div>
          ))}
        </div>
      </div>

{bsInCombat && <div className="mb-3 flex-shrink-0"><BattleStage mode="weekly" /></div>}
            {/* 战斗日志 */}
      <div className="game-card min-h-0 flex-1 overflow-y-auto p-3">
        {logs.length === 0 && (
          <div className="py-6 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
            每周一 0 点轮换新 Boss 并清空榜单。挑战不消耗任何东西，放心打。
          </div>
        )}
        {logs.map((l, i) => {
          const isSkill = l.includes('施放') || l.includes('使用了')
          return (
            <div key={i} className="text-[11px] leading-relaxed" style={
              isSkill
                ? { color: '#FFC94D', fontWeight: 700, borderLeft: '3px solid #FFC94D', paddingLeft: 6, backgroundColor: 'rgba(255,201,77,0.08)', textShadow: '0 1px 2px #000' }
                : { color: 'var(--text-secondary)' }
            }>{isSkill ? `✦ ${l}` : l}</div>
          )
        })}
      </div>
    </div>
  )
}
