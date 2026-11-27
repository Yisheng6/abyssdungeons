// 掉落凭证服务：遭遇生成的战利品由服务端暂存，客户端凭券领取，防止伪造掉落
import { randomBytes } from "crypto";
import { getRedis } from "./redis-service";
import { getItemById } from "./config-service";
import { loadState, writeState, serverUid, addItemToInventory } from "./char-state-service";
import { ensureTaskState } from "./char-ops-service";
import { recomputePlayer } from "./character-service";

const VOUCHER_TTL = 600; // 10 分钟内有效

export interface LootEntry {
  itemId: string; name?: string; type?: string; quality?: string; quantity: number;
  slot?: string; stats?: Record<string, number>; affixes?: Record<string, number>;
  desc?: string; value?: number; setId?: string; setTier?: number;
  effect?: Record<string, unknown>; learnSkillId?: string;
}

export async function createLootVoucher(username: string, loot: LootEntry[]): Promise<string> {
  const id = randomBytes(12).toString("hex");
  await getRedis().setex(`lootv:${username.toLowerCase()}:${id}`, VOUCHER_TTL, JSON.stringify(loot));
  return id;
}

/** 领取凭证中的战利品：货币折算金币，实物入包。一次性使用。 */
export async function claimLootVoucher(username: string, voucherId: string): Promise<{
  success: boolean; message: string; state?: unknown; version?: number;
  items?: Array<{ name: string; quantity: number; quality?: string }>;
}> {
  const key = `lootv:${username.toLowerCase()}:${voucherId}`;
  const raw = await getRedis().get(key);
  if (!raw) return { success: false, message: "战利品已过期或已领取" };
  await getRedis().del(key);

  const rec = await loadState(username);
  if (!rec || !rec.state.player) return { success: false, message: "存档不存在" };
  const s = rec.state;
  const p = s.player;
  const { utilityMods } = recomputePlayer(p, s.equipment || {}, s.talents || {});
  const goldMult = 1 + (utilityMods.goldGain || 0) / 100;

  const items: Array<{ name: string; quantity: number; quality?: string }> = [];
  let gold = 0;
  for (const l of JSON.parse(raw) as LootEntry[]) {
    const cat = getItemById(l.itemId);
    const type = (l.type || (cat?.type as string) || 'material') as string;
    const name = (l.name || cat?.name || l.itemId) as string;
    const quantity = Math.max(1, Math.min(99, Math.floor(l.quantity || 1)));
    if (type === 'currency') {
      gold += Math.floor(quantity * ((l.value ?? (cat?.value as number) ?? 1)) * goldMult);
      items.push({ name, quantity, quality: (l.quality || cat?.quality) as string });
      continue;
    }
    s.inventory = addItemToInventory(s.inventory || [], {
      uid: serverUid('loot'), id: l.itemId, name, type,
      slot: (l.slot || cat?.slot) as string | undefined,
      quality: (l.quality || cat?.quality || 'common') as string,
      quantity,
      desc: (l.desc || cat?.desc || name) as string,
      stats: l.stats || (cat?.stats as Record<string, number> | undefined),
      affixes: l.affixes,
      setId: (l.setId || cat?.setId) as string | undefined,
      setTier: (l.setTier ?? cat?.setTier) as number | undefined,
      value: (l.value ?? cat?.value) as number | undefined,
      effect: (l.effect || cat?.effect),
      learnSkillId: (l.learnSkillId || cat?.learnSkillId) as string | undefined,
    });
    items.push({ name, quantity, quality: (l.quality || cat?.quality) as string });
  }
  if (gold > 0) p.gold = (p.gold || 0) + gold;
  ensureTaskState(s);
  const version = await writeState(username, s);
  return { success: true, message: "ok", state: s, version, items };
}
