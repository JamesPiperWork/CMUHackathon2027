import React, { useState } from "react";
import { Linking, Platform, Pressable, View } from "react-native";
import { router } from "expo-router";
import { API, useSession, safely } from "../src/session";
import { Button, C, Card, Row, Title, Txt } from "../src/ui";
import { ConsentForm } from "../src/consent";
import { Welcome } from "./index";

export default function Settings() {
  const { state, busy, request, signOut } = useSession();
  const [showDelivery, setShowDelivery] = useState(false);
  if (!state) return <Welcome />;
  return <View style={{ maxWidth: 750, width: '100%', alignSelf: 'center' }}>
    <Title>Settings</Title>
    <Card style={{ marginBottom: 20 }}><Row style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 15 }}><Txt style={{ fontSize: 15 }}>{state.consent.paused ? 'Incoming messages are paused' : 'Incoming messages are on'}</Txt><Button small loading={busy} variant={state.consent.paused ? 'primary' : 'secondary'} onPress={() => void safely(request('/api/pause', { paused: !state.consent.paused }))}>{state.consent.paused ? 'Resume' : 'Pause messages'}</Button></Row></Card>
    <ConsentForm onDone={() => router.push('/')} />
    {Platform.OS === 'web' && <Card style={{ marginTop: 20, gap: 13 }}><Txt style={{ fontSize: 18, fontWeight: '700' }}>Phone preview</Txt><Txt muted style={{ fontSize: 14, lineHeight: 22 }}>Use the same app in an interactive phone frame on your computer.</Txt><Button variant="secondary" onPress={() => void Linking.openURL(`${API}/mobile-preview`)}>Open phone preview</Button></Card>}
    <View style={{ marginTop: 22, borderTopWidth: 1, borderTopColor: C.border }}><Pressable accessibilityRole="button" aria-expanded={showDelivery} accessibilityState={{ expanded: showDelivery }} onPress={() => setShowDelivery(!showDelivery)} style={{ paddingVertical: 18 }}><Txt muted style={{ fontSize: 14 }}>Delivery details {showDelivery ? '−' : '+'}</Txt></Pressable>{showDelivery && <View style={{ gap: 19, paddingBottom: 20 }}>{state.readiness.filter((item) => state.castRules.version !== "email-casts-v2" || item.channel === "email").map((item) => <View key={item.channel} style={{ gap: 6 }}><Row style={{ justifyContent: 'space-between' }}><Txt style={{ fontSize: 14, fontWeight: '600' }}>{item.channel === 'sms' ? 'Text messages' : item.channel === 'voice' ? 'Voice calls' : 'Email'}</Txt><Txt style={{ fontSize: 12, color: item.status === 'simulated' || item.status === 'ready' ? C.teal : C.gold }}>{item.status}</Txt></Row><Txt muted style={{ fontSize: 12, lineHeight: 20 }}>{item.reason}</Txt></View>)}{state.mode === 'live' && <Txt muted style={{ fontSize: 12, lineHeight: 20 }}>Pausing cancels queued deliveries. A message already accepted by a carrier may still arrive.</Txt>}</View>}</View>
    <Row style={{ marginTop: 12, flexWrap: 'wrap' }}><Button variant="secondary" onPress={() => void signOut().then(() => router.replace('/'))}>Sign out</Button>{state.role === 'operator' && state.mode === 'demo' && <Button variant="ghost" onPress={() => router.push('/operator')}>Local tools</Button>}</Row>
  </View>;
}
