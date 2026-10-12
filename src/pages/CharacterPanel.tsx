import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router'
import { ArrowLeft, User, Swords, Shield, Sparkles, Zap, Heart, Brain, Wind, Star, Droplets, Clock, BookOpen, Lock } from 'lucide-react'
import { useGameStore } from '@/stores/gameStore'
import { trpc } from '@/providers/trpc'
import { loadCatalogs, onCatalogLoaded, getSkillInfo, getLearnableSkills } from '@/lib/catalog'

// 职业中文名映射
const CLASS_NAMES: Record<string, string> = {
  warrior: '战士', mage: '法师', assassin: '刺客',
  ranger: '游侠', priest: '牧师', warlock: '术士',
}

const CLASS_COLORS: Record<string, string> = {
  warrior: '#F85149', mage: '#58A6FF', assassin: '#A371F7',
  ranger: '#3FB950', priest: '#C9A84C', warlock: '#FF7B72',
}

export default function CharacterPanel() {
  const navigate = useNavigate()
  const store = useGameStore()
  const [activeTab, setActiveTab] = useState<'stats' | 'skills' | 'equipment'>('stats')
  const [cooldownLeft, setCooldownLeft] = useState(0)
  const [switchMsg, setSwitchMsg] = useState('')

  const classesQuery = trpc.game.getClasses.useQuery()

  // 加载物品/技能目录并触发刷新
  const [, setCatalogReady] = useState(false)
  useEffect(() => {
    loadCatalogs()
    return onCatalogLoaded(() => setCatalogReady(true))
  }, [])

  const player = store.player
  const savedClassIds = store.getSavedClassIds()
  const allClasses = classesQuery.data || []

  // Cooldown timer
  useEffect(() => {
    const timer = setInterval(() => {
      const remaining = store.getClassCooldownRemaining()
      setCooldownLeft(remaining)
    }, 1000)
    return () => clearInterval(timer)
  }, [store.lastClassSwitch])

  // Show switch message briefly
  useEffect(() => {
    if (!switchMsg) return
    const t = setTimeout(() => setSwitchMsg(''), 3000)
    return () => clearTimeout(t)
  }, [switchMsg])

  const playerClass = allClasses.find((c) => c.id === store.activeClassId)

  const handleCreateClass = (classId: string) => {
    const cls = allClasses.find((c) => c.id === classId)
    if (!cls) return
    store.createPlayer(classId, cls.baseStats)
  }

  const handleSwitchClass = (classId: string) => {
    const result = store.switchClass(classId)
    setSwitchMsg(result.message)
  }

  // Stat icons & names
  const statIcons: Record<string, React.ReactNode> = {
    hp: <Heart size={14} />, mp: <Droplets size={14} />, atk: <Swords size={14} />,
    def: <Shield size={14} />, mag: <Sparkles size={14} />, mdef: <Brain size={14} />,
    agi: <Wind size={14} />, luk: <Star size={14} />,
  }
  const statNames: Record<string, string> = {
    hp: '生命值', mp: '法力值', atk: '攻击力', def: '防御力',
    mag: '魔法力', mdef: '魔防', agi: '敏捷', luk: '幸运',
  }

  // Equipment slot names
  const equipSlotNames: Record<string, string> = {
    weapon: '武器', helmet: '头盔', armor: '胸甲',
    leggings: '护腿', boots: '靴子', necklace: '项链',
    ring1: '戒指', ring2: '戒指',
  }

  return (
    <div className="flex min-h-screen flex-col" style={{ backgroundColor: 'var(--bg-primary)' }}>
      {/* Header */}
      <header className="flex h-12 items-center gap-3 border-b px-4" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-card)' }}>
        <button onClick={() => navigate('/')} style={{ color: 'var(--text-muted)' }}><ArrowLeft size={20} /></button>
        <span className="font-bold" style={{ color: 'var(--text-primary)' }}>角色面板</span>
      </header>

      {/* Switch message */}
      {switchMsg && (
        <div className={`px-4 py-2 text-center text-sm font-medium ${switchMsg.includes('成功') ? '' : ''}`}
          style={{
            backgroundColor: switchMsg.includes('成功') ? 'rgba(63,185,80,0.15)' : 'rgba(248,81,73,0.15)',
            color: switchMsg.includes('成功') ? '#3FB950' : '#F85149',
          }}>
          {switchMsg}
        </div>
      )}

      <div className="flex flex-1 flex-col lg:flex-row">
        {/* Left: Character Info & Class Switch */}
        <div className="w-full p-4 lg:w-[45%]">
          {/* Character Card */}
          <div className="game-card mb-4 text-center">
            <div className="mx-auto mb-3 flex h-20 w-20 items-center justify-center rounded-full"
              style={{ backgroundColor: 'var(--bg-hover)', border: `3px solid ${store.activeClassId ? CLASS_COLORS[store.activeClassId] || 'var(--accent)' : 'var(--accent)'}` }}>
              <User size={36} style={{ color: store.activeClassId ? CLASS_COLORS[store.activeClassId] || 'var(--accent)' : 'var(--accent)' }} />
            </div>
            <h3 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
              {player?.name || '冒险者'}
            </h3>
            <div className="mt-1 text-sm" style={{ color: store.activeClassId ? CLASS_COLORS[store.activeClassId] || 'var(--accent)' : 'var(--accent)' }}>
              {player ? `Lv.${player.level} ${CLASS_NAMES[player.classId] || player.classId}` : '未选择职业'}
            </div>
            {player && (
              <div className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                经验: {player.exp} / {player.level * 100} | 金币: {player.gold}
              </div>
            )}

            {/* HP/MP Bars */}
            {player && (
              <div className="mx-auto mt-3 max-w-[320px] space-y-2">
                <div>
                  <div className="mb-1 flex justify-between text-xs" style={{ color: 'var(--text-secondary)' }}>
                    <span>HP</span><span>{player.hp}/{player.maxHp}</span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full" style={{ backgroundColor: 'var(--bg-hover)' }}>
                    <div className="h-full rounded-full transition-all" style={{ width: `${(player.hp / player.maxHp) * 100}%`, background: 'linear-gradient(90deg, #F85149, #3FB950)' }} />
                  </div>
                </div>
                <div>
                  <div className="mb-1 flex justify-between text-xs" style={{ color: 'var(--text-secondary)' }}>
                    <span>MP</span><span>{player.mp}/{player.maxMp}</span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full" style={{ backgroundColor: 'var(--bg-hover)' }}>
                    <div className="h-full rounded-full transition-all" style={{ width: `${(player.mp / player.maxMp) * 100}%`, background: 'linear-gradient(90deg, #58A6FF, #79C0FF)' }} />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Class Selection / Switch */}
          <div className="game-card">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-bold" style={{ color: 'var(--text-secondary)' }}>
                {savedClassIds.length > 0 ? '切换职业' : '选择职业'}
              </span>
              {cooldownLeft > 0 && (
                <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--danger)' }}>
                  <Clock size={12} /> CD: {Math.ceil(cooldownLeft / 1000)}s
                </span>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2">
              {allClasses.map((cls) => {
                const isActive = store.activeClassId === cls.id
                const hasSave = savedClassIds.includes(cls.id)
                const canSwitch = cooldownLeft === 0 && !isActive && !store.inCombat
                return (
                  <button key={cls.id}
                    onClick={() => hasSave ? handleSwitchClass(cls.id) : handleCreateClass(cls.id)}
                    disabled={isActive || (!hasSave ? false : !canSwitch)}
                    className="relative rounded-lg border p-2 text-center transition-all"
                    style={{
                      borderColor: isActive ? (CLASS_COLORS[cls.id] || 'var(--accent)') : hasSave ? 'var(--border-color)' : 'var(--border-color)',
                      backgroundColor: isActive ? `${CLASS_COLORS[cls.id] || 'var(--accent)'}20` : hasSave ? 'var(--bg-hover)' : 'var(--bg-hover)',
                      opacity: isActive ? 1 : hasSave && !canSwitch ? 0.5 : 1,
                      cursor: isActive ? 'default' : 'pointer',
                    }}>
                    <div className="text-sm font-bold" style={{ color: isActive ? (CLASS_COLORS[cls.id] || 'var(--accent)') : 'var(--text-primary)' }}>
                      {cls.name}
                    </div>
                    <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{cls.role}</div>
                    {isActive && (
                      <div className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full text-[8px] font-bold"
                        style={{ backgroundColor: CLASS_COLORS[cls.id] || 'var(--accent)', color: '#fff' }}>
                        ✓
                      </div>
                    )}
                    {hasSave && !isActive && (
                      <div className="mt-1 text-[10px]" style={{ color: '#3FB950' }}>Lv.{store.classSaves[cls.id]?.player?.level || 1}</div>
                    )}
                    {!hasSave && (
                      <div className="mt-1 text-[10px]" style={{ color: 'var(--accent)' }}>+ 创建</div>
                    )}
                  </button>
                )
              })}
            </div>
            <div className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
              {savedClassIds.length === 0 ? '点击上方职业创建角色（首次免费）' : cooldownLeft > 0 ? `切换冷却中，还需 ${Math.ceil(cooldownLeft / 1000)} 秒` : store.inCombat ? '战斗中无法切换' : '点击已有职业可切换，点击新职业可创建'}
            </div>
          </div>
        </div>

        {/* Right: Details */}
        <div className="flex-1 p-4">
          {/* Tabs */}
          <div className="mb-3 flex border-b" style={{ borderColor: 'var(--border-color)' }}>
            {(['stats', 'skills', 'equipment'] as const).map((tab) => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className="px-4 pb-2 text-sm font-medium transition-colors"
                style={{ color: activeTab === tab ? 'var(--accent)' : 'var(--text-muted)', borderBottom: activeTab === tab ? '2px solid var(--accent)' : '2px solid transparent' }}>
                {tab === 'stats' ? '属性' : tab === 'skills' ? '技能' : '装备'}
              </button>
            ))}
          </div>

          {/* Stats Tab */}
          {activeTab === 'stats' && player && (
            <div className="grid grid-cols-2 gap-3">
              {Object.entries(statNames).map(([key, name]) => (
                <div key={key} className="game-card flex items-center gap-3">
                  <div style={{ color: 'var(--accent)' }}>{statIcons[key]}</div>
                  <div>
                    <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{name}</div>
                    <div className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                      {(player as Record<string, number>)[key] || 0}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {activeTab === 'stats' && !player && (
            <div className="rounded-lg p-8 text-center text-sm" style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-muted)' }}>
              请先创建角色
            </div>
          )}

          {/* Skills Tab */}
          {activeTab === 'skills' && player && (
            <div className="space-y-4">
              {/* 已掌握技能 */}
              <div>
                <div className="mb-2 text-xs font-bold" style={{ color: 'var(--accent)' }}>
                  已掌握技能（{player.skills.length}）· 按顺序自动释放
                </div>
                {player.skills.length === 0 ? (
                  <div className="rounded-lg p-4 text-center text-xs" style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-muted)' }}>
                    尚未掌握任何技能
                  </div>
                ) : (
                  <div className="space-y-2">
                    {player.skills.map((skillId, idx) => {
                      const skill = getSkillInfo(skillId)
                      return (
                        <div key={skillId} className="game-card flex items-center gap-2 py-2">
                          <span className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold"
                            style={{ backgroundColor: 'var(--accent)', color: 'var(--bg-primary)' }}>
                            {idx + 1}
                          </span>
                          <Zap size={14} style={{ color: 'var(--accent)' }} />
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                              {skill?.name || skillId}
                              <span className="ml-2 text-[10px] font-normal" style={{ color: 'var(--text-muted)' }}>
                                {skill ? (skill.type === 'active' ? '主动' : skill.type === 'passive' ? '被动' : '终极') : ''}
                                {skill && skill.mpCost > 0 ? ` · MP ${skill.mpCost}` : ''}
                              </span>
                            </div>
                            {skill?.description && (
                              <div className="truncate text-xs" style={{ color: 'var(--text-muted)' }}>{skill.description}</div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* 可学习技能 */}
              <div>
                <div className="mb-2 flex items-center gap-1 text-xs font-bold" style={{ color: 'var(--warning, #C9A84C)' }}>
                  <BookOpen size={12} /> 可学习技能（消耗金币）
                </div>
                {(() => {
                  const learnable = getLearnableSkills(player.classId).filter((sk) => !player.skills.includes(sk.id))
                  if (learnable.length === 0) {
                    return (
                      <div className="rounded-lg p-4 text-center text-xs" style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-muted)' }}>
                        已学会全部可学习技能
                      </div>
                    )
                  }
                  return (
                    <div className="space-y-2">
                      {learnable.map((skill) => {
                        const levelOk = player.level >= (skill.learnLevel || 1)
                        const goldOk = player.gold >= (skill.learnCost || 0)
                        const canLearn = levelOk && goldOk
                        return (
                          <div key={skill.id} className="game-card flex items-center gap-2 py-2" style={{ opacity: canLearn ? 1 : 0.75 }}>
                            <Zap size={14} style={{ color: canLearn ? 'var(--accent)' : 'var(--text-muted)' }} />
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                                {skill.name}
                                <span className="ml-2 text-[10px] font-normal" style={{ color: 'var(--text-muted)' }}>
                                  MP {skill.mpCost} · Lv.{skill.learnLevel} 可学
                                </span>
                              </div>
                              <div className="truncate text-xs" style={{ color: 'var(--text-muted)' }}>{skill.description}</div>
                            </div>
                            <button
                              disabled={!canLearn}
                              onClick={() => setSwitchMsg(store.learnSkill(skill.id).message)}
                              className="flex items-center gap-1 rounded px-2 py-1 text-[10px] font-bold"
                              style={{
                                backgroundColor: canLearn ? 'var(--accent)' : 'var(--bg-hover)',
                                color: canLearn ? 'var(--bg-primary)' : 'var(--text-muted)',
                              }}>
                              {!levelOk ? <><Lock size={10} /> Lv.{skill.learnLevel}</> : `${skill.learnCost} 金币`}
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  )
                })()}
              </div>
            </div>
          )}
          {activeTab === 'skills' && !player && (
            <div className="rounded-lg p-8 text-center text-sm" style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-muted)' }}>
              请先创建角色
            </div>
          )}

          {/* Equipment Tab */}
          {activeTab === 'equipment' && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {Object.entries(equipSlotNames).map(([slot, label]) => {
                const item = store.equipment[slot as keyof Equipment]
                return (
                  <div key={slot} className="game-card flex flex-col items-center justify-center py-4 text-center">
                    <div className="mb-1 text-xs" style={{ color: 'var(--text-muted)' }}>{label}</div>
                    {item ? (
                      <>
                        <div className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>{item.name}</div>
                        {item.stats && Object.entries(item.stats).map(([s, v]) => (
                          <div key={s} className="text-[10px]" style={{ color: '#3FB950' }}>+{v} {statNames[s] || s}</div>
                        ))}
                      </>
                    ) : (
                      <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>未装备</div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
