import type { LucideIcon } from 'lucide-react';
import {
  Tag,
  UtensilsCrossed,
  Car,
  Clapperboard,
  HeartPulse,
  GraduationCap,
  ShoppingBag,
  KeyRound,
  Zap,
  Home,
  ShieldCheck,
  Landmark,
  Repeat,
  Shirt,
  Sparkles,
  PawPrint,
  Gift,
  MoreHorizontal,
  Coffee,
  Smartphone,
  Laptop,
  Plane,
  Briefcase,
  Trees,
  Receipt,
  Wifi,
  Music,
  BookOpen,
  Stethoscope,
  Dumbbell,
  Baby,
  Wine,
  Cpu,
  Camera,
  Gamepad2,
  Fuel,
} from 'lucide-react';
import { EXPENSE_CATEGORY_DEFAULT_PRESETS } from '../constants/expenseCategoryDefaults';
import { lucidePascalToKebab } from '../lib/lucideDynamicRegistry';
import { DynamicLucideIcon } from './DynamicLucideIcon';

const EXTRA_ICONS_FOR_PICKER = [
  'Coffee',
  'Smartphone',
  'Laptop',
  'Plane',
  'Briefcase',
  'Trees',
  'Receipt',
  'Wifi',
  'Music',
  'BookOpen',
  'Stethoscope',
  'Dumbbell',
  'Baby',
  'Wine',
  'Cpu',
  'Camera',
  'Gamepad2',
  'Fuel',
] as const;

export const CATEGORY_LUCIDE_MAP: Record<string, LucideIcon> = {
  Tag,
  UtensilsCrossed,
  Car,
  Clapperboard,
  HeartPulse,
  GraduationCap,
  ShoppingBag,
  KeyRound,
  Zap,
  Bolt: Zap,
  Home,
  House: Home,
  ShieldCheck,
  Landmark,
  Repeat,
  Shirt,
  Sparkles,
  PawPrint,
  Gift,
  MoreHorizontal,
  Coffee,
  Smartphone,
  Laptop,
  Plane,
  Briefcase,
  Trees,
  Receipt,
  Wifi,
  Music,
  BookOpen,
  Stethoscope,
  Dumbbell,
  Baby,
  Wine,
  Cpu,
  Camera,
  Gamepad2,
  Fuel,
};

export const CATEGORY_ICON_PICKLIST: string[] = Array.from(
  new Set([
    ...EXPENSE_CATEGORY_DEFAULT_PRESETS.map((p) => p.icon),
    ...(EXTRA_ICONS_FOR_PICKER as readonly string[]),
  ])
).sort((a, b) => a.localeCompare(b));

export function CategoryGlyph({
  iconKey,
  className,
  strokeWidth,
}: {
  iconKey: string | null | undefined;
  className?: string;
  strokeWidth?: number;
}) {
  if (iconKey) {
    const Static = CATEGORY_LUCIDE_MAP[iconKey];
    if (Static) {
      return <Static className={className} aria-hidden strokeWidth={strokeWidth} />;
    }
    const kebab = lucidePascalToKebab(iconKey);
    if (kebab) {
      return (
        <DynamicLucideIcon
          kebab={kebab}
          className={className}
          aria-hidden
          strokeWidth={strokeWidth}
        />
      );
    }  }
  return <Tag className={className} aria-hidden strokeWidth={strokeWidth} />;
}
