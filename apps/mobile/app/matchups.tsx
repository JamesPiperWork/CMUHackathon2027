import React, { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, View } from "react-native";
import { router } from "expo-router";
import type { LeagueMatchup, LeagueSummary } from "@fp/shared";
import { useSession, safely } from "../src/session";
import { useLeagueResource } from "../src/league-resource";
import { Avatar, Button, C, Card, Empty, Row, Title, Txt } from "../src/ui";
import { Welcome } from "./index";

export default function Matchups() {
  const { state, request, busy } = useSession();
  const [selectedWeek, setWeek] = useState<number | null>(null);
  const leagueId = state?.selectedLeagueId;
  const { data, error, reload } = useLeagueResource<{ league: LeagueSummary; matchups: LeagueMatchup[] }>(leagueId ? `/api/leagues/${leagueId}/matchups` : null);
  useEffect(() => setWeek(null), [leagueId, data?.league.currentWeek]);
  if (!state) return <Welcome />;
  const league = data?.league || state.leagues.find((item) => item.id === leagueId);
  const weeks = Array.from(new Set([league?.currentWeek || 1, ...(data?.matchups.map((item) => item.week) || [])])).sort((a, b) => a - b);
  const week = selectedWeek && weeks.includes(selectedWeek) ? selectedWeek : league?.currentWeek || 1;
  const matchups = data?.matchups.filter((item) => item.week === week) || [];
  const select = async (id: string) => { await request(`/api/matches/${id}/select`, {}); router.push('/'); };
  return <View style={{ maxWidth: 820, width: '100%', alignSelf: 'center' }}>
    <Button small variant="ghost" style={{ alignSelf: 'flex-start', paddingHorizontal: 0, marginBottom: 12 }} onPress={() => router.push('/league')}>‹ Back to league</Button>
    <Title sub={league?.name}>Weekly matches</Title>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginBottom: 22 }}>{weeks.map((item) => <Button key={item} small variant={item === week ? 'primary' : 'secondary'} onPress={() => setWeek(item)}>Week {item}</Button>)}</ScrollView>
    {error ? <Card style={{ gap: 13 }}><Txt style={{ color: C.coral }}>{error}</Txt><Button small onPress={reload}>Retry</Button></Card> : !data ? <ActivityIndicator color={C.teal} /> : !matchups.length ? <Empty icon="shield" title="Waiting for another player">Share your league’s invite code with a friend to start the first match.</Empty> : <View style={{ gap: 16 }}>{matchups.map((match) => {
      const mine = match.players.some((player) => player.id === state.me.id);
      const done = match.state === 'completed';
      return <Card key={match.id} style={{ gap: 19 }}>
        <Row style={{ justifyContent: 'space-between' }}><Txt style={{ color: mine ? C.teal : C.muted, fontSize: 13 }}>{mine ? 'Your match' : 'League match'}</Txt><Txt muted style={{ fontSize: 13 }}>{done ? 'Finished' : match.state === 'active' ? 'In progress' : match.state === 'drafting' ? 'Preparing bait' : match.state === 'cancelled' ? 'Cancelled' : 'Finishing'}</Txt></Row>
        {match.players.map((player) => <Row key={player.id} style={{ gap: 13 }}><Avatar name={player.name} color={player.color} size={40} /><Txt style={{ flex: 1, fontSize: 16, fontWeight: '600' }}>{player.name}</Txt>{done && match.winnerId === player.id && <Txt style={{ fontSize: 12, color: C.teal }}>Winner</Txt>}<Txt style={{ fontSize: 29, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{match.scores[player.id] || 0}</Txt></Row>)}
        <Row style={{ justifyContent: 'space-between', gap: 8, borderTopWidth: 1, borderTopColor: C.border, paddingTop: 14 }}><Txt muted style={{ fontSize: 12, flex: 1 }}>{match.synthetic ? 'Sample match' : done && match.result === 'draw' ? 'A draw' : ''}</Txt>{!done && match.playable ? <Button small loading={busy} onPress={() => void safely(select(match.id))}>Open match</Button> : null}</Row>
      </Card>;
    })}</View>}
  </View>;
}
