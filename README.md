# Bhabhi / Tulla · The family table

A standalone browser card game. Run `npm run dev` in this folder and open http://localhost:3032. Run `npm test` for rules tests and `npm run build` to copy the standalone application to `dist/`.

Play with 3–8 seats: one human with computer opponents, or pass-and-play on one device. Hands are hidden between shared-device turns. Games save automatically in this browser. Computers use only their own hand and the current trick. There is no online room service; opening another device creates an independent game.

Rules reference: https://www.pagat.com/inflation/getaway.html . User reference: https://boardgamegeek.com/thread/471299/the-perfect-card-game (direct access was blocked; the Royal BC Museum Paldi educator guide identifies this thread as Bhabi).

Clockwise, 52 cards, aces high. The first trick always discards. Subsequent off-suit cards immediately stop the trick and the highest led-suit player picks up. An empty highest player draws at random from the prior waste and must lead the drawn card. Empty other players escape after trick resolution. A Thulla against a forced drawn lead in the final duel settles the game immediately. Taking the next active hand is offered to the current leader before normal tricks; arbitrary out-of-turn taking is not supported. A fallback draw from the next hand handles custom states with an empty waste. No trumps, scoring, house-rule penalties, accounts or network multiplayer.

All visuals are local CSS and text; no commercial artwork or remote assets. Browser storage must be available for persistence. Computer play pauses when the tab is hidden. No hosted deployment was configured.

## Branding and mobile

Generated emblem: `public/assets/bhabhi-tulla-logo.png`, made with the built-in image generation tool. Prompt in `docs/logo-prompt.txt`. The responsive table uses compact player tiles, 44px controls, five-column card hands (four on narrow phones), safe-area spacing and readable inactive cards.

## Vercel deployment

Import `vivek19398/Thulla_Bhabhi` into Vercel. Leave Root Directory at the repository root (`./`). The included `vercel.json` sets build command `npm run build`, output `dist`, and framework Other.

This initial release supports computer opponents and shared-device play. Named online rooms and private Vercel Blob JSON persistence are planned but not implemented in this release. No Blob token is required for this initial version.
