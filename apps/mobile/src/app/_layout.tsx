import { useEffect } from "react";
import { Stack, router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SessionProvider } from "@/lib/session";
import { auth } from "@/lib/api";

export default function RootLayout() {
  useEffect(() => { auth.onUnauthorized(() => { auth.clear(); router.replace("/login"); }); }, []);
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#F5F7FB" }, animation: "slide_from_right" }} />
      </SessionProvider>
    </SafeAreaProvider>
  );
}
