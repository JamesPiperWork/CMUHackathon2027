import React, { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { router } from "expo-router";
import type { LeagueChatMessage } from "@fp/shared";
import { useSession, safely } from "../src/session";
import { useLeagueResource } from "../src/league-resource";
import { Avatar, Button, C, Card, Field, Row, Title, Txt } from "../src/ui";
import { Welcome } from "./index";

export default function Chat() {
  const { state, request, busy } = useSession();
  const [body, setBody] = useState('');
  const leagueId = state?.selectedLeagueId;
  useEffect(() => setBody(''), [leagueId]);
  const { data, error, reload } = useLeagueResource<{ messages: LeagueChatMessage[] }>(leagueId ? `/api/leagues/${leagueId}/chat` : null);
  if (!state) return <Welcome />;
  const league = state.leagues.find((item) => item.id === leagueId);
  const send = async () => { await request(`/api/leagues/${leagueId}/chat`, { body: body.trim() }); setBody(''); reload(); };
  return <View style={{ maxWidth: 820, width: '100%', alignSelf: 'center' }}>
    <Button small variant="ghost" style={{ alignSelf: 'flex-start', paddingHorizontal: 0, marginBottom: 12 }} onPress={() => router.push('/league')}>‹ Back to league</Button>
    <Title sub={league?.name}>Chat</Title>
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      <View style={{ padding: 20, gap: 25, minHeight: 180 }}>{error ? <View style={{ gap: 12 }}><Txt style={{ color: C.coral }}>{error}</Txt><Button small onPress={reload}>Retry</Button></View> : !data ? <ActivityIndicator color={C.teal} /> : !data.messages.length ? <View style={{ gap: 10, paddingVertical: 24 }}><Txt style={{ fontSize: 18, fontWeight: '600' }}>Say hello to your league.</Txt><Txt muted style={{ fontSize: 14 }}>Your friends’ messages will appear here.</Txt></View> : data.messages.map((message) => <Row key={message.id} style={{ gap: 11, alignItems: 'flex-start' }}><Avatar name={message.author.name} color={message.author.color} size={35} /><View style={{ flex: 1, gap: 8 }}><Row style={{ gap: 9, flexWrap: 'wrap' }}><Txt style={{ fontSize: 14, fontWeight: '600', color: message.userId === state.me.id ? C.teal : C.text }}>{message.author.name}</Txt><Txt muted style={{ fontSize: 11 }}>{new Date(message.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}{message.synthetic ? ' · Sample' : ''}</Txt></Row><Txt style={{ fontSize: 15, lineHeight: 24 }}>{message.body}</Txt></View></Row>)}</View>
      <View style={{ borderTopWidth: 1, borderTopColor: C.border, padding: 19, gap: 12 }}><Field label="Message" value={body} onChangeText={setBody} placeholder="Message your league" multiline maxLength={500} /><Row style={{ justifyContent: 'space-between', gap: 15 }}><Txt muted style={{ fontSize: 12, lineHeight: 19, flex: 1 }}>Messages may appear in a weekly recap.</Txt><Button loading={busy} disabled={!body.trim()} onPress={() => void safely(send())}>Send</Button></Row></View>
    </Card>
  </View>;
}
