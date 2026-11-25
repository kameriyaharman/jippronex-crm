import { useState } from "react";
import { Text, View } from "react-native";
import { useApi, inr, tm, dm } from "@/lib/api";
import { C, Card, Chips, Loading, Row, Screen, Divider } from "@/components/ui";

/** 27 Cash book & bank */
export default function CashBook() {
  const [range, setRange] = useState("today");
  const [account, setAccount] = useState("");
  const { data, reload, loading } = useApi<any>(`/cashbook?range=${range}&account=${account}`);
  return (
    <Screen title="Cash & bank" refreshing={loading} onRefresh={reload}>
      {data && <View style={{ flexDirection: "row", gap: 10 }}>
        <Card style={{ flex: 1 }}><Text style={{ color: C.muted, fontWeight: "600" }}>Cash in hand</Text><Text style={{ fontSize: 22, fontWeight: "800" }}>{inr(data.cash)}</Text></Card>
        <Card style={{ flex: 1 }}><Text style={{ color: C.muted, fontWeight: "600" }}>Bank + UPI</Text><Text style={{ fontSize: 22, fontWeight: "800" }}>{inr(data.bank)}</Text></Card>
      </View>}
      <Chips scroll value={range} onChange={setRange} options={[{ value: "today", label: "Today" }, { value: "week", label: "This week" }, { value: "month", label: "This month" }]} />
      {data && <Chips scroll value={account} onChange={setAccount} options={[{ value: "", label: "All" }, ...data.accountsList.map((a: string) => ({ value: a, label: a }))]} />}
      {!data ? <Loading /> : <Card style={{ paddingVertical: 4 }}>
        {data.entries.map((e: any, i: number) => <View key={e.id}>{i > 0 && <Divider />}
          <Row left={e.title} sub={e.sub} right={`${e.amount >= 0 ? "+" : "−"} ${inr(Math.abs(e.amount))}`} rightColor={e.amount >= 0 ? C.ok : C.bad} rightSub={range === "today" ? tm(e.date) : dm(e.date)} /></View>)}
        {!data.entries.length && <Text style={{ padding: 20, textAlign: "center", color: C.muted }}>No entries</Text>}
      </Card>}
    </Screen>
  );
}
