import React, { useEffect, useState } from "react";
import { Linking, Platform, Pressable, View } from "react-native";
import { router } from "expo-router";
import { API, useSession, safely } from "../src/session";
import { Button, C, Card, Field, Row, Title, Toggle, Txt } from "../src/ui";
import { ConsentForm } from "../src/consent";
import { Welcome } from "./index";

type PhoneDetails = { verification: { ready: boolean; checks: { code: string; ok: boolean; detail: string }[] }; phoneNumber: string | null; verified: boolean };
function PhoneEnrollment({ onDetails }: { onDetails: (value: PhoneDetails) => void }) {
  const { request, busy, state } = useSession();
  const [details, setDetails] = useState<PhoneDetails | null>(null);
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [code, setCode] = useState("");
  const [requestId, setRequestId] = useState("");
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const [editing, setEditing] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    void request<PhoneDetails>("/api/phone").then(result => {
      if (!active) return;
      setDetails(result); onDetails(result); setPhone(result.phoneNumber || ""); setError("");
    }).catch(() => { if (active) setError("Could not load phone setup."); });
    return () => { active = false; };
  }, [request, state?.me.id, retry, onDetails]);
  const run = async (action: () => Promise<void>) => {
    setWorking(true); setError("");
    try { await action(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Phone verification did not finish. Try again."); }
    finally { setWorking(false); }
  };
  const disabled = busy || working;
  return <Card style={{ marginTop: 20, gap: 15 }}>
    <Txt style={{ fontSize: 19, fontWeight: "700" }}>Your phone</Txt>
    <Txt muted style={{ fontSize: 13, lineHeight: 21 }}>Optional for real texts and calls. Your number stays private from other players. Verifying it does not turn on contact; choose your preferences above.</Txt>
    {!!error && <Txt style={{ color: C.coral, fontSize: 13, lineHeight: 21 }}>{error}</Txt>}
    {!details ? error ? <Button small variant="secondary" disabled={disabled} onPress={() => setRetry(value => value + 1)}>Try again</Button> : <Txt muted>Checking phone setup…</Txt> : <>
      {details.verified && !editing && !requestId ? <>
        <Txt style={{ color: C.teal, fontWeight: "600" }}>{details.phoneNumber} · verified</Txt>
        <Row style={{ flexWrap: "wrap" }}><Button small variant="secondary" disabled={disabled || !details.verification.ready} onPress={() => { setEditing(true); setConsent(false); }}>Change number</Button><Button small variant="ghost" disabled={disabled} onPress={() => void run(async () => { await request("/api/phone/remove", {}); setDetails({ ...details, phoneNumber: null, verified: false }); setPhone(""); setConsent(false); })}>Remove phone</Button></Row>
      </> : !details.verification.ready ? <Txt muted style={{ fontSize: 13, lineHeight: 21 }}>Phone verification is not connected yet. The organizer can check Delivery details below.</Txt> : !requestId ? <>
        <Field label="Your phone number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" editable={!disabled} maxLength={12} placeholder="+14155550123" help="This demo supports US numbers. Enter +1 and your ten-digit number." />
        <Toggle label="Send me a verification text" detail="I agree to receive a one-time verification code at this number." value={consent} onChange={setConsent} />
        <Button loading={working} disabled={disabled || !consent || !/^\+1\d{10}$/.test(phone.trim())} onPress={() => void run(async () => { const result = await request<{ requestId: string }>("/api/phone/start", { phoneNumber: phone.trim(), consent: true }); setRequestId(result.requestId); setCode(""); })}>Send verification code</Button>
        {editing && <Button small variant="ghost" disabled={disabled} onPress={() => { setEditing(false); setPhone(details.phoneNumber || ""); setConsent(false); }}>Cancel change</Button>}
      </> : <>
        <Txt muted style={{ fontSize: 13, lineHeight: 21 }}>Enter the code sent to {phone.trim()}. It expires in ten minutes.</Txt>
        <Field label="Verification code" value={code} onChangeText={value => setCode(value.replace(/\D/g, ""))} keyboardType="number-pad" autoComplete="one-time-code" maxLength={10} editable={!disabled} />
        <Button loading={working} disabled={disabled || !/^\d{4,10}$/.test(code)} onPress={() => void run(async () => { const result = await request<{ verified: true; phoneNumber: string }>("/api/phone/verify", { requestId, code }); setDetails({ ...details, verified: true, phoneNumber: result.phoneNumber }); setPhone(result.phoneNumber); setRequestId(""); setCode(""); setConsent(false); setEditing(false); })}>Verify phone</Button>
        <Button small variant="ghost" disabled={disabled} onPress={() => { setRequestId(""); setCode(""); setError(""); }}>← Change number or request a new code</Button>
      </>}
    </>}
  </Card>;
}

export default function Settings() {
  const { state, busy, request, signOut, resetDemo } = useSession();
  const [showDelivery, setShowDelivery] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [phoneDetails, setPhoneDetails] = useState<PhoneDetails | null>(null);
  if (!state) return <Welcome />;
  return <View style={{ maxWidth: 750, width: '100%', alignSelf: 'center' }}>
    <Title>Settings</Title>
    <Txt muted style={{ fontSize: 13, lineHeight: 21, marginBottom: 18 }}>{state.emailDelivery === 'mailpit' ? 'Email delivery: local test inbox. Messages do not leave this computer.' : state.emailDelivery === 'simulated' ? 'Email delivery: simulated. Check text and voice status below before sending.' : state.emailDelivery === 'smtp-demo' ? 'Email delivery: connected demo. Text and voice each need their own setup.' : 'Real delivery is enabled for connected channels.'}</Txt>
    {!!state.consent.acceptedAt && Object.values(state.consent.channels).some(Boolean) && <Card style={{ marginBottom: 20 }}><Row style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 15 }}><Txt style={{ fontSize: 15 }}>{state.consent.paused ? 'Incoming messages are paused' : 'Incoming messages are on'}</Txt><Button small loading={busy} variant={state.consent.paused ? 'primary' : 'secondary'} onPress={() => void safely(request('/api/pause', { paused: !state.consent.paused }))}>{state.consent.paused ? 'Resume' : 'Pause messages'}</Button></Row></Card>}
    <ConsentForm onDone={() => router.push('/')} />
    <PhoneEnrollment onDetails={setPhoneDetails} />
    {Platform.OS === 'web' && <Card style={{ marginTop: 20, gap: 13 }}><Txt style={{ fontSize: 18, fontWeight: '700' }}>Phone preview</Txt><Txt muted style={{ fontSize: 14, lineHeight: 22 }}>Use the same app in an interactive phone frame on your computer.</Txt><Button variant="secondary" onPress={() => void Linking.openURL(`${API}/mobile-preview`)}>Open phone preview</Button></Card>}
    <View style={{ marginTop: 22, borderTopWidth: 1, borderTopColor: C.border }}><Pressable accessibilityRole="button" aria-expanded={showDelivery} accessibilityState={{ expanded: showDelivery }} onPress={() => setShowDelivery(!showDelivery)} style={{ paddingVertical: 18 }}><Txt muted style={{ fontSize: 14 }}>Delivery details {showDelivery ? '−' : '+'}</Txt></Pressable>{showDelivery && <View style={{ gap: 19, paddingBottom: 20 }}>{state.readiness.map((item) => <View key={item.channel} style={{ gap: 6 }}><Row style={{ justifyContent: 'space-between' }}><Txt style={{ fontSize: 14, fontWeight: '600' }}>{item.channel === 'sms' ? 'Text messages' : item.channel === 'voice' ? 'Voice calls' : 'Email'}</Txt><Txt style={{ fontSize: 12, color: item.status === 'simulated' || item.status === 'ready' ? C.teal : C.gold }}>{item.status}</Txt></Row><Txt muted style={{ fontSize: 12, lineHeight: 20 }}>{item.reason}</Txt></View>)}{phoneDetails && !phoneDetails.verification.ready && <View style={{ gap: 6 }}><Txt style={{ fontSize: 14, fontWeight: '600' }}>Phone verification setup</Txt>{phoneDetails.verification.checks.filter(check => !check.ok).map(check => <Txt key={check.code} muted style={{ fontSize: 12, lineHeight: 20 }}>{check.detail}</Txt>)}</View>}{state.mode === 'live' && <Txt muted style={{ fontSize: 12, lineHeight: 20 }}>Pausing cancels queued deliveries. A message already accepted by a carrier may still arrive.</Txt>}</View>}</View>
    <Row style={{ marginTop: 12, flexWrap: 'wrap' }}><Button variant="secondary" onPress={() => void signOut().then(() => router.replace('/'))}>Sign out</Button>{state.role === 'operator' && state.mode === 'demo' && <Button variant="ghost" onPress={() => router.push('/operator')}>Local tools</Button>}</Row>
    {state.demoReset && <View style={{ marginTop: 26, paddingTop: 20, borderTopWidth: 1, borderTopColor: C.border, gap: 12 }}>
      {confirmReset ? <Card style={{ gap: 16, borderColor: C.coral }}>
        <Txt style={{ fontSize: 18, fontWeight: '700' }}>{state.demoReset === 'all' ? 'Start this demo from scratch?' : 'Reset active leagues?'}</Txt>
        <Txt muted style={{ fontSize: 14, lineHeight: 23 }}>{state.demoReset === 'all' ? 'This removes all accounts, leagues and match progress from this demo. You’ll start again by creating an account.' : 'Current leagues and matches will be archived. Player accounts and email history stay saved. Emails already sent cannot be recalled.'}</Txt>
        <Button variant="coral" loading={busy} onPress={() => void safely(resetDemo().then(() => { setConfirmReset(false); router.replace('/'); }))}>{state.demoReset === 'all' ? 'Reset demo and start fresh' : 'Reset active leagues'}</Button>
        <Button variant="secondary" disabled={busy} onPress={() => setConfirmReset(false)}>Cancel — keep my progress</Button>
      </Card> : <Button variant="ghost" style={{ alignSelf: 'flex-start' }} disabled={busy} onPress={() => setConfirmReset(true)}>{state.demoReset === 'all' ? 'Reset demo' : 'Reset active leagues'}</Button>}
    </View>}
  </View>;
}
