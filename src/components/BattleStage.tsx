/**
 * BattleStage —— 一条路横版战斗舞台
 * 观测 store（player / combatEnemies / skillCooldowns / inCombat）的每回合状态差分，
 * 自动推导攻击方、伤害、技能、死亡并播放动画，无需改动战斗循环。
 * 所有精灵均为 SVG 代码绘制（见 lib/sprites.tsx）。
 */
import { useEffect, useRef, useState } from 'react'
import { useGameStore } from '@/stores/gameStore'
import { getSkillInfo } from '@/lib/catalog'
import { HeroSprite, EnemySprite } from '@/lib/sprites'

const RANGED = new Set(['mage', 'priest', 'warlock', 'ranger'])

interface Floater { key: number; target: string; text: string; kind: 'dmg' | 'crit' | 'heal' | 'skill' }
interface Projectile { key: number; fromX: number; toX: number; toY: number; color: string }

const PLAYER_X = 14 // %
const enemyX = (i: number, n: number) => 58 + (n > 1 ? i * (30 / Math.max(1, n - 1)) : 8) // %

let fxKey = 1

export default function BattleStage() {
  const player = useGameStore((s) => s.player)
  const enemies = useGameStore((s) => s.combatEnemies)
  const inCombat = useGameStore((s) => s.inCombat)
  const cooldowns = useGameStore((s) => s.skillCooldowns)

  const [floaters, setFloaters] = useState<Floater[]>([])
  const [lunging, setLunging] = useState<string | null>(null) // 'player' 或敌人 id
  const [hits, setHits] = useState<Set<string>>(new Set())
  const [projectile, setProjectile] = useState<Projectile | null>(null)
  const [shaking, setShaking] = useState(false)

  const prev = useRef<{ hp: number; enemies: Record<string, number>; cds: Record<string, number> } | null>(null)
  const timers = useRef<number[]>([])
  const later = (ms: number, fn: () => void) => { timers.current.push(window.setTimeout(fn, ms)) }
  useEffect(() => () => { timers.current.forEach(clearTimeout) }, [])

  const spawnFloater = (target: string, text: string, kind: Floater['kind']) => {
    const key = fxKey++
    setFloaters((f) => [...f.slice(-14), { key, target, text, kind }])
    later(950, () => setFloaters((f) => f.filter((x) => x.key !== key)))
  }
  const flash = (id: string) => {
    setHits((h) => new Set(h).add(id))
    later(350, () => setHits((h) => { const n = new Set(h); n.delete(id); return n }))
  }

  // ─── 回合差分驱动动画 ───
  useEffect(() => {
    if (!player) return
    if (!inCombat) { prev.current = null; return }
    const curHpMap: Record<string, number> = {}
    enemies.forEach((e) => { curHpMap[e.id] = e.hp })
    const old = prev.current
    prev.current = { hp: player.hp, enemies: curHpMap, cds: { ...cooldowns } }
    if (!old) return // 战斗刚开始，只建立快照

    // 本回合新进入冷却的技能 = 刚施放的技能
    const castId = Object.keys(cooldowns).find((k) => (cooldowns[k] || 0) > 0 && !(old.cds[k] > 0))

    const dmgToEnemies = enemies
      .filter((e) => old.enemies[e.id] !== undefined && e.hp < old.enemies[e.id])
      .map((e) => ({ id: e.id, amount: old.enemies[e.id] - e.hp, died: e.hp <= 0 }))
    const playerDelta = player.hp - old.hp

    if (dmgToEnemies.length === 0 && playerDelta === 0 && !castId) return

    const classId = player.classId || 'warrior'
    const isRanged = RANGED.has(classId)

    // ── 玩家行动阶段 ──
    if (dmgToEnemies.length > 0 || castId) {
      const firstTargetIdx = Math.max(0, enemies.findIndex((e) => e.id === dmgToEnemies[0]?.id))
      if (castId) {
        const sk = getSkillInfo(castId)
        spawnFloater('player', sk?.name || '技能', 'skill')
      }
      if (dmgToEnemies.length > 0) {
        if (isRanged) {
          const n = enemies.length
          const k = fxKey++
          setProjectile({ key: k, fromX: PLAYER_X + 6, toX: enemyX(firstTargetIdx, n) + 4, toY: 40, color: classId === 'mage' ? '#79C0FF' : classId === 'priest' ? '#F0D878' : classId === 'ranger' ? '#A8D08D' : '#A371F7' })
          later(320, () => setProjectile(null))
        } else {
          setLunging('player')
          later(300, () => setLunging(null))
        }
        dmgToEnemies.forEach((d, i) => {
          later(280 + i * 90, () => {
            flash(d.id)
            const big = d.amount > (player.atk * 1.2)
            spawnFloater(d.id, `-${d.amount}`, big ? 'crit' : 'dmg')
            if (big) { setShaking(true); later(250, () => setShaking(false)) }
          })
        })
      }
    }
    // 治疗/回复
    if (playerDelta > 0) spawnFloater('player', `+${playerDelta}`, 'heal')

    // ── 敌方反击阶段 ──
    if (playerDelta < 0) {
      const attackers = enemies.filter((e) => e.hp > 0)
      attackers.forEach((e, i) => {
        later(620 + i * 160, () => { setLunging(e.id); later(280, () => setLunging((l) => (l === e.id ? null : l))) })
      })
      later(700 + attackers.length * 120, () => {
        flash('player')
        spawnFloater('player', `${playerDelta}`, 'dmg')
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enemies, player?.hp, cooldowns, inCombat])

  if (!player) return null
  const n = enemies.length

  return (
    <div className={`battle-stage ${shaking ? 'bs-shake' : ''}`}>
      <style>{CSS}</style>
      <div className="bs-bg" />
      <div className="bs-ground" />

      {/* 玩家 */}
      <div className={`bs-unit bs-hero ${lunging === 'player' ? 'bs-lunge-r' : ''} ${hits.has('player') ? 'bs-hit' : ''} ${player.hp <= 0 ? 'bs-dead' : ''}`}
        style={{ left: `${PLAYER_X}%` }}>
        <div className="bs-bars">
          <div className="bs-bar"><div className="bs-bar-fill" style={{ width: `${(player.hp / player.maxHp) * 100}%`, background: 'linear-gradient(90deg,#F85149,#3FB950)' }} /></div>
          <div className="bs-bar bs-bar-mp"><div className="bs-bar-fill" style={{ width: `${(player.mp / player.maxMp) * 100}%`, background: '#58A6FF' }} /></div>
        </div>
        <HeroSprite classId={player.classId} size={64} />
        <div className="bs-name" style={{ color: 'var(--accent)' }}>{player.name}</div>
      </div>

      {/* 敌人 */}
      {enemies.map((e, i) => {
        const dead = e.hp <= 0
        return (
          <div key={e.id}
            className={`bs-unit bs-enemy ${lunging === e.id ? 'bs-lunge-l' : ''} ${hits.has(e.id) ? 'bs-hit' : ''} ${dead ? 'bs-dead' : ''}`}
            style={{ left: `${enemyX(i, n)}%` }}>
            <div className="bs-bars">
              <div className="bs-bar"><div className="bs-bar-fill" style={{ width: `${Math.max(0, (e.hp / e.maxHp) * 100)}%`, background: '#F85149' }} /></div>
              {(e.statuses || []).length > 0 && (
                <div className="bs-statuses">
                  {(e.statuses || []).slice(0, 3).map((st: { id: string; name: string; turns: number }) => (
                    <span key={st.id} className="bs-status">{st.name}</span>
                  ))}
                </div>
              )}
            </div>
            <EnemySprite id={e.id} element={e.element} size={60} />
            <div className="bs-name" style={{ color: dead ? 'var(--text-muted)' : '#F85149' }}>{e.name}</div>
          </div>
        )
      })}

      {/* 投射物 */}
      {projectile && (
        <div className="bs-projectile" key={projectile.key}
          style={{ left: `${projectile.toX}%`, top: `${projectile.toY}%`, background: projectile.color, boxShadow: `0 0 10px 3px ${projectile.color}`, animationDuration: '0.3s', ['--from-x' as never]: `${projectile.fromX - projectile.toX}vw` }} />
      )}

      {/* 伤害飘字 */}
      {floaters.map((f) => {
        const idx = f.target === 'player' ? -1 : enemies.findIndex((e) => e.id === f.target)
        const x = f.target === 'player' ? PLAYER_X + 4 : enemyX(Math.max(0, idx), n) + 3
        return (
          <div key={f.key} className={`bs-floater bs-f-${f.kind}`} style={{ left: `${x}%` }}>
            {f.text}
          </div>
        )
      })}
    </div>
  )
}

const CSS = `
.battle-stage { position: relative; height: 190px; overflow: hidden; border-radius: 8px; user-select: none; }
.bs-bg { position: absolute; inset: 0; background: linear-gradient(180deg, #10141C 0%, #161B26 55%, #1D2431 100%); }
.bs-ground { position: absolute; left: 0; right: 0; bottom: 22px; height: 2px; background: linear-gradient(90deg, transparent, rgba(201,168,76,0.35) 20%, rgba(201,168,76,0.35) 80%, transparent); }
.bs-unit { position: absolute; bottom: 24px; transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; transition: opacity 0.4s; animation: bs-idle 2.4s ease-in-out infinite; }
.bs-enemy { animation-delay: 0.6s; }
@keyframes bs-idle { 0%,100% { transform: translateX(-50%) translateY(0); } 50% { transform: translateX(-50%) translateY(-4px); } }
.bs-lunge-r { animation: bs-lunge-r 0.3s ease-out !important; }
@keyframes bs-lunge-r { 0% { transform: translateX(-50%); } 40% { transform: translateX(calc(-50% + 46px)); } 100% { transform: translateX(-50%); } }
.bs-lunge-l { animation: bs-lunge-l 0.3s ease-out !important; }
@keyframes bs-lunge-l { 0% { transform: translateX(-50%); } 40% { transform: translateX(calc(-50% - 46px)); } 100% { transform: translateX(-50%); } }
.bs-hit { filter: brightness(2.2) saturate(0.4); }
.bs-dead { opacity: 0.25; animation: bs-die 0.6s ease-out forwards !important; }
@keyframes bs-die { to { transform: translateX(-50%) translateY(10px) rotate(80deg); opacity: 0.15; } }
.bs-shake { animation: bs-shake 0.25s linear; }
@keyframes bs-shake { 0%,100% { transform: translate(0,0); } 25% { transform: translate(3px,-2px); } 50% { transform: translate(-3px,2px); } 75% { transform: translate(2px,2px); } }
.bs-bars { width: 64px; margin-bottom: 2px; }
.bs-bar { height: 5px; border-radius: 3px; background: rgba(0,0,0,0.55); overflow: hidden; margin-bottom: 2px; }
.bs-bar-fill { height: 100%; border-radius: 3px; transition: width 0.45s ease-out; }
.bs-bar-mp { height: 3px; }
.bs-statuses { display: flex; gap: 2px; flex-wrap: wrap; justify-content: center; }
.bs-status { font-size: 8px; padding: 0 3px; border-radius: 3px; background: rgba(163,113,247,0.25); color: #A371F7; }
.bs-name { font-size: 10px; font-weight: 700; text-shadow: 0 1px 2px #000; white-space: nowrap; }
.bs-floater { position: absolute; bottom: 130px; transform: translateX(-50%); font-size: 15px; font-weight: 900; text-shadow: 0 2px 3px #000; pointer-events: none; animation: bs-float 0.95s ease-out forwards; z-index: 5; }
.bs-f-dmg { color: #FF7B72; }
.bs-f-crit { color: #FFA657; font-size: 20px; }
.bs-f-heal { color: #3FB950; }
.bs-f-skill { color: #C9A84C; font-size: 12px; bottom: 148px; }
@keyframes bs-float { 0% { opacity: 0; transform: translateX(-50%) translateY(10px) scale(0.7); } 15% { opacity: 1; transform: translateX(-50%) translateY(0) scale(1.15); } 100% { opacity: 0; transform: translateX(-50%) translateY(-46px) scale(1); } }
.bs-projectile { position: absolute; width: 10px; height: 10px; border-radius: 50%; animation: bs-proj linear forwards; z-index: 4; }
@keyframes bs-proj { from { transform: translateX(var(--from-x)); } to { transform: translateX(0); } }
`
