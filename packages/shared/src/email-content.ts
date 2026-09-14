import type { ApprovedContent } from "./domain";

// Narrative email policy adapted from main's single-story lures (204c824).
// Teaching facts are server-owned. Sender labels are bounded, editable fiction;
// generated JSON can never supply a sending address or email header.
const facts: Record<string, { sender: string; explanation: string }> = {
  "ticket-drop": {
    sender: "Juniper Sessions",
    explanation:
      "Your saved JS-118 booking is already confirmed, with no upgrade requested. This message introduces an unexpected backstage upgrade. Verify through a known route before approving a change.",
  },
  "parcel-update": {
    sender: "Mooncrate",
    explanation:
      "Your saved MC-204 order is already scheduled for Saturday, with no extra fee. This message introduces an unexpected hold on that delivery. Check the original order through a known route before approving a change.",
  },
  "game-night": {
    sender: "Trail Club",
    explanation:
      "You requested a Saturday walk reminder and your place was already confirmed. This message introduces an unexpected move to a guest list. Check with the club through a known route before approving a change.",
  },
};

/** Destination text is never accepted from a model or a handwritten email. */
export function emailHasExternalDestination(text: string): boolean {
  return /(?:\b[a-z][a-z\d+.-]*:\/\/|\b(?:mailto|tel|javascript|data):|www\.|[\w.+-]+@[\w.-]+\.[a-z]{2,}|\b(?:[a-z\d](?:[a-z\d-]*[a-z\d])?\.)+[a-z]{2,}\b|\b\d{1,3}(?:\.\d{1,3}){3}\b|(?:\+?\d[\d ()-]{7,}\d)|<[^>]+>|\[[^\]]*\]\(|\{\{[^}]*\}\})/i.test(text);
}

/** Display labels are editable fiction; they can never become an address or header. */
export function emailSenderNameValid(name: string): boolean {
  return name === name.trim() && name.length >= 2 && name.length <= 60
    && /^[\p{L}\p{M}\p{N} &'’().,-]+$/u.test(name)
    && !emailHasExternalDestination(name);
}

export function fictionalEmailSender(authorPrompt: string): string {
  const names: [RegExp, string][] = [
    [/\b(?:wings?|sports bar|restaurant)\b/i, "Mile High Wing House"],
    [/\b(?:coffee|espresso|roast\w*)\b/i, "Ember Roasters"],
    [/\b(?:photography|film|camera)\b/i, "Silver Grain Photo Lab"],
    [/\bchess\b/i, "Cedar Chess Circle"],
    [/\b(?:pottery|ceramics?|clay)\b/i, "Willow Clay Studio"],
    [/\b(?:baking|sourdough|bread|cooking)\b/i, "Hearthside Baking Club"],
    [/\b(?:garden\w*|plants?|seeds?|tomatoes|orchids?|flowers?)\b/i, "Fernwood Garden Society"],
    [/\b(?:trains?|rail\w*)\b/i, "Maple Rail Collective"],
    [/\b(?:postcards?|stamps?|collect\w*)\b/i, "Juniper Collectors Club"],
    [/\b(?:music|concerts?|acoustic|guitar|piano)\b/i, "Birchwood Sessions"],
    [/\b(?:hiking|trails?|walk\w*|outdoor\w*)\b/i, "Alder Trail Club"],
    [/\b(?:board games?|gaming|tabletop)\b/i, "Cedar Tabletop Circle"],
  ];
  return names.find(([pattern]) => pattern.test(authorPrompt))?.[1] ?? "Willow Community Circle";
}

/** Natural wording can omit the old artificial deadline, but not the false change. */
export function emailContentConsistent(
  content: ApprovedContent,
  templateId: string,
): boolean {
  const fact = facts[templateId];
  if (!fact || !emailSenderNameValid(content.senderDisplayName)) return false;
  if (emailHasExternalDestination(`${content.subject}\n${content.bodyText}`)) return false;
  const body = content.bodyText;
  // Reject wording that negates the very change the server's explanation teaches.
  if (/\b(?:not|never|no|without|isn't|hasn't)\b[^.!?\n]{0,45}\b(?:upgrade|hold|guest list|moved)\b/i.test(body)) return false;
  if (templateId === "ticket-drop")
    return /\bJS-118\b/i.test(body) && /\b(?:selected|chosen|reserved|offered|assigned)\b[^.!?\n]{0,70}\b(?:backstage\s+)?upgrade\b|\bbackstage upgrade\b[^.!?\n]{0,45}\b(?:available|waiting|reserved|ready)\b/i.test(body);
  if (templateId === "parcel-update")
    return /\bMC-204\b/i.test(body) && /\b(?:is|was|remains|been|placed)\b[^.!?\n]{0,45}\bon hold\b/i.test(body);
  return /\bSaturday\b/i.test(body) && /\b(?:moved|transferred|placed|added)\b[^.!?\n]{0,45}\bguest list\b/i.test(body);
}

export function emailTeachingContent(
  content: ApprovedContent,
  templateId: string,
): ApprovedContent {
  const fact = facts[templateId];
  if (!fact) throw new Error("Unsupported email story");
  const cueAnnotations = [
    "An unexpected change conflicts with your confirmed activity.",
    "A familiar sender name does not verify a new request.",
  ];
  if (/\b(?:ten minutes|ten-minute|10 minutes|immediately|act now|last chance)\b/i.test(`${content.subject}\n${content.bodyText}`))
    cueAnnotations.push("Urgency encourages a response before checking the original plan.");
  return { ...content, cueAnnotations, explanation: fact.explanation };
}

/** Free-context drafts have no invented booking/order facts to preserve. */
export function emailPromptContentValid(content: ApprovedContent): boolean {
  const text = `${content.subject}\n${content.bodyText}`;
  return emailSenderNameValid(content.senderDisplayName)
    && !emailHasExternalDestination(text)
    && !/\b(?:credentials?|password|passcode|one.time.code|otp|payment|pay|purchase|credit.card|bank.account|money|wire.transfer|donat(?:e|ion)|download|attachment)\b/i.test(text);
}

/** Teaching describes this email's wording, not fictional facts about a player. */
export function emailPromptTeachingContent(content: ApprovedContent): ApprovedContent {
  const text = `${content.subject}\n${content.bodyText}`;
  const cueAnnotations = ["A relevant topic or familiar name does not establish who sent a message."];
  if (/\b(?:respond|response|confirm|reserve|join|review|click|claim|accept|sign up|rsvp)\b/i.test(text))
    cueAnnotations.push("The message asks you to take an action; check an unexpected request through a known route.");
  if (/\b(?:ten minutes|ten-minute|10 minutes|immediately|act now|last chance|today|limited|last spot|before .*ends)\b/i.test(text))
    cueAnnotations.push("Time pressure can encourage a response before checking the request.");
  return {
    ...content,
    cueAnnotations,
    explanation: "This is a fictional challenge from your consenting league. A message about something you enjoy can still be bait. Verify unexpected requests through a known route before acting; no booking, order, or prior interaction in this email is evidence of a real event.",
  };
}
