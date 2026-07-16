import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router'
import { ArrowLeft, Users, Plus, LogOut, Crown, Check, User, X, Swords, Shield, Sparkles, Wind, Star, Heart, Zap } from 'lucide-react'
import { trpc } from '@/providers/trpc'
import { useGameStore } from '@/stores/gameStore'

// Default class stats for estimating other members' stats
const DEFAULT_CLASS_STATS: Record<string, Record<string, number>> = {
  warrior:  { hp: 150, mp: 30, atk: 15, def: 12, mag: 2, mdef: 8, agi: 6, luk: 5 },
  mage:     { hp: 80,  mp: 100, atk: 5, def: 4, mag: 18, mdef: 12, agi: 7, luk: 8 },
  assassin: { hp: 100, mp: 50, atk: 18, def: 6, mag: 4, mdef: 5, agi: 16, luk: 10 },
  ranger:   { hp: 110, mp: 45, atk: 14, def: 7, mag: 6, mdef: 7, agi: 14, luk: 9 },
  priest:   { hp: 100, mp: 80, atk: 6, def: 6, mag: 14, mdef: 14, agi: 6, luk: 7 },
  warlock:  { hp: 90,  mp: 90, atk: 7, def: 5, mag: 16, mdef: 10, agi: 8, luk: 12 },
}

function getEstimatedStats(classId: string, level: number) {
  const base = DEFAULT_CLASS_STATS[classId] || DEFAULT_CLASS_STATS.warrior
  const lv = Math.max(1, level)
  const scale = 1 + (lv - 1) * 0.15
  return {
    hp: Math.round(base.hp * scale),
    mp: Math.round(base.mp * scale),
    atk: Math.round(base.atk * scale),
    def: Math.round(base.def * scale),
    mag: Math.round(base.mag * scale),
    mdef: Math.round(base.mdef * scale),
    agi: Math.round(base.agi * scale),
    luk: Math.round(base.luk * scale),
  }
}

// Stat row for member card
function StatRow({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <div className="flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
        <span style={{ color }}>{icon}</span>
        <span>{label}</span>
      </div>
      <span className="font-bold" style={{ color }}>{value}</span>
    </div>
  )
}

// HP/MP bar with number
function BarStat({ icon, label, value, max, color, bgColor }: { icon: React.ReactNode; label: string; value: number; max: number; color: string; bgColor: string }) {
  const pct = Math.round((value / max) * 100)
  return (
    <div className="w-full">
      <div className="flex items-center justify-between text-xs mb-0.5">
        <div className="flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
          <span style={{ color }}>{icon}</span>
          <span>{label}</span>
        </div>
        <span className="font-bold" style={{ color }}>{value}/{max}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ backgroundColor: bgColor }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  )
}

const CLASS_NAMES: Record<string, string> = {
  warrior: '战士', mage: '法师', assassin: '刺客',
  ranger: '游侠', priest: '牧师', warlock: '术士',
}
const CLASS_COLORS: Record<string, string> = {
  warrior: '#F85149', mage: '#58A6FF', assassin: '#A371F7',
  ranger: '#3FB950', priest: '#C9A84C', warlock: '#FF7B72',
}

// Stable character ID from localStorage + class info
function getCharacterInfo() {
  let charId = Number(localStorage.getItem('ad_char_id') || 0)
  if (!charId || charId === 0) {
    charId = Date.now()
    localStorage.setItem('ad_char_id', String(charId))
  }
  const store = useGameStore.getState()
  return {
    characterId: charId,
    characterName: store.playerName || localStorage.getItem('ad_user') || '冒险者',
    classId: store.player?.classId || 'warrior',
    level: store.player?.level || 1,
  }
}

export default function Party() {
  const navigate = useNavigate()
  const gameStore = useGameStore()
  const [charInfo, setCharInfo] = useState(getCharacterInfo)

  // Refresh charInfo when store changes
  useEffect(() => {
    setCharInfo(getCharacterInfo())
  }, [gameStore.playerName, gameStore.player?.classId, gameStore.player?.level])

  const { characterId, characterName, classId, level } = charInfo

  const [view, setView] = useState<'list' | 'myParty'>('list')
  const [partyName, setPartyName] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [layer, setLayer] = useState(1)
  const [msg, setMsg] = useState('')

  // tRPC queries
  const utils = trpc.useUtils()
  const listQuery = trpc.party.list.useQuery(undefined, {
    refetchInterval: view === 'list' ? 3000 : false,
    retry: 1,
  })
  const myPartyQuery = trpc.party.myParty.useQuery(
    { characterId },
    {
      refetchInterval: view === 'myParty' ? 2000 : false,
      retry: 1,
    }
  )

  // Auto-switch to myParty when in a party
  useEffect(() => {
    if (myPartyQuery.data?.party && view === 'list') {
      setView('myParty')
    }
  }, [myPartyQuery.data?.party, view])

  // Mutations
  const createMut = trpc.party.create.useMutation({
    onSuccess: (data) => {
      if (data.party) {
        setMsg('队伍创建成功！')
        utils.party.myParty.invalidate()
        utils.party.list.invalidate()
        setView('myParty')
        setShowCreate(false)
      }
    },
    onError: (e) => setMsg(`创建失败: ${e.message}`),
  })

  const joinMut = trpc.party.join.useMutation({
    onSuccess: (data) => {
      if (data.success && data.party) {
        setMsg('加入成功！')
        utils.party.myParty.invalidate()
        utils.party.list.invalidate()
        setView('myParty')
      } else {
        setMsg(data.message || '加入失败')
      }
    },
    onError: (e) => setMsg(`加入失败: ${e.message}`),
  })

  const leaveMut = trpc.party.leave.useMutation({
    onSuccess: (data) => {
      setMsg(data.message)
      utils.party.myParty.invalidate()
      utils.party.list.invalidate()
      setView('list')
    },
    onError: (e) => setMsg(`离开失败: ${e.message}`),
  })

  const readyMut = trpc.party.ready.useMutation({
    onSuccess: () => utils.party.myParty.invalidate(),
  })

  const startMut = trpc.party.startDungeon.useMutation({
    onSuccess: (data) => {
      if (data.success && data.instanceId) {
        navigate(`/party-dungeon/${data.instanceId}`, {
          state: { partyId: data.party?.id, roomData: data.roomData },
        })
      } else {
        setMsg(data.message || '启动失败')
      }
    },
    onError: (e) => setMsg(`启动失败: ${e.message}`),
  })

  const handleCreate = () => {
    if (!partyName.trim()) {
      setMsg('请输入队伍名称')
      return
    }
    createMut.mutate({
      leaderId: characterId,
      leaderName: characterName,
      name: partyName,
      maxMembers: 4,
    })
  }

  const handleJoin = (partyId: number) => {
    joinMut.mutate({ partyId, characterId, characterName, classId, level })
  }

  const handleLeave = () => {
    leaveMut.mutate({ characterId })
  }

  const handleReady = (ready: boolean) => {
    readyMut.mutate({ characterId, ready })
  }

  const handleStart = () => {
    const party = myPartyQuery.data?.party
    if (!party) return
    const members = party.members.map((m: any) => ({
      characterId: m.characterId,
      name: m.characterName,
      classId: m.classId,
      level: m.level,
      hp: 100, maxHp: 100, mp: 50, maxMp: 50,
      atk: 10, def: 8, mag: 5, mdef: 5, agi: 8, luk: 5,
    }))
    startMut.mutate({ leaderId: characterId, layer, x: 0, y: 0, members })
  }

  const isInParty = !!myPartyQuery.data?.party
  const myParty = myPartyQuery.data?.party
  const isLeader = myParty?.leaderId === characterId
  const me = myParty?.members?.find((m: any) => m.characterId === characterId)
  const allReady = myParty?.members?.length > 0 &&
    myParty.members.every((m: any) => m.isReady || m.characterId === myParty.leaderId)

  return (
    <div className="flex min-h-screen flex-col" style={{ backgroundColor: 'var(--bg-primary)' }}>
      {/* Header */}
      <header className="flex h-12 items-center gap-3 border-b px-4" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-card)' }}>
        <button onClick={() => navigate('/')} style={{ color: 'var(--text-muted)' }}><ArrowLeft size={20} /></button>
        <span className="font-bold" style={{ color: 'var(--text-primary)' }}>组队地牢</span>
        <div className="ml-auto flex gap-2">
          <button onClick={() => setView('list')} className="rounded px-3 py-1 text-xs font-medium" style={{ backgroundColor: view === 'list' ? 'var(--accent)' : 'var(--bg-hover)', color: view === 'list' ? 'var(--bg-primary)' : 'var(--text-secondary)' }}>
            队伍列表
          </button>
          <button onClick={() => isInParty ? setView('myParty') : setMsg('请先加入队伍')} className="rounded px-3 py-1 text-xs font-medium" style={{ backgroundColor: view === 'myParty' ? 'var(--accent)' : 'var(--bg-hover)', color: view === 'myParty' ? 'var(--bg-primary)' : isInParty ? 'var(--text-secondary)' : 'var(--text-muted)', opacity: isInParty ? 1 : 0.6 }}>
            我的队伍
          </button>
        </div>
      </header>

      {/* Message */}
      {msg && (
        <div className="mx-4 mt-2 flex items-center justify-between rounded-lg px-3 py-1.5 text-xs" style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>
          <span>{msg}</span>
          <button onClick={() => setMsg('')}><X size={12} /></button>
        </div>
      )}

      <div className="flex-1 p-4">
        {/* ─── List View ─── */}
        {view === 'list' && (
          <div className="space-y-4">
            {/* Create Party */}
            {!isInParty && (
              <>
                {!showCreate ? (
                  <button onClick={() => setShowCreate(true)} className="game-card flex w-full items-center justify-center gap-2 py-4 text-sm font-medium transition-all hover:scale-[1.01]" style={{ borderColor: 'var(--accent)', borderStyle: 'dashed' }}>
                    <Plus size={18} style={{ color: 'var(--accent)' }} />
                    <span style={{ color: 'var(--accent)' }}>创建队伍</span>
                  </button>
                ) : (
                  <div className="game-card space-y-3">
                    <input type="text" value={partyName} onChange={(e) => setPartyName(e.target.value)} placeholder="队伍名称" className="w-full rounded-lg border bg-transparent px-3 py-2 text-sm outline-none" style={{ borderColor: 'var(--border-color)', color: 'var(--text-primary)' }} />
                    <div className="flex gap-2">
                      <button onClick={handleCreate} className="game-btn-primary flex-1 text-xs" disabled={createMut.isPending}>{createMut.isPending ? '创建中...' : '创建'}</button>
                      <button onClick={() => setShowCreate(false)} className="game-btn-secondary text-xs">取消</button>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Party List */}
            <div className="space-y-2">
              <div className="text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>
                可加入的队伍 ({listQuery.data?.parties?.length || 0})
              </div>
              {listQuery.data?.parties?.map((party: any) => {
                // Check if already in this party
                const alreadyIn = party.members?.some((m: any) => m.characterId === characterId)
                return (
                  <div key={party.id} className="game-card flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{party.name}</span>
                        <span className="rounded px-1.5 py-0.5 text-[10px]" style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-muted)' }}>
                          {party.members?.length || 0}/{party.maxMembers}
                        </span>
                      </div>
                      <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        队长: {party.leaderName}
                      </div>
                    </div>
                    {alreadyIn ? (
                      <span className="rounded px-2 py-1 text-xs" style={{ backgroundColor: 'rgba(63,185,80,0.15)', color: '#3FB950' }}>
                        已加入
                      </span>
                    ) : isInParty ? (
                      <span className="rounded px-2 py-1 text-xs" style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-muted)' }}>
                        已有队伍
                      </span>
                    ) : (
                      <button onClick={() => handleJoin(party.id)} className="game-btn-primary px-3 py-1 text-xs" disabled={joinMut.isPending}>
                        {joinMut.isPending ? '加入中...' : '加入'}
                      </button>
                    )}
                  </div>
                )
              })}
              {(!listQuery.data?.parties || listQuery.data.parties.length === 0) && (
                <div className="rounded-lg p-6 text-center text-sm" style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-muted)' }}>
                  暂无可用队伍，{!isInParty ? '创建一个吧！' : '你已在队伍中'}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─── My Party View ─── */}
        {view === 'myParty' && myParty && (
          <div className="space-y-4">
            {/* Party Info */}
            <div className="game-card text-center">
              <h3 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{myParty.name}</h3>
              <div className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                队长: {myParty.leaderName} | {myParty.members?.length || 0}/{myParty.maxMembers}人
              </div>
              {myParty.status === 'in_dungeon' && (
                <div className="mt-1 text-xs font-bold" style={{ color: '#C9A84C' }}>地牢进行中</div>
              )}
            </div>

            {/* Members — 4 Vertical Slots */}
            <div className="space-y-2">
              <div className="text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>队伍成员 ({myParty.members?.length || 0}/{myParty.maxMembers})</div>
              <div className="grid grid-cols-4 gap-2">
                {Array.from({ length: myParty.maxMembers || 4 }).map((_, slotIdx) => {
                  const member = myParty.members?.[slotIdx]
                  if (!member) {
                    // Empty slot placeholder
                    return (
                      <div key={`empty-${slotIdx}`} className="game-card flex flex-col items-center justify-center gap-2 py-6 px-1" style={{ borderColor: 'var(--border-color)', borderStyle: 'dashed', borderWidth: 1, opacity: 0.5, minHeight: 280 }}>
                        <Users size={20} style={{ color: 'var(--text-muted)' }} />
                        <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>等待加入</span>
                      </div>
                    )
                  }
                  const isMe = member.characterId === characterId
                  const isLeader = member.characterId === myParty.leaderId
                  const player = gameStore.player
                  const stats = isMe && player
                    ? { hp: player.maxHp, mp: player.maxMp, atk: player.atk, def: player.def, mag: player.mag, mdef: player.mdef, agi: player.agi, luk: player.luk }
                    : getEstimatedStats(member.classId, member.level)
                  const color = CLASS_COLORS[member.classId] || 'var(--accent)'
                  return (
                    <div key={member.characterId} className="game-card flex flex-col items-center gap-1.5 py-2 px-1.5" style={{ borderColor: isLeader ? '#C9A84C' : 'var(--border-color)', borderWidth: isLeader ? 2 : 1, minHeight: 280 }}>
                      {/* Class Icon */}
                      <div className="flex h-10 w-8 items-center justify-center rounded-md" style={{ backgroundColor: `${color}20` }}>
                        <User size={18} style={{ color }} />
                      </div>
                      {/* Name & Leader */}
                      <div className="text-center leading-tight">
                        <div className="flex items-center justify-center gap-1">
                          <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{member.characterName}</span>
                          {isLeader && <Crown size={12} style={{ color: '#C9A84C' }} />}
                        </div>
                        <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Lv.{member.level} {CLASS_NAMES[member.classId] || member.classId}</div>
                      </div>
                      {/* Ready Status */}
                      {member.isReady ? (
                        <span className="flex items-center gap-1 rounded px-2 py-0.5 text-xs" style={{ backgroundColor: 'rgba(63,185,80,0.15)', color: '#3FB950' }}>
                          <Check size={10} /> 已准备
                        </span>
                      ) : (
                        <span className="rounded px-2 py-0.5 text-xs" style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-muted)' }}>未准备</span>
                      )}
                      {/* Stats */}
                      <div className="w-full space-y-0.5 pt-1">
                        {/* HP Bar */}
                        <BarStat icon={<Heart size={12} />} label="HP" value={stats.hp} max={stats.hp} color="#F85149" bgColor="rgba(248,81,73,0.15)" />
                        {/* MP Bar */}
                        <BarStat icon={<Zap size={12} />} label="MP" value={stats.mp} max={stats.mp} color="#58A6FF" bgColor="rgba(88,166,255,0.15)" />
                        <div className="pt-0.5" />
                        <StatRow icon={<Swords size={12} />} label="ATK" value={stats.atk} color="#FF7B72" />
                        <StatRow icon={<Shield size={12} />} label="DEF" value={stats.def} color="#3FB950" />
                        <StatRow icon={<Sparkles size={12} />} label="MAG" value={stats.mag} color="#A371F7" />
                        <StatRow icon={<Shield size={12} />} label="MDEF" value={stats.mdef} color="#C9A84C" />
                        <StatRow icon={<Wind size={12} />} label="AGI" value={stats.agi} color="#58A6FF" />
                        <StatRow icon={<Star size={12} />} label="LUK" value={stats.luk} color="#FF7B72" />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Dungeon Settings */}
            {isLeader && myParty.status !== 'in_dungeon' && (
              <div className="game-card space-y-3">
                <div className="text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>地牢设置</div>
                <div>
                  <label className="mb-1 block text-xs" style={{ color: 'var(--text-muted)' }}>层级</label>
                  <div className="flex items-center gap-2">
                    <input type="range" min={1} max={20} value={layer} onChange={(e) => setLayer(Number(e.target.value))} className="flex-1" />
                    <span className="w-8 text-center text-sm font-bold" style={{ color: 'var(--accent)' }}>{layer}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2">
              {isLeader && myParty.status !== 'in_dungeon' ? (
                <button onClick={handleStart} disabled={!allReady || startMut.isPending} className="game-btn-primary flex-1 flex items-center justify-center gap-1 text-sm" style={{ opacity: allReady ? 1 : 0.5 }}>
                  {startMut.isPending ? '启动中...' : '开始地牢'}
                </button>
              ) : myParty.status !== 'in_dungeon' ? (
                <button onClick={() => handleReady(!me?.isReady)} className="game-btn-primary flex-1 text-sm">
                  {me?.isReady ? '取消准备' : '准备'}
                </button>
              ) : null}
              <button onClick={handleLeave} className="game-btn-secondary flex items-center gap-1 text-sm" style={{ color: 'var(--danger)' }}>
                <LogOut size={14} /> {isLeader ? '解散' : '离开'}
              </button>
            </div>

            {!allReady && isLeader && myParty.status !== 'in_dungeon' && (
              <div className="text-center text-xs" style={{ color: 'var(--danger)' }}>
                所有成员准备后才能开始
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
