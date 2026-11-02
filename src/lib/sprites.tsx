/**
 * 纯 SVG 程序化绘制的战斗精灵 —— 所有美术资源均由代码绘制，无外部图片
 * HeroSprite：6 职业英雄（朝向右边敌人）
 * EnemySprite：按 id 哈希生成的克苏鲁风怪物（朝向左边玩家）
 */

const CLASS_PALETTE: Record<string, { main: string; dark: string; accent: string; skin: string }> = {
  warrior:  { main: '#8B9BB4', dark: '#5A6B85', accent: '#C9A84C', skin: '#E8C39E' },
  mage:     { main: '#5B6FD6', dark: '#3D4A9E', accent: '#79C0FF', skin: '#E8C39E' },
  assassin: { main: '#3D5A52', dark: '#24352F', accent: '#3FB950', skin: '#D8B48E' },
  ranger:   { main: '#4F7A3A', dark: '#2F4E22', accent: '#A8D08D', skin: '#E8C39E' },
  priest:   { main: '#D8CBB2', dark: '#A89B7E', accent: '#F0D878', skin: '#F0D0B0' },
  warlock:  { main: '#6E4A8E', dark: '#452C5E', accent: '#A371F7', skin: '#D8C0A8' },
}

/** 英雄精灵：64×72 viewBox，脸朝右 */
export function HeroSprite({ classId, size = 72 }: { classId: string; size?: number }) {
  const p = CLASS_PALETTE[classId] || CLASS_PALETTE.warrior
  return (
    <svg width={size} height={size * 1.125} viewBox="0 0 64 72">
      {/* 影子 */}
      <ellipse cx="32" cy="68" rx="16" ry="3.5" fill="rgba(0,0,0,0.35)" />
      {classId === 'warrior' && (<>
        <rect x="22" y="26" width="20" height="26" rx="6" fill={p.main} />
        <rect x="22" y="38" width="20" height="4" fill={p.dark} />
        <circle cx="32" cy="18" r="10" fill={p.skin} />
        <path d="M21 18 a11 11 0 0 1 22 0 l0 -4 a11 8 0 0 0 -22 0 z" fill={p.dark} />
        <rect x="18" y="14" width="28" height="4" rx="2" fill={p.dark} />
        <rect x="24" y="50" width="6" height="14" rx="2" fill={p.dark} />
        <rect x="34" y="50" width="6" height="14" rx="2" fill={p.dark} />
        {/* 剑 */}
        <rect x="46" y="10" width="4" height="30" rx="1.5" fill="#C0CCD8" />
        <rect x="42" y="36" width="12" height="4" rx="2" fill={p.accent} />
        {/* 盾 */}
        <path d="M12 30 h12 v14 a6 8 0 0 1 -12 0 z" fill={p.dark} stroke={p.accent} strokeWidth="1.5" />
      </>)}
      {classId === 'mage' && (<>
        <path d="M20 52 L24 24 h16 l4 28 z" fill={p.main} />
        <circle cx="32" cy="18" r="9" fill={p.skin} />
        <path d="M20 14 L32 -2 L44 14 z" fill={p.dark} />
        <ellipse cx="32" cy="14" rx="14" ry="3.5" fill={p.dark} />
        <circle cx="38" cy="6" r="2" fill={p.accent} />
        <rect x="26" y="52" width="5" height="12" rx="2" fill={p.dark} />
        <rect x="34" y="52" width="5" height="12" rx="2" fill={p.dark} />
        {/* 法杖 */}
        <rect x="48" y="8" width="3" height="42" rx="1.5" fill="#6B4A2E" />
        <circle cx="49.5" cy="7" r="4.5" fill={p.accent} opacity="0.9" />
        <circle cx="49.5" cy="7" r="7" fill={p.accent} opacity="0.25" />
      </>)}
      {classId === 'assassin' && (<>
        <path d="M21 52 L25 26 h14 l4 26 z" fill={p.main} />
        <circle cx="32" cy="18" r="9" fill={p.skin} />
        <path d="M22 18 a10 10 0 0 1 20 0 v6 h-4 v-4 a6 6 0 0 0 -12 0 v4 h-4 z" fill={p.dark} />
        <rect x="26" y="20" width="12" height="3" fill={p.dark} />
        <rect x="26" y="52" width="5" height="12" rx="2" fill={p.dark} />
        <rect x="34" y="52" width="5" height="12" rx="2" fill={p.dark} />
        {/* 双匕首 */}
        <path d="M46 34 l8 -12 l2 3 l-7 11 z" fill="#C0CCD8" />
        <path d="M14 38 l-6 -10 l3 -2 l5 10 z" fill="#C0CCD8" />
      </>)}
      {classId === 'ranger' && (<>
        <path d="M21 52 L25 26 h14 l4 26 z" fill={p.main} />
        <circle cx="32" cy="18" r="9" fill={p.skin} />
        <path d="M22 16 a10 8 0 0 1 20 0 l-2 -6 a12 10 0 0 0 -16 0 z" fill={p.dark} />
        <path d="M22 16 h20 l6 -4 l-2 6 z" fill={p.main} />
        <rect x="26" y="52" width="5" height="12" rx="2" fill={p.dark} />
        <rect x="34" y="52" width="5" height="12" rx="2" fill={p.dark} />
        {/* 弓 */}
        <path d="M48 14 a16 20 0 0 1 0 34" fill="none" stroke="#6B4A2E" strokeWidth="3" />
        <line x1="48" y1="14" x2="48" y2="48" stroke="#D8D8D8" strokeWidth="1" />
      </>)}
      {classId === 'priest' && (<>
        <path d="M20 52 L24 24 h16 l4 28 z" fill={p.main} />
        <path d="M24 24 h16 l1 6 h-18 z" fill={p.accent} opacity="0.6" />
        <circle cx="32" cy="18" r="9" fill={p.skin} />
        <path d="M23 16 a9 9 0 0 1 18 0 v-3 a9 7 0 0 0 -18 0 z" fill="#FFFFFF" opacity="0.9" />
        <circle cx="32" cy="9" r="2.5" fill={p.accent} />
        <rect x="26" y="52" width="5" height="12" rx="2" fill={p.dark} />
        <rect x="34" y="52" width="5" height="12" rx="2" fill={p.dark} />
        {/* 圣杖 */}
        <rect x="48" y="12" width="3" height="38" rx="1.5" fill="#C9A84C" />
        <circle cx="49.5" cy="10" r="4" fill="#FFF3C0" />
        <circle cx="49.5" cy="10" r="6.5" fill="#F0D878" opacity="0.3" />
      </>)}
      {classId === 'warlock' && (<>
        <path d="M20 52 L24 24 h16 l4 28 z" fill={p.main} />
        <circle cx="32" cy="18" r="9" fill={p.skin} />
        <path d="M22 18 a10 10 0 0 1 20 0 v5 h-3 v-3 a7 7 0 0 0 -14 0 v3 h-3 z" fill={p.dark} />
        {/* 恶魔角 */}
        <path d="M24 12 q-4 -8 -8 -9 q3 6 5 10 z" fill={p.accent} />
        <path d="M40 12 q4 -8 8 -9 q-3 6 -5 10 z" fill={p.accent} />
        <rect x="26" y="52" width="5" height="12" rx="2" fill={p.dark} />
        <rect x="34" y="52" width="5" height="12" rx="2" fill={p.dark} />
        {/* 骷髅杖 */}
        <rect x="48" y="12" width="3" height="38" rx="1.5" fill="#4A3A2E" />
        <circle cx="49.5" cy="10" r="4.5" fill="#E0E0E0" />
        <circle cx="48" cy="9.5" r="1" fill="#333" /><circle cx="51" cy="9.5" r="1" fill="#333" />
      </>)}
    </svg>
  )
}

// ─── 敌人程序化生成 ───
function hash(str: string): number {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) }
  return Math.abs(h)
}

const ELEMENT_COLORS: Record<string, [string, string]> = {
  fire: ['#C2543A', '#7A2E1E'], water: ['#3A6EA5', '#23405E'], ice: ['#6BA8C9', '#3A6A8A'],
  nature: ['#4F7A3A', '#2C4A1E'], shadow: ['#5E4A7A', '#342545'], void: ['#4A3A5E', '#241A30'],
  lightning: ['#B89A3A', '#6E5A1E'], none: ['#5E6B5A', '#35402F'],
}

/** 敌人精灵：72×64 viewBox，脸朝左（克苏鲁风触手怪） */
export function EnemySprite({ id, element, size = 72 }: { id: string; element?: string; size?: number }) {
  const h = hash(id)
  const [c1, c2] = ELEMENT_COLORS[element || 'none'] || ELEMENT_COLORS.none
  const eyes = 1 + (h % 3)                 // 1-3 只眼睛
  const tentacles = 2 + (h % 4)            // 2-5 条触手
  const horns = h % 5 < 2                  // 40% 长角
  const wings = h % 5 >= 3                 // 40% 长翅膀
  const bodyW = 26 + (h % 10)
  const bodyH = 22 + ((h >> 4) % 10)
  const eyeY = 26 - ((h >> 3) % 4)

  return (
    <svg width={size} height={size * 0.9} viewBox="0 0 72 64">
      <ellipse cx="36" cy="58" rx="18" ry="3.5" fill="rgba(0,0,0,0.35)" />
      {/* 翅膀 */}
      {wings && (<>
        <path d="M52 24 q14 -14 16 -20 q-2 12 -8 22 z" fill={c2} opacity="0.85" />
        <path d="M20 24 q-14 -14 -16 -20 q2 12 8 22 z" fill={c2} opacity="0.85" />
      </>)}
      {/* 触手 */}
      {Array.from({ length: tentacles }).map((_, i) => {
        const spread = (i - (tentacles - 1) / 2) * 9
        const curl = ((h >> (i + 5)) % 7) - 3
        return (
          <path key={i}
            d={`M${36 + spread * 0.6} ${44} q ${spread * 0.5 + curl} 10 ${spread + curl * 2} 14`}
            fill="none" stroke={c2} strokeWidth="3.5" strokeLinecap="round" />
        )
      })}
      {/* 身体 */}
      <ellipse cx="36" cy="34" rx={bodyW} ry={bodyH} fill={c1} />
      <ellipse cx="36" cy="30" rx={bodyW * 0.75} ry={bodyH * 0.6} fill={c1} opacity="0.7" />
      {/* 角 */}
      {horns && (<>
        <path d="M26 16 q-4 -10 -9 -12 q2 8 4 13 z" fill={c2} />
        <path d="M46 16 q4 -10 9 -12 q-2 8 -4 13 z" fill={c2} />
      </>)}
      {/* 眼睛（左侧朝向玩家，主眼偏左） */}
      {Array.from({ length: eyes }).map((_, i) => {
        const ex = eyes === 1 ? 28 : 24 + i * (24 / Math.max(1, eyes - 1))
        const r = i === 0 ? 5 : 3.5
        return (
          <g key={i}>
            <circle cx={ex} cy={eyeY + (i % 2) * 5} r={r} fill="#F5E6C8" />
            <circle cx={ex - 1} cy={eyeY + (i % 2) * 5} r={r * 0.45} fill="#1A0E14" />
          </g>
        )
      })}
      {/* 嘴 */}
      <path d={`M24 ${42} q 8 ${4 + (h % 4)} 18 0`} fill="none" stroke="#1A0E14" strokeWidth="2" strokeLinecap="round" />
      {h % 3 === 0 && (<>
        <path d="M28 43 l2 4 l2 -4 z" fill="#E8E8E8" />
        <path d="M36 43 l2 4 l2 -4 z" fill="#E8E8E8" />
      </>)}
    </svg>
  )
}
