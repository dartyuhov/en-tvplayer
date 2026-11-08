# Familiar navigation and exact favourites

The personal fork provides **On now**, **Search**, **Favourites**, **Channels**,
and **Settings** in the approved Familiar rail. Charcoal panels, coral selected
navigation, and a separate white focus outline follow the approved sample.
**On now** shows current guide cards and individually playable unknown channels.
**Search** offers channel names and current programme titles; see
[search interaction](PERSONAL_GUIDE.md#search-and-keyboard-interaction).

## Remote interaction

Use these controls to browse and save streams:

- From playback, press **Left** or **OK** to reopen browsing at its saved focus.
- Press **Left** from a row to reach the rail. **Up/Down** chooses a destination;
  **OK/Right** opens it.
- In **Channels**, press **Up** from the first row to reach the group selector.
- In **Search**, use **Up** from the query to choose a mode. **OK** activates
  query entry, and **Down** reaches results. **Up** from the first result returns
  to the query. Programme results open details before explicit **Watch**.
- Press **Right** on a channel, search result, or favourite to open **Actions**.
  **OK** adds/removes that exact stream without tuning. **Back/Left** restores
  the row. Removing the last available favourite restores rail focus.
- Press **OK** on a row to watch that version. **Back** returns to playback.
- From playback, press **Right** for the existing quality/audio/action menu.
  **Add to favourites/Remove favourite** operates directly and keeps menu focus.
  **Programme guide** opens today's local schedule and selected descriptions.

Samsung IME, picture/audio, AVPlay, and installed-update persistence still need
hardware verification. Browser acceptance observes app playback handoff and
checks that favourite actions don't load, pause, unload, or destroy playback.

## Identity and persistence

Each saved playlist has a persisted `localId` in the existing `en_settings`
record. Existing playlists acquire IDs on first read; edits retain them. New
playlists receive independent IDs even when their URLs are identical.

`en_favourites_v1` stores an ordered array of identities, each a JSON tuple of
playlist ID and canonical upstream URL. Recognized MediaFlow HLS/MPD/stream
wrappers unwrap their `d` destination, dropping transport secrets. Canonical
upstream URLs ignore only `token`, `auth_token`, `access_token`, `expires`,
`expiry`, `signature`, `sig`, and the known CDN tokens `__hdnea__`, `hdnea`,
`hdntl`, and `hdnts`, case-insensitively. Query order is normalized;
quality, language, unknown selectors, hostname, and path remain significant.
An ordinary provider URL's `api_password` or `d` is retained.

Favourites use exact stream identity, never guide ID or display-name matching.
Rows show only saved identities found among the active playlist's visible
channels. Missing and hidden entries remain stored, retaining their position
when they return. Adding an existing favourite cannot duplicate it; removing
and re-adding moves it to the end. A storage write failure reports an error.

## Integration boundaries for subsequent tickets

Use the small modules rather than extending the oversized legacy UI:

- `player/src/browse.js`: navigation, per-screen positions, group state,
  bounded 30-row rendering, refresh identity matching, and remote dispatch.
- `player/src/browse-view.js` and `familiar.css`: Familiar shell and row visuals.
- `player/src/channel-actions.js`: focused-stream panel and return callback.
- `player/src/playing-actions.js`: playing-channel actions and menu dispatch.
- `player/src/favourites.js`: ordered storage and exact favourite membership.
- `player/src/logic.js`: pure stream and playlist-namespaced identity helpers.
- `player/src/search.js`: both search modes, query/results focus, and lifecycle.

Selected-channel guide networking and deployment are documented in
[personal guide](PERSONAL_GUIDE.md). The parser now retains guide IDs/names and
the advertised endpoint. Guide requests stay independent of native playback.

Discovery uses `favouriteChannels()` order for exact-version preference. Its
**Favourites** filter admits cards with a visible saved version; details retain
all visible versions of the exact guide ID. Hidden and missing saved streams
remain stored. See [discovery integration](PERSONAL_GUIDE.md#discovery-and-details)
for programme-search reuse; channel search already spans all visible groups.

## Acceptance checks

Run `npm test`, `npm run lint`, `npm run build`, and `npm run test:e2e` from the
fork root. The browser suite uses fictional loopback sources and public remote
flows; it doesn't seed settings or call app internals. It covers exact variants,
saved order, search stars, focus restoration, empty states, long/windowed lists,
group selection, playing actions, reload, refresh, secret/token rotation,
missing-stream return, and identical-URL separate playlists. Pure tests cover
identity selectors and playlist namespaces. See [baseline setup](PERSONAL_BASELINE.md)
for dependencies, fixture ports, and the external playback-mock boundary.
