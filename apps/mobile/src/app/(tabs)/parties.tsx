import { useState } from "react";
import { FlatList, Pressable, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useApi, inr } from "@/lib/api";
import { C, Chips, Empty, Loading, Screen, Divider, Avatar, s } from "@/components/ui";

/** 23 Customers & suppliers */
export default function Parties() {
  const [type, setType] = useState("");
  const [q, setQ] = useState("");
  const { data, loading, reload } = useApi<any>(`/parties?type=${type}&q=${encodeURIComponent(q)}`);
  return (
    <Screen title="Parties" back={false} scroll={false} pad={false} right={<Pressable onPress={() => router.push("/party/new")} style={{ backgroundColor: C.brand, borderRadius: 12, padding: 8 }}><Feather name="user-plus" size={20} color="#fff" /></Pressable>}>
      <View style={{ padding: 16, gap: 12 }}>
        {data && <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1, backgroundColor: C.bad50, borderRadius: 16, padding: 14 }}><Text style={{ color: C.bad, fontWeight: "700", fontSize: 12 }}>To receive</Text><Text style={{ color: C.bad, fontWeight: "800", fontSize: 20 }}>{inr(data.totals.receivable)}</Text></View>
          <View style={{ flex: 1, backgroundColor: C.warn50, borderRadius: 16, padding: 14 }}><Text style={{ color: C.warn, fontWeight: "700", fontSize: 12 }}>To pay</Text><Text style={{ color: C.warn, fontWeight: "800", fontSize: 20 }}>{inr(data.totals.payable)}</Text></View>
        </View>}
        <TextInput style={s.input} placeholder="Search party" placeholderTextColor={C.faint} value={q} onChangeText={setQ} />
        <Chips value={type} onChange={setType} options={[{ value: "", label: "All" }, { value: "CUSTOMER", label: "Customers" }, { value: "SUPPLIER", label: "Suppliers" }]} />
      </View>
      {!data ? <Loading /> : (
        <FlatList data={data.rows} keyExtractor={(p: any) => p.id} onRefresh={reload} refreshing={loading} ItemSeparatorComponent={Divider}
          contentContainerStyle={{ backgroundColor: C.white, marginHorizontal: 16, borderRadius: 18, paddingHorizontal: 14, borderWidth: 1, borderColor: C.line, marginBottom: 24 }}
          ListEmptyComponent={<Empty title="No parties" />}
          renderItem={({ item: p }: any) => (
            <Pressable onPress={() => router.push(`/party/${p.id}`)} style={{ flexDirection: "row", paddingVertical: 12, alignItems: "center", gap: 12 }}>
              <Avatar name={p.name} bg={p.type === "CUSTOMER" ? C.brand50 : C.warn50} fg={p.type === "CUSTOMER" ? C.brand : C.warn} />
              <View style={{ flex: 1 }}><Text style={{ fontWeight: "700", fontSize: 15, color: C.ink }}>{p.name}</Text><Text style={s.muted}>{p.type === "CUSTOMER" ? "Customer" : "Supplier"}</Text></View>
              <Text style={{ fontWeight: "800", fontSize: 15, color: p.balance > 0 ? C.bad : p.balance < 0 ? C.warn : C.muted }}>{inr(Math.abs(p.balance))}</Text>
            </Pressable>)} />
      )}
    </Screen>
  );
}
