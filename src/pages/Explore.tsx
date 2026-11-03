import { useState, useCallback, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router'
import { Swords, Home, Compass, Play, Pause, Zap, Skull, Coins, Heart, Shield } from 'lucide-react'
import { useGameStore, shouldAutoDisassemble, getDisassembleGold, getPlayerMods, getExpNeed } from '@/stores/gameStore'
import { trpc } from '@/providers/trpc'
import { loadCatalogs, getItemInfo, getTierName } from '@/lib/catalog'
import { chooseAutoSkill } from '@/lib/battle-ai'
import BattleStage from '@/components/BattleStage'

const ENCOUNTER_NAMES: Record<string, string> = { normal: '普通怪物', elite: '精英怪物', boss: 'Boss' }
const ENCOUNTER_COLORS: Record<string, string> = { normal: '#8B949E', elite: '#A371F7', boss: '#F85149' }

const LOOT_QUALITY_COLORS: Record<string, string> = {
  common: '#9DA7B3', fine: '#3FB950', rare: '#58A6FF',
  epic: '#A371F7', legendary: '#F0A832', mythic: '#FF7B72', eternal: '#7EE7F5',
}

export default function Explore() {
  const navigate = useNavigate()
  const store = useGameStore()
  const [logs, setLogs] = useState<string[]>([])
  const [isRunning, setIsRunning] = useState(false)
  const [moving, setMoving] = useState(false)
  const [currentLayer, _setCurrentLayer] = useState(1)
  const setCurrentLayer = useCallback((v: number) => { currentLayerRef.current = v; _setCurrentLayer(v) }, [])
  const [wave, _setWave] = useState(0)
  const setWave = useCallback((v: number) => { waveRef.current = v; _setWave(v) }, [])
  const [lastEncounter, setLastEncounter] = useState<{ type: string; enemies: Array<{ id: string; name: string; hp: number; maxHp: number }> } | null>(null)
  const [stats, setStats] = useState({ waves: 0, kills: 0, items: 0, floor: 1, defeats: 0 })
  const [lootHistory, setLootHistory] = useState<Array<{ name: string; quantity: number; quality: string; note?: string }>>([])
  const recordLoot = useCallback((entries: Array<{ name: string; quantity: number; quality?: string; note?: string }>) => {
    setLootHistory((prev) => [...entries.map((e) => ({ name: e.name, quantity: e.quantity, quality: e.quality || 'common', note: e.note })), ...prev].slice(0, 200))
  }, [])
  const isRunningRef = useRef(false)
  const currentLayerRef = useRef(1)
  const waveRef = useRef(0)
  const isBattlingRef = useRef(false)

  const encounterMut = trpc.game.randomEncounter.useMutation()
  const combatTurnMut = trpc.game.combatTurn.useMutation()
  const offlineStartMut = trpc.game.offlineStart.useMutation()
  const offlineHeartbeatMut = trpc.game.offlineHeartbeat.useMutation()
  const offlineStopMut = trpc.game.offlineStop.useMutation()

  // 离线挂机：角色快照
  const buildSnapshot = useCallback(() => {
    const gs = useGameStore.getState()
    const p = gs.player
    if (!p) return null
    return {
      playerName: localStorage.getItem('ad_user') || '冒险者',
      player: {
        level: p.level, hp: p.hp, maxHp: p.maxHp, mp: p.mp, maxMp: p.maxMp,
        atk: p.atk, def: p.def, mag: p.mag, mdef: p.mdef,
        agi: p.agi, luk: p.luk, con: p.con || 0, wil: p.wil || 0,
      },
      layer: currentLayerRef.current,
    }
  }, [])

  // 探索中每 20 秒上报心跳（离线后从最后心跳开始结算）
  useEffect(() => {
    if (!isRunning) return
    const timer = setInterval(() => {
      const snap = buildSnapshot()
      if (snap) offlineHeartbeatMut.mutate(snap)
    }, 20000)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRunning])

  // 加载物品/技能目录（技能MP消耗、掉落解析用）
  useEffect(() => { loadCatalogs() }, [])

  const addLog = useCallback((msg: string) => {
    // 最新日志排在最上面，最多保留100条
    setLogs((prev) => [`[${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}] ${msg}`, ...prev].slice(0, 100))
  }, [])

  // ─── 拾取战利品（真实物品入包，货币自动兑换金币）───
  const collectLoot = useCallback((loot: Array<{
    itemId: string; name?: string; type?: string; quality?: string; quantity: number
    slot?: string; stats?: Record<string, number>; affixes?: Record<string, number>
    desc?: string; value?: number
    setId?: string; setTier?: number; effect?: Record<string, unknown>; learnSkillId?: string
  }>) => {
    const gs = useGameStore.getState()
    for (const l of loot) {
      const cat = getItemInfo(l.itemId)
      const type = (l.type || cat?.type || 'material') as 'equipment' | 'consumable' | 'material' | 'currency' | 'skillbook'
      const name = l.name || cat?.name || l.itemId
      if (type === 'currency') {
        const value = l.value ?? cat?.value ?? 1
        const goldMult = 1 + (getPlayerMods().utility.goldGain || 0) / 100
        const gold = Math.floor(l.quantity * value * goldMult)
        gs.addPlayerGold(gold)
        addLog(`拾取 ${name}×${l.quantity}（+${gold} 金币）`)
        recordLoot([{ name, quantity: l.quantity, quality: l.quality || cat?.quality }])
        continue
      }
      const item = {
        uid: `loot_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        id: l.itemId, name, type,
        slot: (l.slot || cat?.slot) as never,
        quality: (l.quality || cat?.quality || 'common') as never,
        quantity: l.quantity,
        desc: l.desc || cat?.desc || name,
        stats: l.stats || cat?.stats,
        affixes: l.affixes,
        setId: l.setId || cat?.setId,
        setTier: l.setTier || cat?.setTier,
        value: l.value ?? cat?.value,
        effect: l.effect || cat?.effect,
        learnSkillId: l.learnSkillId || cat?.learnSkillId,
      }
      // 符合自动分解条件的装备直接分解为金币
      if (shouldAutoDisassemble(item, gs.settings)) {
        const gold = getDisassembleGold(item)
        gs.addPlayerGold(gold)
        addLog(`拾取 ${name}×${l.quantity} → 自动分解（+${gold} 金币）`)
        recordLoot([{ name, quantity: l.quantity, quality: item.quality, note: `已分解 +${gold}金币` }])
        continue
      }
      gs.addItem(item)
      addLog(`拾取 ${name}×${l.quantity}`)
      recordLoot([{ name, quantity: l.quantity, quality: item.quality }])
    }
    setStats((s) => ({ ...s, items: s.items + loot.length }))
  }, [addLog, recordLoot])

  // ─── 探索主循环：一波接一波的随机遇敌 ───
  const exploreLoop = useCallback(async () => {
    while (isRunningRef.current) {
      // 朝深处探索的行进间隔
      setMoving(true)
      addLog('正在朝深处探索……')
      await new Promise((r) => setTimeout(r, 2000))
      setMoving(false)
      if (!isRunningRef.current) break

      try {
        const enc = await encounterMut.mutateAsync({
          layer: currentLayerRef.current,
          wavesSinceBoss: waveRef.current,
        })
        if (!enc || !enc.enemies || enc.enemies.length === 0) continue

        setWave(enc.wave)
        setStats((s) => ({ ...s, waves: s.waves + 1 }))
        useGameStore.getState().trackTaskEvent('rooms', 1)

        const typeName = ENCOUNTER_NAMES[enc.type] || enc.type
        if (enc.type === 'boss') {
          addLog(enc.wave >= 100
            ? `⚠ 第 ${enc.wave} 波——深渊的怒吼逼近，Boss 出现了！（保底触发）`
            : `⚠ 一股强大的气息突然降临，Boss 出现了！`)
        } else if (enc.type === 'elite') {
          addLog(`遭遇精英敌人：${enc.enemies.map((e) => e.name).join('、')}`)
        } else {
          addLog(`遭遇敌人：${enc.enemies.map((e) => e.name).join('、')}`)
        }
        setLastEncounter({ type: enc.type, enemies: enc.enemies.map((e) => ({ id: e.id, name: e.name, hp: e.hp, maxHp: e.maxHp })) })

        const won = await autoBattle(enc.enemies)

        // 战利品
        if (enc.loot && enc.loot.length > 0) collectLoot(enc.loot as never)

        if (won) {
          if (enc.type === 'boss') {
            // 通关恢复：HP/MP 各恢复 50%
            const gsH = useGameStore.getState()
            if (gsH.player) {
              const healHp = Math.floor(gsH.player.maxHp * 0.5)
              const healMp = Math.floor(gsH.player.maxMp * 0.5)
              gsH.updatePlayerHp(Math.min(gsH.player.maxHp, gsH.player.hp + healHp))
              gsH.updatePlayerMp(Math.min(gsH.player.maxMp, gsH.player.mp + healMp))
              addLog(`通关恢复：HP +${healHp}，MP +${healMp}`)
            }
            useGameStore.getState().trackTaskEvent('bossKills', 1)
            useGameStore.getState().trackTaskEvent('layers', 1)
            const nextLayer = currentLayerRef.current + 1
            const prevMax = gsH.player?.maxLayer || 1
            gsH.updateMaxLayer(nextLayer)
            addLog(`═══ 已深入至第 ${nextLayer} 层 ═══`)
            if (nextLayer > prevMax) addLog(`新纪录！最深到达第 ${nextLayer} 层`)
            setCurrentLayer(nextLayer)
            setStats((s) => ({ ...s, floor: nextLayer }))
            setWave(0)
          } else {
            setWave(enc.wave)
          }
          setLastEncounter(null)
          useGameStore.getState().setCombatEnemies([])
        } else {
          // 战败复活：等待 5 秒后满血复活，波次进度保留
          setStats((s) => ({ ...s, defeats: s.defeats + 1 }))
          addLog(`战败！5 秒后复活...`)
          await new Promise((r) => setTimeout(r, 5000))
          const gsLose = useGameStore.getState()
          if (gsLose.player) {
            gsLose.updatePlayerHp(gsLose.player.maxHp)
            gsLose.updatePlayerMp(gsLose.player.maxMp)
          }
          addLog(`已复活并恢复全部状态，继续探索...`)
          setLastEncounter(null)
          useGameStore.getState().setCombatEnemies([])
        }
      } catch (err) {
        addLog(`探索出错: ${err}`)
        await new Promise((r) => setTimeout(r, 3000))
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addLog, collectLoot])

  // ─── 自动战斗（返回是否胜利）───
  const autoBattle = useCallback(async (enemies: any[]): Promise<boolean> => {
    if (isBattlingRef.current) return true // 防止并发战斗
    isBattlingRef.current = true

    addLog(`── 战斗开始 ──`)
    const gs = useGameStore.getState()
    gs.setInCombat(true)
    gs.setPlayerStatuses([])
    gs.setCombatEnemies(enemies.map((e) => ({
      id: e.id, name: e.name, hp: e.hp, maxHp: e.maxHp,
      mp: e.mp ?? 0, maxMp: e.maxMp ?? 0,
      atk: e.atk ?? 10, def: e.def ?? 5,
      mag: e.mag ?? 0, mdef: e.mdef ?? 3,
      agi: e.agi ?? 8, luk: e.luk ?? 3,
      skills: e.skills ?? [], element: e.element ?? 'none',
      aiType: e.aiType,
    })))

    let victory = false
    const MAX_ROUNDS = 90

    try {
      for (let round = 1; round <= MAX_ROUNDS; round++) {
        if (!isRunningRef.current) break

        // 每轮读取最新状态（避免闭包旧值）
        const cur = useGameStore.getState()
        const aliveEnemies = cur.combatEnemies.filter((e) => e.hp > 0)
        if (aliveEnemies.length === 0) { victory = true; break }

        const cur0 = useGameStore.getState()
        const player0 = cur0.player
        if (!player0 || player0.hp <= 0) { addLog('你被击败了...'); break }

        // 自动喝药：HP 低于阈值时使用背包里最小的生命药水
        const threshold = cur0.settings.autoPotionThreshold ?? 50
        if (cur0.settings.autoPotion && player0.hp / player0.maxHp * 100 < threshold) {
          const healOf = (i: { effect?: unknown; id: string }) => {
            const e = (i.effect as any)?.heal ?? (getItemInfo(i.id)?.effect as any)?.heal ?? 0
            return e as number
          }
          const potion = cur0.inventory
            .filter((i) => i.type === 'consumable' && i.quantity > 0 && healOf(i) > 0)
            .sort((a, b) => healOf(a) - healOf(b))[0]
          if (potion) {
            const r = cur0.useConsumable(potion.uid)
            if (r.success) addLog(`⚕ 自动使用 ${potion.name}：${r.message}`)
          }
        }

        const player = useGameStore.getState().player!
        // 智能技能选择：按玩家排序，跳过冷却/蓝不足/满血治疗/重复增益/重复DoT
        const firstEnemy = aliveEnemies[0] as unknown as { statuses?: Array<{ id: string }> }
        const sid = chooseAutoSkill(
          { hp: player.hp, maxHp: player.maxHp, mp: player.mp, skills: player.skills || [],
            statuses: cur0.playerStatuses || [], cooldowns: cur0.skillCooldowns },
          player.skills || [], firstEnemy?.statuses)
        const action: { type: 'attack' | 'skill'; skillId?: string } = sid ? { type: 'skill', skillId: sid } : { type: 'attack' }

        const result = await combatTurnMut.mutateAsync({
          player: {
            id: player.id, name: player.name, hp: player.hp, maxHp: player.maxHp,
            mp: player.mp, maxMp: player.maxMp, atk: player.atk, def: player.def,
            mag: player.mag, mdef: player.mdef, agi: player.agi, luk: player.luk,
            con: player.con || 0, wil: player.wil || 0,
            skills: player.skills, element: player.element || 'none',
            statuses: cur.playerStatuses || [],
            cooldowns: cur.skillCooldowns || {},
            mods: getPlayerMods().combat,
          },
          enemies: aliveEnemies.map((e) => ({
            id: e.id, name: e.name, hp: e.hp, maxHp: e.maxHp,
            mp: e.mp || 0, maxMp: e.maxMp || 0, atk: e.atk, def: e.def,
            mag: e.mag || 0, mdef: e.mdef || 0, agi: e.agi || 0, luk: e.luk || 0,
            skills: e.skills || [], element: e.element || 'none', aiType: e.aiType,
            statuses: (e as any).statuses || [],
          })),
          action: { type: action.type, targetId: aliveEnemies[0].id, skillId: action.skillId },
          turnSeed: Date.now() + round,
          layer: currentLayerRef.current,
          enemyDropTables: aliveEnemies.map((e) => ({ enemyId: e.id, dropTable: (e as any).dropTable })),
        })

        result.logs.forEach((log) => addLog(log))

        // 每轮同步最新状态到 store（血量实时显示）
        // 注意：result.enemies 只包含本轮出战（存活）的敌人，需按 id 合并回完整列表，
        // 否则已死亡敌人会从显示中消失，造成"数量对不上"的错觉
        const after = useGameStore.getState()
        const mergedEnemies = after.combatEnemies.map((e) => {
          const u = result.enemies.find((r) => r.id === e.id)
          return u ? { ...e, ...u } : e
        })
        after.setCombatEnemies(mergedEnemies)
        after.updatePlayerHp(result.player.hp)
        after.updatePlayerMp(result.player.mp)
        after.setPlayerStatuses((result.player as any).statuses || [])
        after.setSkillCooldowns((result.player as any).cooldowns || {})

        if (result.victory) {
          victory = true
          addLog(`── 战斗胜利！──`)
          setStats((s) => ({ ...s, kills: s.kills + 1 }))
          useGameStore.getState().trackTaskEvent('kills', enemies.length)
          // 经验奖励：基础 10 + 层数×3 + 敌人强度（血/20 + 攻），boss（HP≥500）双倍
          const utilMods = getPlayerMods().utility
          const lv = currentLayerRef.current
          const expGain = Math.floor(enemies.reduce((sum, e) => {
            const base = 10 + lv * 3 + Math.ceil((e.maxHp || 30) / 20) + (e.atk || 5)
            return sum + ((e.maxHp || 0) >= 500 ? base * 2 : base)
          }, 0) * (1 + (utilMods.expGain || 0) / 100))
          after.addPlayerExp(expGain)
          addLog(`获得经验 ${expGain}（当前 Lv.${useGameStore.getState().player?.level}）`)
          // 击杀回复词条
          const killHeal = (utilMods.killHeal || 0) * enemies.length
          const killMp = (utilMods.killMp || 0) * enemies.length
          if (killHeal > 0 && after.player) {
            after.updatePlayerHp(Math.min(after.player.maxHp, after.player.hp + killHeal))
            addLog(`击杀回复：恢复 ${killHeal} 点生命`)
          }
          if (killMp > 0 && after.player) {
            after.updatePlayerMp(Math.min(after.player.maxMp, after.player.mp + killMp))
          }
          if (result.drops && result.drops.length > 0) {
            for (const drop of result.drops) {
              const cat = getItemInfo(drop.itemId)
              const type = (drop.type || cat?.type || 'material') as 'equipment' | 'consumable' | 'material' | 'currency' | 'skillbook'
              const dName = drop.name || cat?.name || drop.itemId
              const dQuality = (drop.quality || cat?.quality || 'common') as string
              if (type === 'currency') {
                const goldMult = 1 + (getPlayerMods().utility.goldGain || 0) / 100
                after.addPlayerGold(Math.floor(drop.quantity * (cat?.value ?? 1) * goldMult))
                recordLoot([{ name: dName, quantity: drop.quantity, quality: dQuality }])
                continue
              }
              const item = {
                uid: `drop_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                id: drop.itemId, name: dName,
                type,
                slot: cat?.slot as never,
                quality: dQuality as never,
                quantity: drop.quantity,
                desc: cat?.desc || drop.name,
                stats: (drop as { stats?: Record<string, number> }).stats || cat?.stats,
                affixes: (drop as { affixes?: Record<string, number> }).affixes,
                setId: cat?.setId,
                setTier: cat?.setTier,
                value: cat?.value,
                effect: cat?.effect,
                learnSkillId: cat?.learnSkillId,
              }
              // 符合自动分解条件的装备直接分解为金币
              if (shouldAutoDisassemble(item, after.settings)) {
                const gold = getDisassembleGold(item)
                after.addPlayerGold(gold)
                addLog(`${dName} 符合自动分解条件 → +${gold} 金币`)
                recordLoot([{ name: dName, quantity: drop.quantity, quality: dQuality, note: `已分解 +${gold}金币` }])
                continue
              }
              after.addItem(item)
              recordLoot([{ name: dName, quantity: drop.quantity, quality: dQuality }])
            }
            addLog(`获得掉落：${result.drops.map(d => `${d.name}×${d.quantity}`).join('、')}`)
            setStats((s) => ({ ...s, items: s.items + result.drops.length }))
          }
          // 谢幕停顿：让最后一击的血条清空/怪物倒下动画播完再离开
          await new Promise((r) => setTimeout(r, 1600))
          break
        }
        if (result.ended) {
          if (result.player.hp <= 0) addLog('你被击败了...')
          // 战败同样停留，展示角色倒下的最终画面
          await new Promise((r) => setTimeout(r, 1600))
          break
        }

        await new Promise((r) => setTimeout(r, 1200))
      }
    } catch (err) {
      addLog(`战斗出错: ${err}`)
    } finally {
      isBattlingRef.current = false
      useGameStore.getState().setInCombat(false)
    }

    if (!victory) {
      const cur = useGameStore.getState()
      if (cur.player && cur.player.hp <= 0) {
        addLog(`── 战败撤退 ──`)
      }
    }
    return victory
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addLog, combatTurnMut, recordLoot])

  // ─── 开始 / 停止 ───
  const startExploring = useCallback(async () => {
    if (isRunningRef.current) return // 防重入
    const gs = useGameStore.getState()
    if (gs.inCombat) {
      addLog('另一场战斗正在进行中（守序深渊），结束后再来探索')
      return
    }
    if (!gs.player) {
      addLog('请先创建角色')
      return
    }
    gs.resetDungeon()
    gs.setCombatEnemies([])
    setLastEncounter(null)
    setIsRunning(true)
    isRunningRef.current = true
    gs.setAutoExploring(true)
    setLogs([])
    setStats({ waves: 0, kills: 0, items: 0, floor: 1, defeats: 0 })
    setCurrentLayer(1)
    setWave(0)
    addLog('═══ 自动探索开始 ═══')
    addLog(`角色：${gs.player.name} (Lv.${gs.player.level})`)
    addLog(`HP: ${gs.player.hp}/${gs.player.maxHp} MP: ${gs.player.mp}/${gs.player.maxMp}`)
    // 注册离线挂机会话（之后每 20s 心跳一次）
    const snap = buildSnapshot()
    if (snap) offlineStartMut.mutate(snap)
    addLog(`离线挂机已开启：下线后将继续探索，最长 12 小时`)
    exploreLoop()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addLog, exploreLoop])

  const stopExploring = useCallback(() => {
    setIsRunning(false)
    isRunningRef.current = false
    useGameStore.getState().setAutoExploring(false)
    // 主动停止探索 → 结束离线挂机会话（不结算）
    const name = localStorage.getItem('ad_user') || '冒险者'
    offlineStopMut.mutate({ playerName: name })
    addLog('═══ 探索结束 ═══')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addLog])

  // 刷新页面后：若之前正在自动探索，则自动续战
  useEffect(() => {
    if (useGameStore.getState().isAutoExploring && !isRunningRef.current) {
      addLog('检测到未完成的探索，自动继续…')
      startExploring()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const displayEnemies = store.combatEnemies

  // 主界面：未开始探索
  if (!isRunning && stats.waves === 0 && !store.isAutoExploring) {
    return (
      <div className="flex min-h-[calc(100dvh-5.75rem)] items-center justify-center p-4 lg:min-h-full" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <div className="game-card w-full max-w-md space-y-4">
          <div className="text-center">
            <Compass size={32} className="mx-auto mb-2" style={{ color: 'var(--accent)' }} />
            <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>混乱深渊</h2>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>自动探索 · 随机遇敌 · 离线挂机</p>
          </div>

          {store.player ? (
            <div className="rounded p-3" style={{ backgroundColor: 'var(--bg-hover)' }}>
              <div className="mb-2 flex items-center justify-between">
                <span className="font-bold" style={{ color: 'var(--text-primary)' }}>{store.player.name}</span>
                <span className="text-xs" style={{ color: 'var(--accent)' }}>Lv.{store.player.level} · {getTierName(store.player.classId, store.player.tier || 1)}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                <div className="flex items-center gap-1"><Heart size={12} style={{ color: '#F85149' }} /> {store.player.hp}/{store.player.maxHp}</div>
                <div className="flex items-center gap-1"><Zap size={12} style={{ color: '#58A6FF' }} /> {store.player.mp}/{store.player.maxMp}</div>
                <div className="flex items-center gap-1"><Swords size={12} /> 攻击 {store.player.atk}</div>
                <div className="flex items-center gap-1"><Shield size={12} /> 防御 {store.player.def}</div>
              </div>
              <div className="mt-2">
                <div className="mb-1 flex justify-between text-[10px]" style={{ color: 'var(--text-muted)' }}>
                  <span>EXP</span><span>{store.player.exp}/{getExpNeed(store.player.level)}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full" style={{ backgroundColor: 'var(--bg-hover)' }}>
                  <div className="h-full rounded-full transition-all duration-700 ease-out" style={{ width: `${Math.min(100, (store.player.exp / (getExpNeed(store.player.level))) * 100)}%`, background: 'linear-gradient(90deg, #C9A84C, #F0D878)' }} />
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded p-3 text-center text-xs" style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-muted)' }}>
              尚未创建角色，请先到角色面板创建
            </div>
          )}

          <button className="game-btn-primary w-full py-3 text-lg" onClick={startExploring} disabled={!store.player}>
            <Play size={18} className="mr-2 inline" /> 开始自动探索
          </button>
          <button className="game-btn-secondary w-full" onClick={() => navigate('/')}>返回城镇</button>

          <div className="rounded p-2 text-xs" style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-muted)' }}>
            提示：探索中会自动遭遇怪物——普通怪物、精英（15%）、Boss（1%，第 100 波保底）。击杀 Boss 后深入下一层。你可以随时停止探索。
          </div>
        </div>
      </div>
    )
  }

  // 探索中界面
  return (
    <div className="flex h-[calc(100dvh-5.75rem)] overflow-hidden lg:h-full" style={{ backgroundColor: 'var(--bg-primary)' }}>
      {/* Left: Player Status */}
      <aside className="hidden w-[240px] flex-shrink-0 border-r p-3 lg:block" style={{ borderColor: 'var(--border-color)' }}>
        <div className="mb-3 rounded p-2 text-center text-xs" style={{ backgroundColor: 'var(--bg-hover)' }}>
          <div className="font-bold" style={{ color: 'var(--accent)' }}>第 {currentLayer} 层 · 第 {wave} 波</div>
          <div className="mt-1" style={{ color: 'var(--text-muted)' }}>
            Boss 保底进度 {Math.min(wave, 100)}/100
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full" style={{ backgroundColor: 'var(--bg-primary)' }}>
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, wave)}%`, background: 'linear-gradient(90deg, #A371F7, #F85149)' }} />
          </div>
        </div>

        <div className="mb-3 space-y-2">
          <div>
            <div className="mb-1 flex justify-between text-xs" style={{ color: 'var(--text-secondary)' }}>
              <span>HP</span><span>{store.player?.hp ?? 100}/{store.player?.maxHp ?? 100}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full" style={{ backgroundColor: 'var(--bg-hover)' }}>
              <div className="h-full rounded-full transition-all duration-700 ease-out" style={{ width: `${store.player ? (store.player.hp / store.player.maxHp) * 100 : 100}%`, background: 'linear-gradient(90deg, #F85149, #3FB950)' }} />
            </div>
          </div>
          <div>
            <div className="mb-1 flex justify-between text-xs" style={{ color: 'var(--text-secondary)' }}>
              <span>MP</span><span>{store.player?.mp ?? 50}/{store.player?.maxMp ?? 50}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full" style={{ backgroundColor: 'var(--bg-hover)' }}>
              <div className="h-full rounded-full transition-all duration-700 ease-out" style={{ width: `${store.player ? (store.player.mp / store.player.maxMp) * 100 : 100}%`, background: 'linear-gradient(90deg, #58A6FF, #79C0FF)' }} />
            </div>
          </div>
          {store.player && store.playerStatuses.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {store.playerStatuses.map((st) => (
                <span key={st.id} className="rounded px-1.5 py-0.5 text-[10px]"
                  style={{ backgroundColor: 'rgba(248,81,73,0.15)', color: 'var(--danger)' }}>
                  {st.name} {st.turns}回合
                </span>
              ))}
            </div>
          )}
          {store.player && (
            <div>
              <div className="mb-1 flex justify-between text-xs" style={{ color: 'var(--text-secondary)' }}>
                <span>EXP</span><span>{store.player.exp}/{getExpNeed(store.player.level)}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full" style={{ backgroundColor: 'var(--bg-hover)' }}>
                <div className="h-full rounded-full transition-all duration-700 ease-out" style={{ width: `${Math.min(100, (store.player.exp / (getExpNeed(store.player.level))) * 100)}%`, background: 'linear-gradient(90deg, #C9A84C, #F0D878)' }} />
              </div>
            </div>
          )}
        </div>

        <div className="mb-3 rounded p-2 text-xs" style={{ backgroundColor: 'var(--bg-hover)' }}>
          <div className="mb-1 flex items-center gap-1" style={{ color: 'var(--text-secondary)' }}>
            <Compass size={12} /> 波数: {stats.waves}
          </div>
          <div className="mb-1 flex items-center gap-1" style={{ color: 'var(--text-secondary)' }}>
            <Skull size={12} /> 击杀: {stats.kills}
          </div>
          <div className="mb-1 flex items-center gap-1" style={{ color: 'var(--text-secondary)' }}>
            <Coins size={12} /> 物品: {stats.items}
          </div>
          <div className="flex items-center gap-1" style={{ color: 'var(--text-secondary)' }}>
            <Heart size={12} /> 战败: {stats.defeats}
          </div>
        </div>

        <div className="space-y-2">
          {isRunning ? (
            <button className="game-btn-secondary w-full text-xs" onClick={stopExploring}>
              <Pause size={14} className="inline mr-1" /> 停止探索
            </button>
          ) : (
            <button className="game-btn-primary w-full text-xs" onClick={startExploring}>
              <Play size={14} className="inline mr-1" /> 继续探索
            </button>
          )}
          <button className="game-btn-secondary w-full text-xs" onClick={() => { stopExploring(); store.resetDungeon(); navigate('/') }}>
            <Home size={14} className="inline mr-1" /> 返回城镇
          </button>
        </div>
      </aside>

      {/* Center: Main Area */}
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden p-4">
        {(store.inCombat || displayEnemies.length > 0) && (
          <div className="mb-3 flex-shrink-0"><BattleStage /></div>
        )}

        {/* 当前遭遇面板 */}
        <div className="mb-4 flex-shrink-0 rounded-lg border p-4" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-card)' }}>
          <div className="mb-2 flex items-center gap-2">
            <span className="rounded px-2 py-0.5 text-xs font-bold" style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--accent)' }}>
              第 {currentLayer} 层 · 第 {wave} 波
            </span>
            {lastEncounter && (
              <span className="rounded px-2 py-0.5 text-xs font-bold" style={{ backgroundColor: ENCOUNTER_COLORS[lastEncounter.type], color: '#0D1117' }}>
                {ENCOUNTER_NAMES[lastEncounter.type]}
              </span>
            )}
            {store.inCombat && (
              <span className="rounded px-2 py-0.5 text-xs font-bold" style={{ backgroundColor: 'var(--danger)', color: '#fff' }}>
                战斗中
              </span>
            )}
            {moving && !store.inCombat && (
              <span className="rounded px-2 py-0.5 text-xs font-bold" style={{ backgroundColor: 'var(--accent)', color: '#0D1117' }}>
                正在朝深处探索……
              </span>
            )}
          </div>
          {displayEnemies.length > 0 ? (
            <div className="rounded p-2" style={{ backgroundColor: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.3)' }}>
              <div className="mb-1 text-xs font-bold" style={{ color: 'var(--danger)' }}>敌人</div>
              {displayEnemies.map((e) => {
                const hpPct = e.maxHp > 0 ? Math.max(0, e.hp) / e.maxHp : 0
                return (
                  <div key={e.id} className="mb-1.5 flex items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)', opacity: e.hp <= 0 ? 0.4 : 1 }}>
                    <span className="w-20 truncate">{e.name}</span>
                    {((e as any).statuses || []).map((st: any) => (
                      <span key={st.id} className="flex-shrink-0 rounded px-1 text-[9px]"
                        style={{ backgroundColor: 'rgba(163,113,247,0.2)', color: '#A371F7' }}>
                        {st.name}{st.turns > 1 ? st.turns : ''}
                      </span>
                    ))}
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ backgroundColor: 'var(--bg-hover)' }}>
                      <div className="h-full rounded-full transition-all duration-700 ease-out" style={{
                        width: `${hpPct * 100}%`,
                        background: hpPct > 0.5 ? '#3FB950' : hpPct > 0.2 ? '#C9A84C' : '#F85149',
                      }} />
                    </div>
                    <span style={{ color: 'var(--text-muted)' }}>{Math.max(0, e.hp)}/{e.maxHp}</span>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              幽暗的深渊中，脚步正朝着更深处迈进……Boss 保底进度 {Math.min(wave, 100)}/100
            </p>
          )}
        </div>

        {/* 探索日志：独立滚动区域，最新在最上面 */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-card)' }}>
          <div className="flex flex-shrink-0 items-center justify-between border-b px-3 py-2" style={{ borderColor: 'var(--border-color)' }}>
            <span className="text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>探索日志（最新在上）</span>
            <button className="text-xs" style={{ color: 'var(--text-muted)' }} onClick={() => setLogs([])}>清空</button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {logs.map((log, i) => (
              <div key={logs.length - i} className="mb-1 text-xs" style={{
                color: log.includes('═══') ? 'var(--accent)'
                  : log.includes('胜利') || log.includes('获得') ? 'var(--success)'
                    : log.includes('击败') || log.includes('受到') || log.includes('阵亡') || log.includes('战败') ? 'var(--danger)'
                      : log.includes('战斗') || log.includes('遭遇') || log.includes('Boss') ? 'var(--warning)'
                        : 'var(--text-secondary)'
              }}>
                {log}
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Right: 获得物品 */}
      <aside className="hidden w-[220px] flex-shrink-0 flex-col border-l p-3 xl:flex" style={{ borderColor: 'var(--border-color)' }}>
        <div className="mb-2 flex items-center justify-between text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>
          <span>获得物品（最新在上）</span>
          <span style={{ color: 'var(--text-muted)' }}>{lootHistory.length} 条</span>
        </div>
        <div className="max-h-[70vh] space-y-1 overflow-y-auto pr-1">
          {lootHistory.length === 0 && (
            <div className="rounded p-2 text-center text-xs" style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-muted)' }}>
              探索中获得的物品会显示在这里
            </div>
          )}
          {lootHistory.map((item, idx) => (
            <div key={idx} className="rounded px-2 py-1 text-xs" style={{ backgroundColor: 'var(--bg-hover)' }}>
              <div className="flex items-center justify-between">
                <span className="truncate" style={{ color: LOOT_QUALITY_COLORS[item.quality] || 'var(--text-secondary)' }}>
                  {item.name}
                </span>
                <span className="ml-1 flex-shrink-0" style={{ color: 'var(--text-muted)' }}>×{item.quantity}</span>
              </div>
              {item.note && (
                <div className="text-[9px]" style={{ color: '#C9A84C' }}>{item.note}</div>
              )}
            </div>
          ))}
        </div>
      </aside>
    </div>
  )
}
