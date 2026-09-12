import { contentSchema, emailSenderNameValid, type ApprovedContent } from "@fp/shared";

export function gameplayEmailPresentation(content: ApprovedContent, actionUrl: string, env: NodeJS.ProcessEnv): { fromName: string; subject: string; text: string } {
  contentSchema.parse(content);
  if (!emailSenderNameValid(content.senderDisplayName)) throw new Error("Use a fictional sender name without addresses or header characters.");
  const action = new URL(actionUrl);
  if (!/^https?:$/.test(action.protocol) || /[\r\n]/.test(actionUrl)) throw new Error("Use the server-owned game response link.");
  const captured = env.EMAIL_DELIVERY_MODE === "mailpit";
  const smtpDemo = env.APP_MODE === "demo" && env.EMAIL_DELIVERY_MODE === "smtp-demo";
  const approvedTraining = env.EMAIL_PRESENTATION === "training" && Boolean(env.EMAIL_PERMISSION_REFERENCE?.trim()) && env.EMAIL_FORMAT_SUPPORTED === "true";
  if (smtpDemo && !approvedTraining) return {
    fromName: "Fantasy Phishing",
    subject: `[Game simulation] ${content.subject}`,
    text: ["This is a Fantasy Phishing game simulation you agreed to receive. The story below is fictional. No passwords, payments, or personal information are requested.", content.bodyText, actionUrl, env.APP_ORIGIN ? `Manage or pause game emails: ${env.APP_ORIGIN}/settings` : undefined].filter(Boolean).join("\n\n"),
  };
  return {
    fromName: content.senderDisplayName,
    subject: content.subject,
    text: [captured ? undefined : env.EMAIL_DISCLOSURE_TEXT, content.bodyText, actionUrl,
      smtpDemo && env.APP_ORIGIN ? `Manage or pause game emails: ${env.APP_ORIGIN}/settings` : undefined].filter(Boolean).join("\n\n"),
  };
}
