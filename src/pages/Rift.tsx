import { useState, useRef, useCallback, useEffect } from 'react'
import { Sparkles, Swords, Coins, Gem, RotateCcw } from 'lucide-react'
import { useGameStore, shouldAutoDisassemble, getDisassembleGold, getPlayerMods } from '@/stores/gameStore'
import { trpc } from '@/providers/trpc'
import { getItemInfo } from '@/lib/catalog'
import { chooseAutoSkill } from '@/lib/battle-ai'
import BattleStage from '@/components/BattleStage'

interface RiftEnemy {
  id: string; name: string; hp: number; maxHp: number; mp: number; maxMp: number
  atk: number; def: number; mag: number; mdef: number; agi: number; luk: number
  skills: string[]; element: string; aiType?: string
  dropTable?: Array<{ itemId: string; name: string; type: string; chance: number; quantityMin: number; quantityMax: number; quality: string; minLayer?: number }>
}
interface RiftModifier {
  id: string; name: string; desc: string
  playerMods?: Record<string, number>; rewardBonus: number
}
interface RiftStageData {
  stage: number; maxStage: number; name: string; desc: string
  isBoss: boolean; enemies: RiftEnemy[]; modifiers: RiftModifier[]
}

const GEM_IDS = ['ruby', 'sapphire', 'emerald', 'topaz', 'onyx', 'amethyst']

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function Rift() {
  const player = useGameStore((s) => s.player)
  const rift = useGameStore((s) => s.rift)
  const [logs, setLogs] = useState<string[]>([])
  const bsInCombat = useGameStore((s) => s.inCombat)
  const [battling, setBattling] = useState(false)
  const battlingRef = useRef(false)

  const today = todayStr()
  // 新的一天：重置进度
  useEffect(() => {
    if (rift.date !== today) {
      useGameStore.getState().setRift({ date: today, stage: 1, clearedDate: rift.clearedDate })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today])

  const stage = rift.date === today ? rift.stage : 1
  const clearedToday = rift.clearedDate === today
  const done = clearedToday || stage > 5

  const stageQ = trpc.game.dailyRift.useQuery(
    { date: today, classId: player?.classId || 'warrior', level: player?.level || 1, stage: Math.min(stage, 5) },
    { enabled: !!player && !done }
  )
  const combatTurnMut = trpc.game.combatTurn.useMutation()

  const addLog = (l: string) => setLogs((prev) => [...prev.slice(-80), l])
  const data = stageQ.data as RiftStageData | undefined

  const autoBattle = useCallback(async (d: RiftStageData): Promise<boolean> => {
    const gs = useGameStore.getState()
    gs.setInCombat(true)
    gs.setPlayerStatuses([])
    gs.setCombatEnemies(d.enemies.map((e) => ({ ...e })))
    // 玩家增益词缀并入 mods
    const baseMods = getPlayerMods().combat
    const riftMods = { ...baseMods }
    for (const m of d.modifiers) {
      for (const [k, v] of Object.entries(m.playerMods || {})) {
        (riftMods as Record<string, number>)[k] = ((riftMods as Record<string, number>)[k] || 0) + v
      }
    }
    let victory = false

    try {
      for (let round = 1; round <= 90; round++) {
        const cur = useGameStore.getState()
        const alive = cur.combatEnemies.filter((e) => e.hp > 0)
        if (alive.length === 0) { victory = true; break }
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
            statuses: useGameStore.getState().playerStatuses || [],
            cooldowns: useGameStore.getState().skillCooldowns || {},
            mods: riftMods,
          },
          enemies: alive.map((e) => ({
            id: e.id, name: e.name, hp: e.hp, maxHp: e.maxHp, mp: e.mp || 0, maxMp: e.maxMp || 0,
            atk: e.atk, def: e.def, mag: e.mag || 0, mdef: e.mdef || 0, agi: e.agi || 0, luk: e.luk || 0,
            skills: e.skills || [], element: e.element || 'none', aiType: e.aiType,
            statuses: (e as any).statuses || [],
          })),
          action: { type: action.type, targetId: alive[0].id, skillId: action.skillId },
          turnSeed: Date.now() + round,
          layer: 1,
          enemyDropTables: alive.map((e) => ({ enemyId: e.id, dropTable: d.enemies.find((r2) => r2.id === e.id)?.dropTable })),
        })

        result.logs.forEach((l) => addLog(l))
        const after = useGameStore.getState()
        after.setCombatEnemies(after.combatEnemies.map((e) => {
          const u = result.enemies.find((r) => r.id === e.id)
          return u ? { ...e, ...u } : e
        }))
        after.updatePlayerHp(result.player.hp)
        after.updatePlayerMp(result.player.mp)
        after.setPlayerStatuses((result.player as any).statuses || [])
        after.setSkillCooldowns((result.player as any).cooldowns || {})

        if (result.victory) {
          victory = true
          const utilMods = getPlayerMods().utility
          for (const drop of result.drops || []) {
            const cat = getItemInfo(drop.itemId)
            const type = (drop.type || cat?.type || 'material') as 'equipment' | 'consumable' | 'material' | 'currency' | 'skillbook'
            const dName = drop.name || cat?.name || drop.itemId
            if (type === 'currency') {
              if (drop.itemId === 'gem_diamond') {
                after.addPlayerDiamonds(drop.quantity)
                addLog(`获得 钻石×${drop.quantity}`)
              } else {
                const mult = 1 + (utilMods.goldGain || 0) / 100
                after.addPlayerGold(Math.floor(drop.quantity * (cat?.value ?? 1) * mult))
                addLog(`获得 ${dName}×${drop.quantity}`)
              }
              continue
            }
            const item = {
              uid: `rift_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
              id: drop.itemId, name: dName, type, quality: (drop.quality || 'common') as never,
              quantity: drop.quantity,
              slot: (cat?.slot) as never, stats: drop.stats, affixes: drop.affixes,
              setId: cat?.setId, setTier: cat?.setTier,
              effect: cat?.effect as never, value: cat?.value,
            }
            if (shouldAutoDisassemble(item as never, after.settings)) {
              const g = getDisassembleGold(item as never)
              after.addPlayerGold(g)
              addLog(`${dName} 已自动分解 +${g}金币`)
            } else {
              after.addItem(item as never)
              addLog(`获得 ${dName}×${drop.quantity}`)
            }
          }
        }
        if (result.ended) break
      }
    } finally {
      useGameStore.getState().setInCombat(false)
    }
    return victory
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const challenge = async () => {
    if (battlingRef.current || !player || !data || done) return
    const gsNow = useGameStore.getState()
    if (gsNow.inCombat || gsNow.isAutoExploring) {
      addLog('有其他战斗/探索进行中，结束后再挑战秘境')
      return
    }
    battlingRef.current = true
    setBattling(true)
    useGameStore.setState({ riftInBattle: true })
    addLog(`═══ ${data.name} ═══`)
    addLog(`遭遇：${data.enemies.map((e) => e.name).join('、')}`)
    const won = await autoBattle(data)
    const after = useGameStore.getState()
    if (won) {
      const utilMods = getPlayerMods().utility
      const rewardMult = 1 + data.modifiers.reduce((s, m) => s + m.rewardBonus, 0) / 100
      const lv = player.level
      const base = data.enemies.reduce((sum, e) => sum + 10 + lv * 3 + Math.ceil(e.maxHp / 20) + e.atk, 0)
      const exp = Math.floor(base * (data.isBoss ? 2 : 1) * rewardMult * (1 + (utilMods.expGain || 0) / 100))
      const gold = Math.floor((10 + lv * 5) * (data.isBoss ? 5 : 1) * rewardMult * (1 + (utilMods.goldGain || 0) / 100))
      after.addPlayerExp(exp)
      after.addPlayerGold(gold)
      addLog(`获得经验 ${exp}、金币 ${gold}`)
      after.trackTaskEvent('kills', data.enemies.length)
      if (data.isBoss) after.trackTaskEvent('bossKills', 1)

      if (data.isBoss) {
        // 通关：钻石 + 随机无瑕宝石
        const diamonds = 3
        after.addPlayerDiamonds(diamonds)
        const gid = `gem_${GEM_IDS[Math.floor(Math.random() * GEM_IDS.length)]}_2`
        const gdef = getItemInfo(gid)
        if (gdef) {
          after.addItem({
            uid: `rift_gem_${Date.now()}`, id: gid, name: gdef.name, type: 'material',
            quality: gdef.quality, quantity: 1, desc: gdef.desc || '', value: gdef.value,
          } as never)
        }
        addLog(`★ 秘境通关！额外获得 钻石×${diamonds}、${gdef?.name || '宝石'}×1 ★`)
        after.setRift({ date: today, stage: 6, clearedDate: today })
      } else {
        after.setRift({ date: today, stage: stage + 1, clearedDate: rift.clearedDate })
        addLog(`═══ 第 ${stage} 境已突破 ═══`)
      }
    } else {
      addLog('你被秘境击退了……5 秒后复活（进度保留）')
      await new Promise((r) => setTimeout(r, 5000))
      const afterR = useGameStore.getState()
      if (afterR.player) {
        afterR.updatePlayerHp(afterR.player.maxHp)
        afterR.updatePlayerMp(afterR.player.maxMp)
      }
      addLog('已复活并恢复全部状态，可以重新挑战')
    }
    useGameStore.setState({ riftInBattle: false })
    battlingRef.current = false
    setBattling(false)
  }

  // 刷新后自动恢复未完成的战斗
  useEffect(() => {
    if (useGameStore.getState().riftInBattle && !battlingRef.current && data && player && !done) {
      useGameStore.setState({ riftInBattle: false })
      addLog('检测到未完成的秘境战斗，自动重新挑战当前境…')
      challenge()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  if (!player) return null

  return (
    <div className="flex min-h-screen flex-col" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <div className="border-b px-4 py-3" style={{ borderColor: 'var(--border-color)' }}>
        <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
          <Sparkles size={18} className="mr-1 inline" style={{ color: '#A371F7' }} /> 每日秘境
        </h2>
        <div className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
          {today} · 共 5 境，每天重置；词缀每日变化，通关奖励钻石与宝石
        </div>
      </div>

      {/* 当日词缀 */}
      {data && (
        <div className="flex flex-wrap gap-2 border-b px-4 py-2" style={{ borderColor: 'var(--border-color)' }}>
          {data.modifiers.map((m) => (
            <span key={m.id} className="rounded px-2 py-1 text-xs"
              style={{
                backgroundColor: m.playerMods ? 'rgba(63,185,80,0.12)' : 'rgba(248,81,73,0.12)',
                color: m.playerMods ? '#3FB950' : '#F85149',
                border: `1px solid ${m.playerMods ? 'rgba(63,185,80,0.4)' : 'rgba(248,81,73,0.4)'}`,
              }}>
              {m.name}：{m.desc}
            </span>
          ))}
        </div>
      )}

      {/* 进度 */}
      <div className="flex items-center gap-2 px-4 py-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold"
            style={{
              backgroundColor: i < stage || done ? 'rgba(63,185,80,0.2)' : i === stage && !done ? 'var(--accent)' : 'var(--bg-hover)',
              color: i < stage || done ? '#3FB950' : i === stage && !done ? 'var(--bg-primary)' : 'var(--text-muted)',
            }}>
            {i < stage || done ? '✓' : i}
          </div>
        ))}
        <span className="ml-2 text-xs" style={{ color: 'var(--text-muted)' }}>
          {done ? '今日已通关' : `当前：第 ${stage} 境${data?.isBoss ? '（秘境守卫）' : ''}`}
        </span>
      </div>

      <div className="px-4 pb-3">
        {done ? (
          <div className="rounded-lg p-4 text-center text-sm" style={{ backgroundColor: 'var(--bg-hover)', color: '#C9A84C' }}>
            今日秘境已全部通关，明天再来吧
          </div>
        ) : (
          <button onClick={challenge} disabled={battling || !data}
            className="game-btn-primary w-full" style={{ opacity: battling || !data ? 0.5 : 1 }}>
            {battling ? <RotateCcw size={14} className="mr-1 inline animate-spin" /> : <Swords size={14} className="mr-1 inline" />}
            {battling ? '战斗进行中…' : `挑战第 ${stage} 境`}
          </button>
        )}
      </div>

{bsInCombat && <div className="mb-3 flex-shrink-0"><BattleStage /></div>}
            {/* 战斗日志 */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <div className="rounded-lg p-3 font-mono text-xs leading-relaxed" style={{ backgroundColor: 'var(--bg-card)', color: 'var(--text-secondary)', minHeight: 200 }}>
          {logs.length === 0 ? (
            <span style={{ color: 'var(--text-muted)' }}>战斗日志将显示在这里…</span>
          ) : logs.map((l, i) => <div key={i}>{l}</div>)}
        </div>
      </div>

      <div className="border-t px-4 py-2 text-[10px]" style={{ borderColor: 'var(--border-color)', color: 'var(--text-muted)' }}>
        <Coins size={10} className="mr-1 inline" />失败不扣进度 · <Gem size={10} className="mr-1 inline" />通关第 5 境得钻石×3 + 无瑕宝石
      </div>
    </div>
  )
}
