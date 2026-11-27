// 游戏账号体系：Redis 持久化账号（scrypt 加盐哈希）+ 令牌会话
// 设计要点：
// - 密码永不落盘明文：scrypt(N=16384) + 每账号随机 salt，校验用 timingSafeEqual 防时序攻击
// - 令牌为 256bit 随机串，Redis 存 token→username，TTL 30 天（每次校验滑动续期）
// - 登录接口按 IP 限流：10 分钟内最多 10 次失败，防爆破
import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { getRedis } from "./redis-service";

const TOKEN_TTL = 30 * 24 * 3600; // 30 天
const LOGIN_FAIL_LIMIT = 10;
const LOGIN_FAIL_WINDOW = 600; // 10 分钟
const REGISTER_LIMIT = 5; // 每 IP 每小时最多注册 5 个账号
const REGISTER_WINDOW = 3600;

export const USERNAME_RE = /^[a-zA-Z0-9_]{2,16}$/;

interface AccountRecord {
  salt: string;
  hash: string;
  createdAt: number;
}

function hashPassword(password: string, salt: string): string {
  return scryptSync(password, salt, 32).toString("hex");
}

export type AuthResult =
  | { ok: true; token?: string; username: string }
  | { ok: false; message: string };

export async function registerAccount(username: string, password: string): Promise<AuthResult> {
  if (!USERNAME_RE.test(username)) {
    return { ok: false, message: "用户名需 2-16 位，只能包含字母、数字、下划线" };
  }
  if (password.length < 8 || password.length > 32) {
    return { ok: false, message: "密码需 8-32 位" };
  }
  const r = getRedis();
  const key = `acc:${username.toLowerCase()}`;
  // SET NX 原子占位，防并发注册同名
  const claimed = await r.set(key, "RESERVED", "EX", 60, "NX");
  if (!claimed) return { ok: false, message: "该用户名已被注册" };
  const salt = randomBytes(16).toString("hex");
  const rec: AccountRecord = { salt, hash: hashPassword(password, salt), createdAt: Date.now() };
  await r.set(key, JSON.stringify(rec));
  return { ok: true, username };
}

export async function checkLoginRateLimit(ip: string): Promise<boolean> {
  try {
    const r = getRedis();
    const key = `loginfail:${ip}`;
    const fails = await r.incr(key);
    if (fails === 1) await r.expire(key, LOGIN_FAIL_WINDOW);
    return fails <= LOGIN_FAIL_LIMIT;
  } catch {
    return true; // Redis 异常不阻塞登录
  }
}

/** 注册限流：每 IP 每小时最多 5 个账号，防批量灌号 */
export async function checkRegisterRateLimit(ip: string): Promise<boolean> {
  try {
    const r = getRedis();
    const key = `reglimit:${ip}`;
    const n = await r.incr(key);
    if (n === 1) await r.expire(key, REGISTER_WINDOW);
    return n <= REGISTER_LIMIT;
  } catch {
    return true;
  }
}

export async function loginAccount(username: string, password: string): Promise<AuthResult> {
  const r = getRedis();
  const raw = await r.get(`acc:${username.toLowerCase()}`);
  if (!raw || raw === "RESERVED") return { ok: false, message: "用户名或密码错误" };
  let rec: AccountRecord;
  try {
    rec = JSON.parse(raw) as AccountRecord;
  } catch {
    return { ok: false, message: "账号数据异常，请联系管理员" };
  }
  const candidate = Buffer.from(hashPassword(password, rec.salt), "hex");
  const stored = Buffer.from(rec.hash, "hex");
  if (candidate.length !== stored.length || !timingSafeEqual(candidate, stored)) {
    return { ok: false, message: "用户名或密码错误" };
  }
  const token = randomBytes(32).toString("hex");
  await r.setex(`tok:${token}`, TOKEN_TTL, rec ? username : username);
  return { ok: true, token, username };
}

/** 校验令牌，返回绑定的用户名；有效则滑动续期 */
export async function verifyToken(token: string): Promise<string | null> {
  if (!token || token.length > 128) return null;
  try {
    const r = getRedis();
    const username = await r.get(`tok:${token}`);
    if (!username) return null;
    await r.expire(`tok:${token}`, TOKEN_TTL);
    return username;
  } catch {
    return null;
  }
}

export async function logoutToken(token: string): Promise<void> {
  try {
    await getRedis().del(`tok:${token}`);
  } catch { /* silent */ }
}

/** 联机接口守卫：token 有效且（可选）与声明的玩家名一致 */
export async function requireAccount(token: string | undefined, expectedName?: string): Promise<string> {
  if (!token) throw new Error("UNAUTHENTICATED");
  const username = await verifyToken(token);
  if (!username) throw new Error("UNAUTHENTICATED");
  if (expectedName && username !== expectedName) throw new Error("FORBIDDEN");
  return username;
}

/** 从请求头取客户端 IP（Nginx 反代后取 x-forwarded-for） */
export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}
