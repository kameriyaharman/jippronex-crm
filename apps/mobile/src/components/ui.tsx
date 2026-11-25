import { type ReactNode } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps, type ViewStyle, type StyleProp, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";

export const C = {
  brand: "#0B46C4", brand50: "#E6EEFE", brand300: "#9CC4FA", ink: "#1B1D3A", muted: "#6B7090", faint: "#9A9DB5", line: "#E6E7F0",
  bg: "#F5F7FB", white: "#FFFFFF", ok: "#15803D", ok50: "#E3F5EE", warn: "#B45309", warn50: "#FBF1DE", bad: "#DC2626", bad50: "#FDECEB", wa: "#16A34A",
};
export type IconName = keyof typeof Feather.glyphMap;

export function Screen({ title, sub, children, scroll = true, right, back = true, footer, refreshing, onRefresh, pad = true }: {
  title?: string; sub?: string; children: ReactNode; scroll?: boolean; right?: ReactNode; back?: boolean; footer?: ReactNode; refreshing?: boolean; onRefresh?: () => void; pad?: boolean;
}) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={["top", "left", "right"]}>
      {title != null && (
        <View style={s.header}>
          {back && <Pressable hitSlop={12} onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} style={{ marginRight: 10 }}><Feather name="arrow-left" size={22} color={C.ink} /></Pressable>}
          <View style={{ flex: 1 }}><Text style={s.title} numberOfLines={1}>{title}</Text>{sub ? <Text style={s.sub} numberOfLines={1}>{sub}</Text> : null}</View>
          {right}
        </View>
      )}
      {scroll ? (
        <ScrollView contentContainerStyle={pad ? { padding: 16, paddingBottom: 40, gap: 12 } : undefined} keyboardShouldPersistTaps="handled"
          refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} colors={[C.brand]} /> : undefined}>{children}</ScrollView>
      ) : <View style={[{ flex: 1 }, pad && { padding: 16, gap: 12 }]}>{children}</View>}
      {footer && <SafeAreaView edges={["bottom"]} style={s.footer}>{footer}</SafeAreaView>}
    </SafeAreaView>
  );
}

export function Card({ children, style, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  if (onPress) return <Pressable onPress={onPress} style={({ pressed }) => [s.card, style, pressed && { opacity: 0.85 }]}>{children}</Pressable>;
  return <View style={[s.card, style]}>{children}</View>;
}

export function Btn({ title, onPress, kind = "primary", icon, disabled, loading, style, small }: {
  title: string; onPress?: () => void; kind?: "primary" | "outline" | "wa" | "ghost" | "danger"; icon?: IconName; disabled?: boolean; loading?: boolean; style?: StyleProp<ViewStyle>; small?: boolean;
}) {
  const bg = kind === "primary" ? C.brand : kind === "wa" ? C.wa : kind === "danger" ? C.bad : kind === "outline" ? C.white : "transparent";
  const fg = kind === "outline" || kind === "ghost" ? C.ink : C.white;
  return (
    <Pressable disabled={disabled || loading} onPress={onPress}
      style={({ pressed }) => [s.btn, small && { height: 38, paddingHorizontal: 12 }, { backgroundColor: bg, opacity: disabled ? 0.45 : pressed ? 0.85 : 1 }, kind === "outline" && { borderWidth: 1, borderColor: C.line }, style]}>
      {loading ? <ActivityIndicator color={fg} /> : <>{icon && <Feather name={icon} size={small ? 15 : 17} color={fg} />}<Text style={[s.btnText, { color: fg }, small && { fontSize: 13 }]}>{title}</Text></>}
    </Pressable>
  );
}

export function Input({ label, hint, style, ...p }: TextInputProps & { label?: string; hint?: string }) {
  return (
    <View style={{ gap: 6 }}>
      {label && <Text style={s.label}>{label}</Text>}
      <TextInput placeholderTextColor={C.faint} {...p} style={[s.input, p.multiline && { height: 80, textAlignVertical: "top", paddingTop: 10 }, style]} />
      {hint && <Text style={{ fontSize: 11, color: C.muted }}>{hint}</Text>}
    </View>
  );
}

export function Chips<T extends string>({ value, onChange, options, scroll }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; scroll?: boolean }) {
  const body = options.map((o) => {
    const on = o.value === value;
    return <Pressable key={o.value} onPress={() => onChange(o.value)} style={[s.chip, on && { backgroundColor: C.brand, borderColor: C.brand }]}><Text style={[s.chipText, on && { color: C.white }]}>{o.label}</Text></Pressable>;
  });
  return scroll ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>{body}</ScrollView> : <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>{body}</View>;
}

export function Seg<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <View style={s.seg}>{options.map((o) => (
      <Pressable key={o.value} onPress={() => onChange(o.value)} style={[s.segItem, o.value === value && s.segOn]}><Text style={[s.segText, o.value === value && { color: C.brand }]}>{o.label}</Text></Pressable>))}</View>
  );
}

const PILL: Record<string, [string, string, string]> = {
  PAID: [C.ok50, C.ok, "Paid"], PARTIAL: [C.warn50, C.warn, "Partial"], UNPAID: [C.bad50, C.bad, "Unpaid"], ACTIVE: [C.ok50, C.ok, "Active"], TRIAL: [C.brand50, C.brand, "Trial"],
  EXPIRED: [C.bad50, C.bad, "Expired"], LOW: [C.bad50, C.bad, "Low"], OUT: [C.bad50, C.bad, "Out"], INVITED: [C.warn50, C.warn, "Invited"],
};
export function Pill({ status, label }: { status: string; label?: string }) {
  const [bg, fg, l] = PILL[status] || [C.bg, C.muted, status];
  return <View style={[s.pill, { backgroundColor: bg }]}><Text style={{ color: fg, fontSize: 11.5, fontWeight: "700" }}>{label ?? l}</Text></View>;
}

export function Row({ left, right, sub, rightSub, onPress, rightColor, icon, iconBg }: { left: string; right?: string; sub?: string; rightSub?: string; onPress?: () => void; rightColor?: string; icon?: ReactNode; iconBg?: string }) {
  const Body = (
    <View style={s.row}>
      {icon && <View style={[s.rowIcon, iconBg ? { backgroundColor: iconBg } : null]}>{icon}</View>}
      <View style={{ flex: 1, minWidth: 0 }}><Text style={s.rowTitle} numberOfLines={1}>{left}</Text>{sub ? <Text style={s.rowSub} numberOfLines={1}>{sub}</Text> : null}</View>
      <View style={{ alignItems: "flex-end" }}>{right != null && <Text style={[s.rowRight, rightColor ? { color: rightColor } : null]}>{right}</Text>}{rightSub ? <Text style={s.rowSub}>{rightSub}</Text> : null}</View>
    </View>
  );
  return onPress ? <Pressable onPress={onPress} style={({ pressed }) => pressed && { backgroundColor: C.bg }}>{Body}</Pressable> : Body;
}

export function KV({ k, v, bold, color, big }: { k: string; v: string; bold?: boolean; color?: string; big?: boolean }) {
  return <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 }}>
    <Text style={{ color: bold ? C.ink : C.muted, fontWeight: bold ? "800" : "500", fontSize: big ? 17 : 14 }}>{k}</Text>
    <Text style={{ color: color || C.ink, fontWeight: bold ? "800" : "600", fontSize: big ? 22 : 14 }}>{v}</Text></View>;
}

export const Loading = () => <View style={{ padding: 40, alignItems: "center" }}><ActivityIndicator color={C.brand} size="large" /></View>;
export const Empty = ({ title, sub }: { title: string; sub?: string }) => (
  <View style={{ padding: 32, alignItems: "center" }}><Text style={{ fontWeight: "700", color: C.ink }}>{title}</Text>{sub && <Text style={{ color: C.muted, marginTop: 4, textAlign: "center" }}>{sub}</Text>}</View>
);
export const ErrorText = ({ error }: { error?: string | null }) => (error ? <View style={{ backgroundColor: C.bad50, padding: 12, borderRadius: 12 }}><Text style={{ color: C.bad, fontWeight: "600" }}>{error}</Text></View> : null);
export const H = ({ children, right }: { children: ReactNode; right?: ReactNode }) => (
  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}><Text style={{ fontSize: 15, fontWeight: "800", color: C.ink }}>{children}</Text>{right}</View>
);
export const Avatar = ({ name, bg = C.brand50, fg = C.brand, size = 40 }: { name: string; bg?: string; fg?: string; size?: number }) => (
  <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: "center", justifyContent: "center" }}>
    <Text style={{ color: fg, fontWeight: "800", fontSize: size * 0.34 }}>{(name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase()}</Text></View>
);
export const Divider = () => <View style={{ height: 1, backgroundColor: C.line }} />;

export const s = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.line },
  title: { fontSize: 18, fontWeight: "800", color: C.ink },
  sub: { fontSize: 12, color: C.muted },
  footer: { backgroundColor: C.white, borderTopWidth: 1, borderTopColor: C.line, padding: 12 },
  card: { backgroundColor: C.white, borderRadius: 18, borderWidth: 1, borderColor: C.line, padding: 16 },
  btn: { height: 50, borderRadius: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 16 },
  btnText: { fontSize: 15, fontWeight: "700" },
  label: { fontSize: 12.5, fontWeight: "700", color: C.ink },
  input: { height: 48, borderRadius: 12, borderWidth: 1, borderColor: C.line, backgroundColor: C.white, paddingHorizontal: 14, fontSize: 15, color: C.ink },
  chip: { height: 34, paddingHorizontal: 14, borderRadius: 17, borderWidth: 1, borderColor: C.line, backgroundColor: C.white, justifyContent: "center" },
  chipText: { fontSize: 13, fontWeight: "700", color: C.muted },
  seg: { flexDirection: "row", backgroundColor: "#ECEEF4", borderRadius: 12, padding: 3 },
  segItem: { flex: 1, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  segOn: { backgroundColor: C.white, shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 4, elevation: 1 },
  segText: { fontWeight: "700", color: C.muted, fontSize: 13.5 },
  pill: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 20, alignSelf: "flex-start" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  rowIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: C.brand50, alignItems: "center", justifyContent: "center" },
  rowTitle: { fontSize: 14.5, fontWeight: "700", color: C.ink },
  rowSub: { fontSize: 12, color: C.muted, marginTop: 2 },
  rowRight: { fontSize: 14.5, fontWeight: "800", color: C.ink },
  big: { fontSize: 28, fontWeight: "800", color: C.ink },
  muted: { color: C.muted, fontSize: 13 },
});
