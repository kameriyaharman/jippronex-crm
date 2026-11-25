import { Tabs } from "expo-router/tabs";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { C } from "@/components/ui";

const icon = (name: keyof typeof Feather.glyphMap) => ({ color, size }: { color: any; size: number }) => <Feather name={name} size={size - 2} color={color} />;

export default function TabsLayout() {
  // Android draws edge-to-edge: keep the tab bar above the system navigation buttons
  const insets = useSafeAreaInsets();
  const bottom = Math.max(insets.bottom, 8);
  return (
    <Tabs screenOptions={{
      headerShown: false, tabBarActiveTintColor: C.brand, tabBarInactiveTintColor: C.muted,
      tabBarLabelStyle: { fontFamily: "Inter_500Medium", fontSize: 11.5 },
      tabBarStyle: { height: 58 + bottom, paddingTop: 6, paddingBottom: bottom, backgroundColor: C.white, borderTopColor: C.line },
    }}>
      <Tabs.Screen name="index" options={{ title: "Home", tabBarIcon: icon("home") }} />
      <Tabs.Screen name="bills" options={{ title: "Bills", tabBarIcon: icon("file-text") }} />
      <Tabs.Screen name="stock" options={{ title: "Stock", tabBarIcon: icon("package") }} />
      <Tabs.Screen name="parties" options={{ title: "Parties", tabBarIcon: icon("users") }} />
      <Tabs.Screen name="more" options={{ title: "More", tabBarIcon: icon("grid") }} />
    </Tabs>
  );
}
