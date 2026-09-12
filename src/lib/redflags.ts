// Teaching aid: derive the "what should have tipped you off" list from a training
// email. Heuristic + always-true fundamentals. Purely educational — the landing page
// that shows these collects nothing.

export function deriveRedFlags(subject: string, body: string): string[] {
  const flags: string[] = [];
  const text = `${subject}\n${body}`.toLowerCase();

  const urgency = ["urgent", "immediately", "asap", "right away", "expire", "expires", "within 24", "act now", "final notice", "suspended", "deadline", "today only", "last chance"];
  if (urgency.some((w) => text.includes(w))) {
    flags.push("Manufactured urgency — real requests rarely demand you act within minutes.");
  }

  const auth = ["verify", "confirm your", "password", "login", "log in", "sign in", "account", "credentials", "reset your", "update your"];
  if (auth.some((w) => text.includes(w))) {
    flags.push("Asks you to verify or 'confirm' account details through a link instead of the official site.");
  }

  const reward = ["congratulations", "won", "winner", "prize", "free", "gift card", "reward", "bonus", "claim your"];
  if (reward.some((w) => text.includes(w))) {
    flags.push("Too-good-to-be-true reward — an unexpected prize or freebie is classic bait.");
  }

  const money = ["invoice", "payment", "refund", "wire", "transfer", "billing", "overdue", "charge"];
  if (money.some((w) => text.includes(w))) {
    flags.push("Unexpected money/billing angle designed to make you click before you think.");
  }

  // Fundamentals that apply to essentially every lure.
  flags.push("A single call-to-action link is the whole point of the message — hover before you click, and check where it really goes.");
  flags.push("The message leans on things you'd recognize (your interests, team, or workplace) to feel legitimate. Familiar details do not prove the sender is who they claim.");
  flags.push("When in doubt, reach the supposed sender through a channel you already trust — never through the link in the message.");

  // De-dup while preserving order.
  return Array.from(new Set(flags));
}
