import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { Feather } from "@expo/vector-icons";
import { api, auth, inr, API_URL } from "@/lib/api";
import { useSession } from "@/lib/session";
import { Btn, C, Card, ErrorText, Input, Screen, Seg, s } from "@/components/ui";

const TYPES = ["Retail / Wholesale — Grocery", "Medical / Pharmacy", "Electronics & Mobile", "Hardware & Electricals", "Garments & Footwear", "Auto parts", "Distributor / Agency", "Other"];

/** 04 Business setup (step 1/2) + 05 Plan & payment (step 2/2) */
export default function Setup() {
  const { refresh } = useSession();
  const [step, setStep] = useState(1);
  const [f, setF] = useState({ name: "", ownerName: "", gstin: "", businessType: TYPES[0], address: "", city: "" });
  const [plans, setPlans] = useState<any[]>([]);
  const [plan, setPlan] = useState("BILLING_INV");
  const [cycle, setCycle] = useState<"YEARLY" | "MONTHLY">("YEARLY");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { fetch(`${API_URL}/public/plans`).then((r) => r.json()).then(setPlans).catch(() => {}); }, []);
  const set = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });

  const create = async (pay: boolean) => {
    setErr(null); setBusy(true);
    try {
      const r = await api("/auth/business", { body: { ...f, gstin: f.gstin || undefined, planCode: plan } });
      await auth.setBusiness(r.business.id);
      if (pay) { const p = await api("/settings/subscribe", { body: { planCode: plan, cycle } }); await WebBrowser.openBrowserAsync(p.url); }
      await refresh();
      router.replace("/(tabs)");
    } catch (e: any) { setErr(e.message); setBusy(false); }
  };
  const sel = plans.find((p) => p.code === plan);

  if (step === 1) return (
    <Screen title="Business setup" sub="Step 1/2" back={false} footer={<Btn title="Continue" disabled={f.name.length < 2} onPress={() => setStep(2)} />}>
      <Input label="Business name" value={f.name} onChangeText={set("name")} placeholder="Sharma Traders" />
      <Input label="Owner name" value={f.ownerName} onChangeText={set("ownerName")} placeholder="Rakesh Sharma" />
      <Input label="GSTIN (optional)" value={f.gstin} onChangeText={(v) => set("gstin")(v.toUpperCase())} autoCapitalize="characters" maxLength={15} placeholder="19ABCPS1234K1Z5" />
      <View style={{ gap: 6 }}><Text style={s.label}>Business type</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{TYPES.map((t) => (
          <Pressable key={t} onPress={() => set("businessType")(t)} style={[s.chip, f.businessType === t && { backgroundColor: C.brand, borderColor: C.brand }]}><Text style={[s.chipText, f.businessType === t && { color: "#fff" }]}>{t}</Text></Pressable>))}</View></View>
      <Input label="Address" value={f.address} onChangeText={set("address")} placeholder="12, Bazar Road" />
      <Input label="City" value={f.city} onChangeText={set("city")} placeholder="Asansol" />
      <Card style={{ flexDirection: "row", alignItems: "center", gap: 12 }}><Feather name="image" size={22} color={C.brand} /><View><Text style={{ fontWeight: "700" }}>Logo</Text><Text style={s.muted}>Shows on every invoice · add later in Settings</Text></View></Card>
    </Screen>
  );
  return (
    <Screen title="Choose your plan" sub="Step 2/2" footer={<View style={{ gap: 10 }}>
      <Btn title={`Pay ${sel ? inr((cycle === "YEARLY" ? sel.yearly : sel.monthly).total) : ""} (incl. GST)`} onPress={() => create(true)} loading={busy} disabled={!sel} />
      <Btn title="Start 7-day free trial" kind="outline" onPress={() => create(false)} disabled={busy} />
    </View>}>
      <Seg value={cycle} onChange={setCycle} options={[{ value: "MONTHLY", label: "Monthly" }, { value: "YEARLY", label: "Yearly · save 17%" }]} />
      {plans.map((p) => (
        <Card key={p.code} onPress={() => setPlan(p.code)} style={[{ borderWidth: 2 }, plan === p.code ? { borderColor: C.brand, backgroundColor: "#F3F7FF" } : { borderColor: C.line }]}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={{ fontWeight: "800", fontSize: 16 }}>{p.name}</Text>
            <Text style={{ fontWeight: "800", fontSize: 16 }}>{inr(cycle === "YEARLY" ? p.yearlyPrice : p.monthlyPrice)}<Text style={s.muted}>/{cycle === "YEARLY" ? "year" : "month"}</Text></Text>
          </View>
          <Text style={[s.muted, { marginTop: 4 }]}>{p.tagline}</Text>
          {p.code === "BILLING_INV" && <View style={{ marginTop: 8, alignSelf: "flex-start", backgroundColor: C.brand, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 }}><Text style={{ color: "#fff", fontSize: 11, fontWeight: "800" }}>Most popular</Text></View>}
        </Card>))}
      <Text style={{ textAlign: "center", color: C.ok, fontWeight: "700" }}>7-day free trial included</Text>
      <Text style={{ textAlign: "center", color: C.muted, fontSize: 12 }}>Pay securely · UPI / Card / Netbanking</Text>
      <ErrorText error={err} />
    </Screen>
  );
}
