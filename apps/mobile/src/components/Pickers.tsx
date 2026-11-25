import { useEffect, useState } from "react";
import { FlatList, Modal, Pressable, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { api, inr } from "@/lib/api";
import { C, Divider, s } from "./ui";

export type Party = { id: string; name: string; type: string; phone?: string | null; gstin?: string | null; stateCode?: string | null; balance: number; creditLimit?: number | null };
export type Product = { id: string; name: string; barcode?: string | null; hsn?: string | null; unit: string; saleRate: number; purchaseRate?: number; gstRate: number; stock: number; mrp?: number | null; minStock?: number };

export function PartyPickerModal({ visible, type, onClose, onPick, allowWalkIn }: { visible: boolean; type: "CUSTOMER" | "SUPPLIER"; onClose: () => void; onPick: (p: Party | null) => void; allowWalkIn?: boolean }) {
  const [q, setQ] = useState("");
  const [list, setList] = useState<Party[]>([]);
  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => api(`/parties?type=${type}&q=${encodeURIComponent(q)}`).then((r) => setList(r.rows.filter((p: Party) => p.name !== "Walk-in customers"))).catch(() => {}), 150);
    return () => clearTimeout(t);
  }, [q, visible, type]);
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
        <View style={{ flexDirection: "row", alignItems: "center", padding: 16, gap: 12 }}>
          <Pressable onPress={onClose} hitSlop={12}><Feather name="x" size={24} color={C.ink} /></Pressable>
          <TextInput autoFocus style={[s.input, { flex: 1 }]} placeholder={`Search ${type === "CUSTOMER" ? "customer" : "supplier"}`} placeholderTextColor={C.faint} value={q} onChangeText={setQ} />
        </View>
        <FlatList data={list} keyExtractor={(p) => p.id} ItemSeparatorComponent={Divider} keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ backgroundColor: C.white, marginHorizontal: 16, borderRadius: 16, paddingHorizontal: 14 }}
          ListHeaderComponent={allowWalkIn ? <Pressable onPress={() => onPick(null)} style={{ paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.line }}><Text style={{ fontWeight: "700", color: C.brand }}>Walk-in customer (cash)</Text></Pressable> : undefined}
          renderItem={({ item: p }) => (
            <Pressable onPress={() => onPick(p)} style={{ paddingVertical: 12, flexDirection: "row", alignItems: "center" }}>
              <View style={{ flex: 1 }}><Text style={{ fontWeight: "700", fontSize: 15 }}>{p.name}</Text><Text style={s.muted}>{p.phone || ""}{p.gstin ? ` · GST ✓` : ""}</Text></View>
              <Text style={{ fontWeight: "800", color: p.balance > 0 ? C.bad : C.muted }}>{inr(Math.abs(p.balance))}</Text>
            </Pressable>)} />
      </SafeAreaView>
    </Modal>
  );
}

/** Inline product search with result list (type name or barcode) */
export function ProductSearch({ onPick, onScan, placeholder }: { onPick: (p: Product) => void; onScan?: () => void; placeholder?: string }) {
  const [q, setQ] = useState("");
  const [list, setList] = useState<Product[]>([]);
  useEffect(() => {
    if (!q.trim()) { setList([]); return; }
    const t = setTimeout(() => api(`/products?q=${encodeURIComponent(q.trim())}&limit=8`).then(setList).catch(() => {}), 150);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <TextInput style={[s.input, { flex: 1, borderColor: C.brand300 }]} placeholder={placeholder || "Search product / type barcode"} placeholderTextColor={C.faint} value={q} onChangeText={setQ} returnKeyType="search" />
        {onScan && <Pressable onPress={onScan} style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: C.brand, alignItems: "center", justifyContent: "center" }}><Feather name="maximize" size={20} color="#fff" /></Pressable>}
      </View>
      {list.length > 0 && <View style={{ backgroundColor: C.white, borderRadius: 14, borderWidth: 1, borderColor: C.line, paddingHorizontal: 12 }}>
        {list.map((p, i) => (
          <Pressable key={p.id} onPress={() => { onPick(p); setQ(""); setList([]); }} style={{ paddingVertical: 10, flexDirection: "row", borderTopWidth: i ? 1 : 0, borderTopColor: C.line }}>
            <View style={{ flex: 1 }}><Text style={{ fontWeight: "700" }}>{p.name}</Text><Text style={s.muted}>Stock {p.stock} · GST {p.gstRate}%</Text></View>
            <Text style={{ fontWeight: "800" }}>{inr(p.saleRate)}</Text>
          </Pressable>))}
      </View>}
    </View>
  );
}
