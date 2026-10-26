import { authRouter } from "./auth-router";
import { gameRouter } from "./routers/game-router";
import { leaderboardRouter } from "./routers/leaderboard-router";
import { chatRouter } from "./routers/chat-router";
import { weeklyRouter } from "./routers/weekly-router";
import { mailRouter } from "./routers/mail-router";
import { createRouter, publicQuery } from "./middleware";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  auth: authRouter,
  game: gameRouter,
  lb: leaderboardRouter,
  chat: chatRouter,
  weekly: weeklyRouter,
  mail: mailRouter,
});

export type AppRouter = typeof appRouter;
