import { useState, useCallback, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router'
import { Swords, Home, Compass, Play, Pause, Zap, Skull, Coins, Heart, Shield } from 'lucide-react'
import { useGameStore, shouldAutoDisassemble, getDisassembleGold } from '@/stores/gameStore'
import { trpc } from '@/providers/trpc'
import { loadCatalogs, getItemInfo, getSkillMpCost, getTierName } from '@/lib/catalog'

const ROOM_TYPE_NAMES: Record<string, string> = {
  entrance: '入口', normal: '普通房间', elite: '精英房间', boss: 'Boss房间',
  treasure: '宝箱房间', trap: '陷阱房间', safe: '安全房间', shrine: '祭坛房间',
  merchant: '商人房间', hidden: '隐藏房间',
}

const ROOM_TYPE_COLORS: Record<string, string> = {
  entrance: '#3FB950', normal: '#8B949E', elite: '#A371F7', boss: '#F85149',
  treasure: '#C9A84C', trap: '#F85149', safe: '#3FB950', shrine: '#79C0FF',
  merchant: '#58A6FF', hidden: '#D4BA6A',
}

const SKILL_MP_COSTS: Record<string, number> = {
  fireball: 10, heal: 15, frostbolt: 12, lightning: 18,
  mana_shield: 20, meteor: 40, arcane_power: 25,
  shadow_step: 15, backstab: 10, poison_blade: 12,
  smoke_bomb: 8, assassinate: 30, shadow_dance: 25,
  shield_bash: 8, taunt: 5, heavy_strike: 12,
  iron_will: 10, whirlwind: 20, last_stand: 15,
  aimed_shot: 10, trap: 8, multishot: 18,
  poison_arrow: 12, stampede: 25, eagle_eye: 15,
  holy_light: 15, bless: 10, dispel: 12,
  resurrection: 50, divine_shield: 20,
  corruption: 12, summon_imp: 20, life_drain: 15,
  curse: 10, demon_form: 35, soul_harvest: 25,
}

const LOOT_QUALITY_COLORS: Record<string, string> = {
  common: '#9DA7B3', fine: '#3FB950', rare: '#58A6FF',
  epic: '#A371F7', legendary: '#F0A832', mythic: '#FF7B72',
}

export default function Explore() {
  const navigate = useNavigate()
  const store = useGameStore()
  const [logs, setLogs] = useState<string[]>([])
  const [isRunning, setIsRunning] = useState(false)
  const [moving, setMoving] = useState(false)
  const [currentLayer, setCurrentLayer] = useState(1)
  const [stats, setStats] = useState({ rooms: 0, kills: 0, items: 0, floor: 1, defeats: 0 })
  const [lootHistory, setLootHistory] = useState<Array<{ name: string; quantity: number; quality: string; note?: string }>>([])
  const recordLoot = useCallback((entries: Array<{ name: string; quantity: number; quality?: string; note?: string }>) => {
    setLootHistory((prev) => [...entries.map((e) => ({ name: e.name, quantity: e.quantity, quality: e.quality || 'common', note: e.note })), ...prev].slice(0, 200))
  }, [])
  const isRunningRef = useRef(false)
  const isBattlingRef = useRef(false)

  // 使用 useMutation 避免 useQuery 参数不同步问题
  const generateDungeonMut = trpc.game.generateDungeon.useMutation()
  const enterRoomMut = trpc.game.enterRoom.useMutation()
  const combatTurnMut = trpc.game.combatTurn.useMutation()

  // 加载物品/技能目录（技能MP消耗、掉落解析用）
  useEffect(() => { loadCatalogs() }, [])

  const addLog = useCallback((msg: string) => {
    // 最新日志排在最上面，最多保留100条
    setLogs((prev) => [`[${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}] ${msg}`, ...prev].slice(0, 100))
  }, [])

  // ─── 拾取战利品（真实物品入包，货币自动兑换金币）───
  const collectLoot = useCallback((loot: Array<{
    itemId: string; name?: string; type?: string; quality?: string; quantity: number
    slot?: string; stats?: Record<string, number>; desc?: string; value?: number
    setId?: string; setTier?: number; effect?: Record<string, unknown>; learnSkillId?: string
  }>) => {
    const gs = useGameStore.getState()
    for (const l of loot) {
      const cat = getItemInfo(l.itemId)
      const type = (l.type || cat?.type || 'material') as 'equipment' | 'consumable' | 'material' | 'currency' | 'skillbook'
      const name = l.name || cat?.name || l.itemId
      if (type === 'currency') {
        const value = l.value ?? cat?.value ?? 1
        gs.addPlayerGold(l.quantity * value)
        addLog(`拾取 ${name}×${l.quantity}（+${l.quantity * value} 金币）`)
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

  // ─── 进入新一层地牢 ───
  const enterNewFloor = useCallback(async (layer: number) => {
    useGameStore.getState().setCombatEnemies([]) // 进新层立即清掉上一场残留敌人
    setCurrentLayer(layer)
    setStats((s) => ({ ...s, floor: layer }))
    const gsFloor = useGameStore.getState()
    const prevMax = gsFloor.player?.maxLayer || 1
    gsFloor.updateMaxLayer(layer)
    addLog(`═══ 进入第 ${layer} 层 ═══`)
    if (layer > prevMax) addLog(`新纪录！最深到达第 ${layer} 层`)

    try {
      const result = await generateDungeonMut.mutateAsync({
        globalSeed: 'auto', layer, x: 0, y: 0,
      })
      if (result) {
        const gs = useGameStore.getState()
        gs.setCurrentDungeon({
          seed: result.seed, layer: result.layer, x: 0, y: 0,
          theme: result.theme, roomCount: result.roomCount,
        })
        gs.setDungeonRooms(result.rooms)
        gs.setCurrentRoomId(result.entranceRoomId)
        gs.resetExploredRooms()
        gs.addExploredRoom(result.entranceRoomId)
        addLog(`地牢生成完毕：${result.theme}，共 ${result.roomCount} 个房间`)
        await exploreRoom(result.entranceRoomId)
      }
    } catch (err) {
      addLog(`生成地牢失败: ${err}`)
      stopExploring()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addLog, generateDungeonMut])

  // ─── 探索房间 ───
  const exploreRoom = useCallback(async (roomId: number) => {
    if (!isRunningRef.current) return

    try {
      const result = await enterRoomMut.mutateAsync({
        globalSeed: 'auto', layer: currentLayer, x: 0, y: 0, roomId,
      })
      if (!result) {
        addLog('房间数据为空，跳过')
        return
      }

      const room = result
      const gs = useGameStore.getState()
      gs.setCombatEnemies([]) // 清空上一场战斗的敌人显示，避免残留
      gs.setRoomInfo(room)
      gs.setCurrentRoomId(roomId)
      gs.addExploredRoom(roomId)
      setStats((s) => ({ ...s, rooms: s.rooms + 1 }))

      const roomName = ROOM_TYPE_NAMES[room.type] || room.type
      addLog(`【${roomName}】${room.themeDescription}`)

      let cleared = true
      const hadBattle = room.enemies.length > 0
      // 遇敌 → 自动战斗
      if (room.enemies.length > 0) {
        addLog(`遭遇敌人：${room.enemies.map(e => `${e.name}(HP:${e.hp})`).join('、')}`)
        const won = await autoBattle(room.enemies)
        if (!won) {
          cleared = false
          // 战败复活：恢复全部状态，继续随机探索
          setStats((s) => ({ ...s, defeats: s.defeats + 1 }))
          const gsLose = useGameStore.getState()
          if (gsLose.player) {
            gsLose.updatePlayerHp(gsLose.player.maxHp)
            gsLose.updatePlayerMp(gsLose.player.maxMp)
          }
          addLog(`战败！已复活并恢复全部状态，继续探索...`)
        }
      } else if (room.type === 'treasure') {
        addLog(`发现宝箱！正在打开...`)
      } else if (room.type === 'trap') {
        const dmg = Math.floor(Math.random() * 20) + 10
        addLog(`触发陷阱！受到 ${dmg} 点伤害`)
        const gs2 = useGameStore.getState()
        if (gs2.player) gs2.updatePlayerHp(gs2.player.hp - dmg)
      } else if (room.type === 'safe') {
        addLog(`安全区域，恢复了一些状态`)
        const gs2 = useGameStore.getState()
        if (gs2.player) {
          gs2.updatePlayerHp(Math.min(gs2.player.maxHp, gs2.player.hp + 30))
          gs2.updatePlayerMp(Math.min(gs2.player.maxMp, gs2.player.mp + 20))
        }
      } else {
        addLog(`这个房间很平静，没有发现敌人`)
      }

      // 自动拾取（真实物品）
      if (room.loot && room.loot.length > 0) {
        collectLoot(room.loot)
      }

      // Boss房 → 只有清场胜利才进入下一层
      if (room.isExit && cleared) {
        addLog(`═══ 已通过本层，进入第 ${currentLayer + 1} 层 ═══`)
        setTimeout(() => { if (isRunningRef.current) enterNewFloor(currentLayer + 1) }, 1000)
        return
      }

      // ─── 自动进入下一个房间（战斗结束显示移动过渡）───
      if (isRunningRef.current) {
        const gs3 = useGameStore.getState()
        const unvisited = room.directions.filter((d) => !gs3.exploredRooms.has(d.roomId))
        const candidates = unvisited.length > 0 ? unvisited : room.directions
        if (candidates.length > 0) {
          const nextDir = candidates[Math.floor(Math.random() * candidates.length)]
          if (hadBattle) addLog(`── 战斗结束 ──`)
          addLog(`── 移动中 ──`)
          setMoving(true)
          setTimeout(() => {
            setMoving(false)
            if (isRunningRef.current) {
              addLog(`向${nextDir.direction}移动...`)
              exploreRoom(nextDir.roomId)
            }
          }, hadBattle ? 1800 : 1500)
        } else {
          addLog(`本层已无可走房间，进入下一层`)
          setTimeout(() => { if (isRunningRef.current) enterNewFloor(currentLayer + 1) }, 1000)
        }
      }
    } catch (err) {
      addLog(`探索出错: ${err}`)
      stopExploring()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addLog, enterRoomMut, currentLayer, enterNewFloor, collectLoot])

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
    const MAX_ROUNDS = 60

    try {
      for (let round = 1; round <= MAX_ROUNDS; round++) {
        if (!isRunningRef.current) break

        // 每轮读取最新状态（避免闭包旧值）
        const cur = useGameStore.getState()
        const aliveEnemies = cur.combatEnemies.filter((e) => e.hp > 0)
        if (aliveEnemies.length === 0) { victory = true; break }

        const player = cur.player
        if (!player || player.hp <= 0) { addLog('你被击败了...'); break }

        // 按技能顺序释放：第一个 MP 足够的技能，否则普攻
        let action: { type: 'attack' | 'skill'; skillId?: string } = { type: 'attack' }
        for (const skillId of player.skills || []) {
          if (player.mp >= getSkillMpCost(skillId, SKILL_MP_COSTS[skillId] ?? 10)) {
            action = { type: 'skill', skillId }
            break
          }
        }

        const result = await combatTurnMut.mutateAsync({
          player: {
            id: player.id, name: player.name, hp: player.hp, maxHp: player.maxHp,
            mp: player.mp, maxMp: player.maxMp, atk: player.atk, def: player.def,
            mag: player.mag, mdef: player.mdef, agi: player.agi, luk: player.luk,
            con: player.con || 0, wil: player.wil || 0,
            skills: player.skills, element: player.element || 'none',
            statuses: cur.playerStatuses || [],
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
          layer: currentLayer,
          enemyDropTables: aliveEnemies.map((e) => ({ enemyId: e.id, dropTable: (e as any).dropTable })),
        })

        result.logs.forEach((log) => addLog(log))

        // 每轮同步最新状态到 store（血量实时显示）
        // 注意：result.enemies 只包含本轮出战（存活）的敌人，需按 id 合并回完整列表，
        // 否则已死亡敌人会从显示中消失，造成"数量对不上/疑似换房"的错觉
        const after = useGameStore.getState()
        const mergedEnemies = after.combatEnemies.map((e) => {
          const u = result.enemies.find((r) => r.id === e.id)
          return u ? { ...e, ...u } : e
        })
        after.setCombatEnemies(mergedEnemies)
        after.updatePlayerHp(result.player.hp)
        after.updatePlayerMp(result.player.mp)
        after.setPlayerStatuses((result.player as any).statuses || [])

        if (result.victory) {
          victory = true
          addLog(`── 战斗胜利！──`)
          setStats((s) => ({ ...s, kills: s.kills + 1 }))
          // 经验奖励：基础 10 + 层数×3 + 敌人强度（血/20 + 攻），boss（HP≥500）双倍
          const expGain = enemies.reduce((sum, e) => {
            const base = 10 + currentLayer * 3 + Math.ceil((e.maxHp || 30) / 20) + (e.atk || 5)
            return sum + ((e.maxHp || 0) >= 500 ? base * 2 : base)
          }, 0)
          after.addPlayerExp(expGain)
          addLog(`获得经验 ${expGain}（当前 Lv.${useGameStore.getState().player?.level}）`)
          if (result.drops && result.drops.length > 0) {
            for (const drop of result.drops) {
              const cat = getItemInfo(drop.itemId)
              const type = (drop.type || cat?.type || 'material') as 'equipment' | 'consumable' | 'material' | 'currency' | 'skillbook'
              const dName = drop.name || cat?.name || drop.itemId
              const dQuality = (drop.quality || cat?.quality || 'common') as string
              if (type === 'currency') {
                after.addPlayerGold(drop.quantity * (cat?.value ?? 1))
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
                stats: cat?.stats,
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
      // 不再停止探索，由调用方恢复状态后继续
    }
    return victory
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addLog, combatTurnMut, currentLayer, recordLoot])

  // ─── 开始 / 停止 ───
  const startExploring = useCallback(async () => {
    if (isRunningRef.current) return // 防重入：避免并行探索链互相污染敌人显示
    const gs = useGameStore.getState()
    if (!gs.player) {
      addLog('请先创建角色')
      return
    }
    // 若已有地牢进行中，先重置
    gs.resetDungeon()
    setIsRunning(true)
    isRunningRef.current = true
    gs.setAutoExploring(true)
    setLogs([])
    setStats({ rooms: 0, kills: 0, items: 0, floor: 1, defeats: 0 })
    addLog('═══ 自动探索开始 ═══')
    addLog(`角色：${gs.player.name} (Lv.${gs.player.level})`)
    addLog(`HP: ${gs.player.hp}/${gs.player.maxHp} MP: ${gs.player.mp}/${gs.player.maxMp}`)
    await enterNewFloor(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addLog, enterNewFloor])

  const stopExploring = useCallback(() => {
    setIsRunning(false)
    isRunningRef.current = false
    useGameStore.getState().setAutoExploring(false)
    addLog('═══ 探索结束 ═══')
  }, [addLog])

  const getRoomTypeName = (type: string) => ROOM_TYPE_NAMES[type] || type
  const getRoomTypeColor = (type: string) => ROOM_TYPE_COLORS[type] || '#8B949E'

  // Minimap rendering
  const renderMinimap = () => {
    if (!store.dungeonRooms.length) return null
    const rooms = store.dungeonRooms
    const minX = Math.min(...rooms.map((r) => r.x)) - 1
    const maxX = Math.max(...rooms.map((r) => r.x)) + 1
    const minY = Math.min(...rooms.map((r) => r.y)) - 1
    const maxY = Math.max(...rooms.map((r) => r.y)) + 1
    const cellSize = 20
    const width = (maxX - minX + 1) * cellSize
    const height = (maxY - minY + 1) * cellSize

    return (
      <svg width={width} height={height} className="mx-auto">
        {rooms.map((room) =>
          room.connections.map((connId) => {
            const conn = rooms.find((r) => r.id === connId)
            if (!conn || room.id > conn.id) return null
            return (
              <line key={`${room.id}-${connId}`} x1={(room.x - minX) * cellSize + cellSize / 2} y1={(room.y - minY) * cellSize + cellSize / 2}
                x2={(conn.x - minX) * cellSize + cellSize / 2} y2={(conn.y - minY) * cellSize + cellSize / 2}
                stroke={store.exploredRooms.has(room.id) && store.exploredRooms.has(conn.id) ? '#484F58' : '#1C2128'} strokeWidth={2} />
            )
          })
        )}
        {rooms.map((room) => {
          const explored = store.exploredRooms.has(room.id)
          const isCurrent = room.id === store.currentRoomId
          return (
            <rect key={room.id} x={(room.x - minX) * cellSize + 3} y={(room.y - minY) * cellSize + 3}
              width={cellSize - 6} height={cellSize - 6} rx={3}
              fill={isCurrent ? '#C9A84C' : explored ? getRoomTypeColor(room.type) : '#1C2128'}
              stroke={isCurrent ? '#D4BA6A' : explored ? '#484F58' : '#161B22'} strokeWidth={1} />
          )
        })}
      </svg>
    )
  }

  // 敌人显示：战斗中用 combatEnemies（实时血量），否则用 roomInfo.enemies
  const displayEnemies = store.combatEnemies.length > 0
    ? store.combatEnemies
    : (store.roomInfo?.enemies || [])

  // 主界面：未开始探索
  if (!isRunning && !store.currentDungeon) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <div className="game-card w-full max-w-md space-y-4">
          <div className="text-center">
            <Compass size={32} className="mx-auto mb-2" style={{ color: 'var(--accent)' }} />
            <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>深渊地牢</h2>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>自动探索 · 无限层数 · 离线挂机</p>
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
                  <span>EXP</span><span>{store.player.exp}/{store.player.level * 100}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full" style={{ backgroundColor: 'var(--bg-hover)' }}>
                  <div className="h-full rounded-full transition-all duration-700 ease-out" style={{ width: `${Math.min(100, (store.player.exp / (store.player.level * 100)) * 100)}%`, background: 'linear-gradient(90deg, #C9A84C, #F0D878)' }} />
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
            提示：自动探索会自动战斗、自动拾取、自动进入下一层。你可以随时停止探索。
          </div>
        </div>
      </div>
    )
  }

  // 探索中界面
  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: 'var(--bg-primary)' }}>
      {/* Left: Player Status */}
      <aside className="hidden w-[240px] flex-shrink-0 border-r p-3 lg:block" style={{ borderColor: 'var(--border-color)' }}>
        <div className="mb-3 rounded p-2 text-center text-xs" style={{ backgroundColor: 'var(--bg-hover)' }}>
          <div className="font-bold" style={{ color: 'var(--accent)' }}>第 {currentLayer} 层</div>
          <div style={{ color: 'var(--text-muted)' }}>已探索 {stats.rooms} 个房间</div>
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
                <span>EXP</span><span>{store.player.exp}/{store.player.level * 100}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full" style={{ backgroundColor: 'var(--bg-hover)' }}>
                <div className="h-full rounded-full transition-all duration-700 ease-out" style={{ width: `${Math.min(100, (store.player.exp / (store.player.level * 100)) * 100)}%`, background: 'linear-gradient(90deg, #C9A84C, #F0D878)' }} />
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
        {store.roomInfo && (
          <div className="mb-4 max-h-[45%] flex-shrink-0 overflow-y-auto rounded-lg border p-4" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-card)' }}>
            <div className="mb-2 flex items-center gap-2">
              <span className="rounded px-2 py-0.5 text-xs font-bold" style={{ backgroundColor: getRoomTypeColor(store.roomInfo.type), color: '#0D1117' }}>
                {getRoomTypeName(store.roomInfo.type)}
              </span>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>房间 #{store.currentRoomId}</span>
              {store.inCombat && (
                <span className="rounded px-2 py-0.5 text-xs font-bold" style={{ backgroundColor: 'var(--danger)', color: '#fff' }}>
                  战斗中
                </span>
              )}
              {moving && !store.inCombat && (
                <span className="rounded px-2 py-0.5 text-xs font-bold" style={{ backgroundColor: 'var(--accent)', color: '#0D1117' }}>
                  移动中...
                </span>
              )}
            </div>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              {store.roomInfo.themeDescription}
            </p>
            {displayEnemies.length > 0 && (
              <div className="mt-2 rounded p-2" style={{ backgroundColor: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.3)' }}>
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
            )}
          </div>
        )}

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
                      : log.includes('战斗') || log.includes('遭遇') ? 'var(--warning)'
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
