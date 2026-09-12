import React, { useEffect, useState } from "react";
import { View } from "react-native";
import type { DeliveryAttempt, Job, Match, Readiness } from "@fp/shared";
import { useSession, safely } from "../src/session";
import {
  Badge,
  Button,
  C,
  Card,
  Divider,
  Empty,
  Field,
  Label,
  Row,
  Title,
  Txt,
} from "../src/ui";
interface OperatorState {
  mode: string;
  now: number;
  match: Match;
  jobs: Job[];
  attempts: DeliveryAttempt[];
  readiness: { userId: string; channels: Readiness[] }[];
  note: string;
}
export default function Operator() {
  const { state, request, busy } = useSession();
  const [data, setData] = useState<OperatorState | null>(null),
    [minutes, setMinutes] = useState("5"),
    [reset, setReset] = useState(false);
  const allowed = state?.role === "operator" && state.mode === "demo";
  useEffect(() => {
    if (allowed)
      void safely(request<OperatorState>("/api/operator").then(setData));
  }, [allowed, state?.revision]);
  if (!allowed)
    return (
      <Empty icon="shield" title="Presentation tools are operator only.">
        Sign in with the explicitly labeled fictional demo operator account.
        Normal player sessions cannot inspect jobs, advance time, or reset the
        match.
      </Empty>
    );
  return (
    <View>
      <Title
        kicker="PRESENTATION TOOLS · DEMO ONLY"
        sub="This console moves the local simulation along. It never contacts a real person or changes a scored decision."
      >
        Behind the mischief.
      </Title>
      <Badge color={C.gold}>OPERATOR SESSION · LOCAL FICTIONAL DATA ONLY</Badge>
      <Card style={{ marginTop: 22 }}>
        <Label>Match controls</Label>
        <Txt muted style={{ fontSize: 12, lineHeight: 21, marginTop: 10 }}>
          Server time: {data ? new Date(data.now).toLocaleString() : "Loading…"}
          {`\n`}Match: {state?.match.state.toUpperCase()} · Seed{" "}
          {data?.match.seed ?? "—"}
        </Txt>
        <Row style={{ marginTop: 19, flexWrap: "wrap" }}>
          <Button
            loading={busy}
            onPress={() =>
              void safely(
                request("/api/operator/release", { recipientId: "alex" }),
              )
            }
          >
            Release next for Alex
          </Button>
          <Button
            loading={busy}
            onPress={() =>
              void safely(
                request("/api/operator/release", { recipientId: "jordan" }),
              )
            }
          >
            Release next for Jordan
          </Button>
          <Button
            variant="secondary"
            loading={busy}
            onPress={() =>
              void safely(request("/api/operator/release", { all: true }))
            }
          >
            Release all simulated challenges
          </Button>
        </Row>
        <Txt muted style={{ fontSize: 11, lineHeight: 18, marginTop: 12 }}>
          Release explicitly uses simulation timing. Player consent and pause
          still apply. Start the match from Draft first.
        </Txt>
        <Divider />
        <Row style={{ alignItems: "flex-end", flexWrap: "wrap" }}>
          <View style={{ maxWidth: 160 }}>
            <Field
              label="Advance minutes"
              value={minutes}
              onChangeText={setMinutes}
              maxLength={5}
            />
          </View>
          <Button
            variant="secondary"
            loading={busy}
            disabled={!Number.isFinite(Number(minutes)) || Number(minutes) <= 0}
            onPress={() =>
              void safely(
                request("/api/operator/advance", { minutes: Number(minutes) }),
              )
            }
          >
            Advance demo clock
          </Button>
          <Button
            variant="secondary"
            loading={busy}
            onPress={() => void safely(request("/api/operator/finalize", {}))}
          >
            Finalize current match
          </Button>
        </Row>
        <Divider />
        <Row style={{ flexWrap: "wrap" }}>
          <Button variant="coral" onPress={() => setReset(!reset)}>
            Reset fictional match
          </Button>
          {reset && (
            <Button
              loading={busy}
              onPress={() =>
                void safely(
                  request("/api/operator/reset", {}).then(() =>
                    setReset(false),
                  ),
                )
              }
            >
              Confirm reset · clears demo decisions
            </Button>
          )}
        </Row>
        {reset && (
          <Txt
            style={{
              color: C.gold,
              fontSize: 11,
              lineHeight: 19,
              marginTop: 12,
            }}
          >
            This starts the eight fictional members over. Other player sessions
            will refresh; no live data is touched.
          </Txt>
        )}
      </Card>
      <Card style={{ marginTop: 22 }}>
        <Label>Provider readiness · configuration evidence</Label>
        <Txt muted style={{ fontSize: 12, lineHeight: 20, marginTop: 10 }}>
          {data?.note ||
            "Ready means configured prerequisites, not delivery evidence. Operator confirmation does not independently verify provider permission."}
        </Txt>
        {data?.readiness.map((member) => (
          <View key={member.userId} style={{ marginTop: 24 }}>
            <Txt style={{ fontSize: 17, fontWeight: "700" }}>
              {member.userId}
            </Txt>
            {member.channels.map((channel) => (
              <View
                key={channel.channel}
                style={{
                  marginTop: 15,
                  padding: 16,
                  backgroundColor: C.panelDeep,
                  borderRadius: 10,
                  gap: 10,
                }}
              >
                <Row style={{ justifyContent: "space-between" }}>
                  <Label>{channel.channel}</Label>
                  <Badge
                    color={
                      channel.status === "simulated" ||
                      channel.status === "ready"
                        ? C.teal
                        : C.gold
                    }
                  >
                    {channel.status.toUpperCase()}
                  </Badge>
                </Row>
                <Txt muted style={{ fontSize: 12, lineHeight: 20 }}>
                  {channel.reason}
                </Txt>
                {channel.conditions.map((condition) => (
                  <Row
                    key={condition.name}
                    style={{ alignItems: "flex-start", gap: 9 }}
                  >
                    <Txt
                      style={{
                        color: condition.ok ? C.teal : C.gold,
                        fontSize: 12,
                      }}
                    >
                      {condition.ok ? "✓" : "○"}
                    </Txt>
                    <View style={{ flex: 1, gap: 4 }}>
                      <Txt style={{ fontSize: 11, fontWeight: "700" }}>
                        {condition.name}
                      </Txt>
                      <Txt muted style={{ fontSize: 10, lineHeight: 17 }}>
                        {condition.detail}
                      </Txt>
                    </View>
                  </Row>
                ))}
              </View>
            ))}
          </View>
        ))}
      </Card>
      <Card style={{ marginTop: 22 }}>
        <Label>Durable delivery & generation jobs</Label>
        <Txt muted style={{ fontSize: 11, lineHeight: 20, marginTop: 12 }}>
          {data?.jobs.length || 0} jobs · {data?.attempts.length || 0} transport
          attempts{`\n`}Unknown submissions are held for reconciliation; they
          are not blindly retried.
        </Txt>
        <View style={{ gap: 8, marginTop: 16 }}>
          {data?.attempts.slice(-12).map((attempt) => (
            <Row
              key={attempt.id}
              style={{
                flexWrap: "wrap",
                justifyContent: "space-between",
                paddingVertical: 10,
                borderTopWidth: 1,
                borderTopColor: C.border,
              }}
            >
              <Txt style={{ fontSize: 11 }}>
                {attempt.recipientId} · {attempt.channel} · {attempt.provider}
              </Txt>
              <Badge
                color={
                  attempt.status === "failed" || attempt.status === "unknown"
                    ? C.gold
                    : C.teal
                }
              >
                {attempt.status}
              </Badge>
              {attempt.reason && (
                <Txt
                  muted
                  style={{ fontSize: 10, lineHeight: 17, width: "100%" }}
                >
                  {attempt.reason}
                </Txt>
              )}
            </Row>
          ))}
        </View>
      </Card>
    </View>
  );
}
