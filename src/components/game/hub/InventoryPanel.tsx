import { useState } from "react";
import { rpc } from "@/lib/game/api";
import type { GameData } from "@/lib/game/useGameData";
import { Empty, PxButton, Row, Section } from "./ui";

export function InventoryPanel({ d }: { d: GameData }) {
  const [tab, setTab] = useState<"weapons" | "equipment" | "items">("weapons");
  const owned = new Map(d.myWeapons.map((w) => [w.weapon_id, w]));
  const inv = new Map(d.myItems.map((i) => [i.item_id, i]));
  return (
    <div>
      <div className="mb-3 flex gap-1">{(["weapons", "equipment", "items"] as const).map((t) => (
        <PxButton key={t} tone={t === tab ? "primary" : "default"} className="flex-1 capitalize" onClick={() => setTab(t)}>{t}</PxButton>
      ))}</div>
      {tab === "weapons" && (
        <Section title="Weapons">
          {d.weapons.filter((w) => owned.has(w.id)).map((w) => {
            const eq = owned.get(w.id)?.equipped;
            return (
              <Row key={w.id}>
                <div className="flex-1"><div>{w.name}{eq && <span className="ml-1 text-xs text-accent">equipped</span>}</div>
                  <div className="text-xs text-muted-foreground">DMG {w.damage} · Range {w.range_px} · {(w.cooldown_ms / 1000).toFixed(2)}s · {w.weapon_type}</div></div>
                {eq ? (w.id !== "fists" && <PxButton onClick={() => void rpc("equip_weapon", { _weapon: "fists" })}>Unequip</PxButton>)
                  : <PxButton tone="primary" onClick={() => void rpc("equip_weapon", { _weapon: w.id })}>Equip</PxButton>}
              </Row>
            );
          })}
          <p className="mt-2 text-xs text-muted-foreground">Each base armory holds a unique weapon. Members of the owning gang can take it from the armory room.</p>
        </Section>
      )}
      {tab !== "weapons" && (() => {
        const cat = tab === "equipment" ? "equipment" : "item";
        const list = d.items.filter((i) => i.category === cat && (inv.get(i.id)?.qty ?? 0) > 0);
        return (
          <Section title={tab === "equipment" ? "Equipment" : "Combat items"}>
            {list.length === 0 ? <Empty>Nothing here yet.</Empty> : list.map((i) => {
              const row = inv.get(i.id)!;
              return (
                <Row key={i.id}>
                  <div className="flex-1"><div>{i.name} {cat === "item" && <span className="text-xs text-muted-foreground">x{row.qty}</span>}</div><div className="text-xs text-muted-foreground">{i.description}</div></div>
                  {cat === "equipment"
                    ? <PxButton tone={row.equipped ? "default" : "primary"} onClick={() => void rpc("set_equipment", { _item: i.id, _on: !row.equipped })}>{row.equipped ? "Unequip" : "Equip"}</PxButton>
                    : <PxButton tone="primary" onClick={() => void rpc("use_item", { _item: i.id }, `${i.name} used`)}>Use</PxButton>}
                </Row>
              );
            })}
            {cat === "item" && <p className="mt-2 text-xs text-muted-foreground">Restock bandages in your gang's respawn room.</p>}
          </Section>
        );
      })()}
    </div>
  );
}
