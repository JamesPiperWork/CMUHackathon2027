import React, { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import {
  interests,
  type ApprovedContent,
  type Channel,
  type Interest,
  type ScoutingProfile,
} from "@fp/shared";
import { useSession } from "../src/session";
import { useScreenScroll } from "../src/screen-scroll";
import {
  Badge,
  Button,
  C,
  Card,
  Divider,
  Empty,
  Field,
  Hook,
  Icon,
  Label,
  Row,
  Title,
  Txt,
} from "../src/ui";
import { Welcome } from "./index";

type Step = "choose" | "review" | "ready";
const channelNames: Record<Channel, string> = {
  email: "Email",
  sms: "Text",
  voice: "Call",
};
const baitIdeas: Record<Interest, { template: string }> = {
  "Board games": { template: "parcel-update" },
  "Live music": { template: "ticket-drop" },
  "Outdoor adventures": { template: "game-night" },
};
const templates = [
  { id: "parcel-update", title: "A delivery update" },
  { id: "ticket-drop", title: "A ticket invitation" },
  { id: "game-night", title: "A change of plans" },
];
// Keep previously saved text unchanged unless the sender edits it.
const plainNotes = (value: string) =>
  value
    .split(/\r?\n/)
    .filter((line) => !/^\s*#{1,6}\s/.test(line))
    .map((line) => line.replace(/^\s*[-*+]\s+/, "").replace(/[*_`~]/g, ""))
    .join("\n")
    .trim();

function Disclosure({
  label,
  open,
  onPress,
}: {
  label: string;
  open: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      aria-expanded={open}
      accessibilityState={{ expanded: open }}
      onPress={onPress}
      style={{
        minHeight: 44,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
      }}
    >
      <Txt muted style={{ fontSize: 13 }}>
        {label}
      </Txt>
      <Txt muted>{open ? "−" : "+"}</Txt>
    </Pressable>
  );
}

export default function Draft() {
  const params = useLocalSearchParams<{ channel?: string }>();
  const { state, busy, request } = useSession();
  const scrollToTop = useScreenScroll();
  const [channel, setChannel] = useState<Channel>("email");
  const [step, setStep] = useState<Step>("choose");
  const [interest, setInterest] = useState<Interest>("Board games");
  const [template, setTemplate] = useState("parcel-update");
  const [content, setContent] = useState<ApprovedContent | null>(null);
  const [dirty, setDirty] = useState(false);
  const [editing, setEditing] = useState(false);
  const [personalOpen, setPersonalOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [savedNotes, setSavedNotes] = useState("");
  const [notes, setNotes] = useState("");
  const [notesEdited, setNotesEdited] = useState(false);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [notesError, setNotesError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const waiting =
    !!state?.selectedLeagueId &&
    state.selectedLeagueId !== state.match.leagueId;
  const targetId = state?.opponent.id;
  const leagueId = state?.match.leagueId;
  const draft = state?.drafts.find((item) => item.channel === channel);
  const league = state?.leagues?.find((item) => item.id === leagueId);
  const enabledKey = (Object.keys(channelNames) as Channel[])
    .filter((item) => !league || league.settings.channels[item])
    .join(",");

  useEffect(() => {
    scrollToTop();
  }, [step, channel, scrollToTop]);

  useEffect(() => {
    if (params.channel && ["email", "sms", "voice"].includes(params.channel))
      setChannel(params.channel as Channel);
  }, [params.channel]);
  useEffect(() => {
    const enabled = enabledKey.split(",") as Channel[];
    if (enabled[0] && !enabled.includes(channel)) setChannel(enabled[0]);
  }, [enabledKey, channel]);
  useEffect(() => {
    setContent(draft?.content ?? null);
    setDirty(false);
    setEditing(false);
  }, [
    draft?.id,
    draft?.content.subject,
    draft?.content.bodyText,
    draft?.content.smsText,
    draft?.content.voiceScript,
  ]);
  useEffect(() => {
    setStep((current) =>
      draft?.generationStatus === "pending"
        ? "choose"
        : draft && current === "review"
          ? "review"
          : draft?.locked || (state && state.match.state !== "drafting")
            ? "ready"
            : draft
              ? "review"
              : "choose",
    );
    setError(null);
    setDetailsOpen(false);
  }, [
    draft?.id,
    draft?.locked,
    draft?.generationStatus,
    state?.match.id,
    state?.match.state,
  ]);
  useEffect(() => {
    let active = true;
    setSavedNotes("");
    setNotes("");
    setNotesEdited(false);
    setNotesError(false);
    setPersonalOpen(false);
    if (!targetId || waiting) return;
    setLoadingNotes(true);
    void request<ScoutingProfile>(
      `/api/scouting/${encodeURIComponent(targetId)}`,
    )
      .then((profile) => {
        if (!active) return;
        const chosen = profile.interests[0] || "Board games";
        setInterest(chosen);
        setTemplate(baitIdeas[chosen].template);
        setSavedNotes(profile.markdown);
        setNotes(plainNotes(profile.markdown));
      })
      .catch(() => {
        if (active) setNotesError(true);
      })
      .finally(() => {
        if (active) setLoadingNotes(false);
      });
    return () => {
      active = false;
    };
  }, [targetId, leagueId, waiting, retry, request]);

  const run = async (name: string, action: () => Promise<void>) => {
    setWorking(name);
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "That didn't work. Please try again.",
      );
    } finally {
      setWorking(null);
    }
  };
  if (!state) return <Welcome />;
  if (waiting)
    return (
      <View style={{ gap: 16 }}>
        <Empty icon="clock" title="Waiting for a fishing buddy">
          Invite someone to this league. You can choose bait once you're paired.
        </Empty>
        <Button onPress={() => router.push("/league")}>Open League</Button>
      </View>
    );
  if (!state.consent.acceptedAt && state.role !== "operator")
    return (
      <View style={{ gap: 16 }}>
        <Empty title="Join in first">
          Head Home to accept your invitation and choose how you'd like to play.
        </Empty>
        <Button onPress={() => router.push("/")}>Go Home</Button>
      </View>
    );

  const enabledChannels = enabledKey.split(",").filter(Boolean) as Channel[];
  const difficulty = league?.settings.difficulty ?? "standard";
  const budget = difficulty === "rookie" ? 5 : difficulty === "expert" ? 1 : 3;
  const attemptsLeft = Math.max(0, budget - (draft?.generationAttempts ?? 0));
  const generating = draft?.generationStatus === "pending";
  const locked = !!draft?.locked || state.match.state !== "drafting";
  const disabled = !!working || busy || generating;
  const key =
    channel === "email"
      ? "bodyText"
      : channel === "sms"
        ? "smsText"
        : "voiceScript";
  const max = channel === "email" ? 700 : channel === "sms" ? 300 : 440;
  const min = channel === "email" ? 20 : channel === "sms" ? 15 : 40;
  const valid =
    !!content &&
    content[key].length >= min &&
    content[key].length <= max &&
    content.subject.length >= 3;
  const unfinished = state.drafts.some((item) => !item.locked);
  const readyCount = state.drafts.filter((item) => item.locked).length;
  const chooseChannel = (next: Channel) => {
    setChannel(next);
    setEditing(false);
    setError(null);
    const existing = state.drafts.find((item) => item.channel === next);
    setStep(existing ? "review" : "choose");
  };
  const createMessage = () =>
    void run("create", async () => {
      const profile = await request<ScoutingProfile>(
        `/api/scouting/${encodeURIComponent(state.opponent.id)}`,
        { interests: [interest], markdown: notesEdited ? notes : savedNotes },
        "PUT",
      );
      setSavedNotes(profile.markdown);
      setNotesEdited(false);
      await request("/api/drafts/generate", {
        recipientMemberId: state.opponent.id,
        channel,
        interest,
        templateId: template,
      });
    });
  const useBait = () =>
    void run("save", async () => {
      if (!draft || !content || !valid) return;
      if (dirty) {
        await request(
          `/api/drafts/${draft.id}`,
          {
            subject: content.subject,
            bodyText: content.bodyText,
            smsText: content.smsText,
            voiceScript: content.voiceScript,
          },
          "PATCH",
        );
        setDirty(false);
      }
      await request(`/api/drafts/${draft.id}/lock`, {});
      setEditing(false);
      setStep("ready");
    });

  return (
    <View
      style={{ width: "100%", maxWidth: 760, alignSelf: "center", gap: 18 }}
    >
      <Title>Bait for {state.opponent.name}</Title>
      <Row style={{ gap: 8, marginBottom: 4 }}>
        {(["choose", "review", "ready"] as Step[]).map((item, index) => (
          <View key={item} style={{ flex: 1, gap: 9 }}>
            <View
              style={{
                height: 3,
                borderRadius: 3,
                backgroundColor:
                  index <= ["choose", "review", "ready"].indexOf(step)
                    ? C.teal
                    : C.border,
              }}
            />
            <Txt
              style={{
                fontSize: 12,
                fontWeight: step === item ? "700" : "400",
                color: step === item ? C.text : C.muted,
              }}
            >
              {index + 1}.{" "}
              {item === "choose"
                ? "Choose bait"
                : item === "review"
                  ? "Review message"
                  : "Ready"}
            </Txt>
          </View>
        ))}
      </Row>
      {!!error && (
        <Card style={{ borderColor: C.coral }}>
          <Txt style={{ color: C.coral, lineHeight: 21 }}>{error}</Txt>
          <Txt muted style={{ fontSize: 12, marginTop: 8 }}>
            Your saved bait is safe. Adjust the message or try the action again.
          </Txt>
        </Card>
      )}

      {step !== "ready" && (
        <Row style={{ flexWrap: "wrap", gap: 8 }}>
          {enabledChannels.map((item) => (
            <Pressable
              key={item}
              accessibilityRole="radio"
              accessibilityLabel={`${channelNames[item]} bait`}
              aria-checked={channel === item}
              accessibilityState={{
                checked: channel === item,
                disabled: disabled || dirty,
              }}
              disabled={disabled || dirty}
              onPress={() => chooseChannel(item)}
              style={{
                minHeight: 44,
                paddingHorizontal: 17,
                borderRadius: 24,
                borderWidth: 1,
                borderColor: channel === item ? C.teal : C.border,
                backgroundColor: channel === item ? C.tealDark : C.panel,
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
              }}
            >
              <Icon
                name={item === "email" ? "mail" : item}
                size={16}
                color={channel === item ? C.teal : C.muted}
              />
              <Txt
                style={{
                  fontSize: 13,
                  color: channel === item ? C.teal : C.muted,
                }}
              >
                {channelNames[item]}
              </Txt>
              {state.drafts.find((candidate) => candidate.channel === item)
                ?.locked && <Icon name="check" size={13} color={C.teal} />}
            </Pressable>
          ))}
        </Row>
      )}

      {step === "choose" && (
        <Card style={{ gap: 16 }}>
          <Row style={{ justifyContent: "space-between" }}>
            <View style={{ flex: 1, gap: 6 }}>
              <Txt style={{ fontSize: 22, fontWeight: "800" }}>
                What would they bite on?
              </Txt>
            </View>
            <Hook size={47} />
          </Row>
          {loadingNotes ? (
            <Txt muted>Loading your saved ideas…</Txt>
          ) : notesError ? (
            <View style={{ gap: 12 }}>
              <Txt muted>We couldn't load your saved ideas.</Txt>
              <Button
                variant="secondary"
                onPress={() => setRetry((value) => value + 1)}
              >
                Try again
              </Button>
            </View>
          ) : (
            <>
              <View style={{ gap: 10 }}>
                {interests.map((item) => (
                  <Pressable
                    key={item}
                    accessibilityRole="radio"
                    aria-checked={interest === item}
                    accessibilityState={{
                      checked: interest === item,
                      disabled: disabled || locked,
                    }}
                    accessibilityLabel={item}
                    disabled={disabled || locked}
                    onPress={() => {
                      setInterest(item);
                      setTemplate(baitIdeas[item].template);
                    }}
                    style={{
                      padding: 16,
                      minHeight: 56,
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: interest === item ? C.teal : C.border,
                      backgroundColor:
                        interest === item ? C.tealDark : C.panelDeep,
                    }}
                  >
                    <Row style={{ justifyContent: "space-between" }}>
                      <Txt style={{ fontWeight: "700", fontSize: 14 }}>
                        {item}
                      </Txt>
                      <Icon
                        name={interest === item ? "check" : "arrow"}
                        color={interest === item ? C.teal : C.muted}
                        size={18}
                      />
                    </Row>
                  </Pressable>
                ))}
              </View>
              <View>
                <Disclosure
                  label="Add a personal touch (optional)"
                  open={personalOpen}
                  onPress={() => setPersonalOpen(!personalOpen)}
                />
                {personalOpen && (
                  <Field
                    label={`A little about ${state.opponent.name}`}
                    value={notes}
                    onChangeText={(value) => {
                      if (disabled) return;
                      setNotes(value);
                      setNotesEdited(true);
                    }}
                    multiline
                    maxLength={1800}
                    placeholder="They love a relaxed game night with friends."
                    help="A hobby or friendly detail is plenty. Saved when you create the message."
                  />
                )}
              </View>
              <Button
                icon="sparkle"
                loading={working === "create" || generating}
                disabled={disabled || locked || attemptsLeft === 0}
                onPress={createMessage}
              >
                {generating ? "Creating your message…" : "Create message"}
              </Button>
              {attemptsLeft === 0 && (
                <Txt muted style={{ fontSize: 12, lineHeight: 20 }}>
                  You've used all your new versions. You can still edit the
                  message you have.
                </Txt>
              )}
              {!!draft && !generating && (
                <Button variant="ghost" onPress={() => setStep("review")}>
                  Back to your message
                </Button>
              )}
              <View>
                <Disclosure
                  label="More options"
                  open={optionsOpen}
                  onPress={() => setOptionsOpen(!optionsOpen)}
                />
                {optionsOpen && (
                  <View style={{ gap: 12, paddingTop: 6 }}>
                    <Label>Message idea</Label>
                    <Row style={{ flexWrap: "wrap", gap: 8 }}>
                      {templates.map((item) => (
                        <Button
                          small
                          key={item.id}
                          variant={
                            template === item.id ? "primary" : "secondary"
                          }
                          disabled={disabled || locked}
                          onPress={() => setTemplate(item.id)}
                        >
                          {item.title}
                        </Button>
                      ))}
                    </Row>
                    <Txt muted style={{ fontSize: 12 }}>
                      {attemptsLeft} new{" "}
                      {attemptsLeft === 1 ? "version" : "versions"} remaining
                      for this {channelNames[channel].toLowerCase()}.
                    </Txt>
                  </View>
                )}
              </View>
            </>
          )}
          {!unfinished && (
            <Button
              variant="ghost"
              disabled={disabled}
              onPress={() => setStep("ready")}
            >
              Use prepared messages instead
            </Button>
          )}
        </Card>
      )}

      {step === "review" && content && (
        <Card style={{ gap: 18 }}>
          <Row style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
            <Txt style={{ fontSize: 22, fontWeight: "800" }}>
              How does this look?
            </Txt>
            {locked ? (
              <Badge>Ready</Badge>
            ) : (
              <Button
                small
                variant="ghost"
                disabled={disabled}
                onPress={() => setEditing(!editing)}
              >
                {editing ? "Done editing" : "Edit"}
              </Button>
            )}
          </Row>
          {editing && !locked ? (
            <View style={{ gap: 14 }}>
              {channel === "email" && (
                <Field
                  label="Subject"
                  value={content.subject}
                  maxLength={100}
                  onChangeText={(value) => {
                    if (disabled) return;
                    setContent({ ...content, subject: value });
                    setDirty(true);
                  }}
                />
              )}
              <Field
                label={channel === "voice" ? "What the call says" : "Message"}
                value={content[key]}
                multiline
                maxLength={max}
                onChangeText={(value) => {
                  if (disabled) return;
                  setContent({ ...content, [key]: value });
                  setDirty(true);
                }}
                help={`Keep the fictional sender and suspicious detail intact. At least ${min} characters.`}
              />
              {dirty && (
                <Button
                  small
                  variant="ghost"
                  disabled={disabled}
                  onPress={() => {
                    setContent(draft?.content ?? null);
                    setDirty(false);
                    setEditing(false);
                  }}
                >
                  Undo edits
                </Button>
              )}
            </View>
          ) : (
            <View
              style={{
                padding: 20,
                gap: 18,
                borderRadius: 12,
                backgroundColor: C.panelDeep,
                borderWidth: 1,
                borderColor: C.border,
              }}
            >
              <Row>
                <Icon
                  name={channel === "email" ? "mail" : channel}
                  color={C.teal}
                />
                <View style={{ flex: 1, gap: 4 }}>
                  <Txt style={{ fontWeight: "700", fontSize: 13 }}>
                    {content.senderDisplayName}
                  </Txt>
                  <Txt muted style={{ fontSize: 11 }}>
                    {channelNames[channel]} for {state.opponent.name}
                  </Txt>
                </View>
              </Row>
              {channel === "email" && (
                <Txt
                  style={{ fontSize: 19, fontWeight: "700", lineHeight: 26 }}
                >
                  {content.subject}
                </Txt>
              )}
              <Txt style={{ fontSize: 15, lineHeight: 26 }}>{content[key]}</Txt>
            </View>
          )}
          {!locked ? (
            <>
              <Button
                icon="check"
                loading={working === "save"}
                disabled={disabled || !valid}
                onPress={useBait}
              >
                Use this bait
              </Button>
              <Txt muted style={{ fontSize: 12, textAlign: "center" }}>
                Saves your changes and makes this message ready.
              </Txt>
              <Button
                variant="ghost"
                disabled={disabled || dirty}
                onPress={() => setStep("choose")}
              >
                Try another idea
              </Button>
            </>
          ) : (
            <>
              <Txt muted style={{ lineHeight: 21 }}>
                This bait is saved and ready. It can't be changed now.
              </Txt>
              <Button onPress={() => setStep("ready")}>Continue</Button>
            </>
          )}
          <View>
            <Disclosure
              label="Message details"
              open={detailsOpen}
              onPress={() => setDetailsOpen(!detailsOpen)}
            />
            {detailsOpen && (
              <View style={{ gap: 10, paddingTop: 8 }}>
                <Label>
                  {draft?.source === "gemini"
                    ? "Created for you"
                    : "Prepared message"}
                </Label>
                {!!draft?.generationReason && (
                  <Txt muted style={{ fontSize: 12, lineHeight: 19 }}>
                    {draft.generationReason
                      .replace(/playbook/gi, "message")
                      .replace(/scouting/gi, "personal")}
                  </Txt>
                )}
                <Divider />
                <Label>Why it's bait</Label>
                {content.cueAnnotations.map((cue, index) => (
                  <Txt
                    key={index}
                    muted
                    style={{ fontSize: 12, lineHeight: 20 }}
                  >
                    {cue}
                  </Txt>
                ))}
                <Txt muted style={{ fontSize: 12, lineHeight: 20 }}>
                  {content.explanation}
                </Txt>
              </View>
            )}
          </View>
        </Card>
      )}

      {step === "ready" && (
        <Card style={{ gap: 20 }}>
          <View style={{ alignItems: "center", gap: 12, paddingVertical: 9 }}>
            <Hook size={62} />
            <Txt
              style={{ fontSize: 25, fontWeight: "800", textAlign: "center" }}
            >
              {state.match.state === "drafting"
                ? "Ready to cast?"
                : state.match.state === "active"
                  ? "Your bait is in the water."
                  : "This round is finished."}
            </Txt>
            <Txt muted style={{ textAlign: "center", lineHeight: 21 }}>
              {state.match.state === "drafting"
                ? `${readyCount} ${readyCount === 1 ? "message" : "messages"} ready. We'll fill any empty spots with prepared messages.`
                : "Open your inbox to see what came your way."}
            </Txt>
          </View>
          <View>
            {enabledChannels.map((item) => {
              const candidate = state.drafts.find(
                (value) => value.channel === item,
              );
              return (
                <View
                  key={item}
                  style={{
                    borderTopWidth: 1,
                    borderColor: C.border,
                    paddingVertical: 14,
                  }}
                >
                  <Row style={{ justifyContent: "space-between" }}>
                    <Row>
                      <Icon
                        name={item === "email" ? "mail" : item}
                        color={candidate?.locked ? C.teal : C.muted}
                      />
                      <View style={{ gap: 4 }}>
                        <Txt style={{ fontWeight: "700" }}>
                          {channelNames[item]}
                        </Txt>
                        <Txt muted style={{ fontSize: 12 }}>
                          {candidate?.locked
                            ? "Your bait is ready"
                            : candidate
                              ? "Needs your review"
                              : "Prepared message"}
                        </Txt>
                      </View>
                    </Row>
                    {candidate || state.match.state === "drafting" ? (
                      <Button
                        small
                        variant="ghost"
                        disabled={disabled}
                        onPress={() => chooseChannel(item)}
                      >
                        {candidate?.locked
                          ? "View"
                          : candidate
                            ? "Finish"
                            : "Add your own"}
                      </Button>
                    ) : (
                      <Icon name="check" color={C.teal} size={17} />
                    )}
                  </Row>
                </View>
              );
            })}
          </View>
          {state.match.state === "drafting" ? (
            <>
              <Button
                icon="arrow"
                disabled={disabled || unfinished}
                loading={working === "start"}
                onPress={() =>
                  void run("start", async () => {
                    await request("/api/match/activate", {});
                    router.push("/activity");
                  })
                }
              >
                Start fishing
              </Button>
              {unfinished && (
                <Txt muted style={{ fontSize: 12, lineHeight: 20 }}>
                  Finish reviewing your messages before you start.
                </Txt>
              )}
              <Txt
                muted
                style={{ fontSize: 11, textAlign: "center", lineHeight: 18 }}
              >
                Prepared messages keep the round moving. Only bait you create
                can earn you a catch.
              </Txt>
            </>
          ) : (
            <Button icon="arrow" onPress={() => router.push("/activity")}>
              Open Inbox
            </Button>
          )}
        </Card>
      )}
    </View>
  );
}
