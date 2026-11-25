import { Text, View } from "react-native";
import { router } from "expo-router";
import { useApi, inr, ym, dm } from "@/lib/api";
import { useSession } from "@/lib/session";
import { Btn, C, Card, KV, Loading, Screen, Divider, H } from "@/components/ui";

/** 29 GST & profit report */
export default function Gst() {
  const { feature } = useSession();
  const { data: a, error } = useApi<any>(feature("accounts") ? `/accounts?month=${ym()}` : null);
  const month = new Date().toLocaleString("en-IN", { month: "short", year: "numeric" });
  if (!feature("accounts")) return (
    <Screen title="GST report"><Card style={{ alignItems: "center", gap: 10 }}><Text style={{ fontWeight: "800", fontSize: 16 }}>Accounts & GST reports</Text>
      <Text style={{ color: C.muted, textAlign: "center" }}>Available in the Complete Business plan.</Text><Btn title="See plans" onPress={() => router.push("/settings")} /></Card></Screen>
  );
  if (!a) return <Screen title="GST report" sub={month}>{error ? <Text>{error}</Text> : <Loading />}</Screen>;
  return (
    <Screen title="GST report" sub={month}>
      <Card>
        <KV k="Output GST (sales)" v={inr(a.gst.totalOutput)} />
        <KV k="Input GST (purchase)" v={inr(a.gst.totalInput)} />
        <View style={{ height: 6 }} /><Divider /><View style={{ height: 6 }} />
        <KV k="Net GST payable" v={inr(a.gst.totalNet)} bold color={C.brand} />
      </Card>
      <Card style={{ gap: 6 }}>
        <H>Returns</H>
        <KV k={`GSTR-1 · B2B ${a.gstr1.b2b} · B2C ${a.gstr1.b2c}`} v={`Due ${dm(a.gstr1.dueDate)}`} />
        <KV k="GSTR-3B" v={`Due ${dm(a.gstr3bDue)}`} />
        <Text style={{ color: C.ok, fontWeight: "700" }}>Data ready · export from Reports</Text>
      </Card>
      <Card>
        <H>Profit & Loss</H>
        <KV k="Sales (excl. GST)" v={inr(a.pl.sales)} /><KV k="Cost of goods" v={`− ${inr(a.pl.cogs)}`} /><KV k="Expenses" v={`− ${inr(a.pl.expenses)}`} />
        <Divider /><KV k="Net profit" v={inr(a.pl.net)} bold color={C.ok} />
        <Text style={{ color: C.muted }}>Net margin {a.pl.marginPct}%</Text>
      </Card>
      <Btn title="Excel for CA" icon="share" kind="outline" onPress={() => router.push("/reports")} />
    </Screen>
  );
}
