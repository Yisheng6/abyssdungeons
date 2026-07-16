import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router'
import { ArrowLeft, Users, Swords, Shield, Heart, Brain, Wind, Star, Droplets, Zap, MapPin, Crosshair, Play } from 'lucide-react'
import { trpc } from '@/providers/trpc'

const CLASS_NAMES: Record<string, string> = {
  warrior: '战士', mage: '法师', assassin: '刺客',
  ranger: '游侠', priest: '牧师', warlock: '术士',
}
const CLASS_COLORS: Record<string, string> = {
  warrior: '#F85149', mage: '#58A6FF', assassin: '#A371F7',
  ranger: '#3FB950', priest: '#C9A84C', warlock: '#FF7B72',
}

export default function PartyDungeon() {
  const navigate = useNavigate()
  const { instanceId } = useParams()
  const location = useLocation()
  const partyId = location.state?.partyId
  const characterId = Number(localStorage.getItem('ad_char_id') || Date.now())

  const [roomData, setRoomData] = useState<any>(location.state?.roomData || null)
  const [logs, setLogs] = useState<string[]>([])
  const [actionPending, setActionPending] = useState(false)

  // Poll dungeon state
  const stateQuery = trpc.party.dungeonState.useQuery(
    { partyId: partyId || 0 },
    {
      enabled: !!partyId,
      refetchInterval: 2000,
    }
  )

  useEffect(() => {
    if (stateQuery.data?.roomData) {
      setRoomData(stateQuery.data.roomData)
      if (stateQuery.data.roomData.combatState?.logs) {
        setLogs(stateQuery.data.roomData.combatState.logs)
      }
    }
  }, [stateQuery.data])

  // Mutations
  const moveMut = trpc.party.moveRoom.useMutation({
    onSuccess: (data) => { if (data.success && data.roomData) setRoomData(data.roomData); setActionPending(false) }
  })
  const combatMut = trpc.party.combatAction.useMutation({
    onSuccess: (data) => {
      if (data.success && data.combatUpdate) {
        setLogs(data.combatUpdate.logs)
      }
      setActionPending(false)
    }
  })

  const handleMove = (roomId: number) => {
    if (!partyId || actionPending) return
    setActionPending(true)
    moveMut.mutate({ partyId, characterId, targetRoomId: roomId })
  }

  const handleCombatAction = (type: 'attack' | 'skill' | 'defend' | 'flee') => {
    if (!partyId || actionPending) return
    setActionPending(true)
    combatMut.mutate({ partyId, characterId, action: { type } })
  }

  if (!roomData) {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-muted)' }}>
        加载中...
      </div>
    )
  }

  const { combatState, memberStates, directions, enemies, type, isEntrance, isExit } = roomData
  const inCombat = combatState?.inCombat
  const aliveMembers = memberStates?.filter((m: any) => m.isAlive) || []

  return (
    <div className="flex min-h-screen flex-col" style={{ backgroundColor: 'var(--bg-primary)' }}>
      {/* Header */}
      <header className="flex h-12 items-center gap-3 border-b px-4" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-card)' }}>
        <button onClick={() => navigate('/party')} style={{ color: 'var(--text-muted)' }}><ArrowLeft size={20} /></button>
        <span className="font-bold" style={{ color: 'var(--text-primary)' }}>组队地牢</span>
        <span className="ml-auto flex items-center gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
          <MapPin size={12} /> 房间 {roomData.roomId}
        </span>
      </header>

      <div className="flex flex-1 flex-col lg:flex-row">
        {/* Left: Room + Members */}
        <div className="flex-1 p-4">
          {/* Room Info */}
          <div className="game-card mb-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold" style={{ color: 'var(--accent)' }}>
                {type === 'entrance' ? '入口' : type === 'boss' ? 'Boss房间' : type === 'elite' ? '精英房间' : type === 'treasure' ? '宝箱房间' : '普通房间'}
              </span>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                探索 {roomData.exploredRoomCount}/{roomData.totalRooms}
              </span>
            </div>
            {isExit && <div className="mt-1 text-xs font-bold" style={{ color: '#3FB950' }}>出口在此！</div>}
          </div>

          {/* Members */}
          <div className="mb-4 space-y-2">
            <div className="text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>队伍状态</div>
            {memberStates?.map((m: any) => (
              <div key={m.characterId} className="game-card flex items-center justify-between py-2">
                <div className="flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full" style={{ backgroundColor: `${CLASS_COLORS[m.classId] || 'var(--accent)'}20` }}>
                    <Users size={10} style={{ color: CLASS_COLORS[m.classId] || 'var(--accent)' }} />
                  </div>
                  <div>
                    <div className="text-xs font-bold" style={{ color: m.isAlive ? 'var(--text-primary)' : 'var(--danger)' }}>
                      {m.name} {!m.isAlive && '(阵亡)'}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span style={{ color: '#F85149' }}><Heart size={10} className="inline" /> {m.hp}/{m.maxHp}</span>
                  <span style={{ color: '#58A6FF' }}><Droplets size={10} className="inline" /> {m.mp}/{m.maxMp}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Directions */}
          {!inCombat && (
            <div className="mb-4">
              <div className="mb-2 text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>可移动方向</div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {directions?.map((dir: any) => (
                  <button key={dir.roomId} onClick={() => handleMove(dir.roomId)} className="game-card flex items-center justify-center gap-1 py-3 text-xs transition-all hover:scale-[1.02]" disabled={actionPending}>
                    <MapPin size={12} style={{ color: 'var(--accent)' }} />
                    {dir.direction}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Combat Actions */}
          {inCombat && (
            <div className="game-card space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold" style={{ color: 'var(--danger)' }}>
                  <Swords size={14} className="inline" /> 战斗中
                </span>
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  回合 {combatState?.currentTurn + 1}
                </span>
              </div>

              {/* Enemies */}
              <div className="space-y-1">
                {enemies?.map((e: any, i: number) => (
                  <div key={i} className="flex items-center justify-between rounded p-2" style={{ backgroundColor: 'var(--bg-hover)' }}>
                    <span className="text-xs font-bold" style={{ color: e.isAlive ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                      {e.name} {!e.isAlive && '(已击败)'}
                    </span>
                    {e.isAlive && (
                      <span className="text-xs" style={{ color: '#F85149' }}>
                        HP {e.hp}/{e.maxHp}
                      </span>
                    )}
                  </div>
                ))}
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-4 gap-2">
                <button onClick={() => handleCombatAction('attack')} disabled={actionPending} className="game-btn-primary py-2 text-xs">
                  <Swords size={12} className="mx-auto mb-1" /> 攻击
                </button>
                <button onClick={() => handleCombatAction('skill')} disabled={actionPending} className="game-btn-primary py-2 text-xs" style={{ backgroundColor: '#58A6FF' }}>
                  <Zap size={12} className="mx-auto mb-1" /> 技能
                </button>
                <button onClick={() => handleCombatAction('defend')} disabled={actionPending} className="game-btn-secondary py-2 text-xs">
                  <Shield size={12} className="mx-auto mb-1" /> 防御
                </button>
                <button onClick={() => handleCombatAction('flee')} disabled={actionPending} className="game-btn-secondary py-2 text-xs" style={{ color: 'var(--danger)' }}>
                  <Wind size={12} className="mx-auto mb-1" /> 逃跑
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right: Combat Log */}
        <div className="w-full border-t p-4 lg:w-[300px] lg:border-l lg:border-t-0" style={{ borderColor: 'var(--border-color)' }}>
          <div className="mb-2 text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>战斗日志</div>
          <div className="max-h-[400px] space-y-1 overflow-y-auto lg:max-h-[calc(100vh-120px)]">
            {logs.length === 0 ? (
              <div className="text-xs" style={{ color: 'var(--text-muted)' }}>暂无日志</div>
            ) : (
              logs.slice(-30).map((log, i) => (
                <div key={i} className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  <span style={{ color: 'var(--text-muted)' }}>#{i + 1}</span> {log}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
