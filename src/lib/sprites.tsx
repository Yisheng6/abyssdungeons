/**
 * 像素精灵渲染器 —— 资源全部来自 pixel-art.ts 的手工字符画，SVG rect 逐像素绘制
 * HeroSprite：6 职业，pose=idle/attack 两帧
 * EnemySprite：按怪物 id 从登记表取图（帧自动交替，模拟待机动作）
 */
import { useEffect, useMemo, useState } from 'react'
import { HERO_SPRITES, getMonsterSprite, type PixelArt } from './pixel-art'

function artToRects(art: PixelArt, frame: number) {
  const rows = art.frames[frame % art.frames.length]
  const rects: Array<{ x: number; y: number; c: string }> = []
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x]
      if (ch === '.' || ch === ' ') continue
      const c = art.palette[ch]
      if (c) rects.push({ x, y, c })
    }
  })
  return rects
}

export function PixelSprite({ art, size, frame = 0, flip = false, className }: {
  art: PixelArt; size: number; frame?: number; flip?: boolean; className?: string
}) {
  const rects = useMemo(() => artToRects(art, frame), [art, frame])
  return (
    <svg
      width={size} height={size * (art.h / art.w)} viewBox={`0 0 ${art.w} ${art.h}`}
      shapeRendering="crispEdges" className={className}
      style={flip ? { transform: 'scaleX(-1)', imageRendering: 'pixelated' } : { imageRendering: 'pixelated' }}>
      {rects.map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={1.02} height={1.02} fill={r.c} />
      ))}
    </svg>
  )
}

/** 英雄像素精灵：优先使用 Q 版 PNG 立绘（/sprites/class_*.png），攻击时前倾 */
export function HeroSprite({ classId, size = 72, pose = 'idle' }: {
  classId: string; size?: number; pose?: 'idle' | 'attack'
}) {
  const png = `/sprites/class_${classId}.png`
  if (CLASS_PNG.has(classId)) {
    return (
      <img src={png} width={size} height={size} alt=""
        style={{
          imageRendering: 'pixelated', objectFit: 'contain',
          transform: pose === 'attack' ? 'translateX(6px)' : undefined,
          transition: 'transform 120ms steps(2)',
        }} />
    )
  }
  const def = HERO_SPRITES[classId] || HERO_SPRITES.warrior
  const art: PixelArt = useMemo(() => ({
    w: 16, h: 16, palette: def.palette, frames: [def.idle, def.attack],
  }), [def])
  return <PixelSprite art={art} size={size} frame={pose === 'attack' ? 1 : 0} />
}

/** 六职业 PNG 立绘 */
const CLASS_PNG = new Set(['warrior', 'mage', 'assassin', 'ranger', 'priest', 'warlock'])

/** 怪物 PNG 精灵：id 与文件名一致；个别 Boss 用别名映射到相近形象 */
const ENEMY_PNG_ALIAS: Record<string, string> = {
  boss_frost_queen: 'boss_ithaqus',   // 冰霜女皇 → 寒冰系旧日支配者
  boss_void_tyrant: 'boss_azathoth',  // 虚空暴君 → 阿撒托斯
  vampire_spawn: 'boss_nyarl',        // 血族侍从 → 奈亚拉托提普
  tomb_spider_queen: 'wboss_atlach',  // 墓穴蛛后 → 阿特拉克
}

const ENEMY_PNG_KNOWN = new Set([
  'bat_cave', 'miner_corrupted', 'spider_giant', 'slime_toxic', 'skeleton', 'ghost',
  'zombie', 'boss_golem_ore', 'flame_imp', 'lava_hound', 'magma_slug', 'ash_wraith',
  'fire_elemental', 'obsidian_golem', 'cinder_spider', 'boss_balrog', 'frost_wolf', 'ice_sprite',
  'frozen_zombie', 'snow_harpy', 'ice_golem', 'frost_mage_cultist', 'glacier_serpent', 'void_crawler',
  'shadow_stalker', 'void_priest', 'chaos_spawn', 'void_devourer', 'rift_phantom', 'entropy_horror',
])

function resolveEnemyPng(id: string): string | null {
  if (ENEMY_PNG_ALIAS[id]) return `/sprites/${ENEMY_PNG_ALIAS[id]}.png`
  if (ENEMY_PNG_KNOWN.has(id)) return `/sprites/${id}.png`
  for (const key of Object.keys(ENEMY_PNG_ALIAS)) {
    if (id.startsWith(key)) return `/sprites/${ENEMY_PNG_ALIAS[key]}.png`
  }
  for (const key of ENEMY_PNG_KNOWN) {
    if (id.startsWith(key)) return `/sprites/${key}.png`
  }
  return null
}

/** 怪物像素精灵：优先 Q 版 PNG，未收录的回落到 SVG 字符画（待机帧交替） */
export function EnemySprite({ id, size = 72 }: { id: string; element?: string; size?: number }) {
  const png = resolveEnemyPng(id)
  const def = getMonsterSprite(id)
  const [frame, setFrame] = useState(0)
  useEffect(() => {
    if (png) return
    const t = setInterval(() => setFrame((f) => (f + 1) % def.art.frames.length), 520)
    return () => clearInterval(t)
  }, [def, png])
  if (png) {
    return (
      <img src={png} width={size} height={size} alt=""
        style={{ imageRendering: 'pixelated', objectFit: 'contain' }} />
    )
  }
  return <PixelSprite art={def.art} size={size} frame={frame} />
}
