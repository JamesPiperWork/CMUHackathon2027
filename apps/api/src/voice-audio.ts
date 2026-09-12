import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { resolve } from "node:path";
import { contentReview, emailHasExternalDestination, type Scenario, type VoiceAudioPublic } from "@fp/shared";

type Env = NodeJS.ProcessEnv;
export const voiceModel = "eleven_multilingual_v2";
const settings = { stability: 0.65, similarity_boost: 0.5, speed: 1 };
const hex = /^[a-f0-9]{64}$/;
export function voiceConfiguration(env: Env = process.env) {
  const checks = [
    { code: "api_key", ok: Boolean(env.ELEVENLABS_API_KEY?.trim()), detail: "Add ELEVENLABS_API_KEY to the server environment." },
    { code: "stock_voice", ok: /^[A-Za-z0-9_-]{5,100}$/.test(env.ELEVENLABS_VOICE_ID ?? ""), detail: "Set ELEVENLABS_VOICE_ID to your selected stock voice." },
    { code: "stock_confirmed", ok: env.ELEVENLABS_STOCK_VOICE_CONFIRMED === "true", detail: "Confirm a stock voice with ELEVENLABS_STOCK_VOICE_CONFIRMED=true. Voice cloning is not used." },
  ];
  return { ready: checks.every(check => check.ok), voiceLabel: "Configured stock voice", model: voiceModel, checks };
}
export function voiceRevision(script: string, env: Env = process.env): string {
  return createHash("sha256").update(JSON.stringify({ version: "reviewed-voice-v1", script, voiceId: env.ELEVENLABS_VOICE_ID ?? "", model: voiceModel, settings })).digest("hex");
}
export function invalidateVoiceDraft(scenario: Scenario): void { delete scenario.voiceAudio; }
export function voiceAudioApproved(scenario: Scenario, env: Env = process.env): boolean {
  const audio = scenario.voiceAudio;
  return scenario.channel === "voice" && audio?.status === "ready" && Boolean(audio.approvedAt && audio.previewedAt)
    && audio.revision === voiceRevision(scenario.content.voiceScript, env) && audio.key === audio.revision
    && hex.test(audio.key) && (audio.durationSeconds ?? 0) >= 15 && (audio.durationSeconds ?? 0) <= 25
    && voiceConfiguration(env).ready;
}
export function publicVoiceAudio(scenario: Scenario, env: Env = process.env): VoiceAudioPublic | undefined {
  const audio = scenario.voiceAudio;
  if (!audio || scenario.channel !== "voice") return undefined;
  if (audio.revision !== voiceRevision(scenario.content.voiceScript, env)) return {
    status: "failed", revision: audio.revision, requestedAt: audio.requestedAt,
    error: "The script or stock voice changed. Create and review the audio again.",
  };
  return {
    status: audio.status, revision: audio.revision, requestedAt: audio.requestedAt,
    durationSeconds: audio.durationSeconds, generatedAt: audio.generatedAt,
    previewedAt: audio.previewedAt, approvedAt: audio.approvedAt, error: audio.error,
    ...(audio.status === "ready" ? { previewUrl: `/api/drafts/${encodeURIComponent(scenario.id)}/audio/preview?revision=${audio.revision}` } : {}),
  };
}
function pathFor(key: string, env: Env) {
  if (!hex.test(key)) throw new Error("Invalid audio revision.");
  return resolve(env.AUDIO_CACHE_DIR ?? "data/audio", `${key}.wav`);
}
export function validateVoiceWav(bytes: Buffer): number {
  if (bytes.length < 44 || bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 16) !== "WAVEfmt "
    || bytes.readUInt32LE(16) !== 16 || bytes.readUInt16LE(20) !== 1 || bytes.readUInt16LE(22) !== 1
    || bytes.readUInt32LE(24) !== 16000 || bytes.readUInt32LE(28) !== 32000 || bytes.readUInt16LE(32) !== 2
    || bytes.readUInt16LE(34) !== 16 || bytes.toString("ascii", 36, 40) !== "data"
    || bytes.readUInt32LE(40) !== bytes.length - 44 || bytes.readUInt32LE(4) !== bytes.length - 8 || (bytes.length - 44) % 2)
    throw new Error("The generated audio format could not be validated.");
  const duration = (bytes.length - 44) / 32000;
  if (duration < 15 || duration > 25) throw new Error(`The recording is ${duration.toFixed(1)} seconds. Edit the script to produce 15–25 seconds, then create audio again.`);
  if (!bytes.subarray(44).some(value => value !== 0)) throw new Error("The audio was silent. Create audio again; no substitute audio was generated.");
  return duration;
}
export async function readVoiceFile(key: string, env: Env = process.env) {
  const bytes = await readFile(pathFor(key, env));
  validateVoiceWav(bytes);
  return bytes;
}
function fromPcm(pcm: Buffer) {
  const header = Buffer.alloc(44);
  header.write("RIFF"); header.writeUInt32LE(pcm.length + 36, 4); header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(16000, 24); header.writeUInt32LE(32000, 28); header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34); header.write("data", 36); header.writeUInt32LE(pcm.length, 40);
  const bytes = Buffer.concat([header, pcm]); validateVoiceWav(bytes); return bytes;
}
export async function synthesizeVoiceDraft(scenario: Scenario, options: { env?: Env; fetcher?: typeof fetch } = {}) {
  const env = options.env ?? process.env;
  if (!voiceConfiguration(env).ready) throw new Error("Configure the ElevenLabs API key and stock voice before creating audio.");
  if (!contentReview(scenario.content).valid || emailHasExternalDestination(scenario.content.voiceScript)) throw new Error("The script must pass content review before creating audio.");
  const key = voiceRevision(scenario.content.voiceScript, env);
  try { const bytes = await readVoiceFile(key, env); return { key, durationSeconds: validateVoiceWav(bytes) }; }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const response = await (options.fetcher ?? fetch)(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(env.ELEVENLABS_VOICE_ID!)}?output_format=pcm_16000`, {
    method: "POST", signal: AbortSignal.timeout(25000),
    headers: { "xi-api-key": env.ELEVENLABS_API_KEY!, "content-type": "application/json", accept: "audio/pcm" },
    body: JSON.stringify({ text: scenario.content.voiceScript, model_id: voiceModel, voice_settings: settings }),
  });
  if (!response.ok) {
    if (response.status === 402) {
      let paymentRequired = false;
      try { const body = await response.json() as { detail?: { status?: string } }; paymentRequired = body.detail?.status === "payment_required"; } catch { /* Keep a safe, actionable provider error. */ }
      throw new Error(paymentRequired ? "This voice requires a paid ElevenLabs plan. Choose an included built-in voice and update ELEVENLABS_VOICE_ID, or upgrade your plan, then create audio again." : "ElevenLabs requires payment or additional credits for this audio. Check your plan and selected voice before retrying.");
    }
    throw new Error(response.status === 401 || response.status === 403 ? "ElevenLabs rejected the key or stock voice. Check the server setup." : response.status === 429 ? "ElevenLabs rate or credit limit reached. Check your account before retrying." : "ElevenLabs could not create this audio. Try again after checking the provider.");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("ElevenLabs returned no audio.");
  const chunks: Buffer[] = []; let total = 0;
  try {
    while (true) {
      const next = await reader.read(); if (next.done) break;
      total += next.value.length;
      if (total > 800000) { await reader.cancel(); throw new Error("The recording exceeds 25 seconds. Shorten the script and create audio again."); }
      chunks.push(Buffer.from(next.value));
    }
  } finally { reader.releaseLock(); }
  const bytes = fromPcm(Buffer.concat(chunks));
  await mkdir(resolve(env.AUDIO_CACHE_DIR ?? "data/audio"), { recursive: true });
  const file = pathFor(key, env), temporary = `${file}.${randomBytes(6).toString("hex")}.tmp`;
  await writeFile(temporary, bytes, { mode: 0o600 }); await rename(temporary, file);
  return { key, durationSeconds: validateVoiceWav(bytes) };
}
