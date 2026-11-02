import { useState, useRef } from 'react'
import { Crown, Swords, Trophy, Skull } from 'lucide-react'
import { useGameStore, getPlayerMods } from '@/stores/gameStore'
import { trpc } from '@/providers/trpc'
import { getItemInfo } from '@/lib/catalog'
import { chooseAutoSkill } from '@/lib/battle-ai'
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
  const combatTurnMut = trpc.game.combatTurn.useMutation()
  const submitMut = trpc.weekly.submit.useMutation()

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
    if (gs.inCombat || gs.isAutoExploring) {
      addLog('另一场战斗/探索进行中，结束后再挑战')
      return
    }
    battlingRef.current = true
    setBattling(true)
    useGameStore.setState({ lawfulInBattle: true })
    gs.setInCombat(true)
    gs.setPlayerStatuses([])
    gs.setCombatEnemies([{ ...boss }])
    addLog(`═══ 每周挑战 · ${boss.name} ═══`)
    addLog('规则：90 回合内尽量造成更多伤害，取本周最好成绩上榜')

    let damage = 0
    const bossMaxHp = boss.maxHp
    try {
      for (let round = 1; round <= 90; round++) {
        const cur = useGameStore.getState()
        const alive = cur.combatEnemies.filter((e) => e.hp > 0)
        if (alive.length === 0) break
        const p0 = cur.player
        if (!p0 || p0.hp <= 0) { addLog('你被击败了...'); break }

        // 自动喝药
        const threshold = cur.settings.autoPotionThreshold ?? 50
        if (cur.settings.autoPotion && p0.hp / p0.maxHp * 100 < threshold) {
          const healOf = (i: { effect?: unknown; id: string }) =>
            (((i.effect as any)?.heal ?? (getItemInfo(i.id)?.effect as any)?.heal ?? 0) as number)
          const potion = cur.inventory
            .filter((i) => i.type === 'consumable' && i.quantity > 0 && healOf(i) > 0)
            .sort((a, b) => healOf(a) - healOf(b))[0]
          if (potion) {
            const r = cur.useConsumable(potion.uid)
            if (r.success) addLog(`⚕ 自动使用 ${potion.name}：${r.message}`)
          }
        }

        const p = useGameStore.getState().player!
        const st0 = useGameStore.getState()
        const sid = chooseAutoSkill(
          { hp: p.hp, maxHp: p.maxHp, mp: p.mp, skills: p.skills || [],
            statuses: st0.playerStatuses || [], cooldowns: st0.skillCooldowns },
          p.skills || [], (alive[0] as unknown as { statuses?: Array<{ id: string }> })?.statuses)
        const action: { type: 'attack' | 'skill'; skillId?: string } = sid ? { type: 'skill', skillId: sid } : { type: 'attack' }

        const result = await combatTurnMut.mutateAsync({
          player: {
            id: p.id, name: p.name, hp: p.hp, maxHp: p.maxHp, mp: p.mp, maxMp: p.maxMp,
            atk: p.atk, def: p.def, mag: p.mag, mdef: p.mdef, agi: p.agi, luk: p.luk,
            con: p.con || 0, wil: p.wil || 0,
            skills: p.skills, element: p.element || 'none',
            statuses: st0.playerStatuses || [], cooldowns: st0.skillCooldowns || {},
            mods: getPlayerMods().combat,
          },
          enemies: alive.map((e) => ({
            id: e.id, name: e.name, hp: e.hp, maxHp: e.maxHp, mp: e.mp || 0, maxMp: e.maxMp || 0,
            atk: e.atk, def: e.def, mag: e.mag || 0, mdef: e.mdef || 0, agi: e.agi || 0, luk: e.luk || 0,
            skills: e.skills || [], element: e.element || 'none', aiType: e.aiType,
            statuses: (e as any).statuses || [],
          })),
          action: { type: action.type, targetId: alive[0].id, skillId: action.skillId },
          turnSeed: Date.now() + round,
          layer: 60,
        })

        result.logs.forEach((l) => addLog(l))
        const after = useGameStore.getState()
        const bossNow = result.enemies.find((e) => e.id === boss.id)
        if (bossNow) damage = bossMaxHp - bossNow.hp
        const merged = after.combatEnemies.map((e) => {
          const u = result.enemies.find((r) => r.id === e.id)
          return u ? { ...e, ...u } : e
        })
        after.setCombatEnemies(merged)
        after.updatePlayerHp(result.player.hp)
        after.updatePlayerMp(result.player.mp)
        after.setPlayerStatuses((result.player as any).statuses || [])
        after.setSkillCooldowns((result.player as any).cooldowns || {})
        if (result.ended) break
      }
    } finally {
      useGameStore.getState().setInCombat(false)
      useGameStore.setState({ lawfulInBattle: false })
    }

    // 结算
    damage = Math.max(0, Math.round(damage))
    addLog(`═══ 挑战结束：总伤害 ${damage} ═══`)
    setBestDamage((d) => Math.max(d, damage))
    if (damage > 0) {
      const after = useGameStore.getState()
      // 参与奖：经验 + 金币（按伤害折算）
      const exp = Math.floor(damage * 0.5)
      const gold = Math.floor(damage * 1.5)
      after.addPlayerExp(exp)
      after.addPlayerGold(gold)
      after.trackTaskEvent('bossKills', 1)
      addLog(`获得经验 ${exp}、金币 ${gold}`)
      const name = localStorage.getItem('ad_user') || ''
      if (name) {
        try {
          const r = await submitMut.mutateAsync({ playerId: name, playerName: name, damage })
          addLog(r.rank ? `本周排名：第 ${r.rank} 名` : '成绩已提交')
          topQ.refetch()
        } catch { /* 排行提交失败不影响奖励 */ }
      }
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

{bsInCombat && <div className="mb-3 flex-shrink-0"><BattleStage /></div>}
            {/* 战斗日志 */}
      <div className="game-card min-h-0 flex-1 overflow-y-auto p-3">
        {logs.length === 0 && (
          <div className="py-6 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
            每周一 0 点轮换新 Boss 并清空榜单。挑战不消耗任何东西，放心打。
          </div>
        )}
        {logs.map((l, i) => (
          <div key={i} className="text-[11px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{l}</div>
        ))}
      </div>
    </div>
  )
}
