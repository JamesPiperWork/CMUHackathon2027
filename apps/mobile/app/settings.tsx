import React from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { useSession, safely } from "../src/session";
import {
  Badge,
  Button,
  C,
  Card,
  Divider,
  Label,
  Row,
  Title,
  Txt,
} from "../src/ui";
import { ConsentForm } from "../src/consent";
import { Welcome } from "./index";
export default function Settings() {
  const { state, busy, request, signOut } = useSession();
  if (!state) return <Welcome />;
  return (
    <View style={{ maxWidth: 750, width: "100%", alignSelf: "center" }}>
      <Title
        kicker="THE GROUND RULES"
        sub="Your participation is always your call. Change your channels or take a breather."
      >
        Play on your terms.
      </Title>
      <Card
        style={{
          marginBottom: 20,
          borderColor: state.consent.paused ? "#725738" : "#365650",
        }}
      >
        <Row style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
          <Badge color={state.consent.paused ? C.gold : C.teal}>
            {state.consent.paused ? "ALL CONTACT PAUSED" : "CONTACT ENABLED"}
          </Badge>
          <Button
            small
            loading={busy}
            variant={state.consent.paused ? "primary" : "coral"}
            icon="pause"
            onPress={() =>
              void safely(
                request("/api/pause", { paused: !state.consent.paused }),
              )
            }
          >
            {state.consent.paused ? "Resume contact" : "Pause immediately"}
          </Button>
        </Row>
        <Txt muted style={{ fontSize: 12, lineHeight: 21, marginTop: 15 }}>
          Pausing cancels queued deliveries and blocks future dispatch. A
          message already accepted by a carrier may not be retractable; its
          actual state stays visible in Activity.
        </Txt>
      </Card>
      <ConsentForm onDone={() => router.push("/")} />
      <Card style={{ marginTop: 22 }}>
        <Label>Delivery readiness</Label>
        <View style={{ gap: 15, marginTop: 17 }}>
          {state.readiness.map((item) => (
            <View key={item.channel} style={{ gap: 9 }}>
              <Row style={{ justifyContent: "space-between" }}>
                <Txt style={{ fontSize: 13, fontWeight: "700" }}>
                  {item.channel.toUpperCase()}
                </Txt>
                <Badge
                  color={
                    item.status === "simulated" || item.status === "ready"
                      ? C.teal
                      : C.gold
                  }
                >
                  {item.status.toUpperCase()}
                </Badge>
              </Row>
              <Txt muted style={{ fontSize: 11, lineHeight: 18 }}>
                {item.reason}
              </Txt>
            </View>
          ))}
        </View>
        <Divider />
        <Txt muted style={{ fontSize: 10, lineHeight: 18 }}>
          Consent version: {state.consent.version}
          {`\n`}Accepted:{" "}
          {state.consent.acceptedAt
            ? new Date(state.consent.acceptedAt).toLocaleString()
            : "Not yet accepted"}
          {`\n`}Demo contact records never establish live ownership
          verification.
        </Txt>
      </Card>
      <Row style={{ marginTop: 22, flexWrap: "wrap" }}>
        <Button
          variant="secondary"
          icon="logout"
          onPress={() => void signOut().then(() => router.replace("/"))}
        >
          Sign out
        </Button>
        {state.role === "operator" && state.mode === "demo" && (
          <Button variant="secondary" onPress={() => router.push("/operator")}>
            Demo operator console
          </Button>
        )}
      </Row>
    </View>
  );
}
