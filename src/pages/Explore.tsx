import { useState, useCallback, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router'
import { Swords, Home, Compass, Play, Pause, Zap, Skull, Coins, Heart, Shield } from 'lucide-react'
import { useGameStore, shouldAutoDisassemble, getDisassembleGold, getPlayerMods, getExpNeed } from '@/stores/gameStore'
import { trpc } from '@/providers/trpc'
import { loadCatalogs, getItemInfo, getTierName } from '@/lib/catalog'
import { confirmSwitchBattle, snapshotBattleStats, battleHijacked, releaseBattle } from '@/lib/battle-switch'
import { runServerBattle } from '@/lib/battle-client'
import { charApi, applyServerState } from '@/lib/char-api'
import { getToken } from '@/lib/auth'
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
  const [currentLayer, _setCurrentLayer] = useState(() => useGameStore.getState().exploreLayer || 1)
  const setCurrentLayer = useCallback((v: number) => {
    currentLayerRef.current = v; _setCurrentLayer(v)
    useGameStore.setState({ exploreLayer: v })
  }, [])
  const [wave, _setWave] = useState(() => useGameStore.getState().exploreWave || 0)
  const setWave = useCallback((v: number) => {
    waveRef.current = v; _setWave(v)
    useGameStore.setState({ exploreWave: v })
  }, [])
  const [lastEncounter, setLastEncounter] = useState<{ type: string; enemies: Array<{ id: string; name: string; hp: number; maxHp: number }> } | null>(null)
  const [stats, setStats] = useState({ waves: 0, kills: 0, items: 0, floor: 1, defeats: 0 })
  const [lootHistory, setLootHistory] = useState<Array<{ name: string; quantity: number; quality: string; note?: string }>>([])
  const recordLoot = useCallback((entries: Array<{ name: string; quantity: number; quality?: string; note?: string }>) => {
    setLootHistory((prev) => [...entries.map((e) => ({ name: e.name, quantity: e.quantity, quality: e.quality || 'common', note: e.note })), ...prev].slice(0, 200))
  }, [])
  const isRunningRef = useRef(false)
  const currentLayerRef = useRef(useGameStore.getState().exploreLayer || 1)
  const waveRef = useRef(useGameStore.getState().exploreWave || 0)
  const isBattlingRef = useRef(false)

  const encounterMut = trpc.game.randomEncounter.useMutation()
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
      token: getToken(),
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

  // ─── 探索主循环：一波接一波的随机遇敌 ───
  const exploreLoop = useCallback(async () => {
    while (isRunningRef.current && useGameStore.getState().isAutoExploring) {
      // 战斗被切换到其他玩法：停止探索循环
      if (battleHijacked('explore')) break
      // 朝深处探索的行进间隔
      setMoving(true)
      addLog('正在朝深处探索……')
      await new Promise((r) => setTimeout(r, 2000))
      setMoving(false)
      if (!isRunningRef.current || !useGameStore.getState().isAutoExploring) break

      try {
        const enc = await encounterMut.mutateAsync({
          token: getToken(),
          layer: currentLayerRef.current,
          wavesSinceBoss: waveRef.current,
        })
        if (!enc || !enc.enemies || enc.enemies.length === 0) continue

        setWave(enc.wave)
        setStats((s) => ({ ...s, waves: s.waves + 1 }))
        void charApi.track('rooms', 1)

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

        // 战利品：凭服务端凭证领取入库（防伪造掉落）
        if ((enc as { lootVoucher?: string }).lootVoucher) {
          const r = await charApi.claimLoot((enc as { lootVoucher?: string }).lootVoucher!)
          if (r.success && (r as { items?: Array<{ name: string; quantity: number; quality?: string }> }).items?.length) {
            const its = (r as { items: Array<{ name: string; quantity: number; quality?: string }> }).items
            addLog(`拾取战利品：${its.map((d) => `${d.name}×${d.quantity}`).join('、')}`)
            recordLoot(its)
            setStats((s) => ({ ...s, items: s.items + its.length }))
          }
        }

        if (won) {
          if (enc.type === 'boss') {
            // 通关恢复由服务端结算完成（见 passHeal）
            addLog(`通关恢复：HP/MP 恢复 50%`)
            void charApi.track('layers', 1)
            const nextLayer = currentLayerRef.current + 1
            const prevMax = useGameStore.getState().player?.maxLayer || 1
            void charApi.updateMaxLayer(nextLayer)
            useGameStore.getState().updateMaxLayer(nextLayer)
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
          // 战斗被切换到其他玩法：直接退出探索循环，不走战败流程
          if (battleHijacked('explore')) break
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
    // 循环退出（主动停止或战斗被切换走）：复位本地运行标记
    setIsRunning(false)
    isRunningRef.current = false
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addLog])

  // ─── 自动战斗（返回是否胜利）───
  const autoBattle = useCallback(async (enemies: any[]): Promise<boolean> => {
    if (isBattlingRef.current) return true // 防止并发战斗
    isBattlingRef.current = true

    addLog(`── 战斗开始 ──`)
    const gs = useGameStore.getState()
    // 探索已被停止/战斗被切换走：不再登记归属，避免回抢新战斗
    if (!gs.isAutoExploring) { isBattlingRef.current = false; return false }
    gs.setInCombat(true)
    gs.setBattleMode('explore')
    const snap = snapshotBattleStats() // 本场战斗属性快照：战斗中换装不影响本场
    gs.setPlayerStatuses([])
    gs.setCombatEnemies(enemies.map((e, i) => ({
      id: e.id, uid: `${e.id}#${i}`, name: e.name, hp: e.hp, maxHp: e.maxHp,
      mp: e.mp ?? 0, maxMp: e.maxMp ?? 0,
      atk: e.atk ?? 10, def: e.def ?? 5,
      mag: e.mag ?? 0, mdef: e.mdef ?? 3,
      agi: e.agi ?? 8, luk: e.luk ?? 3,
      skills: e.skills ?? [], element: e.element ?? 'none',
      aiType: e.aiType,
    })))

    let victory = false

    try {
      // 服务端战斗会话：状态托管在服务端，客户端只发出招选择
      const res = await runServerBattle({
        mode: 'explore',
        layer: currentLayerRef.current,
        enemies: enemies.map((e, i) => ({
          id: e.id, uid: `${e.id}#${i}`, name: e.name, hp: e.hp, maxHp: e.maxHp,
          mp: e.mp ?? 0, maxMp: e.maxMp ?? 0,
          atk: e.atk ?? 10, def: e.def ?? 5,
          mag: e.mag ?? 0, mdef: e.mdef ?? 3,
          agi: e.agi ?? 8, luk: e.luk ?? 3,
          skills: e.skills ?? [], element: e.element ?? 'none',
          aiType: e.aiType, dropTable: e.dropTable,
        })),
        snap,
        isAborted: () => !isRunningRef.current || battleHijacked('explore'),
        onLog: addLog,
      })

      if (res.victory) {
        victory = true
        addLog(`── 战斗胜利！──`)
        setStats((s) => ({ ...s, kills: s.kills + 1 }))
        // 奖励已由服务端写入存档：应用最新状态
        const st = res.settle
        if (st) {
          applyServerState(st)
          addLog(`获得经验 ${st.exp}（当前 Lv.${useGameStore.getState().player?.level}）`)
          if (st.gold > 0) addLog(`获得金币 ${st.gold}`)
          if (st.diamonds > 0) addLog(`获得钻石 ×${st.diamonds}`)
          if (st.items.length > 0) {
            addLog(`获得掉落：${st.items.map((d) => `${d.name}×${d.quantity}`).join('、')}`)
            recordLoot(st.items)
            setStats((s) => ({ ...s, items: s.items + st.items.length }))
          }
        }
        // 谢幕停顿：让最后一击的血条清空/怪物倒下动画播完再离开
        await new Promise((r) => setTimeout(r, 1600))
            } else if (!res.aborted && !res.sessionLost) {
        // 战败同样停留，展示角色倒下的最终画面
        await new Promise((r) => setTimeout(r, 1600))
      }
    } catch (err) {
      addLog(`战斗出错: ${err}`)
    } finally {
      isBattlingRef.current = false
      releaseBattle('explore')
    }

    if (!victory) {
      const cur = useGameStore.getState()
      if (cur.player && cur.player.hp <= 0) {
        addLog(`── 战败撤退 ──`)
      }
    }
    return victory
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addLog, recordLoot])

  // ─── 开始 / 停止 ───
  const startExploring = useCallback(async () => {
    if (isRunningRef.current) return // 防重入
    const gs = useGameStore.getState()
    if ((gs.inCombat || gs.isAutoExploring) && !confirmSwitchBattle('explore')) return
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
    // 恢复上次进度（刷新/中断后续跑），首次则为第 1 层第 0 波
    const resumeLayer = gs.exploreLayer || 1
    const resumeWave = gs.exploreWave || 0
    setStats({ waves: 0, kills: 0, items: 0, floor: resumeLayer, defeats: 0 })
    setCurrentLayer(resumeLayer)
    setWave(resumeWave)
    addLog('═══ 自动探索开始 ═══')
    if (resumeLayer > 1 || resumeWave > 0) {
      addLog(`已恢复探索进度：第 ${resumeLayer} 层 · 第 ${resumeWave} 波（Boss 保底进度保留）`)
    }
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
          <div className="font-bold" style={{ color: 'var(--accent)' }}>遇怪波数：{stats.waves}</div>
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
          <div className="mb-3 flex-shrink-0"><BattleStage mode="explore" /></div>
        )}

        {/* 当前遭遇面板 */}
        <div className="mb-4 flex-shrink-0 rounded-lg border p-4" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-card)' }}>
          <div className="mb-2 flex items-center gap-2">
            <span className="rounded px-2 py-0.5 text-xs font-bold" style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--accent)' }}>
              第 {stats.waves + 1} 波
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
            {logs.map((log, i) => {
              const isSkill = log.includes('施放') || log.includes('使用了')
              return (
                <div key={logs.length - i} className="mb-1 text-xs" style={
                  isSkill
                    ? {
                        color: '#FFC94D', fontWeight: 700, borderLeft: '3px solid #FFC94D',
                        paddingLeft: 6, backgroundColor: 'rgba(255,201,77,0.08)',
                        textShadow: '0 1px 2px #000',
                      }
                    : {
                        color: log.includes('═══') ? 'var(--accent)'
                          : log.includes('胜利') || log.includes('获得') ? 'var(--success)'
                            : log.includes('击败') || log.includes('受到') || log.includes('阵亡') || log.includes('战败') ? 'var(--danger)'
                              : log.includes('战斗') || log.includes('遭遇') || log.includes('Boss') ? 'var(--warning)'
                                : 'var(--text-secondary)'
                      }
                }>
                  {isSkill ? `✦ ${log}` : log}
                </div>
              )
            })}
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
