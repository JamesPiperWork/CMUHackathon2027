import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify from "fastify";
import { z } from "zod";
import { createSeed, fixtureContent, type Channel, type Session } from "@fp/shared";
import { FileRepository } from "../src/repository.js";
import { GameService } from "../src/service.js";
import { registerPhoneEnrollmentRoutes, type PhoneEnrollmentOptions } from "../src/phone-enrollment.js";

const phone = "+12025550123", providerId = `VE${"a".repeat(32)}`;
const configured = { APP_MODE: "demo", EMAIL_DELIVERY_MODE: "smtp-demo", PHONE_DELIVERY_MODE: "twilio-demo", PHONE_DEMO_SEND_ENABLED: "true", PHONE_DEMO_VERIFY_ENABLED: "true", TWILIO_ACCOUNT_SID: `AC${"a".repeat(32)}`, TWILIO_AUTH_TOKEN: "test-only", TWILIO_VERIFY_SERVICE_SID: `VA${"a".repeat(32)}`, SESSION_SECRET: "phone-test-secret-with-at-least-32-characters" };
async function fixture(t: TestContext, options: PhoneEnrollmentOptions = {}) {
  const dir = await mkdtemp(join(tmpdir(), "fp-phone-enroll-")), file = join(dir, "db.json");
  let timestamp = Date.now(), starts = 0, checks = 0;
  const repo = await FileRepository.open(file, () => {
    const db = createSeed();
    for (const member of db.members) {
      member.consent.channels.sms = false; member.consent.channels.voice = false;
      member.consent.contacts = { email: { destination: `${member.userId}@example.invalid`, verified: true, method: "verify", verifiedAt: timestamp } };
    }
    db.accounts = db.members.map(member => ({ userId: member.userId, consent: structuredClone(member.consent) }));
    return db;
  });
  const service = new GameService(repo, { mode: "demo", emailDemo: true, apiOrigin: "http://localhost:3001", appOrigin: "http://localhost:3001", port: 0, dataFile: file, mongodbUri: "", matchDurationMinutes: 10080, jobIntervalMs: 500 });
  const app = Fastify();
  app.setErrorHandler((error, _request, reply) => reply.code(error instanceof z.ZodError ? 400 : (error as { statusCode?: number }).statusCode ?? 500).send({error: error instanceof Error ? error.message : "Failed"}));
  const auth = async (request: { headers: { authorization?: string } }): Promise<Session> => {
    if (!["alex", "jordan"].includes(request.headers.authorization ?? "")) throw Object.assign(new Error("Sign in"), {statusCode:401});
    return { userId: request.headers.authorization!, role: "player", tokenHash: "fixture", csrf: "fixture", expiresAt: timestamp + 60000 };
  };
  registerPhoneEnrollmentRoutes(app, service, auth, { env: configured, now: () => timestamp,
    startVerification: async () => { starts++; return {sid: providerId,status:"pending"}; },
    checkVerification: async (sid, code) => { checks++; assert.equal(sid, providerId); return {sid,status:code === "123456" ? "approved" : "pending",to:phone}; }, ...options });
  await app.ready();
  const call = (path: string, payload?: object, user = "alex") => app.inject({method:payload ? "POST" : "GET",url:`/api/phone${path}`,headers:{authorization:user},...(payload ? {payload}:{})});
  const start = (number = phone, user = "alex") => call("/start",{phoneNumber:number,consent:true},user);
  const verify = (id: string, code = "123456", user = "alex") => call("/verify",{requestId:id,code},user);
  t.after(async()=>{await app.close();await repo.close();await rm(dir,{recursive:true,force:true});});
  return {app,repo,service,call,start,verify,advance:(ms:number)=>{timestamp+=ms;},get starts(){return starts;},get checks(){return checks;},file};
}

test("phone ownership uses its exact Verify SID, does not enable contact, and remains private to its account", async t => {
  const f = await fixture(t);
  assert.equal((await f.call("",undefined,"missing")).statusCode,401);
  const started = await f.start(); assert.equal(started.statusCode,200,started.body);
  const id=started.json().requestId;
  assert.equal((await f.verify(id,"123456","jordan")).statusCode,400);
  assert.equal(f.checks,0);
  const approved=await f.verify(id); assert.equal(approved.statusCode,200,approved.body);
  assert.equal((await f.verify(id)).statusCode,400); assert.equal(f.checks,1);
  const db=await f.repo.read(),account=db.accounts!.find(a=>a.userId==="alex")!;
  assert.equal(account.consent.contacts.sms?.destination,phone);
  assert.equal(account.consent.contacts.voice?.verified,true);
  assert.equal(account.consent.channels.voice,false);assert.equal(account.consent.channels.sms,false);
  assert.equal(db.members.find(m=>m.userId==="alex")!.consent.contacts.voice?.verified,true);
  assert.ok(!JSON.stringify(db.phoneVerifications).includes("123456"));
  assert.equal((await f.call("",undefined,"jordan")).json().phoneNumber,"");
  const persisted=await FileRepository.open(f.file,()=>{throw new Error("Existing data expected");});
  assert.equal((await persisted.read()).accounts!.find(a=>a.userId==="alex")!.consent.contacts.voice?.verified,true);await persisted.close();
});

test("phone verification rejects disabled setup, unverified email, wrong destination and provider SID", async t => {
  const off = await fixture(t,{env:{}});
  assert.equal((await off.start()).statusCode,409);assert.equal(off.starts,0);
  const unverified=await fixture(t);await unverified.repo.transact(db=>{db.accounts!.find(a=>a.userId==="alex")!.consent.contacts.email!.verified=false;});
  assert.equal((await unverified.start()).statusCode,403);assert.equal(unverified.starts,0);
  for(const result of [{sid:providerId,status:"approved",to:"+12025550999"},{sid:`VE${"b".repeat(32)}`,status:"approved",to:phone}]) {
    const f=await fixture(t,{checkVerification:async()=>result});const id=(await f.start()).json().requestId;
    assert.equal((await f.verify(id)).statusCode,400);
    assert.equal((await f.call("")).json().verified,false);
  }
});

test("verification attempt limits, cooldown and expiration persist without storing codes", async t => {
  const f=await fixture(t);const id=(await f.start()).json().requestId;
  assert.equal((await f.start()).statusCode,429);assert.equal(f.starts,1);
  for(let i=0;i<5;i++)assert.equal((await f.verify(id,"999999")).statusCode,400);
  assert.equal((await f.verify(id)).statusCode,400);assert.equal(f.checks,5);
  f.advance(60001);const newer=(await f.start()).json().requestId;
  f.advance(600001);assert.equal((await f.verify(newer)).statusCode,400);
  assert.equal(f.checks,5);
});

test("removal invalidates a pending check and cancels queued phone casts without touching email or transport evidence", async t => {
  let release!: (result:{sid:string;status:string;to:string})=>void;
  const f=await fixture(t,{checkVerification:()=>new Promise(resolve=>{release=resolve;})});
  const id=(await f.start()).json().requestId;
  const checking=f.verify(id);
  while(!release)await new Promise(resolve=>setTimeout(resolve,1));
  assert.equal((await f.verify(id)).statusCode,400,"Concurrent verification cannot submit a second check");
  await f.repo.transact(db=>{
    const account=db.accounts!.find(a=>a.userId==="alex")!;
    account.consent.contacts.sms={destination:phone,verified:true,method:"verify",verifiedAt:Date.now()};account.consent.channels.sms=true;
    for (const [id, channel, status] of [["phone-queued", "sms", "queued"], ["phone-leased", "voice", "leased"], ["email-queued", "email", "queued"]] as const) {
      db.scenarios.push({ id, channel: channel as Channel, matchId:db.match.id, recipientId:"alex", authorId:"jordan", templateId:"parcel-update", interest:"Board games", content:fixtureContent(channel,"parcel-update",true), isPhishing:true, locked:true, source:"fixture", model:"fixture", promptVersion:"v1", generationAttempts:0, generationStatus:"complete", tokenHash:"fixture", tokenExpiresAt:Date.now()+60000, releasedAt:null, deliveryStatus:"queued", order:0 });
      db.jobs.push({id, type:"delivery",scenarioId:id,dueAt:Date.now()+60000,status,leaseExpiresAt:status==="leased"?Date.now()+45000:null,attempts:0,idempotencyKey:id});
    }
  });
  assert.equal((await f.call("/remove",{})).statusCode,200);
  release({sid:providerId,status:"approved",to:phone});
  assert.equal((await checking).statusCode,409);
  const db=await f.repo.read(),account=db.accounts!.find(a=>a.userId==="alex")!;
  assert.equal(account.consent.contacts.sms,undefined);assert.equal(account.consent.contacts.voice,undefined);
  assert.equal(account.consent.channels.sms,false);assert.equal(account.consent.contacts.email?.verified,true);
  assert.equal(db.jobs.find(job=>job.id==="phone-queued")?.status,"cancelled");
  assert.equal(db.jobs.find(job=>job.id==="phone-leased")?.status,"leased");
  assert.equal(db.jobs.find(job=>job.id==="email-queued")?.status,"queued");
});

test("failed verification sends consume their reservation and cannot establish ownership", async t => {
  const f=await fixture(t,{startVerification:async()=>{throw new Error("Synthetic provider failure");}});
  assert.equal((await f.start()).statusCode,409);
  assert.equal((await f.start()).statusCode,429);
  const record=(await f.repo.read()).phoneVerifications![0];assert.equal(record.status,"failed");
  assert.equal((await f.verify(record.id)).statusCode,400);
  assert.equal((await f.call("")).json().verified,false);
});
