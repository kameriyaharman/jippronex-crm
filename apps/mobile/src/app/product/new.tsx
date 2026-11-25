import { useEffect, useState } from "react";
import { View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { api } from "@/lib/api";
import { Btn, Chips, ErrorText, Input, Screen } from "@/components/ui";

/** 18 Add product (also edit with ?id=) */
export default function ProductForm() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [f, setF] = useState<any>({ name: "", barcode: "", hsn: "", purchaseRate: "", saleRate: "", mrp: "", gstRate: "0", unit: "pcs", openingStock: "", minStock: "", category: "" });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (id) api(`/products/${id}`).then((p) => setF({ ...p, purchaseRate: String(p.purchaseRate ?? ""), saleRate: String(p.saleRate), mrp: p.mrp ? String(p.mrp) : "", gstRate: String(p.gstRate), minStock: String(p.minStock), category: "" })); }, [id]);
  const set = (k: string) => (v: string) => setF({ ...f, [k]: v });
  const save = async () => {
    setBusy(true); setErr(null);
    try {
      const body = { name: f.name, barcode: f.barcode || null, hsn: f.hsn || null, unit: f.unit, purchaseRate: Number(f.purchaseRate || 0), saleRate: Number(f.saleRate || 0), mrp: f.mrp ? Number(f.mrp) : null,
        gstRate: Number(f.gstRate), minStock: Number(f.minStock || 0), category: f.category || undefined, ...(id ? {} : { openingStock: Number(f.openingStock || 0) }) };
      const p = id ? await api(`/products/${id}`, { method: "PUT", body }) : await api("/products", { body });
      router.replace(`/product/${p.id}`);
    } catch (e: any) { setErr(e.message); setBusy(false); }
  };
  const num = { keyboardType: "decimal-pad" as const };
  return (
    <Screen title={id ? "Edit product" : "Add product"} footer={<Btn title="Save product" onPress={save} loading={busy} disabled={!f.name} />}>
      <Input label="Product name" value={f.name} onChangeText={set("name")} placeholder="Maggi Noodles 280g" />
      <View style={{ flexDirection: "row", gap: 10 }}>
        <View style={{ flex: 1.4 }}><Input label="Barcode" value={f.barcode || ""} onChangeText={set("barcode")} keyboardType="number-pad" /></View>
        <View style={{ flex: 1 }}><Input label="HSN" value={f.hsn || ""} onChangeText={set("hsn")} keyboardType="number-pad" /></View>
      </View>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <View style={{ flex: 1 }}><Input label="Purchase rate" value={f.purchaseRate} onChangeText={set("purchaseRate")} {...num} /></View>
        <View style={{ flex: 1 }}><Input label="Sale rate" value={f.saleRate} onChangeText={set("saleRate")} {...num} /></View>
        <View style={{ flex: 1 }}><Input label="MRP" value={f.mrp} onChangeText={set("mrp")} {...num} /></View>
      </View>
      <Input label="GST %" value={f.gstRate} editable={false} />
      <Chips value={f.gstRate} onChange={set("gstRate")} options={["0", "5", "12", "18", "28"].map((g) => ({ value: g, label: `${g}%` }))} />
      <Chips scroll value={f.unit} onChange={set("unit")} options={["pcs", "bag", "kg", "ltr", "box", "pack", "dozen", "mtr"].map((u) => ({ value: u, label: u }))} />
      <Input label="Category" value={f.category} onChangeText={set("category")} placeholder="Packaged food" />
      <View style={{ flexDirection: "row", gap: 10 }}>
        {!id && <View style={{ flex: 1 }}><Input label="Opening stock" value={f.openingStock} onChangeText={set("openingStock")} {...num} /></View>}
        <View style={{ flex: 1 }}><Input label="Min stock alert" value={f.minStock} onChangeText={set("minStock")} {...num} /></View>
      </View>
      <ErrorText error={err} />
    </Screen>
  );
}
