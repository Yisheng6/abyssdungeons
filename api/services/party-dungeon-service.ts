import { generateDungeon, getRoomDirections, type DungeonMap } from "./mapgen-service";

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

interface PendingAction {
  type: "attack" | "skill" | "defend" | "flee";
  skillId?: string;
  targetIndex?: number;
}

export interface PartyDungeonInstance {
  instanceId: string;
  partyId: number;
  dungeon: DungeonMap;
  currentRoomId: number;
  exploredRooms: Set<number>;
  memberStates: Record<number, PartyMemberState>;
  enemies: Array<{
    id: string; name: string; hp: number; maxHp: number;
    mp: number; maxMp: number; atk: number; def: number;
    mag: number; mdef: number; agi: number; luk: number;
    skills: string[]; element: string; aiType?: string;
    isAlive: boolean;
  }>;
  combatState: {
    inCombat: boolean;
    phase: "player_input" | "executing" | "enemy";
    currentRound: number;
    turnOrder: number[];
    turnDeadline: number;
    pendingActions: Record<number, PendingAction>;
    submittedCount: number;
    logs: string[];
    ended: boolean;
    victory: boolean;
    fled: boolean;
  };
  loot: Array<{ itemId: string; name: string; quality: string; claimedBy?: number }>;
  createdAt: number;
}

const TURN_TIMEOUT_MS = 10000;

const instances: Map<number, PartyDungeonInstance> = new Map();

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
  const dungeon = generateDungeon({ globalSeed: "default", layer, x, y });

  const memberStates: Record<number, PartyMemberState> = {};
  for (const m of members) {
    memberStates[m.characterId] = { ...m, isAlive: true, isDefending: false, damageDealt: 0, healingDone: 0 };
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
      phase: "player_input",
      currentRound: 0,
      turnOrder: members.map((m) => m.characterId),
      turnDeadline: 0,
      pendingActions: {},
      submittedCount: 0,
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

export function getPartyDungeon(partyId: number): PartyDungeonInstance | undefined {
  return instances.get(partyId);
}

export function moveRoom(partyId: number, _characterId: number, targetRoomId: number): {
  success: boolean; message: string; roomData?: ReturnType<typeof buildRoomResponse>;
} {
  const inst = instances.get(partyId);
  if (!inst) return { success: false, message: "地牢实例不存在" };

  const currentRoom = inst.dungeon.rooms.find((r) => r.id === inst.currentRoomId);
  if (!currentRoom) return { success: false, message: "当前房间无效" };
  if (!currentRoom.connections.includes(targetRoomId)) return { success: false, message: "该方向无法通行" };
  if (inst.combatState.inCombat) return { success: false, message: "战斗中无法移动" };

  inst.currentRoomId = targetRoomId;
  inst.exploredRooms.add(targetRoomId);
  const targetRoom = inst.dungeon.rooms.find((r) => r.id === targetRoomId);
  if (targetRoom) targetRoom.explored = true;

  // Check for enemies
  const enemies = targetRoom?.enemies || [];
  if (enemies.length > 0 && targetRoom && !targetRoom.cleared) {
    inst.enemies = enemies.map((e) => ({ ...e, isAlive: e.hp > 0 }));
    inst.combatState.inCombat = true;
    inst.combatState.currentRound = 1;
    inst.combatState.phase = "player_input";
    inst.combatState.ended = false;
    inst.combatState.victory = false;
    inst.combatState.fled = false;
    inst.combatState.pendingActions = {};
    inst.combatState.submittedCount = 0;
    inst.combatState.logs.push(`遭遇了 ${enemies.map((e) => e.name).join("、")}！`);
    startPlayerInputPhase(inst);
  }

  return { success: true, message: "移动成功", roomData: buildRoomResponse(inst) };
}

// ─── Start Player Input Phase ───
function startPlayerInputPhase(inst: PartyDungeonInstance): void {
  const aliveMembers = inst.combatState.turnOrder.filter((id) => inst.memberStates[id]?.isAlive);
  inst.combatState.phase = "player_input";
  inst.combatState.turnDeadline = Date.now() + TURN_TIMEOUT_MS;
  inst.combatState.pendingActions = {};
  inst.combatState.submittedCount = 0;
  inst.combatState.logs.push(`第 ${inst.combatState.currentRound} 回合开始 — 请下达指令（10秒）`);
}

// ─── Check if all alive members have submitted actions ───
function checkAllSubmitted(inst: PartyDungeonInstance): boolean {
  const aliveMembers = inst.combatState.turnOrder.filter((id) => inst.memberStates[id]?.isAlive);
  return aliveMembers.every((id) => inst.combatState.pendingActions[id] !== undefined);
}

// ─── Process timeout: auto-attack for those who haven't submitted ───
function processTimeout(inst: PartyDungeonInstance): void {
  const aliveMembers = inst.combatState.turnOrder.filter((id) => inst.memberStates[id]?.isAlive);
  for (const charId of aliveMembers) {
    if (!inst.combatState.pendingActions[charId]) {
      inst.combatState.pendingActions[charId] = { type: "attack" };
      inst.combatState.submittedCount++;
      const member = inst.memberStates[charId];
      inst.combatState.logs.push(`[超时] ${member?.name || "队员"} 未下达指令，自动攻击`);
    }
  }
}

// ─── Execute all pending player actions ───
function executePlayerActions(inst: PartyDungeonInstance): void {
  inst.combatState.phase = "executing";
  const aliveOrder = inst.combatState.turnOrder.filter((id) => inst.memberStates[id]?.isAlive);

  for (const charId of aliveOrder) {
    const action = inst.combatState.pendingActions[charId];
    if (!action) continue;
    if (inst.combatState.ended) break;

    executeSingleAction(inst, charId, action);

    // Check victory after each action
    if (inst.enemies.every((e) => !e.isAlive)) {
      endCombat(inst, true, false);
      const room = inst.dungeon.rooms.find((r) => r.id === inst.currentRoomId);
      if (room) room.cleared = true;
      return;
    }
  }

  // Reset defend flags
  for (const m of Object.values(inst.memberStates)) {
    m.isDefending = false;
  }

  // If not ended, proceed to enemy phase
  if (!inst.combatState.ended) {
    enemyTurn(inst);
  }
}

// ─── Execute a single action ───
function executeSingleAction(inst: PartyDungeonInstance, characterId: number, action: PendingAction): void {
  const member = inst.memberStates[characterId];
  if (!member || !member.isAlive) return;

  const aliveEnemies = inst.enemies.filter((e) => e.isAlive);
  if (aliveEnemies.length === 0) return;

  const target = aliveEnemies[Math.min(action.targetIndex || 0, aliveEnemies.length - 1)];
  const rng = () => 0.9 + Math.random() * 0.2;

  switch (action.type) {
    case "attack": {
      const critChance = Math.min(member.luk * 0.002, 0.3);
      const isCrit = Math.random() < critChance;
      const baseDmg = Math.max(1, member.atk - target.def);
      const damage = Math.round(baseDmg * rng() * (isCrit ? 1.5 : 1));
      target.hp = Math.max(0, target.hp - damage);
      target.isAlive = target.hp > 0;
      member.damageDealt += damage;
      inst.combatState.logs.push(`${member.name} 对 ${target.name} ${isCrit ? "暴击！" : "造成"}${damage}点伤害`);
      break;
    }
    case "skill": {
      const skillDmg = Math.round(member.mag * 1.5 - target.mdef);
      const damage = Math.max(1, skillDmg);
      target.hp = Math.max(0, target.hp - damage);
      target.isAlive = target.hp > 0;
      member.damageDealt += damage;
      member.mp = Math.max(0, member.mp - 10);
      inst.combatState.logs.push(`${member.name} 对 ${target.name} 释放技能，造成${damage}点魔法伤害`);
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
        inst.combatState.logs.push(`${member.name} 带领全队成功逃跑！`);
        return;
      }
      inst.combatState.logs.push(`${member.name} 逃跑失败！`);
      break;
    }
  }
}

// ─── Enemy Turn ───
function enemyTurn(inst: PartyDungeonInstance): void {
  inst.combatState.phase = "enemy";
  const aliveEnemies = inst.enemies.filter((e) => e.isAlive);
  const aliveMembers = Object.values(inst.memberStates).filter((m) => m.isAlive);

  for (const enemy of aliveEnemies) {
    if (aliveMembers.length === 0) break;
    const target = aliveMembers[Math.floor(Math.random() * aliveMembers.length)];
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

  // Check total defeat
  if (Object.values(inst.memberStates).filter((m) => m.isAlive).length === 0) {
    endCombat(inst, false, false);
    inst.combatState.logs.push("全队阵亡...");
    return;
  }

  // MP regen 5%
  for (const m of Object.values(inst.memberStates)) {
    if (m.isAlive) m.mp = Math.min(m.maxMp, Math.floor(m.mp + m.maxMp * 0.05));
  }

  // Start next round
  if (!inst.combatState.ended) {
    inst.combatState.currentRound++;
    startPlayerInputPhase(inst);
  }
}

// ─── Combat Action (collect phase) ───
export function combatAction(partyId: number, characterId: number, action: {
  type: "attack" | "skill" | "defend" | "flee";
  skillId?: string;
  targetIndex?: number;
}): { success: boolean; message: string; combatUpdate?: PartyDungeonInstance["combatState"] } {
  const inst = instances.get(partyId);
  if (!inst) return { success: false, message: "地牢实例不存在" };
  if (!inst.combatState.inCombat) return { success: false, message: "不在战斗中" };
  if (inst.combatState.ended) return { success: false, message: "战斗已结束" };

  // Check timeout first
  if (inst.combatState.phase === "player_input" && Date.now() > inst.combatState.turnDeadline) {
    processTimeout(inst);
    if (checkAllSubmitted(inst)) {
      executePlayerActions(inst);
    }
    return { success: true, message: "回合已超时，自动执行", combatUpdate: getCombatStateForClient(inst) };
  }

  const member = inst.memberStates[characterId];
  if (!member || !member.isAlive) return { success: false, message: "角色已阵亡" };

  if (inst.combatState.phase !== "player_input") {
    return { success: false, message: "当前不是指令输入阶段" };
  }

  // Already submitted?
  if (inst.combatState.pendingActions[characterId]) {
    return { success: false, message: "你已经下达了指令" };
  }

  // Store action
  inst.combatState.pendingActions[characterId] = action;
  inst.combatState.submittedCount++;
  inst.combatState.logs.push(`${member.name} 已下达指令：${action.type === "attack" ? "攻击" : action.type === "skill" ? "技能" : action.type === "defend" ? "防御" : "逃跑"}`);

  // Check if all alive members have submitted
  if (checkAllSubmitted(inst)) {
    inst.combatState.logs.push("全员指令已下达，开始执行！");
    executePlayerActions(inst);
  }

  return { success: true, message: "指令已下达", combatUpdate: getCombatStateForClient(inst) };
}

// ─── End Combat ───
function endCombat(inst: PartyDungeonInstance, victory: boolean, fled: boolean): void {
  inst.combatState.inCombat = false;
  inst.combatState.ended = true;
  inst.combatState.victory = victory;
  inst.combatState.fled = fled;
  inst.combatState.phase = "player_input";
  inst.combatState.turnDeadline = 0;

  if (victory) {
    const room = inst.dungeon.rooms.find((r) => r.id === inst.currentRoomId);
    if (room?.loot) {
      for (const l of room.loot) {
        inst.loot.push({ itemId: l.itemId, name: l.itemId, quality: l.quality || "common" });
      }
    }
    if (Math.random() < 0.5) {
      const qualities = ["common", "fine", "rare"];
      inst.loot.push({ itemId: `random_${Date.now()}`, name: "随机掉落", quality: qualities[Math.floor(Math.random() * qualities.length)] });
    }
  }
}

// ─── Get combat state for client (check timeout) ───
function getCombatStateForClient(inst: PartyDungeonInstance): PartyDungeonInstance["combatState"] {
  // Auto-process timeout if in player_input phase
  if (inst.combatState.phase === "player_input" && Date.now() > inst.combatState.turnDeadline) {
    processTimeout(inst);
    if (checkAllSubmitted(inst) && !inst.combatState.ended) {
      executePlayerActions(inst);
    }
  }
  return inst.combatState;
}

// ─── Build Room Response ───
export function buildRoomResponse(inst: PartyDungeonInstance) {
  const room = inst.dungeon.rooms.find((r) => r.id === inst.currentRoomId);
  if (!room) return null;

  const directions = getRoomDirections(inst.dungeon.rooms, inst.currentRoomId);
  const aliveMembers = Object.values(inst.memberStates).filter((m) => m.isAlive);

  // Check timeout
  const combatState = getCombatStateForClient(inst);

  return {
    roomId: room.id,
    type: room.type,
    themeName: inst.dungeon.theme,
    directions,
    enemies: combatState.inCombat
      ? inst.enemies.map((e) => ({ id: e.id, name: e.name, hp: e.hp, maxHp: e.maxHp, isAlive: e.isAlive }))
      : (room.enemies || []).map((e) => ({ id: e.id, name: e.name, hp: e.hp, maxHp: e.maxHp, isAlive: true })),
    loot: room.loot || [],
    isEntrance: room.isEntrance,
    isExit: room.isExit,
    inCombat: combatState.inCombat,
    combatState: {
      phase: combatState.phase,
      currentRound: combatState.currentRound,
      turnDeadline: combatState.turnDeadline,
      pendingActions: combatState.pendingActions,
      submittedCount: combatState.submittedCount,
      logs: combatState.logs,
      ended: combatState.ended,
      victory: combatState.victory,
      fled: combatState.fled,
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
