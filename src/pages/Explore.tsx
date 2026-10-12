import { useState, useCallback, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router'
import { ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Search, Swords, Package, MapPin, Home, Compass, Play, Pause, Zap, Skull, Coins, Heart, AlertTriangle } from 'lucide-react'
import { useGameStore } from '@/stores/gameStore'
import { trpc } from '@/providers/trpc'

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

export default function Explore() {
  const navigate = useNavigate()
  const store = useGameStore()
  const [logs, setLogs] = useState<string[]>([])
  const [isRunning, setIsRunning] = useState(false)
  const [currentLayer, setCurrentLayer] = useState(1)
  const [stats, setStats] = useState({ rooms: 0, kills: 0, items: 0, floor: 1 })
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isRunningRef = useRef(false)

  const generateDungeon = trpc.game.generateDungeon.useQuery(
    { globalSeed: 'auto', layer: currentLayer, x: 0, y: 0 },
    { enabled: false }
  )
  const enterRoom = trpc.game.enterRoom.useQuery(
    { globalSeed: 'auto', layer: currentLayer, x: 0, y: 0, roomId: store.currentRoomId },
    { enabled: false }
  )
  const combatTurn = trpc.game.combatTurn.useMutation()

  const addLog = useCallback((msg: string) => {
    setLogs((prev) => [...prev.slice(-49), `[${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}] ${msg}`])
  }, [])

  // 进入新一层地牢
  const enterNewFloor = useCallback(async (layer: number) => {
    setCurrentLayer(layer)
    setStats((s) => ({ ...s, floor: layer }))
    addLog(`═══ 进入第 ${layer} 层 ═══`)

    try {
      const result = await generateDungeon.refetch()
      if (result.data) {
        store.setCurrentDungeon({
          seed: result.data.seed,
          layer: result.data.layer,
          x: 0, y: 0,
          theme: result.data.theme,
          roomCount: result.data.roomCount,
        })
        store.setDungeonRooms(result.data.rooms)
        store.setCurrentRoomId(result.data.entranceRoomId)
        store.addExploredRoom(result.data.entranceRoomId)
        addLog(`地牢生成完毕：${result.data.theme}，共 ${result.data.roomCount} 个房间`)

        // 自动开始探索入口房间
        await exploreRoom(result.data.entranceRoomId)
      }
    } catch (err) {
      addLog(`生成地牢失败: ${err}`)
    }
  }, [addLog, generateDungeon, store])

  // 探索房间
  const exploreRoom = useCallback(async (roomId: number) => {
    if (!isRunningRef.current) return

    try {
      const result = await enterRoom.refetch()
      if (!result.data) return

      const room = result.data
      store.setRoomInfo(room)
      store.addExploredRoom(roomId)
      setStats((s) => ({ ...s, rooms: s.rooms + 1 }))

      const roomName = ROOM_TYPE_NAMES[room.type] || room.type
      const roomColor = ROOM_TYPE_COLORS[room.type] || '#8B949E'

      // 播报房间信息
      addLog(`【${roomName}】${room.themeDescription}`)

      // 播报敌人
      if (room.enemies.length > 0) {
        addLog(`遭遇敌人：${room.enemies.map(e => `${e.name}(HP:${e.hp})`).join('、')}`)
        await autoBattle(room.enemies)
      } else if (room.type === 'treasure') {
        addLog(`发现宝箱！获得了一些物品`)
        setStats((s) => ({ ...s, items: s.items + 1 }))
      } else if (room.type === 'trap') {
        const dmg = Math.floor(Math.random() * 20) + 10
        addLog(`触发陷阱！受到 ${dmg} 点伤害`)
        if (store.player) {
          store.updatePlayerHp(store.player.hp - dmg)
        }
      } else if (room.type === 'safe') {
        addLog(`安全区域，恢复了一些状态`)
        if (store.player) {
          store.updatePlayerHp(Math.min(store.player.maxHp, store.player.hp + 30))
          store.updatePlayerMp(Math.min(store.player.maxMp, store.player.mp + 20))
        }
      } else {
        addLog(`这个房间很平静，没有发现敌人`)
      }

      // 自动拾取
      if (room.loot && room.loot.length > 0) {
        addLog(`拾取了 ${room.loot.length} 件物品`)
        setStats((s) => ({ ...s, items: s.items + room.loot.length }))
      }

      // 检查是否是Boss房
      if (room.isExit) {
        addLog(`═══ 击败Boss，进入下一层 ═══`)
        setTimeout(() => enterNewFloor(currentLayer + 1), 1000)
        return
      }

      // 继续探索下一个房间
      if (isRunningRef.current) {
        const directions = room.directions.filter((d) => !store.exploredRooms.has(d.roomId))
        if (directions.length > 0) {
          // 随机选择一个未探索的方向
          const nextDir = directions[Math.floor(Math.random() * directions.length)]
          addLog(`向${nextDir.direction}移动...`)
          setTimeout(() => exploreRoom(nextDir.roomId), 800)
        } else {
          // 所有方向都探索过了，随机选一个
          const allDirs = room.directions
          if (allDirs.length > 0) {
            const nextDir = allDirs[Math.floor(Math.random() * allDirs.length)]
            addLog(`向${nextDir.direction}移动...`)
            setTimeout(() => exploreRoom(nextDir.roomId), 800)
          } else {
            addLog(`没有可移动的方向，探索结束`)
            stopExploring()
          }
        }
      }
    } catch (err) {
      addLog(`探索出错: ${err}`)
      stopExploring()
    }
  }, [addLog, enterRoom, store, currentLayer, enterNewFloor])

  // 自动战斗
  const autoBattle = useCallback(async (enemies: any[]) => {
    if (!isRunningRef.current) return

    addLog(`战斗开始！`)
    store.setInCombat(true)
    store.setCombatEnemies(enemies.map((e) => ({
      id: e.id, name: e.name, hp: e.hp, maxHp: e.maxHp,
      mp: e.mp ?? 0, maxMp: e.maxMp ?? 0,
      atk: e.atk ?? 10, def: e.def ?? 5,
      mag: e.mag ?? 0, mdef: e.mdef ?? 3,
      agi: e.agi ?? 8, luk: e.luk ?? 3,
      skills: e.skills ?? [], element: e.element ?? 'none',
      aiType: e.aiType,
    })))

    let round = 1
    let combatEnded = false
    let victory = false

    while (!combatEnded && isRunningRef.current) {
      const aliveEnemies = store.combatEnemies.filter((e) => e.hp > 0)
      if (aliveEnemies.length === 0) break

      const player = store.player || {
        id: 'player', name: '冒险者', hp: 100, maxHp: 100,
        mp: 50, maxMp: 50, atk: 15, def: 10, mag: 10,
        mdef: 8, agi: 10, luk: 5, skills: ['fireball'], element: 'none',
      }

      // 自动选择技能（按顺序）
      let action: { type: 'attack' | 'skill'; skillId?: string } = { type: 'attack' }
      const skills = player.skills || []
      for (const skillId of skills) {
        const mpCost = getSkillMpCost(skillId)
        if (player.mp >= mpCost) {
          action = { type: 'skill', skillId }
          break
        }
      }

      try {
        const result = await combatTurn.mutateAsync({
          player: {
            id: player.id, name: player.name, hp: player.hp, maxHp: player.maxHp,
            mp: player.mp, maxMp: player.maxMp, atk: player.atk, def: player.def,
            mag: player.mag, mdef: player.mdef, agi: player.agi, luk: player.luk,
            skills: player.skills, element: player.element || 'none',
          },
          enemies: aliveEnemies.map((e) => ({
            id: e.id, name: e.name, hp: e.hp, maxHp: e.maxHp,
            mp: e.mp || 0, maxMp: e.maxMp || 0, atk: e.atk, def: e.def,
            mag: e.mag || 0, mdef: e.mdef || 0, agi: e.agi || 0, luk: e.luk || 0,
            skills: e.skills || [], element: e.element || 'none', aiType: e.aiType,
          })),
          action: {
            type: action.type,
            targetId: aliveEnemies[0]?.id,
            skillId: action.skillId,
          },
          turnSeed: Date.now(),
          layer: currentLayer,
          enemyDropTables: aliveEnemies.map((e) => ({ enemyId: e.id, dropTable: (e as any).dropTable })),
        })

        // 播报战斗日志
        result.logs.forEach((log) => {
          store.addCombatLog(log)
          addLog(log)
        })

        store.setCombatEnemies(result.enemies)

        if (result.victory) {
          combatEnded = true
          victory = true
          addLog(`战斗胜利！`)
          setStats((s) => ({ ...s, kills: s.kills + 1 }))

          if (result.drops && result.drops.length > 0) {
            result.drops.forEach((drop) => {
              store.addItem({
                uid: `drop_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                id: drop.itemId, name: drop.name,
                type: drop.type === 'equipment' ? 'equipment' : 'consumable',
                quality: drop.quality as any, quantity: drop.quantity,
                desc: `${drop.name}`,
              })
            })
            addLog(`获得掉落：${result.drops.map(d => d.name).join('、')}`)
          }

          // 更新玩家状态
          if (result.player) {
            store.updatePlayerHp(result.player.hp)
            store.updatePlayerMp(result.player.mp)
          }
        } else if (result.ended) {
          combatEnded = true
          addLog(`你被击败了...`)
          store.setCombatEnded(true)
        }

        round++
      } catch (err) {
        addLog(`战斗出错: ${err}`)
        combatEnded = true
      }

      // 战斗间隔
      await new Promise((r) => setTimeout(r, 1000))
    }

    store.setInCombat(false)

    if (!victory) {
      addLog(`探索结束，返回城镇`)
      stopExploring()
    }
  }, [addLog, combatTurn, store, currentLayer])

  // 获取技能MP消耗
  const getSkillMpCost = (skillId: string): number => {
    const costs: Record<string, number> = {
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
    return costs[skillId] || 10
  }

  // 开始自动探索
  const startExploring = useCallback(async () => {
    if (!store.player) {
      addLog('请先创建角色')
      return
    }
    setIsRunning(true)
    isRunningRef.current = true
    store.setAutoExploring(true)
    setLogs([])
    setStats({ rooms: 0, kills: 0, items: 0, floor: 1 })
    addLog('═══ 自动探索开始 ═══')
    addLog(`角色：${store.player.name} (Lv.${store.player.level})`)
    addLog(`HP: ${store.player.hp}/${store.player.maxHp} MP: ${store.player.mp}/${store.player.maxMp}`)
    await enterNewFloor(1)
  }, [store, addLog, enterNewFloor])

  // 停止探索
  const stopExploring = useCallback(() => {
    setIsRunning(false)
    isRunningRef.current = false
    store.setAutoExploring(false)
    if (timerRef.current) clearTimeout(timerRef.current)
    addLog('═══ 探索结束 ═══')
  }, [addLog, store])

  // 清理定时器
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

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

          {/* 角色状态 */}
          {store.player ? (
            <div className="rounded p-3" style={{ backgroundColor: 'var(--bg-hover)' }}>
              <div className="mb-2 flex items-center justify-between">
                <span className="font-bold" style={{ color: 'var(--text-primary)' }}>{store.player.name}</span>
                <span className="text-xs" style={{ color: 'var(--accent)' }}>Lv.{store.player.level}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                <div className="flex items-center gap-1"><Heart size={12} style={{ color: '#F85149' }} /> {store.player.hp}/{store.player.maxHp}</div>
                <div className="flex items-center gap-1"><Zap size={12} style={{ color: '#58A6FF' }} /> {store.player.mp}/{store.player.maxMp}</div>
                <div className="flex items-center gap-1"><Swords size={12} /> 攻击 {store.player.atk}</div>
                <div className="flex items-center gap-1"><Shield size={12} /> 防御 {store.player.def}</div>
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
    <div className="flex min-h-screen" style={{ backgroundColor: 'var(--bg-primary)' }}>
      {/* Left: Player Status */}
      <aside className="hidden w-[240px] flex-shrink-0 border-r p-3 lg:block" style={{ borderColor: 'var(--border-color)' }}>
        <div className="mb-3 rounded p-2 text-center text-xs" style={{ backgroundColor: 'var(--bg-hover)' }}>
          <div className="font-bold" style={{ color: 'var(--accent)' }}>第 {currentLayer} 层</div>
          <div style={{ color: 'var(--text-muted)' }}>已探索 {stats.rooms} 个房间</div>
        </div>

        {/* 玩家状态 */}
        <div className="mb-3 space-y-2">
          <div>
            <div className="mb-1 flex justify-between text-xs" style={{ color: 'var(--text-secondary)' }}>
              <span>HP</span><span>{store.player?.hp ?? 100}/{store.player?.maxHp ?? 100}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full" style={{ backgroundColor: 'var(--bg-hover)' }}>
              <div className="h-full rounded-full transition-all" style={{ width: `${store.player ? (store.player.hp / store.player.maxHp) * 100 : 100}%`, background: 'linear-gradient(90deg, #F85149, #3FB950)' }} />
            </div>
          </div>
          <div>
            <div className="mb-1 flex justify-between text-xs" style={{ color: 'var(--text-secondary)' }}>
              <span>MP</span><span>{store.player?.mp ?? 50}/{store.player?.maxMp ?? 50}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full" style={{ backgroundColor: 'var(--bg-hover)' }}>
              <div className="h-full rounded-full transition-all" style={{ width: `${store.player ? (store.player.mp / store.player.maxMp) * 100 : 100}%`, background: 'linear-gradient(90deg, #58A6FF, #79C0FF)' }} />
            </div>
          </div>
        </div>

        {/* 统计 */}
        <div className="mb-3 rounded p-2 text-xs" style={{ backgroundColor: 'var(--bg-hover)' }}>
          <div className="mb-1 flex items-center gap-1" style={{ color: 'var(--text-secondary)' }}>
            <Skull size={12} /> 击杀: {stats.kills}
          </div>
          <div className="flex items-center gap-1" style={{ color: 'var(--text-secondary)' }}>
            <Coins size={12} /> 物品: {stats.items}
          </div>
        </div>

        {/* 控制按钮 */}
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
      <main className="flex flex-1 flex-col p-4">
        {/* 当前房间信息 */}
        {store.roomInfo && (
          <div className="mb-4 rounded-lg border p-4" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-card)' }}>
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
            </div>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              {store.roomInfo.themeDescription}
            </p>
            {store.roomInfo.enemies.length > 0 && (
              <div className="mt-2 rounded p-2" style={{ backgroundColor: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.3)' }}>
                <div className="mb-1 text-xs font-bold" style={{ color: 'var(--danger)' }}>敌人</div>
                {store.roomInfo.enemies.map((e) => (
                  <div key={e.id} className="flex items-center justify-between text-xs" style={{ color: 'var(--text-secondary)' }}>
                    <span>{e.name}</span>
                    <span>HP: {e.hp}/{e.maxHp}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 探索日志 */}
        <div className="flex-1 overflow-auto rounded-lg border p-3" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-card)' }}>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>探索日志</span>
            <button className="text-xs" style={{ color: 'var(--text-muted)' }} onClick={() => setLogs([])}>清空</button>
          </div>
          {logs.map((log, i) => (
            <div key={i} className="mb-1 text-xs" style={{
              color: log.includes('═══') ? 'var(--accent)'
                : log.includes('胜利') || log.includes('获得') ? 'var(--success)'
                  : log.includes('击败') || log.includes('受到') ? 'var(--danger)'
                    : log.includes('战斗') || log.includes('遭遇') ? 'var(--warning)'
                      : 'var(--text-secondary)'
            }}>
              {log}
            </div>
          ))}
        </div>
      </main>

      {/* Right: Minimap */}
      <aside className="hidden w-[200px] flex-shrink-0 border-l p-3 xl:block" style={{ borderColor: 'var(--border-color)' }}>
        <div className="mb-2 text-center text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>地牢地图</div>
        <div className="rounded p-2" style={{ backgroundColor: 'var(--bg-hover)' }}>
          {renderMinimap()}
        </div>
        <div className="mt-2 space-y-1 text-xs" style={{ color: 'var(--text-muted)' }}>
          <div className="flex items-center gap-1"><div className="h-2 w-2 rounded-sm" style={{ backgroundColor: 'var(--accent)' }} /> 当前位置</div>
          <div className="flex items-center gap-1"><div className="h-2 w-2 rounded-sm" style={{ backgroundColor: '#8B949E' }} /> 已探索</div>
          <div className="flex items-center gap-1"><div className="h-2 w-2 rounded-sm" style={{ backgroundColor: '#1C2128' }} /> 未探索</div>
        </div>
      </aside>
    </div>
  )
}
