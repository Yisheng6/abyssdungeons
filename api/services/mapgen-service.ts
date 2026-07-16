import crypto from "crypto";
import {
  getEnemiesByFamily,
  getBossByFamily,
  getRoomTypes,
  getThemeByLayer,
} from "./config-service";

// ─── Types ───
export interface DungeonMap {
  seed: string;
  layer: number;
  x: number;
  y: number;
  globalSeed: string;
  roomCount: number;
  entranceId: number;
  bossRoomId: number;
  rooms: DungeonRoom[];
  theme: string;
}

export interface DungeonRoom {
  id: number;
  type: string;
  x: number;
  y: number;
  connections: number[]; // connected room ids
  enemies?: Array<{
    id: string; name: string;
    hp: number; maxHp: number; mp: number; maxMp: number;
    atk: number; def: number; mag: number; mdef: number;
    agi: number; luk: number;
    skills: string[]; element: string; aiType?: string;
    dropTable?: Array<{
      itemId: string; name: string; type: string; chance: number;
      quantityMin: number; quantityMax: number; quality: string; minLayer?: number;
    }>;
  }>;
  loot?: Array<{ itemId: string; quality?: string; quantity: number }>;
  explored: boolean;
  cleared: boolean;
  isEntrance: boolean;
  isExit: boolean;
}

// ─── Deterministic RNG ───
class SeededRNG {
  private seed: string;
  constructor(seed: string) {
    this.seed = seed;
  }
  next(): number {
    this.seed = crypto
      .createHash("sha256")
      .update(this.seed)
      .digest("hex")
      .slice(0, 16);
    return parseInt(this.seed, 16) / 0xffffffffffffffff;
  }
  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }
  pickOne<T>(arr: T[]): T {
    return arr[this.nextInt(0, arr.length - 1)];
  }
  pickMany<T>(arr: T[], count: number): T[] {
    const shuffled = [...arr].sort(() => this.next() - 0.5);
    return shuffled.slice(0, count);
  }
}

// ─── Monster Stat Scaling ───

/** Scale monster base stats by layer and room type.
 *
 *  Formula (all attributes): round(baseStat × eliteMult × layerMult)
 *
 *  Where:
 *    eliteMult = 1 (normal) | 1.5 (elite) | 3 (boss atk/def/mag/mdef only)
 *    layerMult = 1 + (layer - 1) × perLayerGrowth
 *
 *  HP uses an additional hpMult on top.
 *  Bosses get ×3 to atk/def/mag/mdef and ×8 to HP.
 *
 *  Rounding: Math.round() (四舍五入)
 */
function scaleMonsterStats(
  base: Record<string, number>,
  options: {
    layer: number;
    isElite: boolean;
    isBoss: boolean;
    perLayerGrowth: number;
  }
): {
  hp: number; maxHp: number; mp: number; maxMp: number;
  atk: number; def: number; mag: number; mdef: number;
  agi: number; luk: number;
} {
  const { layer, isElite, isBoss, perLayerGrowth } = options;

  const layerMult = 1 + (layer - 1) * perLayerGrowth;
  const eliteMult = isBoss ? 1 : isElite ? 1.5 : 1;
  const bossAtkMult = isBoss ? 3 : 1;
  const bossHpMult = isBoss ? 8 : 1;

  const s = (v: number, m = 1) => Math.round(v * eliteMult * layerMult * m);

  return {
    hp:    s(base.hp  ?? 30, bossHpMult),
    maxHp: s(base.hp  ?? 30, bossHpMult),
    mp:    base.mp   ?? 0,
    maxMp: base.mp   ?? 0,
    atk:   s(base.atk  ?? 5, bossAtkMult),
    def:   s(base.def  ?? 3, bossAtkMult),
    mag:   s(base.mag  ?? 0, bossAtkMult),
    mdef:  s(base.mdef ?? 2, bossAtkMult),
    agi:   s(base.agi  ?? 5),
    luk:   s(base.luk  ?? 3),
  };
}

// ─── Dungeon Generation ───

const DIRECTIONS = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
]; // N, E, S, W

/**
 * Generate a deterministic dungeon map.
 * Same (globalSeed, layer, x, y) always produces the same dungeon.
 */
export function generateDungeon(params: {
  globalSeed: string;
  layer: number;
  x: number;
  y: number;
}): DungeonMap {
  const { globalSeed, layer, x, y } = params;

  // Deterministic seed: hash(globalSeed + layer + x + y)
  const seedInput = `${globalSeed}:${layer}:${x}:${y}`;
  const seed = crypto
    .createHash("sha256")
    .update(seedInput)
    .digest("hex")
    .slice(0, 16);

  const rng = new SeededRNG(seed);

  // Get config
  const roomTypes = getRoomTypes();
  const theme = getThemeByLayer(layer);
  const themeName = theme?.id || "cave";

  // Determine number of rooms based on layer
  const baseRoomCount = 8;
  const roomPerLayer = 3;
  const roomCount =
    baseRoomCount +
    (layer - 1) * roomPerLayer +
    rng.nextInt(-1, 2);

  // Generate rooms using modified Prim's algorithm
  const rooms: DungeonRoom[] = [];

  // Start with entrance room
  const entranceRoom: DungeonRoom = {
    id: 0,
    type: "entrance",
    x: 0,
    y: 0,
    connections: [],
    explored: false,
    cleared: false,
    isEntrance: true,
    isExit: false,
  };
  rooms.push(entranceRoom);

  // Use Prim-like algorithm to grow the dungeon
  const frontier: Array<{ x: number; y: number; parentId: number }> = [];

  // Add initial neighbors
  for (const [dx, dy] of DIRECTIONS) {
    frontier.push({ x: dx, y: dy, parentId: 0 });
  }

  while (rooms.length < roomCount && frontier.length > 0) {
    // Pick a random frontier cell
    const idx = rng.nextInt(0, frontier.length - 1);
    const cell = frontier[idx];
    frontier.splice(idx, 1);

    // Check if position is already occupied
    if (rooms.some((r) => r.x === cell.x && r.y === cell.y)) {
      continue;
    }

    // Create new room
    const roomId = rooms.length;

    // Assign room type
    let roomType = "normal";
    if (roomId === roomCount - 1) {
      roomType = "boss";
    } else if (rng.next() < 0.15) {
      roomType = rng.pickOne(["treasure", "trap", "shrine"]);
    } else if (rng.next() < 0.2) {
      roomType = "elite";
    } else if (rng.next() < 0.15) {
      roomType = "safe";
    }

    const room: DungeonRoom = {
      id: roomId,
      type: roomType,
      x: cell.x,
      y: cell.y,
      connections: [cell.parentId],
      explored: false,
      cleared: false,
      isEntrance: false,
      isExit: false,
    };
    rooms.push(room);

    // Bidirectional connection
    rooms[cell.parentId].connections.push(roomId);

    // Add new neighbors to frontier
    for (const [dx, dy] of DIRECTIONS) {
      frontier.push({ x: cell.x + dx, y: cell.y + dy, parentId: roomId });
    }
  }

  // 3. Assign boss room (furthest from entrance by path distance)
  let bossRoomId = rooms.length - 1;
  let maxDist = 0;
  for (let i = 1; i < rooms.length; i++) {
    const dist = getRoomDistance(rooms, 0, i);
    if (dist > maxDist) {
      maxDist = dist;
      bossRoomId = i;
    }
  }
  rooms[bossRoomId].type = "boss";

  // 4. Populate enemies and loot
  populateRooms(rooms, layer, themeName, rng);

  // 5. Mark exit
  rooms[bossRoomId].isExit = true;

  return {
    seed,
    layer,
    x,
    y,
    globalSeed,
    roomCount: rooms.length,
    entranceId: 0,
    bossRoomId,
    rooms,
    theme: themeName,
  };
}

/**
 * Get distance between two rooms using BFS
 */
function getRoomDistance(
  rooms: DungeonRoom[],
  from: number,
  to: number
): number {
  const visited = new Set<number>();
  const queue: Array<{ id: number; dist: number }> = [{ id: from, dist: 0 }];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.id === to) return current.dist;
    if (visited.has(current.id)) continue;
    visited.add(current.id);

    for (const conn of rooms[current.id].connections) {
      if (!visited.has(conn)) {
        queue.push({ id: conn, dist: current.dist + 1 });
      }
    }
  }

  return Infinity;
}

/**
 * Populate rooms with enemies and loot
 */
function populateRooms(
  rooms: DungeonRoom[],
  layer: number,
  family: string,
  rng: SeededRNG
): void {
  for (const room of rooms) {
    if (room.type === "entrance" || room.type === "safe") {
      continue;
    }

    const level = Math.floor(layer * 1.5 + rng.nextInt(-2, 2));

    if (room.type === "boss") {
      const boss = getBossByFamily(family);
      if (boss) {
        const scaled = scaleMonsterStats(boss.baseStats, {
          layer, isElite: false, isBoss: true, perLayerGrowth: 0.10,
        });
        room.enemies = [{
          id: boss.id, name: boss.name,
          ...scaled,
          skills: boss.skills, element: boss.element, aiType: boss.aiType,
        }];
      }
    } else {
      const enemies = getEnemiesByFamily(family);
      if (enemies.length > 0) {
        const count = room.type === "elite" ? rng.nextInt(1, 2) : rng.nextInt(1, 3);
        room.enemies = [];
        for (let i = 0; i < count; i++) {
          const template = rng.pickOne(enemies);
          const scaled = scaleMonsterStats(template.baseStats, {
            layer, isElite: room.type === "elite", isBoss: false, perLayerGrowth: 0.08,
          });
          room.enemies.push({
            id: template.id, name: template.name,
            ...scaled,
            skills: template.skills, element: template.element, aiType: template.aiType,
            dropTable: template.dropTable,
          });
        }
      }
    }

    // Add loot based on room type
    if (room.type === "treasure" || room.type === "boss") {
      const lootCount = room.type === "boss" ? rng.nextInt(2, 4) : 1;
      room.loot = [];
      for (let i = 0; i < lootCount; i++) {
        room.loot.push({
          itemId: `loot_${family}_${rng.nextInt(1, 5)}`,
          quality: rng.pickOne(["common", "fine", "rare"]),
          quantity: rng.nextInt(1, 3),
        });
      }
    } else if (rng.next() < 0.3) {
      // 30% chance for random loot in normal rooms
      room.loot = [
        {
          itemId: `consumable_${rng.nextInt(1, 3)}`,
          quantity: rng.nextInt(1, 2),
        },
      ];
    }
  }
}

/**
 * Get available directions from a room
 */
export function getRoomDirections(
  rooms: DungeonRoom[],
  roomId: number
): Array<{ direction: string; roomId: number }> {
  const room = rooms[roomId];
  if (!room) return [];

  const directions: Array<{ direction: string; roomId: number }> = [];

  for (const connId of room.connections) {
    const conn = rooms[connId];
    if (!conn) continue;

    const dx = conn.x - room.x;
    const dy = conn.y - room.y;

    let dir = "未知";
    if (dx === 0 && dy < 0) dir = "北";
    else if (dx > 0 && dy === 0) dir = "东";
    else if (dx === 0 && dy > 0) dir = "南";
    else if (dx < 0 && dy === 0) dir = "西";
    else if (dx > 0 && dy < 0) dir = "东北";
    else if (dx > 0 && dy > 0) dir = "东南";
    else if (dx < 0 && dy < 0) dir = "西北";
    else if (dx < 0 && dy > 0) dir = "西南";

    directions.push({ direction: dir, roomId: connId });
  }

  return directions;
}

/**
 * Get room type display name
 */
export function getRoomTypeName(type: string): string {
  const names: Record<string, string> = {
    entrance: "入口",
    normal: "普通房间",
    elite: "精英房间",
    boss: "Boss房间",
    treasure: "宝箱房间",
    trap: "陷阱房间",
    safe: "安全房间",
    shrine: "祭坛房间",
    merchant: "商人房间",
    hidden: "隐藏房间",
  };
  return names[type] || type;
}
