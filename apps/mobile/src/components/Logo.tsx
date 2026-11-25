import { Image } from "react-native";

/** Jippronex brand logo (round JX badge) */
export function Logo({ size = 48 }: { size?: number }) {
  return <Image source={require("../../assets/logo.png")} style={{ width: size, height: size }} resizeMode="contain" />;
}
