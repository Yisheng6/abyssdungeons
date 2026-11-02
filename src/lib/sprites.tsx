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

/** 英雄像素精灵：face 朝右 */
export function HeroSprite({ classId, size = 72, pose = 'idle' }: {
  classId: string; size?: number; pose?: 'idle' | 'attack'
}) {
  const def = HERO_SPRITES[classId] || HERO_SPRITES.warrior
  const art: PixelArt = useMemo(() => ({
    w: 16, h: 16, palette: def.palette, frames: [def.idle, def.attack],
  }), [def])
  return <PixelSprite art={art} size={size} frame={pose === 'attack' ? 1 : 0} />
}

/** 怪物像素精灵：face 朝左（flip 源图朝右的画法），待机帧自动交替 */
export function EnemySprite({ id, size = 72 }: { id: string; element?: string; size?: number }) {
  const def = getMonsterSprite(id)
  const [frame, setFrame] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setFrame((f) => (f + 1) % def.art.frames.length), 520)
    return () => clearInterval(t)
  }, [def])
  return <PixelSprite art={def.art} size={size} frame={frame} />
}
