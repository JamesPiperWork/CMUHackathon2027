import React from "react";
import { Pressable, View, useWindowDimensions } from "react-native";
import { router } from "expo-router";
import { useSession, safely } from "../src/session";
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
import { ConsentForm } from "../src/consent";
export function Welcome() {
  const { signIn, signInLive, busy, mode } = useSession();
  const wide = useWindowDimensions().width > 850;
  return (
    <View style={{ gap: 32, paddingTop: wide ? 25 : 3 }}>
      <View
        style={{
          flexDirection: wide ? "row" : "column",
          gap: 40,
          alignItems: "center",
        }}
      >
        <View style={{ flex: wide ? 1 : undefined, width: "100%", gap: 24 }}>
          <Badge>THE FRIEND GROUP HAS ENTERED ITS VILLAIN ERA</Badge>
          <Txt
            style={{
              fontSize: wide ? 62 : 43,
              fontWeight: "800",
              letterSpacing: -2.6,
              lineHeight: wide ? 66 : 49,
            }}
          >
            A little bait.{`\n`}A lot of{`\n`}friendly rivalry
            <Txt style={{ color: C.teal }}>.</Txt>
          </Txt>
          <Txt muted style={{ fontSize: 16, lineHeight: 26, maxWidth: 440 }}>
            Can you outsmart your friends? Dream up a harmless challenge. Spot
            theirs. Turn your scam instincts into bragging rights.
          </Txt>
          <Row>
            <Avatar name="Alex" size={31} />
            <Avatar name="Jordan" color={C.coral} size={31} />
            <Txt muted style={{ fontSize: 12 }}>
              A private league. Eight usual suspects.
            </Txt>
          </Row>
        </View>
        <Card
          style={{
            flex: wide ? 1 : undefined,
            width: "100%",
            maxWidth: 440,
            padding: 30,
            borderColor: "#35554F",
            backgroundColor: "#1A2D33",
          }}
        >
          <View style={{ alignItems: "center", paddingBottom: 20 }}>
            <Hook size={104} />
            <Label color={C.teal}>THE USUAL SUSPECTS</Label>
          </View>
          <Txt
            style={{
              fontSize: 25,
              fontWeight: "700",
              textAlign: "center",
              letterSpacing: -0.5,
            }}
          >
            Your friends are in.{`\n`}Are you?
          </Txt>
          <Txt
            muted
            style={{
              fontSize: 13,
              lineHeight: 21,
              textAlign: "center",
              marginTop: 12,
              marginBottom: 24,
            }}
          >
            {mode === "demo"
              ? "Try the complete local match as a fictional player. Each browser tab keeps its own session."
              : "Accept your invitation with your verified account."}
          </Txt>
          {mode === "demo" ? (
            <View style={{ gap: 11 }}>
              <Button
                loading={busy}
                icon="arrow"
                onPress={() => void signIn("alex")}
              >
                Enter demo as Alex
              </Button>
              <Button
                loading={busy}
                variant="secondary"
                onPress={() => void signIn("jordan")}
              >
                Enter demo as Jordan
              </Button>
              <Badge>LOCAL SIMULATION · NO MESSAGES SENT</Badge>
            </View>
          ) : (
            <Button loading={busy} onPress={() => void signInLive()}>
              Continue with Auth0
            </Button>
          )}
          <Divider />
          <Txt
            muted
            style={{ fontSize: 11, lineHeight: 18, textAlign: "center" }}
          >
            Adult-only, invitation-only, always opt-in.{`\n`}You pick the
            channels. You can pause any time.
          </Txt>
        </Card>
      </View>
      <View style={{ flexDirection: wide ? "row" : "column", gap: 16 }}>
        {[
          [
            "01",
            "Set the bait",
            "Three channels. Approved themes. One friend who thinks they know better.",
            "draft",
          ],
          [
            "02",
            "Trust your instincts",
            "Read the clues, check the context, and decide: trust it or flag it?",
            "shield",
          ],
          [
            "03",
            "Earn the bragging rights",
            "Every reveal teaches a cue. The league table keeps the receipts.",
            "league",
          ],
        ].map(([n, title, body, icon]) => (
          <Card key={n} style={{ flex: wide ? 1 : undefined, gap: 14 }}>
            <Row style={{ justifyContent: "space-between" }}>
              <Label color={C.teal}>ROUND {n}</Label>
              <Icon name={icon as "draft"} color={C.teal} />
            </Row>
            <Txt style={{ fontSize: 17, fontWeight: "700" }}>{title}</Txt>
            <Txt muted style={{ fontSize: 12, lineHeight: 20 }}>
              {body}
            </Txt>
          </Card>
        ))}
      </View>
      {mode === "demo" && (
        <Pressable
          accessibilityRole="button"
          onPress={() => void signIn("operator")}
          style={{ alignSelf: "center", padding: 12 }}
        >
          <Txt muted style={{ fontSize: 11, textDecorationLine: "underline" }}>
            Presentation tools · enter as demo operator
          </Txt>
        </Pressable>
      )}
    </View>
  );
}
function ActivityCard() {
  const { state } = useSession();
  if (!state) return null;
  return (
    <Card style={{ backgroundColor: "#1D3036", borderColor: "#35504D" }}>
      <Row style={{ justifyContent: "space-between" }}>
        <Label color={C.teal}>Your fictional activity card</Label>
        <Icon name="shield" color={C.teal} size={18} />
      </Row>
      <Txt style={{ fontSize: 17, fontWeight: "700", marginTop: 12 }}>
        The context is your superpower.
      </Txt>
      <Txt muted style={{ fontSize: 12, lineHeight: 20, marginTop: 8 }}>
        These are the things you really did in this game. Compare incoming
        claims with the details.
      </Txt>
      <Divider />
      {[
        ["mail", "Expected order", state.activityCard.order],
        ["sms", "Ticket booking", state.activityCard.event],
        ["voice", "A reminder you requested", state.activityCard.voice],
      ].map(([icon, title, body], i) => (
        <View key={title} style={{ marginTop: i ? 18 : 0 }}>
          <Row>
            <Icon name={icon as "mail"} color={C.teal} size={16} />
            <Txt style={{ fontWeight: "700", fontSize: 12 }}>{title}</Txt>
          </Row>
          <Txt muted style={{ fontSize: 12, lineHeight: 20, marginTop: 7 }}>
            {body}
          </Txt>
        </View>
      ))}
    </Card>
  );
}
export { ActivityCard };
export default function Home() {
  const { state, busy, request } = useSession();
  const wide = useWindowDimensions().width > 1050;
  if (!state) return <Welcome />;
  if (!state.consent.acceptedAt && state.role !== "operator")
    return (
      <View style={{ maxWidth: 680, alignSelf: "center", width: "100%" }}>
        <Title
          kicker="Invitation, accepted?"
          sub="A few ground rules, then let the friendly rivalry begin."
        >
          Make yourself at home.
        </Title>
        <ConsentForm />
      </View>
    );
  const mine = state.match.scores[state.me.id] ?? 0,
    opponent = state.match.scores[state.opponent.id] ?? 0;
  const unread = state.incoming.filter((i) => !i.decision).length;
  const done = state.match.state === "completed";
  const minutes = Math.max(
    0,
    Math.ceil((state.match.deadline - state.now) / 60000),
  );
  return (
    <View>
      <Row
        style={{
          justifyContent: "space-between",
          marginBottom: 9,
          flexWrap: "wrap",
        }}
      >
        <Label color={C.teal}>The Usual Suspects / Match 01</Label>
        <Badge color={state.consent.paused ? C.gold : C.teal}>
          {state.consent.paused
            ? "CONTACT PAUSED"
            : done
              ? "MATCH COMPLETE"
              : state.match.state.toUpperCase()}
        </Badge>
      </Row>
      <Title sub="Somewhere in your friend group, a very questionable message is being written.">
        Hey {state.me.name.split(" ")[0]}, stay a little suspicious.
      </Title>
      <View style={{ flexDirection: wide ? "row" : "column", gap: 22 }}>
        <View style={{ flex: wide ? 1.65 : undefined, width: "100%", gap: 20 }}>
          <Card
            style={{ padding: 0, overflow: "hidden", borderColor: "#3C5559" }}
          >
            <View
              style={{
                backgroundColor: "#213B40",
                paddingHorizontal: 24,
                paddingVertical: 16,
              }}
            >
              <Row style={{ justifyContent: "space-between" }}>
                <Label color={C.teal}>YOUR CURRENT MATCHUP</Label>
                <Row style={{ gap: 5 }}>
                  <Icon name="clock" size={13} color={C.muted} />
                  <Txt muted style={{ fontSize: 11 }}>
                    {done
                      ? "Final whistle"
                      : state.match.state === "drafting"
                        ? "Starts at kickoff"
                        : `${minutes}m remaining`}
                  </Txt>
                </Row>
              </Row>
            </View>
            <View style={{ padding: 26 }}>
              <Row
                style={{
                  justifyContent: "space-around",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <View style={{ alignItems: "center", gap: 10, flex: 1 }}>
                  <Avatar name={state.me.name} size={76} color={C.teal} />
                  <Txt style={{ fontSize: 17, fontWeight: "700" }}>
                    {state.me.name}
                  </Txt>
                  <Badge>YOU</Badge>
                </View>
                <View style={{ alignItems: "center", gap: 7 }}>
                  <Txt
                    style={{
                      fontSize: 14,
                      fontWeight: "800",
                      color: C.muted,
                      fontStyle: "italic",
                    }}
                  >
                    VS
                  </Txt>
                  <Row style={{ gap: 12 }}>
                    <Txt
                      style={{
                        fontSize: 43,
                        fontWeight: "800",
                        color: C.teal,
                        fontVariant: ["tabular-nums"],
                      }}
                    >
                      {mine}
                    </Txt>
                    <Txt muted style={{ fontSize: 22 }}>
                      :
                    </Txt>
                    <Txt
                      style={{
                        fontSize: 43,
                        fontWeight: "800",
                        fontVariant: ["tabular-nums"],
                      }}
                    >
                      {opponent}
                    </Txt>
                  </Row>
                  <Label>Match points</Label>
                </View>
                <View style={{ alignItems: "center", gap: 10, flex: 1 }}>
                  <Avatar
                    name={state.opponent.name}
                    size={76}
                    color={C.coral}
                  />
                  <Txt style={{ fontSize: 17, fontWeight: "700" }}>
                    {state.opponent.name}
                  </Txt>
                  <Badge color={C.coral}>THE COMPETITION</Badge>
                </View>
              </Row>
              <Divider />
              <Row style={{ justifyContent: "space-between", gap: 8 }}>
                <View style={{ gap: 7 }}>
                  <Label>Your draft lineup</Label>
                  <Txt style={{ fontSize: 13, fontWeight: "600" }}>
                    {state.draftProgress.mine} of 3 locked
                  </Txt>
                </View>
                <Row style={{ gap: 7 }}>
                  {(["email", "sms", "voice"] as const).map((channel) => (
                    <View
                      key={channel}
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: 9,
                        backgroundColor: state.drafts.find(
                          (d) => d.channel === channel,
                        )?.locked
                          ? C.tealDark
                          : C.bg,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Icon
                        name={channel === "email" ? "mail" : channel}
                        color={
                          state.drafts.find((d) => d.channel === channel)
                            ?.locked
                            ? C.teal
                            : C.muted
                        }
                        size={17}
                      />
                    </View>
                  ))}
                </Row>
              </Row>
              <Button
                style={{ marginTop: 23 }}
                icon={
                  done
                    ? "league"
                    : state.match.state === "drafting"
                      ? "draft"
                      : "arrow"
                }
                onPress={() =>
                  router.push(
                    done
                      ? "/league"
                      : state.match.state === "drafting"
                        ? "/draft"
                        : "/activity",
                  )
                }
              >
                {done
                  ? "See how it all shook out"
                  : state.match.state === "drafting"
                    ? `Cook up a challenge for ${state.opponent.name}`
                    : unread
                      ? `Make your next call · ${unread} waiting`
                      : "Check your challenge activity"}
              </Button>
              {state.match.state === "drafting" && (
                <Txt
                  muted
                  style={{
                    fontSize: 10,
                    lineHeight: 17,
                    textAlign: "center",
                    marginTop: 12,
                  }}
                >
                  Personalize three channels. Lock your lineup. Let the mind
                  games begin.
                </Txt>
              )}
            </View>
          </Card>
          <Row style={{ gap: 14, alignItems: "stretch" }}>
            <Card style={{ flex: 1, gap: 11, padding: 18 }}>
              <Icon name="activity" color={C.teal} />
              <Txt style={{ fontSize: 28, fontWeight: "800" }}>
                {state.remaining}
                <Txt muted style={{ fontSize: 13 }}>
                  {" "}
                  / 6
                </Txt>
              </Txt>
              <Txt muted style={{ fontSize: 11 }}>
                decisions remaining
              </Txt>
            </Card>
            <Card style={{ flex: 1, gap: 11, padding: 18 }}>
              <Icon name="shield" color={C.gold} />
              <Txt style={{ fontSize: 28, fontWeight: "800" }}>
                +3{" "}
                <Txt muted style={{ fontSize: 13 }}>
                  points
                </Txt>
              </Txt>
              <Txt muted style={{ fontSize: 11 }}>
                for every right call
              </Txt>
            </Card>
          </Row>
          <Card style={{ padding: 20 }}>
            <Row style={{ alignItems: "flex-start" }}>
              <View
                style={{
                  backgroundColor: "#3A3030",
                  padding: 10,
                  borderRadius: 12,
                }}
              >
                <Hook size={34} color={C.coral} />
              </View>
              <View style={{ flex: 1, gap: 7 }}>
                <Txt style={{ fontSize: 14, fontWeight: "700" }}>
                  A good scam needs a great reveal.
                </Txt>
                <Txt muted style={{ fontSize: 12, lineHeight: 20 }}>
                  Right or wrong, every decision comes with the tell you
                  caught—or the one that got away. No secrets, money, or real
                  offers involved.
                </Txt>
              </View>
            </Row>
          </Card>
        </View>
        <View style={{ flex: wide ? 1 : undefined, width: "100%", gap: 20 }}>
          <ActivityCard />
          <Card>
            <Row style={{ justifyContent: "space-between" }}>
              <Label>League leaders</Label>
              <Icon name="league" color={C.gold} size={18} />
            </Row>
            {state.league.members.slice(0, 3).map((member, index) => (
              <Row key={member.id} style={{ marginTop: 19, gap: 10 }}>
                <Txt muted style={{ fontSize: 11, width: 15 }}>
                  {index + 1}
                </Txt>
                <Avatar name={member.name} color={member.color} size={31} />
                <View style={{ flex: 1 }}>
                  <Txt style={{ fontSize: 12, fontWeight: "600" }}>
                    {member.name}
                  </Txt>
                  {member.historical && (
                    <Txt muted style={{ fontSize: 9, marginTop: 3 }}>
                      Seeded history
                    </Txt>
                  )}
                </View>
                <Txt style={{ fontSize: 12, fontWeight: "700" }}>
                  {member.leaguePoints}{" "}
                  <Txt muted style={{ fontSize: 10 }}>
                    pts
                  </Txt>
                </Txt>
              </Row>
            ))}
            <Button
              small
              variant="ghost"
              style={{ marginTop: 14 }}
              icon="arrow"
              onPress={() => router.push("/league")}
            >
              Meet the usual suspects
            </Button>
          </Card>
          <Button
            variant={state.consent.paused ? "primary" : "secondary"}
            small
            icon="pause"
            loading={busy}
            onPress={() =>
              void safely(
                request("/api/pause", { paused: !state.consent.paused }),
              )
            }
          >
            {state.consent.paused ? "Resume contact" : "Pause all contact"}
          </Button>
          {state.role === "operator" && (
            <Button
              variant="secondary"
              onPress={() => router.push("/operator")}
            >
              Open presentation console
            </Button>
          )}
        </View>
      </View>
    </View>
  );
}
