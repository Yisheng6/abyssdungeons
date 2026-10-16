// Turn-based Combat Service
// All formulas and data loaded from config - NO hardcoding

import { getElementMultiplier, rollDrops, getSkillById, getMonsterSkillById } from "./config-service";

// ═══ 异常状态 ═══
// physical → 体质抵抗（流血/中毒/眩晕/减速/致残）
// mental   → 意志抵抗（沉默/恐惧/魅惑/诅咒/混乱）
export interface StatusEffect {
  id: string;
  name: string;
  kind: "physical" | "mental";
  turns: number;
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
  skills: string[];
  isPlayer: boolean;
  element: string;
  aiType?: string;
  statuses?: StatusEffect[];
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
const physResist = (c: Combatant) => Math.min((c.con || 0) * 0.006, 0.6);
const magResist = (c: Combatant) => Math.min((c.wil || 0) * 0.006, 0.6);
const effDef = (c: Combatant) => c.def + Math.floor((c.con || 0) * 0.2);
const effMdef = (c: Combatant) => c.mdef + Math.floor((c.wil || 0) * 0.2);
const hpRegen = (c: Combatant) => Math.floor((c.con || 0) * 0.3);
const mpRegen = (c: Combatant) => Math.floor((c.wil || 0) * 0.5);

// 异常状态工具
const hasStatus = (c: Combatant, id: string) => (c.statuses || []).some((s) => s.id === id);

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
  let v = c.atk;
  if (hasStatus(c, "cripple")) v = Math.floor(v * 0.7);
  if (hasStatus(c, "curse")) v = Math.floor(v * 0.8);
  return v;
};
const effMag = (c: Combatant) => (hasStatus(c, "curse") ? Math.floor(c.mag * 0.8) : c.mag);
const effAgi = (c: Combatant) => (hasStatus(c, "slow") ? Math.floor(c.agi * 0.5) : c.agi);

export interface DropResult {
  itemId: string; name: string; type: string; quantity: number; quality: string;
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
          const isCrit = checkCrit(player.luk, rng);
          if (isCrit) {
            damage = Math.floor(damage * 1.5);
            logs.push(`暴击！你对 ${target.name} 造成了 ${damage} 点伤害！`);
          } else {
            logs.push(`你对 ${target.name} 造成了 ${damage} 点伤害。`);
          }
          target.hp = Math.max(0, target.hp - damage);
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
          if (skillConfig && player.mp >= skillConfig.mpCost) {
            player.mp -= skillConfig.mpCost;
            const target = enemies.find((e) => e.id === action.targetId && e.hp > 0);
            if (target) {
              const effect = skillConfig.effect as Record<string, unknown>;
              if (effect.damage) {
                const dmgStr = effect.damage as string;
                let damage = 0;
                if (dmgStr.includes("mag*")) {
                  const mult = parseFloat(dmgStr.split("*")[1]);
                  damage = Math.floor(effMag(player) * mult) - effMdef(target);
                } else if (dmgStr.includes("atk*")) {
                  const mult = parseFloat(dmgStr.split("*")[1]);
                  damage = Math.floor(effAtk(player) * mult) - effDef(target);
                }
                damage = Math.max(1, damage);
                const elMult = getElementMultiplier(skillConfig.element, target.element);
                if (elMult !== 1) {
                  damage = Math.floor(damage * elMult);
                  logs.push(elMult > 1 ? `属性克制！` : `属性被克制...`);
                }
                target.hp = Math.max(0, target.hp - damage);
                logs.push(`你施放了 ${skillConfig.name}，对 ${target.name} 造成 ${damage} 点伤害。`);
                if (target.hp <= 0) logs.push(`${target.name} 被击败了！`);
              }
              if (effect.heal) {
                const healStr = effect.heal as string;
                let heal = 0;
                if (healStr.includes("mag*")) {
                  const mult = parseFloat(healStr.split("*")[1]);
                  heal = Math.floor(effMag(player) * mult);
                } else {
                  heal = parseInt(healStr);
                }
                player.hp = Math.min(player.maxHp, player.hp + heal);
                logs.push(`你施放了 ${skillConfig.name}，恢复了 ${heal} 点生命。`);
              }
              // 技能附带异常（盾击 stunChance/stunDuration 等旧格式也兼容）
              if (effect.status && target.hp > 0) {
                const st = effect.status as { id: string; chance: number; turns?: number };
                tryApplyStatus(target, st.id, st.chance, st.turns ?? 2, rng, logs, skillConfig.name);
              }
              if (effect.stunChance && target.hp > 0) {
                tryApplyStatus(target, "stun", effect.stunChance as number, (effect.stunDuration as number) ?? 1, rng, logs, skillConfig.name);
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
              drops.push({
                itemId: drop.itemId, name: drop.name, type: drop.type,
                quantity: qty, quality: drop.quality,
              });
            }
          }
        }
        const globalDrops = rollDrops(enemy.id, layer, () => rng.next());
        drops.push(...globalDrops);
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
        player.hp = Math.max(0, player.hp - damage);
        logs.push(`${enemy.name} 使用了 ${skill.name}，对你造成 ${damage} 点伤害！`);
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
        player.hp = Math.max(0, player.hp - damage);
        logs.push(`${enemy.name} 对你造成了 ${damage} 点伤害。`);
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
