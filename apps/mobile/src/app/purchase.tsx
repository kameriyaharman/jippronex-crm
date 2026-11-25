import { useMemo, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { api, inr, isoDate } from "@/lib/api";
import { calcDoc } from "@/lib/gst";
import { Btn, C, Card, ErrorText, Input, Screen, Seg, s } from "@/components/ui";
import { PartyPickerModal, ProductSearch, type Party } from "@/components/Pickers";

/** 22 Purchase entry */
export default function Purchase() {
  const [sup, setSup] = useState<Party | null>(null);
  const [pick, setPick] = useState(false);
  const [billNo, setBillNo] = useState("");
  const [date, setDate] = useState(isoDate());
  const [lines, setLines] = useState<any[]>([]);
  const [paid, setPaid] = useState<"PAID" | "CREDIT">("CREDIT");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const c = useMemo(() => calcDoc(lines, false, true), [lines]);
  const upd = (i: number, patch: any) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const save = async () => {
    setBusy(true); setErr(null);
    try {
      await api("/purchases", { body: { supplierId: sup!.id, supplierBillNo: billNo || null, date: new Date(date + "T12:00:00"), creditDays: 15,
        items: lines.map((l) => ({ productId: l.productId, qty: l.qty, rate: l.rate, gstRate: l.gstRate })), payment: paid === "PAID" ? { mode: "BANK", amount: c.total } : null } });
      router.back();
    } catch (e: any) { setErr(e.message); setBusy(false); }
  };
  return (
    <Screen title="New purchase" footer={<View style={{ gap: 10 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}><Text style={{ fontWeight: "700" }}>Total</Text><Text style={{ fontSize: 22, fontWeight: "800" }}>{inr(c.total)}</Text></View>
      <Btn title="Save & update stock" onPress={save} loading={busy} disabled={!sup || !lines.length} /></View>}>
      <Card onPress={() => setPick(true)} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}><Feather name="truck" size={20} color={C.brand} /><Text style={{ flex: 1, fontWeight: "800", color: sup ? C.ink : C.faint }}>{sup?.name || "Select supplier"}</Text><Feather name="chevron-down" size={18} color={C.muted} /></Card>
      <View style={{ flexDirection: "row", gap: 10 }}><View style={{ flex: 1.3 }}><Input label="Bill no." value={billNo} onChangeText={setBillNo} placeholder="INV/ITC/8834" /></View><View style={{ flex: 1 }}><Input label="Date" value={date} onChangeText={setDate} /></View></View>
      <ProductSearch onPick={(p) => setLines((ls) => (ls.some((l) => l.productId === p.id) ? ls : [...ls, { productId: p.id, name: p.name, unit: p.unit, qty: 1, rate: p.purchaseRate ?? 0, gstRate: p.gstRate }]))} />
      {lines.map((l, i) => (
        <Card key={l.productId} style={{ gap: 8 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}><Text style={{ fontWeight: "800", flex: 1 }}>{l.name}</Text><Pressable onPress={() => setLines(lines.filter((_, j) => j !== i))}><Feather name="trash-2" size={18} color={C.bad} /></Pressable></View>
          <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
            <TextInput keyboardType="decimal-pad" value={String(l.qty)} onChangeText={(t) => upd(i, { qty: Number(t) || 0 })} style={[s.input, { height: 40, width: 70 }]} /><Text style={s.muted}>{l.unit} × ₹</Text>
            <TextInput keyboardType="decimal-pad" value={String(l.rate)} onChangeText={(t) => upd(i, { rate: Number(t) || 0 })} style={[s.input, { height: 40, width: 80 }]} /><Text style={s.muted}>· {l.gstRate}%</Text>
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}><Text style={{ color: C.ok, fontWeight: "700" }}>stock +{l.qty}</Text><Text style={{ fontWeight: "800" }}>{inr(c.lines[i]?.amount)}</Text></View>
        </Card>))}
      <Seg value={paid} onChange={setPaid} options={[{ value: "PAID", label: "Paid now" }, { value: "CREDIT", label: "Credit · 15 days" }]} />
      <ErrorText error={err} />
      <PartyPickerModal visible={pick} type="SUPPLIER" onClose={() => setPick(false)} onPick={(p) => { setSup(p); setPick(false); }} />
    </Screen>
  );
}
