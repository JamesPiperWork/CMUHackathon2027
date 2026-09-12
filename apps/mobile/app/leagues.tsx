import React, { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { useSession, safely } from "../src/session";
import { Button, C, Card, Field, Icon, Row, Title, Txt } from "../src/ui";
import { Welcome } from "./index";

export default function Leagues() {
  const { state, request, busy } = useSession();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [form, setForm] = useState<'create' | 'join' | null>(null);
  if (!state) return <Welcome />;
  const select = async (id: string) => { await request(`/api/leagues/${id}/select`, {}); router.push('/league'); };
  const create = async () => { await request('/api/leagues', { name: name.trim() }); setName(''); setForm(null); router.push('/league?invite=1' as '/league'); };
  const join = async () => { await request('/api/leagues/join', { inviteCode: code.trim() }); setCode(''); setForm(null); router.push('/league'); };
  return <View style={{ maxWidth: 750, width: '100%', alignSelf: 'center' }}>
    <Title sub="Play with a different group of friends in each league.">My leagues</Title>
    <Row style={{ gap: 10, marginBottom: 24 }}><Button small onPress={() => setForm(form === 'create' ? null : 'create')}>Create a league</Button><Button small variant="secondary" onPress={() => setForm(form === 'join' ? null : 'join')}>Join a league</Button></Row>
    {form && <Card style={{ marginBottom: 22, gap: 15 }}><Row style={{ justifyContent: 'space-between' }}><Txt style={{ fontSize: 18, fontWeight: '700' }}>{form === 'create' ? 'New league' : 'Enter your invite code'}</Txt><Button small variant="ghost" onPress={() => setForm(null)}>Cancel</Button></Row>{form === 'create' ? <Field label="League name" value={name} onChangeText={setName} maxLength={48} placeholder="The fishing club" /> : <Field label="Invite code" value={code} onChangeText={setCode} maxLength={20} placeholder="Code from your friend" />}<Button loading={busy} disabled={form === 'create' ? name.trim().length < 3 : code.trim().length < 4} onPress={() => void safely(form === 'create' ? create() : join())}>{form === 'create' ? 'Create league' : 'Join league'}</Button></Card>}
    <View style={{ gap: 15 }}>{state.leagues.map((league) => <Card key={league.id} style={{ gap: 18 }}><Row style={{ gap: 13 }}><Icon name="league" color={C.teal} size={24} /><View style={{ flex: 1, gap: 6 }}><Txt style={{ fontSize: 19, fontWeight: '700' }}>{league.name}</Txt><Txt muted style={{ fontSize: 13 }}>{league.memberCount} players · Week {league.currentWeek}</Txt></View>{league.id === state.selectedLeagueId && <Icon name="check" color={C.teal} size={19} />}</Row><Button small variant="secondary" loading={busy} onPress={() => void safely(select(league.id))}>Open league</Button></Card>)}</View>
  </View>;
}
