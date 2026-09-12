import React, { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { type Channel } from "@fp/shared";
import { useSession, safely } from "./session";
import { Button, C, Card, Field, Row, Toggle, Txt } from "./ui";
const zones = ["America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "America/Anchorage", "Pacific/Honolulu"];
export function ConsentForm({ onDone }: { onDone?: () => void }) {
  const { state, request, busy, emailDelivery } = useSession();
  const [name, setName] = useState(state?.me.name || "");
  const [email, setEmail] = useState(state?.consent.contacts.email?.destination || "");
  const [adult, setAdult] = useState(state?.consent.adult || false);
  const [channels, setChannels] = useState<Record<Channel, boolean>>(state?.consent.channels || { email: false, sms: false, voice: false });
  const [timezone, setTimezone] = useState(state?.consent.timezone || "America/New_York");
  const [start, setStart] = useState(String(state?.consent.startHour ?? 10));
  const [end, setEnd] = useState(String(state?.consent.endHour ?? 20));
  const [family, setFamily] = useState(state?.consent.familyFriendly ?? true);
  const [excluded, setExcluded] = useState((state?.consent.excludedThemes || []).join(", "));
  const [more, setMore] = useState(false);
  useEffect(() => {
    if (state) setChannels(state.consent.channels);
  }, [state?.me.id, state?.consent.channels.email, state?.consent.channels.sms, state?.consent.channels.voice]);
  const existing = Boolean(state?.consent.acceptedAt);
  const hoursValid = /^\d{1,2}$/.test(start) && /^\d{1,2}$/.test(end) && Number(start) >= 0 && Number(end) <= 24 && Number(start) < Number(end);
  const valid = adult && name.trim().length >= 2 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) && hoursValid && (Object.values(channels).some(Boolean) || existing);
  const save = () => request("/api/account/setup", { adult, displayName: name, email: email.trim(), channels, timezone, startHour: Number(start), endHour: Number(end), familyFriendly: family, excludedThemes: excluded.split(",").map(theme => theme.trim()).filter(Boolean) }).then(() => onDone?.());
  return <Card style={{ gap: 18 }}>
    <View style={{ gap: 8 }}><Txt style={{ fontSize: 21, fontWeight: "700" }}>{existing ? "Your player details" : "Set up your player"}</Txt><Txt muted style={{ fontSize: 14, lineHeight: 22 }}>Choose where your friends’ bait can reach you. You can change your preferences or pause at any time.</Txt></View>
    <Field label="Display name" value={name} onChangeText={setName} maxLength={24} />
    <Field label="Email address" value={email} onChangeText={setEmail} maxLength={254} editable={emailDelivery === "simulated"} autoCapitalize="none" keyboardType="email-address" placeholder="you@example.com" help={emailDelivery === "simulated" ? "This is your sign-in email. Changing it updates the address you use to sign in." : "Verified during sign-in. Game emails go to this inbox."} />
    <Txt muted style={{ fontSize: 13, lineHeight: 21 }}>Your opponent has two casts each week, plus an optional seasonal Spear. Choose which kinds you want to receive.</Txt>
    <Toggle label="Receive game emails" detail="Sent to your registered inbox when email delivery is connected." value={channels.email} onChange={value => setChannels({ ...channels, email: value })} />
    <Toggle label="Receive game texts" detail="Optional. Real texts also require your verified phone number and a connected text service." value={channels.sms} onChange={value => setChannels({ ...channels, sms: value })} />
    <Toggle label="Receive game calls" detail="Optional. Calls disclose the game and use an AI stock voice. Verify your phone before real calls can reach you." value={channels.voice} onChange={value => setChannels({ ...channels, voice: value })} />
    <Toggle label="Family-friendly themes" detail="Filter strong language in messages you receive." value={family} onChange={setFamily} />
    <View style={{ borderTopWidth: 1, borderTopColor: C.border, paddingTop: 16, gap: 8 }}>
      <Txt muted style={{ fontSize: 13, lineHeight: 21 }}>Contact hours: {start}:00–{end}:00, {timezone.split("/").pop()?.replaceAll("_", " ")}.</Txt>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: more }} onPress={() => setMore(!more)} style={{ paddingVertical: 9 }}><Txt style={{ color: C.teal, fontSize: 14 }}>{more ? "Close delivery preferences −" : "Change hours and topics +"}</Txt></Pressable>
      {more && <View style={{ gap: 18, paddingVertical: 10 }}>
        <View style={{ gap: 10 }}><Txt style={{ fontSize: 14, fontWeight: "600" }}>Time zone</Txt><Row style={{ flexWrap: "wrap", gap: 8 }}>{zones.map(zone => <Button small key={zone} variant={timezone === zone ? "primary" : "secondary"} onPress={() => setTimezone(zone)}>{zone.split("/")[1].replaceAll("_", " ")}</Button>)}</Row></View>
        <Row style={{ alignItems: "flex-start" }}><View style={{ flex: 1 }}><Field label="From (24h)" value={start} onChangeText={setStart} maxLength={2} keyboardType="number-pad" /></View><View style={{ flex: 1 }}><Field label="Until (24h)" value={end} onChangeText={setEnd} maxLength={2} keyboardType="number-pad" /></View></Row>
        {!hoursValid && <Txt style={{ color: C.coral, fontSize: 13 }}>Choose valid hours, with the end later than the start.</Txt>}
        <Field label="Topics to avoid" value={excluded} onChangeText={setExcluded} maxLength={120} placeholder="For example: deliveries" help="Optional. Separate up to five topics with commas." />
      </View>}
    </View>
    <Toggle label="I’m 18 or older and agree to play" detail="I agree to receive fictional game challenges through the channels I selected. Real deliveries are labeled as game messages." value={adult} onChange={setAdult} />
    <Button disabled={!valid} loading={busy} onPress={() => void safely(save())}>{existing ? "Save preferences" : "Continue to leagues"}</Button>
  </Card>;
}
