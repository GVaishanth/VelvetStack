# Velvet Stack — Texas Hold'em

A complete, responsive poker web app that runs entirely in the browser. Velvet Stack is intentionally built without a framework, backend, database, or build step so it can be deployed directly to GitHub Pages.

![Static site](https://img.shields.io/badge/deployment-GitHub%20Pages-222?logo=github) ![No build](https://img.shields.io/badge/build-none-5f9) ![License](https://img.shields.io/badge/license-MIT-blue)

## Live features

- **Solo table:** play Texas Hold'em against bot opponents with Casual, Sharp, and Pro difficulty levels. Meld House and Color Clash also offer Turbo or Realistic bot speed.
- **Local multiplayer:** physical-deck dealer mode for 2–8 people. The app never deals or displays hole-card values; use your real deck, while Velvet Stack manages turns, blinds, pot, betting, and showdown winner selection.
- **Online room:** host a private six-character room and invite friends with a code.
- **Responsive table:** works on desktop, tablet, and mobile layouts.
- **Texas Hold'em flow:** cut deck → deal privately → pre-flop → open flop → turn → river → showdown. Local mode uses guided dealer pop-ups for cutting, dealing, and opening each board street.
- **Table rules:** dealer button and blinds rotate each hand, folded players are excluded from bet calculations, all-in stacks cannot make further actions, and the local dealer confirms each board opening with **Open next cards**.
- **Table management:** use the Players page to add or remove local players between hands; use the dedicated Showdown page to choose the physical-deck winner. After a local winner is selected, the table waits 5 seconds silently, then shows a 5-second restart countdown.
- **Undo:** Solo supports multiple human-action undos and reshuffles its remaining digital deck; Local supports multiple dealer/player undos while preserving the physical deck order.
- **Table controls:** fold, check, call, raise, new hand, copy room code, and keyboard shortcuts.
- **No account:** no sign-in, player profile, or server-side data is required.
- **Installable metadata:** includes a web app manifest for supported browsers.

## Quick start

Open `index.html` in a browser. The solo and local modes work without a network connection or server.

For the best local development experience, serve the folder over HTTP:

```bash
python3 -m http.server 8000
```

Then open [http://localhost:8000](http://localhost:8000).

## Deploy on GitHub Pages

### Option A: GitHub website

1. Create a new GitHub repository.
2. Upload the complete project folder, including `index.html`, `home.css`, `home.js`, `poker.html`, `styles.css`, `app.js`, `game.html`, `game.css`, `game.js`, `manifest.webmanifest`, and `.nojekyll`.
3. Open **Settings → Pages**.
4. Under **Build and deployment**, select **Deploy from a branch**.
5. Select the `main` branch and the `/ (root)` folder, then press **Save**.
6. Wait for GitHub to publish the site and open the generated URL.

### Option B: Git command line

```bash
git init
git add .
git commit -m "Create Velvet Stack poker app"
git branch -M main
git remote add origin https://github.com/YOUR_NAME/YOUR_REPO.git
git push -u origin main
```

Then enable Pages using the steps above. The site does not need npm, a bundler, or a build command.

## Online multiplayer notes

Online rooms use [PeerJS](https://peerjs.com/) loaded from its public browser CDN. The host creates a short room ID and acts as the table authority; a joining browser connects directly to that host and sends actions back to it.

- Both players must use the published **HTTPS** GitHub Pages URL.
- The host should keep the tab open while the room is being played.
- The room is temporary and disappears when the host closes the page.
- The public PeerJS signaling service is used only to help browsers find one another. For a production product, use a pinned/self-hosted PeerJS server or your own signaling service.
- The current static implementation is designed for casual play, not competitive or real-money gaming. Do not use it for gambling or sensitive information.

If PeerJS is unavailable, solo and local modes remain usable; choose **Local multiplayer** as the fallback.

## Controls

| Action | Mouse / touch | Keyboard |
|---|---|---|
| Fold | Fold button | `F` |
| Check | Check button | `C` |
| Call | Call button | `Enter` |
| Raise | Raise → choose amount | — |

## Project structure

```text
.
├── index.html             # Velvet Stack game library home
├── home.css / home.js     # Animated game library UI
├── poker.html             # Poker table app (legacy poker code preserved)
├── styles.css             # Poker table visual system
├── app.js                 # Poker deck, hand state, bot logic, UI, and PeerJS room logic
├── game.html              # Shared shell for Rummy and UNO
├── game.css / game.js     # Shared non-poker card game UI and engines
├── manifest.webmanifest   # Optional installable web-app metadata
├── .nojekyll              # Prevents GitHub Pages Jekyll processing
└── README.md              # This guide
```

## Technical design

- **Deck:** one standard 52-card deck, shuffled in the client with `Math.random()` for casual play.
- **State:** a small in-memory game object tracks players, chips, bets, community cards, street, turn, and pot.
- **Rendering:** DOM updates are handled with vanilla JavaScript; there are no runtime framework dependencies.
- **Styling:** CSS custom properties define the dark green felt visual system, with responsive breakpoints for small screens.
- **External dependency:** PeerJS is only needed for online mode and is loaded from `https://unpkg.com/peerjs@1.5.2/dist/peerjs.min.js`.

## Customization

Useful places to customize:

- Change colors and spacing in `:root` inside `styles.css`.
- Change bot names, starting chips, and player count in `app.js`.
- Change the room title and lobby copy in `index.html`.
- Pin a local PeerJS build if your deployment must avoid third-party CDNs.

## Quality checklist

Before publishing changes:

```bash
node --check app.js
python3 -m http.server 8000
```

Then test:

- Solo game through showdown.
- Local game with at least two names.
- Host and join flows in two browser tabs.
- Mobile layout at a narrow viewport.
- GitHub Pages URL over HTTPS for online mode.

## License

MIT — use, modify, and build on it freely. Add a formal `LICENSE` file if you publish a fork.
