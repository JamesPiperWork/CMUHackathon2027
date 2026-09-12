import React, { useState } from "react";
import { View } from "react-native";
import { interests, type Channel, type Interest } from "@fp/shared";
import { useSession, safely } from "./session";
import {
  Badge,
  Button,
  C,
  Card,
  Divider,
  Field,
  Label,
  Row,
  Toggle,
  Txt,
} from "./ui";
const zones = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
];
export function ConsentForm({ onDone }: { onDone?: () => void }) {
  const { state, request, busy } = useSession();
  const [name, setName] = useState(state?.me.name || ""),
    [adult, setAdult] = useState(state?.consent.adult || false),
    [channels, setChannels] = useState<Record<Channel, boolean>>(
      state?.consent.channels || { email: false, sms: false, voice: false },
    ),
    [selected, setSelected] = useState<Interest[]>(state?.me.interests || []),
    [timezone, setTimezone] = useState(
      state?.consent.timezone || "America/New_York",
    ),
    [start, setStart] = useState(String(state?.consent.startHour ?? 10)),
    [end, setEnd] = useState(String(state?.consent.endHour ?? 20)),
    [family, setFamily] = useState(state?.consent.familyFriendly ?? true),
    [excluded, setExcluded] = useState(
      (state?.consent.excludedThemes || []).join(", "),
    ),
    [timezoneConfirmed, setTimezoneConfirmed] = useState(
      Boolean(state?.consent.acceptedAt),
    );
  const valid =
    adult &&
    timezoneConfirmed &&
    name.trim().length >= 2 &&
    selected.length > 0 &&
    Number.isInteger(Number(start)) &&
    Number.isInteger(Number(end)) &&
    Number(start) >= 0 &&
    Number(end) <= 24 &&
    Number(start) < Number(end);
  return (
    <View style={{ gap: 20 }}>
      <Card>
        <Label color={C.teal}>An invitation to harmless mischief</Label>
        <Txt style={{ fontSize: 20, fontWeight: "700", marginTop: 10 }}>
          Welcome to The Usual Suspects.
        </Txt>
        <Txt muted style={{ lineHeight: 22, marginTop: 12 }}>
          Your friends will send fictional deceptive challenges mixed with
          expected messages. Timing and answers stay a surprise. Voice
          challenges use a synthetic stock voice. This private league is for
          adults only.
        </Txt>
        <Divider />
        <Field
          label="Display name"
          value={name}
          onChangeText={setName}
          maxLength={24}
        />
        <View style={{ gap: 11, marginTop: 20 }}>
          <Label>Your approved interests</Label>
          <Row style={{ flexWrap: "wrap" }}>
            {interests.map((item) => (
              <Button
                key={item}
                small
                variant={selected.includes(item) ? "primary" : "secondary"}
                onPress={() =>
                  setSelected((old) =>
                    old.includes(item)
                      ? old.filter((i) => i !== item)
                      : [...old, item],
                  )
                }
              >
                {item}
              </Button>
            ))}
          </Row>
          <Txt muted style={{ fontSize: 11 }}>
            Friends can personalize challenges using only these interests.
          </Txt>
        </View>
        <View style={{ marginTop: 20 }}>
          <Field
            label="Themes to exclude (optional)"
            value={excluded}
            onChangeText={setExcluded}
            maxLength={120}
            placeholder="For example: deliveries"
            help="Comma-separated themes. Sensitive and personal topics are always off limits."
          />
        </View>
      </Card>
      <Card>
        <Label>Choose your channels</Label>
        {(["email", "sms", "voice"] as Channel[]).map((channel) => (
          <Toggle
            key={channel}
            label={
              channel === "sms"
                ? "SMS"
                : channel === "voice"
                  ? "Synthetic voice calls"
                  : "Email"
            }
            detail={
              state?.mode === "demo"
                ? "Simulated in the game. No real contact."
                : "Live delivery requires verified contact ownership and provider readiness."
            }
            value={channels[channel]}
            onChange={(value) => setChannels({ ...channels, [channel]: value })}
          />
        ))}
        <Divider />
        <Label>Your contact window</Label>
        <Row style={{ flexWrap: "wrap", marginTop: 12 }}>
          {zones.map((zone) => (
            <Button
              small
              key={zone}
              variant={timezone === zone ? "primary" : "secondary"}
              onPress={() => {
                setTimezone(zone);
                setTimezoneConfirmed(true);
              }}
            >
              {zone.split("/")[1].replace("_", " ")}
            </Button>
          ))}
        </Row>
        <Toggle
          label={`Confirm timezone: ${timezone.replace("_", " ")}`}
          value={timezoneConfirmed}
          onChange={setTimezoneConfirmed}
        />
        <Row style={{ alignItems: "flex-start" }}>
          <View style={{ flex: 1 }}>
            <Field
              label="From (24h)"
              value={start}
              onChangeText={setStart}
              maxLength={2}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Field
              label="Until (24h)"
              value={end}
              onChangeText={setEnd}
              maxLength={2}
            />
          </View>
        </Row>
        <Txt muted style={{ fontSize: 11, lineHeight: 18, marginTop: 10 }}>
          Default: 10:00–20:00. At most one challenge per channel per day. Demo
          presenters can explicitly advance simulated time.
        </Txt>
        <Divider />
        <Toggle
          label="Keep the jokes family friendly"
          detail="Same adult-only game; gentler reveal copy."
          value={family}
          onChange={setFamily}
        />
        <Toggle
          label="I’m 18 or older and I accept this private invitation"
          detail="I understand enabled channels may receive surprise deceptive simulations. I can pause or withdraw at any time."
          value={adult}
          onChange={setAdult}
        />
      </Card>
      <Button
        disabled={!valid}
        loading={busy}
        icon="check"
        onPress={() =>
          void safely(
            request("/api/consent", {
              adult,
              displayName: name,
              channels,
              timezone,
              startHour: Number(start),
              endHour: Number(end),
              familyFriendly: family,
              interests: selected,
              excludedThemes: excluded
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean),
            }).then(() => onDone?.()),
          )
        }
      >
        {state?.consent.acceptedAt
          ? "Save preferences"
          : "Accept invitation & join the league"}
      </Button>
      {!valid && (
        <Badge color={C.gold}>
          Choose interests, confirm timezone, and accept the adult invitation to
          continue.
        </Badge>
      )}
    </View>
  );
}
