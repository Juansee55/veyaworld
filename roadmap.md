# Veya World roadmap

## World editor uploads
- [ ] Upload objects and horizontal 16×16 tilesets from files or gallery
- [ ] Paint custom tiles, create blank maps and build houses during play
- [ ] Verify saving, reloading and mobile layout as an administrator

## Admin CSV importer
- [ ] Add admin-only file selection, validation reports and import results
- [ ] Preserve player, gang, chat and user IDs with server-checked relationships
- [ ] Verify valid imports, validation failures, access denial and mobile layout

## Migration completion
- [x] Audit and fix broken asset pointers, initialization, save errors and missing editor entry
- [x] Verify signed-in gameplay, wardrobe uploads, gang create/delete, chat and portrait/landscape mobile rendering
- [x] Implement account recovery and password setup
- [ ] Verify email-link password setup and imported account access (blocked: user exports and user email interaction)
- [ ] Verify admin editor writes (blocked: no migrated admin identity/role)
- [ ] Import previous records and users (blocked: previous-project CSV/JSON exports not provided)
- [ ] Restore previous uploaded file bytes (blocked: previous-project file export not provided)

## Gang System 1.0
- [x] Adapt all 8 uploaded character sheets to the existing modular frame grid
- [x] Fix Phaser bundling regression and verify the existing playable world
- [x] Gangs: create, invite, accept/reject, kick, promote, transfer, leave, disband (max 30)
- [x] Alliances (max 6) + realtime
- [x] 8 unique bases (25 HP), exclusive ownership, Frontier region
- [x] Multi-room interiors with doors
- [x] Capture zone ticks (1 HP / 3 s, contested, repair)
- [x] Respawn rooms + protection + preferred base
- [x] Combat (server-validated range, walls, cooldown, friendly fire) + weapons
- [x] Inventory (weapons / equipment / items)
- [x] Global / Gang / Alliance chat with anti-spam + moderation
- [x] Daily + total gang hours rankings (hs)
- [ ] Two-player combat test (needs a second test account)

## Uploaded art integration
- [x] Apply uploaded atlas to world tiles without changing collisions
- [x] Add built-in animated hat and melee skins to characters and wardrobe
- [x] Persist player-owned body, head, hat and melee uploads with previews
- [x] Verify base reports/ticks, uploads and mobile rendering in the live game
