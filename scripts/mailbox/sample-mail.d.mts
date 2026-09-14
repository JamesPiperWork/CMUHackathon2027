export interface SampleMessage {
  from: {name:string;address:string}; to:string; subject:string; text:string;
  date:Date; messageId:string; inReplyTo?:string; references?:string[];
  disableFileAccess:true; disableUrlAccess:true;
}
export const mailProfiles: {name:string;email:string;interests:string[];preferences:string}[];
export const sampleMessageId: (id:string)=>string;
export function buildSampleMail(now?:Date): {id:string;read:boolean;message:SampleMessage}[];
