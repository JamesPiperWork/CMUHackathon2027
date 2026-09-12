import React, { useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Platform, Pressable, View, useWindowDimensions } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import type { MatchStory } from "@fp/shared";
import { API, useSession } from "../src/session";
import { Avatar, Badge, Button, C, Card, Empty, Icon, Label, Row, Title, Txt } from "../src/ui";
import { SCENE_MS, storyScenes } from "../src/story";
import { canExportStory, exportStory } from "../src/export-story";
import { Welcome } from "./index";

export default function Wrapped() {
  const { state, token } = useSession();
  const { width, height } = useWindowDimensions();
  const compact = width < 400;
  const shortViewport = width < 600 && height < 740;
  const params = useLocalSearchParams<{ leagueId?: string; matchId?: string }>();
  const [story, setStory] = useState<MatchStory | null>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [elapsed, setElapsed] = useState(0), [playing, setPlaying] = useState(false), [reduced, setReduced] = useState(false);
  const [exporting, setExporting] = useState(false), [exportProgress, setExportProgress] = useState(0), [exportMessage, setExportMessage] = useState("");
  const exportAbort = useRef<AbortController | null>(null);
  const entrance = useRef(new Animated.Value(1)).current;
  const [showMoments, setShowMoments] = useState(false);
  const [showSave, setShowSave] = useState(false);
  const [showFullMessage, setShowFullMessage] = useState(false);
  const leagueId = params.leagueId || state?.selectedLeagueId || state?.league.id;
  const currentMatchId = state?.match.state === "completed" && state.match.leagueId === leagueId ? state.match.id : undefined;
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduced);
    const listener = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduced);
    return () => { listener.remove(); exportAbort.current?.abort(); };
  }, []);
  useEffect(() => {
    if (!token || !leagueId) { setLoading(false); return; }
    const abort = new AbortController();
    const read = async <T,>(path: string): Promise<T> => {
      const response = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` }, signal: abort.signal });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not load this Wrapped.");
      return result as T;
    };
    setLoading(true); setError(""); setStory(null); setElapsed(0); setPlaying(false);
    void (async () => {
      let id = params.matchId || currentMatchId;
      if (!id) {
        const result = await read<{ matchups: { id: string; state: string }[] }>(`/api/leagues/${encodeURIComponent(leagueId)}/matchups`);
        id = result.matchups.find(m => m.state === "completed")?.id;
      }
      if (!id) return;
      const result = await read<MatchStory>(`/api/leagues/${encodeURIComponent(leagueId)}/matchups/${encodeURIComponent(id)}/recap`);
      if (!abort.signal.aborted) setStory(result);
    })().catch(err => { if (!abort.signal.aborted) setError(err instanceof Error ? err.message : "Could not load Wrapped."); })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [token, leagueId, params.matchId, currentMatchId]);
  const scenes = useMemo(() => story ? storyScenes(story) : [], [story]);
  const total = scenes.length * SCENE_MS;
  const index = Math.min(scenes.length - 1, Math.floor(elapsed / SCENE_MS));
  const scene = scenes[index];
  useEffect(() => {
    if (!playing || !total) return;
    const start = Date.now() - elapsed;
    const timer = setInterval(() => {
      const next = Math.min(total, Date.now() - start);
      setElapsed(next);
      if (next === total) setPlaying(false);
    }, 80);
    return () => clearInterval(timer);
    // Elapsed is the playback cursor, not a timer dependency.
  }, [playing, total]);
  useEffect(() => {
    setShowFullMessage(false);
    if (reduced) { entrance.setValue(1); return; }
    entrance.setValue(0);
    Animated.timing(entrance, { toValue: 1, duration: 380, useNativeDriver: true }).start();
    return () => entrance.stopAnimation();
  }, [index, entrance, reduced]);
  const seek = (next: number) => { setPlaying(false); setElapsed(Math.max(0, Math.min(total, next))); };
  const play = () => { if (elapsed >= total) setElapsed(0); setPlaying(value => !value); };
  const download = async () => {
    if (!story || exporting) return;
    const controller = new AbortController(); exportAbort.current = controller;
    setExporting(true); setExportProgress(0); setExportMessage(""); setPlaying(false);
    try {
      await exportStory(scenes, `fantasy-phishing-week-${story.week}`, setExportProgress, controller.signal);
      setExportMessage("Video exported. Check your browser’s downloads.");
    } catch (err) { setExportMessage(err instanceof Error ? err.message : "Video export failed."); }
    finally { setExporting(false); }
  };
  if (!state) return <Welcome />;
  if (loading) return <Empty title="Gathering your week…" icon="clock">Collecting the messages and moments from your match.</Empty>;
  if (!story || !scene) return <View style={{ gap: 18 }}><Title kicker="Weekly Wrapped">A week worth catching.</Title><Empty title={error || "Your recap is still waiting."} icon="sparkle">Finish a match to watch the messages, catches, and conversations from your week.</Empty><Button onPress={() => router.push("/matchups")}>View matchups</Button></View>;
  const time = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;
  const messageSender = scene.kind === "defense" ? scene.target || scene.actor : scene.actor;
  const messageRecipient = scene.kind === "defense" ? scene.actor : scene.target;
  const isSummary = scene.kind === "intro" || scene.kind === "outro";
  const messageExcerpt = scene.text.length > 100 ? `${scene.text.slice(0, 100).replace(/\s+\S*$/, "")}…` : scene.text;
  const showExcerpt = shortViewport && !isSummary && !showFullMessage;
  return <View>
    {shortViewport ? <Txt style={{ fontSize: 22, fontWeight: "800", marginBottom: 10 }}>Weekly Wrapped</Txt> : <Title kicker={`${story.leagueName} · Week ${story.week}`} sub="The bait, the catches, and what everyone had to say.">Weekly Wrapped</Title>}
    <View style={{ width: "100%", maxWidth: 470, alignSelf: "center", gap: shortViewport ? 10 : 16 }}>
      <View style={{ width: "100%", gap: shortViewport ? 8 : 12 }}>
        <Row style={{ justifyContent: "space-between", gap: compact ? 7 : 12 }}>
          <Button small variant="secondary" onPress={() => seek(Math.max(0, index - 1) * SCENE_MS)} accessibilityLabel="Previous scene">‹</Button>
          <Button small icon={playing ? "pause" : "arrow"} onPress={play} accessibilityLabel={playing ? "Pause Weekly Wrapped" : elapsed >= total ? "Replay Weekly Wrapped" : "Play Weekly Wrapped"}>{playing ? "Pause" : elapsed >= total ? "Replay" : "Play"}</Button>
          <Txt muted style={{ fontSize: 11 }}>{time(elapsed)} / {time(total)}</Txt>
          <Button small variant="secondary" onPress={() => seek(Math.min(scenes.length - 1, index + 1) * SCENE_MS)} accessibilityLabel="Next scene">›</Button>
        </Row>
        <View testID="wrapped-player" style={{ borderRadius: 22, overflow: "hidden", borderWidth: 1, borderColor: `${scene.accent}45`, backgroundColor: C.panelDeep, minHeight: shortViewport ? 300 : 590 }}>
          <View pointerEvents="none" style={{ position: "absolute", top: -130, right: -160, width: 450, height: 450, borderRadius: 250, backgroundColor: `${scene.accent}0D` }} />
          <View style={{ padding: shortViewport ? 14 : compact ? 18 : 24, gap: shortViewport ? 8 : compact ? 14 : 28, flex: 1 }}>
            {!shortViewport && <Row style={{ justifyContent: "space-between" }}><Label>Fantasy Phishing</Label><Badge color={scene.accent}>{String(index + 1).padStart(2, "0")} / {String(scenes.length).padStart(2, "0")}</Badge></Row>}
            <Row style={{ gap: 5 }}>{scenes.map((item, i) => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`Go to scene ${i + 1}: ${item.kicker}`} onPress={() => seek(i * SCENE_MS)} style={{ flex: 1, height: shortViewport ? 12 : 18, justifyContent: "center" }}><View style={{ height: 3, backgroundColor: C.border, borderRadius: 3, overflow: "hidden" }}><View style={{ height: 3, backgroundColor: scene.accent, width: `${Math.max(0, Math.min(1, (elapsed - i * SCENE_MS) / SCENE_MS)) * 100}%` }} /></View></Pressable>)}</Row>
            <Animated.View style={{ gap: shortViewport ? 8 : compact ? 14 : 22, flex: 1, opacity: entrance, transform: [{ translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }}>
              <Label color={scene.accent}>{scene.kicker}</Label>
              <Txt style={{ fontSize: shortViewport ? 24 : compact ? 28 : 36, fontWeight: "900", lineHeight: shortViewport ? 27 : compact ? 32 : 39, letterSpacing: -1.5 }}>{scene.title}</Txt>
              <Card style={{ backgroundColor: C.panel, borderColor: `${scene.accent}25`, padding: shortViewport ? 12 : compact ? 16 : 20, gap: shortViewport ? 8 : compact ? 12 : 18 }}>
                {!(shortViewport && isSummary) && <Row><Avatar name={messageSender} size={shortViewport ? 24 : 34} color={scene.accent} /><View style={{ flex: 1, gap: 4 }}><Txt style={{ fontSize: 12, fontWeight: "800", color: scene.accent }}>{messageSender}</Txt>{messageRecipient && <Txt muted style={{ fontSize: 11 }}>to {messageRecipient}</Txt>}</View><Icon name={scene.kind === "chat" ? "sms" : scene.kind === "defense" ? "shield" : "mail"} size={19} color={scene.accent} /></Row>}
                <Txt style={{ fontSize: scene.kind === "intro" || scene.kind === "outro" ? (compact ? 20 : 23) : (compact ? 14 : 16), fontWeight: scene.kind === "intro" || scene.kind === "outro" ? "800" : "500", lineHeight: shortViewport ? 20 : compact ? 22 : 26 }}>{showExcerpt ? messageExcerpt : scene.text}</Txt>
              </Card>
              {(!shortViewport || isSummary || showFullMessage) && <Txt style={{ color: C.muted, fontSize: shortViewport ? 11 : 13, lineHeight: shortViewport ? 16 : 21 }}>{scene.detail}</Txt>}
              {shortViewport && !isSummary && <Pressable accessibilityRole="button" accessibilityState={{ expanded: showFullMessage }} onPress={() => { setPlaying(false); setShowFullMessage(!showFullMessage); }} style={{ minHeight: 28, justifyContent: "center" }}><Txt style={{ color: scene.accent, fontSize: 12, fontWeight: "700" }}>{showFullMessage ? "Hide full message" : "Read full message"}</Txt></Pressable>}
            </Animated.View>
            {shortViewport ? <Txt muted style={{ fontSize: 10 }}>{story.synthetic ? "Sample history" : `Week ${story.week}`} · {index + 1} of {scenes.length}</Txt> : <Row style={{ justifyContent: "space-between", marginTop: 4 }}><Label color={scene.accent}>Week {story.week}</Label><Txt muted style={{ fontSize: 10 }}>{story.synthetic ? "Sample match history" : "From your league"}</Txt></Row>}
          </View>
        </View>

      </View>
      <View style={{ gap: 10 }}>
        <Button small variant="ghost" onPress={() => setShowMoments(!showMoments)}>{showMoments ? "Hide moments" : "Jump to a moment"}</Button>
        {showMoments && <Card style={{ padding: 0, overflow: "hidden" }}>
          {scenes.map((item, i) => <Pressable key={item.id} onPress={() => { seek(i * SCENE_MS); setShowMoments(false); }} accessibilityRole="button" accessibilityLabel={`Watch ${item.kicker}`} accessibilityState={{ selected: i === index }} style={{ padding: 16, borderTopWidth: i ? 1 : 0, borderTopColor: C.border, backgroundColor: i === index ? C.tealDark : "transparent" }}>
            <Row><Txt style={{ width: 22, color: i === index ? item.accent : C.muted, fontWeight: "700", fontSize: 12 }}>{i + 1}</Txt><View style={{ flex: 1, gap: 4 }}><Txt style={{ fontSize: 13, fontWeight: "600" }}>{item.kicker}</Txt><Txt muted style={{ fontSize: 11 }}>{item.actor}{item.target ? ` → ${item.target}` : ""}</Txt></View><Txt muted style={{ fontSize: 11 }}>{time(i * SCENE_MS)}</Txt></Row>
          </Pressable>)}
        </Card>}
        {Platform.OS === "web" && <>
          <Button small variant="ghost" onPress={() => setShowSave(!showSave)}>{showSave ? "Hide video options" : "Save video"}</Button>
          {showSave && <Card style={{ gap: 12 }}>
            <Txt style={{ fontWeight: "700", fontSize: 16 }}>Keep your Weekly Wrapped</Txt>
            <Txt muted style={{ fontSize: 12, lineHeight: 20 }}>Save these moments as a portrait video. Keep this tab open for about {Math.ceil(total / 1000)} seconds while it records.</Txt>
            <Button variant="secondary" disabled={!canExportStory() || exporting} onPress={() => void download()}>{exporting ? `Saving video · ${Math.round(exportProgress * 100)}%` : "Download video"}</Button>
            {exporting && <Button small variant="ghost" onPress={() => exportAbort.current?.abort()}>Cancel export</Button>}
            {!canExportStory() && <Txt muted style={{ fontSize: 11 }}>Video downloads are available in Chrome or Edge.</Txt>}
            {Boolean(exportMessage) && <Txt style={{ color: C.teal, fontSize: 12 }}>{exportMessage}</Txt>}
          </Card>}
        </>}
        <Button small variant="ghost" onPress={() => router.push("/league")}>Back to your league</Button>
      </View>
    </View>
  </View>;
}
