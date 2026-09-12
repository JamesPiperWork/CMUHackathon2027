# Writing better email bait

Give Gemini a **topic, an angle, a tone, and one concrete detail**. A single hobby also works, but a short brief gives you more control over the result. Describe an invented activity or resource, rather than making up facts about the recipient's life.

These examples can be pasted directly into **Bait → Email → Your context**:

**A relaxed invitation**

```text
Topic: chess puzzles
Idea: a fictional chess circle is hosting a casual puzzle evening, with a table for beginners to compare solutions.
Tone: welcoming and conversational, without urgency.
```

**A practical resource**

```text
Topic: growing herbs on a windowsill
Idea: share a short guide from a fictional gardening group, including how to tell when basil needs watering. Keep this about the guide, not an event invitation.
Tone: useful and down to earth.
```

**A hobby update**

```text
Topic: model railways
Idea: a fictional railway club has added a tiny station platform to its community display. Share an update about how the new section connects to the main loop.
Tone: friendly and matter of fact.
```

**A simple creative activity**

```text
Topic: origami
Idea: invite beginners to an invented paper circle activity where everyone folds a lantern from a square sheet.
Tone: calm and encouraging. Keep the message short and avoid competition.
```

Leave URLs and contact details out of the brief; the app adds its own response link. Use fictional groups and ordinary hobby details. The generator does not support requests for passwords, payments, downloads, or impersonation of real people and organizations.

## Use the optional helpers

Under your context field, open **Help shape my idea** and choose **Invitation**, **Useful resource**, or **Hobby update**. Each button appends a short instruction to the topic you already wrote. You can edit it before pressing **Generate email**. The section starts collapsed, and choosing an angle does not generate or send anything.

On the review screen, **Shorter**, **More natural**, and **More specific** add guidance to the revision field. Add your own instruction if needed, then press **Regenerate with changes**. Your current subject, sender name, and message edits are included in the revision. You can also edit the email directly.

The topic field allows 1,800 characters and the revision field allows 500. Helpers preserve existing text, avoid duplicate suggestions, and disable when the complete instruction would not fit. Locked casts cannot be edited; generation limits still apply.

## How the generator works

The email pipeline records prompt version `email-authoring-v4` and follows this sequence:

1. **Interpret the brief.** Extract topic terms and an invitation, resource, or update angle as hints. The complete author brief remains the primary instruction, including tone and constraints.
2. **Draft with examples.** The system prompt includes varied examples of specific fictional messages. It asks for one coherent story, concrete relevant details, an ordinary tone, and one response action. It discourages generic marketing copy and invented recipient history.
3. **Require structured output.** Gemini returns a JSON object with a subject and body. Local validation checks their lengths, the single response marker, content rules, and unsupported destinations. The model cannot choose a sending address or response URL.
4. **Check the writing.** Deterministic checks catch a missing topic in the main body, selected boilerplate phrases, leaked drafting instructions, unsupported familiarity, and a requested resource replaced by another angle.
5. **Repair once if useful.** A failed writing or shape check can trigger one targeted rewrite with the specific correction. Each generation allows at most two provider requests within one shared 12-second budget. A refusal or content-policy failure uses the fallback without a rewrite.

If generation fails, a new email receives prepared wording. A failed refinement preserves the current validated email and its submitted edits. The app identifies prepared drafts and explains the fallback. These writing checks are heuristics; they do not establish factual accuracy, realism for every topic, or improved recipient click rates.

The design uses the clear instructions and varied examples described in Google's [prompt design guidance](https://ai.google.dev/gemini-api/docs/prompting-strategies), plus Gemini's [structured output support](https://ai.google.dev/gemini-api/docs/structured-output). The application still validates the returned content itself.

For Gemini 3, short email generation uses a low thinking level and a 2,048-token output budget. The 700-character email limit is checked separately. Google's [thinking documentation](https://ai.google.dev/gemini-api/docs/generate-content/thinking) explains that reasoning also consumes the output budget; leaving headroom reduces incomplete drafts. Other model families retain their default reasoning settings.

## Rehearse generation without sending mail

From the repository root:

```sh
npm run email:eval
npm run email:eval -- --live
npm run email:eval -- --live --sample=origami
```

The first command exercises offline prepared wording. The second loads the local `GEMINI_API_KEY` and runs four synthetic briefs through Gemini, allowing up to one retry per brief. The third checks only one sample; other sample IDs are `chess`, `baking`, and `trains`. Live checks use API quota, but create no accounts and send no email. A provider rate limit stops the remaining samples; wait before another live run.

The output includes each subject and body, source, prompt version, request count, elapsed time, and writing-check results. A live brief passes only when Gemini supplies the draft and the checks pass. Read the messages as well as the result counts: this is a small writing smoke test, not a measurement of training effectiveness.
