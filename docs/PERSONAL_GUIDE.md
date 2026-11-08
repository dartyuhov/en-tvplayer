# Selected-channel guide

The personal fork reads small JSON guide responses from an advertised playlist
endpoint. It shows now/next briefly after tuning and today's schedule through
**Programme guide** in playing or focused-channel actions. Guide requests never
control the playback engine.

## Remote interaction

Open the playing menu with **Right**, choose **Programme guide**, and press
**OK**. **Up/Down** selects schedule rows and displays their descriptions.
**OK** displays details without tuning. Current rows have a coral edge; remote
focus has a white outline. Future rows have no Watch action. **Back** restores
the originating menu button or channel-action button, then the saved browse row.

The schedule uses local calendar midnights and local display times, including
daylight-saving changes. Missing guide IDs, no listings today, stale data, and
offline requests have distinct messages. Cached responses are retained on network
failure; late responses cannot replace a newer screen or channel selection.

## HTTP contract

The generated M3U header advertises `en-guide-url`. Each parsed channel retains
`guideId`, `guideName`, and `guideUrl`; `EXTGRP` supplies the group when no
`group-title` is present. Exact favourites continue to use stream identities.

The deployed base path is `/en-guide/v1`. Use its existing `api_password` query
authentication on both resources. The service also accepts a Bearer token.
Unauthenticated requests return 403. Unsupported paths and arbitrary upstream
parameters return 404; provider destinations never come from API requests.

- `GET current` returns `channels`, each with `guideId`, `status`, `current`,
  and `next`. Listings contain `title`, `description`, `start`, and `end`.
  Instants are UTC ISO 8601 strings; intervals include start and exclude end.
  Statuses are `ok`, `no_current`, `no_listings`, and `no_matching_id`.
- `GET schedule?id=…&from=…&to=…` returns `guideId`, `status`, and `listings`
  overlapping the requested absolute interval. Supply timezone-aware instants;
  requests longer than 48 hours return 400. Missing listings return 200 with an
  explicit status. An absent cache returns `unavailable`.
- Both resources include `version: 1`, `updatedAt`, `ageSeconds`, `stale`, and
  `cacheStatus` (`fresh`, `stale`, or `unavailable`). Data older than two hours
  is stale. An absent cache has null update time and age, and is stale.

The client shares in-flight requests and caches responses for 30 seconds. Requests
time out after eight seconds. Current programme highlighting is recalculated
from local instants. It does not poll while playback overlays are hidden.

## Contabo operation

The isolated service is deployed alongside the existing gateway. Its source,
systemd unit, Nginx location, reproducible installer, and HTTP tests live in
[`guide/`](../guide/). The service uses only Python's standard library.

- Service: `en-guide.service`, user/group `en-guide`, loopback port 8890.
- Code: `/opt/en-guide/service.py` and `/opt/en-guide/xmltv.py`.
- Private environment: `/etc/en-guide.env`, root-only, mode 0600.
- Private advertisement: `/etc/en-guide-advertisement.json`, root-only.
- Cache and source snapshot: `/var/lib/en-guide/`, mode 0700.
- Nginx include: `/etc/nginx/en-guide-location.conf` in the existing HTTPS site.
- Rollback backup: `/var/backups/en-guide/1794074477/`.

The installer reads the configured provider XMLTV address from the existing
`/var/lib/mediaflow/source.m3u8` header. It copies a private readable snapshot
for the unprivileged service. The targeted generator helper refreshes this
snapshot and adds only the namespaced advertisement. The generator's HTTPS
template retains the static Nginx include after regeneration.

The importer stream-decompresses gzip and removes processed XMLTV elements.
It keeps playlist-matching IDs for yesterday, today, and the next two UTC days.
It refreshes hourly with single-flight exclusion, a 120-second import deadline,
15-second socket timeout, and 512 MiB decompressed-input ceiling. Memory and CPU
are bounded by systemd. A failed, truncated, or empty import retains the previous
cache. Successful imports fsync a temporary file and atomically replace it.
HTTP and provider-error logs are disabled; credentials stay on the server.

Check health without exposing authentication:

```sh
ssh contabo 'systemctl is-active en-guide mediaflow-proxy nginx obsidian-hermes'
curl --fail https://161.97.164.253/health
```

Retrieve connection details privately from the existing server files. Don't print
the playlist header, source URLs, private environment, or authenticated URLs.
To update code, upload reviewed files and install them into `/opt/en-guide`, then
restart only `en-guide`. The installer rejects an already configured server to
avoid replacing rollback history accidentally.

To roll back this deployment, stop/disable `en-guide`, restore
`mediaflow-configure.py`, `mediaflow`, `channels.m3u8`, and `connection.json` from
the backup to their original paths, run `nginx -t`, and reload Nginx. The backed-up
generator restores normal future playlist regeneration. The original gateway
and Hermes services remain active throughout.

## Checks and integration

Run `npm test`, `npm run lint`, `npm run build`, `npm run test:e2e`, and
`python3 -m unittest discover -s guide -v`. Format only touched files. Fixtures
use fictional gzip XMLTV, authentication, duplicate guide IDs, midnight offsets,
freshness, interrupted refresh, single-flight, and atomic retention. Browser
tests cover overlay dismissal, schedule focus/details, missing/stale/offline
states, late responses, Back restoration, and unchanged playback controls.

## Discovery and details

**On now** renders three-column current-programme cards with real titles, local
times, elapsed progress, next listings, and channel-branded fallbacks. Unknown
streams appear individually below known cards. **All**, **Sports**, and
**Favourites** use visible channels; Sports matches the provider's exact `Sports`
group. The last filter persists in `en_settings.discoveryFilter`.

Press **Down** from a filter to reach cards. **Left/Right** moves across card
columns; **Up/Down** moves between rows. **Left** from the first column reaches
the rail. **OK** opens details with **Watch** focused; another **OK** tunes only
the selected gateway stream. **Up** reaches versions, **Left/Right** chooses a
version, and **Down** returns to Watch. **Right** from Watch reaches today's
schedule. Select schedule rows for descriptions; future and finished entries
have no Watch action. **Back** restores the originating card and filter.

Details prefer exact favourites in saved order, then the last-used version for
that playlist/guide ID, then provider order. `en_settings.lastGuideVersions`
retains last-used gateway URLs; matching uses canonical exact stream identity,
including quality and language. Guide requests remain separate from playback.

The discovery controller requests current summaries on entry and every 30
seconds while visible. It recalculates expiry/progress locally each second,
suspends requests behind details or another screen, and ignores obsolete
responses. The shared client retains its 30-second cache and eight-second
timeout. Details expire Watch locally, independently of network responses.

Search reuses these boundaries:

- `logic.js`: `discoveryGroups(visibleChannels, data, filter, orderedFavourites,
now)` returns known exact-ID groups followed by individual unknown streams.
  Filter title-search results to groups with a current programme and match only
  `current.title`. Details' versions retain the full visible exact-ID group.
- `programme-details.js`: `open(group, data, visibleChannels, onWatch, onClose)`
  and `handle(action)` provide version preference, explicit Watch, local daily
  schedule, and return callbacks. The caller closes its browsing surface when
  `onWatch(channel)` hands off that exact channel. Dispatch details before browse
  actions, and suspend summary polling while details are open.
- `discovery.js` and `discovery-view.js`: lifecycle and filter/card rendering.
  Reuse `en_settings.discoveryFilter` and `FILTERS` for the same discovery scope.
- `guide-client.js`: shared `requestGuide(channel, 'current')` and schedule
  caching. `guide-format.js` supplies local `guideTime`/`guideTimes`; `logic.js`
  supplies `guideDayRange`, `guideIsCurrent`, `guideProgress`, and `guideState`.
- `stream-preference.js`: playlist-namespaced last-used exact version. Existing
  channel selection records it through `guide-view.selectionChanged`.

Browser acceptance includes remembered filters, hidden groups, ordered exact
favourites, quality/language gateway handoff, three-column and 30-item windows,
future descriptions, local expiry, loading/missing/stale/offline states, late
responses, and Back focus. Screenshots are written under `test-results/` at
1920 by 1080. Browser playback evidence observes only the external handoff.

TV signing, installation, native AVPlay picture/audio, Samsung IME, and final
issue closure belong to the parent delivery work.

## Search and keyboard interaction

**Search** exposes **Channels** and **Programmes on now**. Channel names match
across all visible groups, independently of guide availability and discovery
filters. An empty channel query shows visible streams. Stars mark exact saved
versions, and **Right** opens their favourite/guide actions without tuning.

Programme search matches only current titles, with inclusive start and exclusive
end instants. Future, expired, invalid, and unknown listings aren't results.
An empty programme query prompts for a title. Exact guide IDs group versions;
**All**, **Sports**, and **Favourites** share the remembered On now preference.
Missing, loading, stale, and offline guide messages leave channel search usable.

Use the basic remote in this order:

1. Press **Up** from the query to reach mode buttons. Use **Left/Right**, then
   **OK**, to choose a mode. Press **Down** to return to the query.
2. Press **OK** on the query to activate the text input for the Samsung keyboard.
   **Left/Right** retains text-caret behavior while editing. Desktop Backspace
   deletes text; Samsung Back/10009 dismisses input to the Search rail.
3. Press **Down** from the query to reach results. With no results, query focus
   remains available. **Up** from the first row returns to the query, read-only
   until another **OK**, so navigation doesn't reopen the keyboard.
4. For programme filters, use **Up** from mode buttons, or **Right** from the
   read-only query. **Left/Right** chooses a filter; **OK** applies it, and
   **Down** reaches results.
5. Press **OK** on a programme result for details. Details reuse favourite,
   last-used, and provider version preference. Only explicit **Watch** tunes.
   **Back** restores the query, filter, and exact result. Long rows wrap within
   a 30-item window; the focused row remains visible below the controls.
6. Press **Back** from results/filters/modes to return to the query, then
   **Back** to the Search rail, then **Back** to playback. The query is retained.

`search.js` owns mode/query/focus, local expiry, visible-only 30-second summary
refresh, and obsolete-response guards. `search-view.js` and `search.css` render
Familiar controls and rows. `logic.js::programmeSearch` delegates exact grouping
and scope to `discoveryGroups`, then matches only the current title.
`browse.js` dispatches details and channel actions before Search. Metadata
requests stop behind details and on exit; channel mode performs no guide polling.

`tests/browser/search.spec.js` and `search-states.spec.js` drive public remote
input, both modes, filters, favourite actions, explicit handoff, focus restoration,
hidden groups, long/windowed rows, expiry, and missing/stale/offline/late metadata.
`player/src/search.test.js` covers exact time and title boundaries. Browser input
and the synthetic public Back/10009 event establish app dispatch only.

## Samsung IME hardware checklist

The parent hardware delivery must run these checks on the installed Samsung app.
Record the TV model/firmware and the observed outcome for each step; browser
evidence doesn't establish native keyboard, AVPlay picture/audio, or signed
update persistence.

- [ ] Reach both mode buttons, query, filters, rows, and details using only
      arrows, **OK**, and **Back**.
- [ ] Confirm **OK** opens the native keyboard on the query and after returning
      from results. Type, replace, and delete text, including spaces and Unicode.
- [ ] Confirm IME suggestions/composition and caret arrows work without accidental
      app navigation or tuning. Confirm keyboard completion and **Down** dismiss
      input and reach results, including empty/no-result queries.
- [ ] Confirm Samsung **Back** dismisses the keyboard/search first, retains text,
      and doesn't exit playback unexpectedly. Check repeated **Back** through
      query, rail, and playback, then reopen Search and activate the keyboard.
- [ ] Open programme details, change quality/language, inspect a future listing,
      and return. Confirm query/filter/result focus; **Watch** must be explicit.
- [ ] Add/remove an exact channel favourite through Search without disturbing
      visible picture/audio. Confirm stale/offline guide behavior during playback.
