import React, { useEffect, useState } from "react";
import { Pressable, View, useWindowDimensions } from "react-native";
import { router } from "expo-router";
import {
  interests,
  type ApprovedContent,
  type Channel,
  type Interest,
} from "@fp/shared";
import { useSession, safely } from "../src/session";
import {
  Avatar,
  Badge,
  Button,
  C,
  Card,
  Divider,
  Empty,
  Field,
  Icon,
  Label,
  Row,
  Title,
  Txt,
} from "../src/ui";
import { Welcome } from "./index";
const templates = [
  {
    id: "ticket-drop",
    title: "The ticket drop",
    body: "A very tempting invitation from a fictional music venue.",
    icon: "sms",
  },
  {
    id: "parcel-update",
    title: "The delivery detour",
    body: "A fictional parcel takes an unexpected turn.",
    icon: "mail",
  },
  {
    id: "game-night",
    title: "The guest-list shuffle",
    body: "A familiar hobby. An unfamiliar change to a walk reminder.",
    icon: "voice",
  },
];
export default function Draft() {
  const { state, busy, request } = useSession();
  const wide = useWindowDimensions().width >= 1100;
  const [channel, setChannel] = useState<Channel>("email"),
    [interest, setInterest] = useState<Interest>("Board games"),
    [template, setTemplate] = useState("parcel-update"),
    [content, setContent] = useState<ApprovedContent | null>(null),
    [dirty, setDirty] = useState(false),
    [preview, setPreview] = useState(false);
  const draft = state?.drafts.find((d) => d.channel === channel);
  useEffect(() => {
    setContent(draft?.content ?? null);
    setDirty(false);
  }, [
    draft?.id,
    draft?.content.subject,
    draft?.content.bodyText,
    draft?.content.smsText,
    draft?.content.voiceScript,
  ]);
  useEffect(() => {
    if (state?.opponent.interests.length)
      setInterest(state.opponent.interests[0]);
  }, [state?.opponent.id]);
  if (!state) return <Welcome />;
  if (!state.consent.acceptedAt && state.role !== "operator")
    return (
      <Empty title="Accept the invitation first">
        Head to Matchup to choose your channels and join the league.
      </Empty>
    );
  const generating = draft?.generationStatus === "pending";
  const key =
    channel === "email"
      ? "bodyText"
      : channel === "sms"
        ? "smsText"
        : "voiceScript";
  const max = channel === "email" ? 700 : channel === "sms" ? 300 : 440;
  const min = channel === "email" ? 20 : channel === "sms" ? 15 : 40;
  const valid =
    content &&
    content[key].length >= min &&
    content[key].length <= max &&
    content.subject.length >= 3;
  const locked = draft?.locked || state.match.state !== "drafting";
  const source =
    draft?.source === "gemini"
      ? "GEMINI GENERATED"
      : draft?.source === "fallback"
        ? "REVIEWED FALLBACK"
        : "CURATED FIXTURE";
  return (
    <View>
      <Title
        kicker="A LITTLE CREATIVE MISCHIEF"
        sub={`Personalize a harmless phishing challenge for ${state.opponent.name}. The game owns the answer; you bring the personality.`}
      >
        Set the bait.
      </Title>
      <View style={{ flexDirection: wide ? "row" : "column", gap: 22 }}>
        <View style={{ flex: wide ? 1.13 : undefined, width: "100%", gap: 20 }}>
          <Card>
            <Row style={{ justifyContent: "space-between" }}>
              <Label>01 / Choose a channel</Label>
              <Badge>{state.draftProgress.mine} / 3 LOCKED</Badge>
            </Row>
            <Row style={{ marginTop: 19, gap: 10 }}>
              {(["email", "sms", "voice"] as Channel[]).map((c) => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Draft ${c} challenge`}
                  key={c}
                  onPress={() => {
                    setChannel(c);
                    setPreview(false);
                  }}
                  style={{
                    flex: 1,
                    borderRadius: 11,
                    borderWidth: 1,
                    borderColor: channel === c ? C.teal : C.border,
                    backgroundColor: channel === c ? C.tealDark : C.panelDeep,
                    paddingVertical: 18,
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <Icon
                    name={c === "email" ? "mail" : c}
                    color={channel === c ? C.teal : C.muted}
                    size={22}
                  />
                  <Txt
                    style={{
                      fontSize: 12,
                      fontWeight: "700",
                      color: channel === c ? C.teal : C.muted,
                    }}
                  >
                    {c === "sms" ? "SMS" : c[0].toUpperCase() + c.slice(1)}
                  </Txt>
                  {state.drafts.find((d) => d.channel === c)?.locked && (
                    <Icon name="check" color={C.teal} size={12} />
                  )}
                </Pressable>
              ))}
            </Row>
          </Card>
          <Card>
            <Label>02 / Make it their kind of bait</Label>
            <Row style={{ marginTop: 16 }}>
              <Avatar name={state.opponent.name} color={C.coral} size={36} />
              <View>
                <Txt style={{ fontSize: 13, fontWeight: "700" }}>
                  {state.opponent.name}’s interests
                </Txt>
                <Txt muted style={{ fontSize: 11, marginTop: 4 }}>
                  Selected by them. No internet sleuthing.
                </Txt>
              </View>
            </Row>
            <Row style={{ flexWrap: "wrap", marginTop: 18, gap: 8 }}>
              {(state.opponent.interests.length
                ? state.opponent.interests
                : interests
              ).map((item) => (
                <Button
                  key={item}
                  small
                  disabled={locked || generating}
                  variant={interest === item ? "primary" : "secondary"}
                  onPress={() => setInterest(item)}
                >
                  {item}
                </Button>
              ))}
            </Row>
            <Divider />
            <Label>03 / Pick the premise</Label>
            <View style={{ gap: 10, marginTop: 15 }}>
              {templates.map((t) => (
                <Pressable
                  key={t.id}
                  accessibilityRole="radio"
                  accessibilityState={{
                    checked: template === t.id,
                    disabled: locked || generating,
                  }}
                  disabled={locked || generating}
                  onPress={() => setTemplate(t.id)}
                  style={{
                    borderWidth: 1,
                    borderColor: template === t.id ? C.teal : C.border,
                    borderRadius: 11,
                    padding: 14,
                    backgroundColor:
                      template === t.id ? "#203934" : C.panelDeep,
                  }}
                >
                  <Row>
                    <View
                      style={{
                        height: 16,
                        width: 16,
                        borderWidth: 1,
                        borderColor: template === t.id ? C.teal : C.muted,
                        borderRadius: 10,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {template === t.id && (
                        <View
                          style={{
                            width: 8,
                            height: 8,
                            backgroundColor: C.teal,
                            borderRadius: 8,
                          }}
                        />
                      )}
                    </View>
                    <View style={{ flex: 1, gap: 5 }}>
                      <Txt style={{ fontSize: 13, fontWeight: "700" }}>
                        {t.title}
                      </Txt>
                      <Txt muted style={{ fontSize: 11, lineHeight: 17 }}>
                        {t.body}
                      </Txt>
                    </View>
                  </Row>
                </Pressable>
              ))}
            </View>
            <Button
              style={{ marginTop: 20 }}
              icon="sparkle"
              loading={generating || busy}
              disabled={locked || (draft?.generationAttempts ?? 0) >= 3}
              onPress={() =>
                void safely(
                  request("/api/drafts/generate", {
                    recipientMemberId: state.opponent.id,
                    channel,
                    interest,
                    templateId: template,
                  }),
                )
              }
            >
              {generating
                ? "Writing your challenge…"
                : draft?.generationAttempts
                  ? "Regenerate challenge"
                  : "Generate challenge"}
            </Button>
            <Txt muted style={{ fontSize: 10, lineHeight: 17, marginTop: 12 }}>
              {locked
                ? "This lineup is locked. Approved content is immutable."
                : `${draft?.generationAttempts ?? 0} of 3 generation attempts used. With no Gemini key, a reviewed fixture is ready in seconds.`}
            </Txt>
            {draft?.generationReason && (
              <Txt
                style={{
                  fontSize: 11,
                  lineHeight: 18,
                  marginTop: 10,
                  color: C.gold,
                }}
              >
                {draft.generationReason}
              </Txt>
            )}
          </Card>
        </View>
        <View style={{ flex: wide ? 1.25 : undefined, width: "100%", gap: 20 }}>
          <Card style={{ borderColor: "#3A5553", padding: 24 }}>
            <Row style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
              <Label color={C.teal}>04 / The author’s workbench</Label>
              {draft && (
                <Badge color={draft.source === "gemini" ? C.teal : C.gold}>
                  {source}
                </Badge>
              )}
            </Row>
            {content ? (
              <>
                <Row
                  style={{
                    marginTop: 16,
                    marginBottom: 18,
                    justifyContent: "space-between",
                  }}
                >
                  <Txt style={{ fontSize: 20, fontWeight: "700" }}>
                    {locked
                      ? "Locked & loaded."
                      : preview
                        ? "A sneak peek."
                        : "Make it convincing."}
                  </Txt>
                  <Button
                    small
                    variant="ghost"
                    icon={preview ? "draft" : "eye"}
                    disabled={locked}
                    onPress={() => setPreview(!preview)}
                  >
                    {preview ? "Edit" : "Preview"}
                  </Button>
                </Row>
                {locked || preview ? (
                  <View
                    style={{
                      backgroundColor: C.panelDeep,
                      borderRadius: 12,
                      padding: 20,
                      gap: 15,
                    }}
                  >
                    <Row>
                      <Icon
                        name={channel === "email" ? "mail" : channel}
                        color={C.teal}
                      />
                      <View style={{ flex: 1 }}>
                        <Txt style={{ fontWeight: "700", fontSize: 13 }}>
                          {content.senderDisplayName}
                        </Txt>
                        <Txt muted style={{ fontSize: 10, marginTop: 4 }}>
                          Fictional {channel} · author preview
                        </Txt>
                      </View>
                    </Row>
                    {channel === "email" && (
                      <Txt
                        style={{
                          fontSize: 19,
                          fontWeight: "700",
                          lineHeight: 26,
                        }}
                      >
                        {content.subject}
                      </Txt>
                    )}
                    <Txt style={{ fontSize: 14, lineHeight: 25 }}>
                      {content[key]}
                    </Txt>
                    <Badge outline>
                      Application-owned response link added by the server
                    </Badge>
                  </View>
                ) : (
                  <View style={{ gap: 8 }}>
                    {channel === "email" && (
                      <Field
                        label="Subject"
                        value={content.subject}
                        maxLength={100}
                        onChangeText={(v) => {
                          setContent({ ...content, subject: v });
                          setDirty(true);
                        }}
                      />
                    )}
                    <Field
                      label={
                        channel === "voice"
                          ? "Synthetic voice script"
                          : channel === "sms"
                            ? "Message"
                            : "Email body"
                      }
                      multiline
                      maxLength={max}
                      value={content[key]}
                      help={`Minimum ${min} characters. Fictional themes only; links and destinations are set by the server.`}
                      onChangeText={(v) => {
                        setContent({ ...content, [key]: v });
                        setDirty(true);
                      }}
                    />
                  </View>
                )}
                <View
                  style={{
                    padding: 16,
                    borderLeftWidth: 2,
                    borderLeftColor: C.coral,
                    backgroundColor: "#2D2B2D",
                    marginTop: 21,
                    borderRadius: 5,
                    gap: 9,
                  }}
                >
                  <Label color={C.coral}>
                    THE TEACHING CUE · ONLY YOU SEE THIS
                  </Label>
                  {content.cueAnnotations.map((cue, i) => (
                    <Txt
                      key={i}
                      style={{ fontSize: 12, lineHeight: 20, color: "#E9CBC1" }}
                    >
                      {cue}
                    </Txt>
                  ))}
                  <Txt muted style={{ fontSize: 11, lineHeight: 19 }}>
                    {content.explanation}
                  </Txt>
                </View>
                <Row style={{ marginTop: 20, flexWrap: "wrap" }}>
                  {!locked && (
                    <Button
                      variant="secondary"
                      disabled={!dirty || !valid || generating}
                      loading={busy}
                      onPress={() =>
                        void safely(
                          request(
                            `/api/drafts/${draft?.id}`,
                            {
                              subject: content.subject,
                              bodyText: content.bodyText,
                              smsText: content.smsText,
                              voiceScript: content.voiceScript,
                            },
                            "PATCH",
                          ).then(() => setDirty(false)),
                        )
                      }
                    >
                      Validate & save
                    </Button>
                  )}
                  <Button
                    style={{ flex: 1 }}
                    icon="check"
                    disabled={locked || dirty || !valid || generating}
                    loading={busy}
                    onPress={() =>
                      void safely(request(`/api/drafts/${draft?.id}/lock`, {}))
                    }
                  >
                    {locked ? "Challenge locked" : "Lock this challenge"}
                  </Button>
                </Row>
                {dirty && (
                  <Txt style={{ fontSize: 11, marginTop: 10, color: C.gold }}>
                    Save your changes before locking the challenge.
                  </Txt>
                )}
              </>
            ) : (
              <View
                style={{ paddingVertical: 48, alignItems: "center", gap: 16 }}
              >
                <Icon name="draft" size={42} color={C.teal} />
                <Txt style={{ fontSize: 18, fontWeight: "700" }}>
                  Your next brilliant bad idea.
                </Txt>
                <Txt
                  muted
                  style={{ fontSize: 12, lineHeight: 21, textAlign: "center" }}
                >
                  Pick a channel and a premise, then generate.{`\n`}You can edit
                  and preview before locking it in.
                </Txt>
              </View>
            )}
          </Card>
          <Card>
            <Label>Ready to make some waves?</Label>
            <Txt muted style={{ fontSize: 12, lineHeight: 20, marginTop: 11 }}>
              Lock all three channels before starting. Any missing challenges
              are filled with curated platform content and earn no author bonus.
            </Txt>
            <Button
              variant="secondary"
              disabled={state.match.state !== "drafting"}
              loading={busy}
              icon="arrow"
              style={{ marginTop: 17 }}
              onPress={() =>
                void safely(
                  request("/api/match/activate", {}).then(() =>
                    router.push("/activity"),
                  ),
                )
              }
            >
              {state.match.state === "drafting"
                ? "Start match · fill any missing drafts"
                : "Match has started"}
            </Button>
          </Card>
        </View>
      </View>
    </View>
  );
}
