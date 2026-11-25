import { useState } from "react";
import { Pressable } from "react-native";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { api, auth } from "@/lib/api";
import { useSession } from "@/lib/session";
import { Btn, C, Card, ErrorText, Input, Screen, Txt } from "@/components/ui";

/** Retailer self-registration → Business setup → Plan */
export default function Register() {
  const { refresh } = useSession();
  const [f, setF] = useState({ name: "", phone: "", email: "", password: "", confirm: "" });
  const [show, setShow] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });
  const submit = async () => {
    setErr(null);
    if (f.password !== f.confirm) return setErr("Passwords don't match");
    setBusy(true);
    try {
      const r = await api("/auth/register", { body: { name: f.name, phone: f.phone, email: f.email || undefined, password: f.password } });
      await auth.set(r.token, r.businesses?.[0]?.id); await refresh();
      router.replace(r.needsSetup ? "/setup" : "/(tabs)");
    } catch (e: any) { setErr(e.message); setBusy(false); }
  };
  const ok = f.name.trim().length >= 2 && f.phone.length === 10 && f.password.length >= 6 && f.confirm.length >= 6;
  const eye = <Pressable onPress={() => setShow(!show)} hitSlop={10}><Feather name={show ? "eye-off" : "eye"} size={18} color={C.muted} /></Pressable>;
  return (
    <Screen title="Create account" footer={<Btn title="Create account & continue" icon="arrow-right" onPress={submit} loading={busy} disabled={!ok} />}>
      <Card style={{ backgroundColor: C.brand50, borderColor: C.brand100, flexDirection: "row", gap: 12, alignItems: "center" }}>
        <Feather name="gift" size={22} color={C.brand} />
        <Txt size={13} color={C.ink2} style={{ flex: 1 }}>Register your shop in 1 minute. You get a <Txt w="700" size={13} color={C.brand}>7-day free trial</Txt> — billing, stock and ledger.</Txt>
      </Card>
      <Input label="Your name" icon="user" value={f.name} onChangeText={set("name")} placeholder="Rakesh Sharma" autoCapitalize="words" />
      <Input label="Mobile number (login ID)" icon="smartphone" keyboardType="number-pad" maxLength={10} value={f.phone} onChangeText={(t) => set("phone")(t.replace(/\D/g, ""))} placeholder="10-digit mobile number" />
      <Input label="Email (optional)" icon="mail" keyboardType="email-address" autoCapitalize="none" value={f.email} onChangeText={set("email")} placeholder="you@business.com" />
      <Input label="Password" icon="lock" secureTextEntry={!show} value={f.password} onChangeText={set("password")} placeholder="At least 6 characters" right={eye} />
      <Input label="Confirm password" icon="lock" secureTextEntry={!show} value={f.confirm} onChangeText={set("confirm")} placeholder="Type password again" />
      <ErrorText error={err} />
      <Txt size={13} color={C.muted} style={{ textAlign: "center" }}>Already registered? <Txt w="600" size={13} color={C.brand} onPress={() => router.replace("/login")}>Login</Txt></Txt>
    </Screen>
  );
}
