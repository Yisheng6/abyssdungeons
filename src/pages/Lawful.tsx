import { useState, useRef, useCallback, useEffect } from 'react'
import { Skull, Swords, Coins, Crown } from 'lucide-react'
import { useGameStore, shouldAutoDisassemble, getDisassembleGold, getPlayerMods } from '@/stores/gameStore'
import { trpc } from '@/providers/trpc'
import { getItemInfo, getSkillMpCost } from '@/lib/catalog'

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
  const [battling, setBattling] = useState(false)
  const [cleared, setCleared] = useState(false) // 通关 100 层
  const [seed, setSeed] = useState(Date.now())
  const battlingRef = useRef(false)

  const roomsQ = trpc.game.lawfulRooms.useQuery(
    { layer: lawful.layer, classId: player?.classId || 'warrior', seed },
    { enabled: !!player && !cleared }
  )
  const combatTurnMut = trpc.game.combatTurn.useMutation()
  const submitMut = trpc.lb.submitScore.useMutation()

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

  const autoBattle = useCallback(async (room: LawfulRoom): Promise<boolean> => {
    const gs = useGameStore.getState()
    gs.setInCombat(true)
    gs.setPlayerStatuses([])
    gs.setCombatEnemies(room.enemies.map((e) => ({ ...e })))
    let victory = false

    try {
      for (let round = 1; round <= 60; round++) {
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
        let action: { type: 'attack' | 'skill'; skillId?: string } = { type: 'attack' }
        for (const skillId of p.skills || []) {
          if (p.mp >= getSkillMpCost(skillId, 10)) { action = { type: 'skill', skillId }; break }
        }

        const result = await combatTurnMut.mutateAsync({
          player: {
            id: p.id, name: p.name, hp: p.hp, maxHp: p.maxHp, mp: p.mp, maxMp: p.maxMp,
            atk: p.atk, def: p.def, mag: p.mag, mdef: p.mdef, agi: p.agi, luk: p.luk,
            con: p.con || 0, wil: p.wil || 0,
            skills: p.skills, element: p.element || 'none',
            statuses: useGameStore.getState().playerStatuses || [],
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
          layer: lawful.layer,
          enemyDropTables: alive.map((e) => ({ enemyId: e.id, dropTable: room.enemies.find((r2) => r2.id === e.id)?.dropTable })),
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

        if (result.victory) {
          victory = true
          // 掉落结算
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
              uid: `lawful_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
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
  }, [lawful.layer])

  const enterRoom = async (room: LawfulRoom) => {
    if (battlingRef.current || !player) return
    battlingRef.current = true
    setBattling(true)
    addLog(`═══ 第 ${lawful.layer} 层 · ${room.name} ═══`)
    addLog(`遭遇：${room.enemies.map((e) => e.name).join('、')}`)
    const won = await autoBattle(room)
    const after = useGameStore.getState()
    if (won) {
      // 奖励：基础经验 + 层数加成，Boss 双倍
      const utilMods = getPlayerMods().utility
      const base = room.enemies.reduce((sum, e) => sum + 10 + lawful.layer * 3 + Math.ceil(e.maxHp / 20) + e.atk, 0)
      const exp = Math.floor(base * (room.isBoss ? 2 : 1) * (1 + (utilMods.expGain || 0) / 100))
      const gold = Math.floor((8 + lawful.layer * 4) * (room.isBoss ? 5 : 1) * (1 + (utilMods.goldGain || 0) / 100))
      after.addPlayerExp(exp)
      after.addPlayerGold(gold)
      addLog(`获得经验 ${exp}、金币 ${gold}`)
      after.trackTaskEvent('kills', room.enemies.length)
      if (room.isBoss) after.trackTaskEvent('bossKills', 1)

      const next = lawful.layer + 1
      if (lawful.layer >= 100) {
        setCleared(true)
        addLog('★ 你通关了守序深渊 100 层！★')
      } else {
        after.setLawfulLayer(next)
        addLog(`═══ 进入第 ${next} 层 ═══`)
      }
      // 上榜
      const playerName = localStorage.getItem('ad_user') || ''
      if (playerName) {
        submitMut.mutateAsync({ category: 'lawful_layer', playerId: playerName, playerName, score: lawful.layer }).catch(() => {})
      }
      refreshRooms()
    } else {
      // 战败：30% 复活，可重试（刷新房间）
      if (after.player) {
        after.updatePlayerHp(Math.max(1, Math.floor(after.player.maxHp * 0.3)))
        after.updatePlayerMp(Math.floor(after.player.maxMp * 0.3))
      }
      addLog('你在深渊中倒下了……恢复 30% 状态后可重新挑战')
      refreshRooms()
    }
    battlingRef.current = false
    setBattling(false)
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

      {/* 战斗日志 */}
      <div className="game-card min-h-0 flex-1 overflow-y-auto p-3">
        {logs.length === 0 && (
          <div className="py-6 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
            点击「挑战」后系统随机分配房间。每 10 层有克苏鲁系 Boss 守关，Boss 必掉装备。
          </div>
        )}
        {logs.map((l, i) => (
          <div key={i} className="text-[11px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{l}</div>
        ))}
      </div>

    </div>
  )
}
