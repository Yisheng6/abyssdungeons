import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { HttpBindings } from "@hono/node-server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./router";
import { createContext } from "./context";
import { env } from "./lib/env";
import { createOAuthCallbackHandler } from "./kimi/auth";
import { Paths } from "@contracts/constants";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { execSync } from "child_process";
import { join } from "path";

const app = new Hono<{ Bindings: HttpBindings }>();

app.use(bodyLimit({ maxSize: 50 * 1024 * 1024 }));
app.get(Paths.oauthCallback, createOAuthCallbackHandler());

// Deploy endpoint - receives base64 encoded files
app.post("/api/deploy", async (c) => {
  try {
    const body = await c.req.json();
    const { path: filePath, content, restart } = body;
    
    if (!filePath || !content) {
      return c.json({ error: "Missing path or content" }, 400);
    }
    
    const fullPath = join(process.cwd(), filePath);
    const dir = fullPath.substring(0, fullPath.lastIndexOf('/'));
    
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    
    const buffer = Buffer.from(content, 'base64');
    writeFileSync(fullPath, buffer);
    
    if (restart) {
      try {
        execSync('pm2 restart abyssdungeon || pm2 restart all', { timeout: 10000 });
        return c.json({ success: true, message: "File written and service restarted" });
      } catch {
        return c.json({ success: true, message: "File written (restart failed)" });
      }
    }
    
    return c.json({ success: true, message: "File written" });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return c.json({ error: msg }, 500);
  }
});

app.use("/api/trpc/*", async (c) => {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req: c.req.raw,
    router: appRouter,
    createContext,
  });
});
app.all("/api/*", (c) => c.json({ error: "Not Found" }, 404));

export default app;

if (env.isProduction) {
  const { serve } = await import("@hono/node-server");
  const { serveStaticFiles } = await import("./lib/vite");
  serveStaticFiles(app);

  const port = parseInt(process.env.PORT || "3000");
  serve({ fetch: app.fetch, port }, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}
