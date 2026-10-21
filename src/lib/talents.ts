// ═══ 天赋树系统（暗黑式） ═══
// 每个职业 3 个分支，每分支 6 层节点，每节点最高 5 级（全满需 90 点）
// 每升 1 级获得 1 点天赋点；节点效果复用战斗词条键，无需改动战斗引擎

export interface TalentNode {
  id: string
  tier: number          // 1-6，层数越深越强
  name: string
  desc: string          // 每级效果描述
  maxRank: number
  effect: Record<string, number> // 每级效果（百分比点数 / 固定值）
}

export interface TalentBranch {
  id: string
  name: string
  theme: string         // 分支主题色
  nodes: TalentNode[]
}

const node = (id: string, tier: number, name: string, desc: string, effect: Record<string, number>, maxRank = 5): TalentNode =>
  ({ id, tier, name, desc, effect, maxRank })

export const TALENT_TREES: Record<string, TalentBranch[]> = {
  warrior: [
    { id: 'berserk', name: '狂战', theme: '#F85149', nodes: [
      node('w_b1', 1, '嗜血', '攻击力 +2%', { atkPct: 2 }),
      node('w_b2', 2, '弱点洞悉', '暴击率 +2%', { critRate: 2 }),
      node('w_b3', 3, '撕裂重击', '暴击伤害 +6%', { critDmg: 6 }),
      node('w_b4', 4, '血怒', '吸血 +1%', { lifesteal: 1 }),
      node('w_b5', 5, '狂暴', '攻击力 +3%，暴击率 +1%', { atkPct: 3, critRate: 1 }),
      node('w_b6', 6, '战神降临', '攻击力 +5%，暴击伤害 +5%', { atkPct: 5, critDmg: 5 }),
    ]},
    { id: 'guard', name: '铁壁', theme: '#58A6FF', nodes: [
      node('w_g1', 1, '坚韧', '防御力 +3%', { defPct: 3 }),
      node('w_g2', 2, '石肤', '物理减伤 +2%', { physRes: 2 }),
      node('w_g3', 3, '反甲', '反弹伤害 +3%', { reflect: 3 }),
      node('w_g4', 4, '不屈', '魔法防御 +3%', { mdefPct: 3 }),
      node('w_g5', 5, '魔法抗性', '魔法减伤 +2%，魔法防御 +2%', { magRes: 2, mdefPct: 2 }),
      node('w_g6', 6, '不动如山', '防御力 +5%，物理减伤 +2%', { defPct: 5, physRes: 2 }),
    ]},
    { id: 'warcry', name: '战意', theme: '#C9A84C', nodes: [
      node('w_c1', 1, '历练', '经验获取 +3%', { expGain: 3 }),
      node('w_c2', 2, '掠夺', '金币获取 +5%', { goldGain: 5 }),
      node('w_c3', 3, '战吼', '攻击力 +2%，防御力 +2%', { atkPct: 2, defPct: 2 }),
      node('w_c4', 4, '凯旋', '击杀回复生命 +2', { killHeal: 2 }),
      node('w_c5', 5, '士气如虹', '经验获取 +3%，金币获取 +3%', { expGain: 3, goldGain: 3 }),
      node('w_c6', 6, '百战余生', '击杀回复生命 +3，击杀回复法力 +2', { killHeal: 3, killMp: 2 }),
    ]},
  ],
  mage: [
    { id: 'element', name: '元素', theme: '#F85149', nodes: [
      node('m_e1', 1, '元素亲和', '魔法力 +2%', { magPct: 2 }),
      node('m_e2', 2, '元素增幅', '元素伤害 +3%', { elemDmg: 3 }),
      node('m_e3', 3, '奥术暴击', '暴击率 +2%', { critRate: 2 }),
      node('m_e4', 4, '毁灭咏唱', '暴击伤害 +6%', { critDmg: 6 }),
      node('m_e5', 5, '元素掌控', '元素伤害 +3%，魔法力 +2%', { elemDmg: 3, magPct: 2 }),
      node('m_e6', 6, '大魔导师', '魔法力 +5%，暴击伤害 +5%', { magPct: 5, critDmg: 5 }),
    ]},
    { id: 'arcane', name: '秘法', theme: '#BC8CFF', nodes: [
      node('m_a1', 1, '魔法屏障', '魔法防御 +3%', { mdefPct: 3 }),
      node('m_a2', 2, '精神护壁', '魔法减伤 +2%', { magRes: 2 }),
      node('m_a3', 3, '法力回流', '击杀回复法力 +2', { killMp: 2 }),
      node('m_a4', 4, '奥术强化', '魔法力 +3%', { magPct: 3 }),
      node('m_a5', 5, '法力护盾', '魔法减伤 +2%，物理减伤 +1%', { magRes: 2, physRes: 1 }),
      node('m_a6', 6, '秘法之心', '击杀回复法力 +3，魔法力 +3%', { killMp: 3, magPct: 3 }),
    ]},
    { id: 'wisdom', name: '启迪', theme: '#C9A84C', nodes: [
      node('m_w1', 1, '求知', '经验获取 +3%', { expGain: 3 }),
      node('m_w2', 2, '炼金', '金币获取 +5%', { goldGain: 5 }),
      node('m_w3', 3, '冥想', '击杀回复法力 +1，击杀回复生命 +1', { killMp: 1, killHeal: 1 }),
      node('m_w4', 4, '智者', '魔法力 +2%，经验获取 +3%', { magPct: 2, expGain: 3 }),
      node('m_w5', 5, '博学者', '经验获取 +4%', { expGain: 4 }),
      node('m_w6', 6, '贤者', '魔法力 +3%，金币获取 +5%', { magPct: 3, goldGain: 5 }),
    ]},
  ],
  assassin: [
    { id: 'lethal', name: '致命', theme: '#F85149', nodes: [
      node('a_l1', 1, '淬毒利刃', '攻击力 +2%', { atkPct: 2 }),
      node('a_l2', 2, '背刺', '暴击率 +3%', { critRate: 3 }),
      node('a_l3', 3, '处决', '暴击伤害 +7%', { critDmg: 7 }),
      node('a_l4', 4, '饮血', '吸血 +1%', { lifesteal: 1 }),
      node('a_l5', 5, '冷血', '暴击率 +2%，暴击伤害 +4%', { critRate: 2, critDmg: 4 }),
      node('a_l6', 6, '死神之舞', '攻击力 +5%，吸血 +2%', { atkPct: 5, lifesteal: 2 }),
    ]},
    { id: 'phantom', name: '幻影', theme: '#58A6FF', nodes: [
      node('a_p1', 1, '灵巧身法', '防御力 +2%', { defPct: 2 }),
      node('a_p2', 2, '烟雾庇护', '物理减伤 +2%', { physRes: 2 }),
      node('a_p3', 3, '魔法斗篷', '魔法减伤 +2%', { magRes: 2 }),
      node('a_p4', 4, '暗影反制', '反弹伤害 +3%', { reflect: 3 }),
      node('a_p5', 5, '虚幻步伐', '物理减伤 +1%，魔法减伤 +1%', { physRes: 1, magRes: 1 }),
      node('a_p6', 6, '幽影化身', '防御力 +5%，反弹伤害 +3%', { defPct: 5, reflect: 3 }),
    ]},
    { id: 'hunter', name: '猎手', theme: '#C9A84C', nodes: [
      node('a_h1', 1, '赏金', '金币获取 +5%', { goldGain: 5 }),
      node('a_h2', 2, '追踪', '经验获取 +3%', { expGain: 3 }),
      node('a_h3', 3, '收割', '击杀回复生命 +2', { killHeal: 2 }),
      node('a_h4', 4, '猎杀本能', '攻击力 +2%，暴击率 +1%', { atkPct: 2, critRate: 1 }),
      node('a_h5', 5, '无情追猎', '经验获取 +3%，金币获取 +3%', { expGain: 3, goldGain: 3 }),
      node('a_h6', 6, '传奇猎手', '攻击力 +3%，击杀回复生命 +2', { atkPct: 3, killHeal: 2 }),
    ]},
  ],
  ranger: [
    { id: 'marksman', name: '神射', theme: '#F85149', nodes: [
      node('r_m1', 1, '强弓', '攻击力 +2%', { atkPct: 2 }),
      node('r_m2', 2, '鹰眼', '暴击率 +2%', { critRate: 2 }),
      node('r_m3', 3, '元素箭矢', '元素伤害 +3%', { elemDmg: 3 }),
      node('r_m4', 4, '穿甲一击', '暴击伤害 +6%', { critDmg: 6 }),
      node('r_m5', 5, '连珠箭', '攻击力 +2%，暴击率 +2%', { atkPct: 2, critRate: 2 }),
      node('r_m6', 6, '一箭穿心', '攻击力 +4%，暴击伤害 +6%', { atkPct: 4, critDmg: 6 }),
    ]},
    { id: 'survival', name: '生存', theme: '#3FB950', nodes: [
      node('r_s1', 1, '皮甲精通', '防御力 +2%', { defPct: 2 }),
      node('r_s2', 2, '野外求生', '物理减伤 +2%', { physRes: 2 }),
      node('r_s3', 3, '自然抗性', '魔法减伤 +2%', { magRes: 2 }),
      node('r_s4', 4, '生命汲取', '吸血 +1%', { lifesteal: 1 }),
      node('r_s5', 5, '野性强韧', '防御力 +3%，物理减伤 +1%', { defPct: 3, physRes: 1 }),
      node('r_s6', 6, '丛林之王', '防御力 +4%，吸血 +1%', { defPct: 4, lifesteal: 1 }),
    ]},
    { id: 'tracker', name: '追踪', theme: '#C9A84C', nodes: [
      node('r_t1', 1, '寻路', '经验获取 +3%', { expGain: 3 }),
      node('r_t2', 2, '寻宝', '金币获取 +5%', { goldGain: 5 }),
      node('r_t3', 3, '补给', '击杀回复生命 +2', { killHeal: 2 }),
      node('r_t4', 4, '远行者', '击杀回复法力 +2，经验获取 +2%', { killMp: 2, expGain: 2 }),
      node('r_t5', 5, '猎场主宰', '金币获取 +4%，经验获取 +2%', { goldGain: 4, expGain: 2 }),
      node('r_t6', 6, '深渊向导', '击杀回复生命 +2，击杀回复法力 +2', { killHeal: 2, killMp: 2 }),
    ]},
  ],
  priest: [
    { id: 'holy', name: '神圣', theme: '#F85149', nodes: [
      node('p_h1', 1, '圣光术', '魔法力 +2%', { magPct: 2 }),
      node('p_h2', 2, '神罚', '元素伤害 +3%', { elemDmg: 3 }),
      node('p_h3', 3, '天启', '暴击率 +2%', { critRate: 2 }),
      node('p_h4', 4, '审判', '暴击伤害 +6%', { critDmg: 6 }),
      node('p_h5', 5, '圣光涌动', '魔法力 +2%，元素伤害 +2%', { magPct: 2, elemDmg: 2 }),
      node('p_h6', 6, '神圣化身', '魔法力 +5%，暴击伤害 +5%', { magPct: 5, critDmg: 5 }),
    ]},
    { id: 'blessing', name: '庇佑', theme: '#58A6FF', nodes: [
      node('p_b1', 1, '守护祝福', '魔法防御 +3%', { mdefPct: 3 }),
      node('p_b2', 2, '圣盾', '魔法减伤 +2%', { magRes: 2 }),
      node('p_b3', 3, '坚韧祷言', '物理减伤 +2%', { physRes: 2 }),
      node('p_b4', 4, '神圣庇护', '防御力 +3%', { defPct: 3 }),
      node('p_b5', 5, '光之壁垒', '物理减伤 +1%，魔法减伤 +1%', { physRes: 1, magRes: 1 }),
      node('p_b6', 6, '神恩护体', '防御力 +4%，魔法防御 +4%', { defPct: 4, mdefPct: 4 }),
    ]},
    { id: 'grace', name: '恩惠', theme: '#C9A84C', nodes: [
      node('p_g1', 1, '治愈祷言', '击杀回复生命 +3', { killHeal: 3 }),
      node('p_g2', 2, '法力赐福', '击杀回复法力 +2', { killMp: 2 }),
      node('p_g3', 3, '传道', '经验获取 +3%', { expGain: 3 }),
      node('p_g4', 4, '奉献', '金币获取 +5%', { goldGain: 5 }),
      node('p_g5', 5, '慈爱', '击杀回复生命 +2，击杀回复法力 +1', { killHeal: 2, killMp: 1 }),
      node('p_g6', 6, '神迹', '经验获取 +4%，金币获取 +4%', { expGain: 4, goldGain: 4 }),
    ]},
  ],
  warlock: [
    { id: 'ruin', name: '毁灭', theme: '#F85149', nodes: [
      node('k_r1', 1, '暗影箭', '魔法力 +2%', { magPct: 2 }),
      node('k_r2', 2, '腐蚀', '元素伤害 +3%', { elemDmg: 3 }),
      node('k_r3', 3, '灾变', '暴击率 +2%', { critRate: 2 }),
      node('k_r4', 4, '末日', '暴击伤害 +7%', { critDmg: 7 }),
      node('k_r5', 5, '湮灭', '魔法力 +2%，暴击率 +2%', { magPct: 2, critRate: 2 }),
      node('k_r6', 6, '虚空领主', '魔法力 +5%，元素伤害 +4%', { magPct: 5, elemDmg: 4 }),
    ]},
    { id: 'curse', name: '诅咒', theme: '#BC8CFF', nodes: [
      node('k_c1', 1, '虚弱诅咒', '魔法防御 +3%', { mdefPct: 3 }),
      node('k_c2', 2, '痛苦诅咒', '魔法减伤 +2%', { magRes: 2 }),
      node('k_c3', 3, '诅咒反噬', '反弹伤害 +3%', { reflect: 3 }),
      node('k_c4', 4, '恶魔皮肤', '防御力 +3%', { defPct: 3 }),
      node('k_c5', 5, '恐惧光环', '物理减伤 +1%，魔法减伤 +1%', { physRes: 1, magRes: 1 }),
      node('k_c6', 6, '魔王威仪', '防御力 +4%，反弹伤害 +3%', { defPct: 4, reflect: 3 }),
    ]},
    { id: 'drain', name: '汲取', theme: '#C9A84C', nodes: [
      node('k_d1', 1, '生命虹吸', '吸血 +1%', { lifesteal: 1 }),
      node('k_d2', 2, '灵魂收割', '击杀回复法力 +2', { killMp: 2 }),
      node('k_d3', 3, '血肉献祭', '击杀回复生命 +2', { killHeal: 2 }),
      node('k_d4', 4, '黑暗交易', '金币获取 +5%', { goldGain: 5 }),
      node('k_d5', 5, '灵魂榨取', '吸血 +1%，击杀回复法力 +1', { lifesteal: 1, killMp: 1 }),
      node('k_d6', 6, '深渊契约', '击杀回复生命 +2，金币获取 +4%', { killHeal: 2, goldGain: 4 }),
    ]},
  ],
}

/** 天赋键分类：战斗修正 vs 收益修正 */
const TALENT_UTILITY_KEYS = ['expGain', 'goldGain', 'killHeal', 'killMp']

export type TalentRanks = Record<string, number> // nodeId -> rank

export interface TalentMods {
  combat: Record<string, number>
  utility: Record<string, number>
}

/** 汇总某职业已点天赋的效果 */
export function getTalentMods(ranks: TalentRanks | undefined, classId: string): TalentMods {
  const combat: Record<string, number> = {}
  const utility: Record<string, number> = {}
  if (!ranks) return { combat, utility }
  const tree = TALENT_TREES[classId] || []
  for (const branch of tree) {
    for (const n of branch.nodes) {
      const r = ranks[n.id] || 0
      if (r <= 0) continue
      for (const [k, v] of Object.entries(n.effect)) {
        const eff = v * r
        if (TALENT_UTILITY_KEYS.includes(k)) utility[k] = (utility[k] || 0) + eff
        else combat[k] = (combat[k] || 0) + eff
      }
    }
  }
  return { combat, utility }
}

/** 合并两组 mods（装备词条 + 天赋） */
export function mergeMods(a: { combat: Record<string, number>; utility: Record<string, number> }, b: TalentMods): TalentMods {
  const combat = { ...a.combat }
  const utility = { ...a.utility }
  for (const [k, v] of Object.entries(b.combat)) combat[k] = (combat[k] || 0) + v
  for (const [k, v] of Object.entries(b.utility)) utility[k] = (utility[k] || 0) + v
  return { combat, utility }
}

/** 已投入的天赋点数 */
export function getSpentTalentPoints(ranks: TalentRanks | undefined): number {
  if (!ranks) return 0
  return Object.values(ranks).reduce((s, r) => s + r, 0)
}

/** 某分支已投入点数（用于层数解锁判定） */
export function getBranchSpent(ranks: TalentRanks | undefined, classId: string, branchId: string): number {
  if (!ranks) return 0
  const branch = (TALENT_TREES[classId] || []).find((b) => b.id === branchId)
  if (!branch) return 0
  return branch.nodes.reduce((s, n) => s + (ranks[n.id] || 0), 0)
}

/** 层数解锁门槛：第 t 层需要本分支已投入 (t-1)×4 点 */
export const tierGate = (tier: number) => (tier - 1) * 4

/** 学习某节点的前置校验，返回 null 表示可学 */
export function canLearnTalent(ranks: TalentRanks | undefined, classId: string, nodeId: string, pointsAvailable: number): string | null {
  const tree = TALENT_TREES[classId] || []
  for (const branch of tree) {
    const n = branch.nodes.find((x) => x.id === nodeId)
    if (!n) continue
    const cur = ranks?.[n.id] || 0
    if (cur >= n.maxRank) return '已满级'
    if (pointsAvailable <= 0) return '天赋点不足'
    const need = tierGate(n.tier)
    if (getBranchSpent(ranks, classId, branch.id) < need) return `需要在该分支投入 ${need} 点`
    return null
  }
  return '天赋不存在'
}

/** 洗点费用（金币） */
export const getRespecCost = (level: number) => Math.max(500, level * 100)

export const TALENT_NODE_DESC_KEYS: Record<string, string> = {
  atkPct: '攻击力', defPct: '防御力', magPct: '魔法力', mdefPct: '魔法防御',
  critRate: '暴击率', critDmg: '暴击伤害', lifesteal: '吸血', reflect: '反弹伤害',
  elemDmg: '元素伤害', physRes: '物理减伤', magRes: '魔法减伤',
  expGain: '经验获取', goldGain: '金币获取', killHeal: '击杀回复生命', killMp: '击杀回复法力',
}
