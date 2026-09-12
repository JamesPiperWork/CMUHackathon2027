import React, { useState } from "react";
import { Pressable, View, useWindowDimensions } from "react-native";
import { router } from "expo-router";
import { useSession, safely } from "../src/session";
import { Avatar, Button, C, Card, Field, Hook, Icon, Row, Title, Txt } from "../src/ui";
import { ConsentForm } from "../src/consent";

export function Welcome() {
  const { createAccount, signIn, signInLive, startEmailSignIn, verifyEmailSignIn, clearError, busy, mode, emailDelivery } = useSession();
  const [creating, setCreating] = useState(true);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [code, setCode] = useState("");
  const [requestId, setRequestId] = useState("");
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) && email.trim().length <= 254;
  const localValid = emailValid && password.length <= 128 && (creating ? name.trim().length >= 2 && name.trim().length <= 24 && password.length >= 10 : password.length > 0);
  const switchMode = () => {
    setCreating(!creating);
    setPassword("");
    setShowPassword(false);
    setCode("");
    setRequestId("");
    clearError();
  };
  const submitAccount = () => void safely((creating ? createAccount(name.trim(), email.trim(), password) : signIn(email.trim(), password)).then(() => {
    setPassword("");
    router.replace("/");
  }));
  return <View style={{ width: "100%", maxWidth: 480, alignSelf: "center", gap: 24, paddingTop: 22 }}>
    <View style={{ gap: 13 }}><Hook size={58} /><Txt style={{ fontSize: 35, lineHeight: 41, fontWeight: "700", letterSpacing: -1 }}>A little bait.{"\n"}A friendly rivalry.</Txt><Txt muted style={{ fontSize: 16, lineHeight: 25 }}>Send playful phishing challenges to friends. Spot theirs. See who gets hooked.</Txt></View>
    <Card style={{ gap: 18, padding: 22 }}>
      <View style={{ gap: 6 }}><Txt style={{ fontSize: 22, fontWeight: "700" }}>{requestId ? "Check your email" : creating ? "Create your account" : "Welcome back"}</Txt><Txt muted style={{ fontSize: 14, lineHeight: 22 }}>{creating ? "Set up your player, then find your fishing crew." : "Sign in to pick up where you left off."}</Txt></View>
      {emailDelivery === "smtp-demo" ? <View style={{ gap: 15 }}>
        {!requestId ? <>
          <Field label="Email address" value={email} onChangeText={setEmail} editable={!busy} autoCapitalize="none" autoComplete="email" autoCorrect={false} keyboardType="email-address" placeholder="you@example.com" help="We’ll send a code to verify this inbox. Your game emails will arrive here too." />
          <Button loading={busy} disabled={!emailValid} onPress={() => void safely(startEmailSignIn(email.trim()).then(setRequestId))}>{creating ? "Create account with email" : "Email me a sign-in code"}</Button>
        </> : <>
          <Txt muted style={{ lineHeight: 22 }}>Enter the six-digit code sent to {email.trim()}. It expires in ten minutes.</Txt>
          <Field label="Sign-in code" value={code} onChangeText={value => setCode(value.replace(/\D/g, ""))} editable={!busy} keyboardType="number-pad" autoComplete="one-time-code" maxLength={6} />
          <Button loading={busy} disabled={!/^\d{6}$/.test(code)} onPress={() => void safely(verifyEmailSignIn(requestId, code).then(() => router.replace("/")))}>{creating ? "Verify email and continue" : "Sign in"}</Button>
          <Button variant="ghost" small disabled={busy} onPress={() => { setRequestId(""); setCode(""); clearError(); }}>← Change email or request another code</Button>
        </>}
      </View> : mode === "demo" ? <View style={{ gap: 16 }}>
        {creating && <Field label="Your name" value={name} onChangeText={setName} editable={!busy} autoComplete="name" placeholder="How your friends know you" />}
        <Field label="Email address" value={email} onChangeText={setEmail} editable={!busy} autoCapitalize="none" autoComplete="email" autoCorrect={false} keyboardType="email-address" placeholder="you@example.com" />
        <View style={{ gap: 3 }}>
          <Field label="Password" value={password} onChangeText={setPassword} editable={!busy} secureTextEntry={!showPassword} autoCapitalize="none" autoComplete={creating ? "new-password" : "current-password"} autoCorrect={false} help={creating ? "Use 10–128 characters." : undefined} />
          <Button small variant="ghost" disabled={busy} style={{ alignSelf: "flex-end" }} onPress={() => setShowPassword(!showPassword)}>{showPassword ? "Hide password" : "Show password"}</Button>
        </View>
        <Button loading={busy} disabled={!localValid} onPress={submitAccount}>{creating ? "Create account" : "Sign in"}</Button>
      </View> : <Button loading={busy} onPress={() => void signInLive()}>{creating ? "Create account" : "Sign in"}</Button>}
      {!requestId && <Button variant="ghost" small disabled={busy} onPress={switchMode}>{creating ? "Already have an account? Sign in" : "New here? Create an account"}</Button>}
      <Txt muted style={{ fontSize: 12, lineHeight: 19 }}>{emailDelivery === "smtp-demo" ? "Game emails are clearly labeled. You choose your delivery preferences next." : mode === "demo" ? "Emails are simulated until delivery is connected." : "Private leagues for friends who choose to join."}</Txt>
    </Card>
  </View>;
}

export default function Home() {
  const { state } = useSession();
  const width = useWindowDimensions().width;
  const [howTo, setHowTo] = useState(false);
  if (!state) return <Welcome />;
  if ((state.setupStage === "player" || !state.consent.acceptedAt) && state.role !== "operator") return <View style={{ maxWidth: 620, alignSelf: "center", width: "100%" }}><Title sub="Choose how you’d like to play. You can pause anytime.">Your player, your preferences.</Title><ConsentForm onDone={() => router.push("/leagues")} /></View>;
  if (!state.leagues.length) return <View style={{ maxWidth: 620, alignSelf: "center", width: "100%", gap: 18 }}><Title sub="Create a private league or join your friends with an invite code.">Find your fishing crew.</Title><Card style={{ gap: 16 }}><Txt muted style={{ lineHeight: 23 }}>Your player is ready. Set the league’s rules, invite a friend, and create your first bait together.</Txt><Button onPress={() => router.push("/leagues")}>Set up your league</Button><Button small variant="ghost" onPress={() => router.push("/settings")}>Edit player preferences</Button></Card></View>;
  const league = state.leagues.find(item => item.id === state.selectedLeagueId);
  if (league && !league.myMatchId) return <View style={{ maxWidth: 640, width: "100%", alignSelf: "center", paddingTop: 12 }}><Title sub="Invite a friend to start your first match.">Better with a fishing buddy.</Title><Card style={{ gap: 20 }}><Txt muted>Share this league code</Txt><Txt selectable style={{ fontSize: 28, fontWeight: "700", color: C.teal, letterSpacing: 2 }}>{league.inviteCode}</Txt><Txt muted style={{ lineHeight: 22 }}>Your match appears when another player joins.</Txt><Button onPress={() => router.push("/leagues")}>Invite a friend</Button></Card></View>;
  const mine = state.match.scores[state.me.id] ?? 0;
  const theirs = state.match.scores[state.opponent.id] ?? 0;
  const done = state.match.state === "completed";
  const preparing = state.match.state === "drafting";
  const paused = state.consent.paused;
  const emailCasts = state.castRules.version === "email-casts-v2";
  const immediateDelivery = state.deliveryTiming === "immediate";
  const remainingHours = Math.max(0, Math.ceil((state.match.deadline - state.now) / 3600000));
  const deadline = remainingHours >= 24 ? `${Math.ceil(remainingHours / 24)} days left` : `${remainingHours} hours left`;
  const enabled = emailCasts ? state.castRules.regularLimit : Object.entries(league?.settings.channels || state.consent.channels).filter(([, value]) => value).length;
  const ready = state.drafts.filter(draft => draft.locked && (emailCasts ? draft.kind !== "spear" : !league || league.settings.channels[draft.channel])).length;
  const spearReady = emailCasts && state.drafts.some(draft => draft.kind === "spear" && draft.locked);
  const hasReadyBait = ready > 0 || spearReady;
  const rank = state.league.members.find(member => member.id === state.me.id)?.rank;
  const completedLabel = state.match.result === "incomplete" ? "This match needs a review." : state.match.result === "no-contest" ? "No result this week." : state.match.winnerId === state.me.id ? "You won this week." : state.match.winnerId ? `${state.opponent.name} won this week.` : "You tied this week.";
  const title = paused && !done ? "Taking a break." : done ? "This week’s result." : preparing ? "Let’s go fishing." : "Your lines are in the water.";
  const subtitle = paused && !done ? "Your messages are paused. Resume when you’re ready." : done ? completedLabel : preparing ? `Create a little bait for ${state.opponent.name}.` : state.emailDelivery === "simulated" ? "Check each cast’s delivery status in Bait. Simulated casts stay in this app." : "Your opponent’s bait arrives through the channels you chose.";
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
        <Txt muted style={{ textAlign: "center", fontSize: 13 }}>{done ? "See the final scores and standings in your league." : immediateDelivery ? "Choose email, text or voice. Review and send from Bait." : preparing ? hasReadyBait ? `${ready} of ${enabled} ${emailCasts ? "casts" : "messages"} ready${spearReady ? " · Spear ready" : ""}` : "Choose a medium and describe your idea." : "See your casts and their delivery status in Bait."}</Txt>
        <Button icon={paused && !done ? "settings" : done ? "league" : "hook"} onPress={() => router.push(paused && !done ? "/settings" : done ? "/matchups" : "/draft")}>{paused && !done ? "Manage pause" : done ? "View match results" : immediateDelivery ? preparing ? hasReadyBait ? "Review and send" : "Create your bait" : "Open Bait" : preparing ? hasReadyBait ? "Review and start" : "Create your bait" : "Review your casts"}</Button>
      </View>
    </Card>
    <Pressable accessibilityRole="link" accessibilityLabel="View your league" onPress={() => router.push("/league")} style={{ paddingVertical: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}><Row style={{ gap: 10 }}><Icon name="league" color={C.muted} size={18} /><Txt muted style={{ fontSize: 14 }}>{rank ? `#${rank} in your league` : "Your league"}</Txt></Row><Txt style={{ color: C.teal, fontSize: 13 }}>View league →</Txt></Pressable>
    <View style={{ borderTopWidth: 1, borderTopColor: C.border }}>
      <Pressable accessibilityRole="button" aria-expanded={howTo} accessibilityState={{ expanded: howTo }} onPress={() => setHowTo(!howTo)} style={{ paddingVertical: 18, flexDirection: "row", justifyContent: "space-between" }}><Txt muted style={{ fontSize: 14 }}>How to play</Txt><Txt muted>{howTo ? "−" : "+"}</Txt></Pressable>
      {howTo && <View style={{ gap: 16, paddingBottom: 14 }}>{(emailCasts ? [["Choose your bait", "Two casts each week, in any mix of email, text or voice. Describe your idea, then edit the message. Your optional Spear adds one cast per league season."], ["Choose how to receive bait", "Email goes to your registered inbox. Texts and calls require your own opt-in and verified phone. Review delivery status in Bait; simulated casts contact nobody."], ["See who gets hooked", "Someone takes your bait: +3. You take bait: −1. Each received bait email you avoid: +1 when the week ends."]] : [["Choose your bait", "Pick a hobby your friend enjoys and create a playful phishing message."], ["Spot the phish", "Compare a message with your confirmed plans before following a link."], ["See who gets hooked", "Correct answers earn 3 points. Fooling your friend with your bait earns 2."]]).map(([heading, detail]) => <View key={heading} style={{ gap: 5 }}><Txt style={{ fontSize: 14, fontWeight: "600" }}>{heading}</Txt><Txt muted style={{ fontSize: 14, lineHeight: 22 }}>{detail}</Txt></View>)}</View>}
    </View>
  </View>;
}
