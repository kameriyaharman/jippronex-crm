import { useState } from "react";
import { FlatList, Pressable, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useApi, inr, dm, ym } from "@/lib/api";
import { useSession } from "@/lib/session";
import { C, Chips, Empty, Loading, Screen, Divider, s } from "@/components/ui";

/** 13 Sales list */
export default function Bills() {
  const { can } = useSession();
  const [tab, setTab] = useState("all");
  const [q, setQ] = useState("");
  const { data, loading, reload } = useApi<any>(`/invoices?tab=${tab}&month=${ym()}&q=${encodeURIComponent(q)}&limit=200`);
  return (
    <Screen title="Sales" back={false} scroll={false} pad={false} right={can("invoice.create") ? <Pressable onPress={() => router.push("/bill/new")} style={{ backgroundColor: C.brand, borderRadius: 12, padding: 8 }}><Feather name="plus" size={20} color="#fff" /></Pressable> : undefined}>
      <View style={{ padding: 16, gap: 12 }}>
        <View><Feather name="search" size={16} color={C.faint} style={{ position: "absolute", left: 14, top: 16, zIndex: 1 }} />
          <TextInput style={[s.input, { paddingLeft: 38 }]} placeholder="Search bill / customer" placeholderTextColor={C.faint} value={q} onChangeText={setQ} /></View>
        <Chips scroll value={tab} onChange={setTab} options={[{ value: "all", label: `All ${data?.counts.all ?? ""}` }, { value: "gst", label: "GST" }, { value: "nongst", label: "Non-GST" }, { value: "unpaid", label: `Unpaid ${data?.counts.unpaid ?? ""}` }, { value: "partial", label: "Partial" }]} />
        {data && <Text style={s.muted}>This month · {inr(data.counts.total)} sales · {inr(data.counts.pending)} pending</Text>}
      </View>
      {!data ? <Loading /> : (
        <FlatList data={data.rows} keyExtractor={(i: any) => i.id} onRefresh={reload} refreshing={loading} ItemSeparatorComponent={Divider}
          contentContainerStyle={{ backgroundColor: C.white, marginHorizontal: 16, borderRadius: 18, paddingHorizontal: 14, borderWidth: 1, borderColor: C.line }}
          ListEmptyComponent={<Empty title="No bills" />}
          renderItem={({ item: i }: any) => (
            <Pressable onPress={() => router.push(`/bill/${i.id}`)} style={{ flexDirection: "row", paddingVertical: 12, alignItems: "center" }}>
              <View style={{ flex: 1 }}><Text style={{ fontWeight: "700", fontSize: 15, color: C.ink }}>{i.customerName}</Text><Text style={s.muted}>{i.number.replace(/^INV-\d{4}-/, "INV-")} · {dm(i.date)}</Text></View>
              <View style={{ alignItems: "flex-end" }}><Text style={{ fontWeight: "800", fontSize: 15 }}>{inr(i.total)}</Text>
                <Text style={{ fontSize: 12, fontWeight: "700", color: i.status === "PAID" ? C.ok : C.bad }}>{i.status === "PAID" ? "Paid" : i.status === "UNPAID" ? "Unpaid" : `Bal ${inr(i.balance)}`}</Text></View>
            </Pressable>)} />
      )}
    </Screen>
  );
}
