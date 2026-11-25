import { useEffect, useMemo, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { api, inr, inr2, isoDate } from "@/lib/api";
import { calcDoc } from "@/lib/gst";
import { bus } from "@/lib/bus";
import { Btn, C, Card, ErrorText, Input, KV, Screen, Seg, Divider, s } from "@/components/ui";
import { PartyPickerModal, ProductSearch, type Party, type Product } from "@/components/Pickers";

type Line = { key: string; productId: string | null; name: string; unit: string; qty: number; rate: number; discountPct: number; gstRate: number; hsn?: string | null };
const TITLE: Record<string, string> = { INVOICE: "New bill", QUOTATION: "New quotation", CREDIT_NOTE: "Sales return" };

/** 07 New bill → 09 Payment & balance → 10 Bill saved. Also 16 Quotation (kind=QUOTATION). */
export default function NewBill() {
  const { kind = "INVOICE" } = useLocalSearchParams<{ kind?: string }>();
  const isSale = kind === "INVOICE";
  const [step, setStep] = useState<"items" | "pay">("items");
  const [billType, setBillType] = useState<"GST" | "NON_GST">("GST");
  const [party, setParty] = useState<Party | null>(null);
  const [picker, setPicker] = useState(false);
  const [biz, setBiz] = useState<any>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [mode, setMode] = useState<"CASH" | "UPI" | "CARD" | "CREDIT">("CASH");
  const [received, setReceived] = useState<string | null>(null);
  const [due, setDue] = useState(isoDate(new Date(Date.now() + 7 * 864e5)));
  const [validTill, setValidTill] = useState(isoDate(new Date(Date.now() + 14 * 864e5)));
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { api("/settings/business").then(setBiz).catch(() => {}); }, []);
  const add = (p: Product, n = 1) => setLines((ls) => {
    const i = ls.findIndex((l) => l.productId === p.id);
    if (i >= 0) { const c = [...ls]; c[i] = { ...c[i], qty: c[i].qty + n }; return c; }
    return [...ls, { key: p.id + Date.now(), productId: p.id, name: p.name, unit: p.unit, qty: n, rate: p.saleRate, discountPct: 0, gstRate: p.gstRate, hsn: p.hsn }];
  });
  useEffect(() => bus.on<{ product: Product; qty: number }>("scan:add", ({ product, qty }) => add(product, qty)), []);
  const upd = (key: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const pos = party?.stateCode || biz?.stateCode || "19";
  const interState = billType === "GST" && !!biz && pos !== biz.stateCode;
  const c = useMemo(() => calcDoc(lines, interState, billType === "GST"), [lines, interState, billType]);
  const recv = mode === "CREDIT" ? 0 : Math.min(Number(received ?? c.total), c.total);
  const balance = Math.max(0, c.total - recv);

  const save = async () => {
    setErr(null);
    if (isSale && !party && balance > 0.5) return setErr("Walk-in bill must be fully paid. Select a customer for credit.");
    setBusy(true);
    try {
      const inv = await api("/invoices", { body: {
        kind, billType, partyId: party?.id ?? null, customerName: party ? undefined : "Walk-in customer", placeOfSupply: pos,
        items: lines.map((l) => ({ productId: l.productId, name: l.name, unit: l.unit, qty: l.qty, rate: l.rate, discountPct: l.discountPct, gstRate: l.gstRate, hsn: l.hsn })),
        payment: isSale ? { mode, amount: recv } : null, dueDate: isSale && balance > 0 ? due : null, validTill: kind === "QUOTATION" ? validTill : null,
      } });
      router.replace(`/bill/${inv.id}?saved=1`);
    } catch (e: any) { setErr(e.message); setBusy(false); }
  };

  if (step === "pay") return (
    <Screen title="Payment" sub={party?.name || "Walk-in customer"} footer={<Btn title="Save bill" icon="check" onPress={save} loading={busy} />}>
      <Card style={{ gap: 2 }}>
        <KV k="Taxable value" v={`₹${inr2(c.taxable)}`} />
        {c.discount > 0 && <KV k="Discount" v={`− ₹${inr2(c.discount)}`} />}
        {interState ? <KV k="IGST" v={`₹${inr2(c.igst)}`} /> : <><KV k="CGST" v={`₹${inr2(c.cgst)}`} /><KV k="SGST" v={`₹${inr2(c.sgst)}`} /></>}
        <KV k="Round off" v={`${c.roundOff >= 0 ? "+" : "−"} ₹${inr2(Math.abs(c.roundOff))}`} />
        <View style={{ height: 8 }} /><Divider /><View style={{ height: 6 }} />
        <KV k="Grand total" v={inr(c.total)} bold big color={C.brand} />
      </Card>
      <Text style={s.label}>Payment mode</Text>
      <View style={{ flexDirection: "row", gap: 8 }}>{(["CASH", "UPI", "CARD", "CREDIT"] as const).map((m) => (
        <Pressable key={m} disabled={m === "CREDIT" && !party} onPress={() => setMode(m)} style={[s.chip, { flex: 1, alignItems: "center", height: 42 }, mode === m && { backgroundColor: C.brand, borderColor: C.brand }, m === "CREDIT" && !party && { opacity: 0.4 }]}>
          <Text style={[s.chipText, mode === m && { color: "#fff" }]}>{m === "UPI" ? "UPI" : m[0] + m.slice(1).toLowerCase()}</Text></Pressable>))}</View>
      {mode !== "CREDIT" && <Input label="Amount received" keyboardType="decimal-pad" value={received ?? String(c.total)} onChangeText={(t) => setReceived(t.replace(/[^\d.]/g, ""))} style={{ fontSize: 20, fontWeight: "800" }} />}
      {balance > 0 && <>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}><Text style={{ color: C.bad, fontWeight: "700" }}>Balance to ledger</Text><Text style={{ color: C.bad, fontWeight: "800" }}>{inr(balance)}</Text></View>
        <Input label="Due date (YYYY-MM-DD)" value={due} onChangeText={setDue} />
      </>}
      <ErrorText error={err} />
    </Screen>
  );

  return (
    <Screen title={TITLE[kind] || "New bill"} right={kind === "INVOICE" ? <View style={{ width: 170 }}><Seg value={billType} onChange={setBillType} options={[{ value: "GST", label: "GST" }, { value: "NON_GST", label: "Non-GST" }]} /></View> : undefined}
      footer={<View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View style={{ flex: 1 }}><Text style={s.muted}>{lines.length} items · {lines.reduce((a, l) => a + l.qty, 0)} qty</Text><Text style={{ fontSize: 22, fontWeight: "800" }}>{inr(c.total)}</Text></View>
        <Btn title={isSale ? "Next — Payment" : "Save"} disabled={!lines.length} loading={busy} onPress={() => (isSale ? setStep("pay") : save())} style={{ flex: 1.2 }} />
      </View>}>
      <Card onPress={() => setPicker(true)} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 }}>
        <Feather name="user" size={20} color={C.brand} />
        <View style={{ flex: 1 }}><Text style={{ fontWeight: "800", fontSize: 15 }}>{party?.name || "Walk-in customer"}</Text>{party?.gstin ? <Text style={{ color: C.ok, fontSize: 12, fontWeight: "700" }}>GST ✓</Text> : null}</View>
        {party && <Text style={{ color: party.balance > 0 ? C.bad : C.muted, fontWeight: "700" }}>Bal {inr(party.balance)}</Text>}
        <Feather name="chevron-down" size={18} color={C.muted} />
      </Card>
      <ProductSearch onPick={(p) => add(p)} onScan={() => router.push("/bill/scan?mode=bill")} />
      {kind === "QUOTATION" && <Input label="Valid till (YYYY-MM-DD)" value={validTill} onChangeText={setValidTill} />}
      {lines.map((l, i) => (
        <Card key={l.key} style={{ padding: 14, gap: 10 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
            <Text style={{ fontWeight: "800", fontSize: 15, flex: 1 }}>{l.name}</Text>
            <Text style={{ fontWeight: "800", fontSize: 15 }}>{inr(c.lines[i]?.amount)}</Text>
          </View>
          <Text style={s.muted}>{l.qty} {l.unit} × {inr(l.rate)}{billType === "GST" ? ` · GST ${l.gstRate}%` : ""}{l.discountPct ? ` · ${l.discountPct}% off` : ""}</Text>
          <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
            <Pressable onPress={() => (l.qty <= 1 ? setLines(lines.filter((x) => x.key !== l.key)) : upd(l.key, { qty: l.qty - 1 }))} style={stepBtn}><Feather name={l.qty <= 1 ? "trash-2" : "minus"} size={16} color={l.qty <= 1 ? C.bad : C.brand} /></Pressable>
            <TextInput keyboardType="decimal-pad" value={String(l.qty)} onChangeText={(t) => upd(l.key, { qty: Number(t.replace(/[^\d.]/g, "")) || 0 })} style={[s.input, { height: 38, width: 64, textAlign: "center", fontWeight: "800" }]} />
            <Pressable onPress={() => upd(l.key, { qty: l.qty + 1 })} style={stepBtn}><Feather name="plus" size={16} color={C.brand} /></Pressable>
            <View style={{ flex: 1 }} />
            <Text style={s.muted}>₹</Text>
            <TextInput keyboardType="decimal-pad" value={String(l.rate)} onChangeText={(t) => upd(l.key, { rate: Number(t.replace(/[^\d.]/g, "")) || 0 })} style={[s.input, { height: 38, width: 80 }]} />
            <TextInput keyboardType="decimal-pad" placeholder="Disc%" placeholderTextColor={C.faint} value={l.discountPct ? String(l.discountPct) : ""} onChangeText={(t) => upd(l.key, { discountPct: Math.min(100, Number(t.replace(/[^\d.]/g, "")) || 0) })} style={[s.input, { height: 38, width: 64 }]} />
          </View>
        </Card>
      ))}
      {!lines.length && <Text style={{ textAlign: "center", color: C.muted, padding: 24 }}>Scan a barcode or search to add items</Text>}
      <ErrorText error={err} />
      <PartyPickerModal visible={picker} type="CUSTOMER" allowWalkIn onClose={() => setPicker(false)} onPick={(p) => { setParty(p); setPicker(false); if (!p && mode === "CREDIT") setMode("CASH"); }} />
    </Screen>
  );
}
const stepBtn = { width: 38, height: 38, borderRadius: 10, backgroundColor: C.brand50, alignItems: "center" as const, justifyContent: "center" as const };
