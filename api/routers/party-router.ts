import { z } from "zod";
import { createRouter, publicQuery } from "../middleware";
import {
  createParty,
  joinParty,
  leaveParty,
  kickMember,
  setReady,
  startDungeon,
  getPartyById,
  getPartyByCharacter,
  listAvailableParties,
  heartbeat,
  type PartyInfo,
} from "../services/party-service";
import {
  createPartyDungeon,
  getPartyDungeon,
  moveRoom,
  combatAction,
  buildRoomResponse,
  cleanupPartyDungeon,
} from "../services/party-dungeon-service";

export const partyRouter = createRouter({
  // ─── Create Party ───
  create: publicQuery
    .input(
      z.object({
        leaderId: z.number(),
        leaderName: z.string(),
        name: z.string().optional(),
        maxMembers: z.number().min(2).max(6).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const party = await createParty(input);
      return { success: true, party };
    }),

  // ─── Join Party ───
  join: publicQuery
    .input(
      z.object({
        partyId: z.number(),
        characterId: z.number(),
        characterName: z.string(),
        classId: z.string(),
        level: z.number(),
      })
    )
    .mutation(async ({ input }) => {
      const result = await joinParty(input);
      return result;
    }),

  // ─── Leave Party ───
  leave: publicQuery
    .input(z.object({ characterId: z.number() }))
    .mutation(async ({ input }) => {
      const result = await leaveParty(input.characterId);
      return result;
    }),

  // ─── Kick Member ───
  kick: publicQuery
    .input(z.object({ leaderId: z.number(), memberId: z.number() }))
    .mutation(async ({ input }) => {
      const result = await kickMember(input.leaderId, input.memberId);
      return result;
    }),

  // ─── Set Ready ───
  ready: publicQuery
    .input(z.object({ characterId: z.number(), ready: z.boolean() }))
    .mutation(async ({ input }) => {
      const result = await setReady(input.characterId, input.ready);
      return result;
    }),

  // ─── Get My Party ───
  myParty: publicQuery
    .input(z.object({ characterId: z.number() }))
    .query(async ({ input }) => {
      const party = await getPartyByCharacter(input.characterId);
      return { party };
    }),

  // ─── List Available Parties ───
  list: publicQuery.query(async () => {
    const parties = await listAvailableParties();
    return { parties };
  }),

  // ─── Get Party Detail ───
  detail: publicQuery
    .input(z.object({ partyId: z.number() }))
    .query(async ({ input }) => {
      const party = await getPartyById(input.partyId);
      return { party };
    }),

  // ─── Start Dungeon ───
  startDungeon: publicQuery
    .input(
      z.object({
        leaderId: z.number(),
        layer: z.number(),
        x: z.number(),
        y: z.number(),
        members: z.array(
          z.object({
            characterId: z.number(),
            name: z.string(),
            classId: z.string(),
            level: z.number(),
            hp: z.number(),
            maxHp: z.number(),
            mp: z.number(),
            maxMp: z.number(),
            atk: z.number(),
            def: z.number(),
            mag: z.number(),
            mdef: z.number(),
            agi: z.number(),
            luk: z.number(),
          })
        ),
      })
    )
    .mutation(async ({ input }) => {
      // Start dungeon in DB
      const startResult = await startDungeon(input.leaderId, input.layer, input.x, input.y);
      if (!startResult.success) return startResult;

      // Create dungeon instance
      const instance = createPartyDungeon({
        partyId: startResult.party!.id,
        layer: input.layer,
        x: input.x,
        y: input.y,
        members: input.members,
      });

      const roomData = buildRoomResponse(instance);
      return { success: true, party: startResult.party, roomData, instanceId: instance.instanceId };
    }),

  // ─── Move Room ───
  moveRoom: publicQuery
    .input(
      z.object({
        partyId: z.number(),
        characterId: z.number(),
        targetRoomId: z.number(),
      })
    )
    .mutation(({ input }) => {
      const result = moveRoom(input.partyId, input.characterId, input.targetRoomId);
      return result;
    }),

  // ─── Combat Action ───
  combatAction: publicQuery
    .input(
      z.object({
        partyId: z.number(),
        characterId: z.number(),
        action: z.object({
          type: z.enum(["attack", "skill", "defend", "flee"]),
          skillId: z.string().optional(),
          targetIndex: z.number().optional(),
        }),
      })
    )
    .mutation(({ input }) => {
      const result = combatAction(input.partyId, input.characterId, input.action);
      return result;
    }),

  // ─── Get Dungeon State ───
  dungeonState: publicQuery
    .input(z.object({ partyId: z.number() }))
    .query(({ input }) => {
      const instance = getPartyDungeon(input.partyId);
      if (!instance) return { instance: null };
      const roomData = buildRoomResponse(instance);
      return { instance: { ...instance, combatState: instance.combatState }, roomData };
    }),

  // ─── Heartbeat (online status) ───
  heartbeat: publicQuery
    .input(z.object({ characterId: z.number() }))
    .mutation(async ({ input }) => {
      const result = await heartbeat(input.characterId);
      return result;
    }),

  // ─── Disband ───
  disband: publicQuery
    .input(z.object({ partyId: z.number() }))
    .mutation(async ({ input }) => {
      const { disbandParty } = await import("../services/party-service");
      await disbandParty(input.partyId);
      cleanupPartyDungeon(input.partyId);
      return { success: true };
    }),
});
