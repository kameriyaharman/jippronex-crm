import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useApi, inr, short } from "@/lib/api";
import { useSession } from "@/lib/session";
import { C, Card, Screen, Txt, Divider, Row, H, type IconName } from "@/components/ui";
import { Logo } from "@/components/Logo";

const ACTIONS: [IconName, string, string, string, string, string?][] = [
  ["file-text", "New bill", "/bill/new", C.brand50, C.brand, "invoice.create"], ["shopping-cart", "Purchase", "/purchase", "#E8F1FD", "#2F6FD6", "purchase"],
  ["download", "Receive", "/receive", C.green50, C.green, "payments"], ["credit-card", "Expense", "/expense", C.rose50, C.rose, "payments"],
  ["package", "Add item", "/product/new", C.violet50, C.violet, "stock.adjust"], ["file", "Quotation", "/bill/new?kind=QUOTATION", C.amber50, C.warn, "invoice.create"],
  ["maximize", "Scan", "/bill/scan?mode=lookup", "#E6EEFD", C.brand], ["bar-chart-2", "Reports", "/reports", "#E8F1FD", "#2F6FD6"],
];

/** 06 Home dashboard */
export default function Home() {
  const { me, business, can } = useSession();
  const { data: d, reload, loading } = useApi<any>("/dashboard?range=today");
  const sub = business?.subscription;
  return (
    <Screen back={false} refreshing={loading} onRefresh={reload}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingTop: 6 }}>
        <Logo size={46} />
        <Pressable style={{ flex: 1 }} onPress={() => router.push("/settings")}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}><Txt size={13} color={C.muted} numberOfLines={1}>{business?.name}</Txt><Feather name="chevron-down" size={14} color={C.muted} /></View>
          <Txt w="700" size={22}>Hi, {me?.user.name.split(" ")[0]}</Txt>
        </Pressable>
        <Pressable onPress={() => router.push("/(tabs)/stock?filter=low")} style={{ width: 46, height: 46, borderRadius: 12, backgroundColor: C.white, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }}>
          <Feather name="bell" size={20} color={C.ink} />
          {!!d?.lowStockCount && <View style={{ position: "absolute", top: -5, right: -5, backgroundColor: C.bad, borderRadius: 10, minWidth: 20, height: 20, paddingHorizontal: 4, alignItems: "center", justifyContent: "center" }}><Txt w="700" size={11} color="#fff">{d.lowStockCount}</Txt></View>}
        </Pressable>
      </View>
      {sub && (!sub.usable || (sub.daysLeft != null && sub.daysLeft <= 7)) && (
        <Card onPress={() => router.push("/settings")} style={{ backgroundColor: sub.usable ? C.warn50 : C.bad50, borderColor: "transparent", padding: 12 }}>
          <Txt w="600" color={sub.usable ? C.warn : C.bad}>{sub.usable ? `${sub.cycle === "TRIAL" ? "Free trial" : sub.plan.name} ends in ${sub.daysLeft} days` : "Your plan has expired — billing paused"} · Renew →</Txt>
        </Card>
      )}
      <LinearGradient colors={["#0B49C6", "#1E73E8"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 16, padding: 20 }}>
        <Txt w="500" size={14} color="#D3E1FF">Today&apos;s sales</Txt>
        <Txt w="700" size={34} color="#fff" style={{ marginTop: 2 }}>{inr(d?.sales.amount)}</Txt>
        <View style={{ flexDirection: "row", marginTop: 14 }}>
          {([[String(d?.sales.bills ?? "—"), "Bills", "#fff"], [d?.profit ? inr(d.profit.range) : "—", "Profit", "#fff"], [short(d?.toReceive.amount), "To receive", "#FFD27A"]] as const).map(([v, l, col]) => (
            <View key={l} style={{ flex: 1 }}><Txt w="700" size={18} color={col}>{v}</Txt><Txt size={13} color="#D3E1FF">{l}</Txt></View>))}
        </View>
      </LinearGradient>
      <View style={{ flexDirection: "row", flexWrap: "wrap", marginHorizontal: -5 }}>
        {ACTIONS.filter((a) => !a[5] || can(a[5])).map(([ic, l, href, bg, fg]) => (
          <Pressable key={l} onPress={() => router.push(href as any)} style={({ pressed }) => ({ width: "25%", padding: 5, alignItems: "center", gap: 7, opacity: pressed ? 0.7 : 1 })}>
            <View style={{ width: "100%", aspectRatio: 1.2, borderRadius: 14, backgroundColor: bg, alignItems: "center", justifyContent: "center" }}><Feather name={ic} size={24} color={fg} /></View>
            <Txt w="600" size={13}>{l}</Txt>
          </Pressable>))}
      </View>
      {!!d?.lowStock?.length && <Card onPress={() => router.push("/(tabs)/stock?filter=low")}>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}><Txt w="700" size={15}>Low stock</Txt><Txt w="600" color={C.bad}>{d.lowStockCount} items</Txt></View>
        {d.lowStock.slice(0, 3).map((p: any) => <View key={p.id} style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 8 }}><Txt size={14.5} color={C.ink2} numberOfLines={1} style={{ flex: 1 }}>{p.name}</Txt><Txt w="600" color={C.warn}>{p.stock} {p.unit}</Txt></View>)}
      </Card>}
      {!!d?.recent?.length && <Card style={{ padding: 0, overflow: "hidden" }}>
        <View style={{ padding: 14, paddingBottom: 4 }}><H right={<Txt w="600" color={C.brand} onPress={() => router.push("/(tabs)/bills")}>See all</Txt>}>Recent bills</H></View>
        {d.recent.map((i: any, n: number) => <View key={i.id}>{n > 0 && <Divider />}<Row left={i.customerName} sub={i.number} right={inr(i.total)} onPress={() => router.push(`/bill/${i.id}`)} rightSub={i.status === "PAID" ? "Paid" : `Bal ${inr(i.balance)}`} /></View>)}
      </Card>}
      {can("invoice.create") && <Pressable onPress={() => router.push("/quick-bill")} style={{ alignSelf: "center", flexDirection: "row", gap: 6, alignItems: "center", padding: 8 }}><Feather name="zap" size={15} color={C.brand} /><Txt w="600" color={C.brand}>Quick counter bill (cash)</Txt></Pressable>}
    </Screen>
  );
}
