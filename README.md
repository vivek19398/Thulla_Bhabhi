# Bhabhi / Tulla · The family table

Online private-hand card game for 3–8 people. Create a named table, share its eight-character code or invite link, and join from separate phones. Everyone marks ready; the host shuffles and deals. Pass-and-play has been removed. There are no computer players in online rooms.

## Deploy to Vercel

Import `vivek19398/Thulla_Bhabhi`. Leave Root Directory at `./`; framework Other, build `npm run build`, output `dist` (included in `vercel.json`). Node 22 or newer is required.

In the project Storage tab create a **private Vercel Blob store**, connect it to Production (and Preview if desired), then redeploy. The SDK uses the connected store's OIDC environment variables when available, otherwise `BLOB_READ_WRITE_TOKEN`. Never put storage credentials in frontend code or Git. No Supabase, SQL setup or database is used.

After deployment open the URL, enter a player and table name, create the table and copy the invite. At least three people join on separate devices, mark ready, and the host deals. Clearing browser storage loses your seat; use the same browser to reconnect. A host who loses their seat needs to create a new table.

## JSON saves and replacement

Creating a new table deletes all older game-table JSON files (`tables/XXXXXXXX.json`) from the connected store, including active games. Only saves listed before the new table is created are removed; tables created concurrently after that snapshot are preserved. Unrelated Blob files are untouched. The new save must succeed before cleanup runs. A cleanup failure is reported as a storage error; a fresh file may already exist in that case.


The server stores one private file per table code: `tables/CODE.json`. Its contents include the display name, members, hashed seat tokens, current game, version and recent command receipts. Display names are not unique identifiers: table codes identify the saves. With automatic cleanup enabled, creating a new table replaces older tables.

Every accepted move replaces the same file. The host can return everyone to the lobby (with an in-game confirmation); readiness resets and dealing starts a fresh game in the same file with the same seats and code. No game archive is created. Host reset is also the recovery path for an abandoned game. Seats cannot be removed or substituted in this release.

Reads bypass Blob caches. Writes use the last read ETag to prevent concurrent updates overwriting one another. The server validates turns and legal cards, cryptographically shuffles, and returns only the caller's hand, public counts/tricks and legal moves. Seat tokens stay in the browser; only hashes are stored server-side. A table code allows someone to join the lobby, but does not grant access to existing private hands. No account or family password is required: share invitations privately. Use Vercel's firewall/rate controls for public traffic or abuse prevention.

Clients poll every 1.8 seconds while visible and stop when hidden. Storage requests and server functions incur Vercel usage; JSON storage is not guaranteed faster than a database. A disconnected player keeps their seat and the game waits for their turn. Internet is required for online play. A failed/conflicting request is shown without applying it twice; refresh and retry if a move is uncertain.

## Development

With Node 22+ and pnpm: `pnpm install`, `pnpm dev`, then http://localhost:3032. Without Blob credentials local development uses `.data/CODE.json` files, saved atomically and ignored by Git. Keep the host running to share the local server with devices on its Wi-Fi. Production always uses private Blob, never ephemeral Vercel disk storage. `node --env-file-if-exists=.env.local dev.mjs` loads a local Blob token if desired.

`pnpm test` runs engine, privacy, authorization, concurrency, retry, reset, persistence and storage-adapter checks. `pnpm build` creates `dist`. Live Blob and multi-device production verification require the connected Vercel project and store; mocked storage checks do not provision or verify that infrastructure.

## Rules and artwork

Reference: https://www.pagat.com/inflation/getaway.html . User reference: https://boardgamegeek.com/thread/471299/the-perfect-card-game (direct access blocked).

Clockwise, 52 cards, aces high. Opening trick always discards. A later off-suit Tulla stops the trick: highest led-suit player picks up and leads. An empty highest player draws from previous waste and must lead it. Other empty players escape after trick resolution. A Tulla against a forced drawn lead in the final duel settles the game. Taking the next active hand is available to the leader before normal tricks. No trumps or formal scoring.

Generated emblem: `public/assets/bhabhi-tulla-logo.png`, created with the built-in image generator; prompt in `docs/logo-prompt.txt`. Mobile layout includes touch controls and responsive card grids. No remote artwork, fonts or audio assets load during play.
