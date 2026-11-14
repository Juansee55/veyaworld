import type { ReactNode } from "react";

/** Square pixel HUD button with an icon and a tiny caption. */
export function IconButton({ icon, label, onClick, badge, tone = "default", size = "md", disabled }: {
  icon: ReactNode; label: string; onClick: () => void; badge?: number; tone?: "default" | "primary"; size?: "sm" | "md"; disabled?: boolean;
}) {
  const dim = size === "sm" ? "h-11 w-11" : "h-12 w-12";
  return (
    <button onClick={onClick} aria-label={label} disabled={disabled}
      className={`pixel-panel pointer-events-auto relative flex ${dim} flex-col items-center justify-center gap-0.5 leading-none active:translate-y-px disabled:opacity-40 ${tone === "primary" ? "text-primary" : "text-foreground"}`}>
      <span className="flex h-5 items-center justify-center [&_svg]:h-5 [&_svg]:w-5">{icon}</span>
      <span className="max-w-full truncate px-0.5 text-[10px]">{label}</span>
      {!!badge && badge > 0 && <span className="absolute -right-1.5 -top-1.5 bg-destructive px-1 text-[10px] text-destructive-foreground">{badge}</span>}
    </button>
  );
}
