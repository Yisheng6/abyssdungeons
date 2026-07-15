// Central config loader - all game data loaded from JSON files
// This ensures NO hardcoded game data in source code
import classesData from "./classes.json";
import skillsData from "./skills.json";
import itemsData from "./items.json";
import monstersData from "./monsters.json";
import dungeonsData from "./dungeons.json";

export const GameConfig = {
  classes: classesData.classes,
  skills: skillsData.skills,
  itemQualities: itemsData.itemQualities,
  itemSlots: itemsData.itemSlots,
  consumables: itemsData.consumables,
  equipmentPrefixes: itemsData.equipmentPrefixes,
  monsterTypes: monstersData.monsterTypes,
  aiTypes: monstersData.aiTypes,
  enemies: monstersData.enemies,
  roomTypes: dungeonsData.roomTypes,
  dungeonThemes: dungeonsData.dungeonThemes,
  mapGen: dungeonsData.mapGen,
} as const;

// Helper functions
export function getClassById(id: string) {
  return GameConfig.classes.find((c) => c.id === id);
}

export function getSkillsByClass(classId: string) {
  return GameConfig.skills.filter((s) => s.classId === classId);
}

export function getSkillById(id: string) {
  return GameConfig.skills.find((s) => s.id === id);
}

export function getEnemyById(id: string) {
  return GameConfig.enemies.find((e) => e.id === id);
}

export function getEnemiesByFamily(family: string) {
  return GameConfig.enemies.filter((e) => e.family === family && !e.isBoss);
}

export function getBossByFamily(family: string) {
  return GameConfig.enemies.find((e) => e.family === family && e.isBoss);
}

export function getThemeByLayer(layer: number) {
  return GameConfig.dungeonThemes.find(
    (t) => layer >= t.layerMin && layer <= t.layerMax
  );
}

export function getConsumableById(id: string) {
  return GameConfig.consumables.find((c) => c.id === id);
}

export function getQualityConfig(id: string) {
  return GameConfig.itemQualities.find((q) => q.id === id);
}

// Element weakness cycle: fire > wind > earth > water > fire
// light <> dark
const elementWeakness: Record<string, string> = {
  fire: "wind",
  wind: "earth",
  earth: "water",
  water: "fire",
  light: "dark",
  dark: "light",
};

export function getElementWeakness(element: string): string | null {
  return elementWeakness[element] || null;
}

export function isElementStrong(
  attackerElement: string,
  defenderElement: string
): boolean {
  return elementWeakness[defenderElement] === attackerElement;
}
