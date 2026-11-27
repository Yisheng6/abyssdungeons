import { authRouter } from "./auth-router";
import { gameRouter } from "./routers/game-router";
import { leaderboardRouter } from "./routers/leaderboard-router";
import { accountRouter } from "./routers/account-router";
import { saveRouter } from "./routers/save-router";
import { battleRouter } from "./routers/battle-router";
import { chatRouter } from "./routers/chat-router";
import { weeklyRouter } from "./routers/weekly-router";
import { mailRouter } from "./routers/mail-router";
import { createRouter, publicQuery } from "./middleware";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  auth: authRouter,
  account: accountRouter,
  save: saveRouter,
  battle: battleRouter,
  game: gameRouter,
  lb: leaderboardRouter,
  chat: chatRouter,
  weekly: weeklyRouter,
  mail: mailRouter,
});

export type AppRouter = typeof appRouter;
