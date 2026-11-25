import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { api, useApi, inr } from "@/lib/api";
import { calcDoc } from "@/lib/gst";
import { Btn, C, Chips, ErrorText, Loading, Screen, s } from "@/components/ui";

/** 14 Quick counter bill (Non-GST cash) */
export default function QuickBill() {
  const { data: cats } = useApi<any[]>("/categories");
  const [cat, setCat] = useState("");
  const { data: products } = useApi<any[]>(`/products?category=${cat}&limit=60`);
  const [cart, setCart] = useState<Record<string, { p: any; n: number }>>({});
  const [mode, setMode] = useState<"CASH" | "UPI">("CASH");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const items = Object.values(cart);
  const c = useMemo(() => calcDoc(items.map((x) => ({ qty: x.n, rate: x.p.saleRate })), false, false), [cart]); // eslint-disable-line
  const tap = (p: any) => setCart((cc) => ({ ...cc, [p.id]: { p, n: (cc[p.id]?.n || 0) + 1 } }));
  const save = async () => {
    setBusy(true); setErr(null);
    try {
      const inv = await api("/invoices", { body: { kind: "INVOICE", billType: "NON_GST", customerName: "Walk-in customer", printFormat: "THERMAL",
        items: items.map((x) => ({ productId: x.p.id, qty: x.n })), payment: { mode, amount: c.total } } });
      router.replace(`/bill/${inv.id}?saved=1`);
    } catch (e: any) { setErr(e.message); setBusy(false); }
  };
  return (
    <Screen title="Quick cash bill" sub="Non-GST · tap items to add" footer={<View style={{ gap: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "center" }}><Text style={[s.muted, { flex: 1 }]}>{items.length} items · {items.reduce((a, x) => a + x.n, 0)} qty</Text><Text style={{ fontSize: 22, fontWeight: "800" }}>{inr(c.total)}</Text></View>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Btn title="Cash" kind={mode === "CASH" ? "primary" : "outline"} style={{ flex: 1 }} onPress={() => setMode("CASH")} />
        <Btn title="UPI QR" kind={mode === "UPI" ? "primary" : "outline"} style={{ flex: 1 }} onPress={() => setMode("UPI")} />
        <Btn title="Save" kind="wa" icon="check" style={{ flex: 1.2 }} disabled={!items.length} loading={busy} onPress={save} />
      </View></View>}>
      <Chips scroll value={cat} onChange={setCat} options={[{ value: "", label: "Top items" }, ...(cats || []).filter((x) => x.count).map((x) => ({ value: x.id, label: x.name }))]} />
      {!products ? <Loading /> : <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        {products.map((p) => {
          const n = cart[p.id]?.n;
          return (
            <Pressable key={p.id} onPress={() => tap(p)} onLongPress={() => setCart(({ [p.id]: _, ...rest }) => rest)}
              style={{ width: "31%", aspectRatio: 1, backgroundColor: n ? C.brand50 : C.white, borderRadius: 16, borderWidth: n ? 2 : 1, borderColor: n ? C.brand : C.line, padding: 10, justifyContent: "space-between" }}>
              <Text style={{ fontWeight: "700", fontSize: 13 }} numberOfLines={2}>{p.name}</Text>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}><Text style={{ fontWeight: "800" }}>{inr(p.saleRate)}</Text>{n ? <Text style={{ color: C.brand, fontWeight: "800" }}>× {n}</Text> : null}</View>
            </Pressable>);
        })}
      </View>}
      <Text style={[s.muted, { textAlign: "center" }]}>Long-press an item to remove it</Text>
      <ErrorText error={err} />
    </Screen>
  );
}
