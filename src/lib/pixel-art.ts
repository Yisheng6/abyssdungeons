/**
 * 像素美术资源库 —— 全部手工逐像素绘制，无任何外部图片
 * 格式：每个精灵 = 调色板 + 字符画网格帧（'.' 为透明）
 * 每个怪物 id 在 MONSTER_SPRITES 中有唯一登记项（archetype + 专属配色），防止混淆；
 * 未登记的新 id 由 hashFallback 按 id 确定性分配 archetype，永不重样错乱。
 */

export interface PixelArt {
  w: number
  h: number
  palette: Record<string, string>
  frames: string[][]
}

/** 由一帧自动生成第二帧（整体下沉1px+眼睛眨眼），让怪物有待机呼吸感 */
export function mkFrames(rows: string[], eyeChars = 'eE'): string[][] {
  const blink = rows.map((r) => r.replace(new RegExp(`[${eyeChars}]`, 'g'), '.'))
  const shifted = [...blink.slice(0, Math.max(0, blink.length - 1))]
  return [rows, shifted]
}

// ═══════════════ 英雄（16×20，脸朝右）═══════════════

const HERO_BASE_PALETTE = {
  s: '#F0C8A0', // 皮肤
  S: '#D8A878', // 皮肤阴影
  e: '#28203A', // 眼睛
  o: '#33281E', // 靴
  w: '#D8E0E8', // 铁刃
  W: '#8A949E', // 刃暗
  g: '#C9A84C', // 金饰
  m: '#6B4A2E', // 木
}

const warriorIdle = [
  '................',
  '......pp........',
  '.....phhp.......',
  '...hhhhhhhh.....',
  '..hhhhhhhhhh....',
  '..hssssssssh....',
  '..hseesseesh....',
  '..hssssssssh....',
  '...ssssssss.....',
  '...bbbbbbb..w...',
  '..qqbbbbbb.w....',
  '..qqgbbbbbwg....',
  '..qqqbbbbb......',
  '...qq.bbb.......',
  '....oo.oo.......',
  '................',
]
const warriorAtk = [
  '................',
  '......pp........',
  '.....phhp.......',
  '...hhhhhhhh.....',
  '..hhhhhhhhhh....',
  '..hssssssssh....',
  '..hseesseesh....',
  '..hssssssssh....',
  '...ssssssss.....',
  '...bbbbbbb......',
  '..qqbbbbbbbwwwww',
  '..qqgbbbbb......',
  '..qqqbbbbb......',
  '...qq.bbb.......',
  '....oo..oo......',
  '................',
]

const mageIdle = [
  '.......gg.......',
  '......aaaa......',
  '.....aaaaaa.....',
  '...aaaaaaaaa....',
  '..aaaaaaaaaaa...',
  '..aasssssssa....',
  '..aseesseesa....',
  '..aassssssa.....',
  '...ssssssss.....',
  '....bbbbbb......',
  '...bbbbbb...m...',
  '..bbbbbbbc.m....',
  '..bbBbbbb..m....',
  '...bbbbb...m....',
  '....oo.oo.......',
  '................',
]
const mageAtk = [
  '.......gg.......',
  '......aaaa......',
  '.....aaaaaa.....',
  '...aaaaaaaaa....',
  '..aaaaaaaaaaa...',
  '..aasssssssa....',
  '..aseesseesa....',
  '..aassssssa.....',
  '...ssssssss.....',
  '....bbbbbb......',
  '...bbbbbbbmcc...',
  '..bbbbbbbc......',
  '..bbBbbbb.m.....',
  '...bbbbb..m.....',
  '....oo.oo.......',
  '................',
]

const assassinIdle = [
  '................',
  '....aaaaaa......',
  '...aaaaaaaa.....',
  '..aaaaaaaaaa....',
  '..aasssssaa.....',
  '..aaeeseessa....',
  '..aassSssa......',
  '...aaaaaaa......',
  '....bbbbbb......',
  '...bbbbbb.......',
  '..bbbbBbb..ww...',
  '..bbbBbbb..w....',
  '...bbbbb........',
  '....oo.oo.......',
  '................',
  '................',
]
const assassinAtk = [
  '................',
  '....aaaaaa......',
  '...aaaaaaaa.....',
  '..aaaaaaaaaa....',
  '..aasssssaa.....',
  '..aaeeseessa....',
  '..aassSssa......',
  '...aaaaaaa......',
  '....bbbbbb......',
  '...bbbbbb.......',
  '..bbbbBbbwwww...',
  '..bbbBbbb.......',
  '...bbbbb........',
  '....oo..oo......',
  '................',
  '................',
]

const rangerIdle = [
  '........g.......',
  '......aaa.......',
  '.....aaaaa......',
  '...aaaaaaaaa....',
  '..aaaaaaaaaa....',
  '..aasssssaa.....',
  '..aaeeseessa....',
  '..aassssssa.....',
  '...sssssss......',
  '....bbbbb.......',
  '...bbbbbb...m...',
  '..bbbbBbb..m....',
  '..bbBbbb...m....',
  '...bbbbb..m.....',
  '....oo.oo.......',
  '................',
]
const rangerAtk = [
  '........g.......',
  '......aaa.......',
  '.....aaaaa......',
  '...aaaaaaaaa....',
  '..aaaaaaaaaa....',
  '..aasssssaa.....',
  '..aaeeseessa....',
  '..aassssssa.....',
  '...sssssss......',
  '....bbbbb.......',
  '...bbbbbbmmmm...',
  '..bbbbBbb..m....',
  '..bbBbbb...m....',
  '...bbbbb........',
  '....oo.oo.......',
  '................',
]

const priestIdle = [
  '.......g........',
  '......aga.......',
  '.....aaaaa......',
  '...aaaaaaaaa....',
  '..aasssssssa....',
  '..aaeeseessa....',
  '..aassssssa.....',
  '...sssssss......',
  '....bbgbbb......',
  '...bbgggbb.c....',
  '..bbbbbbb..m....',
  '..bbBgBbb..m....',
  '...bbbbb...m....',
  '....oo.oo.......',
  '................',
  '................',
]
const priestAtk = [
  '.......g........',
  '......aga.......',
  '.....aaaaa......',
  '...aaaaaaaaa....',
  '..aasssssssa....',
  '..aaeeseessa....',
  '..aassssssa.....',
  '...sssssss......',
  '....bbgbbb......',
  '...bbgggbbmcc...',
  '..bbbbbbb.c.....',
  '..bbBgBbb.m.....',
  '...bbbbb..m.....',
  '....oo.oo.......',
  '................',
  '................',
]

const warlockIdle = [
  '...hh...hh......',
  '...hhh..hhh.....',
  '..aaaaaaaaaa....',
  '..aaaaaaaaaa....',
  '..aasssssssa....',
  '..aaeeseessa....',
  '..aassssssa.....',
  '...ssssssss.....',
  '....bbbbb.......',
  '...bbbbbb..w....',
  '..bbbbBbb.w.....',
  '..bbBbbb.m......',
  '...bbbbb.m......',
  '....oo.oo.......',
  '................',
  '................',
]
const warlockAtk = [
  '...hh...hh......',
  '...hhh..hhh.....',
  '..aaaaaaaaaa....',
  '..aaaaaaaaaa....',
  '..aasssssssa....',
  '..aaeeseessa....',
  '..aassssssa.....',
  '...ssssssss.....',
  '....bbbbb.......',
  '...bbbbbbmw.w...',
  '..bbbbBbb...w...',
  '..bbBbbb.m......',
  '...bbbbb.m......',
  '....oo.oo.......',
  '................',
  '................',
]

interface HeroDef { palette: Record<string, string>; idle: string[]; attack: string[] }

export const HERO_SPRITES: Record<string, HeroDef> = {
  warrior:  { palette: { ...HERO_BASE_PALETTE, h: '#7A8AA0', p: '#C2503A', b: '#8B9BB4', B: '#5A6B85', l: '#4A5568', q: '#5A6B85' }, idle: warriorIdle, attack: warriorAtk },
  mage:     { palette: { ...HERO_BASE_PALETTE, a: '#3D4A9E', b: '#5B6FD6', B: '#46539E', c: '#79C0FF', g: '#C9A84C' }, idle: mageIdle, attack: mageAtk },
  assassin: { palette: { ...HERO_BASE_PALETTE, a: '#2A3E38', b: '#3D5A52', B: '#2E4A42', l: '#24352F' }, idle: assassinIdle, attack: assassinAtk },
  ranger:   { palette: { ...HERO_BASE_PALETTE, a: '#3E5E2E', b: '#4F7A3A', B: '#3C602E', l: '#2F4E22', g: '#A8D08D' }, idle: rangerIdle, attack: rangerAtk },
  priest:   { palette: { ...HERO_BASE_PALETTE, a: '#F5F0E0', b: '#E8E0CC', B: '#C8BCA0', c: '#FFF3C0', g: '#C9A84C' }, idle: priestIdle, attack: priestAtk },
  warlock:  { palette: { ...HERO_BASE_PALETTE, a: '#452C5E', h: '#8A7A9E', b: '#6E4A8E', B: '#553A70', s: '#F0C8A0' }, idle: warlockIdle, attack: warlockAtk },
}

// ═══════════════ 怪物原型（16×16，脸朝左）═══════════════
// 通用字符语义：b 主体 / B 副色 / e 眼白 / p 瞳孔 / m 嘴 / g 高光 / w 翼 / h 角 / t 触手/腿 / s 骨

const ART_SLIME = mkFrames([
  '................',
  '................',
  '................',
  '.....bbbbbb.....',
  '....bbbbbbbb....',
  '...bbbbbbbbbb...',
  '..bbbeebbeebbb..',
  '..bbbeebbeebbb..',
  '..bbbbbbbbbbb...',
  '..bbbbmmmmbbbb..',
  '...bbbbbbbb.....',
  '....bbbbbb......',
  '................',
  '................',
  '................',
  '................',
])

const ART_BAT = mkFrames([
  '................',
  '................',
  '..ww......ww....',
  '..www....www....',
  '..wwwbbbbwww....',
  '...wbbbbbbbw....',
  '...bbeebbeeb....',
  '...bbeebbeeb....',
  '....bbbbbbb.....',
  '....bbmmmbb.....',
  '.....bbbbb......',
  '................',
  '................',
  '................',
  '................',
  '................',
])

const ART_SPIDER = mkFrames([
  '................',
  '................',
  '................',
  '.....bbbbbb.....',
  '.t..bbbbbb..t...',
  '..t.bbeebbee.t..',
  '..tbbbeebbeebt..',
  '...tbbbbbbbt....',
  '...tbmmmmbt.....',
  '..t..bbbbb..t...',
  '.t....bbb....t..',
  '................',
  '................',
  '................',
  '................',
  '................',
])

const ART_SKELETON = mkFrames([
  '................',
  '....ssssss......',
  '...ssssssss.....',
  '..ssssssssss....',
  '..sseesseess....',
  '..ssssssssss....',
  '...sssmmsss.....',
  '....ssssss......',
  '.....ssss.......',
  '....ssssss......',
  '...s.ssss.s.....',
  '....ssssss......',
  '.....s..s.......',
  '....ss..ss......',
  '................',
  '................',
])

const ART_GHOST = mkFrames([
  '................',
  '................',
  '....bbbbbb......',
  '...bbbbbbbb.....',
  '..bbbbbbbbbb....',
  '..bbeebbeebb....',
  '..bbeebbeebb....',
  '..bbbbbbbbbb....',
  '..bbbbmmbbbb....',
  '..bbbbbbbbbb....',
  '..bbbbbbbbbb....',
  '..bb.bb.bb.b....',
  '................',
  '................',
  '................',
  '................',
])

const ART_ZOMBIE = mkFrames([
  '................',
  '....bbbbbb......',
  '...bbbbbbbb.....',
  '..bbbbbbbbbb....',
  '..bbeebbeebb....',
  '..bbbbbbbbbb....',
  '..bbbbmmmmbb....',
  '...bbbbbbbb.....',
  '....BBBBB.......',
  '...BBBBBBB......',
  '..bBBBBBBb......',
  '...BBBBBB.......',
  '....BB.BB.......',
  '....oo.oo.......',
  '................',
  '................',
])

const ART_GOLEM = mkFrames([
  '................',
  '...bbbbbbbb.....',
  '..bbbbbbbbbb....',
  '..bbbbbbbbbb....',
  '..bbeebbeebb....',
  '..bbbbbbbbbb....',
  '..bbbbmmmmbb....',
  '..bbbbbbbbbb....',
  '...BBBBBBBB.....',
  '..BBBBBBBBBB....',
  '..BBBBBBBBBB....',
  '...BBBBBB.......',
  '....BB.BB.......',
  '....oo.oo.......',
  '................',
  '................',
])

const ART_IMP = mkFrames([
  '................',
  '...h......h.....',
  '...hh....hh.....',
  '....bbbbbb......',
  '...bbbbbbbb.....',
  '..bbeebbeebb....',
  '..bbeebbeebb....',
  '..bbbbbbbbbb....',
  '..bbbbmmmmbb....',
  '...bbbbbbbb.....',
  '....bbbbbb......',
  '....bb..bb......',
  '....oo..oo......',
  '................',
  '................',
  '................',
])

const ART_HOUND = mkFrames([
  '................',
  '................',
  '.hh.............',
  '.bbbb...........',
  '.bbbbbb.........',
  '.bbeebbb........',
  '.bbeebbbb.......',
  '.bmmmmbbb.bbb...',
  '..bbbbbbbbbbb...',
  '...bbbbbbbb.....',
  '...b.b..b.......',
  '...oo..oo.......',
  '................',
  '................',
  '................',
  '................',
])

const ART_HARPY = mkFrames([
  '................',
  '.....bbbb.......',
  '....bbbbbb......',
  '...bbbbbbbb.....',
  '..bbbeebbeebbb..',
  '..bbbbbbbbbbb...',
  '...bbbbmbbb.....',
  '..wwbbbbbbww....',
  '.wwwbbbbbbwww...',
  '....bbbbbb......',
  '.....bbbb.......',
  '....tt..tt......',
  '................',
  '................',
  '................',
  '................',
])

const ART_SPRITE = mkFrames([
  '................',
  '................',
  '...ww....ww.....',
  '....ww..ww......',
  '.....bbbb.......',
  '....bbbbbb......',
  '....bbeebb......',
  '....bbeebb......',
  '.....bbbb.......',
  '....gbbbbg......',
  '.....bbbb.......',
  '.....g..g.......',
  '................',
  '................',
  '................',
  '................',
])

const ART_CULTIST = mkFrames([
  '................',
  '.....aaaa.......',
  '...aaaaaaaa.....',
  '..aaaaaaaaaa....',
  '..aaeebbeeaa....',
  '..aaeebbeeaa....',
  '..aaaaaaaaaa....',
  '..aaaaaaaaaa....',
  '...bbbbbbbb.....',
  '...bbbbbbbb.....',
  '..bbbbbbbb......',
  '..bbbbbbbb......',
  '....b..b........',
  '....oo.oo.......',
  '................',
  '................',
])

const ART_SERPENT = mkFrames([
  '................',
  '................',
  '................',
  '..bbb...........',
  '.bbbbbb.........',
  '.bbeebbbb.......',
  '.bbbbbbbb.......',
  '..bmmmbb........',
  '..bbbbbb........',
  '...bbbbb.bb.....',
  '....bbbbbbb.....',
  '.....bbbb.......',
  '................',
  '................',
  '................',
  '................',
])

const ART_BLOB = mkFrames([
  '................',
  '................',
  '.....bbbbbb.....',
  '....bbbbbbbb....',
  '...bbbbbbbbbb...',
  '..bbeebbbbeebb..',
  '..bbbbbbbbbbbb..',
  '..bbbbbeebbbbb..',
  '.bbbbbbbbbbbb...',
  '.bbbbmmmmmmbb...',
  '..bbbbbbbbbbb...',
  '..ttt.tt.ttt....',
  '................',
  '................',
  '................',
  '................',
])

const ART_CTHULHU = mkFrames([
  '................',
  '..ww......ww....',
  '...bbbbbbbb.....',
  '..bbbbbbbbbb....',
  '..bbeebbeebb....',
  '..bbeebbeebb....',
  '..bbbbbbbbbb....',
  '..bbttttttbb....',
  '..bttmtmmttb....',
  '..bbbbbbbbbb....',
  '...bbbbbbbb.....',
  '....bbbbbb......',
  '....tt..tt......',
  '................',
  '................',
  '................',
])

const ART_FISH = mkFrames([
  '................',
  '................',
  '................',
  '....bbbbbb......',
  '..bbbbbbbbb.....',
  '.bbbeebbbbbb....',
  '.bbbeebbbbb.g...',
  '.bmmmmbbbbb.gg..',
  '.bbbbbbbbbb.g...',
  '..bbbbbbbbb.....',
  '....bbbbbb......',
  '....ttttt.......',
  '................',
  '................',
  '................',
  '................',
])

const ART_WENDIGO = mkFrames([
  '...h......h.....',
  '...hhh..hhh.....',
  '....hhhhhh......',
  '....bbbbbb......',
  '...bbbbbbbb.....',
  '..bbeebbeebb....',
  '..bbeebbeebb....',
  '..bbbbmmmmbb....',
  '...bbbbbbbb.....',
  '....bbbbbb......',
  '....b....b......',
  '....b....b......',
  '....tt..tt......',
  '................',
  '................',
  '................',
])

const ART_FLAME = mkFrames([
  '......g.........',
  '.....g.g........',
  '.....ggg...g....',
  '....ggggg..g....',
  '....bbbbbb......',
  '...bbbbbbbb.....',
  '..bbeebbeebb....',
  '..bbeebbeebb....',
  '..bbbbbbbbbb....',
  '..bbbbmmmmbb....',
  '...bbbbbbbb.....',
  '...gggggggg.....',
  '................',
  '................',
  '................',
  '................',
])

const ART_ROBE = mkFrames([
  '................',
  '.....aaaaa......',
  '....aaaaaaa.....',
  '..aaaaaaaaaa....',
  '..aaaaaaaaaa....',
  '..aaeeeeeeaa....',
  '..aaeeeeeeaa....',
  '..aaaaaaaaaa....',
  '..bbbbbbbbbb....',
  '..bbbbbbbbbb....',
  '..bbbbbbbbbb....',
  '..bbbbbbbbbb....',
  '................',
  '................',
  '................',
  '................',
])

const ART_DARKMAN = mkFrames([
  '................',
  '....bbbbbb......',
  '...bbbbbbbb.....',
  '..bbbbbbbbbb....',
  '..bbeebbeebb....',
  '..bbeebbeebb....',
  '..bbbbbbbbbb....',
  '...bbbbbbbb.....',
  '....BBBBBB......',
  '...BBBBBBBB.....',
  '..gBBBBBBBg.....',
  '...BBBBBB.......',
  '....BB.BB.......',
  '....oo.oo.......',
  '................',
  '................',
])

const ART_GOAT = mkFrames([
  '................',
  '..hh......hh....',
  '..hhh....hhh....',
  '...bbbbbbbb.....',
  '..bbbbbbbbbb....',
  '..bbeebbeebb....',
  '..bbeebbeebb....',
  '..bbbbmmmmbb....',
  '..bbbbbbbbbb....',
  '...bbbbbbbb.....',
  '....bbbbbb......',
  '....tt..tt......',
  '................',
  '................',
  '................',
  '................',
])

const ART_MUMMY = mkFrames([
  '................',
  '....bbbbbb......',
  '...bbbbbbbb.....',
  '..bbbbbbbbbb....',
  '..bbeebbeebb....',
  '..bbbbbbbbbb....',
  '..bbbbbbbbbb....',
  '...bbbbbbbb.....',
  '....bbbbbb......',
  '...bbbbbbbb.....',
  '...bbbbbbb......',
  '....bbbbb.......',
  '....b...b.......',
  '....oo.oo.......',
  '................',
  '................',
])

const ART_EYE = mkFrames([
  '................',
  '................',
  '....bbbbbb......',
  '..bbbbbbbbbb....',
  '.bbbbbbbbbbbb...',
  '.bbeeeeeeeebb...',
  '.bbeeppppeebb...',
  '.bbeeeeeeeebb...',
  '.bbbbbbbbbbbb...',
  '..bbbbbbbbbb....',
  '....bbbbbb......',
  '...ttt..ttt.....',
  '................',
  '................',
  '................',
  '................',
])

const ART_ORBS = mkFrames([
  '................',
  '................',
  '...g........g...',
  '.....bbbbbb.....',
  '....bbbbbbbb..g.',
  '..gbbeebbeebb...',
  '...bbeebbeebb...',
  '...bbbbbbbbbb.g.',
  '..g.bbbmmbbb....',
  '....bbbbbbbb....',
  '.....bbbbbb.g...',
  '......g.........',
  '................',
  '................',
  '................',
  '................',
])

const ART_CHAOS = mkFrames([
  '................',
  '................',
  '....bbbbbbbb....',
  '..bbbbbbbbbbb...',
  '..bbeebbbeebb...',
  '..bbbbbbbbbbb...',
  '.bbbeebbbbbbbb..',
  '.bbbbbbbbbbb....',
  '.bbbbmmmmmbbb...',
  '..bbbbbbbbbbb...',
  '..ttt.ttt.ttt...',
  '................',
  '................',
  '................',
  '................',
  '................',
])

const ART_FROG = mkFrames([
  '................',
  '...ee....ee.....',
  '..ebbe..ebbe....',
  '..bbbbbbbbbb....',
  '.bbbbbbbbbbbb...',
  '.bbbbbbbbbbbb...',
  '.bbmmmmmmmmbb...',
  '.bbbbbbbbbbbb...',
  '..bbbbbbbbbb....',
  '...bbbbbbbb.....',
  '....tt..tt......',
  '................',
  '................',
  '................',
  '................',
  '................',
])

const ART_BALROG = mkFrames([
  '..hh......hh....',
  '..hhh....hhh....',
  '...bbbbbbbb.....',
  '..bbbbbbbbbb....',
  '..bbeebbeebb....',
  '..bbeebbeebb....',
  '.wbbbbmmmmbbbw..',
  '.wwbbbbbbbbww...',
  '.wwbbbbbbbbww...',
  '..bbbbbbbbbb....',
  '...bbbbbbbb.....',
  '....tt..tt......',
  '................',
  '................',
  '................',
  '................',
])

// ═══════════════ 怪物 id 登记表（每个 id 唯一对应，新增怪物在此登记）═══════════════

export interface MonsterSpriteDef { art: PixelArt; palette: Record<string, string> }

const M = (w: number, h: number, frames: string[][], palette: Record<string, string>): MonsterSpriteDef =>
  ({ art: { w, h, frames, palette }, palette })

const DEFAULT_PALETTE: Record<string, string> = {
  o: '#2A2420', m: '#3A2020', p: '#1A0E14', g: '#F0D878', w: '#6B6560',
  h: '#8A8078', t: '#3A3A44', B: '#4A4A55', s: '#D8D0C0', a: '#4A4A5E', e: '#F5E6C8', b: '#5A5A6E',
}

const def = (frames: string[][], palette: Record<string, string>): MonsterSpriteDef => {
  const merged = { ...DEFAULT_PALETTE, ...palette }
  return { art: { w: 16, h: 16, frames, palette: merged }, palette: merged }
}

export const MONSTER_SPRITES: Record<string, MonsterSpriteDef> = {
  // ── 矿洞系 ──
  bat_cave:        def(ART_BAT,     { b: '#5E5470', e: '#F5E6C8', p: '#1A0E14', m: '#C2543A', w: '#3A3244' }),
  miner_corrupted: def(ART_ZOMBIE,  { b: '#7A8A5E', B: '#5A6B45', e: '#F5E6C8', p: '#C2503A', m: '#3A2E22' }),
  spider_giant:    def(ART_SPIDER,  { b: '#4A3A52', e: '#F5E6C8', p: '#C2503A', m: '#2A1E30', t: '#35283C' }),
  slime_toxic:     def(ART_SLIME,   { b: '#5E9A3C', e: '#F5E6C8', p: '#1A0E14', m: '#2E5018' }),
  skeleton:        def(ART_SKELETON,{ s: '#D8D0C0', e: '#F5E6C8', p: '#C2503A', m: '#3A3630' }),
  ghost:           def(ART_GHOST,   { b: '#B8C4D0', e: '#58A6FF', p: '#1A0E14', m: '#6A7A8A' }),
  zombie:          def(ART_ZOMBIE,  { b: '#7A8A5E', B: '#4E5E3A', e: '#F5E6C8', p: '#C2503A', m: '#3A2E22' }),
  boss_golem_ore:  def(ART_GOLEM,   { b: '#7A7A88', B: '#55555F', e: '#C9A84C', p: '#F0D878' }),
  // ── 熔岩系 ──
  flame_imp:       def(ART_IMP,     { b: '#C2543A', e: '#F0D878', p: '#1A0E14', m: '#7A2E1E', h: '#E8A04C', t: '#7A2E1E' }),
  lava_hound:      def(ART_HOUND,   { b: '#8A3A2A', e: '#F0D878', p: '#1A0E14', m: '#E86A3A', h: '#4A2018' }),
  magma_slug:      def(ART_SLIME,   { b: '#B04A2E', e: '#F0D878', p: '#1A0E14', m: '#5E2010' }),
  ash_wraith:      def(ART_GHOST,   { b: '#6B6560', e: '#E86A3A', p: '#1A0E14', m: '#3A3630' }),
  fire_elemental:  def(ART_FLAME,   { b: '#E86A3A', g: '#F0A04C', e: '#FFF3C0', p: '#C2503A', m: '#7A2E1E' }),
  obsidian_golem:  def(ART_GOLEM,   { b: '#3A3440', B: '#241F2A', e: '#E86A3A', p: '#F0A04C' }),
  cinder_spider:   def(ART_SPIDER,  { b: '#5E3020', e: '#F0D878', p: '#C2503A', m: '#3A1E12', t: '#422214' }),
  boss_balrog:     def(ART_BALROG,  { b: '#6E2418', e: '#F0D878', p: '#1A0E14', m: '#F0A04C', h: '#2A1210', w: '#3A1610', g: '#E86A3A', t: '#2A1210' }),
  // ── 冰法系 ──
  frost_wolf:      def(ART_HOUND,   { b: '#8AA8C0', e: '#F5E6C8', p: '#1A0E14', m: '#4A6A88', h: '#E8F0F8' }),
  ice_sprite:      def(ART_SPRITE,  { b: '#A8D8E8', e: '#1A4A6A', p: '#0E2A3A', g: '#E8F8FF', w: '#D8F0F8' }),
  frozen_zombie:   def(ART_ZOMBIE,  { b: '#7A9AB0', B: '#54708A', e: '#F5E6C8', p: '#58A6FF', m: '#2A3A48' }),
  snow_harpy:      def(ART_HARPY,   { b: '#C8D8E8', e: '#58A6FF', p: '#1A0E14', m: '#6A8AA8', w: '#98B8D8', t: '#4A6A88' }),
  ice_golem:       def(ART_GOLEM,   { b: '#88B8D8', B: '#5A8AB0', e: '#E8F8FF', p: '#1A4A6A' }),
  frost_mage_cultist: def(ART_CULTIST, { a: '#3A5A7A', b: '#54708A', e: '#58C6FF' }),
  glacier_serpent: def(ART_SERPENT, { b: '#6BA8C9', e: '#F5E6C8', p: '#0E2A3A', m: '#3A6A8A' }),
  // ── 虚空系 ──
  void_crawler:    def(ART_BLOB,    { b: '#4A3A5E', e: '#A371F7', p: '#1A0E14', m: '#241A30', t: '#342545' }),
  shadow_stalker:  def(ART_GHOST,   { b: '#3A3450', e: '#A371F7', p: '#E8D8FF', m: '#1A1424' }),
  void_priest:     def(ART_CULTIST, { a: '#342545', b: '#4A3A5E', e: '#A371F7' }),
  chaos_spawn:     def(ART_BLOB,    { b: '#5E3A5A', e: '#E87AC9', p: '#1A0E14', m: '#301E2E', t: '#422840' }),
  void_devourer:   def(ART_BLOB,    { b: '#3A2A50', e: '#C9A84C', p: '#1A0E14', m: '#18101F', t: '#241A30' }),
  rift_phantom:    def(ART_GHOST,   { b: '#4A5A7A', e: '#79C0FF', p: '#E8F0FF', m: '#2A3444' }),
  entropy_horror:  def(ART_CHAOS,   { b: '#4A3454', e: '#A371F7', p: '#1A0E14', m: '#E87AC9', t: '#2E2036' }),
  // ── 守序深渊 Boss ──
  boss_dagon:      def(ART_FISH,    { b: '#3A6E5A', g: '#2E5646', e: '#F0D878', p: '#1A0E14', m: '#24443A', t: '#2E5646' }),
  boss_ithaqua:    def(ART_WENDIGO, { b: '#7A9AB8', e: '#58C6FF', p: '#0E2A3A', m: '#2A3A4A', h: '#D8ECF8', t: '#54708A' }),
  boss_cthugha:    def(ART_FLAME,   { b: '#C2503A', g: '#E8A04C', e: '#FFF3C0', p: '#7A2E1E', m: '#5E1E10' }),
  boss_hastur:     def(ART_ROBE,    { a: '#C9A84C', b: '#8A743A', e: '#F0D878', p: '#1A0E14' }),
  boss_nyarl:      def(ART_DARKMAN, { b: '#2A2430', B: '#1A1620', e: '#C2503A', p: '#F0D878', g: '#4A3A5E' }),
  boss_shub:       def(ART_GOAT,    { b: '#3A2E3A', e: '#A371F7', p: '#1A0E14', m: '#241A24', h: '#6B5A4A', t: '#2A2129' }),
  boss_gatanothoa: def(ART_MUMMY,   { b: '#8A8268', e: '#C2503A', p: '#1A0E14' }),
  boss_cyaegha:    def(ART_EYE,     { b: '#3A2E4A', e: '#D8C8E8', p: '#A371F7', t: '#241A30' }),
  boss_yog:        def(ART_ORBS,    { b: '#2E3450', e: '#79C0FF', p: '#0E1A2A', m: '#1A2030', g: '#A371F7', t: '#1E2438' }),
  boss_azathoth:   def(ART_CHAOS,   { b: '#3A2444', e: '#E87AC9', p: '#F0D878', m: '#A371F7', t: '#241430' }),
  // ── 每周挑战 Boss ──
  wboss_cthulhu:   def(ART_CTHULHU, { b: '#3A5E4A', e: '#F0D878', p: '#1A0E14', m: '#24443A', t: '#2E4A3C', w: '#243830' }),
  wboss_tsath:     def(ART_FROG,    { b: '#5E5A3A', e: '#F0D878', p: '#1A0E14', m: '#3A3624', t: '#444024' }),
  wboss_yig:       def(ART_SERPENT, { b: '#4A6E3A', e: '#F0D878', p: '#1A0E14', m: '#2E4424' }),
  wboss_atlach:    def(ART_SPIDER,  { b: '#5A4A6E', e: '#E87AC9', p: '#1A0E14', m: '#3A2E48', t: '#443852' }),
}

// ─── 兜底：未登记 id 按哈希确定性分配（保证新怪物永不串图）───
const FALLBACK: Array<[string[][], Record<string, string>]> = [
  [ART_BLOB,    { b: '#5A5A6E', e: '#F5E6C8', p: '#1A0E14', m: '#2A2A36', t: '#3A3A48' }],
  [ART_GHOST,   { b: '#6E7A8A', e: '#F5E6C8', p: '#1A0E14', m: '#3A4450' }],
  [ART_SERPENT, { b: '#5E7A4A', e: '#F5E6C8', p: '#1A0E14', m: '#38482A' }],
]

function hashStr(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return Math.abs(h)
}

/** 取怪物像素精灵：优先登记表（含前缀匹配 Boss 动态 id），否则哈希兜底 */
export function getMonsterSprite(id: string): MonsterSpriteDef {
  if (MONSTER_SPRITES[id]) return MONSTER_SPRITES[id]
  // 守序深渊 Boss 运行时 id 可能带层数后缀，做前缀匹配
  for (const key of Object.keys(MONSTER_SPRITES)) {
    if (id.startsWith(key)) return MONSTER_SPRITES[key]
  }
  const [frames, palette] = FALLBACK[hashStr(id) % FALLBACK.length]
  return def(frames, palette)
}
