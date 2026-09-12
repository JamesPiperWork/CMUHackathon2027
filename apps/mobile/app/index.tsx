import React, { useState } from "react";
import { Pressable, View, useWindowDimensions } from "react-native";
import { router } from "expo-router";
import { useSession } from "../src/session";
import { Avatar, Button, C, Card, Hook, Icon, Row, Title, Txt } from "../src/ui";
import { ConsentForm } from "../src/consent";

export function Welcome() {
  const { signIn, signInLive, busy, mode } = useSession();
  const [showEveryone, setShowEveryone] = useState(false);
  return <View style={{ width: "100%", maxWidth: 480, alignSelf: "center", gap: 24, paddingTop: 22 }}>
    <View style={{ gap: 13 }}><Hook size={58} /><Txt style={{ fontSize: 35, lineHeight: 41, fontWeight: "700", letterSpacing: -1 }}>A little bait.{"\n"}A friendly rivalry.</Txt><Txt muted style={{ fontSize: 16, lineHeight: 25 }}>Send playful phishing challenges to friends. Spot theirs. See who gets hooked.</Txt></View>
    <Card style={{ gap: 16, padding: 22 }}>
      <Txt style={{ fontSize: 20, fontWeight: "600" }}>{mode === "demo" ? "Who’s fishing today?" : "Welcome back"}</Txt>
      {mode === "demo" ? <View style={{ gap: 10 }}>
        {(["alex", "jordan", "sam", "riley", "casey", "morgan", "jamie", "taylor"] as const).slice(0, showEveryone ? 8 : 2).map(id => {
          const name = id.charAt(0).toUpperCase() + id.slice(1);
          return <Pressable key={id} accessibilityRole="button" accessibilityLabel={`Continue as ${name}`} disabled={busy} onPress={() => void signIn(id)} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 13, padding: 14, borderRadius: 12, backgroundColor: pressed ? C.tealDark : C.panelDeep, opacity: busy ? 0.5 : 1 })}><Avatar name={name} color={id === "jordan" ? C.coral : C.teal} size={36} /><Txt style={{ fontSize: 16, flex: 1 }}>{name}</Txt><Icon name="arrow" color={C.muted} size={18} /></Pressable>;
        })}
        <Button variant="ghost" small onPress={() => setShowEveryone(!showEveryone)}>{showEveryone ? "Show fewer players" : "Choose another player"}</Button>
      </View> : <Button loading={busy} onPress={() => void signInLive()}>Sign in</Button>}
      <Txt muted style={{ fontSize: 12, lineHeight: 19 }}>{mode === "demo" ? "Try a sample account. All messages stay in the app." : "Private leagues for friends who choose to join."}</Txt>
    </Card>
  </View>;
}

export function ActivityCard() {
  const { state } = useSession();
  if (!state) return null;
  return <View style={{ gap: 18 }}>
    <Txt muted style={{ fontSize: 14, lineHeight: 22 }}>These are your confirmed plans. Compare a message with them before deciding.</Txt>
    {[["mail", "Your delivery", state.activityCard.order], ["sms", "Your tickets", state.activityCard.event], ["voice", "Your walk", state.activityCard.voice]].map(([icon, title, body]) => <View key={title} style={{ gap: 8 }}><Row style={{ gap: 9 }}><Icon name={icon as "mail"} color={C.teal} size={17} /><Txt style={{ fontWeight: "600", fontSize: 14 }}>{title}</Txt></Row><Txt muted style={{ fontSize: 13, lineHeight: 22 }}>{body}</Txt></View>)}
  </View>;
}

export default function Home() {
  const { state } = useSession();
  const width = useWindowDimensions().width;
  const [howTo, setHowTo] = useState(false);
  if (!state) return <Welcome />;
  if (!state.consent.acceptedAt && state.role !== "operator") return <View style={{ maxWidth: 620, alignSelf: "center", width: "100%" }}><Title sub="Choose how you’d like to play. You can pause anytime.">Before you cast</Title><ConsentForm /></View>;
  const league = state.leagues.find(item => item.id === state.selectedLeagueId);
  if (league && !league.myMatchId) return <View style={{ maxWidth: 640, width: "100%", alignSelf: "center", paddingTop: 12 }}><Title sub="Invite a friend to start your first match.">Better with a fishing buddy.</Title><Card style={{ gap: 20 }}><Txt muted>Share this league code</Txt><Txt selectable style={{ fontSize: 28, fontWeight: "700", color: C.teal, letterSpacing: 2 }}>{league.inviteCode}</Txt><Txt muted style={{ lineHeight: 22 }}>Your match appears when another player joins.</Txt><Button onPress={() => router.push("/leagues")}>Invite a friend</Button></Card></View>;
  const mine = state.match.scores[state.me.id] ?? 0;
  const theirs = state.match.scores[state.opponent.id] ?? 0;
  const done = state.match.state === "completed";
  const preparing = state.match.state === "drafting";
  const paused = state.consent.paused;
  const emailCasts = state.castRules.version === "email-casts-v2";
  const unread = state.incoming.filter(message => !message.decision).length;
  const remainingHours = Math.max(0, Math.ceil((state.match.deadline - state.now) / 3600000));
  const deadline = remainingHours >= 24 ? `${Math.ceil(remainingHours / 24)} days left` : `${remainingHours} hours left`;
  const enabled = emailCasts ? state.castRules.regularLimit : Object.entries(league?.settings.channels || state.consent.channels).filter(([, value]) => value).length;
  const ready = state.drafts.filter(draft => draft.locked && (emailCasts ? draft.channel === "email" && draft.kind !== "spear" : !league || league.settings.channels[draft.channel])).length;
  const spearReady = emailCasts && state.drafts.some(draft => draft.kind === "spear" && draft.locked);
  const answered = state.incoming.filter(message => message.decision).length;
  const hasReadyBait = ready > 0 || spearReady;
  const rank = state.league.members.find(member => member.id === state.me.id)?.rank;
  const completedLabel = state.match.result === "incomplete" ? "This match needs a review." : state.match.result === "no-contest" ? "No result this week." : state.match.winnerId === state.me.id ? "You won this week." : state.match.winnerId ? `${state.opponent.name} won this week.` : "You tied this week.";
  const title = paused && !done ? "Taking a break." : done ? "Your week, wrapped." : preparing ? "Let’s go fishing." : unread ? "Something’s on the line." : "Your lines are in the water.";
  const subtitle = paused && !done ? "Your messages are paused. Resume when you’re ready." : done ? completedLabel : preparing ? `Create a little bait for ${state.opponent.name}.` : unread ? `${unread} ${unread === 1 ? "message is" : "messages are"} waiting. Can you spot the phish?` : "We’ll let you know when a new message arrives.";
  return <View style={{ maxWidth: 720, alignSelf: "center", width: "100%", gap: 20, paddingTop: 8 }}>
    <Title sub={subtitle}>{title}</Title>
    <Card testID="home-match" style={{ padding: width < 500 ? 23 : 30, gap: 24 }}>
      <Row style={{ justifyContent: "space-between" }}><Txt muted style={{ fontSize: 13 }}>Week {state.match.week || league?.currentWeek || 1}</Txt><Txt muted style={{ fontSize: 13 }}>{done ? "Finished" : preparing ? "Getting ready" : deadline}</Txt></Row>
      <Row style={{ justifyContent: "space-between", gap: 10 }}>
        <View style={{ flex: 1, alignItems: "center", gap: 10 }}><Avatar name={state.me.name} color={C.teal} size={60} /><Txt style={{ fontSize: 16, fontWeight: "600" }}>{state.me.name}</Txt><Txt muted style={{ fontSize: 12 }}>You</Txt></View>
        {preparing ? <Hook size={48} color={C.muted} /> : <Row style={{ gap: 10 }}><Txt style={{ fontSize: width < 400 ? 35 : 44, fontWeight: "700", color: C.teal, fontVariant: ["tabular-nums"] }}>{mine}</Txt><Txt muted style={{ fontSize: 24 }}>–</Txt><Txt style={{ fontSize: width < 400 ? 35 : 44, fontWeight: "700", fontVariant: ["tabular-nums"] }}>{theirs}</Txt></Row>}
        <View style={{ flex: 1, alignItems: "center", gap: 10 }}><Avatar name={state.opponent.name} color={C.coral} size={60} /><Txt style={{ fontSize: 16, fontWeight: "600" }}>{state.opponent.name}</Txt><Txt muted style={{ fontSize: 12 }}>Your opponent</Txt></View>
      </Row>
      <View style={{ gap: 14 }}>
        <Txt muted style={{ textAlign: "center", fontSize: 13 }}>{preparing ? hasReadyBait ? `${ready} of ${enabled} ${emailCasts ? "casts" : "messages"} ready${spearReady ? " · Spear ready" : ""}` : "Pick a hobby. We’ll help with the message." : emailCasts ? state.incoming.length ? `${answered} of ${state.incoming.length} received emails answered` : "Your opponent’s casts will appear here." : `${6 - state.remaining} of 6 messages answered`}</Txt>
        <Button icon={paused && !done ? "settings" : done ? "sparkle" : preparing ? "hook" : "activity"} onPress={() => router.push(paused && !done ? "/settings" : done ? "/wrapped" : preparing ? "/draft" : "/activity")}>{paused && !done ? "Manage pause" : done ? "Watch Weekly Wrapped" : preparing ? hasReadyBait ? "Review and start" : "Create your bait" : unread ? "Read messages" : "Open inbox"}</Button>
        {emailCasts && !preparing && !done && !paused && ready < state.castRules.regularLimit && <Button variant="ghost" small onPress={() => router.push("/draft")}>Create your next cast</Button>}
      </View>
    </Card>
    <Pressable accessibilityRole="link" accessibilityLabel="View your league" onPress={() => router.push("/league")} style={{ paddingVertical: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}><Row style={{ gap: 10 }}><Icon name="league" color={C.muted} size={18} /><Txt muted style={{ fontSize: 14 }}>{rank ? `#${rank} in your league` : "Your league"}</Txt></Row><Txt style={{ color: C.teal, fontSize: 13 }}>View league →</Txt></Pressable>
    <View style={{ borderTopWidth: 1, borderTopColor: C.border }}>
      <Pressable accessibilityRole="button" aria-expanded={howTo} accessibilityState={{ expanded: howTo }} onPress={() => setHowTo(!howTo)} style={{ paddingVertical: 18, flexDirection: "row", justifyContent: "space-between" }}><Txt muted style={{ fontSize: 14 }}>How to play</Txt><Txt muted>{howTo ? "−" : "+"}</Txt></Pressable>
      {howTo && <View style={{ gap: 16, paddingBottom: 14 }}>{(emailCasts ? [["Choose your bait", "Two email casts each week. Pick something your friend enjoys, then create or edit your message. Your optional Spear adds one extra cast, once per league season."], ["Keep an eye on the water", "Read the emails that arrive. Flag bait you spot, or leave it alone. Opening its link counts as taking the bait."], ["See who gets hooked", "Someone takes your bait: +3. You take bait: −1. Each bait email you avoid, including those you ignore: +1 when the week ends."]] : [["Choose your bait", "Pick a hobby your friend enjoys and create a playful phishing message."], ["Spot the phish", "Your inbox mixes expected messages with bait. Compare each with your confirmed plans, then trust or flag."], ["See who gets hooked", "Correct answers earn 3 points. Fooling your friend with your bait earns 2."]]).map(([heading, detail]) => <View key={heading} style={{ gap: 5 }}><Txt style={{ fontSize: 14, fontWeight: "600" }}>{heading}</Txt><Txt muted style={{ fontSize: 14, lineHeight: 22 }}>{detail}</Txt></View>)}</View>}
    </View>
  </View>;
}
