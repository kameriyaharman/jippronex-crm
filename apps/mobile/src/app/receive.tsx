import { useEffect, useState } from "react";
import { Linking, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { api, inr, dm } from "@/lib/api";
import { Btn, C, Card, Chips, ErrorText, Input, Screen, s } from "@/components/ui";
import { PartyPickerModal } from "@/components/Pickers";

/** 25 Receive payment (customer) / pay supplier */
export default function Receive() {
  const prm = useLocalSearchParams<{ partyId?: string; invoiceId?: string }>();
  const [l, setL] = useState<any>(null);
  const [pick, setPick] = useState(!prm.partyId);
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState("UPI");
  const [ref, setRef] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<any>(null);
  const load = (id: string) => api(`/parties/${id}`).then((x) => {
    setL(x);
    const bills = x.party.type === "CUSTOMER" ? x.openBills : x.openPurchases;
    const pre = prm.invoiceId ? bills.find((b: any) => b.id === prm.invoiceId) : null;
    setAmount(String(pre ? pre.balance : Math.abs(x.party.balance) || ""));
  });
  useEffect(() => { if (prm.partyId) load(prm.partyId); }, [prm.partyId]); // eslint-disable-line
  const cust = l?.party.type !== "SUPPLIER";
  const bills: any[] = l ? (cust ? l.openBills : l.openPurchases) : [];
  let left = Number(amount || 0);
  const alloc = bills.map((b) => { const a = Math.max(0, Math.min(left, b.balance)); left -= a; return { ...b, a }; });
  const save = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await api("/payments", { body: { direction: cust ? "IN" : "OUT", partyId: l.party.id, amount: Number(amount), mode, reference: ref || undefined,
        allocations: alloc.filter((x) => x.a > 0).map((x) => (cust ? { invoiceId: x.id, amount: x.a } : { purchaseId: x.id, amount: x.a })) } });
      setDone(r);
    } catch (e: any) { setErr(e.message); setBusy(false); }
  };
  if (done) return (
    <Screen title={cust ? "Payment received" : "Payment recorded"} back={false} footer={<View style={{ gap: 10 }}>
      {done.party?.phone && <Btn title="Send receipt on WhatsApp" kind="wa" icon="message-circle" onPress={() => Linking.openURL(done.whatsapp.link)} />}
      <Btn title="Done" kind="outline" onPress={() => router.back()} /></View>}>
      <View style={{ alignItems: "center", gap: 8, paddingTop: 30 }}>
        <View style={{ width: 70, height: 70, borderRadius: 35, backgroundColor: C.ok50, alignItems: "center", justifyContent: "center" }}><Feather name="check" size={36} color={C.ok} /></View>
        <Text style={s.muted}>{done.number}</Text><Text style={{ fontSize: 36, fontWeight: "800" }}>{inr(done.amount)}</Text>
        <Text style={s.muted}>{done.amountInWords}</Text>
        <Text style={{ fontWeight: "700" }}>{done.party?.name} · via {done.mode}</Text>
        <Text>Balance now <Text style={{ fontWeight: "800" }}>{inr(Math.abs(done.party?.balance || 0))}</Text></Text>
      </View>
    </Screen>
  );
  return (
    <Screen title={cust ? "Receive payment" : "Pay supplier"} footer={<Btn title="Save & send receipt" onPress={save} loading={busy} disabled={!l || !(Number(amount) > 0)} />}>
      <Card onPress={() => setPick(true)}><Text style={s.muted}>Party</Text><Text style={{ fontWeight: "800", fontSize: 15 }}>{l ? `${l.party.name} · Bal ${inr(Math.abs(l.party.balance))}` : "Select party"}</Text></Card>
      <Input label="Amount" keyboardType="decimal-pad" value={amount} onChangeText={(t) => setAmount(t.replace(/[^\d.]/g, ""))} style={{ fontSize: 26, fontWeight: "800", height: 60 }} />
      <Text style={s.label}>Mode</Text>
      <Chips value={mode} onChange={setMode} options={[{ value: "CASH", label: "Cash" }, { value: "UPI", label: "UPI" }, { value: "BANK", label: "Bank" }, { value: "CHEQUE", label: "Cheque" }]} />
      {mode !== "CASH" && <Input label="Reference (UTR / cheque no.)" value={ref} onChangeText={setRef} />}
      {bills.length > 0 && <><Text style={s.label}>Adjust against bills</Text>
        {alloc.map((b) => <Card key={b.id} style={[{ flexDirection: "row", padding: 12 }, b.a > 0 && { borderColor: C.brand }]}>
          <View style={{ flex: 1 }}><Text style={{ fontWeight: "700" }}>{b.number.replace(/^INV-\d{4}-/, "INV-")}</Text><Text style={s.muted}>{dm(b.date)} · {b.a >= b.balance - 0.01 ? "fully paid" : b.a > 0 ? "part paid" : `due ${inr(b.balance)}`}</Text></View>
          <Text style={{ fontWeight: "800" }}>{b.a > 0 ? inr(b.a) : "—"}</Text></Card>)}</>}
      <ErrorText error={err} />
      <PartyPickerModal visible={pick} type="CUSTOMER" onClose={() => { setPick(false); if (!l) router.back(); }} onPick={(p) => { setPick(false); if (p) load(p.id); }} />
    </Screen>
  );
}
