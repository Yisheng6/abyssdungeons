import {
  mysqlTable,
  serial,
  varchar,
  int,
  bigint,
  json,
  timestamp,
  boolean,
  text,
  index,
} from "drizzle-orm/mysql-core";

// ─── Users (managed by auth system) ───
export const users = mysqlTable("users", {
  id: serial("id").primaryKey(),
  unionId: varchar("union_id", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 50 }),
  avatar: varchar("avatar", { length: 255 }),
  role: varchar("role", { length: 20 }).default("user"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ─── Player Characters ───
export const characters = mysqlTable(
  "characters",
  {
    id: serial("id").primaryKey(),
    userId: bigint("user_id", { mode: "number", unsigned: true })
      .notNull()
      .references(() => users.id),
    name: varchar("name", { length: 32 }).notNull(),
    classId: varchar("class_id", { length: 20 }).notNull(),
    level: int("level").default(1).notNull(),
    exp: int("exp").default(0).notNull(),
    statPoints: int("stat_points").default(0).notNull(),
    skillPoints: int("skill_points").default(0).notNull(),
    gold: int("gold").default(0).notNull(),
    // Base stats (include class base + level growth + manual allocation)
    hp: int("hp").default(100).notNull(),
    maxHp: int("max_hp").default(100).notNull(),
    mp: int("mp").default(50).notNull(),
    maxMp: int("max_mp").default(50).notNull(),
    atk: int("atk").default(5).notNull(),
    def: int("def").default(5).notNull(),
    mag: int("mag").default(5).notNull(),
    mdef: int("mdef").default(5).notNull(),
    agi: int("agi").default(5).notNull(),
    luk: int("luk").default(5).notNull(),
    // Currently in dungeon?
    currentDungeon: json("current_dungeon").$type<{
      layer: number;
      x: number;
      y: number;
      seed: string;
      currentRoom: number;
      exploredRooms: number[];
      defeatedEnemies: number[];
      lootedChests: number[];
    } | null>(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  },
  (table) => [
    index("idx_char_user").on(table.userId),
    index("idx_char_class").on(table.classId),
  ]
);

// ─── Character Inventory ───
export const inventory = mysqlTable(
  "inventory",
  {
    id: serial("id").primaryKey(),
    characterId: bigint("character_id", { mode: "number", unsigned: true })
      .notNull()
      .references(() => characters.id),
    itemType: varchar("item_type", { length: 20 }).notNull(), // "equipment" | "consumable"
    itemId: varchar("item_id", { length: 50 }).notNull(), // references config id
    // For equipment: stored properties
    properties: json("properties").$type<{
      quality: string;
      prefix?: string;
      stats: Record<string, number>;
      specialEffect?: string;
      levelReq: number;
      slot: string;
    }>(),
    quantity: int("quantity").default(1).notNull(),
    isEquipped: boolean("is_equipped").default(false),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [index("idx_inv_char").on(table.characterId)]
);

// ─── Character Skills ───
export const characterSkills = mysqlTable(
  "character_skills",
  {
    id: serial("id").primaryKey(),
    characterId: bigint("character_id", { mode: "number", unsigned: true })
      .notNull()
      .references(() => characters.id),
    skillId: varchar("skill_id", { length: 50 }).notNull(),
    level: int("level").default(1).notNull(),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    index("idx_sk_char").on(table.characterId),
    index("idx_sk_skill").on(table.skillId),
  ]
);

// ─── Dungeon Run Records ───
export const dungeonRuns = mysqlTable(
  "dungeon_runs",
  {
    id: serial("id").primaryKey(),
    characterId: bigint("character_id", { mode: "number", unsigned: true })
      .notNull()
      .references(() => characters.id),
    layer: int("layer").notNull(),
    x: int("x").default(0).notNull(),
    y: int("y").default(0).notNull(),
    seed: varchar("seed", { length: 16 }).notNull(),
    status: varchar("status", { length: 20 }).default("active").notNull(), // active | completed | died | fled
    roomsCleared: int("rooms_cleared").default(0),
    monstersKilled: int("monsters_killed").default(0),
    lootGained: json("loot_gained").$type<string[]>(),
    startTime: timestamp("start_time").defaultNow(),
    endTime: timestamp("end_time"),
  },
  (table) => [
    index("idx_run_char").on(table.characterId),
    index("idx_run_seed").on(table.seed),
  ]
);

// ─── Leaderboard ───
export const leaderboard = mysqlTable(
  "leaderboard",
  {
    id: serial("id").primaryKey(),
    characterId: bigint("character_id", { mode: "number", unsigned: true })
      .notNull()
      .references(() => characters.id),
    category: varchar("category", { length: 30 }).notNull(), // "deepest_layer" | "speedrun" | "kills" | "wealth"
    value: int("value").notNull(),
    details: json("details").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    index("idx_lb_category").on(table.category, table.value),
    index("idx_lb_char").on(table.characterId),
  ]
);

// ─── Parties (组队系统) ───
export const parties = mysqlTable(
  "parties",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 50 }).notNull(),
    leaderId: bigint("leader_id", { mode: "number", unsigned: true }).notNull(),
    leaderName: varchar("leader_name", { length: 50 }).notNull(),
    status: varchar("status", { length: 20 }).default("recruiting").notNull(), // recruiting | in_dungeon | disbanded
    dungeonParams: json("dungeon_params").$type<{
      layer: number; x: number; y: number; globalSeed: string;
    }>(),
    maxMembers: int("max_members").default(4).notNull(),
    expiresAt: timestamp("expires_at"), // auto-disband if not in dungeon after 10min
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  },
  (table) => [
    index("idx_party_leader").on(table.leaderId),
    index("idx_party_status").on(table.status),
  ]
);

// ─── Party Members ───
export const partyMembers = mysqlTable(
  "party_members",
  {
    id: serial("id").primaryKey(),
    partyId: bigint("party_id", { mode: "number", unsigned: true })
      .notNull()
      .references(() => parties.id),
    characterId: bigint("character_id", { mode: "number", unsigned: true }).notNull(),
    characterName: varchar("character_name", { length: 50 }).notNull(),
    classId: varchar("class_id", { length: 20 }).notNull(),
    level: int("level").default(1).notNull(),
    isReady: boolean("is_ready").default(false),
    lastActiveAt: timestamp("last_active_at").defaultNow(),
    joinedAt: timestamp("joined_at").defaultNow(),
  },
  (table) => [
    index("idx_pm_party").on(table.partyId),
    index("idx_pm_char").on(table.characterId),
  ]
);

// ─── Party Dungeon Runs ───
export const partyDungeonRuns = mysqlTable(
  "party_dungeon_runs",
  {
    id: serial("id").primaryKey(),
    partyId: bigint("party_id", { mode: "number", unsigned: true }).notNull(),
    leaderId: bigint("leader_id", { mode: "number", unsigned: true }).notNull(),
    layer: int("layer").notNull(),
    x: int("x").notNull(),
    y: int("y").notNull(),
    seed: varchar("seed", { length: 16 }).notNull(),
    status: varchar("status", { length: 20 }).default("active").notNull(),
    roomsCleared: int("rooms_cleared").default(0),
    monstersKilled: int("monsters_killed").default(0),
    lootGained: json("loot_gained").$type<string[]>(),
    memberSnapshot: json("member_snapshot").$type<Record<number, { name: string; classId: string; level: number; damageDealt: number; healingDone: number }>>(),
    startTime: timestamp("start_time").defaultNow(),
    endTime: timestamp("end_time"),
  },
  (table) => [
    index("idx_pdr_party").on(table.partyId),
    index("idx_pdr_seed").on(table.seed),
  ]
);

// ─── Chat Messages ───
export const chatMessages = mysqlTable(
  "chat_messages",
  {
    id: serial("id").primaryKey(),
    channel: varchar("channel", { length: 20 }).notNull(), // world | area | party | guild | whisper
    senderId: bigint("sender_id", { mode: "number", unsigned: true }).notNull(),
    senderName: varchar("sender_name", { length: 50 }).notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    index("idx_chat_channel").on(table.channel, table.createdAt),
    index("idx_chat_sender").on(table.senderId),
  ]
);
