import React from "react";
import { View, useWindowDimensions } from "react-native";
import { router } from "expo-router";
import { useSession } from "../src/session";
import {
  Avatar,
  Badge,
  Button,
  C,
  Card,
  Divider,
  Hook,
  Icon,
  Label,
  Row,
  Title,
  Txt,
} from "../src/ui";
import { Welcome } from "./index";
export default function League() {
  const { state } = useSession();
  const wide = useWindowDimensions().width >= 1000;
  if (!state) return <Welcome />;
  const recap = state.recap;
  const complete = state.match.state === "completed";
  const result = state.match.result;
  const resultLabel = state.match.winnerId
    ? `${state.match.winnerId === state.me.id ? "WIN" : "LOSS"}${result === "forfeit" ? " BY FORFEIT" : ""}`
    : result?.toUpperCase().replace("-", " ");
  const outcome =
    result === "no-contest"
      ? "No contest. Still good practice."
      : result === "incomplete"
        ? "This match needs a review."
        : result === "draw"
          ? "Great minds. Same score."
          : state.match.winnerId === state.me.id
            ? "The bragging rights are yours."
            : `${state.opponent.name} takes this one.`;
  return (
    <View>
      <Title
        kicker="SMALL LEAGUE. BIG BRAGGING RIGHTS."
        sub="Eight friends, a healthy amount of suspicion, and a table that remembers."
      >
        The Usual Suspects.
      </Title>
      <View style={{ flexDirection: wide ? "row" : "column", gap: 22 }}>
        <View style={{ flex: wide ? 1.45 : undefined, width: "100%", gap: 20 }}>
          <Card style={{ padding: 0, overflow: "hidden" }}>
            <View style={{ padding: 23 }}>
              <Row style={{ justifyContent: "space-between" }}>
                <Txt style={{ fontSize: 20, fontWeight: "700" }}>
                  The leaderboard
                </Txt>
                <Badge>SEASON 01</Badge>
              </Row>
              <Txt muted style={{ fontSize: 11, marginTop: 10 }}>
                Win +3 · Draw +1 · Loss or no contest +0 league points
              </Txt>
            </View>
            <View
              style={{
                flexDirection: "row",
                paddingHorizontal: 22,
                paddingVertical: 12,
                backgroundColor: C.panelDeep,
              }}
            >
              <View style={{ width: 35 }}>
                <Label>#</Label>
              </View>
              <View style={{ flex: 1 }}>
                <Label>Usual suspect</Label>
              </View>
              <View style={{ width: 50, alignItems: "center" }}>
                <Label>W–L–D</Label>
              </View>
              <View style={{ width: 49, alignItems: "flex-end" }}>
                <Label>PTS</Label>
              </View>
            </View>
            {state.league.members.map((member) => (
              <View
                key={member.id}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 0,
                  paddingHorizontal: 22,
                  paddingVertical: 17,
                  borderTopWidth: 1,
                  borderTopColor: C.border,
                  backgroundColor:
                    member.id === state.me.id ? "#223A37" : "transparent",
                }}
              >
                <View style={{ width: 35 }}>
                  <Txt
                    style={{
                      fontSize: 14,
                      fontWeight: "700",
                      color: member.rank === 1 ? C.gold : C.muted,
                    }}
                  >
                    {member.rank === 1 ? "♛" : member.rank}
                  </Txt>
                </View>
                <Row style={{ flex: 1, gap: 10 }}>
                  <Avatar name={member.name} color={member.color} size={32} />
                  <View style={{ flex: 1 }}>
                    <Row style={{ gap: 6, flexWrap: "wrap" }}>
                      <Txt style={{ fontSize: 12, fontWeight: "700" }}>
                        {member.name}
                      </Txt>
                      {member.id === state.me.id && (
                        <Txt style={{ color: C.teal, fontSize: 9 }}>YOU</Txt>
                      )}
                    </Row>
                    <Txt muted style={{ fontSize: 9, marginTop: 5 }}>
                      {member.historical
                        ? "Seeded historical standings"
                        : `Current demo match${member.movement ? ` · ${member.movement > 0 ? "↑" : "↓"} ${Math.abs(member.movement)} rank` : ""}`}
                    </Txt>
                  </View>
                </Row>
                <Txt
                  muted
                  style={{ fontSize: 10, width: 50, textAlign: "center" }}
                >
                  {member.wins}–{member.losses}–{member.draws}
                </Txt>
                <Txt
                  style={{
                    fontSize: 17,
                    fontWeight: "700",
                    width: 49,
                    textAlign: "right",
                  }}
                >
                  {member.leaguePoints}
                </Txt>
              </View>
            ))}
          </Card>
          <Txt muted style={{ fontSize: 11, lineHeight: 19 }}>
            Six profiles carry fictional seeded history. Alex and Jordan’s
            current match is computed from saved decisions. Standings update
            once, when the match is finalized.
          </Txt>
        </View>
        <View style={{ flex: wide ? 1 : undefined, width: "100%", gap: 20 }}>
          {recap ? (
            <Card
              style={{
                backgroundColor: "#203935",
                borderColor: "#426553",
                gap: 16,
              }}
            >
              <Row style={{ justifyContent: "space-between" }}>
                <Hook size={60} />
                <Badge>{complete ? "MATCH RECAP" : "YOUR MATCH SO FAR"}</Badge>
              </Row>
              <Txt
                style={{
                  fontSize: 29,
                  fontWeight: "800",
                  letterSpacing: -0.9,
                  lineHeight: 34,
                }}
              >
                {complete ? outcome : "Keep those instincts sharp."}
              </Txt>
              <Txt muted style={{ fontSize: 12, lineHeight: 20 }}>
                {complete
                  ? `${resultLabel} · ${state.me.name} ${state.match.scores[state.me.id] ?? 0} : ${state.match.scores[state.opponent.id] ?? 0} ${state.opponent.name}`
                  : `${recap.decisions} of 6 decisions made. Your result is still taking shape.`}
              </Txt>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
                {[
                  ["Phish detected", recap.detectedPhish],
                  ["Correct trusts", recap.correctTrust],
                  ["False alarms", recap.falseAlarms],
                  ["Took the bait", recap.tookBait],
                  ["Author successes", recap.authorSuccess],
                  ["Match points", recap.score],
                ].map(([name, value]) => (
                  <View
                    key={name}
                    style={{
                      width: "46%",
                      padding: 15,
                      borderRadius: 10,
                      backgroundColor: "#192F2D",
                      gap: 6,
                    }}
                  >
                    <Txt
                      style={{ fontSize: 27, fontWeight: "800", color: C.teal }}
                    >
                      {value}
                    </Txt>
                    <Txt muted style={{ fontSize: 10 }}>
                      {name}
                    </Txt>
                  </View>
                ))}
              </View>
              <Divider />
              <Label color={C.teal}>Your strong suit</Label>
              <Txt style={{ fontSize: 13, lineHeight: 22 }}>
                {recap.strength}
              </Txt>
              <Label color={C.gold}>One for next time</Label>
              <Txt style={{ fontSize: 13, lineHeight: 22 }}>{recap.tip}</Txt>
              {state.match.incompleteReason && (
                <Txt style={{ fontSize: 12, lineHeight: 20, color: C.gold }}>
                  {state.match.incompleteReason}
                </Txt>
              )}
            </Card>
          ) : (
            <Card style={{ gap: 16, alignItems: "flex-start" }}>
              <Hook size={61} />
              <Label color={C.teal}>YOUR RECAP IS STILL COOKING</Label>
              <Txt style={{ fontSize: 23, fontWeight: "700" }}>
                The best reveal comes last.
              </Txt>
              <Txt muted style={{ fontSize: 13, lineHeight: 22 }}>
                Play your six decisions to see the bait you spotted, the tells
                you missed, and the final friendly rivalry score.
              </Txt>
              <Button
                small
                icon="arrow"
                onPress={() => router.push("/activity")}
              >
                Back to the action
              </Button>
            </Card>
          )}
          <Card style={{ gap: 11 }}>
            <Icon name="league" size={24} color={C.gold} />
            <Txt style={{ fontSize: 15, fontWeight: "700" }}>
              A fair finish.
            </Txt>
            <Txt muted style={{ fontSize: 12, lineHeight: 21 }}>
              Both players need at least four decisions. One qualifying player
              wins by forfeit; neither means no contest. Unanswered calls never
              cost points.
            </Txt>
          </Card>
        </View>
      </View>
    </View>
  );
}
