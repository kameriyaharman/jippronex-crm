import { useEffect, useState } from "react";
import { FlatList, Pressable, Text, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useApi, inr, qty } from "@/lib/api";
import { useSession } from "@/lib/session";
import { C, Chips, Empty, Loading, Screen, Divider, s } from "@/components/ui";

/** 17 Product list & stock */
export default function Stock() {
  const params = useLocalSearchParams<{ filter?: string }>();
  const { can } = useSession();
  const [filter, setFilter] = useState(params.filter || "");
  const [q, setQ] = useState("");
  useEffect(() => { if (params.filter) setFilter(params.filter); }, [params.filter]);
  const { data, loading, reload } = useApi<any[]>(`/products?q=${encodeURIComponent(q)}&filter=${filter}`);
  const { data: sum } = useApi<any>("/products/summary");
  return (
    <Screen title={`Products ${sum ? sum.total.toLocaleString("en-IN") : ""}`} back={false} scroll={false} pad={false}
      right={can("stock.adjust") ? <Pressable onPress={() => router.push("/product/new")} style={{ backgroundColor: C.brand, borderRadius: 12, padding: 8 }}><Feather name="plus" size={20} color="#fff" /></Pressable> : undefined}>
      <View style={{ padding: 16, gap: 12 }}>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <View style={{ flex: 1 }}><Feather name="search" size={16} color={C.faint} style={{ position: "absolute", left: 14, top: 16, zIndex: 1 }} />
            <TextInput style={[s.input, { paddingLeft: 38 }]} placeholder="Search / scan product" placeholderTextColor={C.faint} value={q} onChangeText={setQ} /></View>
          <Pressable onPress={() => router.push("/bill/scan?mode=lookup")} style={[s.input, { width: 48, alignItems: "center", justifyContent: "center", paddingHorizontal: 0 }]}><Feather name="maximize" size={20} color={C.brand} /></Pressable>
        </View>
        <Chips scroll value={filter} onChange={setFilter} options={[{ value: "", label: "All" }, { value: "low", label: `Low ${sum?.low ?? ""}` }, { value: "out", label: `Out ${sum?.out ?? ""}` }]} />
      </View>
      {!data ? <Loading /> : (
        <FlatList data={data} keyExtractor={(p: any) => p.id} onRefresh={reload} refreshing={loading} ItemSeparatorComponent={Divider}
          contentContainerStyle={{ backgroundColor: C.white, marginHorizontal: 16, borderRadius: 18, paddingHorizontal: 14, borderWidth: 1, borderColor: C.line, marginBottom: 24 }}
          ListEmptyComponent={<Empty title="No products" />}
          renderItem={({ item: p }: any) => (
            <Pressable onPress={() => router.push(`/product/${p.id}`)} style={{ flexDirection: "row", paddingVertical: 12, alignItems: "center" }}>
              <View style={{ flex: 1 }}><Text style={{ fontWeight: "700", fontSize: 15, color: C.ink }}>{p.name}</Text>
                <Text style={s.muted}>Sale {inr(p.saleRate)}{p.purchaseRate != null ? ` · Buy ${inr(p.purchaseRate)}` : ""}</Text></View>
              <Text style={{ fontWeight: "800", fontSize: 15, color: p.state === "OK" ? C.ink : C.bad }}>{p.state === "OUT" ? "Out" : `${qty(p.stock)}${p.state === "OK" ? " " + p.unit : ""}`}</Text>
            </Pressable>)} />
      )}
    </Screen>
  );
}
