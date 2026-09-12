import { createHash, createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import nodemailer from "nodemailer";
import { z } from "zod";
import { blankConsent, type Database } from "@fp/shared";
import { ApiError, type GameService } from "./service.js";
import { gamePools } from "./repository.js";
import { captureAddress, captureConfiguration, captureFrom, captureTransportOptions } from "./mail-capture.js";

export interface EmailAuthOptions {
  env?: NodeJS.ProcessEnv;
  sendCode?: (message: { email: string; code: string }) => Promise<void>;
  now?: () => number;
}

const emailSchema = z.string().trim().email().max(254).transform(value => value.toLowerCase());
const opaque = z.string().regex(/^[A-Za-z0-9_-]{32,128}$/);
const startSchema = z.object({ email: emailSchema, csrf: opaque, challenge: opaque.optional() }).strict();
const verifySchema = z.object({ requestId: opaque, code: z.string().regex(/^\d{6}$/), csrf: opaque, challenge: opaque.optional() }).strict();
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const equal = (a: string, b: string) => {
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};
const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const csrfCookie = "fp_email_csrf";
const lifetime = 10 * 60000;
const hour = 60 * 60000;

function html(title: string, body: string) {
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)} · Fantasy Phishing</title><style>body{margin:0;background:#0e1d26;color:#f5f4ed;font:16px/1.6 system-ui;padding:24px}main{max-width:460px;margin:5vh auto}h1{line-height:1.2}label{display:block}input,button{box-sizing:border-box;font:inherit;padding:14px;border-radius:10px;width:100%;margin:8px 0 16px}input{border:1px solid #2b424c;background:#162b35;color:#f5f4ed}button{border:0;background:#96dec5;color:#17262a;cursor:pointer}a{color:#96dec5}.error{color:#f39c88}.muted{color:#adbdc3}</style><main><p class="muted">Fantasy Phishing · private email demo</p><h1>${escape(title)}</h1>${body}</main></html>`;
}

function accountFromVerifiedEmail(db: Database, email: string, now: number, captured = false) {
  db.accounts ??= [];
  // A matching unverified address on a sample profile is not proof of ownership.
  const method = captured ? "captured" as const : "verify" as const;
  const existing = db.accounts.find(account => !account.auth0Sub && account.consent.contacts.email?.method === method && account.consent.contacts.email.verified && account.consent.contacts.email.destination.toLowerCase() === email);
  const userId = existing?.userId ?? randomUUID();
  const consent = existing ? structuredClone(existing.consent) : blankConsent();
  consent.contacts.email = { destination: email, verified: true, method, verifiedAt: now };
  if (existing) existing.consent = consent;
  else {
    db.accounts.push({ userId, consent });
    db.profiles.push({ id: userId, name: email.split("@")[0].slice(0, 24), initials: email[0].toUpperCase(), color: "#96DEC5", interests: ["Board games", "Live music", "Outdoor adventures"], historical: false, leaguePoints: 0, wins: 0, losses: 0, draws: 0 });
  }
  for (const member of db.members.filter(member => member.userId === userId)) member.consent.contacts.email = structuredClone(consent.contacts.email);
  return userId;
}

/** Email ownership verification, with an optional restriction to invited addresses. */
export function registerEmailAuth(app: FastifyInstance, service: GameService, options: EmailAuthOptions = {}) {
  const env = options.env ?? process.env;
  const now = options.now ?? Date.now;
  const apiUrl = new URL(service.config.apiOrigin);
  const appUrl = new URL(service.config.appOrigin);
  const crossHost = apiUrl.hostname !== appUrl.hostname;
  const secure = apiUrl.protocol === "https:";
  const cookieOptions = { path: "/", httpOnly: true, secure, sameSite: crossHost && secure && appUrl.protocol === "https:" ? "none" as const : "lax" as const, maxAge: 600 };
  const requireEnabled = () => {
    if (service.config.mode !== "demo" || !service.config.emailDemo) throw new ApiError(404, "Email demo sign-in is disabled");
    if (service.config.emailCapture && !captureConfiguration(env)) throw new ApiError(503, "Local mailbox capture configuration is invalid");
    const recipients = (env.EMAIL_DEMO_RECIPIENTS ?? "").split(",").map(value => value.trim()).filter(Boolean);
    if (recipients.some(value => !emailSchema.safeParse(value).success) || (env.SESSION_SECRET?.length ?? 0) < 32)
      throw new ApiError(503, "Email sign-in needs a valid session secret and optional invitation settings");
    return recipients.length ? new Set(recipients.map(value => value.toLowerCase())) : null;
  };
  const digest = (label: string, value: string) => createHmac("sha256", env.SESSION_SECRET!).update(`${label}:${value}`).digest("hex");
  const checkBrowser = (request: FastifyRequest, csrf: string, form: boolean) => {
    const origin = request.headers.origin;
    const allowed = form ? [service.config.apiOrigin] : [service.config.apiOrigin, service.config.appOrigin];
    if ((origin && !allowed.includes(origin)) || (!origin && request.headers["sec-fetch-site"] === "cross-site")) throw new ApiError(403, "Origin rejected");
    if (!request.cookies[csrfCookie] || !equal(request.cookies[csrfCookie], csrf)) throw new ApiError(403, "Refresh sign-in before trying again");
  };
  const csrfFor = (request: FastifyRequest, reply: FastifyReply) => {
    const current = request.cookies[csrfCookie];
    const csrf = current && opaque.safeParse(current).success ? current : randomBytes(32).toString("base64url");
    reply.setCookie(csrfCookie, csrf, cookieOptions);
    return csrf;
  };
  const challengeAvailable = (db: Database, challenge: string, email?: string) => {
    const challengeHash = hash(challenge);
    return gamePools(db).some(pool => pool.match.state === "active" && pool.scenarios.some(scenario => {
      if (scenario.tokenHash !== challengeHash || scenario.tokenExpiresAt <= service.now(db) || scenario.releasedAt === null || scenario.deliveryStatus === "cancelled") return false;
      if (!email) return true;
      const recipient = db.accounts?.find(account => account.userId === scenario.recipientId) ?? db.members.find(member => member.userId === scenario.recipientId);
      return recipient?.consent.contacts.email?.verified === true && recipient.consent.contacts.email.destination.toLowerCase() === email;
    }));
  };
  const sendCode = options.sendCode ?? (async ({ email, code }: { email: string; code: string }) => {
    const port = Number(env.SMTP_PORT ?? 587);
    const smtpSecure = env.SMTP_SECURE === "true";
    if (!service.config.emailCapture && (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS || !emailSchema.safeParse(env.SMTP_FROM).success || ![465, 587].includes(port) || (port === 465) !== smtpSecure))
      throw new ApiError(503, "Email sign-in needs authenticated SMTP with TLS on port 465 or STARTTLS on port 587");
    const transport = nodemailer.createTransport(service.config.emailCapture ? captureTransportOptions(env) : { host: env.SMTP_HOST, port, secure: smtpSecure, requireTLS: true, auth: { user: env.SMTP_USER, pass: env.SMTP_PASS }, connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000 });
    let deadline: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        transport.sendMail({ from: { name: "Fantasy Phishing", address: service.config.emailCapture ? captureFrom : env.SMTP_FROM! }, to: email, subject: "Your Fantasy Phishing sign-in code", text: `Your Fantasy Phishing sign-in code is ${code}.\n\nIt expires in 10 minutes. Enter it only in the Fantasy Phishing app or sign-in page you opened. Never share this code with another player.\n\n${service.config.emailCapture ? "This verifies a local demo mailbox only. No external email ownership is established." : "This is an account verification email for the private email demo, not a phishing challenge. If you did not request it, ignore it."}`, disableFileAccess: true, disableUrlAccess: true }),
        new Promise<never>((_resolve, reject) => {
          deadline = setTimeout(() => { transport.close(); reject(new Error("Sign-in SMTP submission deadline exceeded")); }, 25000);
        }),
      ]);
      if (!result.accepted.some(address => String(address).toLowerCase() === email)) throw new Error("SMTP did not accept sign-in email");
    } finally { clearTimeout(deadline); transport.close(); }
  });
  const start = async (request: FastifyRequest, input: z.infer<typeof startSchema>, form: boolean) => {
    const allowed = requireEnabled();
    checkBrowser(request, input.csrf, form);
    if (env.EMAIL_DEMO_SEND_ENABLED !== "true") throw new ApiError(503, "Email sending hasn't been enabled for this demo yet");
    if (service.config.emailCapture && !captureAddress(input.email)) throw new ApiError(400, "Use a local mailbox ending in @demo.test, such as alex@demo.test. Open the local mailbox on port 8026 for its code.");
    if (allowed && !allowed.has(input.email)) throw new ApiError(403, "Use an email address invited to this private demo");
    const timestamp = now();
    const id = randomBytes(32).toString("base64url");
    const code = String(randomInt(0, 1000000)).padStart(6, "0");
    const ipHash = digest("ip", request.ip);
    await service.transact(db => {
      if (input.challenge && !challengeAvailable(db, input.challenge, input.email)) throw new ApiError(403, "Use the email address that received this challenge, while its match is active");
      db.emailLogins = (db.emailLogins ?? []).filter(record => record.createdAt > timestamp - hour);
      const records = db.emailLogins;
      const previous = records.filter(record => record.email === input.email);
      if (previous.some(record => record.createdAt > timestamp - 60000)) throw new ApiError(429, "Wait a minute before requesting another code");
      if (previous.length >= 3 || records.length >= 10 || records.filter(record => record.ipHash === ipHash).length >= 5) throw new ApiError(429, "The sign-in email limit has been reached. Try again later");
      for (const record of previous) record.consumedAt ??= timestamp;
      records.push({ id, email: input.email, codeHash: digest("code", `${id}:${code}`), browserHash: digest("browser", input.csrf), ipHash, createdAt: timestamp, expiresAt: timestamp + lifetime, attempts: 0, status: "pending", ...(input.challenge ? { challengeHash: hash(input.challenge) } : {}) });
    });
    try {
      await sendCode({ email: input.email, code });
      await service.transact(db => { const record = db.emailLogins?.find(item => item.id === id); if (record) record.status = "sent"; });
    } catch {
      await service.transact(db => { const record = db.emailLogins?.find(item => item.id === id); if (record) { record.status = "failed"; record.consumedAt = now(); } });
      throw new ApiError(503, "We couldn't send a sign-in code. Check the email setup and try again in a minute");
    }
    return { requestId: id, expiresIn: 600 };
  };
  const verify = async (request: FastifyRequest, reply: FastifyReply, input: z.infer<typeof verifySchema>, form: boolean) => {
    const allowed = requireEnabled();
    checkBrowser(request, input.csrf, form);
    const result = await service.transact(db => {
      const record = db.emailLogins?.find(item => item.id === input.requestId);
      const timestamp = now();
      if (!record || record.status !== "sent" || record.consumedAt !== undefined || record.expiresAt <= timestamp || record.attempts >= 5 || (allowed && !allowed.has(record.email)) || !equal(record.browserHash, digest("browser", input.csrf))) return { error: true as const };
      if ((record.challengeHash ?? "") !== (input.challenge ? hash(input.challenge) : "") || (input.challenge && !challengeAvailable(db, input.challenge, record.email))) return { error: true as const };
      record.attempts += 1;
      if (!equal(record.codeHash, digest("code", `${record.id}:${input.code}`))) return { error: true as const };
      record.consumedAt = timestamp;
      return { userId: accountFromVerifiedEmail(db, record.email, timestamp, service.config.emailCapture) };
    });
    if ("error" in result) throw new ApiError(401, "That code is invalid or expired. Request a new code if needed");
    const session = await service.createSession(result.userId, "player");
    reply.setCookie("fp_session", session.token, { ...cookieOptions, maxAge: 7 * 86400 });
    return session;
  };
  const respondPage = (reply: FastifyReply, title: string, body: string) => reply.header("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'").header("Cache-Control", "no-store").header("Referrer-Policy", "no-referrer").type("text/html").send(html(title, body));
  const hidden = (name: string, value: string) => `<input type="hidden" name="${name}" value="${escape(value)}">`;
  const codeForm = (input: { csrf: string; requestId: string; challenge?: string }, error?: string) => `${error ? `<p class="error" role="alert">${escape(error)}</p>` : "<p>Enter the six-digit code we sent to your email.</p>"}<form method="post" action="/auth/email/verify">${hidden("csrf", input.csrf)}${hidden("requestId", input.requestId)}${input.challenge ? hidden("challenge", input.challenge) : ""}<label for="code">Sign-in code</label><input id="code" name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required autofocus><button>Verify and continue</button></form><a href="/auth/email${input.challenge ? `?challenge=${encodeURIComponent(input.challenge)}` : ""}">Request another code</a>`;

  app.get("/api/auth/email", async (request, reply) => {
    requireEnabled();
    reply.header("Cache-Control", "no-store");
    return { csrf: csrfFor(request, reply) };
  });
  app.post("/api/auth/email/start", async request => start(request, startSchema.parse(request.body), false));
  app.post("/api/auth/email/verify", async (request, reply) => verify(request, reply, verifySchema.parse(request.body), false));
  app.get<{ Querystring: { challenge?: string } }>("/auth/email", async (request, reply) => {
    requireEnabled();
    const challenge = opaque.optional().parse(request.query.challenge);
    if (!challenge) return reply.redirect(service.config.appOrigin);
    if (challenge && !challengeAvailable(await service.readDb(), challenge)) throw new ApiError(410, "Challenge expired or unavailable");
    const csrf = csrfFor(request, reply);
    return respondPage(reply, "Sign in with your email", `<p>${challenge ? "Use the email address that received this challenge." : "Use your invited email address to join the private demo."}</p><form method="post" action="/auth/email/start">${hidden("csrf", csrf)}${challenge ? hidden("challenge", challenge) : ""}<label for="email">Email address</label><input id="email" name="email" type="email" autocomplete="email" maxlength="254" required><button>Send sign-in code</button></form><p class="muted">Signing in does not accept a challenge or change your score.</p>`);
  });
  app.post("/auth/email/start", async (request, reply) => {
    requireEnabled();
    const input = startSchema.parse(request.body);
    if (!input.challenge) return reply.redirect(service.config.appOrigin);
    const result = await start(request, input, true);
    return respondPage(reply, "Check your email", codeForm({ ...input, ...result }));
  });
  app.post("/auth/email/verify", async (request, reply) => {
    requireEnabled();
    const input = verifySchema.parse(request.body);
    if (!input.challenge) return reply.redirect(service.config.appOrigin);
    try {
      await verify(request, reply, input, true);
      return reply.redirect(input.challenge ? `/r/${encodeURIComponent(input.challenge)}` : service.config.appOrigin);
    } catch (error) {
      if (error instanceof ApiError && error.statusCode === 401) return respondPage(reply.code(401), "Check your code", codeForm(input, error.message));
      throw error;
    }
  });
}
