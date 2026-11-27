// 角色操作服务：所有改动角色数据的操作唯一实现（服务端权威）
// 客户端页面一律通过 char.* 接口调用；操作后由 applyRecompute 重算属性
import { randomBytes } from "crypto";
import { getItemById, getSkillById, getClassById, getTierRules } from "./config-service";
import {
  applyRecompute, gainExp, recomputePlayer, effectiveStats, equipReqLevel, getExpNeed,
} from "./character-service";
import { serverUid, removeItemsById, addItemToInventory, type PersistedState } from "./char-state-service";
import { TASKS } from "../../src/lib/tasks";
import { canLearnTalent, getSpentTalentPoints, getRespecCost } from "../../src/lib/talents";
import {
  QUALITY_MAX_AFFIXES, REFORGE_DIAMOND_COST, getReforgeGoldCost, rollAffixes, extractMainStats,
} from "../../src/lib/affixes";

// ─── 与客户端一致的静态表 ───
const DEFAULT_CLASS_STATS: Record<string, Record<string, number>> = {
  warrior:  { hp: 150, mp: 30, atk: 15, def: 12, mag: 2, mdef: 8, agi: 6, luk: 5, con: 12, wil: 5 },
  mage:     { hp: 80,  mp: 100, atk: 5, def: 4, mag: 18, mdef: 12, agi: 7, luk: 8, con: 4, wil: 14 },
  assassin: { hp: 100, mp: 50, atk: 18, def: 6, mag: 4, mdef: 5, agi: 16, luk: 10, con: 6, wil: 7 },
  ranger:   { hp: 110, mp: 45, atk: 14, def: 7, mag: 6, mdef: 7, agi: 14, luk: 9, con: 8, wil: 8 },
  priest:   { hp: 100, mp: 80, atk: 6, def: 6, mag: 14, mdef: 14, agi: 6, luk: 7, con: 6, wil: 14 },
  warlock:  { hp: 90,  mp: 90, atk: 7, def: 5, mag: 16, mdef: 10, agi: 8, luk: 12, con: 5, wil: 12 },
};
const STARTER_SKILLS: Record<string, string[]> = {
  warrior: ['shield_bash', 'heavy_strike'],
  mage: ['fireball', 'frostbolt'],
  assassin: ['shadow_step', 'backstab'],
  ranger: ['aimed_shot', 'multishot'],
  priest: ['heal', 'holy_light'],
  warlock: ['corruption', 'life_drain'],
};
const CLASS_TIER_MATS: Record<string, Array<{ id: string; name: string; count: number } | null>> = {
  warrior:  [null, null, null, null, null, { id: 'war_blood', name: '战神之血', count: 3 }, { id: 'war_blood', name: '战神之血', count: 6 }, { id: 'war_soul', name: '不灭战魂', count: 3 }, { id: 'war_soul', name: '不灭战魂', count: 6 }],
  mage:     [null, null, null, null, null, { id: 'elemental_crystal', name: '元素魔晶', count: 3 }, { id: 'elemental_crystal', name: '元素魔晶', count: 6 }, { id: 'arcane_essence', name: '奥术之源', count: 3 }, { id: 'arcane_essence', name: '奥术之源', count: 6 }],
  assassin: [null, null, null, null, null, { id: 'shadow_fang', name: '暗影之牙', count: 3 }, { id: 'shadow_fang', name: '暗影之牙', count: 6 }, { id: 'void_soul', name: '虚无之魂', count: 3 }, { id: 'void_soul', name: '虚无之魂', count: 6 }],
  ranger:   [null, null, null, null, null, { id: 'storm_feather', name: '风暴翎羽', count: 3 }, { id: 'storm_feather', name: '风暴翎羽', count: 6 }, { id: 'beast_spirit', name: '万兽之魄', count: 3 }, { id: 'beast_spirit', name: '万兽之魄', count: 6 }],
  priest:   [null, null, null, null, null, { id: 'holy_crystal', name: '圣光结晶', count: 3 }, { id: 'holy_crystal', name: '圣光结晶', count: 6 }, { id: 'divine_grace', name: '神恩之露', count: 3 }, { id: 'divine_grace', name: '神恩之露', count: 6 }],
  warlock:  [null, null, null, null, null, { id: 'demon_horn', name: '恶魔之角', count: 3 }, { id: 'demon_horn', name: '恶魔之角', count: 6 }, { id: 'abyss_core', name: '深渊之核', count: 3 }, { id: 'abyss_core', name: '深渊之核', count: 6 }],
};
const ENHANCE_MAX_LEVEL = 15;
const ENHANCE_SUCCESS_RATES = [100, 100, 100, 90, 90, 80, 75, 70, 60, 50, 45, 40, 35, 30, 25];
function getEnhanceCost(level: number): { stoneId: string; stoneName: string; count: number } {
  if (level < 5) return { stoneId: 'enhance_stone_low', stoneName: '下级强化石', count: level + 1 };
  if (level < 10) return { stoneId: 'enhance_stone_mid', stoneName: '中级强化石', count: level - 3 };
  return { stoneId: 'enhance_stone_high', stoneName: '上级强化石', count: level - 7 };
}
const EQUIP_SLOTS = ['weapon', 'helmet', 'armor', 'leggings', 'boots', 'necklace', 'ring1', 'ring2'];
const DEFAULT_EQUIPMENT: Record<string, any> = {
  weapon: null, helmet: null, armor: null, leggings: null, boots: null, necklace: null, ring1: null, ring2: null,
};
const GEM_SOCKETS: Record<string, number> = { common: 0, fine: 1, rare: 1, epic: 2, legendary: 2, mythic: 3, eternal: 3 };
const DISASSEMBLE_GOLD: Record<string, number> = { common: 20, fine: 50, rare: 120, epic: 300, legendary: 800, mythic: 2000, eternal: 4000 };

export type OpResult = { success: boolean; message: string };

function fail(message: string): OpResult { return { success: false, message }; }
function ok(message: string): OpResult { return { success: true, message }; }

function requirePlayer(s: PersistedState): any | null {
  return s.player && s.player.classId ? s.player : null;
}
function syncClassSave(s: PersistedState) {
  if (s.activeClassId && s.player) {
    s.classSaves = { ...(s.classSaves || {}) };
    s.classSaves[s.activeClassId] = { player: s.player, equipment: s.equipment };
  }
}
function findEquipmentAnywhere(s: PersistedState, uid: string): { item: any; invIdx: number; equipSlot: string | null } {
  const inv = s.inventory || [];
  const invIdx = inv.findIndex((i) => i.uid === uid);
  if (invIdx >= 0) return { item: inv[invIdx], invIdx, equipSlot: null };
  for (const [slot, eq] of Object.entries(s.equipment || {})) {
    if (eq && (eq as any).uid === uid) return { item: eq, invIdx: -1, equipSlot: slot };
  }
  return { item: null, invIdx: -1, equipSlot: null };
}

// ═══ 创建角色 / 转职 ═══
export function opCreatePlayer(s: PersistedState, classId: string, playerName: string): OpResult {
  const cls = getClassById(classId) as { baseStats?: Record<string, number> } | undefined;
  const stats = cls?.baseStats || DEFAULT_CLASS_STATS[classId] || DEFAULT_CLASS_STATS.warrior;
  const name = s.playerName || playerName || '冒险者';
  const newPlayer: any = {
    id: `p_${Date.now()}`, name, classId, level: 1,
    hp: stats.hp || 100, maxHp: stats.hp || 100,
    mp: stats.mp || 50, maxMp: stats.mp || 50,
    atk: stats.atk || 10, def: stats.def || 10,
    mag: stats.mag || 10, mdef: stats.mdef || 8,
    agi: stats.agi || 10, luk: stats.luk || 5,
    con: stats.con ?? 6, wil: stats.wil ?? 6,
    skills: [...(STARTER_SKILLS[classId] || [])], element: 'none',
    exp: 0, gold: 100, diamonds: 0, tier: 1, maxLayer: 1,
  };
  s.player = newPlayer;
  s.equipment = { ...DEFAULT_EQUIPMENT };
  s.activeClassId = classId;
  s.classSaves = { ...(s.classSaves || {}), [classId]: { player: newPlayer, equipment: s.equipment } };
  // 新手物品
  const starter = [
    { id: 'hp_small', name: '小型生命药水', quantity: 5, desc: '恢复 50 点 HP' },
    { id: 'mp_small', name: '小型法力药水', quantity: 3, desc: '恢复 30 点 MP' },
    { id: 'scroll_town', name: '回城卷轴', quantity: 1, desc: '返回城镇' },
  ];
  s.inventory = s.inventory || [];
  for (const it of starter) {
    const def = getItemById(it.id);
    s.inventory = addItemToInventory(s.inventory, {
      uid: serverUid('start'), id: it.id, name: def?.name || it.name, type: 'consumable',
      quality: (def?.quality as string) || 'common', quantity: it.quantity, desc: def?.desc || it.desc,
      effect: def?.effect, value: def?.value,
    });
  }
  const weapons: Record<string, { id: string; stats: Record<string, number> }> = {
    warrior: { id: 'sword_trainee', stats: { atk: 3 } },
    mage: { id: 'wand_apprentice', stats: { mag: 3 } },
    assassin: { id: 'dagger_trainee', stats: { atk: 3, agi: 1 } },
    ranger: { id: 'bow_trainee', stats: { atk: 2, agi: 1 } },
    priest: { id: 'mace_trainee', stats: { atk: 1, mag: 2 } },
    warlock: { id: 'orb_trainee', stats: { mag: 3 } },
  };
  const w = weapons[classId] || weapons.warrior;
  const wdef = getItemById(w.id);
  s.inventory = addItemToInventory(s.inventory, {
    uid: serverUid('start'), id: w.id, name: wdef?.name || w.id, type: 'equipment', slot: 'weapon',
    quality: 'common', quantity: 1, desc: wdef?.desc || '', stats: w.stats, value: wdef?.value,
  });
  return ok('角色创建成功');
}

export function opSwitchClass(s: PersistedState, targetClassId: string): OpResult {
  const now = Date.now();
  const cooldown = s.switchCooldownMs ?? 3600000;
  if (now - (s.lastClassSwitch || 0) < cooldown) {
    return fail(`冷却中，还需 ${Math.ceil((cooldown - (now - (s.lastClassSwitch || 0))) / 1000)} 秒`);
  }
  if (targetClassId === s.activeClassId) return fail('已是当前职业');
  const saves = { ...(s.classSaves || {}) };
  if (s.activeClassId && s.player) {
    saves[s.activeClassId] = { player: { ...s.player }, equipment: { ...(s.equipment || {}) } };
  }
  let target = saves[targetClassId];
  if (!target) {
    const stats = DEFAULT_CLASS_STATS[targetClassId] || DEFAULT_CLASS_STATS.warrior;
    const p: any = {
      id: `p_${Date.now()}`, name: s.playerName || s.player?.name || '冒险者', classId: targetClassId, level: 1,
      hp: stats.hp, maxHp: stats.hp, mp: stats.mp, maxMp: stats.mp,
      atk: stats.atk, def: stats.def, mag: stats.mag, mdef: stats.mdef,
      agi: stats.agi, luk: stats.luk, con: stats.con ?? 6, wil: stats.wil ?? 6,
      skills: [...(STARTER_SKILLS[targetClassId] || [])], element: 'none',
      exp: 0, gold: 0, diamonds: 0, tier: 1, maxLayer: 1,
    };
    target = { player: p, equipment: { ...DEFAULT_EQUIPMENT } };
  }
  s.classSaves = { ...saves, [targetClassId]: target };
  s.activeClassId = targetClassId;
  s.lastClassSwitch = now;
  s.player = target.player;
  s.equipment = target.equipment;
  return ok('职业切换成功');
}

// ═══ 装备穿戴 ═══
export function opEquip(s: PersistedState, itemUid: string): OpResult {
  const p = requirePlayer(s); if (!p) return fail('请先创建角色');
  const inv = s.inventory || [];
  const idx = inv.findIndex((i) => i.uid === itemUid);
  if (idx === -1) return fail('物品不存在');
  const item = inv[idx];
  if (item.type !== 'equipment') return fail('只能穿戴装备');
  let slot = item.slot as string;
  if (slot === 'ring') slot = 'ring1';
  if (slot === 'offhand') slot = 'ring2';
  if (!EQUIP_SLOTS.includes(slot)) return fail('无法识别装备部位');

  let newInv = [...inv];
  newInv.splice(idx, 1);
  const old = (s.equipment || {})[slot];
  if (old) newInv.push(old);
  s.equipment = { ...DEFAULT_EQUIPMENT, ...(s.equipment || {}), [slot]: item };
  s.inventory = newInv;
  applyRecompute(p, s.equipment, s.talents);
  syncClassSave(s);
  return ok(`已穿戴 ${item.name}`);
}

export function opUnequip(s: PersistedState, slot: string): OpResult {
  const p = requirePlayer(s); if (!p) return fail('请先创建角色');
  if (!EQUIP_SLOTS.includes(slot)) return fail('部位无效');
  const item = (s.equipment || {})[slot];
  if (!item) return fail('该部位没有装备');
  s.equipment = { ...(s.equipment || {}), [slot]: null };
  s.inventory = [...(s.inventory || []), item];
  applyRecompute(p, s.equipment, s.talents);
  syncClassSave(s);
  return ok(`已卸下 ${item.name}`);
}

// ═══ 消耗品 / 技能书 ═══
export function opUseConsumable(s: PersistedState, itemUid: string): OpResult {
  const p = requirePlayer(s); if (!p) return fail('请先创建角色');
  const inv = s.inventory || [];
  const item = inv.find((i) => i.uid === itemUid);
  if (!item) return fail('物品不存在');

  if (item.type === 'skillbook' && item.learnSkillId) {
    const skill = getSkillById(item.learnSkillId) as { name?: string; classId?: string } | undefined;
    if (!skill) return fail('技能不存在');
    if (skill.classId !== p.classId) return fail('职业不符，无法学习');
    if ((p.skills || []).includes(item.learnSkillId)) return fail('已掌握该技能');
    p.skills = [...(p.skills || []), item.learnSkillId];
    s.inventory = inv.map((i) => (i.uid === itemUid ? { ...i, quantity: i.quantity - 1 } : i)).filter((i) => i.quantity > 0);
    syncClassSave(s);
    return ok(`学会了【${skill.name}】！`);
  }

  if (item.type !== 'consumable') return fail('该物品无法使用');
  const effect = (item.effect || getItemById(item.id)?.effect) as Record<string, number> | undefined;
  if (!effect) return fail('该物品无法在背包中使用');
  let msg = '';
  if (typeof effect.heal === 'number') {
    const before = p.hp;
    p.hp = Math.min(p.maxHp, p.hp + effect.heal);
    msg = `恢复了 ${p.hp - before} 点生命`;
  } else if (typeof effect.restoreMp === 'number') {
    const before = p.mp;
    p.mp = Math.min(p.maxMp, p.mp + effect.restoreMp);
    msg = `恢复了 ${p.mp - before} 点法力`;
  } else {
    return fail('该物品需要在战斗中使用');
  }
  s.inventory = inv.map((i) => (i.uid === itemUid ? { ...i, quantity: i.quantity - 1 } : i)).filter((i) => i.quantity > 0);
  syncClassSave(s);
  return ok(msg);
}

// ═══ 分解 / 商店 ═══
export function disassembleGold(item: any): number {
  return (DISASSEMBLE_GOLD[item.quality] || 20) + (item.setTier || 0) * 100 + (item.enhanceLevel || 0) * 50;
}

const QUALITY_RANK_S: Record<string, number> = { common: 0, fine: 1, rare: 2, epic: 3, legendary: 4, mythic: 5, eternal: 6 };

/** 服务端自动分解判定（与客户端规则一致，离线结算时使用） */
export function shouldAutoDisassembleServer(item: any, settings: any): boolean {
  if (!settings?.autoDisassemble || item?.type !== 'equipment') return false;
  const r = settings.autoDisassembleRules;
  if (!r) {
    return (QUALITY_RANK_S[item.quality] ?? 0) <= (QUALITY_RANK_S[settings.autoDisassembleMaxQuality] ?? 0);
  }
  if (r.qualities?.length > 0 && !r.qualities.includes(item.quality)) return false;
  if (r.slots?.length > 0 && !r.slots.includes(item.slot || '')) return false;
  if ((r.maxSetTier ?? -1) >= 0 && (item.setTier || 0) > r.maxSetTier) return false;
  if ((r.maxEnhance ?? -1) >= 0 && (item.enhanceLevel || 0) > r.maxEnhance) return false;
  if (r.keepAffixes?.length > 0 && item.affixes && r.keepAffixes.some((k: string) => k in item.affixes)) return false;
  return true;
}

export function opDisassemble(s: PersistedState, uids: string[]): OpResult & { gold?: number } {
  const p = requirePlayer(s); if (!p) return { ...fail('请先创建角色') };
  let gold = 0;
  let inv = s.inventory || [];
  let count = 0;
  for (const uid of uids) {
    const item = inv.find((i) => i.uid === uid);
    if (!item || item.type !== 'equipment') continue;
    gold += disassembleGold(item);
    // 已镶嵌宝石返还背包
    for (const gid of item.gems || []) {
      const def = getItemById(gid);
      if (def) {
        inv = addItemToInventory(inv, {
          uid: serverUid('gem'), id: gid, name: def.name, type: 'material',
          quality: def.quality, quantity: 1, desc: def.desc || '', value: def.value,
        });
      }
    }
    inv = inv.filter((i) => i.uid !== uid);
    count++;
  }
  if (count === 0) return { ...fail('没有可分解的装备') };
  p.gold = (p.gold || 0) + gold;
  s.inventory = inv;
  syncClassSave(s);
  return { success: true, message: `分解 ${count} 件装备，获得 ${gold} 金币`, gold };
}

export function opBuyItem(s: PersistedState, itemId: string, qty: number): OpResult {
  const p = requirePlayer(s); if (!p) return fail('请先创建角色');
  const def = getItemById(itemId);
  if (!def || def.type !== 'consumable') return fail('商品不存在');
  qty = Math.max(1, Math.min(99, Math.floor(qty)));
  const price = ((def.value as number) ?? 10) * qty;
  if ((p.gold || 0) < price) return fail(`金币不足（需要 ${price}）`);
  p.gold -= price;
  s.inventory = addItemToInventory(s.inventory || [], {
    uid: serverUid('shop'), id: itemId, name: def.name, type: 'consumable',
    quality: def.quality || 'common', quantity: qty, desc: def.desc || '',
    effect: def.effect, value: def.value,
  });
  syncClassSave(s);
  return ok(`购买了 ${def.name} ×${qty}，花费 ${price} 金币`);
}

// ═══ 铁匠铺 ═══
export function opEnhance(s: PersistedState, itemUid: string, useProtect: boolean, useLucky: boolean): OpResult {
  const p = requirePlayer(s); if (!p) return fail('请先创建角色');
  const { item, invIdx, equipSlot } = findEquipmentAnywhere(s, itemUid);
  if (!item) return fail('装备不存在');
  if (item.type !== 'equipment') return fail('只能强化装备');
  const cur = item.enhanceLevel || 0;
  if (cur >= ENHANCE_MAX_LEVEL) return fail('已达最高强化等级');

  const cost = getEnhanceCost(cur);
  const goldCost = Math.max(10, Math.floor((item.value || 50) * (cur + 1) * 0.5));
  let inv = s.inventory || [];
  const r1 = removeItemsById(inv, cost.stoneId, 0); // 只检查
  const haveStone = inv.filter((i) => i.id === cost.stoneId).reduce((n, i) => n + i.quantity, 0);
  if (haveStone < cost.count) return fail(`${cost.stoneName}不足（需要 ${cost.count}，现有 ${haveStone}）`);
  if ((p.gold || 0) < goldCost) return fail(`金币不足（需要 ${goldCost}）`);
  if (useProtect && inv.filter((i) => i.id === 'enhance_protect').reduce((n, i) => n + i.quantity, 0) < 1) return fail('没有强化保护符');
  if (useLucky && inv.filter((i) => i.id === 'enhance_lucky').reduce((n, i) => n + i.quantity, 0) < 1) return fail('没有幸运强化石');
  void r1;

  let r = removeItemsById(inv, cost.stoneId, cost.count); inv = r.inventory;
  if (useLucky) { r = removeItemsById(inv, 'enhance_lucky', 1); inv = r.inventory; }

  const rate = Math.min(100, ENHANCE_SUCCESS_RATES[cur] + (useLucky ? 15 : 0));
  // 服务端随机判定
  const roll = (randomBytes(4).readUInt32BE(0) / 0xffffffff) * 100;
  const success = roll < rate;
  let newLevel = cur;
  let protectedUsed = false;
  let message: string;
  if (success) {
    newLevel = cur + 1;
    message = `强化成功！${item.name} +${newLevel}`;
  } else if (cur >= 5) {
    if (useProtect) {
      protectedUsed = true;
      const rr = removeItemsById(inv, 'enhance_protect', 1); inv = rr.inventory;
      message = `强化失败，保护符生效，保持 +${cur}`;
    } else {
      newLevel = cur >= 10 ? cur - 2 : cur - 1;
      message = `强化失败！${item.name} 降为 +${newLevel}`;
    }
  } else {
    message = `强化失败，等级保持 +${cur}`;
  }

  const newItem = { ...item, enhanceLevel: newLevel };
  if (invIdx >= 0) inv = inv.map((i) => (i.uid === itemUid ? newItem : i));
  if (equipSlot) s.equipment = { ...(s.equipment || {}), [equipSlot]: newItem };
  s.inventory = inv;
  p.gold -= goldCost;
  applyRecompute(p, s.equipment || {}, s.talents);
  syncClassSave(s);
  return ok(`${message}（成功率 ${rate}%${protectedUsed ? '，消耗保护符×1' : ''}）`);
}

export function opReforge(s: PersistedState, itemUid: string, useDiamond: boolean): OpResult {
  const p = requirePlayer(s); if (!p) return fail('请先创建角色');
  const { item, invIdx, equipSlot } = findEquipmentAnywhere(s, itemUid);
  if (!item) return fail('装备不存在');
  if (item.type !== 'equipment') return fail('只能重铸装备');
  const maxAffixes = QUALITY_MAX_AFFIXES[item.quality as string] ?? 0;
  if (maxAffixes <= 0) return fail('普通品质没有副词条，无法重铸');

  const setTier = item.setTier || 1;
  if (useDiamond) {
    if ((p.diamonds || 0) < REFORGE_DIAMOND_COST) return fail(`钻石不足（需要 ${REFORGE_DIAMOND_COST}）`);
    p.diamonds -= REFORGE_DIAMOND_COST;
  } else {
    const goldCost = getReforgeGoldCost(setTier, item.quality);
    if ((p.gold || 0) < goldCost) return fail(`金币不足（需要 ${goldCost}）`);
    p.gold -= goldCost;
  }

  const main = extractMainStats(item);
  const affixes = rollAffixes(main, item.quality, setTier, !!useDiamond);
  const stats: Record<string, number> = { ...main };
  for (const [k, v] of Object.entries(affixes)) stats[k] = (stats[k] || 0) + (v as number);
  const newItem = { ...item, stats, affixes };

  if (invIdx >= 0) s.inventory = (s.inventory || []).map((i) => (i.uid === itemUid ? newItem : i));
  if (equipSlot) s.equipment = { ...(s.equipment || {}), [equipSlot]: newItem };
  applyRecompute(p, s.equipment || {}, s.talents);
  syncClassSave(s);
  return ok(`重铸完成，获得 ${Object.keys(affixes).length} 条新词条${useDiamond ? '（钻石重铸·高值）' : ''}`);
}

export function opSocketGem(s: PersistedState, itemUid: string, gemUid: string): OpResult {
  const p = requirePlayer(s); if (!p) return fail('请先创建角色');
  const { item, invIdx, equipSlot } = findEquipmentAnywhere(s, itemUid);
  if (!item) return fail('装备不存在');
  if (item.type !== 'equipment') return fail('只能给装备镶嵌宝石');
  const sockets = GEM_SOCKETS[item.quality as string] ?? 0;
  if (sockets <= 0) return fail('该品质没有孔位');
  const gems = [...(item.gems || [])];
  if (gems.length >= sockets) return fail('孔位已满');
  const inv = s.inventory || [];
  const gem = inv.find((i) => i.uid === gemUid);
  if (!gem) return fail('宝石不存在');
  const gemDef = getItemById(gem.id);
  if (!gemDef?.stats || Object.keys(gemDef.stats).length === 0) return fail('该物品不是可镶嵌宝石');

  gems.push(gem.id);
  const newItem = { ...item, gems };
  let newInv = inv.map((i) => (i.uid === gemUid ? { ...i, quantity: i.quantity - 1 } : i)).filter((i) => i.quantity > 0);
  if (invIdx >= 0) newInv = newInv.map((i) => (i.uid === itemUid ? newItem : i));
  if (equipSlot) s.equipment = { ...(s.equipment || {}), [equipSlot]: newItem };
  s.inventory = newInv;
  applyRecompute(p, s.equipment || {}, s.talents);
  syncClassSave(s);
  return ok(`镶嵌成功：${gem.name} → ${item.name}`);
}

export function opUnsocketGem(s: PersistedState, itemUid: string, gemIndex: number): OpResult {
  const p = requirePlayer(s); if (!p) return fail('请先创建角色');
  const { item, invIdx, equipSlot } = findEquipmentAnywhere(s, itemUid);
  if (!item || !item.gems || gemIndex < 0 || gemIndex >= item.gems.length) return fail('宝石不存在');
  const gemId = item.gems[gemIndex];
  const gemDef = getItemById(gemId);
  const newItem = { ...item, gems: item.gems.filter((_: unknown, i: number) => i !== gemIndex) };

  let newInv = [...(s.inventory || [])];
  if (gemDef) {
    newInv = addItemToInventory(newInv, {
      uid: serverUid('gem'), id: gemId, name: gemDef.name, type: 'material',
      quality: gemDef.quality, quantity: 1, desc: gemDef.desc || '', value: gemDef.value,
    });
  }
  if (invIdx >= 0) newInv = newInv.map((i) => (i.uid === itemUid ? newItem : i));
  if (equipSlot) s.equipment = { ...(s.equipment || {}), [equipSlot]: newItem };
  s.inventory = newInv;
  applyRecompute(p, s.equipment || {}, s.talents);
  syncClassSave(s);
  return ok(`已卸下 ${gemDef?.name || gemId}，返还背包`);
}

// ═══ 成长：进阶 / 觉醒 / 天赋 / 技能 ═══
export function opAdvanceTier(s: PersistedState): OpResult {
  const p = requirePlayer(s); if (!p) return fail('尚未创建角色');
  const rules = getTierRules() as {
    maxTier: number; levelReq: number[]; layerReq: number[]; goldCost: number[];
    materialReq: Array<{ id: string; name: string; count: number } | null>;
  } | null;
  if (!rules) return fail('配置未加载');
  const cur = p.tier || 1;
  if (cur >= rules.maxTier) return fail('已达最高等阶');
  const idx = cur;
  const lvReq = rules.levelReq[idx] ?? 1;
  const layerReq = rules.layerReq[idx] ?? 1;
  const goldCost = rules.goldCost[idx] ?? 0;
  const matReq = CLASS_TIER_MATS[p.classId]?.[idx] ?? rules.materialReq[idx];
  if (p.level < lvReq) return fail(`等级不足（需要 Lv.${lvReq}）`);
  if ((p.maxLayer || 1) < layerReq) return fail(`探索层数不足（需要到达第 ${layerReq} 层）`);
  if ((p.gold || 0) < goldCost) return fail(`金币不足（需要 ${goldCost}）`);
  if (matReq) {
    const have = (s.inventory || []).filter((i) => i.id === matReq.id).reduce((n, i) => n + i.quantity, 0);
    if (have < matReq.count) return fail(`材料不足：${matReq.name} ${have}/${matReq.count}`);
  }
  if (matReq) {
    const r = removeItemsById(s.inventory || [], matReq.id, matReq.count);
    s.inventory = r.inventory;
  }
  p.gold -= goldCost;
  p.tier = cur + 1;
  applyRecompute(p, s.equipment || {}, s.talents);
  syncClassSave(s);
  return ok(`进阶成功！当前等阶：${cur + 1}`);
}

export function opAwaken(s: PersistedState): OpResult {
  const p = requirePlayer(s); if (!p) return fail('请先创建角色');
  if (p.level < 100) return fail(`需要等级达到 100 级（当前 Lv.${p.level}）`);
  const count = (p.awakenCount || 0) + 1;
  const base = DEFAULT_CLASS_STATS[p.classId] || DEFAULT_CLASS_STATS.warrior;
  const inherit = (v: number) => Math.round(v * 0.15);
  // 觉醒前总属性以服务端重算为准（不信任存档字段）
  const total = recomputePlayer(p, s.equipment || {}, s.talents).stats;
  p.level = 1; p.exp = 0; p.awakenCount = count;
  p.maxHp = (base.hp || 100) + inherit(total.maxHp); p.maxMp = (base.mp || 50) + inherit(total.maxMp);
  p.atk = (base.atk || 10) + inherit(total.atk); p.def = (base.def || 10) + inherit(total.def);
  p.mag = (base.mag || 10) + inherit(total.mag); p.mdef = (base.mdef || 8) + inherit(total.mdef);
  p.agi = (base.agi || 10) + inherit(total.agi); p.luk = (base.luk || 5) + inherit(total.luk);
  p.con = (base.con ?? 6) + inherit(total.con || 0); p.wil = (base.wil ?? 6) + inherit(total.wil || 0);
  p.awakenBase = {
    maxHp: p.maxHp, maxMp: p.maxMp, atk: p.atk, def: p.def,
    mag: p.mag, mdef: p.mdef, agi: p.agi, luk: p.luk, con: p.con, wil: p.wil,
  };
  p.hp = p.maxHp; p.mp = p.maxMp;
  s.talents = { ...(s.talents || {}), [p.classId]: {} };
  applyRecompute(p, s.equipment || {}, s.talents);
  syncClassSave(s);
  return ok(`觉醒成功！第 ${count} 次觉醒：继承 15% 属性，成长率 +${count * 20}%`);
}

export function opLearnTalent(s: PersistedState, nodeId: string): OpResult {
  const p = requirePlayer(s); if (!p) return fail('请先创建角色');
  const talents = { ...(s.talents || {}) };
  const ranks = { ...(talents[p.classId] || {}) };
  const spent = getSpentTalentPoints(ranks);
  const available = p.level - spent;
  const err = canLearnTalent(ranks, p.classId, nodeId, available);
  if (err) return fail(err);
  ranks[nodeId] = (ranks[nodeId] || 0) + 1;
  talents[p.classId] = ranks;
  s.talents = talents;
  syncClassSave(s);
  return ok('天赋已激活');
}

export function opRespecTalents(s: PersistedState): OpResult {
  const p = requirePlayer(s); if (!p) return fail('请先创建角色');
  const spent = getSpentTalentPoints((s.talents || {})[p.classId]);
  if (spent === 0) return fail('尚未投入任何天赋点');
  const cost = getRespecCost(p.level);
  if ((p.gold || 0) < cost) return fail(`金币不足（需要 ${cost}）`);
  p.gold -= cost;
  s.talents = { ...(s.talents || {}), [p.classId]: {} };
  syncClassSave(s);
  return ok(`已重置全部天赋（花费 ${cost} 金币）`);
}

export function opLearnSkill(s: PersistedState, skillId: string): OpResult {
  const p = requirePlayer(s); if (!p) return fail('请先创建角色');
  const skill = getSkillById(skillId) as { name?: string; classId?: string; learnLevel?: number | null; learnCost?: number | null } | undefined;
  if (!skill) return fail('技能不存在');
  if (skill.classId !== p.classId) return fail('职业不符，无法学习');
  if ((p.skills || []).includes(skillId)) return fail('已掌握该技能');
  const reqLevel = skill.learnLevel || 1;
  if (p.level < reqLevel) return fail(`需要等级 ${reqLevel}`);
  const cost = skill.learnCost || 0;
  if ((p.gold || 0) < cost) return fail(`金币不足（需要 ${cost}）`);
  p.gold -= cost;
  p.skills = [...(p.skills || []), skillId];
  syncClassSave(s);
  return ok(`学会了【${skill.name}】！`);
}

// ═══ 任务领奖 ═══
const EMPTY_PROGRESS = { rooms: 0, kills: 0, layers: 0, bossKills: 0 };

export function ensureTaskState(s: PersistedState): any {
  const today = new Date().toISOString().slice(0, 10);
  const ts = s.taskState || {};
  if (ts.dailyDate !== today) {
    ts.dailyDate = today;
    ts.daily = { ...EMPTY_PROGRESS };
    ts.dailyClaimed = [];
  }
  ts.daily = { ...EMPTY_PROGRESS, ...(ts.daily || {}) };
  ts.totals = { ...EMPTY_PROGRESS, ...(ts.totals || {}) };
  ts.achClaimed = ts.achClaimed || [];
  s.taskState = ts;
  return ts;
}

export function opClaimTask(s: PersistedState, taskId: string): OpResult {
  const p = requirePlayer(s); if (!p) return fail('请先创建角色');
  const task = TASKS.find((t) => t.id === taskId);
  if (!task) return fail('任务不存在');
  const ts = ensureTaskState(s);
  const claimed: string[] = task.scope === 'daily' ? ts.dailyClaimed : ts.achClaimed;
  if (claimed.includes(taskId)) return fail('已领取过该奖励');
  const progress = task.scope === 'daily' ? ts.daily[task.metric] : ts.totals[task.metric];
  if ((progress || 0) < task.target) return fail(`任务未完成（${progress || 0}/${task.target}）`);
  claimed.push(taskId);
  const ups = gainExp(p, task.exp);
  if (ups > 0) applyRecompute(p, s.equipment || {}, s.talents);
  syncClassSave(s);
  return ok(`领取奖励：经验 +${task.exp}${ups > 0 ? `，连升 ${ups} 级！` : ''}`);
}

// ═══ 进度类（探索计数 / 层数 / 秘境阶段 / 设置） ═══
export function opTrackEvent(s: PersistedState, kind: string, n: number): OpResult {
  if (!['rooms', 'kills', 'layers', 'bossKills'].includes(kind)) return fail('无效的进度类型');
  const ts = ensureTaskState(s);
  n = Math.max(1, Math.min(50, Math.floor(n)));
  ts.daily[kind] += n;
  ts.totals[kind] += n;
  return ok('ok');
}

export function opUpdateMaxLayer(s: PersistedState, layer: number): OpResult {
  const p = requirePlayer(s); if (!p) return fail('请先创建角色');
  layer = Math.floor(layer);
  // 只允许 +1 递进，防止跳层伪造
  if (layer === (p.maxLayer || 1) + 1 && layer >= 1 && layer <= 1000) {
    p.maxLayer = layer;
    syncClassSave(s);
  }
  return ok('ok');
}

export function opSetLawfulLayer(s: PersistedState, layer: number): OpResult {
  const cur = s.lawful || { layer: 1, best: 1 };
  layer = Math.floor(layer);
  // 只允许 +1 递进
  if (layer === cur.layer + 1 && layer >= 2 && layer <= 101) {
    s.lawful = { layer, best: Math.max(cur.best || 1, layer) };
  }
  return ok('ok');
}

export function opSetRiftStage(s: PersistedState, stage: number, cleared: boolean): OpResult {
  const today = new Date().toISOString().slice(0, 10);
  const rift = s.rift && s.rift.date === today ? s.rift : { date: today, stage: 1 };
  stage = Math.floor(stage);
  if (cleared) {
    s.rift = { date: today, stage: 6, clearedDate: today };
  } else if (stage === rift.stage + 1 && stage >= 2 && stage <= 5) {
    s.rift = { ...rift, stage };
  }
  return ok('ok');
}

export function opUpdateSettings(s: PersistedState, patch: Record<string, unknown>): OpResult {
  // 白名单键，防止注入任意字段
  const allowed = ['autoPotion', 'autoPotionThreshold', 'autoDisassemble', 'autoDisassembleMaxQuality', 'autoDisassembleRules', 'autoSell', 'soundEnabled'];
  const out: Record<string, unknown> = { ...(s.settings || {}) };
  for (const k of allowed) {
    if (k in patch) out[k] = patch[k];
  }
  s.settings = out;
  return ok('ok');
}
