/**
 * Equipment Generation Service（装备随机生成）
 *
 * 装备掉落时调用，生成随机实例：
 * 1. 品质按 itemQualities.dropWeight 权重重新随机
 * 2. 主属性在基础值上 ±10%~20% 浮动
 * 3. 副词条数量：上限按品质封顶（普通0 / 精良2 / 稀有3 / 史诗4 / 传说5 / 神话6），
 *    下限不封——非普通品质随机 1~上限 条，高阶装备也可能只有 1 条
 * 4. 词条数值按套装阶级（setTier）缩放，并带自身浮动
 * 5. 按最强词条拼接前缀名（如「锋利的黑钢长剑」）
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
  /** 拼接前缀后的显示名 */
  displayName: string;
}

/** 词条池：按属性类型分组，value = [min, max]（× 套装阶级缩放） */
const AFFIX_POOL: Array<{ stat: string; min: number; max: number }> = [
  { stat: "atk", min: 2, max: 4 },
  { stat: "def", min: 2, max: 4 },
  { stat: "mag", min: 2, max: 4 },
  { stat: "mdef", min: 2, max: 4 },
  { stat: "agi", min: 1, max: 3 },
  { stat: "luk", min: 1, max: 3 },
  { stat: "con", min: 1, max: 3 },
  { stat: "wil", min: 1, max: 3 },
  { stat: "hp", min: 8, max: 15 },
  { stat: "mp", min: 6, max: 12 },
];

/** 词条 → 装备前缀名 */
const PREFIX_BY_STAT: Record<string, string> = {
  atk: "锋利的", def: "坚固的", mag: "神秘的", mdef: "护佑的",
  agi: "迅捷的", luk: "幸运的", con: "坚韧的", wil: "坚毅的",
  hp: "生命的", mp: "魔力的",
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

  // ─── 3. 副词条：下限不封（1 条起），上限按品质封顶 ───
  const affixes: Record<string, number> = {};
  const maxAffixes = qDef?.extraStatsMax ?? 0;
  const tier = base.setTier || 1;
  if (maxAffixes > 0) {
    const count = 1 + Math.floor(rng() * maxAffixes); // 1 ~ max
    // 词条不重复，且不与主属性重复
    const pool = AFFIX_POOL.filter((a) => !(a.stat in main));
    for (let i = 0; i < count && pool.length > 0; i++) {
      const idx = Math.floor(rng() * pool.length);
      const a = pool.splice(idx, 1)[0];
      const raw = a.min + rng() * (a.max - a.min);
      affixes[a.stat] = Math.max(1, Math.round(raw * tier));
    }
  }

  // ─── 4. 合并属性 ───
  const stats = { ...main };
  for (const [k, v] of Object.entries(affixes)) {
    stats[k] = (stats[k] || 0) + v;
  }

  // ─── 5. 前缀名（取数值最高的词条）───
  let displayName = base.name;
  const entries = Object.entries(affixes);
  if (entries.length > 0) {
    entries.sort((a, b) => b[1] - a[1]);
    const prefix = PREFIX_BY_STAT[entries[0][0]];
    if (prefix) displayName = `${prefix}${base.name}`;
  }

  return { quality, stats, affixes, displayName };
}
