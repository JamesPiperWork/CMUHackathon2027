import test from "node:test";
import assert from "node:assert/strict";
import { createSeed } from "@fp/shared";
import { storyScenes } from "../../mobile/src/story.js";

test("Wrapped uses saved personal receipts and does not invent a successful attack", () => {
  const db = createSeed(Date.now());
  const players = db.profiles.slice(0, 2);
  const story = {
    id: "finished", leagueName: "The Usual Suspects", week: 4, players,
    scores: { alex: 18, jordan: 18 }, winnerId: null, completedAt: Date.now(), synthetic: false,
    highlights: [{ id: "chat-1", kind: "chat" as const, actorName: "Jordan", text: "You almost got me with the ticket upgrade.", createdAt: Date.now() }],
  };
  const scenes = storyScenes(story);
  assert.equal(scenes.length, 3);
  assert.equal(scenes[1].text, story.highlights[0].text);
  assert.equal(scenes[1].actor, "Jordan");
  assert.equal(scenes.filter(s => s.kind === "attack").length, 0);
  assert.doesNotMatch(scenes.at(-1)!.title, /takes the week/);
  assert.match(scenes[0].text, /18/);
});
