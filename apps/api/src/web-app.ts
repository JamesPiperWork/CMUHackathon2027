import { open, realpath } from "node:fs/promises";
import { constants } from "node:fs";
import { extname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

export const webAppRoutes = ["/", "/draft", "/league", "/leagues", "/settings", "/wrapped", "/chat", "/matchups", "/activity"] as const;
const buildDirectory = fileURLToPath(new URL("../../mobile/dist/", import.meta.url));
const assetTypes: Record<string, string> = {
  ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif",
  ".webp": "image/webp", ".avif": "image/avif", ".svg": "image/svg+xml", ".ico": "image/x-icon",
  ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf", ".otf": "font/otf",
};
function safeRelativePath(path: string) {
  return !isAbsolute(path) && !path.includes("\\") && !path.includes("\0") && !path.includes("%") &&
    path.split("/").every((segment) => segment.length > 0 && !segment.startsWith("."));
}
function publicAsset(path: string) {
  return safeRelativePath(path) && (path.startsWith("_expo/") || path.startsWith("assets/")) &&
    Object.hasOwn(assetTypes, extname(path).toLowerCase());
}

/** Serve the built Expo app on the API origin; no proxy, directory listing, or broad SPA fallback. */
export function registerWebApp(app: FastifyInstance, directory = buildDirectory) {
  const serve = async (request: FastifyRequest, reply: FastifyReply, index = false) => {
    let requested: string;
    try { requested = index ? "index.html" : decodeURIComponent(request.raw.url!.split("?")[0]).slice(1); }
    catch { return reply.code(404).send({ error: "Asset not found" }); }
    if (!index && !publicAsset(requested)) return reply.code(404).send({ error: "Asset not found" });
    let root: string;
    let target: string;
    try {
      root = await realpath(directory);
      target = await realpath(resolve(root, requested));
    } catch {
      return index
        ? reply.code(503).type("text/plain; charset=utf-8").send("The web app has not been built. Set API_ORIGIN, APP_ORIGIN, and EXPO_PUBLIC_API_ORIGIN to the same public HTTPS origin, then run npm run build from the repository root.")
        : reply.code(404).send({ error: "Asset not found" });
    }
    const inside = relative(root, target);
    if (!safeRelativePath(inside) || (index ? inside !== "index.html" : !publicAsset(inside)))
      return reply.code(404).send({ error: "Asset not found" });
    // The resolved path is inside the build root. O_NOFOLLOW also prevents a
    // final-component symlink swap between realpath and opening the file.
    let file;
    try { file = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW); }
    catch { return reply.code(404).send({ error: "Asset not found" }); }
    try {
      const info = await file.stat();
      if (!info.isFile()) return reply.code(404).send({ error: "Asset not found" });
      reply.type(index ? "text/html; charset=utf-8" : assetTypes[extname(inside).toLowerCase()])
        .header("X-Content-Type-Options", "nosniff")
        .header("Cache-Control", "no-store")
        .header("Content-Length", info.size);
      // Fastify's generated HEAD handler retains the GET headers and strips
      // the payload; sending undefined here would replace Content-Length with 0.
      return reply.send(await file.readFile());
    } finally { await file.close(); }
  };
  for (const route of webAppRoutes) app.get(route, (request, reply) => serve(request, reply, true));
  app.get("/_expo/*", (request, reply) => serve(request, reply));
  app.get("/assets/*", (request, reply) => serve(request, reply));
}
