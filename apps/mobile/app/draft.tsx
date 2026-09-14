import { PrankPicker } from "../src/prank-picker";
import React, { useEffect, useRef, useState } from "react";
import { Linking, Platform, Pressable, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { type ApprovedContent, type Channel, type DeliveryStatus, type DraftPublic, type ScoutingProfile } from "@fp/shared";
import { API, useSession } from "../src/session";
import { useScreenScroll } from "../src/screen-scroll";
import { Badge, Button, C, Card, Divider, Empty, Field, Hook, Icon, Label, Row, Title, Txt } from "../src/ui";
import { Welcome } from "./index";

type Step = "choose" | "review" | "ready";
type BaitChoice = { id: string; label: string; channel: Channel; kind?: "regular" | "spear"; slot?: 1 | 2 };
const channelNames: Record<Channel, string> = { email: "Email", sms: "Text", voice: "Voice" };
const mediumNames: Record<Channel, string> = { email: "email", sms: "text message", voice: "call script" };
const channelIcons = { email: "mail", sms: "sms", voice: "voice" } as const;
const deliveryLabels: Record<DeliveryStatus, string> = {
  queued: "Queued for delivery", simulated: "Simulated delivery", accepted: "Accepted by provider",
  delivered: "Delivered", failed: "Delivery failed", unknown: "Delivery unconfirmed",
  cancelled: "Delivery cancelled", unanswered: "No answer",
};
const plainNotes = (value: string) => value.split(/\r?\n/)
  .filter(line => !/^\s*#{1,6}\s/.test(line))
  .map(line => line.replace(/^\s*[-*+]\s+/, "").replace(/[*_`~]/g, ""))
  .join("\n").trim();

function VoiceRecording({ path, onHeard, onUnavailable }: { path: string; onHeard: () => void; onUnavailable: () => void }) {
  const { token } = useSession();
  const [source, setSource] = useState<{ path: string; token: string; url: string } | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    let objectUrl: string | undefined;
    let active = true;
    const timer = setTimeout(() => abort.abort(), 15000);
    setSource(null); setError(false);
    if (!token || Platform.OS !== "web") { clearTimeout(timer); return; }
    // The account cookie is shared across tabs; use this tab's account token.
    void (async () => {
      const response = await fetch(`${API}${path}`, { credentials: "include", headers: { Authorization: `Bearer ${token}` }, signal: abort.signal });
      if (!response.ok) throw new Error("Audio preview unavailable");
      const bytes = await response.blob();
      if (!active || abort.signal.aborted) return;
      objectUrl = URL.createObjectURL(bytes);
      setSource({ path, token, url: objectUrl });
    })().catch(() => { if (active) setError(true); }).finally(() => clearTimeout(timer));
    return () => { active = false; abort.abort(); clearTimeout(timer); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [path, token, retry]);
  if (error) return <View style={{ gap: 10 }}><Txt style={{ color: C.coral, fontSize: 13 }}>Could not load this recording. Your script is safe.</Txt><Button small variant="secondary" onPress={() => { onUnavailable(); setRetry(value => value + 1); }}>Reload audio</Button></View>;
  if (!source || source.path !== path || source.token !== token) return <Txt muted style={{ fontSize: 13 }}>Loading your recording…</Txt>;
  return React.createElement("audio", { key: source.url, controls: true, preload: "metadata", src: source.url, style: { width: "100%" }, "aria-label": "Play your generated voice message", onEnded: onHeard, onError: () => { onUnavailable(); setError(true); } });
}

export default function Draft() {
  const params = useLocalSearchParams<{ channel?: string }>();
  const { state, busy, request, emailDelivery } = useSession();
  const resetOnEntry = useRef("");
  const scrollToTop = useScreenScroll();
  const [channel, setChannel] = useState<Channel>("email");
  const [mediumChosen, setMediumChosen] = useState(false);
  const [cast, setCast] = useState("cast-1");
  const [step, setStep] = useState<Step>("choose");
  const [content, setContent] = useState<ApprovedContent | null>(null);
  const [dirty, setDirty] = useState(false);
  const [notes, setNotes] = useState("");
  const [savedNotes, setSavedNotes] = useState("");
  const [notesEdited, setNotesEdited] = useState(false);
  const [refinement, setRefinement] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [notesError, setNotesError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sendResult, setSendResult] = useState<{ status: DeliveryStatus; reason?: string } | null>(null);
  const [voiceConfig, setVoiceConfig] = useState<{ ready: boolean; voiceLabel: string; checks: { code: string; ok: boolean; detail: string }[] } | null>(null);
  const [voiceConfigError, setVoiceConfigError] = useState(false);
  const [revealBusy, setRevealBusy] = useState(false);
  const [heardRevision, setHeardRevision] = useState<string | null>(null);
  const noteCache = useRef<Record<string, string>>({});
  const waiting = !!state?.selectedLeagueId && state.selectedLeagueId !== state.match.leagueId;
  const targetId = state?.opponent.id;
  const leagueId = state?.match.leagueId;
  const emailCasts = state?.castRules.version === "email-casts-v2";
  const immediate = emailCasts && state?.deliveryTiming === "immediate";
  const league = state?.leagues.find(item => item.id === leagueId);
  const enabledKey = (Object.keys(channelNames) as Channel[]).filter(item => !league || league.settings.channels[item]).join(",");
  const choices: BaitChoice[] = emailCasts ? [
    { id: "cast-1", label: "Cast 1", channel: "email", kind: "regular", slot: 1 },
    { id: "cast-2", label: "Cast 2", channel: "email", kind: "regular", slot: 2 },
    { id: "spear", label: "Spear", channel: "email", kind: "spear" },
  ] : (enabledKey.split(",").filter(Boolean) as Channel[]).map(item => ({ id: item, label: channelNames[item], channel: item }));
  const selected = choices.find(choice => choice.id === (emailCasts ? cast : channel)) || choices[0];
  const matchesChoice = (item: DraftPublic, choice: BaitChoice) => emailCasts
    ? (item.kind || "regular") === choice.kind && (choice.kind === "spear" || (item.slot || 1) === choice.slot)
    : item.channel === choice.channel;
  const draft = selected && state?.drafts.find(item => matchesChoice(item, selected));
  const ephemeralEmails = state?.mode === "demo" && ["mailpit", "simulated"].includes(emailDelivery);
  useEffect(() => {
    if (!ephemeralEmails || !state?.opponent.id || waiting) return;
    const entry = `${state.me.id}:${state.match.id}`;
    if (resetOnEntry.current === entry) return;
    resetOnEntry.current = entry;
    void request("/api/drafts/reset-unsent-email", {}).catch(cause => setError(cause instanceof Error ? cause.message : "Could not clear old drafts."));
  }, [ephemeralEmails, state?.me.id, state?.match.id, state?.opponent.id, waiting, request]);

  useEffect(() => { scrollToTop(); }, [step, channel, cast, scrollToTop]);
  useEffect(() => {
    if (!emailCasts && params.channel && ["email", "sms", "voice"].includes(params.channel)) setChannel(params.channel as Channel);
  }, [params.channel, emailCasts]);
  useEffect(() => {
    const enabled = enabledKey.split(",");
    if (enabled[0] && !enabled.includes(channel)) setChannel(enabled[0] as Channel);
  }, [enabledKey, channel, emailCasts]);
  useEffect(() => {
    setContent(draft?.channel === channel ? draft.content : null);
    setDirty(false);
    setHeardRevision(null);
  }, [draft?.id, draft?.channel, channel, draft?.content.subject, draft?.content.senderDisplayName, draft?.content.bodyText, draft?.content.smsText, draft?.content.voiceScript]);
  useEffect(() => {
    setStep(current => draft?.generationStatus === "pending" ? current : draft?.channel === channel ? "review" : "choose");
    setRefinement("");
    setDetailsOpen(false);
    setSendResult(null);
    setError(null);
  }, [draft?.id, draft?.generationStatus, state?.match.id]);
  useEffect(() => {
    let active = true;
    setNotes(""); setSavedNotes(""); setNotesEdited(false); setNotesError(false);
    if (!targetId || waiting) return;
    if (emailCasts) {
      setNotes(noteCache.current[`${state?.match.id}:${cast}`] ?? draft?.authorPrompt ?? "");
      setLoadingNotes(false);
      return;
    }
    setLoadingNotes(true);
    void request<ScoutingProfile>(`/api/scouting/${encodeURIComponent(targetId)}`)
      .then(profile => {
        if (!active) return;
        setSavedNotes(profile.markdown);
        setNotes(draft?.authorPrompt ?? plainNotes(profile.markdown));
      })
      .catch(() => { if (active) setNotesError(true); })
      .finally(() => { if (active) setLoadingNotes(false); });
    return () => { active = false; };
  }, [targetId, leagueId, state?.match.id, cast, draft?.id, draft?.authorPrompt, waiting, retry, request, emailCasts]);
  useEffect(() => {
    if (!emailCasts || !state) return;
    const existing = state.drafts.find(item => !item.locked) ?? state.drafts[0];
    setCast(existing ? existing.kind === "spear" ? "spear" : `cast-${existing.slot || 1}` : "cast-1");
    setChannel(existing?.channel ?? "email");
    setMediumChosen(!!existing);
    if (state.drafts.some(item => item.locked)) setStep("ready");
  }, [state?.me.id, state?.match.id, emailCasts]);
  useEffect(() => {
    let active = true;
    if (channel !== "voice" || !state) return;
    setVoiceConfigError(false);
    void request<typeof voiceConfig>("/api/voice/config")
      .then(value => { if (active) setVoiceConfig(value); })
      .catch(() => { if (active) setVoiceConfigError(true); });
    return () => { active = false; };
  }, [channel, state?.me.id, request]);

  const run = async (name: string, action: () => Promise<void>) => {
    setWorking(name); setError(null);
    try { await action(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "That didn't work. Please try again."); }
    finally { setWorking(null); }
  };
  if (!state) return <Welcome />;
  if (waiting) return <View style={{ gap: 16 }}><Empty icon="clock" title="Waiting for a fishing buddy">Invite someone to this league. You can write bait once you're paired.</Empty><Button onPress={() => router.push("/league")}>Open League</Button></View>;
  if (!state.consent.acceptedAt && state.role !== "operator") return <View style={{ gap: 16 }}><Empty title="Join in first">Head Home to accept your invitation and choose how you'd like to play.</Empty><Button onPress={() => router.push("/")}>Go Home</Button></View>;

  const budget = league?.settings.difficulty === "rookie" ? 5 : league?.settings.difficulty === "expert" ? 1 : 3;
  const attemptsLeft = Math.max(0, budget - (draft?.generationAttempts ?? 0));
  const generating = draft?.generationStatus === "pending";
  const canCast = state.match.state === "drafting" || (emailCasts && state.match.state === "active");
  const locked = !!draft?.locked || !canCast;
  const disabled = !!working || busy || generating || revealBusy;
  const deliveryLabel = (status: DeliveryStatus, medium: Channel = channel) => state.emailDelivery === "mailpit" && medium === "email" && ["accepted", "delivered"].includes(status) ? "Captured in local inbox" : deliveryLabels[status];
  const key = channel === "email" ? "bodyText" : channel === "sms" ? "smsText" : "voiceScript";
  const max = channel === "email" ? 700 : channel === "sms" ? 300 : 440;
  const min = channel === "email" ? 20 : channel === "sms" ? 15 : 40;
  const valid = !!content && content[key].length >= min && content[key].length <= max && (channel !== "email" || content.subject.length >= 3);
  const activeDrafts = state.drafts;
  const readyCount = activeDrafts.filter(item => item.locked && (!emailCasts || item.kind !== "spear")).length;
  const unfinished = activeDrafts.some(item => !item.locked);
  const spearUnavailable = emailCasts && selected.kind === "spear" && !draft?.locked && state.castRules.spearRemaining === 0;
  const canReview = !!content && !!draft && draft.channel === channel && !generating;
  const readiness = state.readiness.find(item => item.channel === channel);
  const deliveryReady = readiness?.status === "ready" || readiness?.status === "simulated";
  const voiceAudio = draft?.channel === "voice" ? draft.voiceAudio : undefined;
  const voiceApproved = channel !== "voice" || (!!voiceAudio?.approvedAt && voiceAudio.status === "ready" && !dirty);
  const medium = mediumNames[channel];
  const setContext = (value: string) => { setNotes(value); setNotesEdited(true); noteCache.current[`${state.match.id}:${cast}`] = value; };
  const navigate = (next: Step) => {
    if (disabled || (next === "ready" && dirty) || (next === "review" && !canReview)) return;
    setError(null); setStep(next);
  };
  const chooseCast = (next: BaitChoice) => {
    if (dirty || disabled) return;
    const existing = state.drafts.find(item => matchesChoice(item, next));
    setChannel(existing?.channel ?? (enabledKey.split(",")[0] as Channel || "email"));
    setMediumChosen(!!existing);
    if (emailCasts) setCast(next.id);
    setStep(existing ? "review" : "choose"); setError(null);
  };
  const createMessage = (handwritten = false, refine = false) => void run(handwritten ? "write" : refine ? "refine" : "create", async () => {
    if (!emailCasts) {
      const profile = await request<ScoutingProfile>(`/api/scouting/${encodeURIComponent(state.opponent.id)}`, {
        interests: [draft?.interest ?? "Board games"], markdown: notesEdited ? notes : savedNotes,
      }, "PUT");
      setSavedNotes(profile.markdown);
    }
    setNotesEdited(false);
    await request<{ scenarioId: string }>(handwritten ? "/api/drafts/prepare" : "/api/drafts/generate", {
      recipientMemberId: state.opponent.id, channel,
      ...(emailCasts ? { authorPrompt: notes.trim() } : { interest: draft?.interest ?? "Board games", templateId: draft?.templateId ?? "parcel-update" }),
      ...(emailCasts ? { kind: selected.kind, slot: selected.slot } : {}),
      ...(refine && content ? { refinement: refinement.trim(), previousDraft: channel === "email" ? { subject: content.subject, senderDisplayName: content.senderDisplayName, bodyText: content.bodyText } : { [key]: content[key] } } : {}),
    });
    if (handwritten) setStep("review");
  });
  const saveEdits = async () => {
    if (!draft || !content || !dirty) return;
    await request(`/api/drafts/${draft.id}`, channel === "email" ? { subject: content.subject, senderDisplayName: content.senderDisplayName, bodyText: content.bodyText } : { [key]: content[key] }, "PATCH");
    setDirty(false);
  };
  const createAudio = () => void run("audio", async () => {
    if (!draft || !valid) return;
    await saveEdits();
    setHeardRevision(null);
    await request(`/api/drafts/${draft.id}/audio`, {});
  });
  const useBait = () => void run(immediate ? "send" : "save", async () => {
    if (!draft || !content || !valid) return;
    await saveEdits();
    if (immediate) {
      const result = await request<{ scenarioId: string; status: DeliveryStatus; reason?: string }>(`/api/drafts/${draft.id}/send`, {});
      setSendResult(result);
    } else {
      await request(`/api/drafts/${draft.id}/lock`, {});
    }
    setStep("ready");
  });

  // Each weekly slot has one medium and one editable package.
  return <View style={{ width: "100%", maxWidth: 760, alignSelf: "center", gap: 18 }}>
    <Row style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
      <View style={{ flex: 1, gap: 6 }}>
        <Title>{step === "ready" ? "Your bait this week" : `Bait for ${state.opponent.name}`}</Title>
        <Txt muted style={{ fontSize: 13 }}>{step === "ready" ? emailCasts ? `${readyCount} of ${state.castRules.regularLimit} casts ${immediate ? "used" : "ready"}` : `${readyCount} messages ready` : selected.kind === "spear" ? "Spear · one extra cast this season" : emailCasts ? `Cast ${selected.slot} of ${state.castRules.regularLimit}${mediumChosen ? ` · ${channelNames[channel]}` : ""}` : channelNames[channel]}</Txt>
      </View>
      {step !== "ready" && <Button small variant="ghost" disabled={disabled || dirty} onPress={() => navigate("ready")}>Your casts</Button>}
    </Row>
    {step === "review" && <Button small variant="ghost" style={{ alignSelf: "flex-start" }} disabled={disabled} onPress={() => navigate("choose")}>← Back to your idea</Button>}
    {ephemeralEmails && channel === "email" && draft && !draft.locked && <Button small variant="secondary" disabled={disabled || generating} onPress={() => void run("clear", async () => {
      await request("/api/drafts/reset-unsent-email", {});
      noteCache.current = {}; setNotes(""); setContent(null); setDirty(false); setRefinement(""); setStep("choose"); setMediumChosen(true);
    })}>New email</Button>}
    {!!sendResult && <Card style={{ gap: 8, borderColor: ["failed", "unknown", "cancelled"].includes(sendResult.status) ? C.coral : C.teal }}>
      <Txt style={{ fontWeight: "700" }}>{deliveryLabel(sendResult.status)}</Txt>
      <Txt muted style={{ lineHeight: 21 }}>{state.emailDelivery === "mailpit" && channel === "email" && ["accepted", "delivered"].includes(sendResult.status) ? "Captured this cast in the separate local inbox. No external email was sent." : sendResult.reason || (sendResult.status === "accepted" ? "The provider accepted this cast. This does not yet confirm a delivery or a game response." : sendResult.status === "simulated" ? "This cast stayed in the local simulation. No email, text or call was sent." : sendResult.status === "queued" ? "This cast is being processed. Its status will update here." : "Check the cast’s status before taking another action.")}</Txt>
    </Card>}
    {!!error && <Card style={{ borderColor: C.coral }}><Txt style={{ color: C.coral, lineHeight: 21 }}>{error}</Txt><Txt muted style={{ fontSize: 12, marginTop: 8 }}>Your current message is still here. Adjust it or try again.</Txt></Card>}

    {step === "choose" && !mediumChosen && <Card style={{ gap: 18 }}>
      <Txt style={{ fontSize: 22, fontWeight: "800" }}>How will you cast?</Txt>
      <Txt muted style={{ lineHeight: 22 }}>Choose a medium for this cast. You have two casts total this week, in any combination.</Txt>
      {(Object.keys(channelNames) as Channel[]).map(item => {
        const allowed = enabledKey.split(",").includes(item);
        return <Pressable key={item} accessibilityRole="button" accessibilityLabel={`Choose ${channelNames[item]}`} accessibilityState={{ disabled: !allowed || disabled }} disabled={!allowed || disabled}
          onPress={() => { setChannel(item); setMediumChosen(true); setHeardRevision(null); }}
          style={({ pressed }) => ({ padding: 18, borderRadius: 12, borderWidth: 1, borderColor: C.border, opacity: allowed ? 1 : 0.5, backgroundColor: pressed ? C.tealDark : C.panelDeep })}>
          <Row style={{ gap: 14 }}><Icon name={channelIcons[item]} color={C.teal} size={24} /><View style={{ flex: 1, gap: 5 }}><Txt style={{ fontSize: 17, fontWeight: "700" }}>{channelNames[item]}</Txt><Txt muted style={{ fontSize: 13, lineHeight: 20 }}>{!allowed ? "Turned off in league settings" : item === "email" ? "A subject and message for their inbox" : item === "sms" ? "A short message for their phone" : "A script, generated voice and phone call"}</Txt></View><Txt muted>→</Txt></Row>
        </Pressable>;
      })}
      <Txt muted style={{ fontSize: 12, lineHeight: 20 }}>Texts and calls require your opponent’s opt-in and a connected phone service. You can check delivery readiness before sending.</Txt>
    </Card>}

    {step === "choose" && mediumChosen && <Card style={{ gap: 18 }}>
      {!locked && <Button small variant="ghost" disabled={disabled || dirty} style={{ alignSelf: "flex-start" }} onPress={() => setMediumChosen(false)}>← Change medium</Button>}
      <Row style={{ justifyContent: "space-between" }}><Txt style={{ fontSize: 22, fontWeight: "800", flex: 1 }}>What's your idea?</Txt><Hook size={42} /></Row>
      <Txt muted style={{ lineHeight: 22 }}>Tell us a little about {state.opponent.name} and what they'd notice. We'll turn your idea into one {medium} you can edit.</Txt>
      {loadingNotes ? <Txt muted>Loading your saved context…</Txt> : notesError ? <View style={{ gap: 12 }}><Txt muted>We couldn't load your saved context.</Txt><Button variant="secondary" onPress={() => setRetry(value => value + 1)}>Try again</Button></View> : <>
        <Field label={`Your context for ${state.opponent.name}`} value={notes} multiline maxLength={1800} editable={!disabled && !locked}
          onChangeText={setContext}
          help="Your private notes. Hobbies and fictional plans are enough; leave out private contact details." />
        {locked ? <Button disabled={!canReview || disabled} onPress={() => navigate("review")}>View your {medium}</Button> : <>
          <Button icon="sparkle" loading={working === "create" || generating} disabled={disabled || dirty || spearUnavailable || attemptsLeft === 0 || notes.trim().length < 3} onPress={() => createMessage()}>{generating ? `Writing your ${medium}…` : `Generate ${medium}`}</Button>
          {emailCasts && (selected.kind === "spear" || (attemptsLeft === 0 && !canReview)) && <Button variant="secondary" loading={working === "write"} disabled={disabled || dirty || spearUnavailable || notes.trim().length < 3} onPress={() => createMessage(true)}>{selected.kind === "spear" ? "Write my own Spear" : "Create an editable draft"}</Button>}
          {dirty && <Txt muted style={{ fontSize: 12, lineHeight: 20 }}>Your edits are kept. Return to your {medium} to save or refine them.</Txt>}
          {attemptsLeft === 0 && <Txt muted style={{ fontSize: 12, lineHeight: 20 }}>No generations left for this cast. You can still edit your message directly.</Txt>}
          {canReview && <Button variant="secondary" icon="arrow" disabled={disabled} onPress={() => navigate("review")}>Return to your {medium}</Button>}
        </>}
      </>}
    </Card>}

    {step === "review" && content && <Card style={{ gap: 18 }}>
      <Row style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <Txt style={{ fontSize: 22, fontWeight: "800" }}>Your {medium}</Txt>
        <Badge>{locked ? draft ? deliveryLabel(draft.deliveryStatus) : "Saved" : generating ? "Generating…" : draft?.source === "gemini" ? "Gemini draft" : "Prepared draft"}</Badge>
      </Row>
      {!locked && draft?.source !== "gemini" && !!draft?.generationReason && <Txt muted style={{ fontSize: 13, lineHeight: 21 }}>{draft.generationReason}</Txt>}
      {!locked ? <View style={{ gap: 14 }}>
        {channel === "email" && <Field label="Sender display name" value={content.senderDisplayName} maxLength={60} editable={!disabled} onChangeText={value => { setContent({ ...content, senderDisplayName: value }); setDirty(true); }} help="Use a fictional club or character name. The sender’s email address stays the connected address." />}
        {channel === "email" && <Field label="Subject" value={content.subject} maxLength={100} editable={!disabled} onChangeText={value => { setContent({ ...content, subject: value }); setDirty(true); }} />}
        <Field label={channel === "voice" ? "What the call says" : "Message"} value={content[key]} multiline maxLength={max} editable={!disabled}
          onChangeText={value => { setContent({ ...content, [key]: value }); setDirty(true); }}
          help={channel === "voice" ? "Your call includes a game disclosure and keypad response instructions." : "Your game response link is added automatically."} />
        {dirty && <Row style={{ flexWrap: "wrap" }}><Button small variant="secondary" disabled={disabled || !valid} loading={working === "edits"} onPress={() => void run("edits", saveEdits)}>Save edits</Button><Button small variant="ghost" disabled={disabled} onPress={() => { setContent(draft?.content ?? null); setDirty(false); }}>Undo my edits</Button></Row>}
      </View> : <View style={{ gap: 14, padding: 18, backgroundColor: C.panelDeep, borderRadius: 12 }}>
        <Txt muted style={{ fontSize: 12 }}>{content.senderDisplayName} · for {state.opponent.name}</Txt>
        {channel === "email" && <Txt style={{ fontSize: 19, fontWeight: "700", lineHeight: 26 }}>{content.subject}</Txt>}
        <Txt style={{ fontSize: 15, lineHeight: 25 }}>{content[key]}</Txt>
      </View>}
      {draft && <PrankPicker key={draft.id} draftId={draft.id} reveal={draft.prankReveal} disabled={disabled} locked={locked} onBusy={setRevealBusy} />}
      {channel === "voice" && <View style={{ gap: 13, paddingTop: 4 }}>
        <Divider />
        <Txt style={{ fontSize: 17, fontWeight: "700" }}>{voiceConfig?.voiceLabel || "Stock voice"}</Txt>
        {!locked && <Button variant="secondary" icon="voice" loading={working === "audio" || voiceAudio?.status === "generating"} disabled={disabled || !valid || !voiceConfig?.ready || voiceAudio?.status === "generating"} onPress={createAudio}>{voiceAudio?.status === "generating" ? "Creating audio…" : "Generate audio"}</Button>}
        {voiceConfigError ? <Txt muted style={{ fontSize: 13, lineHeight: 21 }}>Could not check voice setup. Open delivery details in Settings, then try again.</Txt> : voiceConfig && !voiceConfig.ready && <Txt muted style={{ fontSize: 13, lineHeight: 21 }}>{voiceConfig.checks.find(check => !check.ok)?.code === "api_key" ? "Audio isn’t connected yet. Ask the organizer to add the ElevenLabs API key." : "The organizer needs to select and confirm an ElevenLabs stock voice before audio can be generated."}</Txt>}
        {voiceAudio?.status === "failed" && <Txt style={{ color: C.coral, fontSize: 13, lineHeight: 21 }}>{voiceAudio.error || "Audio could not be created. Your script is saved; try generating audio again."}</Txt>}
        {dirty && voiceAudio && <Txt muted style={{ fontSize: 13, lineHeight: 21 }}>Your script has changed. Generate new audio to hear and approve this version.</Txt>}
        {!dirty && voiceAudio?.status === "ready" && voiceAudio.previewUrl && <>
          <Txt muted style={{ fontSize: 13 }}>Listen to this recording before sending{voiceAudio.durationSeconds ? ` · ${Math.round(voiceAudio.durationSeconds)} seconds` : ""}.</Txt>
          {Platform.OS === "web" ? <VoiceRecording key={voiceAudio.revision} path={voiceAudio.previewUrl} onHeard={() => setHeardRevision(voiceAudio.revision)} onUnavailable={() => setHeardRevision(null)} /> : <><Txt muted style={{ fontSize: 13, lineHeight: 21 }}>Listen and approve this recording in the web app using the same account.</Txt><Button variant="secondary" onPress={() => void Linking.openURL(`${API}/draft`)}>Open web audio preview</Button></>}
          {!locked && !voiceAudio.approvedAt && <Button variant="secondary" disabled={disabled || heardRevision !== voiceAudio.revision} loading={working === "approve"} onPress={() => void run("approve", async () => { await request(`/api/drafts/${draft!.id}/audio/approve`, { revision: voiceAudio.revision }); })}>Use this audio</Button>}
          {!!voiceAudio.approvedAt && <Txt style={{ color: C.teal, fontSize: 13 }}>This recording is approved.</Txt>}
        </>}
      </View>}
      {!locked && <>
        <Button icon="check" loading={working === "save" || working === "send"} disabled={disabled || !valid || spearUnavailable || !voiceApproved || (immediate && !deliveryReady)} onPress={useBait}>{working === "send" ? "Sending…" : immediate ? channel === "email" ? "Send email now" : channel === "sms" ? "Send text now" : "Send call" : emailCasts && state.match.state === "active" ? "Send cast" : "Make this bait ready"}</Button>
        <Txt muted style={{ fontSize: 12, textAlign: "center", lineHeight: 19 }}>{readiness?.status === "simulated" ? "Local simulation: sending this cast will not contact a real inbox or phone." : immediate ? "Sends this cast now and starts the week if needed. Sending uses this slot." : state.match.state === "active" ? "Queues this cast for delivery in their chosen hours." : "Saves this cast. You can start the match next."}</Txt>
        {!deliveryReady && <View style={{ gap: 8 }}><Txt muted style={{ fontSize: 13, lineHeight: 21 }}>{readiness?.reason || "Delivery is not connected for this medium."}</Txt><Button small variant="ghost" onPress={() => router.push("/settings")}>View delivery setup</Button></View>}
        {emailCasts && <>
          <Divider />
          <Field label="Want Gemini to change something?" value={refinement} maxLength={500} editable={!disabled && attemptsLeft > 0}
            onChangeText={setRefinement}
            help={attemptsLeft ? `${attemptsLeft} ${attemptsLeft === 1 ? "generation" : "generations"} left for this cast. Your current edits are included.` : "No generations left. You can still edit the message above."} />
          <Button variant="secondary" icon="sparkle" loading={working === "refine" || generating} disabled={disabled || !valid || spearUnavailable || attemptsLeft === 0 || !refinement.trim()} onPress={() => createMessage(false, true)}>Regenerate with changes</Button>
        </>}
      </>}
      {locked && <>{immediate && canCast && draft?.deliveryStatus === "queued" && <Button loading={working === "send"} disabled={disabled || !deliveryReady || !voiceApproved} onPress={useBait}>{working === "send" ? "Sending…" : channel === "email" ? "Send email now" : channel === "sms" ? "Send text now" : "Send call"}</Button>}<Txt muted style={{ lineHeight: 21 }}>{state.match.state === "active" && draft ? `${deliveryLabel(draft.deliveryStatus)}. This cast can't be changed now.` : "This bait is saved and can't be changed now."}</Txt><Button onPress={() => navigate("ready")}>Back to your casts</Button></>}
      <View>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: detailsOpen }} onPress={() => setDetailsOpen(!detailsOpen)} style={{ minHeight: 44, justifyContent: "center" }}><Txt muted style={{ fontSize: 13 }}>{detailsOpen ? "Hide learning notes −" : "Why it's bait +"}</Txt></Pressable>
        {detailsOpen && <View style={{ gap: 8 }}><Label>Learning notes</Label>{content.cueAnnotations.map((cue, index) => <Txt key={index} muted style={{ fontSize: 12, lineHeight: 20 }}>{cue}</Txt>)}<Txt muted style={{ fontSize: 12, lineHeight: 20 }}>{content.explanation}</Txt></View>}
      </View>
    </Card>}

    {step === "ready" && <Card style={{ gap: 20 }}>
      <Txt muted style={{ lineHeight: 22 }}>{state.match.state === "completed" ? "This round is finished. See the scores in your match results." : emailCasts ? "Two casts, in any mix of email, text or voice. The Spear adds one optional cast this season." : "Review your messages before starting this round."}</Txt>
      <View>{choices.map(item => {
        const candidate = state.drafts.find(value => matchesChoice(value, item));
        const unavailable = emailCasts && item.kind === "spear" && !candidate && state.castRules.spearRemaining === 0;
        return <View key={item.id} style={{ borderTopWidth: 1, borderColor: C.border, paddingVertical: 14 }}>
          <Row style={{ justifyContent: "space-between" }}>
            <Row style={{ flex: 1 }}><Icon name={candidate ? channelIcons[candidate.channel] : "hook"} color={candidate?.locked ? C.teal : C.muted} /><View style={{ flex: 1, gap: 4 }}>
              <Txt style={{ fontWeight: "700" }}>{item.label}{candidate ? ` · ${channelNames[candidate.channel]}` : item.kind === "spear" ? " · optional" : ""}</Txt>
              <Txt muted style={{ fontSize: 12 }}>{candidate?.locked ? state.match.state !== "drafting" ? deliveryLabel(candidate.deliveryStatus, candidate.channel) : "Ready to send" : candidate ? "Draft saved" : unavailable ? "Used this season" : "Not started"}</Txt>
            </View></Row>
            {(candidate || canCast) && <Button small variant="ghost" disabled={disabled || unavailable} onPress={() => chooseCast(item)}>{candidate?.locked ? "View" : candidate ? "Continue" : unavailable ? "Used" : "Create"}</Button>}
          </Row>
        </View>;
      })}</View>
      {state.match.state === "drafting" && !immediate ? <>
        <Button icon="arrow" disabled={disabled || (emailCasts ? !activeDrafts.some(item => item.locked) : unfinished)} loading={working === "start"} onPress={() => void run("start", async () => { await request("/api/match/activate", {}); router.push("/"); })}>Start fishing</Button>
        <Txt muted style={{ fontSize: 12, textAlign: "center", lineHeight: 19 }}>{emailCasts ? "Only your ready casts are sent. Empty slots stay open during the week." : "Finish reviewing your messages before you start."}</Txt>
      </> : <Button icon="arrow" onPress={() => router.push(state.match.state === "completed" ? "/matchups" : "/")}>{state.match.state === "completed" ? "View match results" : "Back to Home"}</Button>}
    </Card>}
  </View>;
}
