import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router'
import { ArrowLeft, Users, Swords, Shield, Heart, Droplets, Zap, MapPin, Wind, Clock, CheckCircle2, Circle, AlertTriangle, LogOut } from 'lucide-react'
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
  const location = useLocation()
  const partyId = location.state?.partyId || 0
  const characterId = Number(localStorage.getItem('ad_char_id') || Date.now())

  const [roomData, setRoomData] = useState<any>(location.state?.roomData || null)
  const [logs, setLogs] = useState<string[]>([])
  const [actionPending, setActionPending] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const [mySubmittedAction, setMySubmittedAction] = useState<string | null>(null)
  const [showEscapeConfirm, setShowEscapeConfirm] = useState(false)

  // Poll dungeon state frequently
  const stateQuery = trpc.party.dungeonState.useQuery(
    { partyId },
    { enabled: partyId > 0, refetchInterval: 1200 }
  )

  useEffect(() => {
    if (stateQuery.data?.roomData) {
      setRoomData(stateQuery.data.roomData)
      if (stateQuery.data.roomData.combatState?.logs) {
        setLogs(stateQuery.data.roomData.combatState.logs)
      }
      // Reset my submitted action when new round starts (player_input phase)
      const cs = stateQuery.data.roomData.combatState
      if (cs?.phase === 'player_input' && cs?.pendingActions && !cs.pendingActions[characterId]) {
        setMySubmittedAction(null)
        setActionPending(false)
      }
    }
  }, [stateQuery.data, characterId])

  // Countdown timer
  useEffect(() => {
    if (!roomData?.combatState?.inCombat || roomData?.combatState?.ended) {
      setCountdown(0)
      return
    }
    const cs = roomData.combatState
    if (cs.phase !== 'player_input') {
      setCountdown(0)
      return
    }

    const deadline = cs.turnDeadline
    const timer = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
      setCountdown(remaining)
      if (remaining <= 0) {
        clearInterval(timer)
        stateQuery.refetch()
      }
    }, 200)

    return () => clearInterval(timer)
  }, [roomData?.combatState?.turnDeadline, roomData?.combatState?.phase, roomData?.combatState?.inCombat, stateQuery])

  // Mutations
  const moveMut = trpc.party.moveRoom.useMutation({
    onSuccess: (data) => {
      if (data.success && data.roomData) {
        setRoomData(data.roomData)
        setMySubmittedAction(null)
        setActionPending(false)
      }
    }
  })
  const leaveMut = trpc.party.leave.useMutation({
    onSuccess: () => {
      navigate('/party')
    }
  })
  const combatMut = trpc.party.combatAction.useMutation({
    onSuccess: (data) => {
      if (data.success && data.combatUpdate) {
        setLogs(data.combatUpdate.logs)
        setRoomData((prev: any) => prev ? {
          ...prev,
          combatState: data.combatUpdate,
          inCombat: data.combatUpdate.inCombat,
        } : prev)
      }
      setActionPending(false)
    },
    onError: () => setActionPending(false)
  })

  const handleMove = (roomId: number) => {
    if (!partyId) return
    moveMut.mutate({ partyId, characterId, targetRoomId: roomId })
  }

  const handleCombatAction = (type: 'attack' | 'skill' | 'defend' | 'flee') => {
    if (!partyId || actionPending || mySubmittedAction) return
    setActionPending(true)
    setMySubmittedAction(type)
    combatMut.mutate({ partyId, characterId, action: { type } })
  }

  const handleEscape = () => {
    if (!partyId) return
    leaveMut.mutate({ characterId })
    setShowEscapeConfirm(false)
  }

  if (!partyId) {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-muted)' }}>
        <div className="text-center space-y-3">
          <div className="mb-2">无法确定队伍ID</div>
          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>请从队伍页面进入地牢</div>
          <button onClick={() => navigate('/party')} className="game-btn-secondary text-xs px-4 py-2">
            返回队伍页面
          </button>
        </div>
      </div>
    )
  }

  if (!roomData) {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-muted)' }}>
        <div className="text-center space-y-3">
          <div className="mb-2">正在同步地牢数据...</div>
          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>队伍ID: {partyId}</div>
          {stateQuery.isError && (
            <div className="text-xs" style={{ color: '#F85149' }}>同步失败，地牢数据已丢失</div>
          )}
          <button onClick={() => navigate('/party')} className="game-btn-secondary text-xs px-4 py-2">
            返回队伍页面
          </button>
        </div>
      </div>
    )
  }

  const { combatState, memberStates, directions, enemies, type, isEntrance, isExit, leaderId } = roomData
  const inCombat = combatState?.inCombat
  const isLeader = leaderId === characterId
  const isPlayerInput = combatState?.phase === 'player_input'
  const aliveMembers = memberStates?.filter((m: any) => m.isAlive) || []
  const pendingActions = combatState?.pendingActions || {}
  const allSubmitted = combatState?.submittedCount >= aliveMembers.length

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

      {/* Phase Indicator Bar */}
      {inCombat && !combatState?.ended && (
        <div className="flex items-center justify-between border-b px-4 py-2" style={{
          borderColor: isPlayerInput ? 'rgba(63,185,80,0.3)' : 'var(--border-color)',
          backgroundColor: isPlayerInput ? 'rgba(63,185,80,0.08)' : 'var(--bg-hover)'
        }}>
          <div className="flex items-center gap-2">
            {isPlayerInput ? (
              <Swords size={14} style={{ color: '#3FB950' }} />
            ) : (
              <AlertTriangle size={14} style={{ color: '#C9A84C' }} />
            )}
            <span className="text-xs font-bold" style={{ color: isPlayerInput ? '#3FB950' : '#C9A84C' }}>
              {isPlayerInput ? '我方回合 — 请下达指令' : combatState?.phase === 'enemy' ? '敌方回合' : '执行中...'}
            </span>
            {allSubmitted && isPlayerInput && (
              <span className="rounded px-1.5 py-0.5 text-[10px]" style={{ backgroundColor: 'rgba(63,185,80,0.2)', color: '#3FB950' }}>
                全员已提交
              </span>
            )}
          </div>
          {isPlayerInput && (
            <div className="flex items-center gap-1">
              <Clock size={12} style={{ color: countdown <= 3 ? '#F85149' : countdown <= 5 ? '#C9A84C' : 'var(--text-muted)' }} />
              <span className="text-sm font-bold tabular-nums" style={{
                color: countdown <= 3 ? '#F85149' : countdown <= 5 ? '#C9A84C' : 'var(--text-primary)'
              }}>
                {countdown}s
              </span>
            </div>
          )}
        </div>
      )}

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

          {/* Members with submission status */}
          <div className="mb-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>队伍状态</span>
              {isPlayerInput && (
                <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                  已提交 {combatState?.submittedCount || 0}/{aliveMembers.length}
                </span>
              )}
            </div>
            {memberStates?.map((m: any) => {
              const isMe = m.characterId === characterId
              const hasSubmitted = !!pendingActions[m.characterId]
              const isAlive = m.isAlive
              return (
                <div key={m.characterId} className="game-card flex items-center justify-between py-2" style={{
                  borderColor: isPlayerInput && hasSubmitted ? 'rgba(63,185,80,0.4)' : 'var(--border-color)',
                  borderWidth: isPlayerInput && hasSubmitted ? 2 : 1,
                  opacity: isAlive ? 1 : 0.5,
                }}>
                  <div className="flex items-center gap-2">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full" style={{ backgroundColor: `${CLASS_COLORS[m.classId] || 'var(--accent)'}20` }}>
                      <Users size={10} style={{ color: CLASS_COLORS[m.classId] || 'var(--accent)' }} />
                    </div>
                    <div>
                      <div className="flex items-center gap-1">
                        <span className="text-xs font-bold" style={{ color: isAlive ? 'var(--text-primary)' : 'var(--danger)' }}>
                          {m.name} {isMe && '(我)'} {!isAlive && '(阵亡)'}
                        </span>
                        {isPlayerInput && isAlive && (
                          hasSubmitted ? (
                            <CheckCircle2 size={12} style={{ color: '#3FB950' }} />
                          ) : (
                            <Circle size={12} style={{ color: 'var(--text-muted)' }} />
                          )
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span style={{ color: '#F85149' }}><Heart size={10} className="inline" /> {m.hp}/{m.maxHp}</span>
                    <span style={{ color: '#58A6FF' }}><Droplets size={10} className="inline" /> {m.mp}/{m.maxMp}</span>
                    {isPlayerInput && isAlive && (
                      <span className="text-[10px]" style={{ color: hasSubmitted ? '#3FB950' : 'var(--text-muted)' }}>
                        {hasSubmitted ? '已指令' : '待指令'}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Directions — only leader can move */}
          <div className="mb-4">
            <div className="mb-2 text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>
              {!isLeader ? '房间出口（仅队长可选择）' : inCombat ? '房间出口（战斗中无法移动）' : '可移动方向'}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {directions?.map((dir: any) => (
                <button
                  key={dir.roomId}
                  onClick={() => isLeader && !inCombat && handleMove(dir.roomId)}
                  className="game-card flex items-center justify-center gap-1 py-3 text-xs transition-all"
                  disabled={!isLeader || inCombat}
                  style={{ opacity: (!isLeader || inCombat) ? 0.4 : 1, cursor: (!isLeader || inCombat) ? 'not-allowed' : 'pointer' }}
                >
                  <MapPin size={12} style={{ color: (!isLeader || inCombat) ? 'var(--text-muted)' : 'var(--accent)' }} />
                  <span style={{ color: (!isLeader || inCombat) ? 'var(--text-muted)' : 'var(--text-primary)' }}>{dir.direction}</span>
                </button>
              ))}
              {(!directions || directions.length === 0) && (
                <div className="col-span-full rounded p-3 text-center text-xs" style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-muted)' }}>
                  死路
                </div>
              )}
            </div>
          </div>

          {/* Escape Dungeon — only when NOT in active combat */}
          {!inCombat && (
            <div className="mb-4">
              <button
                onClick={() => setShowEscapeConfirm(true)}
                className="game-card flex w-full items-center justify-center gap-2 py-3 text-xs transition-all hover:scale-[1.01]"
                style={{ borderColor: '#F85149', borderStyle: 'dashed', color: '#F85149' }}
              >
                <LogOut size={14} /> 逃离地牢
              </button>
            </div>
          )}

          {/* Combat Result — only show right after combat ends */}
          {inCombat && combatState?.ended && (
            <div className="game-card mb-4 text-center py-4" style={{
              borderColor: combatState.victory ? '#3FB950' : combatState.fled ? '#C9A84C' : '#F85149'
            }}>
              <div className="text-lg font-bold" style={{
                color: combatState.victory ? '#3FB950' : combatState.fled ? '#C9A84C' : '#F85149'
              }}>
                {combatState.victory ? '战斗胜利！' : combatState.fled ? '成功逃跑' : '全军覆没...'}
              </div>
              {!combatState.victory && !combatState.fled && (
                <button onClick={() => navigate('/party')} className="mt-2 game-btn-secondary text-xs">
                  返回组队页面
                </button>
              )}
            </div>
          )}

          {/* Combat Actions — ALL alive members can submit during player_input */}
          {inCombat && !combatState?.ended && isPlayerInput && (
            <div className="game-card space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold" style={{ color: 'var(--danger)' }}>
                  <Swords size={14} className="inline" /> 战斗中 — 第{combatState?.currentRound}回合
                </span>
              </div>

              {/* Enemies with HP bar */}
              <div className="space-y-2">
                {enemies?.map((e: any, i: number) => {
                  const hpPct = e.isAlive ? Math.round((e.hp / e.maxHp) * 100) : 0
                  return (
                    <div key={i} className="rounded p-2" style={{ backgroundColor: 'var(--bg-hover)' }}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold" style={{ color: e.isAlive ? 'var(--danger)' : 'var(--text-muted)' }}>
                          {e.isAlive && <Swords size={10} className="inline mr-1" style={{ color: '#F85149' }} />}
                          {e.name} {!e.isAlive && '(已击败)'}
                        </span>
                        {e.isAlive && (
                          <span className="text-xs font-bold" style={{ color: '#F85149' }}>
                            {e.hp}/{e.maxHp}
                          </span>
                        )}
                      </div>
                      {e.isAlive && (
                        <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ backgroundColor: 'rgba(248,81,73,0.15)' }}>
                          <div className="h-full rounded-full transition-all" style={{ width: `${hpPct}%`, backgroundColor: hpPct <= 25 ? '#F85149' : hpPct <= 50 ? '#C9A84C' : '#3FB950' }} />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* My action buttons — only if I'm alive */}
              {(() => {
                const me = memberStates?.find((m: any) => m.characterId === characterId)
                if (!me || !me.isAlive) {
                  return <div className="text-center text-xs py-2" style={{ color: 'var(--danger)' }}>你已阵亡，无法行动</div>
                }
                if (mySubmittedAction) {
                  return (
                    <div className="text-center py-3">
                      <CheckCircle2 size={24} style={{ color: '#3FB950' }} className="mx-auto mb-1" />
                      <div className="text-xs" style={{ color: '#3FB950' }}>
                        已下达指令：{mySubmittedAction === 'attack' ? '攻击' : mySubmittedAction === 'skill' ? '技能' : mySubmittedAction === 'defend' ? '防御' : '逃跑'}
                      </div>
                      <div className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
                        等待其他队员... ({combatState?.submittedCount || 0}/{aliveMembers.length})
                      </div>
                    </div>
                  )
                }
                return (
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
                )
              })()}
            </div>
          )}

          {/* Enemy phase / Executing */}
          {inCombat && !combatState?.ended && !isPlayerInput && (
            <div className="game-card text-center py-6">
              <div className="mb-2">
                {combatState?.phase === 'enemy' ? (
                  <AlertTriangle size={24} style={{ color: '#F85149' }} className="mx-auto mb-1" />
                ) : (
                  <Zap size={24} style={{ color: '#58A6FF' }} className="mx-auto mb-1" />
                )}
              </div>
              <div className="text-sm font-bold" style={{ color: combatState?.phase === 'enemy' ? '#F85149' : '#58A6FF' }}>
                {combatState?.phase === 'enemy' ? '敌方行动中...' : '执行指令中...'}
              </div>
              <div className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                等待服务端处理...
              </div>
            </div>
          )}
        </div>

        {/* Escape Confirm Modal */}
        {showEscapeConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}>
            <div className="game-card mx-4 w-full max-w-sm space-y-4 p-6" style={{ backgroundColor: 'var(--bg-card)' }}>
              <div className="text-center">
                <AlertTriangle size={32} style={{ color: '#F85149' }} className="mx-auto mb-2" />
                <div className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>确认逃离地牢？</div>
                <div className="mt-2 text-xs" style={{ color: '#F85149' }}>
                  退出会退队，你将离开当前队伍！
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowEscapeConfirm(false)} className="game-btn-secondary flex-1 py-2 text-xs">
                  取消
                </button>
                <button onClick={handleEscape} disabled={leaveMut.isPending} className="flex-1 rounded py-2 text-xs font-bold" style={{ backgroundColor: '#F85149', color: '#fff' }}>
                  {leaveMut.isPending ? '退出中...' : '确认退出'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Right: Combat Log */}
        <div className="w-full border-t p-4 lg:w-[300px] lg:border-l lg:border-t-0" style={{ borderColor: 'var(--border-color)' }}>
          <div className="mb-2 text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>战斗日志</div>
          <div className="max-h-[400px] space-y-1 overflow-y-auto lg:max-h-[calc(100vh-120px)]">
            {logs.length === 0 ? (
              <div className="text-xs" style={{ color: 'var(--text-muted)' }}>暂无日志</div>
            ) : (
              logs.slice(-50).map((log, i) => (
                <div key={i} className="text-xs" style={{
                  color: log.startsWith('[超时]') ? '#C9A84C'
                    : log.includes('倒下了') || log.includes('阵亡') ? '#F85149'
                    : log.includes('胜利') ? '#3FB950'
                    : log.startsWith('第') && log.includes('回合') ? '#58A6FF'
                    : log.includes('已下达指令') ? '#A371F7'
                    : log.includes('全员指令') ? '#3FB950'
                    : 'var(--text-secondary)'
                }}>
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
