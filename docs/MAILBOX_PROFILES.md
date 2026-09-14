# Harbor Mail's fictional regulars

The separate local inbox contains 60 sample messages spanning roughly three weeks. These are background email history, not scored game challenges. Names, groups, reservations and conversations are invented. Every address ends in `@demo.test` and delivery stays on the local Mailpit server.

| Mailbox | Interests | Personality and preferences visible in the mail |
| --- | --- | --- |
| Alex Morgan — `alex@demo.test` | Chess puzzles, tabletop games, specialty coffee | Casual rapid games and endgames; cooperative four-player games; light roasts and practical pour-over experiments. Often hosts relaxed game nights. |
| Jordan Lee — `jordan@demo.test` | Acoustic music, film photography, day hikes | Small seated shows; black-and-white film and contact prints; easy-paced walks with time for photos and coffee. Prefers quieter gatherings over festivals. |
| Casey Reed — `casey@demo.test` | Sourdough baking, windowsill herbs, pottery | Small-batch recipes; practical beginner workshops; basil and mint in pots; handbuilt mugs and handmade gifts. Often brings bread to friends' gatherings. |

There are newsletters, club notes, reservations, workshop follow-ups, library notices, parcel-room updates, and personal conversations. Replies from the three regulars also appear in their **Sent** folders. Some conversations cross mailboxes: Alex and Jordan plan coffee, Casey brings bread to game night, and Jordan photographs Casey's pottery.

Use the mailbox menu at [Harbor Mail](http://localhost:8026/) to switch people. Search for a hobby or sender to see the pattern, or read Sent to learn preferences in their own words. These profiles do not create game accounts, choose player settings, or silently supply private email contents to Gemini. Authors still enter their own topic in Bait.

The history is populated automatically by `npm run email:capture`. To add any missing examples to an already-running local inbox:

```sh
npm run email:populate
```

Each sample has a stable Message-ID. Repeat runs skip existing samples and preserve ordinary mail, challenge emails and current read/unread choices. New samples have varied dates and an initial mix of read and unread states; outgoing replies include standard reply headers. Restarting the demo keeps the same history rather than adding another copy. Deleting a sample allows a later population run to restore that sample.

The capture launcher uses Mailpit's message-date setting for historical dates and disables automatic message-count deletion so sample population cannot evict existing mail. The local mailbox database will grow until you remove messages through the inspector. [Mailpit runtime options](https://mailpit.axllent.org/docs/configuration/runtime-options/).
