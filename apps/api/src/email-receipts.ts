import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Database } from "@fp/shared";
import { gamePools } from "./repository.js";

/** This is a signed relay contract, not a provider-native webhook format. */
export const emailReceiptSchema = z.object({
  version: z.literal(1),
  eventId: z.string().min(1).max(200),
  attemptId: z.string().min(1).max(200),
  providerMessageId: z.string().min(1).max(300),
  recipientId: z.string().min(1).max(200),
  recipientAddress: z.email().max(254),
  status: z.enum(["delivered", "bounced"]),
  occurredAt: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
}).strict();
export type EmailReceipt = z.infer<typeof emailReceiptSchema>;

export const emailRecipientHash = (address: string) =>
  createHash("sha256").update(address.trim().toLowerCase()).digest("hex");
export const smtpMessageId = (attemptId: string, from: string) =>
  `<${attemptId}@${from.split("@")[1]}>`;

/** Fixed array order avoids JSON key-order and raw-body parser ambiguity. */
export function canonicalEmailReceipt(receipt: EmailReceipt) {
  return JSON.stringify([receipt.version, receipt.eventId, receipt.attemptId,
    receipt.providerMessageId, receipt.recipientId, receipt.recipientAddress,
    receipt.status, receipt.occurredAt]);
}
export function signEmailReceipt(receipt: EmailReceipt, timestamp: string, secret: string) {
  return `v1=${createHmac("sha256", secret).update(`${timestamp}.${canonicalEmailReceipt(receipt)}`).digest("hex")}`;
}
function authenticated(receipt: EmailReceipt, timestamp: unknown, signature: unknown, secret: string, now: number) {
  if (secret.length < 32 || typeof timestamp !== "string" || !/^\d{10,13}$/.test(timestamp) || typeof signature !== "string" || !/^v1=[a-f0-9]{64}$/.test(signature)) return false;
  const sentAt = Number(timestamp) * 1000;
  if (!Number.isSafeInteger(sentAt) || Math.abs(now - sentAt) > 300000) return false;
  return timingSafeEqual(Buffer.from(signature), Buffer.from(signEmailReceipt(receipt, timestamp, secret)));
}
interface ReceiptService {
  readDb(): Promise<Database>;
  transact<T>(change: (db: Database) => T | Promise<T>): Promise<T>;
  now(db: Database): number;
  forScenario?(scenarioId: string): Promise<ReceiptService>;
  settleEmailReceipts?(): Promise<void>;
}

export function registerEmailReceiptRoutes(app: FastifyInstance, service: ReceiptService, env: NodeJS.ProcessEnv = process.env) {
  app.post("/webhooks/email/receipts", async (request, reply) => {
    const secret = env.EMAIL_RECEIPT_RELAY_SECRET ?? "";
    if (secret.length < 32) return reply.code(503).send({ error: "Email receipt relay is not configured." });
    const parsed = emailReceiptSchema.safeParse(request.body);
    const receivedAt = Date.now();
    if (!parsed.success) return reply.code(400).send({ error: "Invalid email receipt." });
    const receipt = parsed.data;
    if (!authenticated(receipt, request.headers["x-fp-receipt-timestamp"], request.headers["x-fp-receipt-signature"], secret, receivedAt))
      return reply.code(403).send({ error: "Invalid email receipt signature or timestamp." });
    if (receipt.occurredAt > receivedAt + 60000) return reply.code(400).send({ error: "Receipt occurrence is in the future." });
    const known = gamePools(await service.readDb()).flatMap((p) => p.attempts).find((a) => a.id === receipt.attemptId && a.provider === "smtp" && a.channel === "email");
    if (!known) return reply.code(404).send({ error: "No matching email delivery attempt." });
    const scoped = service.forScenario ? await service.forScenario(known.scenarioId) : service;
    const outcome = await scoped.transact((db) => {
      const attempt = db.attempts.find((a) => a.id === receipt.attemptId && a.provider === "smtp" && a.channel === "email");
      const scenario = db.scenarios.find((s) => s.id === attempt?.scenarioId);
      const recipientHash = emailRecipientHash(receipt.recipientAddress);
      if (!attempt || !scenario || attempt.providerId !== receipt.providerMessageId ||
        attempt.recipientId !== receipt.recipientId || scenario.recipientId !== receipt.recipientId ||
        !attempt.recipientAddressHash || attempt.recipientAddressHash !== recipientHash)
        return "unknown";
      if (receipt.occurredAt < attempt.createdAt - 60000) return "invalid-time";
      const payloadDigest = createHash("sha256").update(canonicalEmailReceipt(receipt)).digest("hex");
      const prior = db.emailReceipts?.find((r) => r.eventId === receipt.eventId);
      if (prior) return prior.payloadDigest === payloadDigest ? "duplicate" : "conflict";
      const terminal = ["completed", "cancelled"].includes(db.match.state) || attempt.status === "cancelled" || scenario.deliveryStatus === "cancelled";
      // A hard bounce wins a timestamp tie. An older receipt never reverses newer evidence.
      const stale = attempt.receiptOccurredAt !== undefined && ((attempt.receiptStatus === "bounced" && receipt.status === "delivered") || receipt.occurredAt < attempt.receiptOccurredAt ||
        (receipt.occurredAt === attempt.receiptOccurredAt && (receipt.status === attempt.receiptStatus || attempt.receiptStatus === "bounced")));
      const disposition = terminal ? "terminal" : stale ? "stale" : "applied";
      (db.emailReceipts ??= []).push({ eventId: receipt.eventId, attemptId: attempt.id,
        providerMessageId: receipt.providerMessageId, recipientAddressHash: recipientHash,
        status: receipt.status, occurredAt: receipt.occurredAt, receivedAt, payloadDigest, disposition });
      const callbackId = `email-receipt:${receipt.eventId}`;
      attempt.callbackIds.push(callbackId);
      db.callbackIds.push(callbackId);
      if (disposition === "applied") {
        attempt.receiptOccurredAt = receipt.occurredAt;
        attempt.receiptStatus = receipt.status;
        attempt.status = receipt.status === "delivered" ? "delivered" : "failed";
        attempt.updatedAt = receivedAt;
        attempt.reason = receipt.status === "delivered" ? "Signed relay confirmed delivery to the recipient mail server; inbox placement is not guaranteed." : "Signed relay confirmed a permanent bounce.";
        scenario.deliveryStatus = attempt.status;
        if (receipt.status === "delivered" && scenario.releasedAt === null) scenario.releasedAt = receipt.occurredAt;
        for (const job of db.jobs.filter((j) => j.type === "delivery" && j.scenarioId === scenario.id)) {
          job.status = receipt.status === "delivered" ? "complete" : "failed";
          job.leaseExpiresAt = null;
        }
      }
      return disposition;
    });
    if (outcome === "unknown") return reply.code(404).send({ error: "No matching email delivery attempt." });
    if (outcome === "invalid-time") return reply.code(400).send({ error: "Receipt predates this delivery attempt." });
    if (outcome === "conflict") return reply.code(409).send({ error: "Receipt event ID was already used for different evidence." });
    await scoped.settleEmailReceipts?.();
    return reply.code(204).send();
  });
}
