import type { MatchStory } from "@fp/shared";

export interface StoryScene {
  id: string;
  kind: "intro" | "attack" | "defense" | "chat" | "outro";
  kicker: string;
  title: string;
  text: string;
  detail: string;
  actor: string;
  target?: string;
  accent: string;
}
export const SCENE_MS = 6500;
export function storyScenes(story: MatchStory): StoryScene[] {
  const winner = story.players.find(p => p.id === story.winnerId);
  const scoreline = story.players.map(p => `${p.name} ${story.scores[p.id] ?? 0}`).join("  /  ");
  const moments = [
    ...story.highlights.filter(h => h.kind !== "chat").slice(0, 3),
    ...story.highlights.filter(h => h.kind === "chat").slice(-2),
  ];
  return [{
    id: "opening", kind: "intro", kicker: `Week ${story.week} · Weekly Wrapped`,
    title: "A week\non the hook.", text: scoreline,
    detail: story.leagueName, actor: story.players.map(p => p.name).join(" vs "), accent: "#80CDB7",
  }, ...moments.map(h => ({
    id: h.id, kind: h.kind, kicker: h.kind === "chat" ? "From the group chat" : h.kind === "attack" ? "Bait that landed" : "A catch worth keeping",
    title: h.kind === "chat" ? `${h.actorName} had\nsomething to say.` : h.kind === "attack" ? `${h.actorName}\nreeled one in.` : `${h.actorName}\nspotted the hook.`,
    text: h.text, detail: h.detail || (h.points ? `${h.points > 0 ? "+" : ""}${h.points} points` : "A moment from this matchup"),
    actor: h.actorName, target: h.targetName,
    accent: h.kind === "attack" ? "#F3AF8B" : h.kind === "chat" ? "#A4BDD2" : "#80CDB7",
  })), {
    id: "final", kind: "outro", kicker: "This week’s result",
    title: winner ? `${winner.name}\ntakes the week.` : "Ready for\nanother cast?",
    text: scoreline, detail: "See you on the next cast.", actor: story.leagueName, accent: "#80CDB7",
  }];
}
