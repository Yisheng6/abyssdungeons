// 存档状态服务：服务器是存档的唯一写方
// 客户端不再能整体上传存档；所有数据变更必须通过 char/battle 等服务端接口完成
import { getRedis } from "./redis-service";

export interface PersistedState {
  player?: any;
  classSaves?: Record<string, { player: any; equipment: Record<string, any> }>;
  activeClassId?: string;
  lastClassSwitch?: number;
  switchCooldownMs?: number;
  inventory?: any[];
  equipment?: Record<string, any>;
  tempBag?: any[];
  settings?: Record<string, unknown>;
  taskState?: any;
  lawful?: { layer: number; best: number };
  rift?: { date: string; stage: number; clearedDate?: string };
  talents?: Record<string, Record<string, number>>;
  playerName?: string;
  [k: string]: unknown;
}

const key = (username: string) => `save:${username.toLowerCase()}`;

/** 读取存档内层 state（自动解开 zustand persist 包装） */
export async function loadState(username: string): Promise<{ state: PersistedState; version: number } | null> {
  try {
    const raw = await getRedis().get(key(username));
    if (!raw) return null;
    const rec = JSON.parse(raw) as { v: number; data: string; t: number };
    const wrapped = JSON.parse(rec.data) as { state?: PersistedState } & PersistedState;
    return { state: wrapped.state ?? wrapped, version: rec.v };
  } catch { return null; }
}

/** 写入存档（版本号自增），返回新版本号 */
export async function writeState(username: string, state: PersistedState): Promise<number> {
  const k = key(username);
  let v = 0;
  try {
    const raw = await getRedis().get(k);
    if (raw) v = (JSON.parse(raw) as { v: number }).v || 0;
  } catch { /* ignore */ }
  v += 1;
  const data = JSON.stringify({ state, version: 0 });
  await getRedis().set(k, JSON.stringify({ v, data, t: Date.now() }));
  return v;
}

/** 生成服务端物品 uid */
export function serverUid(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** 从背包按物品 id 扣减数量，返回是否足够并扣除 */
export function removeItemsById(inventory: any[], itemId: string, count: number): { ok: boolean; inventory: any[] } {
  const have = inventory.filter((i) => i.id === itemId).reduce((n, i) => n + i.quantity, 0);
  if (have < count) return { ok: false, inventory };
  let left = count;
  const out = inventory.map((i) => {
    if (i.id !== itemId || left <= 0) return i;
    const take = Math.min(i.quantity, left);
    left -= take;
    return { ...i, quantity: i.quantity - take };
  }).filter((i) => i.quantity > 0);
  return { ok: true, inventory: out };
}

/** 向背包添加物品（非装备按 id 堆叠） */
export function addItemToInventory(inventory: any[], item: any): any[] {
  if (item.type !== 'equipment') {
    const exist = inventory.find((i) => i.id === item.id && i.type !== 'equipment');
    if (exist) {
      return inventory.map((i) => (i === exist ? { ...i, quantity: i.quantity + item.quantity } : i));
    }
  }
  return [...inventory, item];
}
