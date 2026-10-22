# Live QA — 22 October 2026

Target: https://thullacardgame.vercel.app
Tested deployment commit: 77baed0

## Result

35 live checks passed, zero failed; 62 API requests in the final bounded run, plus four static asset checks. Successful API requests: median 235 ms, p95 582 ms, maximum 983 ms. These are request durations from one testing connection, not global benchmarks or a capacity guarantee. Six simultaneous reads and two competing writes were tested. Visible clients poll every 1.8 seconds, so remote turn updates also wait for the next poll.

18 local automated tests passed. A deterministic stress run completed 600 games across 3–8 players, 53,620 moves, maximum 182 moves per game, in 1.723 seconds. Every move checked card conservation, uniqueness, legal-move availability and escaped-player invariants. Every game completed.

## Live coverage

Static HTML/JS/CSS/logo loading; malformed/null/oversized input; wrong HTTP method; cross-origin rejection; invalid codes and names; persistent table creation; code joining; duplicate names; forged seat tokens; host-only controls; readiness requirements; competing writes; command retry idempotency; deal correctness; private hand responses; cache headers; immediate consistency; late joins; turn enforcement; invalid cards; valid opening card; stale versions; nine accepted moves and trick advancement; six concurrent reads; host reset; eight-seat capacity and ninth-player rejection; reconnect after reset.

## Fixes deployed and verified

- Added support for the dashboard's `BLOB_READ_WRITE_TOKEN_STORE_ID` prefix alongside `BLOB_READ_WRITE_TOKEN`. Initial table creation failed with storage 503s; subsequent live creates succeeded.
- Vercel JSON parser errors now return HTTP 400 rather than a misleading storage 503.
- Blob reads request identity encoding to preserve the ETag used in conditional writes. Initial dealt-game moves failed with false HTTP 409 conflicts; after this change they succeed, while real simultaneous writes still produce one accepted move and one conflict.
- Mobile logo replaced by a 320px WebP: 21,936 bytes instead of 1,520,835 bytes (98.6% smaller). The original PNG source remains available but is no longer referenced by the page.

## Limits

This does not cover every possible edge case. No sustained load, many-room capacity, real mobile devices, adverse network simulation, host-seat recovery after clearing storage, or full live game to completion was tested. Complete games were exercised locally. No public abuse/rate-limit protection was benchmarked. Successful live tests prove the deployed store worked during this run, not ongoing availability.

Test-created QA tables remain in private storage; they are named `QA <timestamp>`. They contain only synthetic player names and cards. No real user table was changed. Final test code: AFC275AC.

Reproduce with `node scripts/live-qa.mjs` (writes a new test table in production) and `node scripts/stress-qa.mjs` (local only). Detailed results are in `live-qa.json` and `stress-qa.json`.
