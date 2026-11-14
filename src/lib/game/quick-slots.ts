import { useEffect, useState } from "react";
import { QUICK_SLOT_COUNT } from "./play-rules";
const defaults = ["gun:gun_crystal", "item:bandage"];
export function useQuickSlots(userId: string) {
  const key = `veya:quick-slots:${userId}`;
  const [slots, setSlots] = useState<string[]>(defaults);
  useEffect(() => {
    const read = () => { try { const value: unknown = JSON.parse(localStorage.getItem(key) ?? "null"); setSlots(Array.isArray(value) && value.length === QUICK_SLOT_COUNT && value.every((v) => typeof v === "string") ? value : defaults); } catch { setSlots(defaults); } };
    read(); window.addEventListener("veya-slots", read);
    return () => window.removeEventListener("veya-slots", read);
  }, [key]);
  const assign = (index: number, value: string) => { const next = slots.map((s, i) => i === index ? value : s); setSlots(next); localStorage.setItem(key, JSON.stringify(next)); window.dispatchEvent(new Event("veya-slots")); };
  return { slots, assign };
}