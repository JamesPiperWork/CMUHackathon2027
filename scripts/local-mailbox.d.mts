import type { Server } from "node:http";

export interface LocalMailboxMessage {
  from: { name: string; address: string };
  to: string;
  subject: string;
  text: string;
  disableFileAccess: true;
  disableUrlAccess: true;
}
export const mailAccounts: { name: string; email: string; color: string }[];
export function createMailboxServer(options?: {
  fetcher?: typeof fetch;
  sendMail?: (message: LocalMailboxMessage) => Promise<{ rejected?: string[] }>;
}): Server;
export function seedMailbox(): Promise<void>;
