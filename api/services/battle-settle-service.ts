// 战斗结算服务：战斗结束后由服务端把奖励直接写入存档（客户端不再自行结算）
import { loadState, writeState, serverUid, addItemToInventory, type PersistedState } from "./char-state-service";
import { gainExp, applyRecompute, recomputePlayer } from "./character-service";
import { getItemById } from "./config-service";
import { ensureTaskState } from "./char-ops-service";
import { getDailyRewardBonus } from "./daily-service";
import { getWeeklyBoss, weeklyCategory } from "./weekly-service";
import { addLeaderboardScore } from "./redis-service";
import { logOp } from "./oplog-service";

const QUALITY_RANK: Record<string, number> = {
  common: 0, fine: 1, rare: 2, epic: 3, legendary: 4, mythic: 5, eternal: 6,
};

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface SessionForSettle {
  mode: string;
  layer: number;
  enemies: Array<{ id: string; name?: string; maxHp?: number; hp?: number }>;
}

interface DropEntry {
  itemId: string; name?: string; type?: string; quantity: number; quality?: string;
  stats?: Record<string, number>; affixes?: Record<string, number>;
}

export interface SettleResult {
  exp: number;
  gold: number;
  diamonds: number;
  levelUps: number;
  items: Array<{ name: string; quantity: number; quality?: string; note?: string }>;
  /** 每周挑战：本场对 Boss 的总伤害（服务端统计） */
  weeklyDamage?: number;
  /** 探索 Boss 通关恢复量 */
  passHeal?: { hp: number; mp: number };
  state: PersistedState;
  version: number;
}

/** 战斗结算入包：经验/金币/钻石/掉落/任务计数，全部由服务端写入存档 */
export async function settleBattle(
  username: string,
  session: SessionForSettle,
  drops: DropEntry[],
  opts: { victory: boolean; baseExp: number },
): Promise<SettleResult | null> {
  let settlePassHeal: { hp: number; mp: number } | undefined;
  let weeklyDmg: number | undefined;
  const rec = await loadState(username);
  if (!rec || !rec.state.player) return null;
  const s = rec.state;
  const p = s.player;
  const equipment = s.equipment || {};
  const { utilityMods } = recomputePlayer(p, equipment, s.talents || {});
  const ts = ensureTaskState(s);

  const items: SettleResult["items"] = [];
  let gold = 0, diamonds = 0;
  const isBoss = session.enemies.some((e) => (e.maxHp || 0) >= 500);
  const rewardMult = session.mode === 'rift' ? 1 + getDailyRewardBonus(todayStr()) / 100 : 1;

  if (opts.victory) {
    // ── 经验（含秘境加成 + 经验词条） ──
    const expGainTotal = Math.floor(opts.baseExp * rewardMult * (1 + (utilityMods.expGain || 0) / 100));
    const levelUps = gainExp(p, expGainTotal);
    var exp = expGainTotal;
    var ups = levelUps;

    // ── 击杀回复词条 ──
    const killHeal = (utilityMods.killHeal || 0) * session.enemies.length;
    const killMp = (utilityMods.killMp || 0) * session.enemies.length;
    if (killHeal > 0) p.hp = Math.min(p.maxHp, p.hp + killHeal);
    if (killMp > 0) p.mp = Math.min(p.maxMp, p.mp + killMp);

    // ── 模式专属奖励 ──
    if (session.mode === 'lawful') {
      gold += Math.floor((8 + session.layer * 4) * (isBoss ? 5 : 1) * (1 + (utilityMods.goldGain || 0) / 100));
    } else if (session.mode === 'rift') {
      gold += Math.floor((10 + (p.level || 1) * 5) * (isBoss ? 5 : 1) * rewardMult * (1 + (utilityMods.goldGain || 0) / 100));
      if (isBoss) {
        // 秘境通关：钻石×3 + 随机无瑕宝石
        diamonds += 3;
        const gemIds = ['ruby', 'sapphire', 'emerald', 'topaz', 'onyx', 'amethyst'];
        const gid = `gem_${gemIds[Math.floor(Math.random() * gemIds.length)]}_2`;
        const gdef = getItemById(gid);
        if (gdef) {
          s.inventory = addItemToInventory(s.inventory || [], {
            uid: serverUid('rift_gem'), id: gid, name: gdef.name, type: 'material',
            quality: gdef.quality, quantity: 1, desc: gdef.desc || '', value: gdef.value,
          });
          items.push({ name: gdef.name as string, quantity: 1, quality: gdef.quality as string, note: '秘境通关奖励' });
        }
      }
    }

    // ── 掉落入库（货币折算金币/钻石，实物入包） ──
    for (const drop of drops || []) {
      const cat = getItemById(drop.itemId);
      const type = (drop.type || (cat?.type as string) || 'material') as string;
      const dName = (drop.name || cat?.name || drop.itemId) as string;
      if (type === 'currency') {
        if (drop.itemId === 'gem_diamond') {
          diamonds += drop.quantity;
        } else {
          const mult = 1 + (utilityMods.goldGain || 0) / 100;
          gold += Math.floor(drop.quantity * (((cat?.value as number) ?? 1)) * mult);
        }
        items.push({ name: dName, quantity: drop.quantity, quality: (drop.quality || cat?.quality) as string });
        continue;
      }
      const item = {
        uid: serverUid('drop'), id: drop.itemId, name: dName, type,
        slot: cat?.slot as string | undefined,
        quality: (drop.quality || cat?.quality || 'common') as string,
        quantity: drop.quantity,
        desc: (cat?.desc || drop.name) as string,
        stats: drop.stats || (cat?.stats as Record<string, number> | undefined),
        affixes: drop.affixes,
        setId: cat?.setId as string | undefined,
        setTier: cat?.setTier as number | undefined,
        value: cat?.value as number | undefined,
        effect: cat?.effect,
        learnSkillId: cat?.learnSkillId as string | undefined,
      };
      s.inventory = addItemToInventory(s.inventory || [], item);
      items.push({ name: dName, quantity: drop.quantity, quality: item.quality });
    }

    // ── 探索 Boss 通关恢复：HP/MP 各恢复 50% ──
    if (session.mode === 'explore' && isBoss) {
      const healHp = Math.floor(p.maxHp * 0.5);
      const healMp = Math.floor(p.maxMp * 0.5);
      p.hp = Math.min(p.maxHp, p.hp + healHp);
      p.mp = Math.min(p.maxMp, p.mp + healMp);
      settlePassHeal = { hp: healHp, mp: healMp };
    }

    // ── 任务计数 ──
    ts.daily.kills += session.enemies.length;
    ts.totals.kills += session.enemies.length;
    if (isBoss) { ts.daily.bossKills += 1; ts.totals.bossKills += 1; }
  } else {
    var exp = 0;
    var ups = 0;
  }

  // ── 每周挑战：按对 Boss 造成的总伤害结算参与奖 ──
  if (session.mode === 'weekly') {
    const damage = Math.max(0, Math.round(session.enemies.reduce((sum, e) => sum + ((e.maxHp || 0) - Math.max(0, e.hp || 0)), 0)));
    if (damage > 0) {
      weeklyDmg = damage;
      const wExp = Math.floor(damage * 0.5);
      const wGold = Math.floor(damage * 1.5);
      ups += gainExp(p, wExp);
      exp += wExp;
      gold += wGold;
      ts.daily.bossKills += 1;
      ts.totals.bossKills += 1;
      // 服务端直接提交本周成绩
      try {
        const { weekId } = getWeeklyBoss();
        await addLeaderboardScore(weeklyCategory(weekId), username, damage, { name: p.name || username });
      } catch { /* 排行提交失败不影响结算 */ }
    }
  }

  if (ups > 0 || opts.victory) applyRecompute(p, equipment, s.talents || {});

  p.gold = (p.gold || 0) + gold;
  p.diamonds = (p.diamonds || 0) + diamonds;

  // 同步当前职业存档
  if (s.activeClassId) {
    s.classSaves = { ...(s.classSaves || {}) };
    s.classSaves[s.activeClassId] = { player: p, equipment };
  }

  const version = await writeState(username, s);
  logOp(username, `battle_${session.mode}`, opts.victory,
    weeklyDmg
      ? `每周挑战：伤害${weeklyDmg} 经验+${exp} 金币+${gold}`
      : opts.victory
        ? `战斗胜利：经验+${exp} 金币+${gold}${diamonds > 0 ? ` 钻石+${diamonds}` : ""} 掉落×${items.length}${ups > 0 ? ` 升级×${ups}` : ""}`
        : "战斗失败",
    version);
  return { exp, gold, diamonds, levelUps: ups, items, weeklyDamage: weeklyDmg, passHeal: settlePassHeal, state: s, version };
}
