// Turn-based Combat Service
// All formulas and data loaded from config - NO hardcoding

import { getElementMultiplier, rollDrops, getSkillById, getMonsterSkillById, getItemById, getItems } from "./config-service";
import { rollEquipmentInstance } from "./equipgen-service";

// ═══ 异常状态 ═══
// physical → 体质抵抗（流血/中毒/眩晕/减速/致残）
// mental   → 意志抵抗（沉默/恐惧/魅惑/诅咒/混乱）
export interface StatusEffect {
  id: string;
  name: string;
  kind: "physical" | "mental";
  turns: number;
  /** 增益/减益/DoT 的数值负载（atkBuff/defBuff/magMult/defMult/critBuff/dodge/shield/dotDmg/atkDown/defDown） */
  data?: Record<string, number>;
}

export const STATUS_DEFS: Record<string, { name: string; kind: "physical" | "mental" }> = {
  bleed:     { name: "流血", kind: "physical" },
  poison:    { name: "中毒", kind: "physical" },
  stun:      { name: "眩晕", kind: "physical" },
  slow:      { name: "减速", kind: "physical" },
  cripple:   { name: "致残", kind: "physical" },
  silence:   { name: "沉默", kind: "mental" },
  fear:      { name: "恐惧", kind: "mental" },
  charm:     { name: "魅惑", kind: "mental" },
  curse:     { name: "诅咒", kind: "mental" },
  confusion: { name: "混乱", kind: "mental" },
};

export interface Combatant {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  atk: number;
  def: number;
  mag: number;
  mdef: number;
  agi: number;
  luk: number;
  con?: number; // 体质：生命/物防/回血/物理异常抵抗
  wil?: number; // 意志：魔防/回魔/精神异常抵抗
  /** 装备词条提供的战斗修正（仅玩家携带，数值为百分比点数或固定值） */
  mods?: {
    atkPct?: number; defPct?: number; magPct?: number; mdefPct?: number;
    critRate?: number; critDmg?: number; lifesteal?: number; reflect?: number;
    elemDmg?: number; physRes?: number; magRes?: number;
  };
  skills: string[];
  isPlayer: boolean;
  element: string;
  aiType?: string;
  statuses?: StatusEffect[];
  /** 技能冷却剩余回合（玩家；战斗中由服务端维护并随结果返回） */
  cooldowns?: Record<string, number>;
}

export interface CombatAction {
  type: "attack" | "skill" | "item" | "defend" | "flee";
  targetId?: string;
  skillId?: string;
  itemId?: string;
}

export interface CombatResult {
  logs: string[];
  playerHp: number;
  playerMp: number;
  enemies: Array<{ id: string; hp: number; maxHp: number; dead: boolean }>;
  victory: boolean;
  fled: boolean;
  defeated: boolean;
  expGain: number;
  goldGain: number;
  loot: string[];
  turnCount: number;
}

// Seeded RNG for combat (prevents manipulation)
class SimpleRNG {
  private seed: number;
  constructor(seed: number) { this.seed = seed; }
  next(): number {
    this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
    return this.seed / 0x7fffffff;
  }
}

function rollDamage(base: number, rng: SimpleRNG): number {
  const variance = 0.9 + rng.next() * 0.2; // 0.9 - 1.1
  return Math.max(1, Math.floor(base * variance));
}

function checkCrit(luk: number, rng: SimpleRNG): boolean {
  const critRate = Math.min(luk * 0.002, 0.3); // cap 30%
  return rng.next() < critRate;
}

function checkDodge(agi: number, rng: SimpleRNG): boolean {
  const dodgeRate = Math.min(agi * 0.003, 0.3); // cap 30%
  return rng.next() < dodgeRate;
}

// ═══ 派生数值（体质/意志） ═══
// 装备词条修正工具（仅玩家会携带 mods）
const modsOf = (c: Combatant) => c.mods || {};
const pctOf = (c: Combatant, k: "atkPct" | "defPct" | "magPct" | "mdefPct") => (modsOf(c)[k] || 0) / 100;
const physResist = (c: Combatant) => Math.min((c.con || 0) * 0.006 + (modsOf(c).physRes || 0) / 100, 0.6);
const magResist = (c: Combatant) => Math.min((c.wil || 0) * 0.006 + (modsOf(c).magRes || 0) / 100, 0.6);
const effDef = (c: Combatant) => {
  let v = Math.floor((c.def + Math.floor((c.con || 0) * 0.2)) * (1 + pctOf(c, "defPct")));
  v += statusSum(c, "defBuff");
  v = Math.floor(v * (1 + statusSum(c, "defMult")));
  return Math.max(0, v - statusSum(c, "defDown"));
};
const effMdef = (c: Combatant) => {
  let v = Math.floor((c.mdef + Math.floor((c.wil || 0) * 0.2)) * (1 + pctOf(c, "mdefPct")));
  return Math.max(0, v - statusSum(c, "defDown"));
};
const hpRegen = (c: Combatant) => Math.floor((c.con || 0) * 0.3);
const mpRegen = (c: Combatant) => Math.floor((c.wil || 0) * 0.5);

// 异常状态工具
const hasStatus = (c: Combatant, id: string) => (c.statuses || []).some((s) => s.id === id);

/** 玩家受击前的防御层：闪避增益（烟雾弹等）→ 护盾吸收（魔法护盾等）。返回实际掉血，0 = 完全规避 */
function applyPlayerDefense(player: Combatant, damage: number, logs: string[], rng: SimpleRNG, attacker: string): number {
  const dodge = Math.min(statusSum(player, "dodge"), 0.75);
  if (dodge > 0 && rng.next() < dodge) {
    logs.push(`你闪避了 ${attacker} 的攻击！`);
    return 0;
  }
  // 护盾吸收
  for (const s of player.statuses || []) {
    const shield = s.data?.shield || 0;
    if (shield > 0 && damage > 0) {
      const absorbed = Math.min(shield, damage);
      s.data!.shield = shield - absorbed;
      damage -= absorbed;
      logs.push(`「${s.name}」吸收了 ${absorbed} 点伤害${damage > 0 ? "" : "，攻击被完全挡下"}！`);
      if (s.data!.shield <= 0) { s.turns = 0; logs.push(`「${s.name}」的护盾破碎了。`); }
    }
  }
  return damage;
}

/** 汇总状态负载中的某个数值键（增益/减益/DoT/护盾/闪避） */
function statusSum(c: Combatant, key: string): number {
  let sum = 0;
  for (const s of c.statuses || []) {
    const v = s.data?.[key];
    if (typeof v === "number") sum += v;
  }
  return sum;
}

function tryApplyStatus(target: Combatant, statusId: string, chance: number, turns: number, rng: SimpleRNG, logs: string[], sourceName = ""): void {
  const def = STATUS_DEFS[statusId];
  if (!def || target.hp <= 0) return;
  // 抗性：物理→体质，精神→意志，按概率减免
  const resist = def.kind === "physical" ? physResist(target) : magResist(target);
  const finalChance = chance * (1 - resist);
  if (rng.next() >= finalChance) {
    if (resist > 0.15) logs.push(`${target.name} 抵抗了${def.name}！`);
    return;
  }
  target.statuses = target.statuses || [];
  const existing = target.statuses.find((s) => s.id === statusId);
  if (existing) {
    existing.turns = Math.max(existing.turns, turns);
  } else {
    target.statuses.push({ id: statusId, name: def.name, kind: def.kind, turns });
  }
  logs.push(`${target.name} 陷入了${def.name}状态！${sourceName ? `（来自 ${sourceName}）` : ""}`);
}

/** 回合开始时的状态结算；返回 true = 本回合无法行动 */
function processStatuses(c: Combatant, rng: SimpleRNG, logs: string[], isPlayerSide: boolean): boolean {
  if (!c.statuses || c.statuses.length === 0) return false;
  let skip = false;
  const who = isPlayerSide ? "你" : c.name;
  for (const s of c.statuses) {
    switch (s.id) {
      case "bleed": {
        const dot = Math.max(1, Math.floor(c.maxHp * 0.03));
        c.hp = Math.max(0, c.hp - dot);
        logs.push(`${who} 因流血损失了 ${dot} 点生命。`);
        break;
      }
      case "poison": {
        const dot = Math.max(1, Math.floor(c.maxHp * 0.025));
        c.hp = Math.max(0, c.hp - dot);
        logs.push(`${who} 受到毒素侵蚀，损失 ${dot} 点生命。`);
        break;
      }
      case "stun":
        logs.push(`${who} 眩晕中，无法行动！`);
        skip = true;
        break;
      case "fear":
        if (rng.next() < 0.5) { logs.push(`${who} 被恐惧笼罩，动弹不得！`); skip = true; }
        break;
      case "charm":
        if (rng.next() < 0.5) { logs.push(`${who} 被魅惑了，失去了理智！`); skip = true; }
        break;
    }
    // 通用 DoT（腐蚀术/痛苦诅咒等，id 以 dot_ 开头，data.dotDmg 为每回合伤害）
    if (s.id.startsWith("dot_") && s.data?.dotDmg) {
      const dot = Math.max(1, Math.floor(s.data.dotDmg));
      c.hp = Math.max(0, c.hp - dot);
      logs.push(`${who} 受到「${s.name}」持续伤害，损失 ${dot} 点生命。`);
      if (c.hp <= 0) logs.push(`${isPlayerSide ? "你" : c.name} 倒下了！`);
    }
    s.turns -= 1;
  }
  c.statuses = c.statuses.filter((s) => {
    if (s.turns <= 0) { logs.push(`${who} 的${s.name}状态解除了。`); return false; }
    return true;
  });
  return skip;
}

// 受异常影响的实际属性
const effAtk = (c: Combatant) => {
  let v = Math.floor(c.atk * (1 + pctOf(c, "atkPct")));
  v += statusSum(c, "atkBuff");
  if (hasStatus(c, "cripple")) v = Math.floor(v * 0.7);
  if (hasStatus(c, "curse")) v = Math.floor(v * 0.8);
  return Math.max(1, v - statusSum(c, "atkDown"));
};
const effMag = (c: Combatant) => {
  let v = Math.floor(c.mag * (1 + pctOf(c, "magPct")));
  v = Math.floor(v * (1 + statusSum(c, "magMult")));
  if (hasStatus(c, "curse")) v = Math.floor(v * 0.8);
  return Math.max(1, v);
};
const effAgi = (c: Combatant) => (hasStatus(c, "slow") ? Math.floor(c.agi * 0.5) : c.agi);

export interface DropResult {
  itemId: string; name: string; type: string; quantity: number; quality: string;
  /** 装备随机实例：浮动后主属性+词条合并值 */
  stats?: Record<string, number>;
  /** 装备随机实例：仅副词条 */
  affixes?: Record<string, number>;
}

/** 装备类掉落生成随机实例（品质重roll、主属性浮动、随机词条）；支持 "equipment:{tier}" 令牌 */
function rollEquipmentDrop(drop: DropResult, rng: () => number): DropResult {
  if (drop.type !== "equipment") return drop;
  let base = drop.itemId.startsWith("equipment:")
    ? (() => {
        const tier = Number(drop.itemId.split(":")[1]);
        const pool = getItems().filter((i) => i.type === "equipment" && i.setTier === tier);
        return pool.length > 0 ? pool[Math.floor(rng() * pool.length)] : undefined;
      })()
    : getItemById(drop.itemId);
  if (!base) return drop;
  const rolled = rollEquipmentInstance(base, rng);
  return {
    ...drop,
    itemId: base.id,
    name: rolled.displayName,
    quality: rolled.quality,
    stats: rolled.stats,
    affixes: rolled.affixes,
  };
}

/** Boss 必掉装备：按层数决定套装阶级 */
function bossGuaranteedDrop(layer: number, rng: () => number): DropResult {
  const tier = layer >= 46 ? 3 : layer >= 31 ? 2 : 1;
  return rollEquipmentDrop({
    itemId: `equipment:${tier}`, name: "装备", type: "equipment",
    quantity: 1, quality: "rare",
  }, rng);
}

export function resolveCombat(
  player: Combatant,
  enemies: Combatant[],
  action: CombatAction,
  turnSeed: number,
  options?: {
    layer?: number;
    enemyDropTables?: Array<{
      enemyId: string;
      dropTable?: Array<{
        itemId: string; name: string; type: string; chance: number;
        quantityMin: number; quantityMax: number; quality: string; minLayer?: number;
      }>;
    }>;
  }
): { logs: string[]; player: Combatant; enemies: Combatant[]; ended: boolean; victory: boolean; fled: boolean; drops: DropResult[] } {
  const rng = new SimpleRNG(turnSeed);
  const logs: string[] = [];
  let ended = false;
  let victory = false;
  let fled = false;
  let drops: DropResult[] = [];

  // ═══ 玩家回合开始：状态结算 + 体质/意志回复 ═══
  const playerSkipped = processStatuses(player, rng, logs, true);
  if (player.hp <= 0) {
    logs.push("你被击败了...");
    return { logs, player, enemies, ended: true, victory: false, fled, drops };
  }
  const regenHp = hpRegen(player);
  const regenMp = mpRegen(player);
  if (regenHp > 0) player.hp = Math.min(player.maxHp, player.hp + regenHp);
  if (regenMp > 0) player.mp = Math.min(player.maxMp, player.mp + regenMp);

  // 技能冷却每回合递减
  if (player.cooldowns) {
    for (const k of Object.keys(player.cooldowns)) {
      player.cooldowns[k] = Math.max(0, player.cooldowns[k] - 1);
      if (player.cooldowns[k] === 0) delete player.cooldowns[k];
    }
  }

  // Player turn
  if (!playerSkipped) {
    // 混乱：50% 攻击自己
    const confused = hasStatus(player, "confusion") && rng.next() < 0.5;
    if (confused) {
      const selfDmg = Math.max(1, Math.floor(effAtk(player) * 0.5));
      player.hp = Math.max(0, player.hp - selfDmg);
      logs.push(`你在混乱中打了自己，受到 ${selfDmg} 点伤害！`);
      if (player.hp <= 0) {
        logs.push("你被击败了...");
        return { logs, player, enemies, ended: true, victory: false, fled, drops };
      }
    } else {
      switch (action.type) {
        case "attack": {
          const target = enemies.find((e) => e.id === action.targetId && e.hp > 0);
          if (!target) break;

          if (checkDodge(effAgi(target), rng)) {
            logs.push(`${target.name} 闪避了你的攻击！`);
            break;
          }

          let damage = effAtk(player) - effDef(target);
          damage = Math.max(1, damage);
          const m = modsOf(player);
          if (m.elemDmg) damage += Math.floor(m.elemDmg); // 附加元素伤害词条
          const affixCrit = (m.critRate || 0) > 0 && rng.next() < (m.critRate as number) / 100;
          const isCrit = checkCrit(player.luk, rng) || affixCrit;
          if (isCrit) {
            damage = Math.floor(damage * (1.5 + (m.critDmg || 0) / 100));
            logs.push(`暴击！你对 ${target.name} 造成了 ${damage} 点伤害！`);
          } else {
            logs.push(`你对 ${target.name} 造成了 ${damage} 点伤害。`);
          }
          target.hp = Math.max(0, target.hp - damage);
          // 吸血词条
          if (m.lifesteal) {
            const heal = Math.floor(damage * (m.lifesteal as number) / 100);
            if (heal > 0) {
              player.hp = Math.min(player.maxHp, player.hp + heal);
              logs.push(`吸血效果恢复了你 ${heal} 点生命。`);
            }
          }
          if (target.hp <= 0) logs.push(`${target.name} 被击败了！`);
          break;
        }
        case "skill": {
          if (hasStatus(player, "silence")) {
            logs.push("你处于沉默状态，无法施放技能！改为普通攻击。");
            const target = enemies.find((e) => e.id === action.targetId && e.hp > 0);
            if (target) {
              if (checkDodge(effAgi(target), rng)) {
                logs.push(`${target.name} 闪避了你的攻击！`);
              } else {
                const damage = Math.max(1, effAtk(player) - effDef(target));
                target.hp = Math.max(0, target.hp - damage);
                logs.push(`你对 ${target.name} 造成了 ${damage} 点伤害。`);
                if (target.hp <= 0) logs.push(`${target.name} 被击败了！`);
              }
            }
            break;
          }
          const skillId = action.skillId || "";
          const skillConfig = getSkillById(skillId);
          // 冷却校验：冷却中的技能自动降级为普通攻击
          const cdLeft = player.cooldowns?.[skillId] || 0;
          const usable = skillConfig && player.mp >= skillConfig.mpCost && cdLeft <= 0;
          if (skillConfig && !usable && cdLeft > 0) {
            logs.push(`${skillConfig.name} 冷却中（剩余 ${cdLeft} 回合），改为普通攻击。`);
          }
          if (skillConfig && usable) {
            player.mp -= skillConfig.mpCost;
            // 进入冷却
            const cd = (skillConfig as { cooldown?: number }).cooldown || 0;
            if (cd > 0) {
              player.cooldowns = player.cooldowns || {};
              player.cooldowns[skillId] = cd;
            }
            const effect = skillConfig.effect as Record<string, unknown>;
            const target = enemies.find((e) => e.id === action.targetId && e.hp > 0)
              || enemies.find((e) => e.hp > 0);
            const sm = modsOf(player);

            // ─── 伤害（支持 AOE / 多段 / 无视防御 / 穿透）───
            if (effect.damage) {
              const dmgStr = effect.damage as string;
              const isMag = dmgStr.includes("mag*");
              const mult = parseFloat(dmgStr.split("*")[1]);
              const aoe = !!effect.aoe;
              const hits = (effect.hits as number) || 1;
              const targets = aoe ? enemies.filter((e) => e.hp > 0) : target ? [target] : [];
              for (const t of targets) {
                for (let h = 0; h < hits; h++) {
                  if (t.hp <= 0) break;
                  let def = isMag ? effMdef(t) : effDef(t);
                  if (effect.ignoreDef) def = 0;
                  else if (effect.defPenetration) def = Math.floor(def * (1 - (effect.defPenetration as number)));
                  let damage = Math.floor((isMag ? effMag(player) : effAtk(player)) * mult) - def;
                  damage = Math.max(1, damage);
                  const elMult = getElementMultiplier(skillConfig.element, t.element);
                  if (elMult !== 1) {
                    damage = Math.floor(damage * elMult);
                    logs.push(elMult > 1 ? `属性克制！` : `属性被克制...`);
                  }
                  // 技能暴击（吃词条暴击率；背刺等 critDamage 提升暴击倍率）
                  const critBuff = statusSum(player, "critBuff");
                  const critChance = (sm.critRate || 0) / 100 + critBuff + player.luk * 0.002;
                  const isCrit = rng.next() < critChance;
                  if (isCrit) damage = Math.floor(damage * ((effect.critDamage as number) || (1.5 + (sm.critDmg || 0) / 100)));
                  if (sm.elemDmg) damage += Math.floor(sm.elemDmg);
                  t.hp = Math.max(0, t.hp - damage);
                  logs.push(`你施放了 ${skillConfig.name}，对 ${t.name} 造成 ${damage} 点伤害${isCrit ? "（暴击）" : ""}。`);
                  // 吸血（词条 + 技能自身 lifesteal）
                  const ls = ((sm.lifesteal || 0) as number) / 100 + ((effect.lifesteal as number) || 0);
                  if (ls > 0) {
                    const heal = Math.floor(damage * ls);
                    if (heal > 0) {
                      player.hp = Math.min(player.maxHp, player.hp + heal);
                      logs.push(`吸血效果恢复了你 ${heal} 点生命。`);
                    }
                  }
                  if (t.hp <= 0) logs.push(`${t.name} 被击败了！`);
                }
              }
            }

            // ─── 治疗（固定 / 百分比）───
            if (effect.heal || effect.healPercent) {
              let heal = 0;
              if (effect.healPercent) heal = Math.floor(player.maxHp * (effect.healPercent as number));
              else {
                const healStr = effect.heal as string;
                heal = healStr.includes("mag*") ? Math.floor(effMag(player) * parseFloat(healStr.split("*")[1]))
                  : healStr.includes("atk*") ? Math.floor(effAtk(player) * parseFloat(healStr.split("*")[1]))
                  : parseInt(healStr);
              }
              player.hp = Math.min(player.maxHp, player.hp + heal);
              logs.push(`你施放了 ${skillConfig.name}，恢复了 ${heal} 点生命。`);
            }

            // ─── 增益（buff，作为状态挂在玩家身上）───
            {
              const data: Record<string, number> = {};
              if (effect.atkBuff) data.atkBuff = effect.atkBuff as number;
              if (effect.defBuff) data.defBuff = effect.defBuff as number;
              if (effect.magMultiplier) data.magMult = (effect.magMultiplier as number) - 1;
              if (effect.defMultiplier) data.defMult = (effect.defMultiplier as number) - 1;
              if (effect.critChanceBuff) data.critBuff = effect.critChanceBuff as number;
              if (effect.dodgeBuff) data.dodge = effect.dodgeBuff as number;
              if (effect.shield) data.shield = Math.max(1, Math.floor(effMag(player)));
              const dur = (effect.buffDuration as number) || (effect.duration as number) || 0;
              if (Object.keys(data).length > 0 && dur > 0) {
                const bid = `buff_${skillId}`;
                player.statuses = (player.statuses || []).filter((s) => s.id !== bid);
                player.statuses.push({ id: bid, name: skillConfig.name, kind: "mental", turns: dur, data });
                logs.push(`你获得了「${skillConfig.name}」增益，持续 ${dur} 回合。`);
              }
            }

            // ─── DoT（腐蚀/痛苦诅咒等）───
            if (effect.dotDamage && target && target.hp > 0) {
              const dStr = effect.dotDamage as string;
              const base = dStr.includes("mag*") ? effMag(player) : effAtk(player);
              const dotDmg = Math.max(1, Math.floor(base * parseFloat(dStr.split("*")[1])));
              const dur = (effect.dotDuration as number) || 3;
              const did = `dot_${skillId}`;
              target.statuses = (target.statuses || []).filter((s) => s.id !== did);
              target.statuses.push({ id: did, name: skillConfig.name, kind: "physical", turns: dur, data: { dotDmg } });
              logs.push(`${target.name} 受到「${skillConfig.name}」持续伤害效果，每回合 ${dotDmg} 点，持续 ${dur} 回合。`);
            }

            // ─── 减益（削弱敌方攻/防）───
            if ((effect.atkDebuff || effect.defDebuff) && target && target.hp > 0) {
              const data: Record<string, number> = {};
              if (effect.atkDebuff) data.atkDown = effect.atkDebuff as number;
              if (effect.defDebuff) data.defDown = effect.defDebuff as number;
              const dur = (effect.debuffDuration as number) || 2;
              const bid = `debuff_${skillId}`;
              target.statuses = (target.statuses || []).filter((s) => s.id !== bid);
              target.statuses.push({ id: bid, name: skillConfig.name, kind: "mental", turns: dur, data });
              logs.push(`${target.name} 被「${skillConfig.name}」削弱，持续 ${dur} 回合。`);
            }

            // ─── 驱散（移除自身减益/异常）───
            if (effect.dispel) {
              const before = (player.statuses || []).length;
              player.statuses = (player.statuses || []).filter((s) => s.id.startsWith("buff_"));
              logs.push(before > player.statuses.length ? `你驱散了身上的负面状态！` : `没有可驱散的状态。`);
            }

            // ─── 附毒（伤害后置毒）───
            if (effect.poisonDamage && target && target.hp > 0) {
              const pStr = effect.poisonDamage as string;
              const base = pStr.includes("mag*") ? effMag(player) : effAtk(player);
              const dotDmg = Math.max(1, Math.floor(base * parseFloat(pStr.split("*")[1])));
              const dur = (effect.poisonDuration as number) || 3;
              const did = `dot_${skillId}_poison`;
              target.statuses = (target.statuses || []).filter((s) => s.id !== did);
              target.statuses.push({ id: did, name: "剧毒", kind: "physical", turns: dur, data: { dotDmg } });
              logs.push(`${target.name} 中了剧毒，每回合损失 ${dotDmg} 点生命，持续 ${dur} 回合。`);
            }

            // ─── 冻结 → 眩晕 ───
            if (effect.freezeChance && target && target.hp > 0) {
              tryApplyStatus(target, "stun", effect.freezeChance as number, (effect.freezeDuration as number) ?? 1, rng, logs, skillConfig.name);
            }
            // ─── 陷阱缠绕 → 减速 + 即时伤害 ───
            if (effect.root && target && target.hp > 0) {
              tryApplyStatus(target, "slow", 1, 2, rng, logs, skillConfig.name);
              if (effect.trapDamage) {
                const tStr = effect.trapDamage as string;
                const base = tStr.includes("mag*") ? effMag(player) : effAtk(player);
                const td = Math.max(1, Math.floor(base * parseFloat(tStr.split("*")[1])) - effDef(target));
                target.hp = Math.max(0, target.hp - td);
                logs.push(`陷阱对 ${target.name} 造成 ${td} 点伤害。`);
                if (target.hp <= 0) logs.push(`${target.name} 被击败了！`);
              }
            }

            // ─── 技能附带异常（盾击 stunChance/stunDuration 等旧格式也兼容）───
            if (effect.status && target && target.hp > 0) {
              const st = effect.status as { id: string; chance: number; turns?: number };
              tryApplyStatus(target, st.id, st.chance, st.turns ?? 2, rng, logs, skillConfig.name);
            }
            if (effect.stunChance && target && target.hp > 0) {
              tryApplyStatus(target, "stun", effect.stunChance as number, (effect.stunDuration as number) ?? 1, rng, logs, skillConfig.name);
            }
            break;
          }
          // 技能不可用（冷却/蓝不足）→ 降级为普攻
          {
            const target = enemies.find((e) => e.id === action.targetId && e.hp > 0);
            if (target) {
              if (checkDodge(effAgi(target), rng)) {
                logs.push(`${target.name} 闪避了你的攻击！`);
              } else {
                const damage = Math.max(1, effAtk(player) - effDef(target));
                target.hp = Math.max(0, target.hp - damage);
                logs.push(`你对 ${target.name} 造成了 ${damage} 点伤害。`);
                if (target.hp <= 0) logs.push(`${target.name} 被击败了！`);
              }
            }
          }
          break;
        }
        case "defend": {
          logs.push("你进入防御姿态，下回合受到的伤害减半。");
          break;
        }
        case "flee": {
          const fleeChance = 0.3 + (effAgi(player) - Math.max(...enemies.map((e) => effAgi(e)))) * 0.02;
          if (rng.next() < Math.min(fleeChance, 0.8)) {
            logs.push("你成功逃跑了！");
            fled = true;
            ended = true;
          } else {
            logs.push("逃跑失败！");
          }
          break;
        }
      }
    }
  }

  // Check victory
  if (!ended && enemies.every((e) => e.hp <= 0)) {
    logs.push("战斗胜利！所有敌人都被击败了。");
    victory = true;
    ended = true;

    // Generate drops from defeated enemies（幸运提升掉落率和货币数量）
    const layer = options?.layer || 1;
    const luckDropBoost = 1 + player.luk * 0.01;
    const luckGoldBoost = 1 + player.luk * 0.02;
    for (const enemy of enemies) {
      if (enemy.hp <= 0) {
        const enemyDrop = options?.enemyDropTables?.find((ed) => ed.enemyId === enemy.id);
        if (enemyDrop?.dropTable) {
          for (const drop of enemyDrop.dropTable) {
            if (drop.minLayer && layer < drop.minLayer) continue;
            if (rng.next() * 100 < drop.chance * luckDropBoost) {
              let qty = drop.quantityMin + Math.floor(rng.next() * (drop.quantityMax - drop.quantityMin + 1));
              if (drop.type === "currency") qty = Math.floor(qty * luckGoldBoost);
              drops.push(rollEquipmentDrop({
                itemId: drop.itemId, name: drop.name, type: drop.type,
                quantity: qty, quality: drop.quality,
              }, () => rng.next()));
            }
          }
        }
        const globalDrops = rollDrops(enemy.id, layer, () => rng.next());
        drops.push(...globalDrops.map((d) => rollEquipmentDrop(d, () => rng.next())));
        // Boss 必掉一件装备
        if (enemy.id.startsWith("boss_")) {
          drops.push(bossGuaranteedDrop(layer, () => rng.next()));
        }
      }
    }

    if (drops.length > 0) {
      logs.push(`获得掉落: ${drops.map((d) => `${d.name}×${d.quantity}`).join(", ")}`);
    }
  }

  // Enemy turns
  if (!ended) {
    for (const enemy of enemies) {
      if (enemy.hp <= 0) continue;

      // 敌人回合开始：状态结算
      const enemySkipped = processStatuses(enemy, rng, logs, false);
      if (enemy.hp <= 0) {
        logs.push(`${enemy.name} 倒下了！`);
        continue;
      }
      if (enemySkipped) continue;

      // 混乱的敌人 50% 攻击同伴/自己
      if (hasStatus(enemy, "confusion") && rng.next() < 0.5) {
        const selfDmg = Math.max(1, Math.floor(effAtk(enemy) * 0.5));
        enemy.hp = Math.max(0, enemy.hp - selfDmg);
        logs.push(`${enemy.name} 在混乱中攻击了自己，受到 ${selfDmg} 点伤害！`);
        if (enemy.hp <= 0) logs.push(`${enemy.name} 被击败了！`);
        continue;
      }

      // 敌人技能：30% 概率使用（有配置时），否则普攻
      const usableSkills = (enemy.skills || [])
        .map((sid) => getMonsterSkillById(sid))
        .filter((s): s is NonNullable<typeof s> => !!s);
      const skill = usableSkills.length > 0 && rng.next() < 0.35
        ? usableSkills[Math.floor(rng.next() * usableSkills.length)]
        : null;

      if (skill) {
        // 技能伤害
        let damage = 0;
        const dmgStr = skill.damage || "atk*1";
        if (dmgStr.includes("mag*")) {
          damage = Math.floor((enemy.mag || 1) * parseFloat(dmgStr.split("*")[1])) - effMdef(player);
        } else if (dmgStr.includes("atk*")) {
          damage = Math.floor(effAtk(enemy) * parseFloat(dmgStr.split("*")[1])) - effDef(player);
        }
        damage = Math.max(1, rollDamage(damage, rng));
        damage = applyPlayerDefense(player, damage, logs, rng, enemy.name);
        if (damage <= 0) continue;
        player.hp = Math.max(0, player.hp - damage);
        logs.push(`${enemy.name} 使用了 ${skill.name}，对你造成 ${damage} 点伤害！`);
        // 反伤词条
        const rm1 = modsOf(player);
        if (rm1.reflect) {
          const refl = Math.floor(damage * (rm1.reflect as number) / 100);
          if (refl > 0) {
            enemy.hp = Math.max(0, enemy.hp - refl);
            logs.push(`荆棘反伤：${enemy.name} 受到 ${refl} 点反弹伤害！`);
            if (enemy.hp <= 0) logs.push(`${enemy.name} 被反弹击败了！`);
          }
        }
        // 技能附带异常
        if (skill.status && player.hp > 0) {
          tryApplyStatus(player, skill.status.id, skill.status.chance, skill.status.turns ?? 2, rng, logs, enemy.name);
        }
      } else {
        if (checkDodge(effAgi(player), rng)) {
          logs.push(`你闪避了 ${enemy.name} 的攻击！`);
          continue;
        }
        let damage = effAtk(enemy) - effDef(player);
        damage = Math.max(1, rollDamage(damage, rng));
        damage = applyPlayerDefense(player, damage, logs, rng, enemy.name);
        if (damage <= 0) continue;
        player.hp = Math.max(0, player.hp - damage);
        logs.push(`${enemy.name} 对你造成了 ${damage} 点伤害。`);
        // 反伤词条
        const rm2 = modsOf(player);
        if (rm2.reflect) {
          const refl = Math.floor(damage * (rm2.reflect as number) / 100);
          if (refl > 0) {
            enemy.hp = Math.max(0, enemy.hp - refl);
            logs.push(`荆棘反伤：${enemy.name} 受到 ${refl} 点反弹伤害！`);
            if (enemy.hp <= 0) logs.push(`${enemy.name} 被反弹击败了！`);
          }
        }
      }

      if (player.hp <= 0) {
        logs.push("你被击败了...");
        ended = true;
        break;
      }
    }
  }

  return { logs, player, enemies, ended, victory, fled, drops };
}
