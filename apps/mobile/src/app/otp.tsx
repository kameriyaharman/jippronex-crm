import { useEffect, useRef, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { api, auth } from "@/lib/api";
import { useSession } from "@/lib/session";
import { Btn, C, ErrorText, Screen, Txt } from "@/components/ui";

/** 03 OTP verification */
export default function Otp() {
  const { phone = "" } = useLocalSearchParams<{ phone: string }>();
  const { refresh } = useSession();
  const [otp, setOtp] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [timer, setTimer] = useState(30);
  const ref = useRef<any>(null);
  useEffect(() => { if (timer <= 0) return; const t = setTimeout(() => setTimer(timer - 1), 1000); return () => clearTimeout(t); }, [timer]);
  useEffect(() => { setTimeout(() => ref.current?.focus(), 300); }, []);
  const verify = async () => {
    setErr(null); setBusy(true);
    try {
      const r = await api("/auth/otp/verify", { body: { phone, code: otp, via: "android" } });
      await auth.set(r.token, r.businesses?.[0]?.id); await refresh();
      router.replace(r.needsSetup ? "/setup" : "/(tabs)");
    } catch (e: any) { setErr(e.message); setBusy(false); }
  };
  const resend = async () => { try { await api("/auth/otp/send", { body: { phone } }); setTimer(30); } catch (e: any) { setErr(e.message); } };
  return (
    <Screen title="" footer={<Btn title="Verify & continue" icon="check" onPress={verify} loading={busy} disabled={otp.length < 4} />}>
      <Txt w="700" size={26}>Verify OTP</Txt>
      <Txt color={C.muted} style={{ marginTop: -6 }}>Sent to +91 {phone.replace(/(\d{5})(\d{5})/, "$1 $2")} <Txt w="600" color={C.brand} onPress={() => router.back()}>Edit</Txt></Txt>
      <Pressable onPress={() => ref.current?.focus()} style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
        {Array.from({ length: 6 }, (_, i) => (
          <View key={i} style={{ flex: 1, height: 54, borderRadius: 10, borderWidth: 1.5, borderColor: i === otp.length ? C.brand : C.line, backgroundColor: C.white, alignItems: "center", justifyContent: "center" }}>
            <Txt w="700" size={22}>{otp[i] || ""}</Txt>
          </View>))}
      </Pressable>
      <TextInput ref={ref} value={otp} onChangeText={(t) => setOtp(t.replace(/\D/g, "").slice(0, 6))} keyboardType="number-pad" maxLength={6} style={{ position: "absolute", opacity: 0, height: 1 }} />
      <Txt size={13} color={C.muted}>{timer > 0 ? <>Resend OTP in <Txt w="700" size={13}>00:{String(timer).padStart(2, "0")}</Txt></> : <Txt w="600" size={13} color={C.brand} onPress={resend}>Resend OTP</Txt>}</Txt>
      <ErrorText error={err} />
    </Screen>
  );
}
