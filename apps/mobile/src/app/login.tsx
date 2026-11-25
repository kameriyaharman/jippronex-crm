import { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { api, auth } from "@/lib/api";
import { useSession } from "@/lib/session";
import { Btn, C, ErrorText, s } from "@/components/ui";
import { Logo } from "@/components/Logo";

/** 02 Login with mobile + 03 OTP verification */
export default function Login() {
  const { refresh } = useSession();
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [timer, setTimer] = useState(0);
  const otpRef = useRef<any>(null);
  useEffect(() => { if (timer <= 0) return; const t = setTimeout(() => setTimer(timer - 1), 1000); return () => clearTimeout(t); }, [timer]);

  const send = async () => {
    setErr(null); setBusy(true);
    try { const r = await api("/auth/otp/send", { body: { phone } }); setDevOtp(r.devOtp || null); setStep("otp"); setTimer(r.resendIn || 30); setTimeout(() => otpRef.current?.focus(), 300); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const verify = async () => {
    setErr(null); setBusy(true);
    try {
      const r = await api("/auth/otp/verify", { body: { phone, code: otp, via: "android" } });
      await auth.set(r.token, r.businesses?.[0]?.id);
      await refresh();
      router.replace(r.needsSetup ? "/setup" : "/(tabs)");
    } catch (e: any) { setErr(e.message); setBusy(false); }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.white }}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, padding: 24, gap: 18 }}>
        {step === "phone" ? <>
          <View style={{ marginTop: 24, marginBottom: 16 }}><Logo size={52} /></View>
          <Text style={{ fontSize: 28, fontWeight: "800", color: C.ink }}>Welcome👋</Text>
          <Text style={s.muted}>Login with your mobile number</Text>
          <View style={{ gap: 6 }}>
            <Text style={s.label}>Mobile number</Text>
            <View style={{ flexDirection: "row" }}>
              <View style={[s.input, { borderTopRightRadius: 0, borderBottomRightRadius: 0, backgroundColor: C.bg, justifyContent: "center" }]}><Text style={{ fontWeight: "700" }}>+91</Text></View>
              <TextInput autoFocus keyboardType="number-pad" maxLength={10} value={phone} onChangeText={(t) => setPhone(t.replace(/\D/g, ""))} placeholder="98300 12345" placeholderTextColor={C.faint}
                style={[s.input, { flex: 1, borderLeftWidth: 0, borderTopLeftRadius: 0, borderBottomLeftRadius: 0, fontSize: 17, fontWeight: "700", letterSpacing: 1 }]} />
            </View>
            <Text style={{ fontSize: 12, color: C.muted }}>We will send a 6-digit OTP on SMS / WhatsApp</Text>
          </View>
          <ErrorText error={err} />
          <Btn title="Get OTP" onPress={send} loading={busy} disabled={phone.length !== 10} />
          <View style={{ flex: 1 }} />
          <Text style={{ textAlign: "center", fontSize: 12, color: C.muted }}>By continuing you agree to Terms & Privacy</Text>
        </> : <>
          <Pressable onPress={() => setStep("phone")} hitSlop={12} style={{ marginTop: 8 }}><Feather name="arrow-left" size={24} color={C.ink} /></Pressable>
          <Text style={{ fontSize: 28, fontWeight: "800", color: C.ink }}>Verify OTP</Text>
          <Text style={s.muted}>Sent to +91 {phone} · <Text style={{ color: C.brand, fontWeight: "700" }} onPress={() => setStep("phone")}>Edit</Text></Text>
          <TextInput ref={otpRef} keyboardType="number-pad" maxLength={6} value={otp} onChangeText={(t) => setOtp(t.replace(/\D/g, ""))} placeholder="••••••" placeholderTextColor={C.faint}
            style={[s.input, { height: 64, textAlign: "center", fontSize: 28, fontWeight: "800", letterSpacing: 12 }]} />
          {devOtp && <Text style={{ backgroundColor: C.warn50, color: C.warn, padding: 10, borderRadius: 10, fontWeight: "700" }}>Test mode OTP: {devOtp}</Text>}
          <ErrorText error={err} />
          <Text style={{ textAlign: "center", color: C.muted }}>{timer > 0 ? `Resend OTP in 00:${String(timer).padStart(2, "0")}` : <Text style={{ color: C.brand, fontWeight: "700" }} onPress={send}>Resend OTP</Text>}</Text>
          <Btn title="Verify & continue" onPress={verify} loading={busy} disabled={otp.length < 4} />
        </>}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
