/**
 * Equipment Generation Service（装备随机生成）
 *
 * 装备掉落时调用，生成随机实例：
 * 1. 品质按 itemQualities.dropWeight 权重重新随机
 * 2. 主属性在基础值上 ±10%~20% 浮动
 * 3. 副词条（借鉴 PoE / 暗黑）：数量上限按品质封顶（普通0 / 精良2 / 稀有3 / 史诗4 / 传说5 / 神话6），
 *    按权重抽取不重复词条；固定值词条随套装阶级成长，所有词条数值再乘品质倍率（品质越高 roll 越高）
 * 4. 装备名保持原名，不再拼接前缀
 */

import { getConfigSync } from "./config-service";

interface QualityDef {
  id: string; name: string; extraStatsMin: number; extraStatsMax: number; dropWeight: number;
}

export interface RolledEquipment {
  quality: string;
  /** 主属性（浮动后）+ 副词条合并后的总属性 */
  stats: Record<string, number>;
  /** 仅副词条（用于展示区分） */
  affixes: Record<string, number>;
  /** 显示名（即装备原名） */
  displayName: string;
}

/**
 * 词条池（PoE/暗黑式分组）：weight 为抽取权重；
 * scaleTier=true 的固定值词条 × 套装阶级缩放；pct 类存百分比点数（如 6 = +6%）。
 */
interface AffixDef { stat: string; min: number; max: number; scaleTier?: boolean; weight: number }

const AFFIX_POOL: AffixDef[] = [
  // ─── 生命/法力（D3：+最大生命 / +法力）───
  { stat: "hp", min: 10, max: 20, scaleTier: true, weight: 12 },
  { stat: "mp", min: 6, max: 14, scaleTier: true, weight: 8 },
  // ─── 基础属性（PoE：附加属性点）───
  { stat: "atk", min: 2, max: 5, scaleTier: true, weight: 10 },
  { stat: "def", min: 2, max: 5, scaleTier: true, weight: 10 },
  { stat: "mag", min: 2, max: 5, scaleTier: true, weight: 10 },
  { stat: "mdef", min: 2, max: 5, scaleTier: true, weight: 10 },
  { stat: "agi", min: 1, max: 4, scaleTier: true, weight: 6 },
  { stat: "luk", min: 1, max: 4, scaleTier: true, weight: 6 },
  { stat: "con", min: 1, max: 4, scaleTier: true, weight: 6 },
  { stat: "wil", min: 1, max: 4, scaleTier: true, weight: 6 },
  // ─── 伤害/防御提高（D3：伤害提高 X%）───
  { stat: "atkPct", min: 3, max: 9, weight: 8 },
  { stat: "magPct", min: 3, max: 9, weight: 8 },
  { stat: "defPct", min: 3, max: 9, weight: 7 },
  { stat: "mdefPct", min: 3, max: 9, weight: 7 },
  // ─── 暴击（PoE：暴击几率 / 暴击加成）───
  { stat: "critRate", min: 2, max: 6, weight: 7 },
  { stat: "critDmg", min: 10, max: 30, weight: 7 },
  // ─── 攻击特效 ───
  { stat: "lifesteal", min: 2, max: 6, weight: 5 },   // 生命偷取
  { stat: "elemDmg", min: 4, max: 12, scaleTier: true, weight: 6 }, // 附加元素伤害
  // ─── 防御特效 ───
  { stat: "reflect", min: 4, max: 12, weight: 4 },    // 荆棘（反伤）
  { stat: "physRes", min: 3, max: 9, weight: 5 },     // 物理异常抗性
  { stat: "magRes", min: 3, max: 9, weight: 5 },      // 精神异常抗性
  // ─── 击杀回复（D3：击杀回复生命/法力）───
  { stat: "killHeal", min: 8, max: 20, scaleTier: true, weight: 4 },
  { stat: "killMp", min: 5, max: 12, scaleTier: true, weight: 3 },
  // ─── 收益（D3：金币寻获 / 经验加成，稀有词条）───
  { stat: "goldGain", min: 5, max: 15, weight: 3 },
  { stat: "expGain", min: 5, max: 15, weight: 3 },
];

/** 品质词条数值倍率（品质越高 roll 值越高，类似 PoE 的词缀阶级） */
const QUALITY_MULT: Record<string, number> = {
  common: 1, fine: 1, rare: 1.2, epic: 1.5, legendary: 1.8, mythic: 2.2,
};

function getQualities(): QualityDef[] {
  const data = getConfigSync("items") as { itemQualities?: QualityDef[] };
  return data.itemQualities || [];
}

/**
 * 为装备基础物品生成随机实例。
 * @param base 物品表中的装备（含固定 stats/quality/setTier）
 * @param rng  随机数源（0~1）
 */
export function rollEquipmentInstance(
  base: { id: string; name: string; quality: string; setTier?: number; stats?: Record<string, number> },
  rng: () => number = Math.random
): RolledEquipment {
  const qualities = getQualities();

  // ─── 1. 品质按权重随机 ───
  const totalWeight = qualities.reduce((s, q) => s + q.dropWeight, 0);
  let r = rng() * totalWeight;
  let quality = qualities[0]?.id || "common";
  for (const q of qualities) {
    if (r < q.dropWeight) { quality = q.id; break; }
    r -= q.dropWeight;
  }
  const qDef = qualities.find((q) => q.id === quality);

  // ─── 2. 主属性 ±10%~20% 浮动 ───
  const main: Record<string, number> = {};
  for (const [k, v] of Object.entries(base.stats || {})) {
    main[k] = Math.max(1, Math.round(v * (0.9 + rng() * 0.2)));
  }

  // ─── 3. 副词条：按权重抽取不重复词条，数量 1 ~ 品质上限 ───
  const affixes: Record<string, number> = {};
  const maxAffixes = qDef?.extraStatsMax ?? 0;
  const tier = base.setTier || 1;
  const qMult = QUALITY_MULT[quality] ?? 1;
  if (maxAffixes > 0) {
    const count = 1 + Math.floor(rng() * maxAffixes); // 1 ~ max
    // 词条不重复，且不与主属性重复
    const pool = AFFIX_POOL.filter((a) => !(a.stat in main));
    for (let i = 0; i < count && pool.length > 0; i++) {
      const tw = pool.reduce((s, a) => s + a.weight, 0);
      let wr = rng() * tw;
      let idx = 0;
      for (let j = 0; j < pool.length; j++) {
        if (wr < pool[j].weight) { idx = j; break; }
        wr -= pool[j].weight;
      }
      const a = pool.splice(idx, 1)[0];
      const raw = a.min + rng() * (a.max - a.min);
      affixes[a.stat] = Math.max(1, Math.round(raw * (a.scaleTier ? tier : 1) * qMult));
    }
  }

  // ─── 4. 合并属性 ───
  const stats = { ...main };
  for (const [k, v] of Object.entries(affixes)) {
    stats[k] = (stats[k] || 0) + v;
  }

  // ─── 5. 装备名保持原名（不再拼接前缀）───
  return { quality, stats, affixes, displayName: base.name };
}
