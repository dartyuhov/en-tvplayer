# Personal baseline

This baseline is the personal fork at
[dartyuhov/en-tvplayer](https://github.com/dartyuhov/en-tvplayer), based on
[Nur-allhi/en-tvplayer](https://github.com/Nur-allhi/en-tvplayer) commit
`959f6ec` (v3.2.0). Work lives on `feature/personal-guide`. The existing
[MIT license and attribution](../LICENSE) remain in place.

## Run locally

Use Node.js 22.12 or newer and npm. From the repository root, install the locked
dependencies and Chromium, then run the baseline checks:

```bash
npm ci
npx playwright install chromium
npm test
npm run lint
npm run build
npm run test:e2e
npx prettier --check package.json package-lock.json eslint.config.mjs playwright.config.js tests/browser player/src/settings.js player/src/update.js player/src/update.test.js player/index.html AGENTS.md README.md CHANGELOG.md docs/PERSONAL_BASELINE.md
```

Run `npm run dev` to open the app at `http://localhost:5173/enplayer/`.
Use your source URL through the app's source picker or Settings. Browser media
support differs from Samsung playback. Provider settings belong in the app's
local storage; keep credentials out of source files, fixtures, and shared logs.

The browser harness owns loopback ports 5183 (Vite) and 5184 (fixtures). It starts
and stops both servers and requires those ports to be free. It doesn't reuse an
existing server, so another checkout cannot silently become the test target.
On Linux CI, use `npx playwright install --with-deps chromium` for browser OS
dependencies.

## Browser acceptance boundary

The acceptance test uses the public app UI at 1920 by 1080. Arrow keys, Enter,
and keyboard text entry drive first-run M3U setup, playlist loading, HD then exact
4K channel selection, reload/resume, and inspection of the saved playlist.
It also checks visible white channel focus and the disabled personal-update
toggle. It doesn't seed playlist settings, call app internals, or click/fill
controls.
Text insertion stands in for keyboard entry; Samsung IME behaviour needs hardware.

The app's real `main.js`, playlist fetch/parser, remote handler, Settings, UI,
and `player.js` run. Playwright intercepts only the external Shaka module and
makes browser media APIs inert. The mock records the URL handed to Shaka's
`Player.load`. This demonstrates app playback handoff, not media decoding,
picture/audio, DRM, or AVPlay state. Unexpected external HTTP requests and
uncaught browser errors fail the check.

`tests/browser/fixture-server.mjs` serves a fictional M3U with two quality
variants sharing a guide ID, a news channel, and namespaced guide metadata.
It also serves `/guide/current` and `/guide/schedule?id=stadium` JSON responses
with realistic relative instants. Selected-channel guide tests exercise the
production contract, descriptions, freshness, and focus restoration. See
[personal guide](PERSONAL_GUIDE.md). No media is served.

Failure traces go to ignored `test-results/`. Open a generated trace with
`npx playwright show-trace <trace.zip>`. Keep traces private when extending
the harness to any real source, because traces can contain UI and HTTP data.
Vitest continues to test DOM-free code only; browser tests live separately.

## App identity and manual updates

The baseline preserves `tizen/config.xml` identity: application
`IPTVPlayer.IPTV`, package `IPTVPlayer`, and widget `https://iptvplayer`.
It also preserves local-storage keys, playlist migration, cached channels,
source selection, and playback routing. Personal labels appear on the boot
screen, browser title, and Settings footer.

Keeping an app ID alone doesn't establish update compatibility. Before packaging
or installing, verify the installed application's actual ID and author
certificate and reuse that exact author identity. The parent signing
investigation must establish whether the available existing Samsung certificate
matches the installed EN TV Player; a KinoTV certificate isn't evidence of that
match. Keep the existing distributor/profile requirements for the target TV.
Back up the original compatible signed v3.2.0 package and author material
privately. Updating or rolling back must use the same verified identity without
uninstalling the app; confirm retained settings on hardware.

This baseline doesn't generate keys, sign, package, install, or verify an update
on a TV. Author keys/certificates and TV-specific signing material stay outside
Git. The existing ignored signing paths remain unchanged. The upstream
`npm run tizen` packager generates a new developer key if its expected files are
missing: use it only after the parent establishes the signing approach and
matching identity. Version numbers aren't
bumped, and no personal release artifact is produced here.

The update module ignores prior upstream consent and cached download links;
it makes no version-check or usage-ping request. Settings describes personal
updates as disabled, and its toggle can't enable them. Playlist auto-refresh
still works independently. Use manual updates only after signing verification.

## Remaining baseline limits

Familiar navigation and exact favourites are documented in
[personal favourites](PERSONAL_FAVOURITES.md). Metadata retention, selected-channel
guide networking, and its isolated service are documented in
[personal guide](PERSONAL_GUIDE.md). On now discovery, version-selection details,
and programme search belong to subsequent tickets.
Large upstream modules receive only targeted baseline fixes; new browser code
files stay below 300 lines. Samsung keyboard input, native playback, signed
update persistence, and rollback require separate hardware verification.
