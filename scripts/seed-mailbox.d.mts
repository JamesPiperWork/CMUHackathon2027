import type {SampleMessage} from './mailbox/sample-mail.mjs';
export function seedSampleMailbox(options?: {
  fetcher?:typeof fetch;
  sendMail?:(message:SampleMessage)=>Promise<{rejected?:string[]}>;
  now?:Date;
}):Promise<{added:number;skipped:number}>;
