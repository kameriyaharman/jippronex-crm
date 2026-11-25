import { useEffect } from "react";
import { View } from "react-native";
import { Stack, router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from "@expo-google-fonts/inter";
import { SessionProvider } from "@/lib/session";
import { auth } from "@/lib/api";

export default function RootLayout() {
  const [loaded] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold });
  useEffect(() => { auth.onUnauthorized(() => { auth.clear(); router.replace("/login"); }); }, []);
  if (!loaded) return <View style={{ flex: 1, backgroundColor: "#0E47C8" }} />;
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#F4F6FA" }, animation: "slide_from_right" }} />
      </SessionProvider>
    </SafeAreaProvider>
  );
}
