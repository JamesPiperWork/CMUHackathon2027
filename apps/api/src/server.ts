import { challengeResponseScript } from "./challenge-response.js";
import { prankRevealHtml, registerPrankRevealRoutes } from "./prank-reveals.js";
import Fastify, { type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import formbody from "@fastify/formbody";
import { Server } from "socket.io";
import { z } from "zod";
import {
  decisionSchema,
  generateSchema,
  type Session,
} from "@fp/shared";
import { ApiError, GameService } from "./service.js";
import { accountSetupSchema, saveAccount } from "./accounts.js";
import { registerEmailAuth } from "./email-auth.js";
import { registerLocalAuth } from "./local-auth.js";
import { demoResetCapability, resetDemo } from "./demo-reset.js";
import { LeagueService } from "./leagues.js";
import { registerMobilePreview } from "./mobile-preview.js";
import { registerWebApp } from "./web-app.js";
import { registerProviderRoutes } from "./providers.js";
import { registerLiveAuth, resolveLiveIdentity } from "./auth-live.js";
import { scoutingInputSchema } from "./scouting.js";
import { registerVoiceAuthoringRoutes } from "./voice-authoring.js";
import { registerPhoneEnrollmentRoutes } from "./phone-enrollment.js";
const escape = (value: unknown) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const page = (title: string, body: string) =>
  `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)} · Fantasy Phishing</title><style>body{margin:0;background:#0b1525;color:#faf7ef;font:18px/1.6 system-ui;padding:24px}main{max-width:560px;margin:5vh auto}a{color:#50e3c2}h1{line-height:1.1;font-size:36px}button{font:inherit;color:#08241e;background:#50e3c2;border:0;border-radius:16px;padding:14px 24px;margin:8px 8px 8px 0;cursor:pointer}.muted{color:#afbacb}.tag{font-size:13px;text-transform:uppercase;letter-spacing:2px;color:#50e3c2}.message{padding:24px;background:#152338;border-radius:20px;white-space:pre-wrap}select{font:inherit;padding:12px;width:100%}</style><main><p class="tag">Fantasy Phishing</p><h1>${escape(title)}</h1>${body}</main></html>`;
export async function createServer(
  service: GameService,
  {
    startJobs = true,
  }: {
    startJobs?: boolean;
  } = {},
) {
  await service.initializeRules();
  const app = Fastify({
    logger: false,
    bodyLimit: 16000,
    trustProxy: service.config.mode === "live",
  });
  await app.register(cors, {
    origin: service.config.appOrigin,
    credentials: true,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "OPTIONS"],
  });
  await app.register(cookie);
  await app.register(formbody);
  app.addHook("onSend", async (_request, reply) => {
    reply
      .header("X-Content-Type-Options", "nosniff")
      .header("Referrer-Policy", "no-referrer")
      .header("Cache-Control", "no-store");
  });
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof z.ZodError)
      return reply
        .code(400)
        .send({
          error: "Invalid request",
          details: error.issues.map((i) => ({
            path: i.path,
            message: i.message,
          })),
        });
    const status =
      (
        error as {
          statusCode?: number;
        }
      ).statusCode ?? 500;
    return reply
      .code(status)
      .send({
        error:
          status >= 500
            ? "The server could not complete this request"
            : error instanceof Error
              ? error.message
              : "Request rejected",
      });
  });
  const authenticate = async (token: string): Promise<Session> => {
    const session = await service.sessionForToken(token);
    if (session) return session;
    if (service.config.mode === "live") {
      let identity;
      try {
        identity = await resolveLiveIdentity(token);
      } catch {
        throw new ApiError(401, "Live authentication failed");
      }
      const userId = await service.ensureLiveMember(identity);
      return {
        mode: "live",
        userId,
        role: "player",
        tokenHash: "auth0",
        expiresAt: Date.now() + 60000,
        csrf: "",
      };
    }
    throw new ApiError(401, "Sign in to your account");
  };
  const getSession = async (request: FastifyRequest, mutation = false) => {
    const bearer = request.headers.authorization?.startsWith("Bearer ")
      ? request.headers.authorization.slice(7)
      : null;
    const token = bearer ?? request.cookies.fp_session;
    if (!token) throw new ApiError(401, "Sign in to continue");
    const session = await authenticate(token);
    if (mutation && !bearer) {
      const body = request.body as
        | {
            csrf?: string;
          }
        | undefined;
      if ((request.headers["x-csrf-token"] ?? body?.csrf) !== session.csrf)
        throw new ApiError(403, "CSRF token required");
      const origin = request.headers.origin;
      if (
        origin &&
        ![service.config.appOrigin, service.config.apiOrigin].includes(origin)
      )
        throw new ApiError(403, "Origin rejected");
    }
    return session;
  };
  const operator = async (request: FastifyRequest) => {
    if (!service.simulated)
      throw new ApiError(403, "Demo controls disabled in live mode");
    const session = await getSession(request, request.method !== "GET");
    if (session.role !== "operator")
      throw new ApiError(403, "Demo operator session required");
    return session;
  };
  app.get("/health", async () => ({
    ok: true,
    mode: service.config.mode,
    storage: service.config.mongodbUri ? "mongodb" : "single-process-json",
  }));
  app.get("/api/config", async () => ({
    mode: service.config.mode,
    apiOrigin: service.config.apiOrigin,
    emailDelivery: service.config.emailCapture ? "mailpit" : service.config.emailDemo ? "smtp-demo" : service.config.mode === "live" ? "live" : "simulated",
    deliveryTiming: service.immediateDelivery ? "immediate" : "scheduled",
  }));
  app.post("/api/demo/session", async (request) => {
    if (!service.simulated)
      throw new ApiError(403, "Demo sign-in disabled in live mode");
    const origin = request.headers.origin;
    if (
      origin &&
      ![service.config.appOrigin, service.config.apiOrigin].includes(origin)
    )
      throw new ApiError(403, "Origin rejected");
    throw new ApiError(410, "Create an account or sign in with your email and password.");
  });
  registerEmailAuth(app, service);
  registerLocalAuth(app, service);
  app.post("/api/demo/reset", async (request, reply) => {
    const session = await getSession(request, true);
    z.object({ confirm: z.literal("RESET") }).strict().parse(request.body);
    const result = await resetDemo(service, session.userId);
    if (!result.preserveSession) reply.clearCookie("fp_session", { path: "/", httpOnly: true, secure: service.config.apiOrigin.startsWith("https:"), sameSite: "lax" });
    return result;
  });
  app.post("/api/account/setup", async request => {
    const session = await getSession(request, true);
    return saveAccount(service, session.userId, accountSetupSchema.parse(request.body));
  });
  const leagues = new LeagueService(service);
  app.post("/api/session/logout", async (request, reply) => {
    const session = await getSession(request, true);
    await service.transact(db => { db.sessions = db.sessions.filter(s => s.tokenHash !== session.tokenHash); });
    reply.clearCookie("fp_session", { path: "/", httpOnly: true, secure: service.config.apiOrigin.startsWith("https:"), sameSite: "lax" });
    return { ok: true };
  });
  registerMobilePreview(app, service.config.appOrigin);
  app.get("/api/state", async (request) => {
    const session = await getSession(request);
    return { ...await (await service.forSession(session)).state(session),
      demoReset: demoResetCapability(service, await service.readDb(), session.userId),
      deliveryTiming: service.immediateDelivery ? "immediate" : "scheduled",
      emailDelivery: service.config.emailCapture ? "mailpit" : service.config.emailDemo ? "smtp-demo" : service.config.mode === "live" ? "live" : "simulated" };
  });
  app.get("/api/leagues", async (request) => leagues.list(await getSession(request)));
  app.post("/api/leagues", async (request) => {
    const session = await getSession(request, true);
    const { name } = z.object({ name: z.string().trim().min(3).max(48) }).strict().parse(request.body);
    return leagues.create(session, name);
  });
  app.post("/api/leagues/join", async (request) => {
    const session = await getSession(request, true);
    const { inviteCode } = z.object({ inviteCode: z.string().trim().min(4).max(20) }).strict().parse(request.body);
    return leagues.join(session, inviteCode);
  });
  app.post<{ Params: { id: string } }>("/api/leagues/:id/select", async (request) => leagues.select(await getSession(request, true), request.params.id));
  app.post<{ Params: { id: string } }>("/api/matches/:id/select", async (request) => leagues.selectMatch(await getSession(request, true), request.params.id));
  app.get<{ Params: { id: string } }>("/api/leagues/:id/matchups", async (request) => leagues.matchups(await getSession(request), request.params.id));
  app.get<{ Params: { id: string } }>("/api/leagues/:id/standings", async (request) => leagues.standings(await getSession(request), request.params.id));
  app.post<{ Params: { id: string } }>("/api/leagues/:id/next-week", async (request) => leagues.nextWeek(await getSession(request, true), request.params.id));
  app.post<{ Params: { id: string } }>("/api/leagues/:id/settings", async (request) => {
    const session = await getSession(request, true);
    const input = z.object({ difficulty: z.enum(["rookie", "standard", "expert"]), familyFriendly: z.boolean(), channels: z.object({ email: z.boolean(), sms: z.boolean(), voice: z.boolean() }).strict() }).strict().parse(request.body);
    return leagues.settings(session, request.params.id, input);
  });
  app.get<{ Params: { id: string } }>("/api/leagues/:id/chat", async (request) => leagues.chat(await getSession(request), request.params.id));
  app.post<{ Params: { id: string } }>("/api/leagues/:id/chat", async (request) => {
    const session = await getSession(request, true);
    const { body } = z.object({ body: z.string().trim().min(1).max(600) }).strict().parse(request.body);
    return leagues.postChat(session, request.params.id, body);
  });
  app.get("/api/leagues/:id/matchups/:matchId/recap", async (request, reply) => {
    await getSession(request);
    return reply.code(410).send({ error: "This recap is no longer available. View match results in League." });
  });
  app.get<{ Params: { targetId: string } }>("/api/scouting/:targetId", async (request) => {
    const session = await getSession(request);
    return (await service.forSession(session, true)).scouting(session.userId, request.params.targetId);
  });
  app.put<{ Params: { targetId: string } }>("/api/scouting/:targetId", async (request) => {
    const session = await getSession(request, true);
    const input = scoutingInputSchema.parse(request.body);
    return (await service.forSession(session, true)).saveScouting(session.userId, request.params.targetId, input);
  });
  app.post("/api/consent", async (request) => {
    const session = await getSession(request, true);
    const input = z
      .object({
        adult: z.literal(true),
        channels: z
          .object({ email: z.boolean(), sms: z.boolean(), voice: z.boolean() })
          .strict(),
        timezone: z.string().min(1).max(100),
        startHour: z.number().int().min(0).max(23),
        endHour: z.number().int().min(1).max(24),
        familyFriendly: z.boolean(),
        displayName: z.string().trim().min(2).max(24).optional(),
        excludedThemes: z.array(z.string().trim().max(80)).max(5).optional(),
      })
      .strict()
      .parse(request.body);
    await (await service.forSession(session, true)).consent(session.userId, input);
    return { ok: true };
  });
  app.post("/api/pause", async (request) => {
    const session = await getSession(request, true);
    const { paused } = z
      .object({ paused: z.boolean() })
      .strict()
      .parse(request.body);
    await service.setPaused(session.userId, paused);
    return { ok: true };
  });
  app.post("/api/drafts/generate", async (request, reply) => {
    const session = await getSession(request, true);
    const result = await (await service.forSession(session, true)).generate(
      session.userId,
      generateSchema.parse(request.body),
    );
    reply.code(202);
    return result;
  });
  app.post("/api/drafts/prepare", async (request) => {
    const session = await getSession(request, true);
    return (await service.forSession(session, true)).generate(session.userId, generateSchema.parse(request.body), true);
  });
  app.patch<{
    Params: {
      id: string;
    };
  }>("/api/drafts/:id", async (request) => {
    const session = await getSession(request, true);
    const input = z
      .object({
        bodyText: z.string().min(20).max(700).optional(),
        smsText: z.string().min(15).max(300).optional(),
        voiceScript: z.string().min(40).max(440).optional(),
        subject: z.string().min(3).max(100).optional(),
        senderDisplayName: z.string().regex(/^[^\p{Cc}\p{Cf}\u2028\u2029]+$/u).trim().min(2).max(60).optional(),
      })
      .strict()
      .parse(request.body);
    await (await service.forSession(session, true)).editDraft(session.userId, request.params.id, input);
    return { ok: true };
  });
  app.post<{
    Params: {
      id: string;
    };
  }>("/api/drafts/:id/lock", async (request) => {
    const session = await getSession(request, true);
    await (await service.forSession(session, true)).lock(session.userId, request.params.id);
    return { ok: true };
  });
  app.post<{ Params: { id: string } }>("/api/drafts/:id/send", async (request) => {
    const session = await getSession(request, true);
    z.object({}).strict().parse(request.body ?? {});
    return (await service.forSession(session, true)).sendCast(session.userId, request.params.id);
  });
  app.post("/api/match/activate", async (request) => {
    const session = await getSession(request, true);
    await (await service.forSession(session, true)).activate(session.userId);
    return { ok: true };
  });
  app.post<{
    Params: {
      id: string;
    };
  }>("/api/scenarios/:id/decision", async (request) => {
    const session = await getSession(request, true);
    return (await service.forSession(session, true)).decisionFor(
      session.userId,
      request.params.id,
      decisionSchema.parse(request.body).choice,
    );
  });
  app.post<{
    Params: {
      id: string;
    };
  }>("/api/scenarios/:id/ignore", async (request) => {
    const session = await getSession(request, true);
    await (await service.forSession(session, true)).ignore(session.userId, request.params.id);
    return { ok: true };
  });
  app.get("/api/operator", async (request) => {
    const session = await operator(request);
    return (await service.forSession(session)).operator();
  });
  app.post("/api/operator/reset", async (request) => {
    await operator(request);
    await service.reset(true);
    return { ok: true };
  });
  app.post("/api/operator/release", async (request) => {
    const session = await operator(request);
    const { recipientId, all } = z
      .object({
        recipientId: z.enum(["alex", "jordan", "sam", "riley", "casey", "morgan", "jamie", "taylor"]).optional(),
        all: z.boolean().optional(),
      })
      .strict()
      .parse(request.body ?? {});
    await (await service.forSession(session, true)).release(recipientId, all);
    return { ok: true };
  });
  app.post("/api/operator/advance", async (request) => {
    await operator(request);
    const { minutes } = z
      .object({ minutes: z.number().min(0).max(1440) })
      .strict()
      .parse(request.body);
    await service.advance(minutes);
    return { ok: true };
  });
  app.post("/api/operator/finalize", async (request) => {
    const session = await operator(request);
    const matchService = await service.forSession(session, true);
    const db = await matchService.readDb();
    if (db.match.ruleSet === "email-casts-v2" && db.match.state === "active" && service.now(db) < db.match.deadline)
      await service.advance(Math.ceil((db.match.deadline - service.now(db)) / 60000));
    await matchService.finalize();
    return { ok: true };
  });
  app.get<{
    Params: {
      token: string;
    };
  }>("/r/:token", async (request, reply) => {
    const { scenario, db } = await service.challengeToken(request.params.token);
    let session: Session | null = null;
    try {
      session = await getSession(request);
    } catch {
      /* A preview is deliberately score neutral and may precede sign-in. */
    }
    const differentAccount = Boolean(session && session.userId !== scenario.recipientId);
    if (differentAccount) { session = null; reply.code(403); }
    const marker =
      service.simulated
        ? '<p class="tag">Simulated delivery · fictional league</p>'
        : "";
    let body =
      marker + (differentAccount ? "<p>This email belongs to another account. Sign in as the intended recipient below.</p>" : "") +
      `<p class="muted">${escape(scenario.content.senderDisplayName)}</p><div class="message">${escape(scenario.channel === "sms" ? scenario.content.smsText : scenario.channel === "voice" ? scenario.content.voiceScript : scenario.content.bodyText)}</div>`;
    if (session) {
      const decision = db.decisions.find(
        (d) => d.scenarioId === scenario.id && d.recipientId === session.userId,
      );
      if (decision)
        body += (scenario.isPhishing && decision.choice === "trust" ? prankRevealHtml(scenario) : "") + `<h2>${decision.correct ? "Bait spotted. Nicely played." : "You took a detour."}</h2><p>${escape(scenario.content.explanation)}</p><p>${decision.defenderPoints > 0 ? "+" : ""}${decision.defenderPoints} points</p>`;
      else
        body += `<p>Inspect freely. Only your submitted answer locks a decision.</p><form id="challenge-response" method="post" action="/r/${escape(request.params.token)}"><input type="hidden" name="csrf" value="${escape(session.csrf)}"><button type="submit" name="choice" value="trust">Trust it</button><button type="submit" name="choice" value="flag">Flag as phishing</button><p id="challenge-response-status" role="status" aria-live="polite"></p></form>${challengeResponseScript}`;
    } else if (service.config.emailDemo)
      body += `<p>Sign in with your verified email to respond. Opening this page does not change your score.</p><a href="/auth/email?challenge=${encodeURIComponent(request.params.token)}">Sign in to respond</a>`;
    else if (service.simulated)
      body += `<p>Sign in to the account that received this challenge, then return here to respond. Opening this preview earns no points.</p><a href="${escape(service.config.appOrigin)}">Sign in to your account</a>`;
    else
      body += `<p>Opening this preview earns no points.</p><a href="/auth/login?challenge=${encodeURIComponent(request.params.token)}">Sign in to respond</a>`;
    body += `<p><a href="${escape(service.config.appOrigin)}">Back to the league</a></p>`;
    return reply.type("text/html").send(page(scenario.content.subject, body));
  });
  app.post<{
    Params: {
      token: string;
    };
  }>("/r/:token/login", async () => {
    if (!service.simulated)
      throw new ApiError(403, "Demo sign-in disabled");
    throw new ApiError(410, "Sign in with your email and password in the app.");
  });
  app.post<{
    Params: {
      token: string;
    };
  }>("/r/:token", async (request, reply) => {
    const session = await getSession(request, true);
    const { scenario } = await service.challengeToken(request.params.token);
    const input = z
      .object({ choice: z.enum(["trust", "flag"]), csrf: z.string() })
      .strict()
      .parse(request.body);
    await (await service.forScenario(scenario.id)).decisionFor(session.userId, scenario.id, input.choice);
    return reply.redirect(`/r/${encodeURIComponent(request.params.token)}`);
  });
  if (service.config.emailDemo) registerWebApp(app);
  else app.get("/", async (_request, reply) =>
    reply
      .type("text/html")
      .send(
        page(
          "A little rivalry. A sharper instinct.",
          `<p>Private, opt-in phishing practice for adult friends.</p><p>${service.config.mode === "demo" ? "This local demo uses fictional people and simulated delivery." : "Real channels require verified membership and consent."}</p><a href="${escape(service.config.appOrigin)}">Open the league</a>`,
        ),
      ),
  );
  await registerProviderRoutes(app, service);
  registerPrankRevealRoutes(app, service, getSession);
  registerVoiceAuthoringRoutes(app, service, getSession);
  registerPhoneEnrollmentRoutes(app, service, getSession);
  await registerLiveAuth(app, service, service.config);
  const io = new Server(app.server, {
    cors: { origin: service.config.appOrigin, credentials: true },
  });
  io.use(async (socket, next) => {
    try {
      if (typeof socket.handshake.auth.token !== "string")
        throw new Error("Session required");
      socket.data.session = await authenticate(socket.handshake.auth.token);
      next();
    } catch {
      next(new Error("Unauthorized"));
    }
  });
  io.on("connection", (socket) => {
    const session = socket.data.session as Session;
    void socket.join(`user:${session.userId}`);
    socket.on("subscribe", (_payload, ack) => {
      if (typeof ack === "function")
        ack({ error: "Subscriptions are assigned by the server" });
    });
  });
  service.onChange = () => {
    io.emit("state:changed");
  };
  const timer = startJobs
    ? setInterval(() => {
        void service
          .tickAll()
          .catch((error) =>
            app.log.error({
              message:
                error instanceof Error ? error.message : "Job runner failed",
            }),
          );
      }, service.config.jobIntervalMs)
    : null;
  timer?.unref();
  app.addHook("preClose", async () => {
    io.disconnectSockets(true);
  });
  app.addHook("onClose", async () => {
    if (timer) clearInterval(timer);
    service.onChange = () => undefined;
    await new Promise<void>((resolve) => io.close(() => resolve()));
    await service.repo.close();
  });
  return { app, io };
}
