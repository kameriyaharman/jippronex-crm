import { useEffect } from "react";
import { Text, View } from "react-native";
import { router } from "expo-router";
import { auth } from "@/lib/api";
import { useSession } from "@/lib/session";
import { C } from "@/components/ui";
import { Logo } from "@/components/Logo";

/** 01 Splash — decides where to go */
export default function Splash() {
  const { refresh } = useSession();
  useEffect(() => {
    (async () => {
      const t = await auth.load();
      await new Promise((r) => setTimeout(r, 700));
      if (!t) return router.replace("/login");
      const me = await refresh();
      if (!me) return router.replace("/login");
      router.replace(me.needsSetup ? "/setup" : "/(tabs)");
    })();
  }, [refresh]);
  return (
    <View style={{ flex: 1, backgroundColor: C.brand, alignItems: "center", justifyContent: "center", gap: 18 }}>
      <Logo size={88} light />
      <Text style={{ color: "#fff", fontSize: 30, fontWeight: "800", letterSpacing: 4 }}>JIPPRONEX</Text>
      <Text style={{ color: C.brand300, fontWeight: "600" }}>Smart Billing · Inventory · Accounts</Text>
      <Text style={{ position: "absolute", bottom: 48, color: "#ffffffaa", fontSize: 12 }}>Technology That Empowers Business</Text>
    </View>
  );
}
