import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { Feather } from "@expo/vector-icons";
import { api, auth, inr, API_URL } from "@/lib/api";
import { useSession } from "@/lib/session";
import { Btn, C, Card, ErrorText, Field, Input, Screen, Seg, Txt } from "@/components/ui";

const TYPES = ["Retail / Wholesale", "Grocery / Kirana", "Medical / Pharmacy", "Electronics & Mobile", "Hardware & Electricals", "Garments & Footwear", "Auto parts", "Distributor / Agency", "Other"];

/** 04 Business setup (step 1/2) + 05 Plan & payment (step 2/2) */
export default function Setup() {
  const { me, refresh } = useSession();
  const [step, setStep] = useState(1);
  const [f, setF] = useState({ name: "", ownerName: me?.user?.name || "", gstin: "", businessType: TYPES[0], address: "", city: "" });
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
  const logout = async () => { await auth.clear(); router.replace("/login"); };

  if (step === 1) return (
    <Screen title="Business setup" sub="Step 1 of 2" back={false} right={<Txt w="600" size={13} color={C.muted} onPress={logout}>Logout</Txt>}
      footer={<Btn title="Continue" icon="arrow-right" disabled={f.name.trim().length < 2} onPress={() => setStep(2)} />}>
      <Input label="Business name" icon="briefcase" value={f.name} onChangeText={set("name")} placeholder="Sharma Traders" />
      <Input label="Owner name" icon="user" value={f.ownerName} onChangeText={set("ownerName")} placeholder="Rakesh Sharma" />
      <Input label="GSTIN (optional)" icon="hash" value={f.gstin} onChangeText={(v) => set("gstin")(v.toUpperCase())} autoCapitalize="characters" maxLength={15} placeholder="19ABCPS1234K1Z5" />
      <Field label="Business type">
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{TYPES.map((t) => {
          const on = f.businessType === t;
          return <Pressable key={t} onPress={() => set("businessType")(t)} style={{ height: 36, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1, justifyContent: "center", borderColor: on ? C.brand : C.line, backgroundColor: on ? C.brand : C.white }}>
            <Txt w="500" size={13} color={on ? C.white : C.ink2}>{t}</Txt></Pressable>;
        })}</View>
      </Field>
      <Input label="Address" icon="map-pin" value={f.address} onChangeText={set("address")} placeholder="12, Bazar Road" />
      <Input label="City" icon="navigation" value={f.city} onChangeText={set("city")} placeholder="Asansol" />
      <Card style={{ flexDirection: "row", alignItems: "center", gap: 12, borderStyle: "dashed", borderColor: C.brand300 }}>
        <View style={{ width: 52, height: 52, borderRadius: 12, backgroundColor: C.brand50, alignItems: "center", justifyContent: "center" }}><Feather name="image" size={22} color={C.brand} /></View>
        <View style={{ flex: 1 }}><Txt w="600">Business logo</Txt><Txt size={12.5} color={C.muted}>Shows on every invoice · add later in Settings</Txt></View>
      </Card>
    </Screen>
  );
  const price = sel ? (cycle === "YEARLY" ? sel.yearly : sel.monthly) : null;
  return (
    <Screen title="Choose your plan" sub="Step 2 of 2" footer={<View style={{ gap: 10 }}>
      <Btn title={`Pay ${price ? inr(price.total) : ""}`} icon="lock" onPress={() => create(true)} loading={busy} disabled={!sel} />
      <Btn title="Start 7-day free trial" kind="outline" onPress={() => create(false)} disabled={busy} />
    </View>}>
      <Seg value={cycle} onChange={setCycle} options={[{ value: "MONTHLY", label: "Monthly" }, { value: "YEARLY", label: "Yearly · save 17%" }]} />
      {plans.map((p) => {
        const on = plan === p.code;
        return (
          <Card key={p.code} onPress={() => setPlan(p.code)} style={{ borderWidth: 2, borderColor: on ? C.brand : C.line, backgroundColor: on ? "#F5F8FF" : C.white, flexDirection: "row", gap: 12 }}>
            <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: on ? C.brand : C.faint, alignItems: "center", justifyContent: "center", marginTop: 2 }}>{on && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: C.brand }} />}</View>
            <View style={{ flex: 1, gap: 4 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                <Txt w="700" size={16} style={{ flex: 1 }}>{p.name}</Txt>
                <Txt w="700" size={16}>{inr(cycle === "YEARLY" ? p.yearlyPrice : p.monthlyPrice)}<Txt size={12} color={C.muted}>/{cycle === "YEARLY" ? "yr" : "mo"}</Txt></Txt>
              </View>
              <Txt size={12.5} color={C.muted}>{p.tagline}</Txt>
              {p.code === "BILLING_INV" && <View style={{ alignSelf: "flex-start", backgroundColor: C.brand, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3, marginTop: 2 }}><Txt w="700" size={11} color="#fff">Most popular</Txt></View>}
            </View>
          </Card>);
      })}
      {price && <Card><View style={{ gap: 2 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}><Txt color={C.muted}>Plan price</Txt><Txt w="600">{inr(price.base)}</Txt></View>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}><Txt color={C.muted}>GST 18%</Txt><Txt w="600">{inr(price.gst)}</Txt></View>
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 4 }}><Txt w="700">Total</Txt><Txt w="700" color={C.brand}>{inr(price.total)}</Txt></View>
      </View></Card>}
      <Txt w="600" color={C.green} style={{ textAlign: "center" }}>7-day free trial included</Txt>
      <Txt size={12} color={C.muted} style={{ textAlign: "center" }}>Pay securely · UPI / Card / Netbanking</Txt>
      <ErrorText error={err} />
    </Screen>
  );
}
