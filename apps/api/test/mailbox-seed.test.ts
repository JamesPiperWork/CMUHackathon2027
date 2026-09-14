import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSampleMail,mailProfiles,type SampleMessage} from '../../../scripts/mailbox/sample-mail.mjs';
import {seedSampleMailbox} from '../../../scripts/seed-mailbox.mjs';

const now = new Date('2026-09-12T18:00:00Z');
const key = (id:string) => id.replace(/^<|>$/g,'');
function fixture(existing:{ID:string;MessageID:string;Read:boolean}[] = []) {
  const messages = [...existing];
  const sent:SampleMessage[]=[];
  const changed:string[]=[];
  let failAt=Infinity;
  const fetcher=(async (url,init) => {
    const target=new URL(String(url));
    assert.equal(target.origin,'http://127.0.0.1:8025');
    assert.ok(init?.signal);
    if (init?.method==='PUT') {
      const body=JSON.parse(String(init.body));
      assert.ok(body.IDs.length,'An empty ID list would mark every message read');
      assert.equal(body.Read,true);
      changed.push(...body.IDs);
      for (const message of messages) if(body.IDs.includes(message.ID)) message.Read=true;
      return new Response('ok');
    }
    const start=Number(target.searchParams.get('start'));
    return Response.json({total:messages.length,messages:messages.slice(start,start+200)});
  }) as typeof fetch;
  const sendMail=async(message:SampleMessage) => {
    if(sent.length===failAt) throw new Error('Temporary SMTP disconnect');
    sent.push(message);messages.push({ID:`sample-${sent.length}`,MessageID:key(message.messageId),Read:false});
    return {rejected:[]};
  };
  return {messages,sent,changed,options:{fetcher,sendMail,now},failAfter:(count:number)=>{failAt=count;}};
}

test('sample inboxes have distinct interests, substantial history, replies, and local-only addresses',()=>{
  const samples=buildSampleMail(now);
  assert.equal(samples.length,60);
  assert.equal(new Set(samples.map(s=>s.message.messageId)).size,samples.length);
  const ids=new Set(samples.map(s=>s.message.messageId));
  for(const sample of samples){
    assert.match(sample.message.from.address,/@demo\.test$/);
    assert.match(sample.message.to,/@demo\.test$/);
    assert.ok(sample.message.date<now);
    assert.ok(sample.message.text.length>100);
    assert.equal(sample.message.disableFileAccess,true);
    assert.equal(sample.message.disableUrlAccess,true);
    assert.doesNotMatch(sample.message.text,/https?:\/\/|\{\{TRACKING_LINK\}\}/);
    if(sample.message.inReplyTo) assert.ok(ids.has(sample.message.inReplyTo));
  }
  assert.ok(now.getTime()-samples[0].message.date.getTime()>20*86400000);
  for(const profile of mailProfiles){
    const inbox=samples.filter(s=>s.message.to===profile.email);
    assert.ok(inbox.length>=17);
    assert.ok(inbox.some(s=>s.read)&&inbox.some(s=>!s.read));
    assert.ok(samples.filter(s=>s.message.from.address===profile.email).length>=3);
    assert.equal(profile.interests.length,3);
  }
});

test('population preserves existing mail/read choices and repeated runs add nothing',async()=>{
  const existing={ID:'existing-game-mail',MessageID:'real-demo-cast@demo.test',Read:false};
  const f=fixture([existing]);
  assert.deepEqual(await seedSampleMailbox(f.options),{added:60,skipped:0});
  assert.equal(existing.Read,false);
  assert.ok(!f.changed.includes(existing.ID));
  const afterFirst=structuredClone(f.messages);
  f.messages[1].Read=false;
  assert.deepEqual(await seedSampleMailbox(f.options),{added:0,skipped:60});
  assert.equal(f.sent.length,60);
  assert.equal(f.messages[1].Read,false);
  assert.equal(f.messages.length,afterFirst.length);
});

test('interrupted population resumes missing messages and finds older seeds through pagination',async()=>{
  const old=Array.from({length:205},(_,i)=>({ID:`older-${i}`,MessageID:`unrelated-${i}@demo.test`,Read:false}));
  const f=fixture(old);
  f.failAfter(4);
  await assert.rejects(()=>seedSampleMailbox(f.options),/SMTP disconnect/);
  assert.equal(f.sent.length,4);
  f.failAfter(Infinity);
  assert.deepEqual(await seedSampleMailbox(f.options),{added:56,skipped:4});
  assert.equal(f.sent.length,60);
  assert.ok(old.every(message=>!message.Read));
});

test('unavailable mailbox fails before SMTP and never deletes or replaces mail',async()=>{
  let sends=0;
  await assert.rejects(()=>seedSampleMailbox({fetcher:async()=>new Response('unavailable',{status:503}),sendMail:async()=>{sends++;return{};}}),/local mailbox/);
  assert.equal(sends,0);
});
