import { useState } from "react";
import { Image, Text } from "react-native";
import { router } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useRef } from "react";
import { api } from "@/lib/api";
import { Btn, C, Chips, ErrorText, Input, Screen } from "@/components/ui";

const CATS = ["Rent", "Electricity", "Salary", "Transport", "Office", "Other"];

/** 26 Add expense (with bill photo) */
export default function Expense() {
  const [amount, setAmount] = useState("");
  const [cat, setCat] = useState("Electricity");
  const [note, setNote] = useState("");
  const [mode, setMode] = useState("UPI");
  const [account, setAccount] = useState("SBI");
  const [photo, setPhoto] = useState<string | null>(null);
  const [cam, setCam] = useState(false);
  const [perm, request] = useCameraPermissions();
  const camRef = useRef<CameraView>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const snap = async () => {
    const pic = await camRef.current?.takePictureAsync({ quality: 0.4, base64: true });
    if (pic?.base64) setPhoto(`data:image/jpeg;base64,${pic.base64}`);
    setCam(false);
  };
  const save = async () => {
    setBusy(true); setErr(null);
    try { await api("/expenses", { body: { amount: Number(amount), category: cat, description: note || cat, mode, account: mode === "CASH" ? undefined : account, attachmentUrl: photo || undefined } }); router.back(); }
    catch (e: any) { setErr(e.message); setBusy(false); }
  };
  if (cam) return (
    <Screen title="Bill photo" scroll={false} pad={false} footer={<Btn title="Capture" icon="camera" onPress={snap} />}>
      <CameraView ref={camRef} style={{ flex: 1 }} facing="back" />
    </Screen>
  );
  return (
    <Screen title="Add expense" footer={<Btn title="Save expense" onPress={save} loading={busy} disabled={!(Number(amount) > 0)} />}>
      <Input label="Amount" keyboardType="decimal-pad" value={amount} onChangeText={(t) => setAmount(t.replace(/[^\d.]/g, ""))} style={{ fontSize: 26, fontWeight: "800", height: 60 }} />
      <Text style={{ fontWeight: "700" }}>Category</Text>
      <Chips value={cat} onChange={setCat} options={CATS.map((c) => ({ value: c, label: c }))} />
      <Input label="Note" value={note} onChangeText={setNote} placeholder="November electricity bill" />
      <Text style={{ fontWeight: "700" }}>Paid by</Text>
      <Chips value={mode} onChange={setMode} options={[{ value: "CASH", label: "Cash" }, { value: "UPI", label: "UPI" }, { value: "BANK", label: "Bank" }]} />
      {mode !== "CASH" && <Input label="Account" value={account} onChangeText={setAccount} />}
      {photo ? <Image source={{ uri: photo }} style={{ height: 160, borderRadius: 14 }} /> : null}
      <Btn title={photo ? "Retake bill photo" : "Attach bill photo"} kind="outline" icon="camera" onPress={async () => { if (!perm?.granted) { const r = await request(); if (!r.granted) return; } setCam(true); }} />
      <ErrorText error={err} />
      <Text style={{ color: C.muted, fontSize: 12, textAlign: "center" }}>Photo is saved with the expense</Text>
    </Screen>
  );
}
