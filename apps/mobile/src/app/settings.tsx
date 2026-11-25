import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { api, useApi, inr, dt } from "@/lib/api";
import { useSession } from "@/lib/session";
import { Btn, C, Card, Chips, Loading, Pill, Row, Screen, Divider, Seg, H } from "@/components/ui";

/** 30 Settings & subscription */
export default function Settings() {
  const { business, can, refresh } = useSession();
  const { data: s, reload } = useApi<any>("/settings/subscription");
  const { data: plans } = useApi<any[]>("/settings/plans");
  const { data: b } = useApi<any>("/settings/business");
  const { data: users } = useApi<any>("/settings/users");
  const [cycle, setCycle] = useState<"YEARLY" | "MONTHLY">("YEARLY");
  const [plan, setPlan] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (s?.subscription && !plan) setPlan(s.subscription.plan.code); }, [s, plan]);
  if (!s || !b) return <Screen title="Settings"><Loading /></Screen>;
  const sub = s.subscription;
  const pay = async () => {
    setBusy(true);
    try {
      const r = await api("/settings/subscribe", { body: { planCode: plan, cycle } });
      await WebBrowser.openBrowserAsync(r.url);
      const st = await api(`/settings/subscribe/${r.paymentId}`);
      if (st.status === "CAPTURED") { await refresh(); reload(); }
    } finally { setBusy(false); }
  };
  const sel = plans?.find((p) => p.code === plan);
  return (
    <Screen title="Settings">
      {sub && <Card style={{ gap: 6 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><Text style={{ fontSize: 17, fontWeight: "800", flex: 1 }}>{sub.plan.name}</Text><Pill status={sub.status} /></View>
        <Text style={{ color: C.muted }}>{sub.endsAt ? `Valid till ${dt(sub.endsAt)} · ${sub.daysLeft} days left` : "Lifetime"}</Text>
      </Card>}
      {can("settings") && plans && <Card style={{ gap: 10 }}>
        <H>Renew / upgrade</H>
        <Seg value={cycle} onChange={setCycle} options={[{ value: "MONTHLY", label: "Monthly" }, { value: "YEARLY", label: "Yearly" }]} />
        <Chips value={plan || ""} onChange={setPlan} options={plans.map((p) => ({ value: p.code, label: p.name }))} />
        {sel && <Text style={{ fontWeight: "700" }}>{inr((cycle === "YEARLY" ? sel.yearly : sel.monthly).price)} + GST = {inr((cycle === "YEARLY" ? sel.yearly : sel.monthly).total)}</Text>}
        <Btn title={sub?.plan.code === plan && sub?.cycle !== "TRIAL" ? "Renew" : "Upgrade"} onPress={pay} loading={busy} disabled={!sel} />
      </Card>}
      <Card style={{ paddingVertical: 4 }}>
        <Row left="Business profile" right={b.name} />
        <Divider /><Row left="Invoice format" right={b.invoiceTemplate === "CLASSIC" ? "Classic A4" : "Modern A4"} />
        <Divider /><Row left="Users & roles" right={`${users?.users.length ?? "—"} users`} />
        <Divider /><Row left="Printer" right={b.preferences?.printer || "System print"} />
        <Divider /><Row left="WhatsApp messages" right={b.preferences?.sendInvoiceWhatsapp ? "On" : "Off"} />
        <Divider /><Row left="Backup" right={b.preferences?.autoBackup ? "Daily (cloud)" : "Off"} />
        <Divider /><Row left="Help & support" right="›" />
      </Card>
      <Text style={{ textAlign: "center", color: C.muted, fontSize: 12 }}>{business?.name} · edit full profile, logo & bank details on web CRM</Text>
    </Screen>
  );
}
