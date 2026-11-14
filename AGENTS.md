<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## Game engine
- All Phaser code lives in `src/game/` and is loaded only via dynamic import from `/play`; only pure-data modules (`catalog.ts`, `maps/`, `bases/defs.ts`, `combat/lineOfSight.ts`) are SSR-safe and may be imported statically or by server code. Why: Phaser touches `window` at import time.
- Multiplayer: one realtime channel per map; Presence for who is online and their look, Broadcast `move` for positions. Why: keeps high-frequency traffic out of the database.
- Character art is generated in code with one shared frame grid for BODY, HEAD and HAT, drawn in that order. Why: any part can be swapped on its own.

## Gang system
- Clients only SELECT gang/base/combat/chat tables; every write goes through SECURITY DEFINER SQL functions that validate the caller. Why: gameplay must be server-authoritative.
- Attacks go through the `attackPlayer` server function (wall check with the TS map data), which then calls the service-role-only `resolve_attack` SQL function. Why: walls live in TS map data, not the database.
- Base capture/repair and hours are processed by `base_tick`, which clients call every 3 s and the server throttles globally. Why: no in-memory server state on workers.

## Migration reliability
- Import pointer-only assets into the current project rather than reusing source-project pointers; optional art failures use the existing procedural fallback so one missing image cannot prevent gameplay.
- Keep the auth state subscription in the root route and password recovery on a public page; recovery callbacks must not redirect into the game before password setup.

## Admin record imports
- Keep CSV parsing and its schema allowlist browser-safe; import handlers must revalidate files and check the caller's admin role before loading privileged helpers. Why: UI visibility and client validation are not security boundaries.
- Create imported auth identities only through the supported admin API with explicit original IDs and no password, confirmation or role metadata; write application batches through the service-role-only atomic SQL importer. Why: preserve ownership without copying credentials or modifying managed auth tables.

## World editor media
- Store original world images in private player-art storage with admin-only world_assets metadata; pad partial tiles during scene loading and keep optional-art fallbacks. Why: accept arbitrary dimensions without modifying source images or blocking gameplay.
- Save placed-object dimensions independently from furniture templates; admin player drags use a validated server function and an admin-checking SQL RPC. Why: resizing one instance must not resize all copies, and movement permissions cannot depend on UI state.

## Social views
- News publishing is enforced by admin RLS; profile text statuses use owner-only profile updates. Why: hiding buttons alone does not enforce permissions.
- Image viewers use the existing zoom-pan library; gameplay pinch changes the Phaser camera around the gesture midpoint. Why: image transforms and game-world coordinates need separate zoom handling.
