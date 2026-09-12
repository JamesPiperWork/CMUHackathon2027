// Faux "noise" emails for the Inbox demo. These are the ordinary, legitimate-looking
// messages a real inbox is full of. The training lure(s) from /api/inbox are interleaved
// among them, so the defender has to actually spot the phish rather than click the one
// obviously-highlighted row. Nothing here is interactive beyond being read; reporting one
// is a false alarm (no points), which is itself part of the lesson.

export interface FauxEmail {
  key: string;
  sender: string;
  initials: string;
  color: string; // avatar background
  subject: string;
  body: string;
  folder: "focused" | "other";
  unread: boolean;
  minutesAgo: number; // used to build a realistic timestamp/order
}

// Muted avatar colors in the Outlook idiom (not the brand palette — this is a simulated
// third-party surface).
const C = {
  blue: "#4b6ea8",
  teal: "#2f8f83",
  green: "#4f8a4f",
  plum: "#8a5a8f",
  slate: "#5b6b7b",
  amber: "#b07a3c",
  red: "#b0574f",
  indigo: "#5a5fa8",
};

export const FAUX_EMAILS: FauxEmail[] = [
  {
    key: "gh",
    sender: "GitHub",
    initials: "GH",
    color: C.slate,
    subject: "[GitHub] A new sign-in to your account",
    body:
      "Hi,\n\nWe noticed a new sign-in to your GitHub account from a Chrome browser on macOS.\n\nLocation: Seattle, WA, United States\nTime: Today\n\nIf this was you, you can safely ignore this email. If you don't recognize this activity, review your security settings.\n\nThanks,\nThe GitHub Team",
    folder: "focused",
    unread: true,
    minutesAgo: 26,
  },
  {
    key: "cal",
    sender: "Calendar",
    initials: "GC",
    color: C.blue,
    subject: "Invitation: Design sync @ Thu 2:00pm",
    body:
      "You have been invited to the following event.\n\nDesign sync\nWhen: Thursday 2:00pm – 2:30pm\nWhere: Meet link\nOrganizer: Carol\n\nGoing?   Yes   ·   Maybe   ·   No",
    folder: "focused",
    unread: true,
    minutesAgo: 52,
  },
  {
    key: "slack",
    sender: "Slack",
    initials: "SL",
    color: C.plum,
    subject: "New messages in #league-chat",
    body:
      "You have 4 new messages in #league-chat.\n\nDave: anyone catch the game last night\nErin: brutal ending\nDave: we don't talk about the 4th quarter\nGrace: 😂\n\nOpen Slack to reply.",
    folder: "focused",
    unread: false,
    minutesAgo: 95,
  },
  {
    key: "chase",
    sender: "Chase",
    initials: "CH",
    color: C.blue,
    subject: "Your statement is ready to view",
    body:
      "Your monthly account statement is now available.\n\nYou can view your statement any time by signing in to chase.com or the mobile app.\n\nThank you for banking with us.",
    folder: "focused",
    unread: false,
    minutesAgo: 190,
  },
  {
    key: "zoom",
    sender: "Zoom",
    initials: "ZM",
    color: C.blue,
    subject: "Cloud recording is now available",
    body:
      "Hi,\n\nYour cloud recording for \"Weekly Standup\" is now available.\n\nRecording length: 24 minutes\n\nOpen Zoom to view or share the recording.",
    folder: "focused",
    unread: false,
    minutesAgo: 300,
  },
  {
    key: "linkedin",
    sender: "LinkedIn",
    initials: "LI",
    color: C.indigo,
    subject: "You appeared in 9 searches this week",
    body:
      "You showed up in 9 searches this week.\n\nRecruiters and colleagues found you. See who's looking and keep your profile up to date.\n\nView all searches.",
    folder: "other",
    unread: true,
    minutesAgo: 140,
  },
  {
    key: "amazon",
    sender: "Amazon.com",
    initials: "AM",
    color: C.amber,
    subject: "Your order has shipped",
    body:
      "Hello,\n\nYour package is on the way. Arriving tomorrow by 9pm.\n\n1 item — \"USB-C cable, 2-pack\"\n\nTrack your package in Your Orders.",
    folder: "other",
    unread: false,
    minutesAgo: 420,
  },
  {
    key: "strava",
    sender: "Strava",
    initials: "ST",
    color: C.amber,
    subject: "Your monthly activity report",
    body:
      "Nice work this month!\n\nYou logged 12 activities and 84 km. That's a new personal best for distance.\n\nSee your full report in the app.",
    folder: "other",
    unread: false,
    minutesAgo: 1500,
  },
  {
    key: "notion",
    sender: "Notion",
    initials: "NO",
    color: C.slate,
    subject: "Your weekly digest",
    body:
      "Here's what happened in your workspace this week.\n\n3 pages edited · 1 comment · 2 new tasks assigned to you.\n\nOpen Notion to catch up.",
    folder: "other",
    unread: false,
    minutesAgo: 2000,
  },
  {
    key: "duo",
    sender: "Duolingo",
    initials: "DU",
    color: C.green,
    subject: "Keep your 42-day streak alive!",
    body:
      "You're on a roll! Don't lose your 42-day streak.\n\nA quick lesson takes 3 minutes. See you in the app!",
    folder: "other",
    unread: false,
    minutesAgo: 2600,
  },
  {
    key: "medium",
    sender: "Medium Daily Digest",
    initials: "ME",
    color: C.slate,
    subject: "Stories for you",
    body:
      "Today's highlights, picked for you.\n\n· The quiet art of code review\n· What ten years of side projects taught me\n· A field guide to saying no\n\nRead on Medium.",
    folder: "other",
    unread: false,
    minutesAgo: 3200,
  },
];

// Derive a plausible external sender for a training lure from its subject, WITHOUT
// revealing which leaguemate actually sent it (the defender must judge from content).
export function deriveTrainingSender(subject: string): { sender: string; initials: string } {
  const bracket = subject.match(/\[([^\]]+)\]/);
  let sender: string;
  if (bracket) sender = bracket[1].trim();
  else if (/(invite|rsvp|event|tailgate|meet)/i.test(subject)) sender = "Events Team";
  else if (/(account|verify|security|password|sign|login|confirm)/i.test(subject)) sender = "Account Services";
  else if (/(invoice|payment|refund|billing|order)/i.test(subject)) sender = "Billing";
  else sender = "Member Services";
  const initials = sender.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return { sender, initials };
}
