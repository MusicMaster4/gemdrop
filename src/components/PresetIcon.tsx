import {
  BookOpen,
  Brain,
  BriefcaseBusiness,
  Camera,
  Code2,
  Compass,
  FlaskConical,
  Gem,
  Heart,
  Languages,
  Lightbulb,
  Music2,
  Palette,
  PenLine,
  Sparkles,
  Terminal,
  type LucideIcon,
} from "lucide-react";
import type { CSSProperties } from "react";

export const presetIcons: Record<string, LucideIcon> = {
  sparkles: Sparkles,
  code: Code2,
  pen: PenLine,
  compass: Compass,
  book: BookOpen,
  brain: Brain,
  terminal: Terminal,
  languages: Languages,
  lightbulb: Lightbulb,
  briefcase: BriefcaseBusiness,
  flask: FlaskConical,
  palette: Palette,
  gem: Gem,
  music: Music2,
  camera: Camera,
  heart: Heart,
};
export const presetColors = [
  "#b7a0e8",
  "#91b9a4",
  "#d7aa83",
  "#83adc9",
  "#d28e9d",
  "#c1bb80",
  "#8da3db",
  "#acaaa7",
];
export function randomIcon() {
  const keys = Object.keys(presetIcons);
  return keys[Math.floor(Math.random() * keys.length)];
}
export function randomColor() {
  return presetColors[Math.floor(Math.random() * presetColors.length)];
}
export function PresetIcon({
  icon,
  color,
  size = 23,
  className = "",
}: {
  icon: string;
  color: string;
  size?: number;
  className?: string;
}) {
  const Icon = presetIcons[icon] ?? Sparkles;
  return (
    <span
      className={`preset-icon ${className}`}
      style={{ "--preset-color": color } as CSSProperties}
    >
      <Icon size={size} strokeWidth={1.65} />
    </span>
  );
}
export { GemdropMark } from "./BrandMark";
