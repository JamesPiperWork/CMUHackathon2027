import { contentSchema, type ApprovedContent, type Channel } from "./domain";
import { emailPromptContentValid, emailPromptTeachingContent } from "./email-content";

/** Medium-specific text is the only authored payload in a text or voice cast. */
export function messagePromptTeachingContent(content: ApprovedContent, channel: Channel): ApprovedContent {
  if (channel === "email") throw new Error("Email keeps its email authoring policy.");
  const text = channel === "sms" ? content.smsText : content.voiceScript;
  const teaching = emailPromptTeachingContent({ ...content, subject: "A league challenge", bodyText: text });
  return {
    ...content,
    subject: channel === "sms" ? "A league text" : "A league voice message",
    senderDisplayName: "Fantasy Phishing",
    bodyText: "This challenge was prepared for your consenting Fantasy Phishing league.",
    smsText: channel === "sms" ? text : "This is a voice challenge from your consenting league.",
    voiceScript: channel === "voice" ? text : "This is a text challenge from your consenting Fantasy Phishing league. No voice call is part of this draft.",
    cueAnnotations: teaching.cueAnnotations,
    explanation: teaching.explanation.replaceAll("email", "message"),
  };
}

export function messagePromptContentValid(content: ApprovedContent, channel: Channel): boolean {
  if (channel === "email" || !contentSchema.safeParse(content).success) return false;
  return emailPromptContentValid({ ...content, bodyText: channel === "sms" ? content.smsText : content.voiceScript });
}
