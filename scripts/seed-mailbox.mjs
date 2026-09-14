import nodemailer from 'nodemailer';
import {fileURLToPath} from 'node:url';
import {buildSampleMail} from './mailbox/sample-mail.mjs';

const idKey = id => String(id ?? '').replace(/^<|>$/g, '');

/** Add only missing fictional history, preserving all existing mail and read choices. */
export async function seedSampleMailbox({fetcher=fetch,sendMail,now=new Date()}={}) {
  const request = async (path, options={}) => {
    const response = await fetcher(`http://127.0.0.1:8025/api/v1/${path}`, {...options,signal:AbortSignal.timeout(5000)});
    if (!response.ok) throw new Error('The local mailbox could not be updated. Keep email:capture running and try again.');
    return response;
  };
  const list = async () => {
    const messages = [];
    for (let start=0; start<10000; start+=200) {
      const data = await (await request(`messages?start=${start}&limit=200`)).json();
      if (!Array.isArray(data.messages)) throw new Error('Unexpected local mailbox response.');
      messages.push(...data.messages);
      if (data.messages.length<200 || messages.length>=data.total) return messages;
    }
    throw new Error('Mailbox is too large for the sample importer; no new messages were added.');
  };
  const existing = new Set((await list()).map(message=>idKey(message.MessageID)));
  const samples = buildSampleMail(now);
  const pending = samples.filter(sample=>!existing.has(idKey(sample.message.messageId)));
  if (!pending.length) return {added:0,skipped:samples.length};
  const transport = sendMail ? null : nodemailer.createTransport({host:'127.0.0.1',port:1025,secure:false,ignoreTLS:true,connectionTimeout:5000,greetingTimeout:5000,socketTimeout:10000,logger:false,debug:false});
  try {
    for (const sample of pending) {
      if (!/^[^@\s]+@demo\.test$/.test(sample.message.to) || !/^[^@\s]+@demo\.test$/.test(sample.message.from.address)) throw new Error('Sample mail must use local addresses.');
      const result = await (sendMail ?? (message=>transport.sendMail(message)))(sample.message);
      if (result.rejected?.length) throw new Error('A sample recipient was rejected; rerun to add only missing messages.');
    }
  } finally { transport?.close(); }
  const newlyRead = new Set(pending.filter(sample=>sample.read).map(sample=>idKey(sample.message.messageId)));
  const ids = (await list()).filter(message=>newlyRead.has(idKey(message.MessageID))).map(message=>message.ID);
  // Mailpit interprets an empty ID list as ALL messages. Never send an empty list.
  if (ids.length) await request('messages', {method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({IDs:ids,Read:true})});
  return {added:pending.length,skipped:samples.length-pending.length};
}

if (process.argv[1]===fileURLToPath(import.meta.url)) {
  const result=await seedSampleMailbox();
  process.stdout.write(`Harbor Mail: added ${result.added} sample messages; ${result.skipped} already present. Existing mail was preserved.\n`);
}
