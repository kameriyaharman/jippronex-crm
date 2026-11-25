import { useEffect } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import { auth } from "@/lib/api";
import { useSession } from "@/lib/session";
import { Txt } from "@/components/ui";
import { Logo } from "@/components/Logo";

/** 01 Splash */
export default function Splash() {
  const { refresh } = useSession();
  useEffect(() => {
    (async () => {
      const t = await auth.load();
      await new Promise((r) => setTimeout(r, 900));
      if (!t) return router.replace("/login");
      const me = await refresh();
      if (!me) return router.replace("/login");
      router.replace(me.needsSetup ? "/setup" : "/(tabs)");
    })();
  }, [refresh]);
  return (
    <LinearGradient colors={["#0D3FB8", "#1C64EC", "#3C8DF5"]} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <StatusBar style="light" />
      <Logo size={150} />
      <Txt w="700" size={30} color="#fff" style={{ letterSpacing: 5, marginTop: 18 }}>JIPPRONEX</Txt>
      <Txt w="500" size={14} color="#D6E4FF" style={{ marginTop: 6 }}>Smart Billing · Inventory · Accounts</Txt>
      <View style={{ position: "absolute", bottom: 56 }}><Txt size={12.5} color="#DCE7FF">Technology That Empowers Business</Txt></View>
    </LinearGradient>
  );
}
