import { Image } from "react-native";

/** JipproBill brand logo (Jippronex.com) */
export function Logo({ size = 48 }: { size?: number }) {
  return <Image source={require("../../assets/logo.png")} style={{ width: size, height: size }} resizeMode="contain" />;
}
