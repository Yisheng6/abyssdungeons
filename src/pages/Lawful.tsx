import { useState, useRef, useCallback, useEffect } from 'react'
import { Skull, Swords, Coins, Crown } from 'lucide-react'
import { useGameStore } from '@/stores/gameStore'
import { confirmSwitchBattle, snapshotBattleStats, battleHijacked, releaseBattle } from '@/lib/battle-switch'
import { trpc } from '@/providers/trpc'
import { runServerBattle } from '@/lib/battle-client'
import { charApi, applyServerState } from '@/lib/char-api'
import BattleStage from '@/components/BattleStage'

interface LawfulEnemy {
  id: string; name: string; hp: number; maxHp: number; mp: number; maxMp: number
  atk: number; def: number; mag: number; mdef: number; agi: number; luk: number
  skills: string[]; element: string; aiType?: string
  dropTable?: Array<{ itemId: string; name: string; type: string; chance: number; quantityMin: number; quantityMax: number; quality: string; minLayer?: number }>
}
interface LawfulRoom { id: number; name: string; desc: string; isBoss: boolean; enemies: LawfulEnemy[] }

const ELEMENT_NAMES: Record<string, string> = {
  none: '无', fire: '火', ice: '冰', water: '水', earth: '土', wind: '风', void: '虚空',
}

export default function Lawful() {
  const player = useGameStore((s) => s.player)
  const lawful = useGameStore((s) => s.lawful)
  const [rooms, setRooms] = useState<LawfulRoom[] | null>(null)
  const [currentRoom, setCurrentRoom] = useState<LawfulRoom | null>(null) // 本层随机分配的房间
  const [logs, setLogs] = useState<string[]>([])
  const bsInCombat = useGameStore((s) => s.inCombat)
  const [battling, setBattling] = useState(false)
  const [cleared, setCleared] = useState(false) // 通关 100 层
  const [seed, setSeed] = useState(Date.now())
  const battlingRef = useRef(false)

  const roomsQ = trpc.game.lawfulRooms.useQuery(
    { layer: lawful.layer, classId: player?.classId || 'warrior', seed },
    { enabled: !!player && !cleared }
  )

  const addLog = (l: string) => setLogs((prev) => [...prev.slice(-80), l])

  // 房间数据就绪
  useEffect(() => {
    if (roomsQ.data) setRooms(roomsQ.data.rooms as LawfulRoom[])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomsQ.data])

  const refreshRooms = () => {
    setSeed(Date.now())
    setRooms(null)
    setCurrentRoom(null)
    roomsQ.refetch()
  }

  // 挑战本层：系统从 3 个房间中随机分配一个
  const challengeLayer = async () => {
    if (battlingRef.current || !player || !rooms || rooms.length === 0) return
    const room = rooms[Math.floor(Math.random() * rooms.length)]
    setCurrentRoom(room)
    await enterRoom(room)
  }

  // 刷新页面后：若之前战斗被打断，自动重新挑战（重新随机分配房间）
  useEffect(() => {
    if (useGameStore.getState().lawfulInBattle && !battlingRef.current && rooms && rooms.length > 0 && player) {
      useGameStore.setState({ lawfulInBattle: false })
      addLog('检测到未完成的挑战，自动重新进入…')
      challengeLayer()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rooms])

  const autoBattle = useCallback(async (room: LawfulRoom): Promise<boolean> => {
    const gs = useGameStore.getState()
    gs.setInCombat(true)
    gs.setBattleMode('lawful')
    const snap = snapshotBattleStats() // 本场战斗属性快照：战斗中换装不影响本场
    gs.setPlayerStatuses([])
    gs.setCombatEnemies(room.enemies.map((e, i) => ({ ...e, uid: `${e.id}#${i}` })))
    let victory = false

    try {
      // 服务端战斗会话：状态托管在服务端
      const res = await runServerBattle({
        mode: 'lawful',
        layer: lawful.layer,
        enemies: room.enemies.map((e, i) => ({ ...e, uid: `${e.id}#${i}` })),
        snap,
        isAborted: () => battleHijacked('lawful'),
        onLog: addLog,
      })
      victory = res.victory

      if (res.settle) {
        // 服务端结算：经验/金币/掉落已写入云端存档
        const st = res.settle
        applyServerState(st)
        if (st.exp > 0) addLog(`获得经验 ${st.exp}${st.gold > 0 ? `、金币 ${st.gold}` : ''}${st.diamonds > 0 ? `、钻石 ${st.diamonds}` : ''}`)
        if (st.levelUps > 0) addLog(`★ 升级！等级提升 ${st.levelUps} 级，全属性成长 ★`)
        for (const it of st.items) addLog(`获得 ${it.name}×${it.quantity}`)
      }
    } finally {
      releaseBattle('lawful')
    }
    return victory
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lawful.layer])

  const enterRoom = async (room: LawfulRoom) => {
    if (battlingRef.current || !player) return
    const gsNow = useGameStore.getState()
    if ((gsNow.inCombat || gsNow.isAutoExploring) && !confirmSwitchBattle('lawful')) return
    battlingRef.current = true
    setBattling(true)
    useGameStore.setState({ lawfulInBattle: true })
    addLog(`═══ 第 ${lawful.layer} 层 · ${room.name} ═══`)
    addLog(`遭遇：${room.enemies.map((e) => e.name).join('、')}`)
    const won = await autoBattle(room)
    if (battleHijacked('lawful')) {
      // 战斗已被切换走：复位本地状态，不做胜负结算
      battlingRef.current = false
      setBattling(false)
      useGameStore.setState({ lawfulInBattle: false })
      return
    }
    const after = useGameStore.getState()
    if (won) {
      const next = lawful.layer + 1
      if (lawful.layer >= 100) {
        setCleared(true)
        addLog('★ 你通关了守序深渊 100 层！★')
      } else {
        void charApi.setLawfulLayer(next)
        addLog(`═══ 进入第 ${next} 层 ═══`)
      }
      refreshRooms()
    } else {
      // 战败：等待 5 秒后满血复活，可重试（刷新房间）
      addLog('你在深渊中倒下了……5 秒后复活')
      await new Promise((r) => setTimeout(r, 5000))
      const afterR = useGameStore.getState()
      if (afterR.player) {
        afterR.updatePlayerHp(afterR.player.maxHp)
        afterR.updatePlayerMp(afterR.player.maxMp)
      }
      addLog('已复活并恢复全部状态，可重新挑战')
      refreshRooms()
    }
    battlingRef.current = false
    setBattling(false)
    useGameStore.setState({ lawfulInBattle: false })
  }

  if (!player) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <div className="game-card p-6 text-center text-xs" style={{ color: 'var(--text-muted)' }}>请先在角色面板创建角色</div>
      </div>
    )
  }

  if (cleared) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <div className="game-card p-8 text-center">
          <Crown size={36} className="mx-auto mb-3" style={{ color: 'var(--accent)' }} />
          <div className="text-lg font-bold" style={{ color: 'var(--accent)' }}>通关守序深渊！</div>
          <p className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>你击败了盲目愚痴之神·阿撒托斯，深渊归于寂静。</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-4">
      {/* 头部 */}
      <div className="flex flex-shrink-0 items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
          <Swords size={15} style={{ color: 'var(--accent)' }} /> 守序深渊
        </h2>
        <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          第 <span className="font-bold" style={{ color: 'var(--accent)' }}>{lawful.layer}</span> / 100 层
          <span className="ml-2" style={{ color: 'var(--text-muted)' }}>最佳纪录：第 {lawful.best} 层</span>
        </div>
      </div>

      {/* 本层随机分配的房间 */}
      <div className="flex-shrink-0">
        {!rooms && (
          <div className="game-card p-6 text-center text-xs" style={{ color: 'var(--text-muted)' }}>深渊凝聚中…</div>
        )}
        {rooms && !currentRoom && (
          <div className="game-card p-4 text-center">
            <div className="mb-2 text-xs" style={{ color: 'var(--text-muted)' }}>
              第 {lawful.layer} 层 · {roomsQ.data?.isBossLayer ? 'Boss 守关层' : `已凝聚 ${rooms.length} 个房间，系统将随机分配其一`}
            </div>
            <button onClick={challengeLayer} disabled={battling || rooms.length === 0}
              className="mx-auto flex items-center gap-2 rounded-lg px-6 py-2 text-sm font-bold transition-all hover:scale-[1.03] active:scale-[0.97] disabled:opacity-50"
              style={{ background: 'var(--accent)', color: '#fff' }}>
              <Swords size={15} /> 挑战第 {lawful.layer} 层
            </button>
          </div>
        )}
        {currentRoom && (
          <div className="game-card p-3" style={currentRoom.isBoss ? { borderColor: '#F85149' } : undefined}>
            <div className="mb-1 flex items-center gap-1.5">
              {currentRoom.isBoss && <Skull size={14} style={{ color: '#F85149' }} />}
              <span className="text-sm font-bold" style={{ color: currentRoom.isBoss ? '#F85149' : 'var(--text-primary)' }}>{currentRoom.name}</span>
              <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>（随机分配）</span>
            </div>
            <div className="mb-1.5 text-[11px]" style={{ color: 'var(--text-muted)' }}>{currentRoom.desc}</div>
            <div className="space-y-0.5">
              {currentRoom.enemies.map((e) => (
                <div key={e.id} className="flex justify-between text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                  <span>{e.name}</span>
                  <span>HP {e.hp} · {ELEMENT_NAMES[e.element] || e.element}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

{bsInCombat && <div className="mb-3 flex-shrink-0"><BattleStage mode="lawful" /></div>}
            {/* 战斗日志 */}
      <div className="game-card min-h-0 flex-1 overflow-y-auto p-3">
        {logs.length === 0 && (
          <div className="py-6 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
            点击「挑战」后系统随机分配房间。每 10 层有克苏鲁系 Boss 守关，Boss 必掉装备。
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
