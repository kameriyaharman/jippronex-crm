import { useEffect, useState } from "react";
import { Text } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { api } from "@/lib/api";
import { Btn, C, Card, Chips, ErrorText, Input, Screen, Seg } from "@/components/ui";
import { ProductSearch } from "@/components/Pickers";

const R: Record<string, string> = { OPENING: "Opening", RETURN: "Return", TRANSFER: "Transfer", DAMAGE: "Damage", ADJUSTMENT: "Adjustment" };

/** 20 Stock in / out */
export default function StockAdjust() {
  const p = useLocalSearchParams<{ productId?: string; dir?: string }>();
  const [dir, setDir] = useState<"IN" | "OUT">(p.dir === "OUT" ? "OUT" : "IN");
  const [prod, setProd] = useState<any>(null);
  const [n, setN] = useState("");
  const [reason, setReason] = useState(dir === "IN" ? "OPENING" : "DAMAGE");
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (p.productId) api(`/products/${p.productId}`).then(setProd); }, [p.productId]);
  useEffect(() => { setReason(dir === "IN" ? "OPENING" : "DAMAGE"); }, [dir]);
  const save = async () => {
    setBusy(true); setErr(null);
    try { await api("/stock/adjust", { body: { productId: prod.id, direction: dir, qty: Number(n), reason, note: note || undefined } }); router.back(); }
    catch (e: any) { setErr(e.message); setBusy(false); }
  };
  return (
    <Screen title="Stock in / out" footer={<Btn title="Update stock" onPress={save} loading={busy} disabled={!prod || !Number(n)} />}>
      <Seg value={dir} onChange={setDir} options={[{ value: "IN", label: "Stock IN" }, { value: "OUT", label: "Stock OUT" }]} />
      {prod ? <Card onPress={() => setProd(null)}><Text style={{ fontWeight: "800" }}>{prod.name}</Text><Text style={{ color: C.muted }}>Current stock {prod.stock} {prod.unit} · tap to change</Text></Card> : <ProductSearch onPick={setProd} />}
      <Input label={`Quantity${prod ? ` (${prod.unit})` : ""}`} keyboardType="decimal-pad" value={n} onChangeText={setN} />
      <Text style={{ fontWeight: "700" }}>Reason</Text>
      <Chips value={reason} onChange={setReason} options={(dir === "IN" ? ["OPENING", "RETURN", "TRANSFER", "ADJUSTMENT"] : ["DAMAGE", "TRANSFER", "ADJUSTMENT"]).map((r) => ({ value: r, label: R[r] }))} />
      <Input label="Note" value={note} onChangeText={setNote} placeholder="From Shop 2" />
      <ErrorText error={err} />
    </Screen>
  );
}
