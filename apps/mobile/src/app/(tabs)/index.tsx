import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useApi, inr, short } from "@/lib/api";
import { useSession } from "@/lib/session";
import { C, Card, H, Row, Screen, Divider, type IconName } from "@/components/ui";

const ACTIONS: [IconName, string, string, string?][] = [
  ["plus-circle", "New bill", "/bill/new", "invoice.create"], ["shopping-cart", "Purchase", "/purchase", "purchase"], ["download", "Receive", "/receive", "payments"], ["credit-card", "Expense", "/expense", "payments"],
  ["package", "Add item", "/product/new", "stock.adjust"], ["file", "Quotation", "/bill/new?kind=QUOTATION", "invoice.create"], ["maximize", "Scan", "/bill/scan?mode=lookup"], ["bar-chart-2", "Reports", "/reports"],
];

/** 06 Home dashboard */
export default function Home() {
  const { me, business, can } = useSession();
  const { data: d, reload, loading } = useApi<any>("/dashboard?range=today");
  const sub = business?.subscription;
  return (
    <Screen back={false} refreshing={loading} onRefresh={reload}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <View><Text style={{ color: C.muted, fontWeight: "600" }}>{business?.name}</Text><Text style={{ fontSize: 24, fontWeight: "800", color: C.ink }}>Hi, {me?.user.name.split(" ")[0]}</Text></View>
        <Pressable onPress={() => router.push("/(tabs)/stock?filter=low")} style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: C.white, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }}>
          <Feather name="bell" size={20} color={C.ink} />
          {!!d?.lowStockCount && <View style={{ position: "absolute", top: -4, right: -4, backgroundColor: C.bad, borderRadius: 10, minWidth: 20, height: 20, alignItems: "center", justifyContent: "center" }}><Text style={{ color: "#fff", fontSize: 11, fontWeight: "800" }}>{d.lowStockCount}</Text></View>}
        </Pressable>
      </View>
      {sub && (!sub.usable || (sub.daysLeft != null && sub.daysLeft <= 7)) && (
        <Card onPress={() => router.push("/settings")} style={{ backgroundColor: sub.usable ? C.warn50 : C.bad50, borderColor: "transparent", padding: 12 }}>
          <Text style={{ color: sub.usable ? C.warn : C.bad, fontWeight: "700" }}>{sub.usable ? `${sub.cycle === "TRIAL" ? "Free trial" : sub.plan.name} ends in ${sub.daysLeft} days` : "Your plan has expired — billing paused"} · Renew →</Text>
        </Card>
      )}
      <View style={{ backgroundColor: C.brand, borderRadius: 22, padding: 18 }}>
        <Text style={{ color: C.brand300, fontWeight: "700" }}>Today&apos;s sales</Text>
        <Text style={{ color: "#fff", fontSize: 34, fontWeight: "800", marginTop: 2 }}>{inr(d?.sales.amount)}</Text>
        <View style={{ flexDirection: "row", marginTop: 14, gap: 8 }}>
          {[[String(d?.sales.bills ?? "—"), "Bills"], [d?.profit ? inr(d.profit.range) : "—", "Profit"], [short(d?.toReceive.amount), "To receive"]].map(([v, l]) => (
            <View key={l} style={{ flex: 1, backgroundColor: "#ffffff1f", borderRadius: 14, padding: 10 }}><Text style={{ color: "#fff", fontWeight: "800", fontSize: 16 }}>{v}</Text><Text style={{ color: C.brand300, fontSize: 12, fontWeight: "600" }}>{l}</Text></View>))}
        </View>
      </View>
      <Card style={{ flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 6 }}>
        {ACTIONS.filter((a) => !a[3] || can(a[3])).map(([ic, l, href]) => (
          <Pressable key={l} onPress={() => router.push(href as any)} style={{ width: "25%", alignItems: "center", paddingVertical: 8, gap: 6 }}>
            <View style={{ width: 48, height: 48, borderRadius: 16, backgroundColor: C.brand50, alignItems: "center", justifyContent: "center" }}><Feather name={ic} size={21} color={C.brand} /></View>
            <Text style={{ fontSize: 12, fontWeight: "700", color: C.ink }}>{l}</Text>
          </Pressable>))}
      </Card>
      {!!d?.lowStock?.length && <Card>
        <H right={<Text style={{ color: C.bad, fontWeight: "700" }}>{d.lowStockCount} items</Text>}>Low stock</H>
        {d.lowStock.slice(0, 4).map((p: any) => <Row key={p.id} left={p.name} right={`${p.stock} ${p.unit}`} rightColor={C.bad} onPress={() => router.push(`/product/${p.id}`)} />)}
      </Card>}
      <Card>
        <H right={<Text style={{ color: C.brand, fontWeight: "700" }} onPress={() => router.push("/(tabs)/bills")}>See all</Text>}>Recent bills</H>
        {d?.recent.map((i: any, n: number) => <View key={i.id}>{n > 0 && <Divider />}<Row left={i.customerName} sub={i.number} right={inr(i.total)} onPress={() => router.push(`/bill/${i.id}`)} rightSub={i.status === "PAID" ? "Paid" : `Bal ${inr(i.balance)}`} /></View>)}
      </Card>
      {can("invoice.create") && <Pressable onPress={() => router.push("/quick-bill")}><Text style={{ textAlign: "center", color: C.brand, fontWeight: "700", padding: 8 }}>⚡ Quick counter bill (cash)</Text></Pressable>}
    </Screen>
  );
}
