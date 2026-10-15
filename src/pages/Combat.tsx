import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router'
import { Swords, Shield, Footprints, Sparkles, Zap, Play, Pause } from 'lucide-react'
import { useGameStore } from '@/stores/gameStore'
import { trpc } from '@/providers/trpc'
import { loadCatalogs, getSkillInfo, getSkillName, getItemInfo } from '@/lib/catalog'

// Skill name mapping - loaded from config
const SKILL_NAMES: Record<string, string> = {
  fireball: '火球术', heal: '治疗术', frostbolt: '寒冰箭', lightning: '闪电链',
  mana_shield: '魔法护盾', meteor: '陨石术', arcane_power: '奥术之力',
  shadow_step: '暗影步', backstab: '背刺', poison_blade: '毒刃',
  smoke_bomb: '烟雾弹', assassinate: '暗杀', shadow_dance: '影舞',
  shield_bash: '盾击', taunt: '嘲讽', heavy_strike: '重击',
  iron_will: '钢铁意志', whirlwind: '旋风斩', last_stand: '最后防线',
  aimed_shot: '瞄准射击', trap: '陷阱', multishot: '多重射击',
  poison_arrow: '毒箭', stampede: '兽群奔腾', eagle_eye: '鹰眼',
  holy_light: '圣光', bless: '祝福', dispel: '驱散',
  resurrection: '复活术', divine_shield: '神圣护盾',
  corruption: '腐蚀术', summon_imp: '召唤小鬼', life_drain: '生命吸取',
  curse: '诅咒', demon_form: '恶魔形态', soul_harvest: '灵魂收割',
}

export default function Combat() {
  const navigate = useNavigate()
  const store = useGameStore()
  const [turnCount, setTurnCount] = useState(1)
  const [lastDrops, setLastDrops] = useState<Array<{ itemId: string; name: string; type: string; quantity: number; quality: string }>>([])
  const [autoBattle, setAutoBattle] = useState(true) // 默认自动战斗
  const autoBattleRef = useRef(autoBattle)
  autoBattleRef.current = autoBattle
  const battleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const combatTurn = trpc.game.combatTurn.useMutation()

  // Build clean player object for API
  const buildPlayerForApi = useCallback(() => {
    const p = store.player
    if (!p) {
      return {
        id: 'player', name: '冒险者', hp: 100, maxHp: 100,
        mp: 50, maxMp: 50, atk: 15, def: 10, mag: 10,
        mdef: 8, agi: 10, luk: 5,
        skills: ['fireball', 'heal'], element: 'none',
      }
    }
    return {
      id: p.id, name: p.name, hp: p.hp, maxHp: p.maxHp,
      mp: p.mp, maxMp: p.maxMp, atk: p.atk, def: p.def,
      mag: p.mag, mdef: p.mdef, agi: p.agi, luk: p.luk,
      skills: p.skills.length > 0 ? p.skills : ['fireball', 'heal'],
      element: p.element || 'none',
    }
  }, [store.player])

  // Build clean enemies array for API
  const buildEnemiesForApi = useCallback(() => {
    return store.combatEnemies.map((e) => ({
      id: e.id,
      name: e.name,
      hp: Math.max(0, e.hp),
      maxHp: e.maxHp,
      mp: e.mp || 0,
      maxMp: e.maxMp || 0,
      atk: e.atk,
      def: e.def,
      mag: e.mag || 0,
      mdef: e.mdef || 0,
      agi: e.agi || 0,
      luk: e.luk || 0,
      skills: e.skills || [],
      element: e.element || 'none',
      aiType: e.aiType,
    }))
  }, [store.combatEnemies])

  // 自动选择技能：按顺序尝试，MP足够就用
  const selectAutoAction = useCallback(() => {
    const player = store.player || buildPlayerForApi()
    const skills = player.skills || []

    // 按顺序尝试每个技能
    for (const skillId of skills) {
      // 从技能配置中获取MP消耗（这里简化处理，实际可以从config获取）
      const skillConfig = getSkillConfig(skillId)
      if (skillConfig && player.mp >= skillConfig.mpCost) {
        return { type: 'skill' as const, skillId }
      }
    }

    // 所有技能MP都不够，普通攻击
    return { type: 'attack' as const }
  }, [store.player])

  // 获取技能配置（优先目录缓存，回退静态表）
  const getSkillConfig = (skillId: string) => {
    const cat = getSkillInfo(skillId)
    if (cat) return { mpCost: cat.mpCost, name: cat.name }
    return { mpCost: 10, name: SKILL_NAMES[skillId] || skillId }
  }

  const executeAction = useCallback(async (action: { type: 'attack' | 'skill' | 'defend' | 'flee'; targetId?: string; skillId?: string }) => {
    const aliveEnemies = store.combatEnemies.filter((e) => e.hp > 0)
    if (aliveEnemies.length === 0) return

    const target = action.targetId || aliveEnemies[0]?.id
    const player = buildPlayerForApi()
    const enemies = buildEnemiesForApi()

    try {
      const layer = store.currentDungeon?.layer || 1
      const enemyDropTables = store.combatEnemies.map((e) => ({
        enemyId: e.id,
        dropTable: (e as any).dropTable,
      }))

      const result = await combatTurn.mutateAsync({
        player,
        enemies,
        action: {
          type: action.type,
          targetId: target,
          skillId: action.skillId,
          itemId: undefined,
        },
        turnSeed: Date.now(),
        layer,
        enemyDropTables,
      })

      result.logs.forEach((log) => store.addCombatLog(log))
      store.setCombatEnemies(result.enemies)

      if (result.victory) {
        store.setCombatVictory(true)
        store.setCombatEnded(true)
        // 经验奖励（与探索页一致：基础 10 + 层数×3 + 敌人强度，boss 双倍）
        const layer = store.currentDungeon?.layer ?? 1
        const expGain = store.combatEnemies.reduce((sum, e) => {
          const base = 10 + layer * 3 + Math.ceil((e.maxHp || 30) / 20) + (e.atk || 5)
          return sum + ((e.maxHp || 0) >= 500 ? base * 2 : base)
        }, 0)
        store.addPlayerExp(expGain)
        store.addCombatLog(`获得经验 ${expGain}`)
        if (result.drops && result.drops.length > 0) {
          setLastDrops(result.drops)
          for (const drop of result.drops) {
            const cat = getItemInfo(drop.itemId)
            const type = (drop.type || cat?.type || 'material') as 'equipment' | 'consumable' | 'material' | 'currency' | 'skillbook'
            if (type === 'currency') {
              store.addPlayerGold(drop.quantity * (cat?.value ?? 1))
              continue
            }
            store.addItem({
              uid: `drop_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
              id: drop.itemId,
              name: drop.name || cat?.name || drop.itemId,
              type,
              slot: cat?.slot,
              quality: (drop.quality || cat?.quality || 'common') as never,
              quantity: drop.quantity,
              desc: cat?.desc || drop.name,
              stats: cat?.stats,
              setId: cat?.setId,
              setTier: cat?.setTier,
              value: cat?.value,
              effect: cat?.effect,
              learnSkillId: cat?.learnSkillId,
            })
          }
        }
      } else if (result.fled) {
        store.setCombatEnded(true)
      } else if (result.ended) {
        store.addCombatLog('你被击败了...')
        store.setCombatEnded(true)
      }

      setTurnCount((c) => c + 1)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '未知错误'
      store.addCombatLog(`战斗出错: ${msg}`)
    }
  }, [store, combatTurn, buildPlayerForApi, buildEnemiesForApi])

  // 加载物品/技能目录
  useEffect(() => { loadCatalogs() }, [])

  // 自动战斗循环
  useEffect(() => {
    if (!store.inCombat || store.combatEnded || !autoBattleRef.current) return

    const runAutoBattle = async () => {
      const action = selectAutoAction()
      await executeAction(action)

      // 继续下一回合
      if (!store.combatEnded && autoBattleRef.current) {
        battleTimerRef.current = setTimeout(runAutoBattle, 1500)
      }
    }

    battleTimerRef.current = setTimeout(runAutoBattle, 500)

    return () => {
      if (battleTimerRef.current) clearTimeout(battleTimerRef.current)
    }
  }, [store.inCombat, store.combatEnded, selectAutoAction, executeAction])

  const handleContinue = () => {
    store.resetCombat()
    navigate('/explore')
  }

  const handleFlee = () => {
    setAutoBattle(false)
    executeAction({ type: 'flee' })
  }

  if (!store.inCombat) {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <div className="game-card text-center">
          <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>当前不在战斗中</p>
          <button className="game-btn-primary" onClick={() => navigate('/explore')}>返回探索</button>
        </div>
      </div>
    )
  }

  const aliveEnemies = store.combatEnemies.filter((e) => e.hp > 0)
  const player = store.player || buildPlayerForApi()
  const playerSkills = player.skills || []

  return (
    <div className="flex min-h-screen flex-col" style={{ backgroundColor: 'var(--bg-primary)' }}>
      {/* Turn Indicator */}
      <div className="border-b px-4 py-2" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-card)' }}>
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold" style={{
            color: store.combatEnded
              ? (store.combatVictory ? 'var(--success)' : 'var(--danger)')
              : 'var(--accent)'
          }}>
            第 {turnCount} 回合
            {store.combatEnded ? (store.combatVictory ? ' - 胜利！' : ' - 战斗结束') : ''}
          </span>
          <div className="flex items-center gap-2">
            {/* 自动战斗开关 */}
            <button
              onClick={() => setAutoBattle(!autoBattle)}
              className="flex items-center gap-1 rounded px-2 py-1 text-xs"
              style={{
                backgroundColor: autoBattle ? 'var(--accent)' : 'var(--bg-hover)',
                color: autoBattle ? '#0D1117' : 'var(--text-muted)',
              }}
            >
              {autoBattle ? <Pause size={12} /> : <Play size={12} />}
              {autoBattle ? '自动中' : '手动'}
            </button>
            {store.combatEnded && (
              <button className="text-xs" style={{ color: 'var(--text-muted)' }} onClick={handleContinue}>
                {store.combatVictory ? '继续探索' : '返回城镇'}
              </button>
            )}
          </div>
        </div>

        {/* Drops Panel */}
        {store.combatVictory && lastDrops.length > 0 && (
          <div className="mt-2 rounded-lg border px-3 py-2" style={{ borderColor: 'var(--accent)', backgroundColor: 'rgba(201,168,76,0.1)' }}>
            <div className="mb-1 text-xs font-bold" style={{ color: '#C9A84C' }}>
              获得掉落 ({lastDrops.length}件)
            </div>
            <div className="flex flex-wrap gap-1">
              {lastDrops.map((drop, i) => (
                <span key={i} className="rounded px-1.5 py-0.5 text-[10px]" style={{
                  backgroundColor: drop.quality === 'epic' ? 'rgba(201,168,76,0.2)' : drop.quality === 'rare' ? 'rgba(163,113,247,0.2)' : drop.quality === 'fine' ? 'rgba(88,166,255,0.2)' : 'var(--bg-hover)',
                  color: drop.quality === 'epic' ? '#C9A84C' : drop.quality === 'rare' ? '#A371F7' : drop.quality === 'fine' ? '#58A6FF' : 'var(--text-secondary)',
                }}>
                  {drop.name} x{drop.quantity}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Combat Area */}
      <div className="flex flex-1 flex-col items-center justify-center p-4">
        {/* Enemies */}
        <div className="mb-6 flex flex-wrap justify-center gap-3">
          {store.combatEnemies.map((enemy) => (
            <div key={enemy.id}
              className="game-card w-[150px] p-3 text-center"
              style={{
                borderColor: enemy.hp <= 0 ? 'var(--border-color)' : 'var(--danger)',
                opacity: enemy.hp <= 0 ? 0.4 : 1,
              }}>
              <div className="mb-1 text-sm font-bold" style={{
                color: enemy.hp <= 0 ? 'var(--text-muted)' : 'var(--text-primary)'
              }}>
                {enemy.name}
              </div>
              <div className="h-1.5 overflow-hidden rounded-full" style={{ backgroundColor: 'var(--bg-hover)' }}>
                <div className="h-full rounded-full transition-all" style={{
                  width: `${enemy.maxHp > 0 ? (Math.max(0, enemy.hp) / enemy.maxHp) * 100 : 0}%`,
                  background: enemy.hp / enemy.maxHp > 0.5 ? '#3FB950' : enemy.hp / enemy.maxHp > 0.2 ? '#C9A84C' : '#F85149',
                }} />
              </div>
              <div className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                {Math.max(0, enemy.hp)}/{enemy.maxHp} HP
              </div>
            </div>
          ))}
        </div>

        {/* Player */}
        <div className="game-card mb-6 w-full max-w-md p-3">
          <div className="flex items-center justify-between">
            <span className="font-bold" style={{ color: 'var(--text-primary)' }}>{player.name}</span>
            <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--text-secondary)' }}>
              <span>HP {player.hp}/{player.maxHp}</span>
              <span>MP {player.mp}/{player.maxMp}</span>
            </div>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full" style={{ backgroundColor: 'var(--bg-hover)' }}>
            <div className="h-full rounded-full" style={{
              width: `${(player.hp / player.maxHp) * 100}%`,
              background: 'linear-gradient(90deg, #F85149, #3FB950)',
            }} />
          </div>
          {/* 技能顺序显示 */}
          <div className="mt-2 flex flex-wrap gap-1">
            {playerSkills.map((skillId, idx) => (
              <span key={skillId} className="rounded px-1.5 py-0.5 text-[10px]"
                style={{ backgroundColor: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>
                {idx + 1}.{getSkillName(skillId)}
              </span>
            ))}
          </div>
        </div>

        {/* Action Panel - 自动战斗模式下只显示状态 */}
        {!store.combatEnded ? (
          <div className="w-full max-w-md">
            <div className="rounded-lg border p-3" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-card)' }}>
              <div className="flex items-center justify-center gap-2">
                <Zap size={16} style={{ color: 'var(--accent)' }} />
                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  {autoBattle ? '自动战斗中...' : '手动模式'}
                </span>
              </div>
              {!autoBattle && (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button onClick={() => executeAction({ type: 'attack' })} className="game-btn-primary py-2 text-sm">
                    <Swords size={14} className="mr-1 inline" /> 攻击
                  </button>
                  <button onClick={handleFlee} className="game-btn-secondary py-2 text-sm">
                    <Footprints size={14} className="mr-1 inline" /> 逃跑
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
          <button onClick={handleContinue} className="game-btn-primary px-8 py-3 text-lg">
            {store.combatVictory ? '继续探索' : '返回城镇'}
          </button>
        )}
      </div>

      {/* Combat Logs */}
      <div className="h-[160px] overflow-auto border-t p-3" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-card)' }}>
        {store.combatLogs.map((log, i) => (
          <div key={i} className="mb-1 text-xs" style={{
            color: log.includes('暴击') ? 'var(--accent)'
              : log.includes('胜利') ? 'var(--success)'
                : log.includes('被击败') || log.includes('逃跑失败') ? 'var(--danger)'
                  : log.includes('逃跑') ? 'var(--info)'
                    : 'var(--text-secondary)'
          }}>
            {log}
          </div>
        ))}
      </div>
    </div>
  )
}
