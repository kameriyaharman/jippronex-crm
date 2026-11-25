import { Linking, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useApi, inr, dm } from "@/lib/api";
import { useSession } from "@/lib/session";
import { Btn, C, Card, Loading, Row, Screen, Divider } from "@/components/ui";

/** 24 Party ledger & reminder */
export default function PartyLedger() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { can } = useSession();
  const { data: l } = useApi<any>(`/parties/${id}`);
  if (!l) return <Screen title="Party"><Loading /></Screen>;
  const p = l.party;
  const cust = p.type === "CUSTOMER";
  const rows = [...l.rows].reverse();
  return (
    <Screen title={p.name} sub={p.phone ? `+91 ${p.phone}` : undefined}>
      <View style={{ backgroundColor: cust ? C.brand : "#B45309", borderRadius: 22, padding: 18 }}>
        <Text style={{ color: "#ffffffbb", fontWeight: "700" }}>{cust ? "Balance due" : "To pay"}</Text>
        <Text style={{ color: "#fff", fontSize: 32, fontWeight: "800" }}>{inr(Math.abs(p.balance))}</Text>
        <Text style={{ color: "#ffffffbb", fontWeight: "600" }}>{p.creditLimit ? `Credit limit ${inr(p.creditLimit)}` : ""}{l.lastPayment ? `${p.creditLimit ? " · " : ""}Last payment ${inr(l.lastPayment.amount)} · ${dm(l.lastPayment.date)}` : ""}</Text>
      </View>
      <View style={{ flexDirection: "row", gap: 10 }}>
        {can("payments") && <Btn title={cust ? "Receive" : "Pay"} icon="download" style={{ flex: 1 }} onPress={() => router.push(`/receive?partyId=${p.id}`)} />}
        {cust && p.balance > 0 && <Btn title="Remind" icon="message-circle" kind="wa" style={{ flex: 1 }} onPress={() => Linking.openURL(l.reminder.link)} />}
        {p.phone && <Btn title="Call" icon="phone" kind="outline" style={{ flex: 0.8 }} onPress={() => Linking.openURL(`tel:+91${p.phone}`)} />}
      </View>
      <Card style={{ paddingVertical: 4 }}>
        {rows.map((r: any, i: number) => <View key={r.type + r.refId}>{i > 0 && <Divider />}
          <Row left={r.particulars.replace(/^INV-\d{4}-/, "INV-")} sub={`${dm(r.date)} · Bal ${inr(Math.abs(r.balance))}`} right={inr(r.debit || r.credit)} rightColor={r.credit ? C.ok : C.ink}
            onPress={r.type === "invoice" ? () => router.push(`/bill/${r.refId}`) : undefined} /></View>)}
        {!rows.length && <Text style={{ padding: 16, color: C.muted, textAlign: "center" }}>No entries yet</Text>}
      </Card>
    </Screen>
  );
}
