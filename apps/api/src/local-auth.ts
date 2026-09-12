import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { blankConsent } from "@fp/shared";
import { ApiError, type GameService } from "./service.js";

const emailSchema = z.string().trim().email().max(254).transform(value => value.toLowerCase());
const passwordSchema = z.string().min(10).max(128);
const registerSchema = z.object({ name: z.string().trim().min(2).max(24).regex(/^[^\p{Cc}\p{Cf}]+$/u), email: emailSchema, password: passwordSchema }).strict();
const loginSchema = z.object({ email: emailSchema, password: passwordSchema }).strict();
const digest = (text: string) => createHash("sha256").update(text).digest("hex");
function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => scrypt(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 32 * 1024 * 1024 }, (error, key) => error ? reject(error) : resolve(key)));
}
async function hashPassword(password: string) {
  const salt = randomBytes(16);
  return `scrypt-v1$${salt.toString("base64url")}$${(await derive(password, salt)).toString("base64url")}`;
}
async function validPassword(password: string, encoded?: string) {
  const parts = encoded?.split("$");
  const valid = parts?.length === 3 && parts[0] === "scrypt-v1" && /^[A-Za-z0-9_-]{22}$/.test(parts[1]) && /^[A-Za-z0-9_-]{86}$/.test(parts[2]);
  // Missing users perform the same KDF work and return the same login error.
  const salt = valid ? Buffer.from(parts[1], "base64url") : Buffer.alloc(16);
  const expected = valid ? Buffer.from(parts[2], "base64url") : Buffer.alloc(64);
  const actual = await derive(password, salt);
  return timingSafeEqual(actual, expected) && Boolean(valid);
}

/** Password accounts are only for the local simulator; real email keeps ownership verification. */
export function registerLocalAuth(app: FastifyInstance, service: GameService) {
  const guard = (request: FastifyRequest) => {
    if (!service.simulated) throw new ApiError(403, "Use verified email sign-in for real delivery.");
    const origin = request.headers.origin;
    if ((origin && ![service.config.apiOrigin, service.config.appOrigin].includes(origin)) ||
      (!origin && request.headers["sec-fetch-site"] === "cross-site")) throw new ApiError(403, "Origin rejected");
  };
  const throttle = async (request: FastifyRequest, email: string) => {
    const now = Date.now(), emailHash = digest(email), ipHash = digest(request.ip);
    const allowed = await service.transact(db => {
      db.localAuthAttempts = (db.localAuthAttempts ?? []).filter(attempt => attempt.createdAt > now - 15 * 60000);
      if (db.localAuthAttempts.length >= 1000 || db.localAuthAttempts.filter(attempt => attempt.emailHash === emailHash).length >= 8 ||
        db.localAuthAttempts.filter(attempt => attempt.ipHash === ipHash).length >= 30) return false;
      db.localAuthAttempts.push({ emailHash, ipHash, createdAt: now });
      return true;
    });
    if (!allowed) throw new ApiError(429, "Too many sign-in attempts. Wait 15 minutes before trying again.");
  };
  const issue = async (userId: string, reply: FastifyReply) => {
    const session = await service.createSession(userId);
    reply.setCookie("fp_session", session.token, { path: "/", httpOnly: true, secure: service.config.apiOrigin.startsWith("https:"), sameSite: "lax", maxAge: 7 * 86400 });
    return session;
  };
  app.post("/api/account/register", { bodyLimit: 2048 }, async (request, reply) => {
    guard(request);
    const input = registerSchema.parse(request.body);
    await throttle(request, input.email);
    const passwordHash = await hashPassword(input.password);
    const userId = await service.transact(db => {
      if (db.accounts?.some(account => account.localAuth?.email === input.email || account.consent.contacts.email?.destination.toLowerCase() === input.email))
        throw new ApiError(409, "An account already uses that email. Sign in instead.");
      const id = randomUUID(), consent = blankConsent();
      consent.contacts.email = { destination: input.email, verified: false, method: "demo" };
      (db.accounts ??= []).push({ userId: id, consent, localAuth: { email: input.email, passwordHash } });
      db.profiles.push({ id, name: input.name, initials: input.name.split(/\s+/).map(part => part[0]).slice(0, 2).join("").toUpperCase(),
        color: "#96DEC5", interests: ["Board games", "Live music", "Outdoor adventures"], historical: false,
        leaguePoints: 0, wins: 0, losses: 0, draws: 0 });
      return id;
    });
    return issue(userId, reply);
  });
  app.post("/api/account/login", { bodyLimit: 2048 }, async (request, reply) => {
    guard(request);
    const input = loginSchema.parse(request.body);
    await throttle(request, input.email);
    const account = (await service.readDb()).accounts?.find(item => item.localAuth?.email === input.email);
    if (!await validPassword(input.password, account?.localAuth?.passwordHash) || !account)
      throw new ApiError(401, "Email or password is incorrect.");
    return issue(account.userId, reply);
  });
}
