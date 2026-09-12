import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import type { LeagueMatchup, LeagueSettings, Profile } from "@fp/shared";
import { useSession, safely } from "../src/session";
import { useLeagueResource } from "../src/league-resource";
import { Avatar, Button, C, Card, Field, Icon, Label, Row, Title, Toggle, Txt } from "../src/ui";
import { Welcome } from "./index";

type RankedMember = Profile & { rank: number; movement: number };
export default function League() {
  const { state, request, busy } = useSession();
  const { invite } = useLocalSearchParams<{ invite?: string }>();
  const [query, setQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [difficulty, setDifficulty] = useState<LeagueSettings['difficulty']>('standard');
  const [family, setFamily] = useState(true);
  const [saved, setSaved] = useState(false);
  const leagueId = state?.selectedLeagueId;
  const league = state?.leagues.find((item) => item.id === leagueId);
  const { data, error, reload } = useLeagueResource<{ members: RankedMember[] }>(leagueId ? `/api/leagues/${leagueId}/standings` : null);
  const { data: matches } = useLeagueResource<{ matchups: LeagueMatchup[] }>(leagueId ? `/api/leagues/${leagueId}/matchups` : null);
  useEffect(() => {
    if (!league) return;
    setDifficulty(league.settings.difficulty); setFamily(league.settings.familyFriendly); setSaved(false);
  }, [league?.id, league?.settings.difficulty, league?.settings.familyFriendly, league?.settings.channels.email, league?.settings.channels.sms, league?.settings.channels.voice]);
  useEffect(() => { setShowSettings(invite === '1'); setQuery(''); }, [leagueId, invite]);
  if (!state) return <Welcome />;
  const commissioner = league?.commissionerId === state.me.id;
  const members = (data?.members || []).filter((member) => member.name.toLowerCase().includes(query.toLowerCase()));
  const nextReady = matches && matches.matchups.some((match) => match.week === league?.currentWeek) && matches.matchups.filter((match) => match.week === league?.currentWeek).every((match) => ['completed', 'cancelled'].includes(match.state));
  const saveRules = async () => { await request(`/api/leagues/${leagueId}/settings`, { difficulty, familyFriendly: family, channels: league?.settings.channels || { email: true, sms: false, voice: false } }); setSaved(true); };
  const nextWeek = async () => { await request(`/api/leagues/${leagueId}/next-week`, {}); router.push('/matchups'); };
  return <View style={{ maxWidth: 820, width: '100%', alignSelf: 'center' }}>
    <Title sub={`${league?.memberCount || 0} players · Week ${league?.currentWeek || 1}`}>{league?.name || state.league.name}</Title>
    <Row style={{ gap: 8, marginBottom: 24 }}>
      {([['/matchups', 'Matches', 'shield'], ['/chat', 'Chat', 'sms'], ['/wrapped', 'Wrapped', 'sparkle']] as const).map(([href, label, icon]) => <Button key={href} style={{ flex: 1, paddingHorizontal: 9 }} variant="secondary" icon={icon} onPress={() => router.push(href)}>{label}</Button>)}
    </Row>
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      <View style={{ padding: 18, gap: 15 }}><Row style={{ justifyContent: 'space-between' }}><Txt style={{ fontSize: 20, fontWeight: '700' }}>Leaderboard</Txt><Pressable accessibilityRole="button" aria-expanded={showSearch} accessibilityState={{ expanded: showSearch }} onPress={() => { setShowSearch(!showSearch); setQuery(''); }} style={{ padding: 8 }}><Txt style={{ fontSize: 13, color: C.teal }}>{showSearch ? 'Close search' : 'Find a player'}</Txt></Pressable></Row>{showSearch && <Field label="Player name" value={query} onChangeText={setQuery} placeholder="Search players" />}</View>
      <Row style={{ gap: 0, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: C.panelDeep }}><Txt muted style={{ width: 27, fontSize: 12 }}>#</Txt><Txt muted style={{ flex: 1, fontSize: 12 }}>Player</Txt><Txt muted style={{ width: 64, textAlign: 'center', fontSize: 12 }}>W–L–D</Txt><Txt muted style={{ width: 44, textAlign: 'right', fontSize: 12 }}>Points</Txt></Row>
      {error ? <View style={{ padding: 18, gap: 12 }}><Txt style={{ color: C.coral }}>{error}</Txt><Button small onPress={reload}>Retry</Button></View> : !data ? <ActivityIndicator color={C.teal} style={{ padding: 30 }} /> : !members.length ? <Txt muted style={{ padding: 20 }}>No players match that name.</Txt> : members.map((member) => <Row key={member.id} style={{ gap: 0, paddingHorizontal: 16, paddingVertical: 16, borderTopWidth: 1, borderTopColor: C.border, backgroundColor: member.id === state.me.id ? C.tealDark : 'transparent' }}><Txt style={{ width: 27, fontSize: 14, color: member.rank === 1 ? C.gold : C.muted }}>{member.rank}</Txt><Row style={{ flex: 1, gap: 10 }}><Avatar name={member.name} color={member.color} size={33} /><View style={{ flex: 1, gap: 4 }}><Txt style={{ fontSize: 14, fontWeight: '600' }}>{member.name}</Txt>{member.movement !== 0 && <Txt style={{ fontSize: 11, color: member.movement > 0 ? C.teal : C.coral }}>{member.movement > 0 ? '↑' : '↓'} {Math.abs(member.movement)} {Math.abs(member.movement) === 1 ? 'place' : 'places'}</Txt>}</View></Row><Txt muted style={{ width: 64, textAlign: 'center', fontSize: 12, fontVariant: ['tabular-nums'] }}>{member.wins}–{member.losses}–{member.draws}</Txt><Txt style={{ width: 44, textAlign: 'right', fontSize: 20, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{member.leaguePoints}</Txt></Row>)}
    </Card>
    <Txt muted style={{ fontSize: 12, lineHeight: 20, marginTop: 12 }}>Win: 3 points · Draw: 1 · Loss: 0</Txt>
    <View style={{ marginTop: 24, borderTopWidth: 1, borderTopColor: C.border }}>
      <Pressable accessibilityRole="button" aria-expanded={showSettings} accessibilityState={{ expanded: showSettings }} onPress={() => setShowSettings(!showSettings)} style={{ paddingVertical: 19, flexDirection: 'row', alignItems: 'center', gap: 10 }}><Icon name="settings" color={C.muted} size={18} /><Txt style={{ flex: 1, fontSize: 15 }}>League settings & invitations</Txt><Txt muted>{showSettings ? '−' : '+'}</Txt></Pressable>
      {showSettings && <View style={{ gap: 20, paddingBottom: 20 }}>
        <Card style={{ gap: 12 }}><Txt style={{ fontSize: 17, fontWeight: '700' }}>Invite a friend</Txt><Txt muted style={{ fontSize: 13, lineHeight: 21 }}>They can enter this code in My leagues.</Txt><Txt style={{ fontSize: 25, fontWeight: '700', letterSpacing: 2, color: C.teal }}>{league?.inviteCode}</Txt><Button small variant="secondary" onPress={() => router.push('/leagues')}>My leagues</Button></Card>
        <Card style={{ gap: 15 }}><Txt style={{ fontSize: 17, fontWeight: '700' }}>Rules</Txt><Txt muted style={{ fontSize: 13, lineHeight: 21 }}>Two email casts each week. One optional Spear per player, per league season.</Txt><Label>Difficulty</Label><Row style={{ gap: 7 }}>{(['rookie', 'standard', 'expert'] as const).map((value) => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: difficulty === value, disabled: !commissioner }} disabled={!commissioner} onPress={() => { setDifficulty(value); setSaved(false); }} style={{ flex: 1, paddingVertical: 12, borderRadius: 7, borderWidth: 1, borderColor: difficulty === value ? C.teal : C.border, alignItems: 'center', backgroundColor: difficulty === value ? C.tealDark : C.panelDeep }}><Txt style={{ fontSize: 13, color: difficulty === value ? C.teal : C.muted }}>{value === 'rookie' ? 'Easy' : value === 'standard' ? 'Standard' : 'Hard'}</Txt></Pressable>)}</Row><Txt muted style={{ fontSize: 12, lineHeight: 19 }}>New message versions per cast: Easy 5 · Standard 3 · Hard 1.</Txt>
          {commissioner ? <><Toggle label="Family-friendly themes" value={family} onChange={(value) => { setFamily(value); setSaved(false); }} /><Button loading={busy} onPress={() => void safely(saveRules())}>{saved ? 'Saved' : 'Save rules'}</Button></> : <Txt muted style={{ fontSize: 13, lineHeight: 21 }}>The league organizer can edit these rules. {family ? 'Family-friendly themes are on.' : ''}</Txt>}
        </Card>
        {commissioner && <Card style={{ gap: 13 }}><Txt style={{ fontSize: 17, fontWeight: '700' }}>Start another week</Txt><Txt muted style={{ fontSize: 13, lineHeight: 21 }}>{nextReady ? 'Everyone has finished. The next week will pair players for new matches.' : 'Finish all this week’s matches before starting the next one.'}</Txt><Button disabled={!nextReady} loading={busy} variant="secondary" onPress={() => void safely(nextWeek())}>Start week {(league?.currentWeek || 1) + 1}</Button></Card>}
      </View>}
    </View>
  </View>;
}
