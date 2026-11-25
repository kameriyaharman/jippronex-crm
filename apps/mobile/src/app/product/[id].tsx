import { Pressable, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useApi, inr, qty, dm, tm } from "@/lib/api";
import { useSession } from "@/lib/session";
import { Btn, C, Card, Loading, Row, Screen, Divider, H, s } from "@/components/ui";

const REASON: Record<string, string> = { OPENING: "Opening stock", SALE: "Sale", PURCHASE: "Purchase", RETURN: "Return", DAMAGE: "Damaged", ADJUSTMENT: "Adjustment", TRANSFER: "Transfer", SALE_CANCEL: "Bill cancelled" };

/** 19 Product detail & history */
export default function ProductDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { can } = useSession();
  const { data: p } = useApi<any>(`/products/${id}`);
  if (!p) return <Screen title="Product"><Loading /></Screen>;
  return (
    <Screen title={p.name} right={can("stock.adjust") ? <Pressable onPress={() => router.push(`/product/new?id=${id}`)}><Feather name="edit-2" size={20} color={C.brand} /></Pressable> : undefined}
      footer={can("stock.adjust") ? <View style={{ flexDirection: "row", gap: 10 }}>
        <Btn title="Stock out" kind="outline" style={{ flex: 1 }} onPress={() => router.push(`/stock-adjust?productId=${id}&dir=OUT`)} />
        <Btn title="Stock in" style={{ flex: 1 }} onPress={() => router.push(`/stock-adjust?productId=${id}&dir=IN`)} /></View> : undefined}>
      <View style={{ flexDirection: "row", gap: 10 }}>
        {[[qty(p.stock), "In stock", p.state !== "OK" ? C.bad : C.ink], [qty(p.minStock), "Min stock", C.ink], [p.purchaseRate != null ? `${p.margin}%` : "—", "Margin", C.ok]].map(([v, l, col]) => (
          <Card key={l} style={{ flex: 1, alignItems: "center", padding: 12 }}><Text style={{ fontSize: 22, fontWeight: "800", color: col }}>{v}</Text><Text style={s.muted}>{l}</Text></Card>))}
      </View>
      {p.reorderQty > 0 && <View style={{ backgroundColor: C.bad50, borderRadius: 14, padding: 12 }}><Text style={{ color: C.bad, fontWeight: "700" }}>Low stock — reorder {p.reorderQty} {p.unit}</Text></View>}
      <Card><Text style={s.muted}>Sale {inr(p.saleRate)}{p.purchaseRate != null ? ` · Buy ${inr(p.purchaseRate)}` : ""} · GST {p.gstRate}% · HSN {p.hsn || "—"}</Text><Text style={[s.muted, { marginTop: 2 }]}>Barcode {p.barcode || "—"}</Text></Card>
      <Card>
        <H>Stock history</H>
        {p.history.map((m: any, i: number) => <View key={m.id}>{i > 0 && <Divider />}
          <Row left={`${REASON[m.reason]}${m.refNo ? " · " + m.refNo.replace(/^INV-\d{4}-/, "INV-") : ""}`} sub={`${dm(m.createdAt)}, ${tm(m.createdAt)}${m.note ? " · " + m.note : ""}`} right={`${m.qty > 0 ? "+" : "−"} ${qty(Math.abs(m.qty))}`} rightColor={m.qty > 0 ? C.ok : C.bad} /></View>)}
      </Card>
    </Screen>
  );
}
