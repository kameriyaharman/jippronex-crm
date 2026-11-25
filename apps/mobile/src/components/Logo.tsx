import Svg, { Circle, Path, Rect } from "react-native-svg";

export function Logo({ size = 40, light }: { size?: number; light?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40">
      <Rect width="40" height="40" rx="11" fill={light ? "#ffffff22" : "#0b46c4"} />
      <Circle cx="20" cy="20" r="11" fill="none" stroke="#9cc4fa" strokeWidth="2" />
      <Path d="M9 20h22M20 9c4 3.5 4 18.5 0 22M20 9c-4 3.5-4 18.5 0 22" stroke="#9cc4fa" strokeWidth="1.6" fill="none" />
      <Path d="M23 13v10.5a4.5 4.5 0 0 1-8.6 1.8" stroke="#fff" strokeWidth="3" strokeLinecap="round" fill="none" />
    </Svg>
  );
}
