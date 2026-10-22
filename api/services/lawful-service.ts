// 守序深渊：固定 100 层线性爬塔
// - 每层随机 3 个房间，玩家三选一
// - 每 10 层为 Boss 层（克苏鲁神话系 Boss，带技能）
// - 怪物搭配按玩家职业倾向克制，但数值预算一致保证各职业难度相当
import { getEnemiesByFamily } from "./config-service";

export const LAWFUL_MAX_LAYER = 100;

export interface LawfulEnemy {
  id: string; name: string;
  hp: number; maxHp: number; mp: number; maxMp: number;
  atk: number; def: number; mag: number; mdef: number;
  agi: number; luk: number;
  skills: string[]; element: string; aiType?: string;
  dropTable?: Array<{
    itemId: string; name: string; type: string; chance: number;
    quantityMin: number; quantityMax: number; quality: string; minLayer?: number;
  }>;
}

export interface LawfulRoom {
  id: number;
  name: string;
  desc: string;
  isBoss: boolean;
  enemies: LawfulEnemy[];
}

// ─── 克苏鲁系 Boss（每 10 层一只） ───
const LAWFUL_BOSSES: Array<{
  layer: number; id: string; name: string; title: string; element: string;
  skills: string[]; aiType: string;
}> = [
  { layer: 10,  id: 'boss_dagon',      name: '达贡',            title: '深潜者之王',   element: 'water',  skills: ['toxic_splash', 'web_trap'],                aiType: 'aggressive' },
  { layer: 20,  id: 'boss_ithaqua',    name: '伊塔库亚',         title: '冰风之主',     element: 'ice',    skills: ['ice_lance', 'blizzard', 'frozen_prison'],   aiType: 'aggressive' },
  { layer: 30,  id: 'boss_cthugha',    name: '克图格亚',         title: '燃焰者',       element: 'fire',   skills: ['flame_breath', 'lava_burst', 'heat_wave'],  aiType: 'berserk' },
  { layer: 40,  id: 'boss_hastur',     name: '哈斯塔',           title: '黄衣之王',     element: 'wind',   skills: ['fear', 'whisper', 'void_scream'],           aiType: 'cunning' },
  { layer: 50,  id: 'boss_nyarl',      name: '奈亚拉托提普',     title: '千面之神',     element: 'void',   skills: ['mind_rend', 'shadow_bolt_m', 'fear'],       aiType: 'cunning' },
  { layer: 60,  id: 'boss_shub',       name: '莎布·尼古拉丝',    title: '黑山羊之母',   element: 'earth',  skills: ['poison_bite', 'entropic_field', 'soul_drain'], aiType: 'defensive' },
  { layer: 70,  id: 'boss_gatanothoa', name: '加塔诺托亚',       title: '沉没之厄',     element: 'earth',  skills: ['slam', 'rock_summon', 'enrage'],            aiType: 'berserk' },
  { layer: 80,  id: 'boss_cyaegha',    name: '赛伊格亚',         title: '灵魂吞噬者',   element: 'void',   skills: ['soul_drain', 'void_touch', 'entropic_field'], aiType: 'cunning' },
  { layer: 90,  id: 'boss_yog',        name: '犹格·索托斯',      title: '门之钥',       element: 'void',   skills: ['entropic_field', 'void_scream', 'soul_drain'], aiType: 'defensive' },
  { layer: 100, id: 'boss_azathoth',   name: '阿撒托斯',         title: '盲目愚痴之神', element: 'void',   skills: ['mind_rend', 'void_scream', 'soul_drain', 'entropic_field'], aiType: 'berserk' },
];

export function isBossLayer(layer: number): boolean {
  return layer % 10 === 0;
}

export function getLawfulBoss(layer: number) {
  return LAWFUL_BOSSES.find((b) => b.layer === layer) || null;
}

// ─── 职业克制倾向（数值预算相同，仅风格不同） ───
// warrior→法系虚空怪  mage→高敏物理怪  assassin→高防怪  ranger→近战压制  priest→沉默诅咒  warlock→爆发
const CLASS_COUNTER: Record<string, { family: string; style: string }> = {
  warrior:  { family: 'void',  style: '魔法压制' },
  mage:     { family: 'tomb',  style: '迅捷突袭' },
  assassin: { family: 'cave',  style: '坚壁防守' },
  ranger:   { family: 'magma', style: '近战压制' },
  priest:   { family: 'tomb',  style: '咒文封锁' },
  warlock:  { family: 'ice',   style: '爆发突击' },
}

const FAMILIES = ['cave', 'ice', 'magma', 'void', 'tomb']

/** Boss 宝石掉落轮换 */
const GEM_TYPES = ['ruby', 'sapphire', 'emerald', 'topaz', 'onyx', 'amethyst']

const ROOM_FLAVOR: Record<string, string[]> = {
  cave:  ['碎石大厅', '幽暗矿道', '晶簇洞窟'],
  ice:   ['冰封回廊', '霜晶祭坛', '寒潮深穴'],
  magma: ['熔岩裂谷', '灰烬殿堂', '灼热火池'],
  void:  ['虚空裂隙', '低语回廊', '深渊之眼'],
  tomb:  ['亡者墓道', '白骨祭坛', '沉寂陵寝'],
}

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 数值缩放：与混乱深渊同公式（每层 +10% 成长）；atkMult 只作用于攻防，hpMult 只作用于血量 */
function scale(base: Record<string, number>, layer: number, atkMult = 1, hpMult = 1) {
  const lm = 1 + (layer - 1) * 0.10;
  const s = (v: number) => Math.round(v * lm * atkMult);
  const hp = Math.round((base.hp ?? 30) * lm * hpMult);
  return {
    hp, maxHp: hp,
    mp: base.mp ?? 0, maxMp: base.mp ?? 0,
    atk: s(base.atk ?? 5), def: s(base.def ?? 3), mag: s(base.mag ?? 0),
    mdef: s(base.mdef ?? 2), agi: s(base.agi ?? 5), luk: s(base.luk ?? 3),
  };
}

/** 生成守序深渊某一层的 3 个可选房间（Boss 层只有 1 个 Boss 房） */
export function genLawfulRooms(layer: number, classId: string, seed = Date.now()): LawfulRoom[] {
  const rng = mulberry(seed + layer * 7919);

  // Boss 层
  if (isBossLayer(layer)) {
    const boss = getLawfulBoss(layer);
    if (boss) {
      // 平滑成长曲线：低层不再碾压（L10 攻≈44/血≈1729），高层保持强度（L100 攻≈458/血≈22672）
      const bossAtkMult = 2.0 + layer * 0.012;
      const bossHpMult = 4 + layer * 0.05;
      const stats = scale({ hp: 260, mp: 60, atk: 14, def: 10, mag: 12, mdef: 10, agi: 6, luk: 4 }, layer, bossAtkMult, bossHpMult);
      return [{
        id: 0, name: `${boss.title}·${boss.name}`, isBoss: true,
        desc: `第 ${layer} 层的守关 Boss。${boss.name}在深渊的低语中苏醒……`,
        enemies: [{
          id: boss.id, name: `${boss.title}·${boss.name}`, ...stats,
          skills: boss.skills, element: boss.element, aiType: boss.aiType,
          dropTable: [
            { itemId: 'gem_diamond', name: '钻石', type: 'currency', chance: 50, quantityMin: 1, quantityMax: 2, quality: 'legendary' },
            { itemId: 'soul_shard', name: '灵魂碎片', type: 'material', chance: 100, quantityMin: 1, quantityMax: 3, quality: 'epic' },
            // 镶嵌宝石：层数越高阶级越高
            ...(layer >= 60
              ? [{ itemId: `gem_${GEM_TYPES[layer % 6]}_3`, name: '完美的宝石', type: 'material', chance: 30, quantityMin: 1, quantityMax: 1, quality: 'legendary' }]
              : layer >= 30
                ? [{ itemId: `gem_${GEM_TYPES[layer % 6]}_2`, name: '无瑕的宝石', type: 'material', chance: 30, quantityMin: 1, quantityMax: 1, quality: 'epic' }]
                : [{ itemId: `gem_${GEM_TYPES[layer % 6]}_1`, name: '碎裂的宝石', type: 'material', chance: 30, quantityMin: 1, quantityMax: 1, quality: 'fine' }]),
          ],
        }],
      }];
    }
  }

  // 普通层：3 个房间。第 1 个按职业克制风格，另 2 个随机
  const counter = CLASS_COUNTER[classId] || { family: 'cave', style: '混战' };
  const roomPlans = [
    { family: counter.family, elite: layer >= 20 && rng() < 0.3 },
    { family: FAMILIES[Math.floor(rng() * FAMILIES.length)], elite: false },
    { family: FAMILIES[Math.floor(rng() * FAMILIES.length)], elite: layer >= 10 && rng() < 0.2 },
  ];

  return roomPlans.map((plan, idx) => {
    const pool = getEnemiesByFamily(plan.family);
    const count = 1 + Math.floor(rng() * Math.min(3, 1 + Math.ceil(layer / 25)));
    const enemies: LawfulEnemy[] = [];
    for (let i = 0; i < count && pool.length > 0; i++) {
      const t = pool[Math.floor(rng() * pool.length)];
      const stats = scale(t.baseStats as Record<string, number>, layer, plan.elite ? 1.5 : 1);
      enemies.push({
        id: `${t.id}_${idx}_${i}`, name: t.name, ...stats,
        skills: t.skills, element: t.element, aiType: t.aiType,
        dropTable: t.dropTable,
      });
    }
    const flavor = ROOM_FLAVOR[plan.family] || ROOM_FLAVOR.cave;
    const fname = flavor[Math.floor(rng() * flavor.length)];
    return {
      id: idx, name: fname, isBoss: false,
      desc: `${plan.elite ? '精英盘踞的' : ''}${fname}（${enemies.length} 只怪物${idx === 0 ? '，' + counter.style : ''}）`,
      enemies,
    };
  });
}
