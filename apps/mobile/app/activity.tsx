import React, { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
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
    [answered, setAnswered] = useState(false),
    [clues, setClues] = useState(false);
  const voice = scenario.channel === "voice";
  const reveal = scenario.reveal;
  const decision = scenario.decision;
  const [confirm, setConfirm] = useState<"trust" | "flag" | null>(null);
  return (
    <Card style={{ padding: 0, overflow: "hidden" }}>
      <View
        style={{
          padding: 19,
          backgroundColor: C.panelDeep,
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
                ? "Email"
                : scenario.channel === "sms"
                  ? "Text"
                  : "Incoming call"}
            </Label>
          </Row>
          <Badge>
            {state?.mode === "demo" ? "Simulated" : "In-app response"}
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
                Text conversation
              </Txt>
            </View>
            <View
              style={{
                alignSelf: "flex-start",
                backgroundColor: C.panelDeep,
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
                backgroundColor: C.tealDark,
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
                  ? "Call transcript"
                  : scenario.deliveryStatus === "unanswered"
                    ? "Call ignored · 0 points"
                    : "Read the caller’s message"}
            </Txt>
            {!answered && !decision ? (
              <Row
                style={{ marginTop: 14, marginBottom: 18, flexWrap: "wrap" }}
              >
                <Button icon="voice" onPress={() => setAnswered(true)}>
                  Read call
                </Button>
                {state?.mode === "demo" && (
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
                )}
              </Row>
            ) : (
              <View style={{ width: "100%", gap: 13, marginTop: 12 }}>
                <Badge color={C.gold}>
                  Call transcript · audio unavailable
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
                  Read the caller’s message, then choose Trust or Flag.
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
          {inspect ? "Hide sender and context" : "Check sender and context"}
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
              <Label>Response destination</Label>
              <Txt style={{ fontSize: 11, lineHeight: 19 }}>
                {scenario.inspection.destination}
              </Txt>
            </View>
            <Txt muted style={{ fontSize: 10, lineHeight: 17 }}>
              Checking these details does not submit an answer.
            </Txt>
            <ActivityCard />
          </View>
        )}
        {!decision && (!voice || answered) && (
          <View style={{ marginTop: 22, gap: 12 }}>
            {!confirm && <Txt style={{ fontWeight: "700", fontSize: 16 }}>Is this message bait?</Txt>}
            {!confirm && (voice ? (
              <Row style={{ flexWrap: "wrap" }}>
                <Button
                  style={{ flex: 1 }}
                  icon="check"
                  loading={busy}
                  onPress={() => setConfirm("trust")}
                >
                  Trust
                </Button>
                <Button
                  style={{ flex: 1 }}
                  variant="coral"
                  icon="shield"
                  loading={busy}
                  onPress={() => setConfirm("flag")}
                >
                  Flag
                </Button>
                <Button
                  small
                  variant="secondary"
                  onPress={() =>
                    void safely(request("/api/pause", { paused: true }))
                  }
                >
                  Pause contact
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
                  Trust
                </Button>
                <Button
                  style={{ flex: 1 }}
                  variant="coral"
                  icon="shield"
                  loading={busy}
                  onPress={() => setConfirm("flag")}
                >
                  Flag
                </Button>
              </Row>
            ))}
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
                  {confirm === "trust" ? "Trust this message?" : "Flag this as phishing?"} You can’t change your answer after submitting.
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
                    Confirm answer
                  </Button>
                  <Button
                    small
                    variant="ghost"
                    onPress={() => setConfirm(null)}
                  >
                    Go back
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
                backgroundColor: decision.correct ? C.tealDark : C.panelDeep,
                borderWidth: 1,
                borderColor: decision.correct ? C.teal : C.coral,
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
                  ? "Phishing challenge"
                  : "Expected message"}
              </Badge>
              <Txt style={{ fontSize: 13, lineHeight: 23 }}>
                {reveal.explanation}
              </Txt>
              <Button small variant="ghost" onPress={() => setClues(!clues)}>{clues ? "Hide the clues" : "See the clues"}</Button>
              {clues && reveal.cueAnnotations.map((cue, i) => (
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
                Answer saved.
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
  const [selected, setSelected] = useState<string | null>(null);
  const [showMessages, setShowMessages] = useState(false);
  const [showSent, setShowSent] = useState(false);
  const [showScoring, setShowScoring] = useState(false);
  useEffect(() => {
    if (state?.incoming.length && !state.incoming.some((s) => s.id === selected))
      setSelected((state.incoming.find((s) => !s.decision) || state.incoming[0]).id);
  }, [selected, state?.incoming]);
  if (!state) return <Welcome />;
  const item = state.incoming.find((s) => s.id === selected) || state.incoming.find((s) => !s.decision) || state.incoming[0];
  const unread = state.incoming.filter((s) => !s.decision).length;
  const waitingForOpponent = state.selectedLeagueId !== state.match.leagueId;
  return (
    <View style={{ maxWidth: 780, width: "100%", alignSelf: "center", gap: 16 }}>
      <Title sub="Read the message. Check the details. Decide whether it’s bait.">Your inbox</Title>
      {state.incoming.length > 0 && !waitingForOpponent && <View style={{ gap: 10 }}>
        <Row style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
          <Txt muted style={{ fontSize: 13 }}>{unread ? `${unread} awaiting your answer` : "All messages answered"}</Txt>
          <Button small variant="ghost" onPress={() => setShowMessages(!showMessages)}>{showMessages ? "Hide messages" : `All messages · ${state.incoming.length}`}</Button>
        </Row>
        {showMessages && <View style={{ gap: 6 }}>{state.incoming.map((scenario, i) => (
          <Pressable key={scenario.id} accessibilityRole="button" accessibilityLabel={`Open ${scenario.content.senderDisplayName} message ${i + 1}`} accessibilityState={{ selected: scenario.id === item?.id }} onPress={() => { setSelected(scenario.id); setShowMessages(false); }} style={{ backgroundColor: item?.id === scenario.id ? C.tealDark : C.panel, borderWidth: 1, borderColor: C.border, padding: 14, borderRadius: 12, flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Icon name={scenario.channel === "email" ? "mail" : scenario.channel} color={C.teal} size={18} />
            <View style={{ flex: 1, gap: 4 }}><Txt style={{ fontSize: 13, fontWeight: "700" }}>{scenario.content.senderDisplayName}</Txt><Txt muted style={{ fontSize: 11 }}>{scenario.decision ? "Answered" : scenario.deliveryStatus === "unanswered" ? "Call ignored" : "Needs an answer"}</Txt></View>
            {scenario.decision ? <Icon name="check" size={16} color={C.muted} /> : <View style={{ width: 7, height: 7, borderRadius: 7, backgroundColor: C.teal }} />}
          </Pressable>
        ))}</View>}
      </View>}
      <View testID="activity-main" style={{ gap: 14 }}>
        {!waitingForOpponent && item ? <Message key={item.id} scenario={item} /> : <Empty title={waitingForOpponent ? "Waiting for another player" : state.match.state === "drafting" ? "No messages yet" : "Nothing new in the water"}>
          {waitingForOpponent ? "Invite a friend to your league to get a match." : state.match.state === "drafting" ? "Prepare your bait and start the match. Messages will appear here." : "Messages arrive during your chosen contact window. Check back when one lands."}
        </Empty>}
        {!waitingForOpponent && item?.decision && unread > 0 && <Button onPress={() => setSelected(state.incoming.find((s) => !s.decision)!.id)} icon="arrow">Next message</Button>}
        {!waitingForOpponent && state.match.state === "completed" && <Button onPress={() => router.push({ pathname: "/wrapped", params: { leagueId: state.match.leagueId, matchId: state.match.id } })}>Watch your week</Button>}
      </View>
      <View testID="activity-context" style={{ gap: 10 }}>
        <Button small variant="ghost" onPress={() => setShowSent(!showSent)}>{showSent ? "Hide sent bait" : `Your sent bait${waitingForOpponent ? "" : ` · ${state.drafts.length}`}`}</Button>
        {showSent && <View style={{ gap: 10 }}>
          {waitingForOpponent || !state.drafts.length ? <Txt muted style={{ fontSize: 13 }}>You haven’t prepared any bait for this match.</Txt> : state.drafts.map((draft) => <Card key={draft.id} style={{ padding: 16, gap: 8 }}><Row><Icon name={draft.channel === "email" ? "mail" : draft.channel} color={C.teal} /><View style={{ flex: 1, gap: 5 }}><Txt style={{ fontSize: 14, fontWeight: "700" }}>{draft.content.subject}</Txt><Txt muted style={{ fontSize: 12 }}>{draft.channel === "sms" ? "Text" : draft.channel === "voice" ? "Call" : "Email"} to {state.opponent.name} · {draft.locked ? draft.deliveryStatus : "Draft"}</Txt></View></Row></Card>)}
          {!waitingForOpponent && <Button small variant="secondary" onPress={() => router.push("/draft")}>Open your bait</Button>}
          <Txt muted style={{ fontSize: 11 }}>A delivery status is not an answer. Scores change when a player responds.</Txt>
        </View>}
        <Button small variant="ghost" onPress={() => setShowScoring(!showScoring)}>{showScoring ? "Hide scoring" : "How scoring works"}</Button>
        {showScoring && <Card style={{ gap: 10 }}><Txt style={{ fontSize: 13, lineHeight: 23 }}>Correct answer: +3{`\n`}Incorrect answer: −3{`\n`}An opponent takes your bait: +2</Txt><Txt muted style={{ fontSize: 12, lineHeight: 20 }}>Reading, checking details, or ignoring a call earns no points. Answer at least four of six messages to qualify for the match result. There is no speed bonus.</Txt></Card>}
      </View>
    </View>
  );
}
