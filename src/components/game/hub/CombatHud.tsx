import { useEffect, useState } from "react";
import { Backpack, Cross, Repeat } from "lucide-react";
import { rpc } from "@/lib/game/api";
import { notify } from "@/lib/game/notify";
import type { GameData } from "@/lib/game/useGameData";
import { BASES, captureZone } from "@/game/bases/defs";
import { STATUS_LABEL } from "./BasesPanel";
import { GangBadge, HpBar } from "./ui";
import { IconButton } from "./IconButton";

/** Shared combat state: HP, protection, weapon, bandages and the base you're standing in. */
export function useCombat(d: GameData, mapId: string, onAttack: () => Promise<string | null>) {
  const [cool, setCool] = useState(false);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(t); }, []);
  const c = d.combat;
  const prot = c ? new Date(c.protected_until).getTime() - now : 0;
  const equipped = d.myWeapons.find((w) => w.equipped)?.weapon_id ?? "fists";
  const weapon = d.weapons.find((w) => w.id === equipped);
  const ownedOrder = d.weapons.filter((w) => d.myWeapons.some((m) => m.weapon_id === w.id));
  const bandages = d.myItems.find((i) => i.item_id === "bandage")?.qty ?? 0;

  const zoneBase = BASES.find((b) => captureZone(b).mapId === mapId);
  const base = d.bases.find((b) => b.id === (zoneBase?.id ?? BASES.find((b) => mapId.startsWith(b.id + "_"))?.id));
  const owner = base?.owner_gang_id ? d.gangById[base.owner_gang_id] : null;
  const ownsHere = !!base && !!d.myGang && base.owner_gang_id === d.myGang.id;
  const inArmory = ownsHere && base!.armory_map === mapId;
  const inRespawn = ownsHere && base!.respawn_map === mapId;

  const attack = async () => {
    if (cool) return;
    setCool(true);
    const err = await onAttack();
    if (err) notify(err, "error");
    setTimeout(() => setCool(false), Math.max(250, weapon?.cooldown_ms ?? 500));
  };
  const cycle = () => {
    if (ownedOrder.length < 2) return notify("Capture a base armory to get more weapons");
    const i = ownedOrder.findIndex((w) => w.id === equipped);
    const next = ownedOrder[(i + 1) % ownedOrder.length]!;
    void rpc("equip_weapon", { _weapon: next.id }, `${next.name} equipped`);
  };
  const heal = () => void rpc("use_item", { _item: "bandage" });
  const claim = () => void (inArmory ? rpc("claim_armory", undefined, "Weapon added to your bag") : rpc("claim_supplies", undefined, "Bandages restocked"));
  const claimLabel = inArmory ? `Take ${d.weapons.find((w) => w.id === base!.rack_weapon)?.name ?? "weapon"}` : inRespawn ? "Restock bandages" : null;
  return { c, prot, weapon, bandages, base, owner, cool, attack, cycle, heal, claim, claimLabel };
}
type Combat = ReturnType<typeof useCombat>;

function HpCard({ s }: { s: Combat }) {
  if (!s.c) return null;
  return (
    <div className="pixel-panel px-2 py-1 text-xs">
      <div className="flex justify-between gap-2"><span>HP</span><span>{s.c.hp}/{s.c.max_hp}</span></div>
      <HpBar hp={s.c.hp} max={s.c.max_hp} />
      {s.prot > 0 && <div className="mt-0.5 text-accent">Protected {Math.ceil(s.prot / 1000)}s</div>}
    </div>
  );
}
function BaseCard({ s }: { s: Combat }) {
  const b = s.base; if (!b) return null;
  return (
    <div className="pixel-panel px-2 py-1 text-xs">
      <div className="truncate text-primary">{b.name}</div>
      <div className="truncate">{s.owner ? <GangBadge g={s.owner} /> : "Unclaimed"}</div>
      <HpBar hp={b.hp} max={b.max_hp} className="my-0.5" />
      <div className="flex justify-between gap-2"><span>{b.hp}/{b.max_hp}</span><span>{STATUS_LABEL[b.status] ?? b.status}</span></div>
    </div>
  );
}
function AttackButton({ s, big }: { s: Combat; big?: boolean }) {
  return (
    <button onPointerDown={(e) => { e.preventDefault(); void s.attack(); }} aria-label="Attack"
      className={`pixel-panel pointer-events-auto flex flex-col items-center justify-center rounded-full ${big ? "h-24 w-24 text-3xl" : "h-20 w-20 text-lg"} ${s.cool ? "opacity-50" : "text-primary"}`}>
      ⚔<span className="text-xs">Attack</span>
    </button>
  );
}

/** HP, base status, quick buttons and the attack button, arranged for the current orientation. */
export function CombatHud({ d, mapId, onAttack, landscape, hidden, onBag, info }: {
  d: GameData; mapId: string; onAttack: () => Promise<string | null>; landscape: boolean; hidden: boolean; onBag: () => void; info: React.ReactNode;
}) {
  const s = useCombat(d, mapId, onAttack);
  if (hidden) return null;
  const quick = (
    <>
      <IconButton icon={<Backpack />} label="Bag" onClick={onBag} />
      <IconButton icon={<Cross />} label={`Heal ${s.bandages}`} onClick={s.heal} disabled={s.bandages === 0} />
      <IconButton icon={<Repeat />} label={s.weapon?.name.split(" ")[0] ?? "Fists"} onClick={s.cycle} />
    </>
  );
  const claim = s.claimLabel && <button className="pixel-panel pointer-events-auto px-3 py-2 text-sm text-primary" onClick={s.claim}>{s.claimLabel}</button>;

  if (landscape) return (
    <>
      <div className="pointer-events-none absolute left-3 z-10 flex max-w-[calc(100%-110px)] items-start gap-2" style={{ top: "calc(max(8px, env(safe-area-inset-top)) + 64px)" }}>
        {info}
        <div className="w-28 shrink-0"><HpCard s={s} /></div>
        {s.base && <div className="hidden w-32 min-w-0 lg:block"><BaseCard s={s} /></div>}
      </div>
      <div className="pointer-events-none absolute z-10 flex flex-col gap-2"
        style={{ top: "max(8px, env(safe-area-inset-top))", right: "max(12px, env(safe-area-inset-right))" }}>{quick}</div>
      <div className="pointer-events-none absolute z-10 flex items-end gap-3"
        style={{ bottom: "max(16px, env(safe-area-inset-bottom))", right: "max(20px, env(safe-area-inset-right))" }}>
        {claim}<AttackButton s={s} big />
      </div>
    </>
  );

  return (
    <>
      <div className="pointer-events-none absolute left-3 z-10 flex w-40 flex-col gap-2" style={{ top: "calc(max(12px, env(safe-area-inset-top)) + 64px)" }}>
        <HpCard s={s} /><BaseCard s={s} />
      </div>
      <div className="pointer-events-none absolute right-3 z-10 flex flex-col items-end gap-2" style={{ bottom: "max(20px, env(safe-area-inset-bottom))" }}>
        {claim}
        <div className="flex items-end gap-2">
          <div className="flex flex-col gap-2">{quick}</div>
          <AttackButton s={s} />
        </div>
      </div>
    </>
  );
}
