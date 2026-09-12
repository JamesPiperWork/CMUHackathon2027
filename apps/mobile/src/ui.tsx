import React, { useEffect, useRef } from "react";
import {
  AccessibilityInfo,
  Animated,
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextStyle,
  type TextInputProps,
  type ViewStyle,
} from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
export const C = {
  bg: "#0E1D26",
  panel: "#162B35",
  panelDeep: "#10222C",
  border: "#2B424C",
  text: "#F5F4ED",
  muted: "#ADBDC3",
  teal: "#96DEC5",
  tealDark: "#23453F",
  coral: "#F39C88",
  gold: "#E6C78A",
  white: "#FFFFFF",
  ink: "#17262A",
};
export type IconName =
  | "hook"
  | "fish"
  | "home"
  | "draft"
  | "activity"
  | "league"
  | "settings"
  | "arrow"
  | "mail"
  | "sms"
  | "voice"
  | "check"
  | "shield"
  | "clock"
  | "sparkle"
  | "bell"
  | "pause"
  | "close"
  | "eye"
  | "logout";
const paths: Record<IconName, string> = {
  hook: "M15 4v11a5 5 0 0 1-10 0v-4l4 4M15 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4",
  fish: "M3 8v8l5-3c4 6 10 3 13-1-3-4-9-7-13-1L3 8M17 10v.1",
  home: "M3 10 12 3 21 10M5 9v11h5v-6h4v6h5V9",
  draft: "m15 4 5 5M4 20l5-1L21 7a2.1 2.1 0 0 0-5-3L4 16v4",
  activity: "M4 5h16v14H4ZM4 8l8 6 8-6",
  league:
    "M8 3h8v7a4 4 0 0 1-8 0V3M8 5H4v3a4 4 0 0 0 4 4M16 5h4v3a4 4 0 0 1-4 4M12 14v6M8 21h8",
  settings:
    "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2",
  arrow: "M4 12h15M13 6l6 6-6 6",
  mail: "M3 5h18v14H3ZM3 6l9 7 9-7",
  sms: "M4 4h16v13H9l-5 4V4M8 8h8M8 12h5",
  voice: "M8 3H4v4c0 7 6 13 13 13h4v-5l-5-2-2 3a13 13 0 0 1-7-7l3-2-2-4",
  check: "m5 12 4 4L19 6",
  shield: "M12 3 4 6v6c0 4 8 9 8 9s8-5 8-9V6l-8-3M8 12l3 3 5-6",
  clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M12 7v6l4 2",
  sparkle: "m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3 3-7",
  bell: "M5 16h14l-2-3V8a5 5 0 0 0-10 0v5l-2 3M10 20h4",
  pause: "M8 5v14M16 5v14",
  close: "m6 6 12 12M6 18 18 6",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6",
  logout: "M9 3H3v18h6M9 12h12M16 7l5 5-5 5",
};
export function Icon({
  name,
  size = 20,
  color = C.text,
}: {
  name: IconName;
  size?: number;
  color?: string;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d={paths[name]}
        stroke={color}
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
export function Hook({
  size = 54,
  color = C.teal,
}: {
  size?: number;
  color?: string;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 80 80" fill="none">
      <Path
        d="M47 12v33c0 17-26 20-26 2V35l12 10M21 35l-5 10"
        stroke={color}
        strokeWidth={5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx={47} cy={9} r={5} stroke={color} strokeWidth={4} />
      <Path
        d="M53 30c5-5 11-7 18-6-1 8-5 13-13 15l-5-9Z"
        stroke={color}
        strokeWidth={3}
      />
      <Circle cx={64} cy={29} r={1.5} fill={color} />
      <Path d="m53 31-7-4 1 10 7-1" stroke={color} strokeWidth={2} />
    </Svg>
  );
}
export function Txt({
  children,
  style,
  muted = false,
  selectable = false,
}: {
  children: React.ReactNode;
  style?: TextStyle | TextStyle[];
  muted?: boolean;
  selectable?: boolean;
}) {
  return (
    <Text selectable={selectable} style={[s.text, muted && { color: C.muted }, style]}>{children}</Text>
  );
}
export function Label({
  children,
  color = C.muted,
}: {
  children: React.ReactNode;
  color?: string;
}) {
  return (
    <Txt
      style={{
        fontSize: 12,
        fontWeight: "600",
        letterSpacing: 0.2,
        color,
      }}
    >
      {children}
    </Txt>
  );
}
export function Title({
  children,
  sub,
  kicker,
}: {
  children: React.ReactNode;
  sub?: string;
  kicker?: string;
}) {
  return (
    <View style={{ gap: 8, marginBottom: 24 }}>
      {kicker && <Label color={C.teal}>{kicker}</Label>}
      <Txt style={{ fontSize: 30, fontWeight: "700", letterSpacing: -0.7 }}>
        {children}
      </Txt>
      {sub && (
        <Txt muted style={{ fontSize: 14, lineHeight: 22, maxWidth: 610 }}>
          {sub}
        </Txt>
      )}
    </View>
  );
}
export function Card({
  children,
  style,
  testID,
}: {
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
  testID?: string;
}) {
  return <View testID={testID} style={[s.card, style]}>{children}</View>;
}
export function Row({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  return <View style={[s.row, style]}>{children}</View>;
}
export function Button({
  children,
  onPress,
  variant = "primary",
  icon,
  disabled = false,
  loading = false,
  small = false,
  style,
  accessibilityLabel,
}: {
  children: React.ReactNode;
  onPress: () => void;
  variant?: "primary" | "secondary" | "ghost" | "coral";
  icon?: IconName;
  disabled?: boolean;
  loading?: boolean;
  small?: boolean;
  style?: ViewStyle;
  accessibilityLabel?: string;
}) {
  const color =
    variant === "primary" ? C.ink : variant === "coral" ? C.coral : C.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: disabled || loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        variant === "primary"
          ? { backgroundColor: C.teal }
          : variant === "secondary"
            ? {
                backgroundColor: C.panel,
                borderWidth: 1,
                borderColor: C.border,
              }
            : variant === "coral"
              ? { backgroundColor: "#392D30" }
              : { backgroundColor: "transparent" },
        small && { paddingHorizontal: 13, minHeight: 40 },
        (disabled || loading) && { opacity: 0.45 },
        pressed && { opacity: 0.75, transform: [{ scale: 0.985 }] },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={color} />
      ) : (
        icon && <Icon name={icon} color={color} size={small ? 16 : 18} />
      )}
      <Txt style={{ fontSize: small ? 13 : 14, fontWeight: "600", color }}>
        {children}
      </Txt>
    </Pressable>
  );
}
export function Badge({
  children,
  color = C.teal,
  outline = false,
}: {
  children: React.ReactNode;
  color?: string;
  outline?: boolean;
}) {
  return (
    <View
      style={{
        alignSelf: "flex-start",
        borderRadius: 4,
        paddingHorizontal: 8,
        paddingVertical: 5,
        backgroundColor: outline ? "transparent" : `${color}14`,
        borderWidth: 1,
        borderColor: `${color}35`,
      }}
    >
      <Txt
        style={{ fontSize: 10, fontWeight: "700", letterSpacing: 0.4, color }}
      >
        {children}
      </Txt>
    </View>
  );
}
export function Avatar({
  name,
  color = C.teal,
  size = 46,
}: {
  name: string;
  color?: string;
  size?: number;
}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: `${color}20`,
        borderWidth: 1,
        borderColor: `${color}45`,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Txt style={{ color, fontSize: size * 0.32, fontWeight: "800" }}>
        {name
          .split(" ")
          .map((p) => p[0])
          .slice(0, 2)
          .join("")}
      </Txt>
    </View>
  );
}
export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  multiline = false,
  maxLength,
  help,
  editable = true,
  autoCapitalize,
  keyboardType,
  secureTextEntry,
  autoComplete,
  autoCorrect,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
  maxLength?: number;
  help?: string;
  editable?: boolean;
  autoCapitalize?: TextInputProps["autoCapitalize"];
  keyboardType?: TextInputProps["keyboardType"];
  secureTextEntry?: boolean;
  autoComplete?: TextInputProps["autoComplete"];
  autoCorrect?: boolean;
}) {
  return (
    <View style={{ gap: 7 }}>
      <Label>{label}</Label>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#738993"
        multiline={multiline}
        maxLength={maxLength}
        editable={editable}
        autoCapitalize={autoCapitalize}
        keyboardType={keyboardType}
        secureTextEntry={secureTextEntry}
        autoComplete={autoComplete}
        autoCorrect={autoCorrect}
        style={[
          s.input,
          multiline && {
            minHeight: 118,
            textAlignVertical: "top",
            lineHeight: 23,
          },
        ]}
      />
      {help && (
        <Txt muted style={{ fontSize: 11, lineHeight: 17 }}>
          {help}
        </Txt>
      )}
      {maxLength && (
        <Txt muted style={{ alignSelf: "flex-end", fontSize: 10 }}>
          {value.length} / {maxLength}
        </Txt>
      )}
    </View>
  );
}
export function Toggle({
  label,
  detail,
  value,
  onChange,
}: {
  label: string;
  detail?: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <Pressable
      accessibilityRole="switch"
      aria-checked={value}
      accessibilityLabel={label}
      accessibilityState={{ checked: value }}
      onPress={() => onChange(!value)}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingVertical: 12,
      }}
    >
      <View style={{ flex: 1, gap: 4 }}>
        <Txt style={{ fontSize: 14, fontWeight: "600" }}>{label}</Txt>
        {detail && (
          <Txt muted style={{ fontSize: 11, lineHeight: 17 }}>
            {detail}
          </Txt>
        )}
      </View>
      <View
        style={{
          width: 42,
          height: 24,
          borderRadius: 20,
          padding: 3,
          backgroundColor: value ? C.teal : C.border,
          alignItems: value ? "flex-end" : "flex-start",
        }}
      >
        <View
          style={{
            height: 18,
            width: 18,
            borderRadius: 20,
            backgroundColor: value ? C.ink : C.muted,
          }}
        />
      </View>
    </Pressable>
  );
}
export function Divider() {
  return (
    <View
      style={{ height: 1, backgroundColor: C.border, marginVertical: 16 }}
    />
  );
}
export function Empty({
  icon = "activity",
  title,
  children,
}: {
  icon?: IconName;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card style={{ alignItems: "center", paddingVertical: 40, gap: 13 }}>
      <View
        style={{ padding: 18, borderRadius: 50, backgroundColor: C.tealDark }}
      >
        <Icon name={icon} size={24} color={C.teal} />
      </View>
      <Txt style={{ fontSize: 19, fontWeight: "700", textAlign: "center" }}>
        {title}
      </Txt>
      <Txt
        muted
        style={{
          textAlign: "center",
          fontSize: 13,
          lineHeight: 21,
          maxWidth: 340,
        }}
      >
        {children}
      </Txt>
    </Card>
  );
}
export const s = StyleSheet.create({
  text: { color: C.text, fontFamily: undefined, fontSize: 14 },
  card: {
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 16,
    padding: 20,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  button: {
    minHeight: 46,
    borderRadius: 10,
    paddingHorizontal: 19,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
  },
  input: {
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.panelDeep,
    color: C.text,
    borderRadius: 9,
    padding: 13,
    fontSize: 14,
  },
  grid: { flexDirection: "row", gap: 20, alignItems: "flex-start" },
  column: { flex: 1, gap: 20 },
});

/** A short reveal entrance; accessibility motion preference is respected. */
export function RevealMotion({ children }: { children: React.ReactNode }) {
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (!mounted) return;
      if (reduced) progress.setValue(1);
      else
        Animated.timing(progress, {
          toValue: 1,
          duration: 380,
          useNativeDriver: true,
        }).start();
    });
    const listener = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      (reduced) => {
        if (reduced) {
          progress.stopAnimation();
          progress.setValue(1);
        }
      },
    );
    return () => {
      mounted = false;
      listener.remove();
      progress.stopAnimation();
    };
  }, [progress]);
  return (
    <Animated.View
      style={{
        opacity: progress,
        transform: [
          {
            translateY: progress.interpolate({
              inputRange: [0, 1],
              outputRange: [10, 0],
            }),
          },
        ],
      }}
    >
      {children}
    </Animated.View>
  );
}
