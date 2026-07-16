// Turn-based Combat Service
// All formulas and data loaded from config - NO hardcoding

import { getClassById, getElementMultiplier, rollDrops } from "./config-service";

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
  skills: string[];
  isPlayer: boolean;
  element: string;
  aiType?: string;
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

  // Player turn
  switch (action.type) {
    case "attack": {
      const target = enemies.find((e) => e.id === action.targetId && e.hp > 0);
      if (!target) break;

      if (checkDodge(target.agi, rng)) {
        logs.push(`${target.name} 闪避了你的攻击！`);
        break;
      }

      let damage = player.atk - target.def;
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
      // Simplified skill resolution - load from config
      const skillId = action.skillId || "";
      const skillConfig = require("./config-service").getSkills().find((s: { id: string }) => s.id === skillId);
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
              damage = Math.floor(player.mag * mult) - target.mdef;
            } else if (dmgStr.includes("atk*")) {
              const mult = parseFloat(dmgStr.split("*")[1]);
              damage = Math.floor(player.atk * mult) - target.def;
            }
            damage = Math.max(1, damage);
            // Apply element
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
              heal = Math.floor(player.mag * mult);
            } else {
              heal = parseInt(healStr);
            }
            player.hp = Math.min(player.maxHp, player.hp + heal);
            logs.push(`你施放了 ${skillConfig.name}，恢复了 ${heal} 点生命。`);
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
      const fleeChance = 0.3 + (player.agi - Math.max(...enemies.map((e) => e.agi))) * 0.02;
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

  // Check victory
  if (!ended && enemies.every((e) => e.hp <= 0)) {
    logs.push("战斗胜利！所有敌人都被击败了。");
    victory = true;
    ended = true;

    // Generate drops from defeated enemies
    const layer = options?.layer || 1;
    for (const enemy of enemies) {
      if (enemy.hp <= 0) {
        // Find drop table for this enemy
        const enemyDrop = options?.enemyDropTables?.find((ed) => ed.enemyId === enemy.id);
        if (enemyDrop?.dropTable) {
          for (const drop of enemyDrop.dropTable) {
            if (drop.minLayer && layer < drop.minLayer) continue;
            if (rng.next() * 100 < drop.chance) {
              const qty = drop.quantityMin + Math.floor(rng.next() * (drop.quantityMax - drop.quantityMin + 1));
              drops.push({
                itemId: drop.itemId, name: drop.name, type: drop.type,
                quantity: qty, quality: drop.quality,
              });
            }
          }
        }
        // Also roll global drops
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

      // Simple AI
      if (checkDodge(player.agi, rng)) {
        logs.push(`你闪避了 ${enemy.name} 的攻击！`);
        continue;
      }

      let damage = enemy.atk - player.def;
      damage = Math.max(1, rollDamage(damage, rng));
      player.hp = Math.max(0, player.hp - damage);
      logs.push(`${enemy.name} 对你造成了 ${damage} 点伤害。`);

      if (player.hp <= 0) {
        logs.push("你被击败了...");
        ended = true;
        break;
      }
    }
  }

  // MP regen
  player.mp = Math.min(player.maxMp, player.mp + Math.floor(player.maxMp * 0.05));

  return { logs, player, enemies, ended, victory, fled, drops };
}
