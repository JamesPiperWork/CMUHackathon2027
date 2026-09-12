/** A real-email rehearsal can use a single loopback origin on the presenter's computer. */
export function loopbackEmailDemo(env: NodeJS.ProcessEnv): boolean {
  if (env.APP_MODE !== "demo" || env.EMAIL_DELIVERY_MODE !== "smtp-demo" || env.EMAIL_DEMO_LOCAL_ONLY !== "true") return false;
  try {
    const api = new URL(env.API_ORIGIN ?? "");
    const app = new URL(env.APP_ORIGIN ?? "");
    return api.origin === app.origin && api.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(api.hostname) &&
      Number(api.port || 80) === Number(env.PORT ?? 3001) &&
      [api, app].every(url => !url.username && !url.password && url.pathname === "/" && !url.search && !url.hash);
  } catch { return false; }
}
