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
interface Projectile { key: number; fromX: number; toX: number; toY: number; color: string; big?: boolean }
interface CastBanner { key: number; name: string; color: string }
interface Burst { key: number; x: number; color: string; up?: boolean }

/** 技能类型 → 特效颜色 */
const KIND_COLOR: Record<string, string> = {
  damage: '#FF8C5A', heal: '#5EE87A', buff: '#FFC94D', dot: '#C77DFF', debuff: '#A371F7', other: '#79C0FF',
}
const kindColor = (k?: string) => KIND_COLOR[k || ''] || KIND_COLOR.other

const PLAYER_X = 14 // %
const enemyX = (i: number, n: number) => 58 + (n > 1 ? i * (30 / Math.max(1, n - 1)) : 8) // %

let fxKey = 1

// 敌人实例键：同场多个同种怪时以 uid 区分个体（模板 id 仅用于贴图）
const ek = (e: { id: string; uid?: string }) => e.uid ?? e.id

export default function BattleStage({ mode }: { mode?: 'explore' | 'lawful' | 'rift' | 'weekly' | 'combat' }) {
  const player = useGameStore((s) => s.player)
  const enemies = useGameStore((s) => s.combatEnemies)
  const inCombat = useGameStore((s) => s.inCombat)
  const cooldowns = useGameStore((s) => s.skillCooldowns)
  const battleMode = useGameStore((s) => s.battleMode)
  // 战斗动画只在发起当前战斗的页面播放：其他页面的舞台静默
  const silent = !!battleMode && !!mode && battleMode !== mode

  const [floaters, setFloaters] = useState<Floater[]>([])
  const [lunging, setLunging] = useState<string | null>(null) // 'player' 或敌人 id
  const [hits, setHits] = useState<Set<string>>(new Set())
  const [projectile, setProjectile] = useState<Projectile | null>(null)
  const [castBanner, setCastBanner] = useState<CastBanner | null>(null)
  const [aura, setAura] = useState<string | null>(null) // 玩家施法光环颜色
  const [bursts, setBursts] = useState<Burst[]>([])

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
    if (silent) { prev.current = null; return } // 非本页战斗：不播动画
    if (!player) return
    if (!inCombat) { prev.current = null; return }
    const curHpMap: Record<string, number> = {}
    enemies.forEach((e) => { curHpMap[ek(e)] = e.hp })
    const old = prev.current
    prev.current = { hp: player.hp, enemies: curHpMap, cds: { ...cooldowns } }
    if (!old) return // 战斗刚开始，只建立快照

    // 本回合新进入冷却的技能 = 刚施放的技能
    const castId = Object.keys(cooldowns).find((k) => (cooldowns[k] || 0) > 0 && !(old.cds[k] > 0))

    const dmgToEnemies = enemies
      .filter((e) => old.enemies[ek(e)] !== undefined && e.hp < old.enemies[ek(e)])
      .map((e) => ({ id: ek(e), amount: old.enemies[ek(e)] - e.hp, died: e.hp <= 0 }))
    const playerDelta = player.hp - old.hp

    if (dmgToEnemies.length === 0 && playerDelta === 0 && !castId) return

    const classId = player.classId || 'warrior'
    const isRanged = RANGED.has(classId)

    // ── 玩家行动阶段 ──
    if (dmgToEnemies.length > 0 || castId) {
      const firstTargetIdx = Math.max(0, enemies.findIndex((e) => ek(e) === dmgToEnemies[0]?.id))
      let castKind: string | undefined
      let castColor: string | undefined
      if (castId) {
        const sk = getSkillInfo(castId)
        castKind = (sk as { kind?: string } | undefined)?.kind
        castColor = kindColor(castKind)
        spawnFloater('player', sk?.name || '技能', 'skill')
        // ① 中央技能横幅：技能名大幅弹出
        const bk = fxKey++
        setCastBanner({ key: bk, name: sk?.name || '技能', color: castColor })
        later(950, () => setCastBanner((c) => (c?.key === bk ? null : c)))
        // ② 玩家施法光环
        setAura(castColor)
        later(750, () => setAura(null))
        // ③ 目标粒子爆发：伤害/减益打敌人，治疗/增益落在自己身上
        const selfCast = castKind === 'heal' || castKind === 'buff'
        const burstTargets = selfCast
          ? [{ x: PLAYER_X + 4, up: true }]
          : dmgToEnemies.length > 0
            ? dmgToEnemies.map((d) => ({ x: enemyX(Math.max(0, enemies.findIndex((e) => ek(e) === d.id)), enemies.length) + 4, up: false }))
            : [{ x: enemyX(firstTargetIdx, enemies.length) + 4, up: false }]
        burstTargets.forEach((t, i) => {
          later(200 + i * 80, () => {
            const k = fxKey++
            setBursts((b) => [...b.slice(-8), { key: k, x: t.x, color: castColor!, up: t.up }])
            later(650, () => setBursts((b) => b.filter((x) => x.key !== k)))
          })
        })
      }
      if (dmgToEnemies.length > 0) {
        if (isRanged || castId) {
          const n = enemies.length
          const k = fxKey++
          setProjectile({
            key: k, fromX: PLAYER_X + 6, toX: enemyX(firstTargetIdx, n) + 4, toY: 40,
            color: castColor || (classId === 'mage' ? '#79C0FF' : classId === 'priest' ? '#F0D878' : classId === 'ranger' ? '#A8D08D' : '#A371F7'),
            big: !!castId,
          })
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
        later(620 + i * 160, () => { setLunging(ek(e)); later(280, () => setLunging((l) => (l === ek(e) ? null : l))) })
      })
      later(700 + attackers.length * 120, () => {
        flash('player')
        spawnFloater('player', `${playerDelta}`, 'dmg')
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enemies, player?.hp, cooldowns, inCombat])

  if (!player) return null
  if (silent) {
    return (
      <div className="battle-stage">
        <style>{CSS}</style>
        <div className="bs-bg" />
        <div className="flex h-full items-center justify-center text-xs" style={{ color: 'var(--text-muted)' }}>
          另一场战斗正在进行中……
        </div>
      </div>
    )
  }
  const n = enemies.length

  return (
    <div className="battle-stage">
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
        <div style={aura ? { filter: `drop-shadow(0 0 10px ${aura}) drop-shadow(0 0 3px ${aura})` } : undefined}>
          <HeroSprite classId={player.classId} size={68} pose={lunging === 'player' || projectile ? 'attack' : 'idle'} />
        </div>
        <div className="bs-name" style={{ color: 'var(--accent)' }}>{player.name}</div>
      </div>

      {/* 敌人 */}
      {enemies.map((e, i) => {
        const dead = e.hp <= 0
        return (
          <div key={ek(e)}
            className={`bs-unit bs-enemy ${lunging === ek(e) ? 'bs-lunge-l' : ''} ${hits.has(ek(e)) ? 'bs-hit' : ''} ${dead ? 'bs-dead' : ''}`}
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

      {/* 技能横幅：中央弹出技能名 */}
      {castBanner && (
        <div key={castBanner.key} className="bs-cast" style={{ borderColor: castBanner.color, color: castBanner.color, boxShadow: `3px 3px 0 rgba(0,0,0,0.5), inset 2px 2px 0 rgba(255,255,255,0.10)` }}>
          ✦ {castBanner.name} ✦
        </div>
      )}

      {/* 粒子爆发（技能命中/治疗增益） */}
      {bursts.map((b) => (
        <div key={b.key} className="bs-burst" style={{ left: `${b.x}%` }}>
          {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
            <span key={deg} className="bs-particle"
              style={{ background: b.color, boxShadow: `0 0 4px ${b.color}`, ['--deg' as never]: `${b.up ? deg - 90 : deg}deg` }} />
          ))}
        </div>
      ))}

      {/* 投射物 */}
      {projectile && (
        <div className={`bs-projectile ${projectile.big ? 'bs-proj-big' : ''}`} key={projectile.key}
          style={{ left: `${projectile.toX}%`, top: `${projectile.toY}%`, background: projectile.color, boxShadow: `0 0 10px 3px ${projectile.color}`, animationDuration: '0.3s', ['--from-x' as never]: `${projectile.fromX - projectile.toX}vw` }} />
      )}

      {/* 伤害飘字 */}
      {floaters.map((f) => {
        const idx = f.target === 'player' ? -1 : enemies.findIndex((e) => ek(e) === f.target)
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
.bs-dead { opacity: 0.25; filter: grayscale(1); animation: bs-die 0.6s ease-out forwards !important; }
.bs-unit svg { image-rendering: pixelated; }
@keyframes bs-die { to { transform: translateX(-50%) translateY(10px) rotate(80deg); opacity: 0.15; } }
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
.bs-projectile { position: absolute; width: 10px; height: 10px; border-radius: 0; animation: bs-proj linear forwards; z-index: 4; }
.bs-proj-big { width: 16px; height: 16px; clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%); }
@keyframes bs-proj { from { transform: translateX(var(--from-x)); } to { transform: translateX(0); } }
/* 技能横幅：像素边框 + 弹入 + 停留后上浮消失 */
.bs-cast { position: absolute; left: 50%; top: 26%; transform: translateX(-50%); padding: 4px 14px; font-size: 15px; font-weight: 900; letter-spacing: 0.12em; background: rgba(21,15,30,0.92); border: 2px solid; z-index: 8; pointer-events: none; white-space: nowrap; animation: bs-cast 0.95s steps(8) forwards; }
@keyframes bs-cast { 0% { opacity: 0; transform: translateX(-50%) scale(0.4); } 18% { opacity: 1; transform: translateX(-50%) scale(1.18); } 30% { transform: translateX(-50%) scale(1); } 75% { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); } 100% { opacity: 0; transform: translateX(-50%) translateY(-14px) scale(0.92); } }
/* 粒子爆发 */
.bs-burst { position: absolute; bottom: 78px; transform: translateX(-50%); z-index: 7; pointer-events: none; }
.bs-particle { position: absolute; width: 6px; height: 6px; animation: bs-burst 0.6s steps(5) forwards; }
.bs-p-up { animation-name: bs-burst-up; }
@keyframes bs-burst { 0% { opacity: 1; transform: rotate(var(--deg)) translateX(0) scale(1); } 100% { opacity: 0; transform: rotate(var(--deg)) translateX(34px) scale(0.3); } }
@keyframes bs-burst-up { 0% { opacity: 1; transform: translateY(0) scale(1); } 100% { opacity: 0; transform: translateY(-44px) scale(0.3); } }
`
