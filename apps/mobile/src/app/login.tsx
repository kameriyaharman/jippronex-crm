import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { api, auth, API_URL } from "@/lib/api";
import { useSession } from "@/lib/session";
import { Btn, C, ErrorText, Input, Txt } from "@/components/ui";
import { Logo } from "@/components/Logo";

/** 02 Login with mobile (OTP when SMS is set up, otherwise password) + Login with email */
export default function Login() {
  const { refresh } = useSession();
  const [cfg, setCfg] = useState<{ otp: boolean; demoPhone: string | null }>({ otp: false, demoPhone: null });
  const [mode, setMode] = useState<"mobile" | "email">("mobile");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { fetch(`${API_URL}/api/auth/config`).then((r) => r.json()).then(setCfg).catch(() => {}); }, []);
  const useOtp = mode === "mobile" && (cfg.otp || (!!cfg.demoPhone && phone === cfg.demoPhone));

  const done = async (r: any) => {
    await auth.set(r.token, r.businesses?.[0]?.id);
    await refresh();
    router.replace(r.needsSetup ? "/setup" : "/(tabs)");
  };
  const submit = async () => {
    setErr(null); setBusy(true);
    try {
      if (useOtp) { await api("/auth/otp/send", { body: { phone } }); router.push(`/otp?phone=${phone}`); setBusy(false); return; }
      await done(await api("/auth/login", { body: { id: mode === "email" ? email : phone, password } }));
    } catch (e: any) { setErr(e.message); setBusy(false); }
  };
  const ok = mode === "email" ? email.includes("@") && password.length > 0 : phone.length === 10 && (useOtp || password.length > 0);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 24, gap: 16 }} keyboardShouldPersistTaps="handled">
          <View style={{ marginTop: 20 }}><Logo size={88} /></View>
          <View style={{ gap: 4, marginTop: 8 }}>
            <Txt w="700" size={26}>Welcome 👋</Txt>
            <Txt color={C.muted}>{mode === "mobile" ? "Login with your mobile number" : "Login with your email"}</Txt>
          </View>
          {mode === "mobile" ? (
            <Input label="Mobile number" icon="smartphone" keyboardType="number-pad" maxLength={10} value={phone} onChangeText={(t) => setPhone(t.replace(/\D/g, ""))}
              placeholder="10-digit mobile number" />
          ) : (
            <Input label="Email" icon="mail" keyboardType="email-address" autoCapitalize="none" value={email} onChangeText={setEmail} placeholder="you@business.com" />
          )}
          {useOtp ? <Txt size={12.5} color={C.muted} style={{ marginTop: -8 }}>We will send a 6-digit OTP on SMS / WhatsApp</Txt> : (
            <Input label="Password" icon="lock" secureTextEntry={!show} value={password} onChangeText={setPassword} placeholder="Your password"
              right={<Pressable onPress={() => setShow(!show)} hitSlop={10}><Feather name={show ? "eye-off" : "eye"} size={18} color={C.muted} /></Pressable>} />
          )}
          <ErrorText error={err} />
          <Btn title={useOtp ? "Get OTP" : "Login"} icon="arrow-right" onPress={submit} loading={busy} disabled={!ok} />
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}><View style={{ flex: 1, height: 1, backgroundColor: C.line }} /><Txt size={12} color={C.faint}>or</Txt><View style={{ flex: 1, height: 1, backgroundColor: C.line }} /></View>
          <Btn title={mode === "mobile" ? "Login with email" : "Login with mobile number"} icon={mode === "mobile" ? "mail" : "smartphone"} kind="outline" onPress={() => { setErr(null); setMode(mode === "mobile" ? "email" : "mobile"); }} />
          <View style={{ flex: 1 }} />
          <View style={{ backgroundColor: C.brand50, borderRadius: 12, padding: 16, gap: 10 }}>
            <Txt w="600" color={C.ink}>New shop / retailer?</Txt>
            <Txt size={13} color={C.ink2}>Create your free account in 1 minute — 7-day free trial, no card needed.</Txt>
            <Btn title="Register your business" icon="user-plus" kind="white" onPress={() => router.push("/register")} style={{ borderWidth: 1, borderColor: C.brand100 }} />
          </View>
          <Txt size={12} color={C.muted} style={{ textAlign: "center" }}>By continuing you agree to Terms & Privacy</Txt>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
