import React, { useEffect, useState } from "react";
import { Pressable, View, useWindowDimensions } from "react-native";
import { router } from "expo-router";
import type { ScenarioPublic } from "@fp/shared";
import { useSession, safely } from "../src/session";
import {
  Avatar,
  Badge,
  Button,
  C,
  Card,
  Divider,
  Empty,
  Hook,
  Icon,
  Label,
  RevealMotion,
  Row,
  Title,
  Txt,
} from "../src/ui";
import { ActivityCard, Welcome } from "./index";
function Message({ scenario }: { scenario: ScenarioPublic }) {
  const { state, request, busy } = useSession();
  const [inspect, setInspect] = useState(false),
    [answered, setAnswered] = useState(false);
  const voice = scenario.channel === "voice";
  const reveal = scenario.reveal;
  const decision = scenario.decision;
  const [confirm, setConfirm] = useState<"trust" | "flag" | null>(null);
  return (
    <Card style={{ padding: 0, overflow: "hidden" }}>
      <View
        style={{
          padding: 19,
          backgroundColor: "#203039",
          borderBottomWidth: 1,
          borderBottomColor: C.border,
        }}
      >
        <Row style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
          <Row style={{ gap: 9 }}>
            <Icon
              name={scenario.channel === "email" ? "mail" : scenario.channel}
              color={C.teal}
            />
            <Label color={C.teal}>
              {scenario.channel === "email"
                ? "Email inbox"
                : scenario.channel === "sms"
                  ? "Text messages"
                  : "Incoming call"}
            </Label>
          </Row>
          <Badge>
            {state?.mode === "demo" ? "SIMULATED DELIVERY" : "IN-APP RESPONSE"}
          </Badge>
        </Row>
      </View>
      <View style={{ padding: 24 }}>
        {scenario.channel === "email" ? (
          <View>
            <Row style={{ alignItems: "flex-start" }}>
              <Avatar
                name={scenario.content.senderDisplayName}
                size={37}
                color={C.gold}
              />
              <View style={{ flex: 1, gap: 5 }}>
                <Txt style={{ fontSize: 13, fontWeight: "700" }}>
                  {scenario.content.senderDisplayName}
                </Txt>
                <Txt muted style={{ fontSize: 10 }}>
                  to {state?.me.name} ·{" "}
                  {new Date(
                    scenario.releasedAt ?? Date.now(),
                  ).toLocaleTimeString([], {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </Txt>
              </View>
            </Row>
            <Txt
              style={{
                fontSize: 23,
                fontWeight: "700",
                letterSpacing: -0.5,
                lineHeight: 29,
                marginTop: 24,
              }}
            >
              {scenario.content.subject}
            </Txt>
            <Divider />
            <Txt style={{ fontSize: 15, lineHeight: 27 }}>
              {scenario.content.bodyText}
            </Txt>
            <Button
              small
              variant="ghost"
              style={{ alignSelf: "flex-start", marginTop: 12 }}
              icon="eye"
              onPress={() => setInspect(true)}
            >
              Inspect response destination
            </Button>
          </View>
        ) : scenario.channel === "sms" ? (
          <View>
            <View style={{ alignItems: "center", gap: 8, marginBottom: 24 }}>
              <Avatar
                name={scenario.content.senderDisplayName}
                size={49}
                color={C.teal}
              />
              <Txt style={{ fontSize: 14, fontWeight: "700" }}>
                {scenario.content.senderDisplayName}
              </Txt>
              <Txt muted style={{ fontSize: 10 }}>
                Fictional text conversation
              </Txt>
            </View>
            <View
              style={{
                alignSelf: "flex-start",
                backgroundColor: "#304049",
                padding: 18,
                borderRadius: 19,
                borderBottomLeftRadius: 4,
                maxWidth: 400,
              }}
            >
              <Txt style={{ fontSize: 15, lineHeight: 26 }}>
                {scenario.content.smsText}
              </Txt>
            </View>
            <Txt muted style={{ fontSize: 10, marginTop: 10 }}>
              {new Date(scenario.releasedAt ?? Date.now()).toLocaleTimeString(
                [],
                { hour: "numeric", minute: "2-digit" },
              )}{" "}
              ·{" "}
              {state?.mode === "demo"
                ? "Simulated message"
                : "Response preview"}
            </Txt>
          </View>
        ) : (
          <View style={{ alignItems: "center", gap: 13 }}>
            <View
              style={{
                padding: 24,
                borderRadius: 80,
                backgroundColor: "#263E43",
                marginTop: 4,
              }}
            >
              <Icon name="voice" size={32} color={C.teal} />
            </View>
            <Txt
              style={{ fontSize: 23, fontWeight: "700", textAlign: "center" }}
            >
              {scenario.content.senderDisplayName}
            </Txt>
            <Txt muted style={{ fontSize: 12 }}>
              {decision
                ? "Call reviewed"
                : answered
                  ? "Connected · transcript mode"
                  : scenario.deliveryStatus === "unanswered"
                    ? "Call ignored · 0 points"
                    : "Synthetic stock voice · fictional caller"}
            </Txt>
            {!answered && !decision ? (
              <Row
                style={{ marginTop: 14, marginBottom: 18, flexWrap: "wrap" }}
              >
                <Button icon="voice" onPress={() => setAnswered(true)}>
                  Answer call
                </Button>
                <Button
                  variant="coral"
                  icon="close"
                  loading={busy}
                  onPress={() =>
                    void safely(
                      request(`/api/scenarios/${scenario.id}/ignore`, {}),
                    )
                  }
                >
                  Ignore
                </Button>
              </Row>
            ) : (
              <View style={{ width: "100%", gap: 13, marginTop: 12 }}>
                <Badge color={C.gold}>
                  TRANSCRIPT · AUDIO NOT AVAILABLE IN THIS DEMO
                </Badge>
                <View
                  style={{
                    backgroundColor: C.panelDeep,
                    padding: 19,
                    borderRadius: 12,
                  }}
                >
                  <Txt style={{ fontSize: 15, lineHeight: 27 }}>
                    {scenario.content.voiceScript}
                  </Txt>
                </View>
                <Txt muted style={{ fontSize: 11, lineHeight: 19 }}>
                  The caller’s words above are the approved script. No recipient
                  recording or transcription takes place.
                </Txt>
              </View>
            )}
          </View>
        )}
        <Divider />
        <Button
          small
          variant="ghost"
          icon="eye"
          onPress={() => setInspect(!inspect)}
        >
          {inspect ? "Hide message details" : "Inspect sender & destination"}
        </Button>
        {inspect && (
          <View
            style={{
              backgroundColor: C.panelDeep,
              borderRadius: 9,
              padding: 16,
              gap: 10,
              marginTop: 13,
            }}
          >
            <View style={{ gap: 5 }}>
              <Label>Sender</Label>
              <Txt style={{ fontSize: 12, lineHeight: 19 }}>
                {scenario.inspection.sender}
              </Txt>
            </View>
            <View style={{ gap: 5 }}>
              <Label>Action destination</Label>
              <Txt style={{ fontSize: 11, lineHeight: 19 }}>
                {scenario.inspection.destination}
              </Txt>
            </View>
            <Txt muted style={{ fontSize: 10, lineHeight: 17 }}>
              Inspection never submits a decision. Compare these details with
              your activity card.
            </Txt>
          </View>
        )}
        {!decision && (!voice || answered) && (
          <View style={{ marginTop: 22, gap: 12 }}>
            <Label>What’s your call?</Label>
            <Txt muted style={{ fontSize: 12, lineHeight: 20 }}>
              Trust an expected message, or flag a phishing challenge. Your
              submitted decision locks the answer.
            </Txt>
            {voice ? (
              <Row style={{ flexWrap: "wrap" }}>
                <Button
                  style={{ flex: 1 }}
                  icon="check"
                  loading={busy}
                  onPress={() => setConfirm("trust")}
                >
                  1 · Trust
                </Button>
                <Button
                  style={{ flex: 1 }}
                  variant="coral"
                  icon="shield"
                  loading={busy}
                  onPress={() => setConfirm("flag")}
                >
                  2 · Flag
                </Button>
                <Button
                  small
                  variant="secondary"
                  onPress={() =>
                    void safely(request("/api/pause", { paused: true }))
                  }
                >
                  9 · Pause contact
                </Button>
              </Row>
            ) : (
              <Row>
                <Button
                  style={{ flex: 1 }}
                  icon="check"
                  loading={busy}
                  onPress={() => setConfirm("trust")}
                >
                  Trust it
                </Button>
                <Button
                  style={{ flex: 1 }}
                  variant="coral"
                  icon="shield"
                  loading={busy}
                  onPress={() => setConfirm("flag")}
                >
                  Flag it
                </Button>
              </Row>
            )}
            {confirm && (
              <View
                style={{
                  borderWidth: 1,
                  borderColor: C.gold,
                  borderRadius: 12,
                  padding: 16,
                  gap: 12,
                }}
              >
                <Txt style={{ fontSize: 13, lineHeight: 21 }}>
                  Lock in “{confirm === "trust" ? "Trust it" : "Flag it"}”? A
                  correct decision earns +3; an incorrect one scores −3.
                </Txt>
                <Row>
                  <Button
                    small
                    loading={busy}
                    onPress={() =>
                      void safely(
                        request(`/api/scenarios/${scenario.id}/decision`, {
                          choice: confirm,
                        }).then(() => setConfirm(null)),
                      )
                    }
                  >
                    Submit decision
                  </Button>
                  <Button
                    small
                    variant="ghost"
                    onPress={() => setConfirm(null)}
                  >
                    Keep inspecting
                  </Button>
                </Row>
              </View>
            )}
          </View>
        )}
        {decision && reveal && (
          <RevealMotion>
            <View
              accessibilityRole="alert"
              style={{
                marginTop: 20,
                backgroundColor: decision.correct ? "#203D37" : "#3B302F",
                borderWidth: 1,
                borderColor: decision.correct ? "#43715F" : "#704C43",
                borderRadius: 13,
                padding: 22,
                gap: 15,
              }}
            >
              <Row style={{ justifyContent: "space-between" }}>
                <Hook size={45} color={decision.correct ? C.teal : C.coral} />
                <Txt
                  style={{
                    fontSize: 29,
                    fontWeight: "800",
                    color: decision.correct ? C.teal : C.coral,
                  }}
                >
                  {decision.defenderPoints > 0 ? "+" : ""}
                  {decision.defenderPoints}
                  <Txt style={{ fontSize: 11 }}> pts</Txt>
                </Txt>
              </Row>
              <Txt
                style={{ fontSize: 26, fontWeight: "800", letterSpacing: -0.7 }}
              >
                {decision.correct
                  ? reveal.isPhishing
                    ? "Bait spotted."
                    : "Good instincts."
                  : state?.consent.familyFriendly
                    ? reveal.isPhishing
                      ? "That one slipped through."
                      : "A little too suspicious."
                    : reveal.isPhishing
                      ? "You took the bait."
                      : "False alarm, detective."}
              </Txt>
              <Badge color={reveal.isPhishing ? C.coral : C.teal}>
                {reveal.isPhishing
                  ? "PHISHING CHALLENGE"
                  : "EXPECTED FICTIONAL MESSAGE"}
              </Badge>
              <Txt style={{ fontSize: 13, lineHeight: 23 }}>
                {reveal.explanation}
              </Txt>
              {reveal.cueAnnotations.map((cue, i) => (
                <Row key={i} style={{ alignItems: "flex-start", gap: 9 }}>
                  <Icon
                    name="eye"
                    size={15}
                    color={decision.correct ? C.teal : C.coral}
                  />
                  <Txt style={{ fontSize: 12, lineHeight: 20, flex: 1 }}>
                    {cue}
                  </Txt>
                </Row>
              ))}
              {reveal.authorName && (
                <Txt muted style={{ fontSize: 11 }}>
                  {decision.correct
                    ? `Nice try, ${reveal.authorName}.`
                    : `A little mischief from ${reveal.authorName}.`}
                </Txt>
              )}
              <Txt muted style={{ fontSize: 10, lineHeight: 18 }}>
                Answer locked · server-scored · opening and inspection earned no
                points.
              </Txt>
            </View>
          </RevealMotion>
        )}
      </View>
    </Card>
  );
}
export default function Activity() {
  const { state } = useSession();
  const wide = useWindowDimensions().width >= 1120;
  const [view, setView] = useState<"incoming" | "outgoing">("incoming"),
    [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    if (
      state?.incoming.length &&
      !state.incoming.some((s) => s.id === selected)
    )
      setSelected(
        (state.incoming.find((s) => !s.decision) || state.incoming[0]).id,
      );
  }, [selected, state?.incoming]);
  if (!state) return <Welcome />;
  const item =
    state.incoming.find((s) => s.id === selected) ||
    state.incoming.find((s) => !s.decision) ||
    state.incoming[0];
  return (
    <View>
      <Title
        kicker="SOMETHING’S A LITTLE FISHY"
        sub="A familiar sender. A tempting message. Slow down and check the context before you make your call."
      >
        The plot thickens.
      </Title>
      <Row style={{ marginBottom: 22, flexWrap: "wrap" }}>
        <Button
          small
          variant={view === "incoming" ? "primary" : "secondary"}
          onPress={() => setView("incoming")}
        >
          Received · {state.incoming.length}
        </Button>
        <Button
          small
          variant={view === "outgoing" ? "primary" : "secondary"}
          onPress={() => setView("outgoing")}
        >
          Your outgoing challenges
        </Button>
        <Badge color={C.gold}>
          {state.mode === "demo"
            ? "IN-APP SIMULATOR · NO REAL INBOX ACCESS"
            : "APP RESPONSE VIEW · SEE CHANNEL TRANSPORT STATUS"}
        </Badge>
      </Row>
      {view === "outgoing" ? (
        <View style={{ gap: 16 }}>
          {state.drafts.map((draft) => (
            <Card key={draft.id}>
              <Row style={{ alignItems: "flex-start" }}>
                <View
                  style={{
                    backgroundColor: C.tealDark,
                    padding: 13,
                    borderRadius: 11,
                  }}
                >
                  <Icon
                    name={draft.channel === "email" ? "mail" : draft.channel}
                    color={C.teal}
                  />
                </View>
                <View style={{ flex: 1, gap: 8 }}>
                  <Label>
                    {draft.channel} / TO {state.opponent.name}
                  </Label>
                  <Txt style={{ fontSize: 18, fontWeight: "700" }}>
                    {draft.content.subject}
                  </Txt>
                  <Txt muted style={{ fontSize: 12, lineHeight: 20 }}>
                    {draft.channel === "email"
                      ? draft.content.bodyText
                      : draft.channel === "sms"
                        ? draft.content.smsText
                        : draft.content.voiceScript}
                  </Txt>
                  <Row style={{ flexWrap: "wrap" }}>
                    <Badge>{draft.deliveryStatus.toUpperCase()}</Badge>
                    <Badge color={C.gold}>{draft.source.toUpperCase()}</Badge>
                    <Badge color={C.muted}>
                      {draft.locked ? "LOCKED" : "DRAFT"}
                    </Badge>
                  </Row>
                </View>
              </Row>
            </Card>
          ))}
          <Txt muted style={{ fontSize: 11, lineHeight: 19 }}>
            Only your authored challenges appear here. Acceptance by a provider
            does not prove delivery or count as a decision.
          </Txt>
        </View>
      ) : (
        <View style={{ flexDirection: wide ? "row" : "column", gap: 20 }}>
          <View
            testID="activity-main"
            style={{ flex: wide ? 1.7 : undefined, width: "100%", gap: 18 }}
          >
            {state.incoming.length > 0 && (
              <View style={{ gap: 8 }}>
                {state.incoming.map((scenario, i) => (
                  <Pressable
                    key={scenario.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${scenario.channel} challenge ${i + 1}`}
                    onPress={() => setSelected(scenario.id)}
                    style={{
                      backgroundColor:
                        item?.id === scenario.id ? C.tealDark : C.panel,
                      borderWidth: 1,
                      borderColor:
                        item?.id === scenario.id ? "#4A7063" : C.border,
                      padding: 14,
                      borderRadius: 10,
                      flexDirection: "row",
                      gap: 12,
                      alignItems: "center",
                    }}
                  >
                    <Icon
                      name={
                        scenario.channel === "email" ? "mail" : scenario.channel
                      }
                      color={item?.id === scenario.id ? C.teal : C.muted}
                      size={17}
                    />
                    <View style={{ flex: 1, gap: 4 }}>
                      <Txt style={{ fontSize: 12, fontWeight: "700" }}>
                        {scenario.content.senderDisplayName}
                      </Txt>
                      <Txt muted style={{ fontSize: 10 }}>
                        {scenario.channel.toUpperCase()} ·{" "}
                        {scenario.decision
                          ? "Decision locked"
                          : scenario.deliveryStatus === "unanswered"
                            ? "Ignored · no score"
                            : "Your call"}
                      </Txt>
                    </View>
                    {scenario.decision ? (
                      <Badge
                        color={scenario.decision.correct ? C.teal : C.coral}
                      >
                        {scenario.decision.defenderPoints > 0 ? "+" : ""}
                        {scenario.decision.defenderPoints}
                      </Badge>
                    ) : (
                      <View
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: 9,
                          backgroundColor: C.teal,
                        }}
                      />
                    )}
                  </Pressable>
                ))}
              </View>
            )}
            {item ? (
              <Message key={item.id} scenario={item} />
            ) : (
              <Empty
                title={
                  state.match.state === "drafting"
                    ? "The bait is still being prepared."
                    : "Quiet… a little too quiet."
                }
              >
                {state.match.state === "drafting"
                  ? "Head to Draft to build your lineup, then start the match."
                  : "Challenges arrive during your chosen contact window. The demo operator can release simulated deliveries for the presentation."}
              </Empty>
            )}
            {state.match.state === "completed" && (
              <Button icon="league" onPress={() => router.push("/league")}>
                The results are in · view recap
              </Button>
            )}
          </View>
          <View
            testID="activity-context"
            style={{ flex: wide ? 1 : undefined, width: "100%", gap: 18 }}
          >
            <ActivityCard />
            <Card>
              <Label>MAKE A CALL. LEARN THE TELL.</Label>
              <Txt
                muted
                style={{ fontSize: 12, lineHeight: 21, marginTop: 12 }}
              >
                Correct decision: +3{`\n`}Incorrect decision: −3{`\n`}Fool a
                friend with your authored phish: +2{`\n`}Open, inspect, ignore,
                or time out: 0
              </Txt>
              <Divider />
              <Txt muted style={{ fontSize: 11, lineHeight: 19 }}>
                Four of six decisions qualify you for a competitive result.
                There is no speed bonus.
              </Txt>
            </Card>
          </View>
        </View>
      )}
    </View>
  );
}
