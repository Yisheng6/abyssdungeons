/**
 * Mail Service（邮件系统）
 *
 * 文件持久化（data/mails.json）。邮件按玩家名分发，支持：
 * - 文本正文 + 附件（金币 / 钻石 / 道具装备）
 * - 领取附件（一次性）、删除、已读
 * - 过期自动清理（默认 14 天）
 * - 系统邮件发送入口（欢迎邮件、活动奖励、补偿等）
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { getItemById } from "./config-service";
import { rollEquipmentInstance } from "./equipgen-service";

const DATA_DIR = join(process.cwd(), "data");
const STORE_FILE = join(DATA_DIR, "mails.json");
const DEFAULT_TTL_MS = 14 * 24 * 3600 * 1000; // 14 天过期

export interface MailAttachment {
  kind: "gold" | "diamonds" | "item";
  amount?: number;       // gold / diamonds 数量
  itemId?: string;       // item 附件
  quantity?: number;     // item 数量（默认 1）
}

export interface Mail {
  id: string;
  to: string;            // 玩家名
  title: string;
  content: string;
  attachments: MailAttachment[];
  createdAt: number;
  expiresAt: number;
  read: boolean;
  claimed: boolean;      // 附件是否已领取
  tag?: string;          // 来源标记（welcome / weekly / compensation...）
}

export interface ClaimedItem {
  itemId: string; name: string; type: string; quality: string; quantity: number;
  stats?: Record<string, number>; affixes?: Record<string, number>; slot?: string;
  setId?: string; setTier?: number; value?: number; effect?: Record<string, unknown>; learnSkillId?: string;
}

export interface ClaimResult {
  success: boolean;
  message: string;
  gold: number;
  diamonds: number;
  items: ClaimedItem[];
}

// ─── 存储 ───
const mails = new Map<string, Mail>();
let loaded = false;

function loadMails(): void {
  if (loaded) return;
  loaded = true;
  try {
    if (existsSync(STORE_FILE)) {
      const raw = JSON.parse(readFileSync(STORE_FILE, "utf-8")) as Mail[];
      const now = Date.now();
      for (const m of raw) if (m.expiresAt > now) mails.set(m.id, m);
    }
  } catch { /* 损坏则忽略 */ }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function saveMails(): void {
  if (saveTimer) return; // 简单防抖，100ms 内合并写盘
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
      writeFileSync(STORE_FILE, JSON.stringify([...mails.values()]), "utf-8");
    } catch { /* 写盘失败不影响内存 */ }
  }, 100);
}

function genId(): string {
  return `m_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e9).toString(36)}`;
}

// ─── 发送 ───
export function sendMail(
  to: string,
  title: string,
  content: string,
  attachments: MailAttachment[] = [],
  opts: { ttlMs?: number; tag?: string } = {}
): Mail {
  loadMails();
  const now = Date.now();
  const mail: Mail = {
    id: genId(), to, title, content, attachments,
    createdAt: now, expiresAt: now + (opts.ttlMs ?? DEFAULT_TTL_MS),
    read: false, claimed: attachments.length === 0, tag: opts.tag,
  };
  mails.set(mail.id, mail);
  saveMails();
  return mail;
}

/** 确保系统邮件只发一次（按 to+tag 判重） */
export function sendMailOnce(
  to: string, tag: string, title: string, content: string, attachments: MailAttachment[] = []
): void {
  loadMails();
  for (const m of mails.values()) if (m.to === to && m.tag === tag) return;
  sendMail(to, title, content, attachments, { tag });
}

// ─── 查询 ───
export function listMails(to: string): Mail[] {
  loadMails();
  const now = Date.now();
  const out: Mail[] = [];
  for (const m of mails.values()) {
    if (m.to !== to) continue;
    if (m.expiresAt <= now) { mails.delete(m.id); continue; }
    out.push(m);
  }
  out.sort((a, b) => b.createdAt - a.createdAt);
  return out;
}

export function unreadCount(to: string): number {
  return listMails(to).filter((m) => !m.read || (!m.claimed && m.attachments.length > 0)).length;
}

export function markRead(to: string, mailId: string): boolean {
  loadMails();
  const m = mails.get(mailId);
  if (!m || m.to !== to) return false;
  m.read = true;
  saveMails();
  return true;
}

export function deleteMail(to: string, mailId: string): { success: boolean; message: string } {
  loadMails();
  const m = mails.get(mailId);
  if (!m || m.to !== to) return { success: false, message: "邮件不存在" };
  if (!m.claimed && m.attachments.length > 0) return { success: false, message: "请先领取附件" };
  mails.delete(mailId);
  saveMails();
  return { success: true, message: "已删除" };
}

// ─── 领取附件 ───
export function claimAttachments(to: string, mailId: string): ClaimResult {
  loadMails();
  const fail = (message: string): ClaimResult => ({ success: false, message, gold: 0, diamonds: 0, items: [] });
  const m = mails.get(mailId);
  if (!m || m.to !== to) return fail("邮件不存在");
  if (m.expiresAt <= Date.now()) { mails.delete(mailId); saveMails(); return fail("邮件已过期"); }
  if (m.claimed) return fail("附件已领取");

  let gold = 0, diamonds = 0;
  const items: ClaimedItem[] = [];
  for (const att of m.attachments) {
    if (att.kind === "gold") gold += att.amount || 0;
    else if (att.kind === "diamonds") diamonds += att.amount || 0;
    else if (att.kind === "item" && att.itemId) {
      const cat = getItemById(att.itemId);
      if (!cat) continue;
      const qty = att.quantity || 1;
      if ((cat.type || "material") === "equipment") {
        for (let i = 0; i < qty; i++) {
          const rolled = rollEquipmentInstance(cat, Math.random);
          items.push({
            itemId: cat.id, name: rolled.displayName, type: "equipment", quality: rolled.quality,
            quantity: 1, stats: rolled.stats, affixes: rolled.affixes, slot: cat.slot,
            setId: cat.setId, setTier: cat.setTier, value: cat.value,
          });
        }
      } else {
        items.push({
          itemId: cat.id, name: cat.name, type: cat.type || "material",
          quality: cat.quality || "common", quantity: qty,
          stats: cat.stats, value: cat.value, effect: cat.effect, learnSkillId: cat.learnSkillId,
        });
      }
    }
  }
  m.claimed = true;
  m.read = true;
  saveMails();
  return { success: true, message: "领取成功", gold, diamonds, items };
}
