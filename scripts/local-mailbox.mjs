import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import nodemailer from 'nodemailer';
import {seedSampleMailbox} from './seed-mailbox.mjs';

export const mailAccounts = [
  {name:'Alex Morgan',email:'alex@demo.test',color:'#3b6bc9'},
  {name:'Jordan Lee',email:'jordan@demo.test',color:'#98744e'},
  {name:'Justin',email:'justin@demo.test',color:'#c59a35'},
  {name:'Casey Reed',email:'casey@demo.test',color:'#64886c'},
];
const address = value => typeof value === 'string' && /^[a-z0-9.!#$%&'*+\-/=?^_`{|}~]{1,64}@demo\.test$/i.test(value);
const messageId = value => /^[a-zA-Z0-9_-]{8,100}$/.test(value);
const smtp = () => nodemailer.createTransport({host:'127.0.0.1',port:1025,secure:false,ignoreTLS:true,connectionTimeout:5000,greetingTimeout:5000,socketTimeout:10000,logger:false,debug:false});
async function readJson(req) {
  if (req.headers['content-type']?.split(';')[0].trim().toLowerCase()!=='application/json') {req.resume();throw new Error('Use JSON for this request.');}
  let size=0;const parts=[];
  for await(const part of req.iterator({destroyOnReturn:false})){size+=part.length;if(size>18000){req.resume();throw new Error('Keep the request under 18 KB.');}parts.push(part);}
  const input=JSON.parse(Buffer.concat(parts).toString());
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!['from','to','subject','text'].includes(key)))throw new Error('Use from, to, subject, and text fields only.');
  return input;
}
export function createMailboxServer({fetcher=fetch,sendMail}={}) {
  const json=(res,status,data)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
  const backend=async path=>{const r=await fetcher(`http://127.0.0.1:8025/api/v1/${path}`,{signal:AbortSignal.timeout(5000)});if(!r.ok)throw new Error('Local inbox is unavailable. Keep npm run email:capture running.');return r.json();};
  return http.createServer(async(req,res)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    if(!['localhost:8026','127.0.0.1:8026'].includes(req.headers.host)){json(res,403,{error:'Open this local mailbox on localhost:8026.'});return;}
    try{
      const url=new URL(req.url,'http://localhost:8026');
      if(req.method==='GET'&&url.pathname==='/health'){json(res,200,{ready:true,transport:'local-smtp'});return;}
      if(req.method==='GET'&&['/','/mailbox.js','/mailbox.css'].includes(url.pathname)){
        const file=url.pathname==='/'?'index.html':url.pathname.slice(1);const bytes=await readFile(new URL(`./mailbox/${file}`,import.meta.url));
        res.setHeader('content-type',file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8');res.end(bytes);return;
      }
      if(req.method==='GET'&&url.pathname==='/api/accounts'){json(res,200,mailAccounts);return;}
      if(req.method==='GET'&&url.pathname==='/api/messages'){
        const account=url.searchParams.get('account'),folder=url.searchParams.get('folder')??'inbox';if(!mailAccounts.some(item=>item.email===account)||!['inbox','sent'].includes(folder)){json(res,400,{error:'Choose a local demo mailbox.'});return;}
        const data=await backend(`search?query=${encodeURIComponent(`${folder==='sent'?'from':'to'}:${account}`)}&limit=200`);
        json(res,200,{messages:data.messages??[],total:data.messages_count??data.total??0});return;
      }
      if(req.method==='GET'&&url.pathname.startsWith('/api/message/')){
        const id=url.pathname.slice('/api/message/'.length);if(!messageId(id)){json(res,400,{error:'Invalid message.'});return;}
        json(res,200,await backend(`message/${encodeURIComponent(id)}`));return;
      }
      if(req.method==='POST'&&url.pathname==='/api/send'){
        if(req.headers.origin!==`http://${req.headers.host}`||req.headers['sec-fetch-site']==='cross-site'){json(res,403,{error:'Send from the local mailbox page.'});return;}
        const input=await readJson(req),from=mailAccounts.find(a=>a.email===input.from);
        if(!from||!address(input.to)||typeof input.subject!=='string'||input.subject.trim().length<1||input.subject.length>150||/[\p{Cc}\p{Cf}\u2028\u2029]/u.test(input.subject)||typeof input.text!=='string'||!input.text.trim()||input.text.length>12000){json(res,400,{error:'Choose a sender, a @demo.test recipient, a subject, and a message.'});return;}
        const transport=sendMail?null:smtp();
        try{const result=await(sendMail??(mail=>transport.sendMail(mail)))({from:{name:from.name,address:from.email},to:input.to.toLowerCase(),subject:input.subject.trim(),text:input.text,disableFileAccess:true,disableUrlAccess:true});
          if(result.rejected?.length)throw new Error('Recipient rejected');json(res,200,{sent:true});
        }catch{json(res,502,{error:'Delivery could not be confirmed. Check Sent before sending again.'});}finally{transport?.close();}return;
      }
      json(res,404,{error:'Not found.'});
    }catch(error){json(res,400,{error:error instanceof SyntaxError?'Invalid message format.':error instanceof Error?error.message:'Local mailbox unavailable.'});}
  });
}
export async function seedMailbox() {
  const r=await fetch('http://127.0.0.1:8025/api/v1/search?query=subject%3A%22Welcome%20to%20Harbor%20Mail%22',{signal:AbortSignal.timeout(5000)});
  if(!r.ok)throw new Error('Local mailbox is unavailable.');const existing=await r.json();if(existing.messages?.length)return;
  const transport=smtp();
  try{
    for(const account of mailAccounts)await transport.sendMail({from:{name:'Harbor Mail',address:'hello@demo.test'},to:account.email,subject:'Welcome to Harbor Mail',text:`Hi ${account.name.split(' ')[0]},\n\nYour inbox is ready. You can read messages, reply to friends, or start a new conversation.\n\nUse the account menu to switch between Alex, Jordan and Casey. You can use this address when signing up for Fantasy Phishing.\n\nHarbor Mail is a local test service. Messages stay on this computer.`,disableFileAccess:true,disableUrlAccess:true});
    await transport.sendMail({from:{name:'Jordan Lee',address:'jordan@demo.test'},to:'alex@demo.test',subject:'Saturday plans?',text:'Hey Alex,\n\nAre you free Saturday afternoon? I was thinking coffee and a few games. Casey might join us too.\n\nLet me know what works.\n\nJordan',disableFileAccess:true,disableUrlAccess:true});
  }finally{transport.close();}
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  await seedMailbox();await seedSampleMailbox();const server=createMailboxServer();await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(8026,'127.0.0.1',resolve);});
  process.stdout.write('Harbor Mail: http://localhost:8026 (local SMTP inbox and composer)\n');
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));
}
