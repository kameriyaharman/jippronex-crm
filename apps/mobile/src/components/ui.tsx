import { type ReactNode } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View, RefreshControl, type TextInputProps, type ViewStyle, type StyleProp, type TextStyle, type TextProps } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";

export const C = {
  brand: "#0E47C8", brand2: "#1F6BF0", brand50: "#EAF0FD", brand100: "#D6E2FB", brand300: "#A9C3F5",
  ink: "#151833", ink2: "#3A3F5C", muted: "#7A7F98", faint: "#A6AAC0", line: "#E5E8F0", bg: "#F4F6FA", white: "#FFFFFF",
  green: "#1A9468", green50: "#E6F5EE", wa: "#22A45D", bad: "#E0323A", bad50: "#FDECEC", warn: "#D97706", warn50: "#FEF3E2",
  ok: "#1A9468", ok50: "#E6F5EE", violet: "#7B5CE0", violet50: "#F0ECFD", teal: "#10997A", teal50: "#E3F6F1", rose: "#E2465B", rose50: "#FDECEF", amber50: "#FFF4DE",
};
export type IconName = keyof typeof Feather.glyphMap;

const FONT: Record<string, string> = { "400": "Inter_400Regular", "500": "Inter_500Medium", "600": "Inter_600SemiBold", "700": "Inter_700Bold", "800": "Inter_700Bold" };
type W = "400" | "500" | "600" | "700" | "800";
/** Text with the app font. Use `w` for weight. */
export function Txt({ w = "400", size = 14, color = C.ink, style, ...p }: TextProps & { w?: W; size?: number; color?: string; style?: StyleProp<TextStyle> }) {
  return <Text {...p} style={[{ fontFamily: FONT[w], fontSize: size, color }, style]} />;
}

export function Screen({ title, sub, children, scroll = true, right, back = true, menu, footer, refreshing, onRefresh, pad = true, dark }: {
  title?: string; sub?: string; children: ReactNode; scroll?: boolean; right?: ReactNode; back?: boolean; menu?: boolean; footer?: ReactNode;
  refreshing?: boolean; onRefresh?: () => void; pad?: boolean; dark?: boolean;
}) {
  const fg = dark ? C.white : C.ink;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: dark ? "#0B0E1E" : C.bg }} edges={footer || !back ? ["top", "left", "right"] : ["top", "left", "right", "bottom"]}>
      {title != null && (
        <View style={s.header}>
          {back && <Pressable hitSlop={12} onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}><Feather name="arrow-left" size={22} color={fg} /></Pressable>}
          {menu && <Pressable hitSlop={12} onPress={() => router.push("/(tabs)/more")}><Feather name="menu" size={22} color={fg} /></Pressable>}
          <View style={{ flex: 1 }}><Txt w="700" size={19} color={fg} numberOfLines={1}>{title}</Txt>{sub ? <Txt size={12.5} color={dark ? "#B9C0DA" : C.muted}>{sub}</Txt> : null}</View>
          {right}
        </View>
      )}
      {scroll ? (
        <ScrollView contentContainerStyle={pad ? { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 32, gap: 12 } : undefined} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
          refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} colors={[C.brand]} /> : undefined}>{children}</ScrollView>
      ) : <View style={[{ flex: 1 }, pad && { paddingHorizontal: 16, paddingTop: 4, gap: 12 }]}>{children}</View>}
      {footer && <SafeAreaView edges={["bottom"]} style={s.footer}>{footer}</SafeAreaView>}
    </SafeAreaView>
  );
}

export function Card({ children, style, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  if (onPress) return <Pressable onPress={onPress} style={({ pressed }) => [s.card, style, pressed && { opacity: 0.8 }]}>{children}</Pressable>;
  return <View style={[s.card, style]}>{children}</View>;
}

type BtnKind = "primary" | "green" | "wa" | "outline" | "ghost" | "danger" | "white";
export function Btn({ title, onPress, kind = "primary", icon, disabled, loading, style, small }: {
  title: string; onPress?: () => void; kind?: BtnKind; icon?: IconName; disabled?: boolean; loading?: boolean; style?: StyleProp<ViewStyle>; small?: boolean;
}) {
  const bg = { primary: C.brand, green: C.green, wa: C.wa, danger: C.bad, outline: C.white, white: C.white, ghost: "transparent" }[kind];
  const fg = kind === "outline" || kind === "ghost" ? C.ink : kind === "white" ? C.brand : C.white;
  return (
    <Pressable disabled={disabled || loading} onPress={onPress}
      style={({ pressed }) => [s.btn, small && { height: 40, paddingHorizontal: 12 }, { backgroundColor: bg, opacity: disabled ? 0.45 : pressed ? 0.85 : 1 }, kind === "outline" && { borderWidth: 1, borderColor: C.line }, style]}>
      {loading ? <ActivityIndicator color={fg} /> : <>{icon && <Feather name={icon} size={small ? 15 : 17} color={fg} />}<Txt w="600" size={small ? 13.5 : 15} color={fg}>{title}</Txt></>}
    </Pressable>
  );
}

export function Field({ label, children, style }: { label?: string; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ gap: 6 }, style]}>{label && <Txt w="600" size={13} color={C.ink2}>{label}</Txt>}{children}</View>;
}

export function Input({ label, icon, right, style, big, ...p }: TextInputProps & { label?: string; icon?: IconName; right?: ReactNode; big?: boolean }) {
  const box = (
    <View style={[s.inputBox, big && { height: 62 }, p.multiline && { height: 90, alignItems: "flex-start", paddingTop: 10 }]}>
      {icon && <Feather name={icon} size={17} color={C.muted} />}
      <TextInput placeholderTextColor={C.faint} {...p}
        style={[{ flex: 1, fontFamily: big ? FONT["700"] : FONT["400"], fontSize: big ? 26 : 15, color: C.ink, paddingVertical: 0 }, p.multiline && { textAlignVertical: "top" }, style]} />
      {right}
    </View>
  );
  return label ? <Field label={label}>{box}</Field> : box;
}

/** Tappable read-only field (pickers, dates) */
export function SelectBox({ label, icon, value, placeholder, onPress, right }: { label?: string; icon?: IconName; value?: string | null; placeholder?: string; onPress?: () => void; right?: ReactNode }) {
  const box = (
    <Pressable onPress={onPress} style={s.inputBox}>
      {icon && <Feather name={icon} size={17} color={C.muted} />}
      <Txt size={15} color={value ? C.ink : C.faint} style={{ flex: 1 }} numberOfLines={1}>{value || placeholder}</Txt>
      {right}
    </Pressable>
  );
  return label ? <Field label={label}>{box}</Field> : box;
}

export function Chips<T extends string>({ value, onChange, options, scroll }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; scroll?: boolean }) {
  const body = options.map((o) => {
    const on = o.value === value;
    return <Pressable key={o.value} onPress={() => onChange(o.value)} style={[s.chip, on && { backgroundColor: C.brand, borderColor: C.brand }]}><Txt w="500" size={13.5} color={on ? C.white : C.ink2}>{o.label}</Txt></Pressable>;
  });
  return scroll ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>{body}</ScrollView> : <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>{body}</View>;
}

export function Seg<T extends string>({ value, onChange, options, tone = "brand" }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; tone?: "brand" | "green" }) {
  return (
    <View style={s.seg}>{options.map((o) => {
      const on = o.value === value;
      return <Pressable key={o.value} onPress={() => onChange(o.value)} style={[s.segItem, on && s.segOn]}><Txt w="600" size={13.5} color={on ? (tone === "green" ? C.green : C.brand) : C.muted}>{o.label}</Txt></Pressable>;
    })}</View>
  );
}

/** Small toggle chips used in headers (GST / Non-GST) */
export function MiniToggle<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return <View style={{ flexDirection: "row", gap: 6 }}>{options.map((o) => {
    const on = o.value === value;
    return <Pressable key={o.value} onPress={() => onChange(o.value)} style={{ paddingHorizontal: 10, height: 28, borderRadius: 8, justifyContent: "center", backgroundColor: on ? C.brand50 : "#EEF0F5" }}>
      <Txt w="600" size={12} color={on ? C.brand : C.muted}>{o.label}</Txt></Pressable>;
  })}</View>;
}

const PILL: Record<string, [string, string, string]> = {
  PAID: [C.green50, C.green, "Paid"], PARTIAL: [C.warn50, C.warn, "Partial"], UNPAID: [C.bad50, C.bad, "Unpaid"], ACTIVE: [C.green50, C.green, "Active"],
  TRIAL: [C.brand50, C.brand, "Trial"], EXPIRED: [C.bad50, C.bad, "Expired"], LOW: [C.warn50, C.warn, "Low"], OUT: [C.bad50, C.bad, "Out"],
};
export function Pill({ status, label, dot }: { status: string; label?: string; dot?: boolean }) {
  const [bg, fg, l] = PILL[status] || [C.bg, C.muted, status];
  return <View style={[s.pill, { backgroundColor: bg }]}>{dot && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: fg }} />}<Txt w="600" size={12} color={fg}>{label ?? l}</Txt></View>;
}

/** Colored icon tile (home actions, report tiles, product icons) */
export function IconTile({ icon, bg, fg, size = 48, radius = 14 }: { icon: IconName; bg: string; fg: string; size?: number; radius?: number }) {
  return <View style={{ width: size, height: size, borderRadius: radius, backgroundColor: bg, alignItems: "center", justifyContent: "center" }}><Feather name={icon} size={size * 0.44} color={fg} /></View>;
}

/** A list item rendered as its own card (design style) */
export function ListCard({ title, sub, right, rightSub, rightColor, rightSubColor, onPress, left, trailing }: {
  title: string; sub?: string; right?: string; rightSub?: string; rightColor?: string; rightSubColor?: string; onPress?: () => void; left?: ReactNode; trailing?: ReactNode;
}) {
  return (
    <Card onPress={onPress} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 }}>
      {left}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt w="600" size={14.5} numberOfLines={1}>{title}</Txt>
        {sub ? <Txt size={12} color={C.muted} numberOfLines={1} style={{ marginTop: 2 }}>{sub}</Txt> : null}
      </View>
      <View style={{ alignItems: "flex-end" }}>
        {right != null && <Txt w="700" size={14.5} color={rightColor || C.ink}>{right}</Txt>}
        {rightSub ? <Txt size={12} color={rightSubColor || C.muted} style={{ marginTop: 2 }}>{rightSub}</Txt> : null}
      </View>
      {trailing}
    </Card>
  );
}

export function KV({ k, v, bold, color, big }: { k: string; v: string; bold?: boolean; color?: string; big?: boolean }) {
  return <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 }}>
    <Txt w={bold ? "600" : "400"} size={big ? 15 : 14} color={bold ? C.ink : C.muted}>{k}</Txt>
    <Txt w={bold ? "700" : "600"} size={big ? 19 : 14} color={color || C.ink}>{v}</Txt></View>;
}

export const Dashed = () => <View style={{ borderTopWidth: 1, borderStyle: "dashed", borderColor: C.line, marginVertical: 6 }} />;
export const Divider = () => <View style={{ height: 1, backgroundColor: C.line }} />;
export const Label = ({ children }: { children: ReactNode }) => <Txt w="600" size={13} color={C.ink2}>{children}</Txt>;
export const Loading = () => <View style={{ padding: 40, alignItems: "center" }}><ActivityIndicator color={C.brand} size="large" /></View>;
export const Empty = ({ title, sub }: { title: string; sub?: string }) => (
  <View style={{ padding: 32, alignItems: "center" }}><Txt w="600">{title}</Txt>{sub && <Txt color={C.muted} style={{ marginTop: 4, textAlign: "center" }}>{sub}</Txt>}</View>
);
export const ErrorText = ({ error }: { error?: string | null }) => (error ? <View style={{ backgroundColor: C.bad50, padding: 12, borderRadius: 10 }}><Txt w="500" color={C.bad}>{error}</Txt></View> : null);

const AV = [[C.brand50, C.brand], [C.amber50, C.warn], [C.green50, C.green], [C.rose50, C.rose], [C.violet50, C.violet], [C.teal50, C.teal]];
export function Avatar({ name, size = 40, bg, fg }: { name: string; size?: number; bg?: string; fg?: string }) {
  const i = [...(name || "?")].reduce((a, c) => a + c.charCodeAt(0), 0) % AV.length;
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg || AV[i][0], alignItems: "center", justifyContent: "center" }}>
    <Txt w="700" size={size * 0.34} color={fg || AV[i][1]}>{(name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase()}</Txt></View>;
}

/** Floating + button */
export function Fab({ onPress, icon = "plus" }: { onPress: () => void; icon?: IconName }) {
  return <Pressable onPress={onPress} style={({ pressed }) => [s.fab, pressed && { opacity: 0.85 }]}><Feather name={icon} size={26} color="#fff" /></Pressable>;
}

export const s = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 16, paddingTop: 6, paddingBottom: 12 },
  footer: { backgroundColor: C.white, borderTopWidth: 1, borderTopColor: C.line, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6 },
  card: { backgroundColor: C.white, borderRadius: 12, borderWidth: 1, borderColor: C.line, padding: 14 },
  btn: { height: 52, borderRadius: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 16 },
  inputBox: { height: 50, borderRadius: 10, borderWidth: 1, borderColor: C.line, backgroundColor: C.white, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 10 },
  chip: { height: 36, paddingHorizontal: 15, borderRadius: 18, borderWidth: 1, borderColor: C.line, backgroundColor: C.white, justifyContent: "center", alignItems: "center" },
  seg: { flexDirection: "row", backgroundColor: "#ECEFF5", borderRadius: 10, padding: 3 },
  segItem: { flex: 1, height: 38, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  segOn: { backgroundColor: C.white, shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 4, elevation: 1 },
  pill: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 20, alignSelf: "flex-start" },
  fab: { position: "absolute", right: 20, bottom: 20, width: 60, height: 60, borderRadius: 18, backgroundColor: C.brand, alignItems: "center", justifyContent: "center", shadowColor: C.brand, shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
  muted: { color: C.muted, fontSize: 13, fontFamily: "Inter_400Regular" },
  label: { color: C.ink2, fontSize: 13, fontFamily: "Inter_600SemiBold" },
  chipText: { color: C.ink2, fontSize: 13.5, fontFamily: "Inter_500Medium" },
  input: { height: 50, borderRadius: 10, borderWidth: 1, borderColor: C.line, backgroundColor: C.white, paddingHorizontal: 14, fontSize: 15, color: C.ink, fontFamily: "Inter_400Regular" },
});

/** Section heading with optional right action */
export const H = ({ children, right }: { children: ReactNode; right?: ReactNode }) => (
  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}><Txt w="700" size={15.5}>{children}</Txt>{right}</View>
);
/** Row inside a card (menu rows, list rows) */
export function Row({ left, right, sub, rightSub, onPress, rightColor, icon, iconBg }: { left: string; right?: string; sub?: string; rightSub?: string; onPress?: () => void; rightColor?: string; icon?: ReactNode; iconBg?: string }) {
  const Body = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 14 }}>
      {icon && <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: iconBg || C.brand50, alignItems: "center", justifyContent: "center" }}>{icon}</View>}
      <View style={{ flex: 1, minWidth: 0 }}><Txt w="600" size={14.5} numberOfLines={1}>{left}</Txt>{sub ? <Txt size={12} color={C.muted} numberOfLines={1} style={{ marginTop: 2 }}>{sub}</Txt> : null}</View>
      <View style={{ alignItems: "flex-end" }}>{right != null && <Txt w="700" size={14.5} color={rightColor || C.ink}>{right}</Txt>}{rightSub ? <Txt size={12} color={C.muted} style={{ marginTop: 2 }}>{rightSub}</Txt> : null}</View>
    </View>
  );
  return onPress ? <Pressable onPress={onPress} style={({ pressed }) => pressed && { backgroundColor: C.bg }}>{Body}</Pressable> : Body;
}
