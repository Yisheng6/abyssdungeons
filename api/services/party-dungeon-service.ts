import crypto from "crypto";
import { generateDungeon, getRoomDirections, type DungeonMap, type DungeonRoom } from "./mapgen-service";
import { getEnemyById } from "./config-service";

// ─── Types ───
export interface PartyMemberState {
  characterId: number;
  name: string;
  classId: string;
  level: number;
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
  isAlive: boolean;
  isDefending: boolean;
  damageDealt: number;
  healingDone: number;
}

export interface PartyDungeonInstance {
  instanceId: string;
  partyId: number;
  dungeon: DungeonMap;
  currentRoomId: number;
  exploredRooms: Set<number>;
  memberStates: Record<number, PartyMemberState>; // key = characterId
  enemies: Array<{
    id: string; name: string; hp: number; maxHp: number;
    mp: number; maxMp: number; atk: number; def: number;
    mag: number; mdef: number; agi: number; luk: number;
    skills: string[]; element: string; aiType?: string;
    isAlive: boolean;
  }>;
  combatState: {
    inCombat: boolean;
    currentTurn: number; // whose turn: 0..members-1 then enemy turn
    turnOrder: number[]; // characterIds in turn order
    turnDeadline: number; // timestamp when current turn expires
    whoseTurn: number; // characterId whose turn it is, 0 = enemy
    logs: string[];
    ended: boolean;
    victory: boolean;
    fled: boolean;
  };
  loot: Array<{ itemId: string; name: string; quality: string; claimedBy?: number }>;
  createdAt: number;
}

// ─── Constants ───
const TURN_TIMEOUT_MS = 10000; // 10 seconds per turn

// ─── In-Memory Store (partyId → instance) ───
const instances: Map<number, PartyDungeonInstance> = new Map();

// ─── Create Instance ───
export function createPartyDungeon(params: {
  partyId: number;
  layer: number;
  x: number;
  y: number;
  members: Array<{
    characterId: number; name: string; classId: string; level: number;
    hp: number; maxHp: number; mp: number; maxMp: number;
    atk: number; def: number; mag: number; mdef: number; agi: number; luk: number;
  }>;
}): PartyDungeonInstance {
  const { partyId, layer, x, y, members } = params;

  // Generate dungeon
  const dungeon = generateDungeon({ globalSeed: "default", layer, x, y });

  // Build member states
  const memberStates: Record<number, PartyMemberState> = {};
  for (const m of members) {
    memberStates[m.characterId] = {
      ...m,
      isAlive: true,
      isDefending: false,
      damageDealt: 0,
      healingDone: 0,
    };
  }

  const instance: PartyDungeonInstance = {
    instanceId: `pd_${partyId}_${Date.now()}`,
    partyId,
    dungeon,
    currentRoomId: dungeon.entranceId,
    exploredRooms: new Set([dungeon.entranceId]),
    memberStates,
    enemies: [],
    combatState: {
      inCombat: false,
      currentTurn: 0,
      turnOrder: members.map((m) => m.characterId),
      turnDeadline: 0,
      whoseTurn: 0,
      logs: [],
      ended: false,
      victory: false,
      fled: false,
    },
    loot: [],
    createdAt: Date.now(),
  };

  instances.set(partyId, instance);
  return instance;
}

// ─── Get Instance ───
export function getPartyDungeon(partyId: number): PartyDungeonInstance | undefined {
  return instances.get(partyId);
}

// ─── Move Room ───
export function moveRoom(partyId: number, characterId: number, targetRoomId: number): {
  success: boolean; message: string; roomData?: ReturnType<typeof buildRoomResponse>;
} {
  const inst = instances.get(partyId);
  if (!inst) return { success: false, message: "地牢实例不存在" };

  const currentRoom = inst.dungeon.rooms.find((r) => r.id === inst.currentRoomId);
  if (!currentRoom) return { success: false, message: "当前房间无效" };

  // Check if target is connected
  if (!currentRoom.connections.includes(targetRoomId)) {
    return { success: false, message: "该方向无法通行" };
  }

  // Cannot move during combat
  if (inst.combatState.inCombat) {
    return { success: false, message: "战斗中无法移动" };
  }

  // Move
  inst.currentRoomId = targetRoomId;
  inst.exploredRooms.add(targetRoomId);

  const targetRoom = inst.dungeon.rooms.find((r) => r.id === targetRoomId);
  if (targetRoom) {
    targetRoom.explored = true;
  }

  // Check for enemies in new room
  const enemies = targetRoom?.enemies || [];
  if (enemies.length > 0 && targetRoom && !targetRoom.cleared) {
    // Start combat
    inst.enemies = enemies.map((e) => ({ ...e, isAlive: e.hp > 0 }));
    inst.combatState.inCombat = true;
    inst.combatState.currentTurn = 0;
    inst.combatState.ended = false;
    inst.combatState.victory = false;
    inst.combatState.fled = false;
    inst.combatState.logs.push(`遭遇了 ${enemies.map((e) => e.name).join("、")}！`);

    // Set first turn
    startNewRound(inst);
  }

  const roomData = buildRoomResponse(inst);
  return { success: true, message: "移动成功", roomData };
}

// ─── Start New Round ───
function startNewRound(inst: PartyDungeonInstance): void {
  const aliveMembers = inst.combatState.turnOrder.filter(
    (id) => inst.memberStates[id]?.isAlive
  );
  if (aliveMembers.length === 0) return;

  inst.combatState.currentTurn = 0;
  inst.combatState.whoseTurn = aliveMembers[0];
  inst.combatState.turnDeadline = Date.now() + TURN_TIMEOUT_MS;
}

// ─── Advance Turn ───
function advanceTurn(inst: PartyDungeonInstance): void {
  const aliveMembers = inst.combatState.turnOrder.filter(
    (id) => inst.memberStates[id]?.isAlive
  );
  if (aliveMembers.length === 0) return;

  inst.combatState.currentTurn = (inst.combatState.currentTurn + 1) % aliveMembers.length;
  inst.combatState.whoseTurn = aliveMembers[inst.combatState.currentTurn];
  inst.combatState.turnDeadline = Date.now() + TURN_TIMEOUT_MS;
}

// ─── Check Turn Timeout ───
function checkTurnTimeout(inst: PartyDungeonInstance): void {
  if (!inst.combatState.inCombat || inst.combatState.ended) return;
  if (Date.now() < inst.combatState.turnDeadline) return;

  // Turn expired — auto-attack for the current player
  const charId = inst.combatState.whoseTurn;
  const member = inst.memberStates[charId];
  if (!member || !member.isAlive) {
    advanceTurn(inst);
    return;
  }

  const aliveEnemies = inst.enemies.filter((e) => e.isAlive);
  if (aliveEnemies.length === 0) {
    endCombat(inst, true, false);
    return;
  }

  const target = aliveEnemies[0];
  const baseDmg = Math.max(1, member.atk - target.def);
  const damage = Math.round(baseDmg * (0.9 + Math.random() * 0.2));
  target.hp = Math.max(0, target.hp - damage);
  target.isAlive = target.hp > 0;
  member.damageDealt += damage;

  inst.combatState.logs.push(
    `[超时] ${member.name} 自动攻击 ${target.name} 造成${damage}点伤害`
  );

  // Check if all enemies dead
  if (aliveEnemies.every((e) => !e.isAlive)) {
    endCombat(inst, true, false);
    const room = inst.dungeon.rooms.find((r) => r.id === inst.currentRoomId);
    if (room) room.cleared = true;
    return;
  }

  // Advance to next turn
  advanceTurn(inst);

  // If next is enemy turn (turnOrder cycles back to 0)
  const aliveOrder = inst.combatState.turnOrder.filter(
    (id) => inst.memberStates[id]?.isAlive
  );
  if (inst.combatState.currentTurn === 0) {
    enemyTurn(inst);
  }
}

// ─── Combat Action ───
export function combatAction(partyId: number, characterId: number, action: {
  type: "attack" | "skill" | "defend" | "flee";
  skillId?: string;
  targetIndex?: number;
}): { success: boolean; message: string; combatUpdate?: PartyDungeonInstance["combatState"] } {
  const inst = instances.get(partyId);
  if (!inst) return { success: false, message: "地牢实例不存在" };
  if (!inst.combatState.inCombat) return { success: false, message: "不在战斗中" };
  if (inst.combatState.ended) return { success: false, message: "战斗已结束" };

  // Check turn timeout first (auto-process expired turns)
  checkTurnTimeout(inst);
  if (inst.combatState.ended) {
    return { success: true, message: "战斗已结束", combatUpdate: inst.combatState };
  }

  const member = inst.memberStates[characterId];
  if (!member || !member.isAlive) return { success: false, message: "角色已阵亡" };

  // Check if it's this character's turn
  if (inst.combatState.whoseTurn !== characterId) {
    return { success: false, message: "不是你的回合" };
  }

  // Check if turn still valid (deadline passed during request)
  if (Date.now() > inst.combatState.turnDeadline + 5000) {
    return { success: false, message: "回合已超时" };
  }

  const { type, targetIndex = 0 } = action;
  const aliveEnemies = inst.enemies.filter((e) => e.isAlive);
  if (aliveEnemies.length === 0) {
    endCombat(inst, true, false);
    return { success: true, message: "所有敌人已被击败！", combatUpdate: inst.combatState };
  }

  const target = aliveEnemies[Math.min(targetIndex, aliveEnemies.length - 1)];
  const rng = () => 0.9 + Math.random() * 0.2; // 0.9 ~ 1.1

  switch (type) {
    case "attack": {
      const critChance = Math.min(member.luk * 0.002, 0.3);
      const isCrit = Math.random() < critChance;
      const baseDmg = Math.max(1, member.atk - target.def);
      const damage = Math.round(baseDmg * rng() * (isCrit ? 1.5 : 1));
      target.hp = Math.max(0, target.hp - damage);
      target.isAlive = target.hp > 0;
      member.damageDealt += damage;

      inst.combatState.logs.push(
        `${member.name} 对 ${target.name} ${isCrit ? "暴击！" : "造成"}${damage}点伤害`
      );
      break;
    }

    case "skill": {
      const skillDmg = Math.round(member.mag * 1.5 - target.mdef);
      const damage = Math.max(1, skillDmg);
      target.hp = Math.max(0, target.hp - damage);
      target.isAlive = target.hp > 0;
      member.damageDealt += damage;
      member.mp = Math.max(0, member.mp - 10);

      inst.combatState.logs.push(
        `${member.name} 对 ${target.name} 释放技能，造成${damage}点魔法伤害`
      );
      break;
    }

    case "defend": {
      member.isDefending = true;
      inst.combatState.logs.push(`${member.name} 进入防御姿态`);
      break;
    }

    case "flee": {
      const fleeChance = Math.min(0.3 + (member.agi - (aliveEnemies[0]?.agi || 0)) * 0.02, 0.8);
      if (Math.random() < fleeChance) {
        endCombat(inst, false, true);
        inst.combatState.logs.push(`${member.name} 成功逃跑！全队撤退到上一个房间`);
        return { success: true, message: "逃跑成功", combatUpdate: inst.combatState };
      }
      inst.combatState.logs.push(`${member.name} 逃跑失败！`);
      break;
    }
  }

  // Check if all enemies dead
  if (aliveEnemies.every((e) => !e.isAlive)) {
    endCombat(inst, true, false);
    const room = inst.dungeon.rooms.find((r) => r.id === inst.currentRoomId);
    if (room) room.cleared = true;
    return { success: true, message: "战斗胜利！", combatUpdate: inst.combatState };
  }

  // Advance turn
  advanceTurn(inst);

  // Enemy turn if all players have acted (turnOrder cycles back)
  const aliveOrder = inst.combatState.turnOrder.filter(
    (id) => inst.memberStates[id]?.isAlive
  );
  if (inst.combatState.currentTurn === 0 && inst.combatState.inCombat) {
    enemyTurn(inst);
  }

  // MP regen (5% per round)
  for (const m of Object.values(inst.memberStates)) {
    if (m.isAlive) {
      m.mp = Math.min(m.maxMp, Math.floor(m.mp + m.maxMp * 0.05));
    }
  }

  return { success: true, message: "行动执行", combatUpdate: inst.combatState };
}

// ─── Enemy Turn ───
function enemyTurn(inst: PartyDungeonInstance): void {
  const aliveEnemies = inst.enemies.filter((e) => e.isAlive);
  const aliveMembers = Object.values(inst.memberStates).filter((m) => m.isAlive);

  for (const enemy of aliveEnemies) {
    if (aliveMembers.length === 0) break;

    // Pick random target
    const target = aliveMembers[Math.floor(Math.random() * aliveMembers.length)];

    // Check dodge
    const dodgeChance = Math.min(target.agi * 0.003, 0.3);
    if (Math.random() < dodgeChance) {
      inst.combatState.logs.push(`${target.name} 闪避了 ${enemy.name} 的攻击！`);
      continue;
    }

    const defendMult = target.isDefending ? 0.5 : 1;
    const baseDmg = Math.max(1, enemy.atk - target.def);
    const damage = Math.round(baseDmg * (0.9 + Math.random() * 0.2) * defendMult);
    target.hp = Math.max(0, target.hp - damage);

    if (target.hp <= 0) {
      target.isAlive = false;
      inst.combatState.logs.push(`${enemy.name} 对 ${target.name} 造成${damage}点伤害，${target.name} 倒下了！`);
    } else {
      inst.combatState.logs.push(`${enemy.name} 对 ${target.name} 造成${damage}点伤害`);
    }
  }

  // Reset defend flags
  for (const m of Object.values(inst.memberStates)) {
    m.isDefending = false;
  }

  // Check if all members dead
  if (aliveMembers.every((m) => !m.isAlive)) {
    endCombat(inst, false, false);
    inst.combatState.logs.push("全队阵亡...");
    return;
  }

  // Start new player round
  startNewRound(inst);
}

// ─── End Combat ───
function endCombat(inst: PartyDungeonInstance, victory: boolean, fled: boolean): void {
  inst.combatState.inCombat = false;
  inst.combatState.ended = true;
  inst.combatState.victory = victory;
  inst.combatState.fled = fled;
  inst.combatState.turnDeadline = 0;
  inst.combatState.whoseTurn = 0;

  if (victory) {
    // Generate loot
    const room = inst.dungeon.rooms.find((r) => r.id === inst.currentRoomId);
    if (room?.loot) {
      for (const l of room.loot) {
        inst.loot.push({
          itemId: l.itemId,
          name: l.itemId,
          quality: l.quality || "common",
        });
      }
    }

    // Bonus loot for cleared room
    if (Math.random() < 0.5) {
      const qualities = ["common", "fine", "rare"];
      inst.loot.push({
        itemId: `random_${Date.now()}`,
        name: "随机掉落",
        quality: qualities[Math.floor(Math.random() * qualities.length)],
      });
    }
  }
}

// ─── Build Room Response ───
export function buildRoomResponse(inst: PartyDungeonInstance) {
  const room = inst.dungeon.rooms.find((r) => r.id === inst.currentRoomId);
  if (!room) return null;

  const directions = getRoomDirections(inst.dungeon.rooms, inst.currentRoomId);
  const aliveMembers = Object.values(inst.memberStates).filter((m) => m.isAlive);

  // Check turn timeout before returning state
  if (inst.combatState.inCombat && !inst.combatState.ended) {
    checkTurnTimeout(inst);
  }

  return {
    roomId: room.id,
    type: room.type,
    themeName: inst.dungeon.theme,
    directions,
    enemies: inst.combatState.inCombat
      ? inst.enemies.map((e) => ({
          id: e.id, name: e.name, hp: e.hp, maxHp: e.maxHp,
          isAlive: e.isAlive,
        }))
      : (room.enemies || []).map((e) => ({
          id: e.id, name: e.name, hp: e.hp, maxHp: e.maxHp, isAlive: true,
        })),
    loot: room.loot || [],
    isEntrance: room.isEntrance,
    isExit: room.isExit,
    inCombat: inst.combatState.inCombat,
    combatState: {
      ...inst.combatState,
      turnDeadline: inst.combatState.turnDeadline,
      whoseTurn: inst.combatState.whoseTurn,
    },
    memberStates: Object.values(inst.memberStates),
    aliveMemberCount: aliveMembers.length,
    exploredRoomCount: inst.exploredRooms.size,
    totalRooms: inst.dungeon.rooms.length,
  };
}

// ─── Cleanup ───
export function cleanupPartyDungeon(partyId: number): void {
  instances.delete(partyId);
}
