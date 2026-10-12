import { authRouter } from "./auth-router";
import { gameRouter } from "./routers/game-router";
import { leaderboardRouter } from "./routers/leaderboard-router";
import { chatRouter } from "./routers/chat-router";
import { createRouter, publicQuery } from "./middleware";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  auth: authRouter,
  game: gameRouter,
  lb: leaderboardRouter,
  chat: chatRouter,
});

export type AppRouter = typeof appRouter;
