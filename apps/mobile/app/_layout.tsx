import React, { useCallback, useEffect, useRef } from "react";
import { ActivityIndicator, Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import { Slot, router, usePathname } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { SessionProvider, useSession, safely } from "../src/session";
import { Avatar, Button, C, Hook, Icon, Row, Txt, type IconName } from "../src/ui";
import { ScreenScrollContext } from "../src/screen-scroll";

const tabs: [string, string, IconName][] = [
  ["/", "Home", "home"], ["/draft", "Bait", "hook"],
  ["/league", "League", "league"],
];
function Frame() {
  const wide = useWindowDimensions().width >= 950;
  const path = usePathname();
  const { state, loading, error, connected, clearError, refresh } = useSession();
  const scroll = useRef<ScrollView>(null);
  const scrollToTop = useCallback(() => { scroll.current?.scrollTo({ y: 0, animated: false }); }, []);
  useEffect(scrollToTop, [path, state?.me.id, state?.selectedLeagueId, scrollToTop]);
  const activeTab = ["/leagues", "/matchups", "/chat"].includes(path) ? "/league" : path;
  const setupRedirect = state?.setupStage === "player" && !["/", "/settings"].includes(path) ? "/" : state && !state.leagues.length && !["/", "/settings", "/leagues"].includes(path) ? "/leagues" : null;
  useEffect(() => { if (setupRedirect) router.replace(setupRedirect); }, [setupRedirect]);
  const canNavigate = state && state.setupStage !== "player" && state.leagues.length > 0;
  const navigation = (bottom: boolean) => tabs.map(([href, label, icon]) => {
    const active = activeTab === href;
    return <Pressable key={href} accessibilityRole="link" accessibilityLabel={label} accessibilityState={{ selected: active }} onPress={() => router.push(href as "/")}
      style={({ pressed }) => ({ flex: bottom ? 1 : undefined, flexDirection: bottom ? "column" : "row", alignItems: "center", gap: bottom ? 5 : 13, paddingVertical: bottom ? 9 : 16, paddingHorizontal: bottom ? 3 : 17, borderRadius: 12, backgroundColor: !bottom && active ? C.tealDark : "transparent", opacity: pressed ? 0.65 : 1 })}>
      <Icon name={icon} size={22} color={active ? C.teal : C.muted} />
      <Txt style={{ fontSize: bottom ? 12 : 15, fontWeight: active ? "700" : "500", color: active ? C.teal : C.muted }}>{label}</Txt>
    </Pressable>;
  });
  return <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
    <StatusBar style="light" />
    <View style={{ height: 68, paddingHorizontal: wide ? 28 : 18, borderBottomWidth: 1, borderBottomColor: C.border, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Fantasy Phishing home" onPress={() => router.push("/")} style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
        <Hook size={39} /><Txt style={{ fontSize: 18, fontWeight: "700", letterSpacing: -0.5 }}>Fantasy <Txt style={{ color: C.teal, fontSize: 18, fontWeight: "700" }}>Phishing</Txt></Txt>
      </Pressable>
      {state && <Pressable accessibilityRole="button" accessibilityLabel="Account and preferences" onPress={() => router.push("/settings")} style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>{wide && <Txt muted style={{ fontSize: 14 }}>{state.me.name}</Txt>}<Avatar name={state.me.name} color={state.me.color} size={34} /></Pressable>}
    </View>
    {!connected && state && <View style={{ paddingHorizontal: 20, paddingVertical: 7, backgroundColor: C.panel }}><Txt style={{ fontSize: 12, color: C.gold }}>Reconnecting… your saved progress is safe.</Txt></View>}
    <View style={{ flex: 1, flexDirection: "row" }}>
      {wide && canNavigate && <View style={{ width: 194, padding: 16, borderRightWidth: 1, borderRightColor: C.border, gap: 8 }}><View style={{ height: 16 }} />{navigation(false)}<View style={{ flex: 1 }} /><Button small variant="ghost" icon="settings" onPress={() => router.push("/settings")}>Settings</Button>{state.role === "operator" && <Button small variant="ghost" onPress={() => router.push("/operator")}>Demo tools</Button>}</View>}
      <View style={{ flex: 1, minWidth: 0 }}>
        <ScrollView ref={scroll} style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: wide ? 36 : 20, paddingTop: 24, paddingBottom: 32, alignItems: "center" }} keyboardShouldPersistTaps="handled">
          <View style={{ width: "100%", maxWidth: 1050 }}>
            {Boolean(error) && <View accessibilityRole="alert" style={{ backgroundColor: "#382B2A", borderRadius: 12, padding: 16, gap: 10, marginBottom: 20 }}><Txt style={{ color: C.coral, lineHeight: 21, fontSize: 14 }}>{error}</Txt><Row><Button small variant="secondary" onPress={() => void safely(refresh())}>Retry</Button><Button small variant="ghost" onPress={clearError}>Dismiss</Button></Row></View>}
            {loading || setupRedirect ? <View style={{ paddingTop: 90, alignItems: "center", gap: 16 }}><ActivityIndicator color={C.teal} /><Txt muted>Getting things ready…</Txt></View> : <ScreenScrollContext.Provider value={scrollToTop}><Slot /></ScreenScrollContext.Provider>}
          </View>
        </ScrollView>
      </View>
    </View>
    {!wide && canNavigate && <View style={{ flexDirection: "row", borderTopWidth: 1, borderTopColor: C.border, paddingTop: 4, paddingBottom: 5, backgroundColor: C.panelDeep }}>{navigation(true)}</View>}
  </SafeAreaView>;
}
export default function Layout() { return <SafeAreaProvider><SessionProvider><Frame /></SessionProvider></SafeAreaProvider>; }
