// Real-time Service via Socket.IO
// Handles: chat, party, player status broadcasts
import type { Server as HttpServer } from "http";
import { Server as SocketIOServer, Socket } from "socket.io";
import {
  setPlayerOnline,
  setPlayerOffline,
  addChatMessage,
  getChatMessages,
  setPlayerSession,
} from "./redis-service";
import { verifyToken } from "./auth-service";

let io: SocketIOServer | null = null;

export function initRealtime(server: HttpServer) {
  io = new SocketIOServer(server, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    path: "/socket.io",
    pingTimeout: 30000,
    pingInterval: 15000,
  });

  io.on("connection", (socket: Socket) => {
    const claimedId = socket.handshake.query.playerId as string || `guest_${socket.id}`;
    const claimedName = socket.handshake.query.playerName as string || "冒险者";
    const token = (socket.handshake.query.token as string) || "";

    // 令牌校验：通过则以令牌绑定账号为准（防冒名），失败标记为游客（禁言聊天）
    socket.data.authed = false;
    verifyToken(token).then((username) => {
      if (username && username === claimedId) {
        socket.data.authed = true;
        socket.data.username = username;
      }
    }).catch(() => { /* 保持未认证 */ });

    const playerId = claimedId;
    const playerName = claimedName;

    console.log(`[Socket] ${playerName}(${playerId}) connected`);
    setPlayerOnline(playerId, playerName, "online");
    socket.broadcast.emit("player:online", { playerId, name: playerName });

    // ─── Chat ───
    socket.on("chat:join", (channel: string) => {
      socket.join(`chat:${channel}`);
    });

    socket.on("chat:leave", (channel: string) => {
      socket.leave(`chat:${channel}`);
    });

    socket.on("chat:message", async (data: { channel: string; content: string }) => {
      // 未通过令牌校验的连接禁止发言（防冒名）
      if (!socket.data.authed || !socket.data.username) {
        socket.emit("chat:error", { message: "登录状态无效，无法发言" });
        return;
      }
      const sender = socket.data.username as string;
      const content = typeof data.content === "string" ? data.content.slice(0, 500) : "";
      if (!content.trim()) return;
      await addChatMessage(data.channel, sender, sender, content);
      io?.to(`chat:${data.channel}`).emit("chat:message", {
        senderId: sender,
        senderName: sender,
        content,
        time: Date.now(),
      });
    });

    // ─── Party ───
    socket.on("party:create", (partyName: string) => {
      const roomId = `party:${socket.id}`;
      socket.join(roomId);
      socket.emit("party:created", { partyId: roomId, name: partyName, leader: playerId });
    });

    socket.on("party:join", (partyId: string) => {
      socket.join(partyId);
      socket.to(partyId).emit("party:member_joined", { playerId, name: playerName });
      socket.emit("party:joined", { partyId });
    });

    socket.on("party:leave", (partyId: string) => {
      socket.leave(partyId);
      socket.to(partyId).emit("party:member_left", { playerId, name: playerName });
    });

    socket.on("party:invite", (data: { partyId: string; targetId: string }) => {
      // Emit to all sockets of target player
      io?.sockets.sockets.forEach((s) => {
        const sPlayerId = s.handshake.query.playerId as string;
        if (sPlayerId === data.targetId) {
          s.emit("party:invited", { partyId: data.partyId, from: playerName });
        }
      });
    });

    // ─── Dungeon ───
    socket.on("dungeon:enter", async (data: { layer: number; seed: string }) => {
      await setPlayerSession(playerId, {
        status: "exploring",
        layer: data.layer,
        seed: data.seed,
        lastActive: Date.now(),
      });
      socket.broadcast.emit("player:status", { playerId, name: playerName, status: `探索中 L${data.layer}` });
    });

    socket.on("dungeon:combat", async (data: { enemies: string[] }) => {
      await setPlayerSession(playerId, {
        status: "in_combat",
        enemies: data.enemies,
        lastActive: Date.now(),
      });
      socket.broadcast.emit("player:status", { playerId, name: playerName, status: "战斗中" });
    });

    // ─── Disconnect ───
    socket.on("disconnect", () => {
      console.log(`[Socket] ${playerName} disconnected`);
      setPlayerOffline(playerId);
      socket.broadcast.emit("player:offline", { playerId, name: playerName });
    });
  });

  return io;
}

export function getIO(): SocketIOServer | null {
  return io;
}

// Broadcast helpers
export function broadcastChatMessage(channel: string, message: unknown) {
  io?.to(`chat:${channel}`).emit("chat:message", message);
}

export function broadcastPlayerStatus(playerId: string, status: string) {
  io?.emit("player:status", { playerId, status });
}
