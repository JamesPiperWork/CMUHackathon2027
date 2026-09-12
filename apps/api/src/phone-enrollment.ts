import { createHmac, randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import twilio from "twilio";
import { z } from "zod";
import type { Session } from "@fp/shared";
import { accountFor } from "./accounts.js";
import type { GameService } from "./service.js";
import { gamePools } from "./repository.js";
import { phoneVerificationConfiguration } from "./phone-config.js";
type Authenticate = (request: FastifyRequest, mutation?: boolean) => Promise<Session>;
class PhoneEnrollmentError extends Error { constructor(public statusCode: number, message: string) { super(message); } }
const startSchema = z.object({ phoneNumber: z.string().trim().regex(/^\+1\d{10}$/, "Use a US phone number in +1 format."), consent: z.literal(true) }).strict();
const checkSchema = z.object({ requestId: z.string().uuid(), code: z.string().regex(/^\d{4,10}$/) }).strict();
export interface PhoneEnrollmentOptions {
  env?: NodeJS.ProcessEnv;
  now?: () => number;
  startVerification?: (phone: string) => Promise<{ sid: string; status: string }>;
  checkVerification?: (providerId: string, code: string) => Promise<{ sid: string; status: string; to: string }>;
}
export function registerPhoneEnrollmentRoutes(app: FastifyInstance, service: GameService, authenticate: Authenticate, options: PhoneEnrollmentOptions = {}) {
  const env = options.env ?? process.env, now = options.now ?? Date.now;
  const client = () => twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN, { timeout: 15000, autoRetry: false }).verify.v2.services(env.TWILIO_VERIFY_SERVICE_SID!);
  const startVerification = options.startVerification ?? (phone => client().verifications.create({ to: phone, channel: "sms" }));
  const checkVerification = options.checkVerification ?? ((verificationSid, code) => client().verificationChecks.create({ verificationSid, code }));
  const requireReady = () => {
    if (!phoneVerificationConfiguration(env).ready) throw new PhoneEnrollmentError(409, "Phone verification is not configured. Check the phone setup status before requesting a code.");
  };
  app.get("/api/phone", async request => {
    const session = await authenticate(request), account = accountFor(await service.readDb(), session.userId);
    const contact = account.consent.contacts.voice ?? account.consent.contacts.sms;
    return { verification: phoneVerificationConfiguration(env), phoneNumber: contact?.destination ?? "", verified: contact?.verified === true && contact.method === "verify" };
  });
  app.post("/api/phone/start", async (request, reply) => {
    const session = await authenticate(request, true), input = startSchema.parse(request.body); requireReady();
    const timestamp = now(), id = randomUUID();
    await service.transact(db => {
      const account = accountFor(db, session.userId), email = account.consent.contacts.email;
      if (!email?.verified || !["verify", "auth0"].includes(email.method)) throw new PhoneEnrollmentError(403, "Verify your own email account before adding a phone number.");
      const ipHash = createHmac("sha256", env.SESSION_SECRET!).update(request.ip).digest("hex");
      db.phoneVerifications = (db.phoneVerifications ?? []).filter(item => item.createdAt > timestamp - 3600000);
      const recent = db.phoneVerifications;
      if (recent.some(item => (item.userId === session.userId || item.destination === input.phoneNumber) && item.createdAt > timestamp - 60000))
        throw new PhoneEnrollmentError(429, "Wait a minute before requesting another verification code.");
      if (recent.length >= 20 || recent.filter(item => item.ipHash === ipHash).length >= 5 || recent.filter(item => item.userId === session.userId || item.destination === input.phoneNumber).length >= 3)
        throw new PhoneEnrollmentError(429, "Phone verification limit reached. Try again later.");
      for (const item of recent) if (item.userId === session.userId) item.consumedAt ??= timestamp;
      recent.push({ id, userId: session.userId, destination: input.phoneNumber, ipHash, createdAt: timestamp, expiresAt: timestamp + 600000, attempts: 0, status: "pending" });
    });
    try {
      const result = await startVerification(input.phoneNumber);
      if (result.status !== "pending" || !/^VE[a-f0-9]{32}$/i.test(result.sid)) throw new Error("Verification not pending");
      await service.transact(db => { const item = db.phoneVerifications?.find(record => record.id === id); if (item) { item.providerId = result.sid; item.status = "sent"; } });
    } catch {
      await service.transact(db => { const item = db.phoneVerifications?.find(record => record.id === id); if (item) { item.status = "failed"; item.consumedAt = now(); } });
      return reply.code(409).send({ error: "Twilio could not send the requested verification text. Check Verify setup, trial recipient eligibility, and account limits. No phone was marked verified." });
    }
    return { requestId: id, expiresIn: 600, phoneNumber: input.phoneNumber };
  });
  app.post("/api/phone/verify", async (request, reply) => {
    const session = await authenticate(request, true), input = checkSchema.parse(request.body); requireReady();
    const reserved = await service.transact(db => {
      const item = db.phoneVerifications?.find(record => record.id === input.requestId && record.userId === session.userId);
      if (!item || item.status !== "sent" || item.consumedAt || item.expiresAt <= now() || item.attempts >= 5 || !item.providerId || (item.checkingAt !== undefined && item.checkingAt > now() - 30000)) return null;
      item.attempts++; item.checkingAt = now(); return { destination: item.destination, providerId: item.providerId, attempts: item.attempts };
    });
    if (!reserved) throw new PhoneEnrollmentError(400, "That verification is invalid or expired. Request another code.");
    const releaseCheck = async () => service.transact(db => {
      const item = db.phoneVerifications?.find(record => record.id === input.requestId && record.userId === session.userId);
      if (item && item.attempts === reserved.attempts) {
        delete item.checkingAt;
        if (item.attempts >= 5) { item.status = "failed"; item.consumedAt ??= now(); }
      }
    });
    let result: { sid: string; status: string; to: string };
    try { result = await checkVerification(reserved.providerId, input.code); }
    catch { await releaseCheck(); return reply.code(409).send({ error: "The code could not be checked. Request a new code if it has expired; phone ownership is still unverified." }); }
    if (result.status !== "approved" || result.to !== reserved.destination || result.sid !== reserved.providerId) {
      await releaseCheck(); throw new PhoneEnrollmentError(400, "That code is invalid or expired.");
    }
    await service.transact(db => {
      const item = db.phoneVerifications?.find(record => record.id === input.requestId && record.userId === session.userId);
      if (!item || item.status !== "sent" || item.consumedAt || item.expiresAt <= now() || item.attempts !== reserved.attempts) throw new PhoneEnrollmentError(409, "This verification was already used or replaced.");
      const account = accountFor(db, session.userId);
      if (db.accounts?.some(other => other.userId !== session.userId && [other.consent.contacts.sms, other.consent.contacts.voice].some(contact => contact?.verified && contact.method === "verify" && contact.destination === item.destination)))
        throw new PhoneEnrollmentError(409, "This phone number is already verified on another account.");
      const contact = { destination: item.destination, verified: true, method: "verify" as const, verifiedAt: now(), evidence: `twilio-verify:${item.providerId}` };
      const prior = account.consent.contacts.voice?.destination ?? account.consent.contacts.sms?.destination;
      account.consent.contacts.sms = structuredClone(contact); account.consent.contacts.voice = structuredClone(contact);
      for (const member of db.members.filter(member => member.userId === session.userId)) {
        member.consent.contacts.sms = structuredClone(contact); member.consent.contacts.voice = structuredClone(contact);
      }
      if (prior !== item.destination) for (const pool of gamePools(db)) for (const job of pool.jobs.filter(job => job.type === "delivery" && ["queued", "leased"].includes(job.status))) {
        const scenario = pool.scenarios.find(scenario => scenario.id === job.scenarioId);
        if (scenario?.recipientId === session.userId && scenario.channel !== "email") {
          if (job.status === "queued") job.status = "cancelled";
          scenario.deliveryStatus = "cancelled";
        }
      }
      item.status = "approved"; item.consumedAt = now(); delete item.checkingAt;
    });
    return { verified: true, phoneNumber: reserved.destination };
  });
  app.post("/api/phone/remove", async request => {
    const session = await authenticate(request, true); z.object({}).strict().parse(request.body ?? {});
    await service.transact(db => {
      const account = accountFor(db, session.userId);
      for (const owner of [account, ...db.members.filter(member => member.userId === session.userId)]) {
        delete owner.consent.contacts.sms; delete owner.consent.contacts.voice;
        owner.consent.channels.sms = false; owner.consent.channels.voice = false;
      }
      // Removing a phone also invalidates a verification that is in flight.
      for (const item of db.phoneVerifications ?? []) if (item.userId === session.userId) item.consumedAt ??= now();
      for (const pool of gamePools(db)) for (const job of pool.jobs.filter(job => job.type === "delivery" && ["queued", "leased"].includes(job.status))) {
        const scenario = pool.scenarios.find(item => item.id === job.scenarioId);
        if (scenario?.recipientId !== session.userId || scenario.channel === "email") continue;
        if (job.status === "queued") { job.status = "cancelled"; scenario.deliveryStatus = "cancelled"; }
        // Submitted calls cannot be recalled here; keep their transport evidence.
      }
    });
    return { ok: true };
  });

}
