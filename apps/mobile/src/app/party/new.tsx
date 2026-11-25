import { useState } from "react";
import { router } from "expo-router";
import { api } from "@/lib/api";
import { Btn, ErrorText, Input, Screen, Seg } from "@/components/ui";

export default function NewParty() {
  const [type, setType] = useState<"CUSTOMER" | "SUPPLIER">("CUSTOMER");
  const [f, setF] = useState({ name: "", phone: "", gstin: "", address: "", city: "", creditLimit: "", openingBalance: "" });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });
  const save = async () => {
    setBusy(true); setErr(null);
    try {
      const p = await api("/parties", { body: { type, name: f.name, phone: f.phone || null, gstin: f.gstin || null, address: f.address || null, city: f.city || null,
        creditLimit: f.creditLimit ? Number(f.creditLimit) : null, openingBalance: Number(f.openingBalance || 0), openingType: type === "CUSTOMER" ? "RECEIVE" : "PAY" } });
      router.replace(`/party/${p.id}`);
    } catch (e: any) { setErr(e.message); setBusy(false); }
  };
  return (
    <Screen title="Add party" footer={<Btn title="Save" onPress={save} loading={busy} disabled={!f.name} />}>
      <Seg value={type} onChange={setType} options={[{ value: "CUSTOMER", label: "Customer" }, { value: "SUPPLIER", label: "Supplier" }]} />
      <Input label="Name" value={f.name} onChangeText={set("name")} />
      <Input label="Mobile" keyboardType="phone-pad" value={f.phone} onChangeText={set("phone")} />
      <Input label="GSTIN" autoCapitalize="characters" maxLength={15} value={f.gstin} onChangeText={(v) => set("gstin")(v.toUpperCase())} />
      <Input label="Address" value={f.address} onChangeText={set("address")} />
      <Input label="City" value={f.city} onChangeText={set("city")} />
      {type === "CUSTOMER" && <Input label="Credit limit (₹)" keyboardType="decimal-pad" value={f.creditLimit} onChangeText={set("creditLimit")} />}
      <Input label={type === "CUSTOMER" ? "Opening balance to receive (₹)" : "Opening balance to pay (₹)"} keyboardType="decimal-pad" value={f.openingBalance} onChangeText={set("openingBalance")} />
      <ErrorText error={err} />
    </Screen>
  );
}
