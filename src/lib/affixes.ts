/**
 * 词条重铸（客户端镜像，与 api/services/equipgen-service.ts 词条池保持一致）
 * - 重铸只洗副词条，主属性（掉落时的浮动值）保持不变
 * - 金币重铸：词条数量 1 ~ 品质上限随机，全区间 roll
 * - 钻石重铸：词条数量 = 品质上限，roll 区间锁定在 60%~100%（必出高值）
 */

export interface AffixDef { stat: string; min: number; max: number; scaleTier?: boolean; weight: number }

export const AFFIX_POOL: AffixDef[] = [
  { stat: 'hp', min: 10, max: 20, scaleTier: true, weight: 12 },
  { stat: 'mp', min: 6, max: 14, scaleTier: true, weight: 8 },
  { stat: 'atk', min: 2, max: 5, scaleTier: true, weight: 10 },
  { stat: 'def', min: 2, max: 5, scaleTier: true, weight: 10 },
  { stat: 'mag', min: 2, max: 5, scaleTier: true, weight: 10 },
  { stat: 'mdef', min: 2, max: 5, scaleTier: true, weight: 10 },
  { stat: 'agi', min: 1, max: 4, scaleTier: true, weight: 6 },
  { stat: 'luk', min: 1, max: 4, scaleTier: true, weight: 6 },
  { stat: 'con', min: 1, max: 4, scaleTier: true, weight: 6 },
  { stat: 'wil', min: 1, max: 4, scaleTier: true, weight: 6 },
  { stat: 'atkPct', min: 3, max: 9, weight: 8 },
  { stat: 'magPct', min: 3, max: 9, weight: 8 },
  { stat: 'defPct', min: 3, max: 9, weight: 7 },
  { stat: 'mdefPct', min: 3, max: 9, weight: 7 },
  { stat: 'critRate', min: 2, max: 6, weight: 7 },
  { stat: 'critDmg', min: 10, max: 30, weight: 7 },
  { stat: 'lifesteal', min: 2, max: 6, weight: 5 },
  { stat: 'elemDmg', min: 4, max: 12, scaleTier: true, weight: 6 },
  { stat: 'reflect', min: 4, max: 12, weight: 4 },
  { stat: 'physRes', min: 3, max: 9, weight: 5 },
  { stat: 'magRes', min: 3, max: 9, weight: 5 },
  { stat: 'killHeal', min: 8, max: 20, scaleTier: true, weight: 4 },
  { stat: 'killMp', min: 5, max: 12, scaleTier: true, weight: 3 },
  { stat: 'goldGain', min: 5, max: 15, weight: 3 },
  { stat: 'expGain', min: 5, max: 15, weight: 3 },
];

export const QUALITY_MULT: Record<string, number> = {
  common: 1, fine: 1, rare: 1.2, epic: 1.5, legendary: 1.8, mythic: 2.2,
};

/** 各品质词条数量上限（与 itemQualities.extraStatsMax 对应） */
export const QUALITY_MAX_AFFIXES: Record<string, number> = {
  common: 0, fine: 2, rare: 3, epic: 4, legendary: 5, mythic: 6,
};

/** 金币重铸费用：套装阶级 × 品质系数 × 400 */
export function getReforgeGoldCost(setTier: number, quality: string): number {
  const qMult = QUALITY_MULT[quality] ?? 1;
  return Math.round(setTier * 400 * qMult);
}

export const REFORGE_DIAMOND_COST = 5;

/**
 * 重铸副词条。
 * @param mainStats 主属性（不含旧词条）
 * @param quality   品质
 * @param setTier   套装阶级
 * @param diamond   true = 钻石重铸（满词条 + 高值区间）
 */
export function rollAffixes(
  mainStats: Record<string, number>,
  quality: string,
  setTier: number,
  diamond: boolean,
  rng: () => number = Math.random,
): Record<string, number> {
  const maxAffixes = QUALITY_MAX_AFFIXES[quality] ?? 0;
  if (maxAffixes <= 0) return {};
  const count = diamond ? maxAffixes : 1 + Math.floor(rng() * maxAffixes);
  const qMult = QUALITY_MULT[quality] ?? 1;
  const pool = AFFIX_POOL.filter((a) => !(a.stat in mainStats));
  const affixes: Record<string, number> = {};
  for (let i = 0; i < count && pool.length > 0; i++) {
    const tw = pool.reduce((s, a) => s + a.weight, 0);
    let wr = rng() * tw;
    let idx = 0;
    for (let j = 0; j < pool.length; j++) {
      if (wr < pool[j].weight) { idx = j; break; }
      wr -= pool[j].weight;
    }
    const a = pool.splice(idx, 1)[0];
    const lo = diamond ? 0.6 : 0;
    const raw = a.min + (lo + rng() * (1 - lo)) * (a.max - a.min);
    affixes[a.stat] = Math.max(1, Math.round(raw * (a.scaleTier ? setTier : 1) * qMult));
  }
  return affixes;
}

/** 从合并 stats 中剥离副词条，得到主属性 */
export function extractMainStats(item: { stats?: Record<string, number>; affixes?: Record<string, number> }): Record<string, number> {
  const main: Record<string, number> = { ...(item.stats || {}) };
  for (const [k, v] of Object.entries(item.affixes || {})) {
    if (k in main) main[k] -= v;
  }
  return main;
}
