import React, { useEffect, useRef, useState } from "react";
import { Image, Linking, Platform, Pressable, View } from "react-native";
import { prankPresets, type PrankRevealPublic } from "@fp/shared";
import { API, useSession } from "./session";
import { Button, C, Divider, Txt } from "./ui";

function PrivatePhoto({ path }: { path: string }) {
  const { token } = useSession();
  const [source, setSource] = useState<string | null>(null), [error, setError] = useState(false);
  useEffect(() => {
    if (Platform.OS !== "web" || !token) return;
    let url: string | undefined, active = true;
    const abort = new AbortController(), timer = setTimeout(() => abort.abort(), 15000);
    setSource(null); setError(false);
    void fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` }, credentials: "include", signal: abort.signal })
      .then(async response => { if (!response.ok) throw new Error("Preview unavailable"); const bytes = await response.blob(); if (active) { url = URL.createObjectURL(bytes); setSource(url); } })
      .catch(() => { if (active) setError(true); }).finally(() => clearTimeout(timer));
    return () => { active = false; abort.abort(); clearTimeout(timer); if (url) URL.revokeObjectURL(url); };
  }, [path, token]);
  if (Platform.OS !== "web") return <Image source={{ uri: `${API}${path}`, headers: { Authorization: `Bearer ${token}` } }} style={{ width: "100%", height: 180, borderRadius: 12 }} resizeMode="contain" accessibilityLabel="Your uploaded surprise photo" />;
  if (!source) return <Txt muted style={{ fontSize: 13 }}>{error ? "Photo saved. Preview is unavailable; reload this page to try again." : "Loading your photo…"}</Txt>;
  return <Image source={{ uri: source }} style={{ width: "100%", height: 180, borderRadius: 12 }} resizeMode="contain" accessibilityLabel="Your uploaded surprise photo" />;
}

export function PrankPicker({ draftId, reveal, disabled, locked, onBusy }: { draftId: string; reveal?: PrankRevealPublic; disabled: boolean; locked: boolean; onBusy: (busy: boolean) => void }) {
  const { request } = useSession();
  const value = reveal ?? { choice: "rickroll", revision: "default" };
  const [working, setWorking] = useState(false), [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const run = async (action: () => Promise<unknown>) => {
    setWorking(true); setError(null); onBusy(true);
    try { await action(); } catch (cause) { setError(cause instanceof Error ? cause.message : "The surprise could not be saved."); }
    finally { setWorking(false); onBusy(false); }
  };
  const upload = (file?: File) => {
    if (!file) return;
    void run(async () => {
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 2 * 1024 * 1024) throw new Error("Choose a JPEG, PNG or WebP smaller than 2 MB.");
      const base64 = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onerror = () => reject(new Error("The photo could not be read.")); reader.onload = () => resolve(String(reader.result).split(",")[1]); reader.readAsDataURL(file); });
      await request(`/api/drafts/${draftId}/reveal/photo`, { mime: file.type, base64, expectedRevision: value.revision });
    });
  };
  return <View style={{ gap: 12 }}>
    <Divider />
    <Txt style={{ fontSize: 17, fontWeight: "700" }}>If they take the bait…</Txt>
    <Txt muted style={{ fontSize: 13, lineHeight: 20 }}>Pick the surprise they’ll see after trusting your message.</Txt>
    <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>{prankPresets.map(preset => <Pressable key={preset.id} accessibilityRole="button" accessibilityLabel={`Surprise: ${preset.name}`} accessibilityState={{ selected: value.choice === preset.id, disabled: disabled || working || locked }} disabled={disabled || working || locked} onPress={() => void run(() => request(`/api/drafts/${draftId}/reveal`, { choice: preset.id, expectedRevision: value.revision }, "PUT"))} style={{ flexGrow: 1, flexBasis: 100, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: value.choice === preset.id ? C.teal : C.border, backgroundColor: value.choice === preset.id ? C.tealDark : C.panelDeep, gap: 6 }}>
      <Txt style={{ fontSize: 24 }}>{preset.emoji}</Txt><Txt style={{ fontWeight: "700", fontSize: 13 }}>{preset.name}</Txt><Txt muted style={{ fontSize: 11, lineHeight: 16 }}>{preset.description}</Txt>
    </Pressable>)}</View>
    {value.choice === "photo" && <><Txt style={{ color: C.teal, fontSize: 13 }}>Your photo is selected.</Txt>{value.imageUrl && <PrivatePhoto path={value.imageUrl} />}</>}
    {!locked && (Platform.OS === "web" ? <>
      {React.createElement("input", { ref: input, type: "file", accept: "image/jpeg,image/png,image/webp", style: { display: "none" }, "aria-label": "Upload a surprise photo", disabled: disabled || working, onChange: (event: React.ChangeEvent<HTMLInputElement>) => { upload(event.target.files?.[0]); event.target.value = ""; } })}
      <Button small variant="secondary" disabled={disabled || working} loading={working} onPress={() => input.current?.click()}>{value.choice === "photo" ? "Replace photo" : "Upload your own photo"}</Button>
      <Txt muted style={{ fontSize: 11, lineHeight: 17 }}>JPEG, PNG or WebP · up to 2 MB. Choose a friendly photo you have permission to share.</Txt>
    </> : <Button small variant="secondary" onPress={() => void Linking.openURL(`${API}/draft`)}>Upload a photo in the web app</Button>)}
    {!!error && <Txt style={{ color: C.coral, fontSize: 13, lineHeight: 20 }}>{error}</Txt>}
  </View>;
}
