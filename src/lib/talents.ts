// ═══ 天赋树系统（暗黑式） ═══
// 每个职业 3 个分支，每分支 4 层节点；每升 1 级获得 1 点天赋点
// 节点效果复用战斗词条键（atkPct/critRate/lifesteal 等），无需改动战斗引擎

export interface TalentNode {
  id: string
  tier: number          // 1-4，层数越深越强
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

const node = (id: string, tier: number, name: string, desc: string, effect: Record<string, number>, maxRank = 3): TalentNode =>
  ({ id, tier, name, desc, effect, maxRank })

export const TALENT_TREES: Record<string, TalentBranch[]> = {
  warrior: [
    { id: 'berserk', name: '狂战', theme: '#F85149', nodes: [
      node('w_b1', 1, '嗜血', '攻击力 +3%', { atkPct: 3 }),
      node('w_b2', 2, '弱点洞悉', '暴击率 +3%', { critRate: 3 }),
      node('w_b3', 3, '撕裂重击', '暴击伤害 +8%', { critDmg: 8 }),
      node('w_b4', 4, '血怒', '吸血 +2%', { lifesteal: 2 }),
    ]},
    { id: 'guard', name: '铁壁', theme: '#58A6FF', nodes: [
      node('w_g1', 1, '坚韧', '防御力 +4%', { defPct: 4 }),
      node('w_g2', 2, '石肤', '物理减伤 +3%', { physRes: 3 }),
      node('w_g3', 3, '反甲', '反弹伤害 +4%', { reflect: 4 }),
      node('w_g4', 4, '不屈', '魔法防御 +5%', { mdefPct: 5 }),
    ]},
    { id: 'warcry', name: '战意', theme: '#C9A84C', nodes: [
      node('w_c1', 1, '历练', '经验获取 +5%', { expGain: 5 }),
      node('w_c2', 2, '掠夺', '金币获取 +8%', { goldGain: 8 }),
      node('w_c3', 3, '战吼', '攻击力 +2%，防御力 +2%', { atkPct: 2, defPct: 2 }),
      node('w_c4', 4, '凯旋', '击杀回复生命 +4', { killHeal: 4 }),
    ]},
  ],
  mage: [
    { id: 'element', name: '元素', theme: '#F85149', nodes: [
      node('m_e1', 1, '元素亲和', '魔法力 +3%', { magPct: 3 }),
      node('m_e2', 2, '元素增幅', '元素伤害 +5%', { elemDmg: 5 }),
      node('m_e3', 3, '奥术暴击', '暴击率 +3%', { critRate: 3 }),
      node('m_e4', 4, '毁灭咏唱', '暴击伤害 +8%', { critDmg: 8 }),
    ]},
    { id: 'arcane', name: '秘法', theme: '#BC8CFF', nodes: [
      node('m_a1', 1, '魔法屏障', '魔法防御 +4%', { mdefPct: 4 }),
      node('m_a2', 2, '精神护壁', '魔法减伤 +3%', { magRes: 3 }),
      node('m_a3', 3, '法力回流', '击杀回复法力 +3', { killMp: 3 }),
      node('m_a4', 4, '奥术强化', '魔法力 +5%', { magPct: 5 }),
    ]},
    { id: 'wisdom', name: '启迪', theme: '#C9A84C', nodes: [
      node('m_w1', 1, '求知', '经验获取 +5%', { expGain: 5 }),
      node('m_w2', 2, '炼金', '金币获取 +8%', { goldGain: 8 }),
      node('m_w3', 3, '冥想', '击杀回复法力 +2，回复生命 +2', { killMp: 2, killHeal: 2 }),
      node('m_w4', 4, '智者', '魔法力 +3%，经验获取 +5%', { magPct: 3, expGain: 5 }),
    ]},
  ],
  assassin: [
    { id: 'lethal', name: '致命', theme: '#F85149', nodes: [
      node('a_l1', 1, '淬毒利刃', '攻击力 +3%', { atkPct: 3 }),
      node('a_l2', 2, '背刺', '暴击率 +4%', { critRate: 4 }),
      node('a_l3', 3, '处决', '暴击伤害 +10%', { critDmg: 10 }),
      node('a_l4', 4, '饮血', '吸血 +2%', { lifesteal: 2 }),
    ]},
    { id: 'phantom', name: '幻影', theme: '#58A6FF', nodes: [
      node('a_p1', 1, '灵巧身法', '防御力 +3%', { defPct: 3 }),
      node('a_p2', 2, '烟雾庇护', '物理减伤 +3%', { physRes: 3 }),
      node('a_p3', 3, '魔法斗篷', '魔法减伤 +3%', { magRes: 3 }),
      node('a_p4', 4, '暗影反制', '反弹伤害 +4%', { reflect: 4 }),
    ]},
    { id: 'hunter', name: '猎手', theme: '#C9A84C', nodes: [
      node('a_h1', 1, '赏金', '金币获取 +8%', { goldGain: 8 }),
      node('a_h2', 2, '追踪', '经验获取 +5%', { expGain: 5 }),
      node('a_h3', 3, '收割', '击杀回复生命 +3', { killHeal: 3 }),
      node('a_h4', 4, '猎杀本能', '攻击力 +2%，暴击率 +2%', { atkPct: 2, critRate: 2 }),
    ]},
  ],
  ranger: [
    { id: 'marksman', name: '神射', theme: '#F85149', nodes: [
      node('r_m1', 1, '强弓', '攻击力 +3%', { atkPct: 3 }),
      node('r_m2', 2, '鹰眼', '暴击率 +3%', { critRate: 3 }),
      node('r_m3', 3, '元素箭矢', '元素伤害 +4%', { elemDmg: 4 }),
      node('r_m4', 4, '穿甲一击', '暴击伤害 +8%', { critDmg: 8 }),
    ]},
    { id: 'survival', name: '生存', theme: '#3FB950', nodes: [
      node('r_s1', 1, '皮甲精通', '防御力 +3%', { defPct: 3 }),
      node('r_s2', 2, '野外求生', '物理减伤 +3%', { physRes: 3 }),
      node('r_s3', 3, '自然抗性', '魔法减伤 +3%', { magRes: 3 }),
      node('r_s4', 4, '生命汲取', '吸血 +2%', { lifesteal: 2 }),
    ]},
    { id: 'tracker', name: '追踪', theme: '#C9A84C', nodes: [
      node('r_t1', 1, '寻路', '经验获取 +5%', { expGain: 5 }),
      node('r_t2', 2, '寻宝', '金币获取 +8%', { goldGain: 8 }),
      node('r_t3', 3, '补给', '击杀回复生命 +3', { killHeal: 3 }),
      node('r_t4', 4, '远行者', '击杀回复法力 +2，经验获取 +3%', { killMp: 2, expGain: 3 }),
    ]},
  ],
  priest: [
    { id: 'holy', name: '神圣', theme: '#F85149', nodes: [
      node('p_h1', 1, '圣光术', '魔法力 +3%', { magPct: 3 }),
      node('p_h2', 2, '神罚', '元素伤害 +4%', { elemDmg: 4 }),
      node('p_h3', 3, '天启', '暴击率 +3%', { critRate: 3 }),
      node('p_h4', 4, '审判', '暴击伤害 +8%', { critDmg: 8 }),
    ]},
    { id: 'blessing', name: '庇佑', theme: '#58A6FF', nodes: [
      node('p_b1', 1, '守护祝福', '魔法防御 +4%', { mdefPct: 4 }),
      node('p_b2', 2, '圣盾', '魔法减伤 +3%', { magRes: 3 }),
      node('p_b3', 3, '坚韧祷言', '物理减伤 +3%', { physRes: 3 }),
      node('p_b4', 4, '神圣庇护', '防御力 +4%', { defPct: 4 }),
    ]},
    { id: 'grace', name: '恩惠', theme: '#C9A84C', nodes: [
      node('p_g1', 1, '治愈祷言', '击杀回复生命 +4', { killHeal: 4 }),
      node('p_g2', 2, '法力赐福', '击杀回复法力 +3', { killMp: 3 }),
      node('p_g3', 3, '传道', '经验获取 +5%', { expGain: 5 }),
      node('p_g4', 4, '奉献', '金币获取 +8%', { goldGain: 8 }),
    ]},
  ],
  warlock: [
    { id: 'ruin', name: '毁灭', theme: '#F85149', nodes: [
      node('k_r1', 1, '暗影箭', '魔法力 +3%', { magPct: 3 }),
      node('k_r2', 2, '腐蚀', '元素伤害 +5%', { elemDmg: 5 }),
      node('k_r3', 3, '灾变', '暴击率 +3%', { critRate: 3 }),
      node('k_r4', 4, '末日', '暴击伤害 +10%', { critDmg: 10 }),
    ]},
    { id: 'curse', name: '诅咒', theme: '#BC8CFF', nodes: [
      node('k_c1', 1, '虚弱诅咒', '魔法防御 +4%', { mdefPct: 4 }),
      node('k_c2', 2, '痛苦诅咒', '魔法减伤 +3%', { magRes: 3 }),
      node('k_c3', 3, '诅咒反噬', '反弹伤害 +4%', { reflect: 4 }),
      node('k_c4', 4, '恶魔皮肤', '防御力 +4%', { defPct: 4 }),
    ]},
    { id: 'drain', name: '汲取', theme: '#C9A84C', nodes: [
      node('k_d1', 1, '生命虹吸', '吸血 +2%', { lifesteal: 2 }),
      node('k_d2', 2, '灵魂收割', '击杀回复法力 +3', { killMp: 3 }),
      node('k_d3', 3, '血肉献祭', '击杀回复生命 +3', { killHeal: 3 }),
      node('k_d4', 4, '黑暗交易', '金币获取 +8%', { goldGain: 8 }),
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

/** 学习某节点的前置校验，返回 null 表示可学 */
export function canLearnTalent(ranks: TalentRanks | undefined, classId: string, nodeId: string, pointsAvailable: number): string | null {
  const tree = TALENT_TREES[classId] || []
  for (const branch of tree) {
    const n = branch.nodes.find((x) => x.id === nodeId)
    if (!n) continue
    const cur = ranks?.[n.id] || 0
    if (cur >= n.maxRank) return '已满级'
    if (pointsAvailable <= 0) return '天赋点不足'
    const need = (n.tier - 1) * 3
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
