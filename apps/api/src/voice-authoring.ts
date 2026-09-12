import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { type Database, type Scenario, type Session } from "@fp/shared";
import type { GameService } from "./service.js";
import { gamePools } from "./repository.js";
import { publicVoiceAudio, readVoiceFile, synthesizeVoiceDraft, voiceConfiguration, voiceModel, voiceRevision } from "./voice-audio.js";
export { invalidateVoiceDraft, voiceAudioApproved, publicVoiceAudio, voiceRevision } from "./voice-audio.js";
class VoiceAuthoringError extends Error { constructor(public statusCode: number, message: string) { super(message); } }
type Authenticate = (request: FastifyRequest, mutation?: boolean) => Promise<Session>;
const revisionSchema = z.object({ revision: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
function ownDraft(db: Database, authorId: string, id: string, editable = false): Scenario {
  const draft = db.scenarios.find(item => item.id === id && item.authorId === authorId && item.channel === "voice");
  if (!draft) throw new VoiceAuthoringError(404, "Voice draft not found.");
  if (editable && (draft.locked || !["drafting", "active"].includes(db.match.state) || (db.match.state === "active" && db.match.deadline <= Date.now() + db.clockOffset) || draft.generationStatus === "pending" || draft.generationStatus === "failed"))
    throw new VoiceAuthoringError(409, "Finish an editable voice script before creating or approving audio.");
  return draft;
}

export function registerVoiceAuthoringRoutes(app: FastifyInstance, service: GameService, authenticate: Authenticate,
  options: { env?: NodeJS.ProcessEnv; fetcher?: typeof fetch; now?: () => number } = {}) {
  const env = options.env ?? process.env, now = options.now ?? Date.now;
  const running = new Set<Promise<void>>();
  app.addHook("onReady", async () => {
    const current = await service.readDb();
    if (!gamePools(current).some(pool => pool.scenarios.some(draft => draft.voiceAudio?.status === "generating"))) return;
    await service.transact(db => {
      for (const pool of gamePools(db)) for (const draft of pool.scenarios) if (draft.voiceAudio?.status === "generating") {
        draft.voiceAudio.status = "failed";
        draft.voiceAudio.error = "Audio creation was interrupted. Create audio again.";
      }
    });
  });
  app.addHook("onClose", async () => { await Promise.allSettled([...running]); });
  app.get("/api/voice/config", async request => { await authenticate(request); return voiceConfiguration(env); });
  app.get<{ Params: { id: string } }>("/api/drafts/:id/audio", async request => {
    const session = await authenticate(request), scoped = await service.forSession(session, true);
    return publicVoiceAudio(ownDraft(await scoped.readDb(), session.userId, request.params.id), env) ?? { status: "not-created" };
  });
  app.post<{ Params: { id: string } }>("/api/drafts/:id/audio", async (request, reply) => {
    const session = await authenticate(request, true); z.object({}).strict().parse(request.body ?? {});
    const setup = voiceConfiguration(env);
    if (!setup.ready) return reply.code(409).send({ error: "Audio setup is incomplete.", readiness: setup });
    const scoped = await service.forSession(session, true);
    const queued = await scoped.transact(db => {
      const draft = ownDraft(db, session.userId, request.params.id, true), revision = voiceRevision(draft.content.voiceScript, env);
      if (draft.voiceAudio?.revision === revision && ["generating", "ready"].includes(draft.voiceAudio.status)) return { state: publicVoiceAudio(draft, env)! };
      const timestamp = now();
      db.voiceSynthesisAttempts = (db.voiceSynthesisAttempts ?? []).filter(item => item.requestedAt > timestamp - 3600000);
      const recent = db.voiceSynthesisAttempts;
      if (recent.length >= 50 || recent.filter(item => item.authorId === session.userId && item.requestedAt > timestamp - 600000).length >= 5)
        throw new VoiceAuthoringError(429, "Audio creation limit reached. Wait a few minutes before trying again.");
      const requestId = randomUUID();
      recent.push({ id: requestId, authorId: session.userId, scenarioId: draft.id, requestedAt: timestamp, revision });
      draft.voiceAudio = { status: "generating", revision, requestedAt: timestamp, requestId, voiceId: env.ELEVENLABS_VOICE_ID!, model: voiceModel };
      return { state: publicVoiceAudio(draft, env)!, draft: structuredClone(draft) };
    });
    if (queued.draft) {
      const snapshot = queued.draft;
      const task = (async () => {
        try {
          const result = await synthesizeVoiceDraft(snapshot, { env, fetcher: options.fetcher });
          await scoped.transact(db => {
            const draft = db.scenarios.find(item => item.id === snapshot.id);
            if (!draft || draft.locked || draft.channel !== "voice" || draft.voiceAudio?.requestId !== snapshot.voiceAudio!.requestId || voiceRevision(draft.content.voiceScript, env) !== snapshot.voiceAudio!.revision) return;
            if (!["drafting", "active"].includes(db.match.state) || (db.match.state === "active" && db.match.deadline <= scoped.now(db))) {
              draft.voiceAudio.status = "failed"; draft.voiceAudio.error = "The week ended before this audio was ready."; return;
            }
            Object.assign(draft.voiceAudio, { status: "ready", key: result.key, durationSeconds: result.durationSeconds, generatedAt: now() });
          });
        } catch (error) {
          await scoped.transact(db => {
            const draft = db.scenarios.find(item => item.id === snapshot.id);
            if (draft?.voiceAudio?.requestId !== snapshot.voiceAudio!.requestId) return;
            draft.voiceAudio.status = "failed";
            draft.voiceAudio.error = error instanceof Error && !/fetch|abort|timeout/i.test(error.message) ? error.message : "Audio creation timed out or failed. No audio was substituted; try again.";
          });
        }
      })();
      running.add(task); void task.finally(() => running.delete(task)).catch(() => undefined);
    }
    return reply.code(queued.state.status === "generating" ? 202 : 200).send(queued.state);
  });
  app.get<{ Params: { id: string } }>("/api/drafts/:id/audio/preview", async (request, reply) => {
    const session = await authenticate(request), { revision } = revisionSchema.parse(request.query);
    const scoped = await service.forSession(session, true), draft = ownDraft(await scoped.readDb(), session.userId, request.params.id);
    if (draft.voiceAudio?.status !== "ready" || draft.voiceAudio.revision !== revision || voiceRevision(draft.content.voiceScript, env) !== revision || !draft.voiceAudio.key)
      throw new VoiceAuthoringError(409, "This audio is no longer current. Create audio for the latest script.");
    let bytes: Buffer;
    try { bytes = await readVoiceFile(draft.voiceAudio.key, env); }
    catch {
      await scoped.transact(db => {
        const current = ownDraft(db, session.userId, request.params.id);
        if (current.voiceAudio?.revision === revision) { current.voiceAudio.status = "failed"; current.voiceAudio.error = "The cached audio is unavailable. Create audio again."; delete current.voiceAudio.approvedAt; }
      });
      throw new VoiceAuthoringError(409, "The cached audio is unavailable. Create audio again.");
    }
    if (request.method !== "HEAD") await scoped.transact(db => {
      const current = ownDraft(db, session.userId, request.params.id);
      if (current.voiceAudio?.status !== "ready" || current.voiceAudio.revision !== revision || voiceRevision(current.content.voiceScript, env) !== revision)
        throw new VoiceAuthoringError(409, "The script changed while loading audio. Play the new revision instead.");
      current.voiceAudio.previewedAt ??= now();
    });
    return reply.header("Cache-Control", "private, no-store").header("Content-Disposition", "inline; filename=voice-preview.wav").type("audio/wav").send(bytes);
  });
  app.post<{ Params: { id: string } }>("/api/drafts/:id/audio/approve", async request => {
    const session = await authenticate(request, true), { revision } = revisionSchema.parse(request.body);
    const scoped = await service.forSession(session, true);
    return scoped.transact(db => {
      const draft = ownDraft(db, session.userId, request.params.id, true), audio = draft.voiceAudio;
      if (audio?.status !== "ready" || audio.revision !== revision || voiceRevision(draft.content.voiceScript, env) !== revision || !audio.previewedAt)
        throw new VoiceAuthoringError(409, "Play the current audio before approving it.");
      audio.approvedAt = now(); return publicVoiceAudio(draft, env)!;
    });
  });
}
