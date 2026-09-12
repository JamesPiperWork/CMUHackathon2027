import React from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  View,
  useWindowDimensions,
} from "react-native";
import { Slot, router, usePathname } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { SessionProvider, useSession, safely } from "../src/session";
import {
  Avatar,
  Button,
  C,
  Hook,
  Icon,
  Label,
  Row,
  Txt,
  type IconName,
} from "../src/ui";
const nav: [string, string, IconName][] = [
  ["/", "Matchup", "home"],
  ["/draft", "Draft a challenge", "draft"],
  ["/activity", "Activity", "activity"],
  ["/league", "The league", "league"],
];
function Frame() {
  const { width } = useWindowDimensions();
  const wide = width >= 950;
  const compact = width < 540;
  const path = usePathname();
  const { state, loading, error, connected, mode, clearError, refresh } =
    useSession();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar style="light" />
      <View
        style={{
          height: 35,
          backgroundColor: "#243B3D",
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 12,
        }}
      >
        <Txt
          style={{
            color: C.teal,
            fontSize: 10,
            fontWeight: "700",
            letterSpacing: 0.65,
          }}
        >
          {mode === "demo"
            ? "SIMULATED DELIVERY  ·  FICTIONAL PLAYERS. REAL RIVALRY."
            : "PRIVATE OPT-IN LEAGUE  ·  LIVE CHANNEL READINESS APPLIES"}
        </Txt>
      </View>
      <View
        style={{
          height: 77,
          paddingHorizontal: wide ? 36 : 20,
          borderBottomWidth: 1,
          borderBottomColor: C.border,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Fantasy Phishing home"
          onPress={() => router.push("/")}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: compact ? 6 : 9,
            flexShrink: 1,
          }}
        >
          <Hook size={compact ? 32 : 40} />
          <View style={{ flexShrink: 1 }}>
            <Txt
              style={{
                fontSize: compact ? 16 : 19,
                fontWeight: "800",
                letterSpacing: -0.6,
              }}
            >
              fantasy phishing<Txt style={{ color: C.teal }}>.</Txt>
            </Txt>
            {!compact && (
              <Txt
                muted
                style={{ fontSize: 9, letterSpacing: 1.9, marginTop: 4 }}
              >
                A LITTLE BAIT. A BETTER INSTINCT.
              </Txt>
            )}
          </View>
        </Pressable>
        {state && (
          <Row style={{ gap: compact ? 7 : 12 }}>
            <View
              style={{
                width: 7,
                height: 7,
                borderRadius: 10,
                backgroundColor: connected ? C.teal : C.gold,
              }}
            />
            {wide && (
              <Txt muted style={{ fontSize: 11 }}>
                {connected ? "Live updates on" : "Reconnecting"}
              </Txt>
            )}
            <Pressable
              accessibilityLabel="Open settings"
              accessibilityRole="button"
              onPress={() => router.push("/settings")}
              style={{ padding: 9 }}
            >
              <Icon name="settings" color={C.muted} />
            </Pressable>
            <Avatar
              name={state.me.name}
              color={state.me.color || C.teal}
              size={34}
            />
          </Row>
        )}
      </View>
      <View style={{ flex: 1, flexDirection: "row" }}>
        {wide && state && (
          <View
            style={{
              width: 227,
              padding: 23,
              borderRightWidth: 1,
              borderRightColor: C.border,
              gap: 7,
            }}
          >
            <View style={{ marginTop: 16, marginBottom: 20 }}>
              <Label>Your private league</Label>
              <Txt style={{ marginTop: 8, fontSize: 14, fontWeight: "700" }}>
                The Usual Suspects
              </Txt>
              <Txt muted style={{ fontSize: 11, marginTop: 5 }}>
                8 friends · Season 01
              </Txt>
            </View>
            {nav.map(([href, label, icon]) => (
              <Pressable
                key={href}
                accessibilityRole="link"
                onPress={() => router.push(href as "/")}
                style={{
                  paddingVertical: 14,
                  paddingHorizontal: 12,
                  borderRadius: 9,
                  flexDirection: "row",
                  gap: 11,
                  backgroundColor: path === href ? C.tealDark : "transparent",
                }}
              >
                <Icon
                  name={icon}
                  size={18}
                  color={path === href ? C.teal : C.muted}
                />
                <Txt
                  style={{
                    fontSize: 12,
                    fontWeight: "600",
                    color: path === href ? C.teal : C.muted,
                  }}
                >
                  {label}
                </Txt>
                {href === "/activity" &&
                  state.incoming.filter((i) => !i.decision).length > 0 && (
                    <View style={{ marginLeft: "auto" }}>
                      <Txt style={{ fontSize: 11, color: C.teal }}>
                        {state.incoming.filter((i) => !i.decision).length}
                      </Txt>
                    </View>
                  )}
              </Pressable>
            ))}
            {state.role === "operator" && (
              <Button
                variant="ghost"
                small
                icon="settings"
                onPress={() => router.push("/operator")}
              >
                Demo console
              </Button>
            )}
            <View style={{ flex: 1 }} />
            <View
              style={{
                padding: 16,
                borderWidth: 1,
                borderColor: C.border,
                borderRadius: 12,
                gap: 8,
              }}
            >
              <Icon name="shield" color={C.teal} />
              <Txt style={{ fontSize: 12, fontWeight: "700" }}>
                Your game. Your rules.
              </Txt>
              <Txt muted style={{ fontSize: 11, lineHeight: 17 }}>
                Contact only on your terms. Pause whenever you like.
              </Txt>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push("/settings")}
              >
                <Txt
                  style={{
                    fontSize: 11,
                    color: C.teal,
                    fontWeight: "700",
                    marginTop: 3,
                  }}
                >
                  Manage preferences →
                </Txt>
              </Pressable>
            </View>
          </View>
        )}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            padding: wide ? 36 : 20,
            paddingBottom: 40,
            alignItems: "center",
          }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ width: "100%", maxWidth: 1080 }}>
            {error && (
              <View
                accessibilityRole="alert"
                style={{
                  backgroundColor: "#3B2D30",
                  borderWidth: 1,
                  borderColor: "#66433E",
                  borderRadius: 12,
                  padding: 14,
                  gap: 10,
                  marginBottom: 20,
                }}
              >
                <Txt style={{ color: C.coral, lineHeight: 20, fontSize: 12 }}>
                  {error}
                </Txt>
                <Row>
                  <Button
                    small
                    variant="secondary"
                    onPress={() => void safely(refresh())}
                  >
                    Retry
                  </Button>
                  <Button small variant="ghost" onPress={clearError}>
                    Dismiss
                  </Button>
                </Row>
              </View>
            )}
            {loading ? (
              <View style={{ paddingTop: 100, alignItems: "center", gap: 20 }}>
                <Hook size={70} />
                <ActivityIndicator color={C.teal} />
                <Txt muted>Getting the league together…</Txt>
              </View>
            ) : (
              <Slot />
            )}
            <View style={{ marginTop: 38, alignItems: "center" }}>
              <Txt muted style={{ fontSize: 10, letterSpacing: 0.2 }}>
                PRIVATE LEAGUE · ADULTS ONLY · GOOD-NATURED MISCHIEF
              </Txt>
            </View>
          </View>
        </ScrollView>
      </View>
      {!wide && state && (
        <View
          style={{
            flexDirection: "row",
            backgroundColor: C.panelDeep,
            borderTopWidth: 1,
            borderTopColor: C.border,
            paddingTop: 8,
            paddingBottom: 10,
          }}
        >
          {nav.map(([href, label, icon]) => (
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={label}
              key={href}
              onPress={() => router.push(href as "/")}
              style={{ flex: 1, alignItems: "center", gap: 7, padding: 8 }}
            >
              <Icon
                name={icon}
                size={20}
                color={path === href ? C.teal : C.muted}
              />
              <Txt
                style={{
                  fontSize: 9,
                  fontWeight: "700",
                  color: path === href ? C.teal : C.muted,
                }}
              >
                {label === "Draft a challenge"
                  ? "Draft"
                  : label === "The league"
                    ? "League"
                    : label}
              </Txt>
            </Pressable>
          ))}
        </View>
      )}
    </SafeAreaView>
  );
}
export default function Layout() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <Frame />
      </SessionProvider>
    </SafeAreaProvider>
  );
}
