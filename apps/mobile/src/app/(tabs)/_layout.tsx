import { Tabs } from "expo-router/tabs";
import { Feather } from "@expo/vector-icons";
import { C } from "@/components/ui";

const icon = (name: keyof typeof Feather.glyphMap) => ({ color, size }: { color: any; size: number }) => <Feather name={name} size={size - 2} color={color} />;

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: C.brand, tabBarInactiveTintColor: C.faint, tabBarLabelStyle: { fontWeight: "700", fontSize: 11 }, tabBarStyle: { height: 64, paddingTop: 6 } }}>
      <Tabs.Screen name="index" options={{ title: "Home", tabBarIcon: icon("home") }} />
      <Tabs.Screen name="bills" options={{ title: "Bills", tabBarIcon: icon("file-text") }} />
      <Tabs.Screen name="stock" options={{ title: "Stock", tabBarIcon: icon("package") }} />
      <Tabs.Screen name="parties" options={{ title: "Parties", tabBarIcon: icon("users") }} />
      <Tabs.Screen name="more" options={{ title: "More", tabBarIcon: icon("grid") }} />
    </Tabs>
  );
}
