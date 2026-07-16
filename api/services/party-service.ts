import { eq, desc } from "drizzle-orm";
import { getDb } from "../queries/connection";
import { parties, partyMembers } from "../../db/schema";

const db = getDb();

// ─── Types ───
export interface PartyInfo {
  id: number;
  name: string;
  leaderId: number;
  leaderName: string;
  status: string;
  maxMembers: number;
  dungeonParams?: { layer: number; x: number; y: number; globalSeed: string };
  members: PartyMemberInfo[];
  createdAt: Date;
}

export interface PartyMemberInfo {
  id: number;
  characterId: number;
  characterName: string;
  classId: string;
  level: number;
  isReady: boolean;
}

// ─── Helper: safely compare numeric IDs that may be strings or BigInts ───
function num(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") return Number(v);
  if (typeof v === "bigint") return Number(v);
  return Number(v) || 0;
}

function eqNum(a: unknown, b: unknown): boolean {
  return num(a) === num(b);
}

// ─── Helper: get latest party by leader (reliable for MySQL) ───
async function getLatestPartyByLeader(leaderId: number): Promise<number> {
  const rows = await db.select().from(parties).where(eq(parties.leaderId, leaderId)).orderBy(desc(parties.id)).limit(1);
  return num(rows[0]?.id) || 0;
}

// ─── Create Party ───
export async function createParty(params: {
  leaderId: number;
  leaderName: string;
  name?: string;
  maxMembers?: number;
}): Promise<PartyInfo> {
  const { leaderId, leaderName, name, maxMembers = 4 } = params;

  // Leave any existing party first
  await leaveAllParties(leaderId);

  const partyName = name || `${leaderName}的队伍`;

  await db.insert(parties).values({
    name: partyName,
    leaderId,
    leaderName,
    maxMembers,
    status: "recruiting",
  });

  // Query back the inserted party (MySQL doesn't support .returning())
  const partyId = await getLatestPartyByLeader(leaderId);

  // Add leader as first member
  await db.insert(partyMembers).values({
    partyId,
    characterId: leaderId,
    characterName: leaderName,
    classId: "warrior",
    level: 1,
    isReady: false,
  });

  return (await getPartyById(partyId))!;
}

// ─── Join Party ───
export async function joinParty(params: {
  partyId: number;
  characterId: number;
  characterName: string;
  classId: string;
  level: number;
}): Promise<{ success: boolean; party?: PartyInfo; message: string }> {
  const { partyId, characterId, characterName, classId, level } = params;

  // Check target party first (before leaving existing)
  const allParties = await db.select().from(parties);
  const targetParty = allParties.find((p) => eqNum(p.id, partyId));
  if (!targetParty) return { success: false, message: "队伍不存在" };
  if (targetParty.status !== "recruiting") return { success: false, message: "队伍已开始地牢，无法加入" };

  // Check capacity
  const allMembers = await db.select().from(partyMembers);
  const partyMemberCount = allMembers.filter((m) => eqNum(m.partyId, partyId)).length;
  if (partyMemberCount >= targetParty.maxMembers) return { success: false, message: "队伍已满" };

  // Check if already in this specific party
  const alreadyInThisParty = allMembers.some((m) => eqNum(m.characterId, characterId) && eqNum(m.partyId, partyId));
  if (alreadyInThisParty) return { success: false, message: "你已在该队伍中" };

  // Leave any existing party first
  const existingMember = allMembers.find((m) => eqNum(m.characterId, characterId));
  if (existingMember) {
    await leaveParty(characterId);
  }

  // Insert new member
  await db.insert(partyMembers).values({
    partyId,
    characterId,
    characterName,
    classId,
    level,
    isReady: false,
  });

  const updated = await getPartyById(partyId);
  return { success: true, party: updated || undefined, message: "加入成功" };
}

// ─── Leave Party ───
export async function leaveParty(characterId: number): Promise<{ success: boolean; message: string; disbanded?: boolean }> {
  const allParties = await db.select().from(parties);
  const allMembers = await db.select().from(partyMembers);

  const member = allMembers.find((m) => eqNum(m.characterId, characterId));
  if (!member) return { success: false, message: "不在任何队伍中" };

  const party = allParties.find((p) => eqNum(p.id, member.partyId));
  if (!party) {
    // Clean up orphaned member
    await db.delete(partyMembers).where(eq(partyMembers.id, member.id));
    return { success: true, message: "已离开队伍" };
  }

  // If leader leaves, disband the party
  if (eqNum(party.leaderId, characterId)) {
    await disbandParty(num(party.id));
    return { success: true, message: "队长离开，队伍已解散", disbanded: true };
  }

  await db.delete(partyMembers).where(eq(partyMembers.id, member.id));
  return { success: true, message: "已离开队伍" };
}

// ─── Kick Member ───
export async function kickMember(leaderId: number, memberId: number): Promise<{ success: boolean; message: string }> {
  const allMembers = await db.select().from(partyMembers);
  const leaderMember = allMembers.find((m) => eqNum(m.characterId, leaderId));
  if (!leaderMember) return { success: false, message: "你不是队长" };

  const allParties = await db.select().from(parties);
  const party = allParties.find((p) => eqNum(p.id, leaderMember.partyId));
  if (!party || !eqNum(party.leaderId, leaderId)) return { success: false, message: "只有队长可以踢人" };

  const target = allMembers.find((m) => eqNum(m.characterId, memberId) && eqNum(m.partyId, party.id));
  if (!target) return { success: false, message: "该成员不在队伍中" };

  await db.delete(partyMembers).where(eq(partyMembers.id, target.id));
  return { success: true, message: "已踢出成员" };
}

// ─── Set Ready ───
export async function setReady(characterId: number, ready: boolean): Promise<{ success: boolean; party?: PartyInfo }> {
  const allMembers = await db.select().from(partyMembers);
  const member = allMembers.find((m) => eqNum(m.characterId, characterId));
  if (!member) return { success: false };

  await db
    .update(partyMembers)
    .set({ isReady: ready ? 1 : 0 })
    .where(eq(partyMembers.id, member.id));

  const party = await getPartyById(num(member.partyId));
  return { success: true, party: party || undefined };
}

// ─── Start Dungeon ───
export async function startDungeon(leaderId: number, layer: number, x: number, y: number): Promise<{ success: boolean; party?: PartyInfo; message: string }> {
  const allMembers = await db.select().from(partyMembers);
  const allParties = await db.select().from(parties);

  const leaderMember = allMembers.find((m) => eqNum(m.characterId, leaderId));
  if (!leaderMember) return { success: false, message: "不在队伍中" };

  const party = allParties.find((p) => eqNum(p.id, leaderMember.partyId));
  if (!party) return { success: false, message: "队伍不存在" };
  if (!eqNum(party.leaderId, leaderId)) return { success: false, message: "只有队长可以开始" };

  const partyMembersList = allMembers.filter((m) => eqNum(m.partyId, party.id));
  if (partyMembersList.length < 1) return { success: false, message: "队伍为空" };

  // All members must be ready (except leader)
  const notReady = partyMembersList.filter((m) => !eqNum(m.characterId, leaderId) && !m.isReady);
  if (notReady.length > 0) {
    return { success: false, message: `${notReady.map((m) => m.characterName).join("、")} 未准备` };
  }

  await db
    .update(parties)
    .set({
      status: "in_dungeon",
      dungeonParams: JSON.stringify({ layer, x, y, globalSeed: "default" }),
    })
    .where(eq(parties.id, party.id));

  const updated = await getPartyById(num(party.id));
  return { success: true, party: updated || undefined, message: "地牢开始！" };
}

// ─── Disband Party ───
export async function disbandParty(partyId: number): Promise<void> {
  await db.delete(partyMembers).where(eq(partyMembers.partyId, partyId));
  await db.delete(parties).where(eq(parties.id, partyId));
}

// ─── Get Party ───
export async function getPartyById(id: number): Promise<PartyInfo | null> {
  const allParties = await db.select().from(parties);
  const party = allParties.find((p) => eqNum(p.id, id));
  if (!party) return null;

  const allMembers = await db.select().from(partyMembers);
  const members = allMembers.filter((m) => eqNum(m.partyId, id));

  return {
    id: num(party.id),
    name: party.name,
    leaderId: num(party.leaderId),
    leaderName: party.leaderName,
    status: party.status,
    maxMembers: num(party.maxMembers),
    dungeonParams: party.dungeonParams ? JSON.parse(party.dungeonParams as string) : undefined,
    members: members.map((m) => ({
      id: num(m.id),
      characterId: num(m.characterId),
      characterName: m.characterName,
      classId: m.classId,
      level: num(m.level),
      isReady: !!m.isReady,
    })),
    createdAt: party.createdAt,
  };
}

// ─── Get Party by Character ───
export async function getPartyByCharacter(characterId: number): Promise<PartyInfo | null> {
  const allMembers = await db.select().from(partyMembers);
  const member = allMembers.find((m) => eqNum(m.characterId, characterId));
  if (!member) return null;
  return await getPartyById(num(member.partyId));
}

// ─── Leave All Parties ───
async function leaveAllParties(characterId: number): Promise<void> {
  const allMembers = await db.select().from(partyMembers);
  const existing = allMembers.find((m) => eqNum(m.characterId, characterId));
  if (existing) {
    await leaveParty(characterId);
  }
}

// ─── List Available Parties ───
export async function listAvailableParties(): Promise<PartyInfo[]> {
  const allParties = await db.select().from(parties);
  const recruiting = allParties.filter((p) => p.status === "recruiting");

  const result: PartyInfo[] = [];
  for (const p of recruiting) {
    const party = await getPartyById(num(p.id));
    if (party && party.members.length < party.maxMembers) {
      result.push(party);
    }
  }
  return result;
}
