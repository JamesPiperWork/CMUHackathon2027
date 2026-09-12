import { createHash, randomUUID } from "node:crypto";
import sharp from "sharp";
import { z } from "zod";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Database, PrankReveal, PrankRevealPublic, Scenario, Session } from "@fp/shared";
import type { GameService } from "./service.js";

class RevealError extends Error { constructor(public statusCode: number, message: string) { super(message); } }
type Authenticate = (request: FastifyRequest, mutation?: boolean) => Promise<Session>;
const presetSchema = z.object({ choice: z.enum(["rickroll", "gone-fishing", "rubber-duck"]), expectedRevision: z.string().max(64) }).strict();
const photoSchema = z.object({ mime: z.enum(["image/jpeg", "image/png", "image/webp"]), base64: z.string().max(2800000), expectedRevision: z.string().max(64) }).strict();
const defaultReveal = { choice: "rickroll", revision: "default" } as const;
const mimeFormats = { "image/jpeg": "jpeg", "image/png": "png", "image/webp": "webp" } as const;

export function publicPrankReveal(scenario: Scenario, audience: "author" | "recipient"): PrankRevealPublic {
  const reveal = scenario.prankReveal ?? defaultReveal;
  return {
    choice: reveal.choice, revision: reveal.revision,
    ...(reveal.choice === "photo" && reveal.photo ? { imageUrl: `${audience === "author" ? "/api/drafts" : "/api/scenarios"}/${encodeURIComponent(scenario.id)}/reveal/photo?revision=${encodeURIComponent(reveal.revision)}` } : {}),
  };
}
function ownDraft(db: Database, userId: string, id: string, editable = false): Scenario {
  const draft = db.scenarios.find(item => item.id === id && item.authorId === userId);
  if (!draft) throw new RevealError(404, "Cast not found.");
  if (editable && (draft.locked || draft.releasedAt !== null || db.attempts.some(item => item.scenarioId === id) || draft.generationStatus === "pending" || !["drafting", "active"].includes(db.match.state) || (db.match.state === "active" && db.match.deadline <= Date.now() + db.clockOffset)))
    throw new RevealError(409, "Choose the surprise before sending this cast.");
  return draft;
}
function checkRevision(draft: Scenario, expectedRevision: string) {
  if ((draft.prankReveal?.revision ?? "default") !== expectedRevision)
    throw new RevealError(409, "The surprise changed in another view. Refresh this cast before choosing again.");
}

export function registerPrankRevealRoutes(app: FastifyInstance, service: GameService, authenticate: Authenticate) {
  let decoding = 0;
  app.put<{ Params: { id: string } }>("/api/drafts/:id/reveal", async request => {
    const session = await authenticate(request, true), input = presetSchema.parse(request.body), scoped = await service.forSession(session, true);
    return scoped.transact(db => {
      const draft = ownDraft(db, session.userId, request.params.id, true); checkRevision(draft, input.expectedRevision);
      draft.prankReveal = { choice: input.choice, revision: randomUUID() };
      return publicPrankReveal(draft, "author");
    });
  });
  app.post<{ Params: { id: string } }>("/api/drafts/:id/reveal/photo", { bodyLimit: 2850000 }, async request => {
    const session = await authenticate(request, true), input = photoSchema.parse(request.body), scoped = await service.forSession(session, true);
    const current = ownDraft(await scoped.readDb(), session.userId, request.params.id, true); checkRevision(current, input.expectedRevision);
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(input.base64)) throw new RevealError(400, "Choose a valid JPEG, PNG or WebP photo.");
    const original = Buffer.from(input.base64, "base64");
    if (!original.length || original.length > 2 * 1024 * 1024) throw new RevealError(400, "Choose a photo smaller than 2 MB.");
    if (decoding >= 3) throw new RevealError(429, "A few photos are processing. Try again in a moment.");
    decoding++;
    let photo: NonNullable<PrankReveal["photo"]>;
    try {
      const decoder = sharp(original, { failOn: "warning", limitInputPixels: 16000000, animated: false });
      const metadata = await decoder.metadata();
      if (metadata.format !== mimeFormats[input.mime] || !metadata.width || !metadata.height || (metadata.pages ?? 1) !== 1)
        throw new Error("Unsupported image");
      // Decode and re-encode: no original metadata, filenames, active content or trailing payloads are served.
      const { data, info } = await decoder.rotate().resize({ width: 1280, height: 1280, fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer({ resolveWithObject: true });
      if (data.length > 1024 * 1024) throw new Error("Photo too large");
      photo = { base64: data.toString("base64"), mime: "image/webp", width: info.width, height: info.height };
    } catch { throw new RevealError(400, "That photo could not be read. Use a still JPEG, PNG or WebP, under 2 MB and 16 megapixels."); }
    finally { decoding--; }
    return scoped.transact(db => {
      const draft = ownDraft(db, session.userId, request.params.id, true); checkRevision(draft, input.expectedRevision);
      draft.prankReveal = { choice: "photo", revision: randomUUID(), photo };
      return publicPrankReveal(draft, "author");
    });
  });
  for (const audience of ["author", "recipient"] as const) {
    app.get<{ Params: { id: string } }>(`${audience === "author" ? "/api/drafts" : "/api/scenarios"}/:id/reveal/photo`, async (request, reply) => {
      const session = await authenticate(request), scoped = await service.forScenario(request.params.id), db = await scoped.readDb();
      const draft = db.scenarios.find(item => item.id === request.params.id);
      if (!draft || (audience === "author" ? draft.authorId !== session.userId : !draft.isPhishing || draft.recipientId !== session.userId || draft.releasedAt === null || !db.decisions.some(item => item.scenarioId === draft.id && item.recipientId === session.userId && item.choice === "trust")))
        throw new RevealError(404, "Photo not found.");
      const { revision } = z.object({ revision: z.string().max(64) }).strict().parse(request.query);
      const reveal = draft.prankReveal;
      if (reveal?.choice !== "photo" || !reveal.photo || reveal.revision !== revision) throw new RevealError(404, "Photo not found.");
      const bytes = Buffer.from(reveal.photo.base64, "base64");
      return reply.type("image/webp").header("Cache-Control", "private, no-store").header("Content-Disposition", "inline; filename=surprise.webp").header("ETag", `"${createHash("sha256").update(bytes).digest("hex")}"`).send(bytes);
    });
  }
}

/** Called only after the authenticated recipient has submitted Trust. */
export function prankRevealHtml(scenario: Scenario): string {
  const reveal = publicPrankReveal(scenario, "recipient");
  const wrapper = (body: string) => `<section aria-label="Your surprise" style="margin:24px 0;padding:24px;border:1px solid #2f5267;border-radius:20px;background:#122b34;text-align:center">${body}</section>`;
  if (reveal.choice === "photo" && reveal.imageUrl) return wrapper(`<h2>You’ve been phished!</h2><img alt="The surprise photo chosen by your opponent" src="${reveal.imageUrl}" style="display:block;width:100%;max-height:520px;object-fit:contain;border-radius:12px">`);
  if (reveal.choice === "gone-fishing") return wrapper('<svg aria-label="A smiling fish" role="img" viewBox="0 0 320 180" style="width:100%;max-width:320px"><path d="M10 160 Q65 125 120 160 T230 160 T340 160" fill="none" stroke="#50e3c2" stroke-width="6"/><path d="M220 65 L290 30 L285 120 Z" fill="#f2c14b"/><ellipse cx="148" cy="85" rx="94" ry="61" fill="#50e3c2"/><circle cx="100" cy="65" r="9" fill="#0b1525"/><path d="M93 91 Q110 113 129 92" stroke="#0b1525" fill="none" stroke-width="5"/></svg><h2>Hook, line and sinker.</h2><p>You caught a fish. Your opponent caught you.</p>');
  if (reveal.choice === "rubber-duck") return wrapper('<svg aria-label="A rubber duck" role="img" viewBox="0 0 320 190" style="width:100%;max-width:320px"><ellipse cx="170" cy="133" rx="92" ry="48" fill="#f2c14b"/><circle cx="112" cy="74" r="44" fill="#f2c14b"/><path d="M73 78 L28 90 L77 103" fill="#f58d5e"/><circle cx="98" cy="62" r="6" fill="#0b1525"/><path d="M163 109 Q214 86 224 135 Q186 159 163 109" fill="#dda42d"/></svg><h2>An important duck update.</h2><p>Quack. You’ve been phished.</p>');
  return wrapper('<p style="font-size:48px;margin:0" aria-hidden="true">🎵</p><h2>You know the rules…</h2><p>Your opponent picked a Rickroll.</p><a href="https://www.youtube.com/watch?v=dQw4w9WgXcQ" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:12px 18px;background:#50e3c2;color:#08241e;border-radius:12px;text-decoration:none">Play your surprise ↗</a><p class="muted" style="font-size:13px">Opens the music video on YouTube.</p>');
}
