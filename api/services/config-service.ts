// ═══════════════════════════════════════════════
// Config Service - Unified Config Loader
// ═══════════════════════════════════════════════
// ARCHITECTURE PRINCIPLE:
//   game-configs/*.json  →  STATIC TEMPLATES (read-only, loaded once, cached)
//   MySQL/Redis          →  DYNAMIC RUNTIME DATA (player state, combat, etc.)
//   NEVER put player data, combat state, or mutable state in JSON files.
// ═══════════════════════════════════════════════

import { readFileSync } from "fs";
import { join } from "path";
import { getCachedConfig, setCachedConfig } from "./redis-service";

// ─── Config paths ───
const CONFIG_DIR = join(process.cwd(), "game-configs");
const CONFIG_FILES = {
  refs: "references.json",
  global: "global.json",
  classes: "classes.json",
  skills: "skills.json",
  items: "items.json",
  monsters: "monsters.json",
  dungeons: "dungeons.json",
} as const;

// ─── In-memory cache (process lifetime) ───
const memoryCache = new Map<string, unknown>();

// ═══════════════════════════════════════════════
// LOW-LEVEL: Load raw JSON (use getConfig() instead)
// ═══════════════════════════════════════════════
function loadRaw(filename: string): unknown {
  const path = join(CONFIG_DIR, filename);
  return JSON.parse(readFileSync(path, "utf-8"));
}

// ═══════════════════════════════════════════════
// CORE: Get config with 2-tier caching (Redis → Memory → Disk)
// ═══════════════════════════════════════════════
export async function getConfig<K extends keyof typeof CONFIG_FILES>(
  key: K
): Promise<unknown> {
  // Tier 1: Memory cache (fastest, process lifetime)
  if (memoryCache.has(key)) return memoryCache.get(key)!;

  // Tier 2: Redis cache (shared across instances)
  const redisCached = await getCachedConfig<unknown>(key);
  if (redisCached) {
    memoryCache.set(key, redisCached);
    return redisCached;
  }

  // Tier 3: Disk load (slowest, fallback)
  const data = loadRaw(CONFIG_FILES[key]);
  memoryCache.set(key, data);
  await setCachedConfig(key, data);
  return data;
}

// Synchronous version (for startup/seed, when cache is guaranteed warm)
export function getConfigSync<K extends keyof typeof CONFIG_FILES>(key: K): unknown {
  if (memoryCache.has(key)) return memoryCache.get(key)!;
  const data = loadRaw(CONFIG_FILES[key]);
  memoryCache.set(key, data);
  return data;
}

// Force reload (for hot-reload in dev / after config updates)
export async function reloadConfig<K extends keyof typeof CONFIG_FILES>(key: K): Promise<unknown> {
  memoryCache.delete(key);
  const data = loadRaw(CONFIG_FILES[key]);
  memoryCache.set(key, data);
  await setCachedConfig(key, data);
  return data;
}

// Warm all configs at startup
export function warmAllConfigs(): void {
  console.log("[Config] Warming all configs...");
  for (const key of Object.keys(CONFIG_FILES) as Array<keyof typeof CONFIG_FILES>) {
    getConfigSync(key);
  }
  console.log("[Config] All configs loaded into memory cache");
}

// ═══════════════════════════════════════════════
// HIGH-LEVEL: Typed config accessors
// ═══════════════════════════════════════════════

// ─── References (enums, naming rules) ───
export function getRefs() {
  return getConfigSync("refs") as {
    enums: {
      classIds: string[];
      skillTypes: string[];
      elements: string[];
      itemQualities: string[];
      itemSlots: string[];
      monsterTypes: string[];
      aiTypes: string[];
      roomTypes: string[];
      chatChannels: string[];
      leaderboardCategories: string[];
      statusEffects: string[];
    };
    namingRules: {
      idFormat: string;
      idPattern: string;
      maxIdLength: number;
    };
  };
}

// ─── Global Config (game constants) ───
export function getGlobalConfig() {
  return getConfigSync("global") as {
    player: {
      maxLevel: number; startingGold: number; statPointsPerLevel: number;
      skillPointsPerLevel: number; mpRegenPerTurnPercent: number;
      maxPartySize: number; maxCharactersPerAccount: number;
      inventorySlots: number;
    };
    combat: {
      critMultiplier: number; critRatePerLukPoint: number; maxCritRate: number;
      dodgeRatePerAgiPoint: number; maxDodgeRate: number;
      damageVarianceMin: number; damageVarianceMax: number;
      minDamage: number; fleeBaseChance: number; fleeAgiMultiplier: number;
      fleeMaxChance: number; defendDamageReduction: number;
      firstStrikeBonus: number; elementAdvantageMultiplier: number;
      elementDisadvantageMultiplier: number;
    };
    experience: { baseExpForLevel: number; expGrowthRate: number; partyBonusPercent: number };
    dungeon: {
      maxLayer: number; globalSeed: string;
      roomCount: { base: number; perLayer: number; randomBonus: number };
      deathPenalty: { loseExpPercent: number; keepItems: boolean; respawnLocation: string };
      fullExploreBonusPercent: number;
    };
    drop: { qualityWeights: Record<string, number>; eliteLootMultiplier: number; bossLootMultiplier: number };
    chat: { maxMessageLength: number; chatHistoryLimit: number; chatCooldownMs: number };
    switches: Record<string, boolean | number>;
    textTemplates: Record<string, string>;
  };
}

// ─── Classes ───
export function getClasses() {
  const data = getConfigSync("classes") as { classes: Array<{
    id: string; name: string; role: string; difficulty: string;
    description: string; baseStats: Record<string, number>;
    growthStats: Record<string, number>; skillTree: string[];
  }>};
  return data.classes;
}

export function getClassById(id: string) {
  return getClasses().find((c) => c.id === id);
}

// ─── Skills ───
export function getSkills() {
  const data = getConfigSync("skills") as { skills: Array<{
    id: string; name: string; classId: string; type: string;
    element: string; mpCost: number; cooldown: number;
    description: string; effect: Record<string, unknown>;
  }>};
  return data.skills;
}

export function getSkillsByClass(classId: string) {
  return getSkills().filter((s) => s.classId === classId);
}

export function getSkillById(id: string) {
  return getSkills().find((s) => s.id === id);
}

// ─── Items ───
export function getQualities() {
  const data = getConfigSync("items") as { itemQualities: Array<{ id: string; name: string; color: string; dropWeight: number }> };
  return data.itemQualities;
}

export function getConsumables() {
  const data = getConfigSync("items") as { consumables: Array<{ id: string; name: string; effect: Record<string, unknown>; stackSize: number }> };
  return data.consumables;
}

export function getEquipmentPrefixes() {
  const data = getConfigSync("items") as { equipmentPrefixes: Array<{ id: string; name: string; statModifiers?: Record<string, number>; specialEffect?: string; qualityMin: string }> };
  return data.equipmentPrefixes;
}

// ─── Monsters ───
// ─── Drop Item Type ───
export interface DropItem {
  itemId: string;
  name: string;
  type: "material" | "consumable" | "equipment" | "currency";
  chance: number;
  quantityMin: number;
  quantityMax: number;
  quality: string;
  minLayer?: number;
}

export function getEnemies() {
  const data = getConfigSync("monsters") as { enemies: Array<{
    id: string; family: string; name: string; baseLevel: number;
    isBoss?: boolean; phases?: number; baseStats: Record<string, number>;
    aiType: string; skills: string[]; element: string;
    dropTable?: DropItem[];
  }>};
  return data.enemies;
}

export function getEnemiesByFamily(family: string, includeBoss = false) {
  return getEnemies().filter((e) => e.family === family && (includeBoss || !e.isBoss));
}

export function getBossByFamily(family: string) {
  return getEnemies().find((e) => e.family === family && e.isBoss);
}

export function getEnemyById(id: string) {
  return getEnemies().find((e) => e.id === id);
}

// ─── Global Drop Pool ───
export function getGlobalDropPool(): DropItem[] {
  const data = getConfigSync("monsters") as { globalDropPool?: DropItem[] };
  return data.globalDropPool || [];
}

/** Roll drops for a killed enemy. Returns array of dropped items. */
export function rollDrops(enemyId: string, layer: number, rng: () => number = Math.random): Array<{
  itemId: string; name: string; type: string; quantity: number; quality: string;
}> {
  const enemy = getEnemyById(enemyId);
  if (!enemy) return [];

  const drops: Array<{ itemId: string; name: string; type: string; quantity: number; quality: string }> = [];
  const roll = (min: number, max: number) => Math.floor(min + rng() * (max - min + 1));

  // Personal drop table
  if (enemy.dropTable) {
    for (const drop of enemy.dropTable) {
      if (drop.minLayer && layer < drop.minLayer) continue;
      if (rng() * 100 < drop.chance) {
        drops.push({
          itemId: drop.itemId,
          name: drop.name,
          type: drop.type,
          quantity: roll(drop.quantityMin, drop.quantityMax),
          quality: drop.quality,
        });
      }
    }
  }

  // Global drop pool (each item rolls independently)
  const globalPool = getGlobalDropPool();
  for (const drop of globalPool) {
    if (drop.minLayer && layer < drop.minLayer) continue;
    if (rng() * 100 < drop.chance) {
      drops.push({
        itemId: drop.itemId,
        name: drop.name,
        type: drop.type,
        quantity: roll(drop.quantityMin, drop.quantityMax),
        quality: drop.quality,
      });
    }
  }

  return drops;
}

export function getAIType(id: string) {
  const data = getConfigSync("monsters") as { aiTypes: Array<{ id: string; name: string; description: string }> };
  return data.aiTypes.find((a) => a.id === id);
}

// ─── Dungeons ───
export function getRoomTypes() {
  const data = getConfigSync("dungeons") as { roomTypes: Array<{ id: string; name: string; probability: number; hasCombat: boolean; hasLoot?: boolean; lootBonus?: number; canRest?: boolean; isBoss?: boolean; isHidden?: boolean }> };
  return data.roomTypes;
}

export function getThemeByLayer(layer: number) {
  const data = getConfigSync("dungeons") as { dungeonThemes: Array<{ layerMin: number; layerMax: number; id: string; name: string; enemyFamilies: string[]; envModifier?: Record<string, unknown> }> };
  return data.dungeonThemes.find((t) => layer >= t.layerMin && layer <= t.layerMax);
}

export function getMapGenConfig() {
  const data = getConfigSync("dungeons") as { mapGen: { baseRoomCount: number; roomPerLayer: number; roomRandomBonus: number; connectivity: number; secretRoomChance: number } };
  return data.mapGen;
}

// ─── Element System ───
const ELEMENT_WEAKNESS: Record<string, string> = {
  fire: "wind", wind: "earth", earth: "water", water: "fire",
  light: "dark", dark: "light",
};

export function getElementMultiplier(attackerEl: string, defenderEl: string): number {
  const g = getGlobalConfig();
  if (!attackerEl || !defenderEl || attackerEl === "none" || defenderEl === "none") return 1;
  if (ELEMENT_WEAKNESS[defenderEl] === attackerEl) return g.combat.elementAdvantageMultiplier;
  if (ELEMENT_WEAKNESS[attackerEl] === defenderEl) return g.combat.elementDisadvantageMultiplier;
  return 1;
}

// ─── Experience Formula ───
export function getExpForLevel(level: number): number {
  const g = getGlobalConfig();
  return Math.floor(g.experience.baseExpForLevel * Math.pow(g.experience.expGrowthRate, level - 1));
}

// ─── Text Templates ───
export function renderTemplate(key: string, vars: Record<string, string | number>): string {
  const g = getGlobalConfig();
  let template = g.textTemplates[key] || key;
  Object.entries(vars).forEach(([k, v]) => {
    template = template.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
  });
  return template;
}

// ─── Feature Switches ───
export function isFeatureEnabled(feature: string): boolean {
  const g = getGlobalConfig();
  const val = g.switches[feature];
  return val === true || (typeof val === "number" && val > 0);
}
