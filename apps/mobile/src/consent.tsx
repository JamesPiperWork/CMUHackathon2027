import React, { useState } from "react";
import { Pressable, View } from "react-native";
import { type Channel } from "@fp/shared";
import { useSession, safely } from "./session";
import { Button, C, Card, Field, Row, Toggle, Txt } from "./ui";
const zones = ["America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "America/Anchorage", "Pacific/Honolulu"];
export function ConsentForm({ onDone }: { onDone?: () => void }) {
  const { state, request, busy } = useSession();
  const [name, setName] = useState(state?.me.name || '');
  const [adult, setAdult] = useState(state?.consent.adult || false);
  const [channels, setChannels] = useState<Record<Channel, boolean>>(state?.consent.channels || { email: false, sms: false, voice: false });
  const [timezone, setTimezone] = useState(state?.consent.timezone || 'America/New_York');
  const [start, setStart] = useState(String(state?.consent.startHour ?? 10));
  const [end, setEnd] = useState(String(state?.consent.endHour ?? 20));
  const [family, setFamily] = useState(state?.consent.familyFriendly ?? true);
  const [excluded, setExcluded] = useState((state?.consent.excludedThemes || []).join(', '));
  const [more, setMore] = useState(false);
  const emailCasts = state?.castRules.version === "email-casts-v2";
  const hoursValid = Number.isInteger(Number(start)) && Number.isInteger(Number(end)) && Number(start) >= 0 && Number(end) <= 24 && Number(start) < Number(end);
  const hasChannel = emailCasts ? channels.email : Object.values(channels).some(Boolean);
  const valid = adult && name.trim().length >= 2 && hoursValid && (hasChannel || Boolean(state?.consent.acceptedAt));
  const save = () => request('/api/consent', { adult, displayName: name, channels, timezone, startHour: Number(start), endHour: Number(end), familyFriendly: family, excludedThemes: excluded.split(',').map((theme) => theme.trim()).filter(Boolean) }).then(() => onDone?.());
  return <Card style={{ gap: 18 }}>
    <View style={{ gap: 8 }}><Txt style={{ fontSize: 21, fontWeight: '700' }}>{state?.consent.acceptedAt ? 'Contact preferences' : 'Choose how to play'}</Txt><Txt muted style={{ fontSize: 14, lineHeight: 22 }}>{emailCasts ? 'Friends send playful phishing emails. Keep an eye out for the bait. You can pause at any time.' : 'Friends send fake and expected messages. Your job is to spot the bait. You can pause at any time.'}</Txt></View>
    <View>{((emailCasts ? ['email'] : ['email', 'sms', 'voice']) as Channel[]).map((channel) => <Toggle key={channel} label={channel === 'sms' ? 'Text messages' : channel === 'voice' ? 'Voice calls' : 'Email'} value={channels[channel]} onChange={(value) => setChannels({ ...channels, [channel]: value })} />)}</View>
    <Txt muted style={{ fontSize: 12, lineHeight: 20 }}>{state?.mode === 'demo' ? emailCasts ? 'These are in-app simulations. No real email is sent.' : 'These are in-app simulations. No real messages or calls are sent. Voice uses transcripts or synthetic audio.' : emailCasts ? 'Email uses your verified address when delivery is connected.' : 'Enabled channels use verified contact details when delivery is connected.'}</Txt>
    <View style={{ borderTopWidth: 1, borderTopColor: C.border, paddingTop: 16, gap: 8 }}><Txt muted style={{ fontSize: 13, lineHeight: 21 }}>Contact hours: {start}:00–{end}:00, {timezone.split('/').pop()?.replaceAll('_', ' ')}.</Txt><Toggle label="I’m 18 or older and agree to play" detail={emailCasts ? "I agree to receive surprise phishing simulations by email during these hours." : "I agree to receive surprise phishing simulations on my chosen channels during these hours."} value={adult} onChange={setAdult} /></View>
    <View style={{ display: more ? 'none' : 'flex' }}><Button disabled={!valid} loading={busy} onPress={() => void safely(save())}>{state?.consent.acceptedAt ? 'Save preferences' : 'Join the league'}</Button></View>
    {!hasChannel && !state?.consent.acceptedAt && <Txt muted style={{ fontSize: 12 }}>{emailCasts ? 'Enable email to join.' : 'Choose at least one channel to join.'}</Txt>}
    <Pressable accessibilityRole="button" aria-expanded={more} accessibilityState={{ expanded: more }} onPress={() => setMore(!more)} style={{ paddingVertical: 9 }}><Txt style={{ color: C.teal, fontSize: 14 }}>{more ? 'Fewer preferences −' : 'More preferences +'}</Txt></Pressable>
    {more && <View style={{ gap: 20, borderTopWidth: 1, borderTopColor: C.border, paddingTop: 19 }}>
      <Field label="Display name" value={name} onChangeText={setName} maxLength={24} />
      <View style={{ gap: 10 }}><Txt style={{ fontSize: 14, fontWeight: '600' }}>Time zone</Txt><Row style={{ flexWrap: 'wrap', gap: 8 }}>{zones.map((zone) => <Button small key={zone} variant={timezone === zone ? 'primary' : 'secondary'} onPress={() => setTimezone(zone)}>{zone.split('/')[1].replaceAll('_', ' ')}</Button>)}</Row></View>
      <Row style={{ alignItems: 'flex-start' }}><View style={{ flex: 1 }}><Field label="From (24h)" value={start} onChangeText={setStart} maxLength={2} /></View><View style={{ flex: 1 }}><Field label="Until (24h)" value={end} onChangeText={setEnd} maxLength={2} /></View></Row>
      {!hoursValid && <Txt style={{ color: C.coral, fontSize: 13 }}>Choose valid hours, with the end later than the start.</Txt>}
      <Field label="Topics to avoid" value={excluded} onChangeText={setExcluded} maxLength={120} placeholder="For example: deliveries" help="Optional. Separate topics with commas." />
      <Toggle label="Family-friendly themes" value={family} onChange={setFamily} />
      <Button disabled={!valid} loading={busy} onPress={() => void safely(save())}>Save preferences</Button>
    </View>}
  </Card>;
}
