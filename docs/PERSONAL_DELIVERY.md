# Personal Samsung delivery

Build a private personal WGT with the existing Samsung author and application
identity. Use an in-place update and rollback only after establishing the
installed author's identity. See [the baseline](PERSONAL_BASELINE.md),
[guide operations](PERSONAL_GUIDE.md), and the approved spec at
`../../kinotv/docs/specs/en-tvplayer-personal-fork.md`.

## Prepare the existing signing identity

The saved settings at `../../kinotv/tizen/.signing/settings.json` select TV
`192.168.1.129` and profile `KinoTV`. The installed SDK profile is in
`~/tizen-studio-data/profile/profiles.xml`; it references the existing
`~/SamsungCertificate/KinoTV/author.p12` and `distributor.p12`. Read those files
privately. Never print profile passwords or generate a replacement author.

The recovered original Samsung-signed package is
`/var/folders/nr/0qk2bwcd7vxbk9wj6rc735wr0000gp/T/opencode/en-tvplayer-v3.2.0.uRP3Hp/ENPlayer.wgt`.
It contains `author-signature.xml` and `signature1.xml`. The repository's v3.2.0
release has only the upstream `signature.xml`; use the recovered Samsung-signed
package for the private rollback candidate.

Compare these nonsecret identities before any installation:

- Application: `IPTVPlayer.IPTV`; package: `IPTVPlayer`.
- Widget: `https://iptvplayer`.
- Author certificate SHA-256:
  `9fb0ef9be9e9ca92df7458bbdc88b16dfa3ebbaf9858111054c4baaca78541ec`.
- Distributor certificate SHA-256:
  `e6b8796b9c289e13905c8fc8b1f27f33dd15d1bdc4bb689bfff18b4c364ebe4f`.
- Original Samsung-signed package SHA-256:
  `896b977fa9c510ebe44f4cd91da98aded13b98795da1ee5ba87ed529cfef78d0`.

Both certificates expire on November 4, 2027 (author at 22:58:26 UTC,
distributor at 23:00:32 UTC). Renew through Samsung Certificate Manager using
the existing author identity and the target TV's DUID. Recheck fingerprints,
device authorization, and update compatibility before using renewed material.
Keep an encrypted off-machine backup of the author and profile credentials.

## Snapshot and build

The tooling writes under ignored `beta/personal-delivery/` with private
permissions. Snapshots contain complete local storage, including credentials.
Keep this directory private; don't attach snapshots, signing backups, or logs
to an issue. The scripts print only counts, IDs, fingerprints, and paths.

Run these commands from the repository root:

```sh
~/tizen-studio/tools/sdb connect 192.168.1.129:26101
~/tizen-studio/tools/sdb devices
~/tizen-studio/tools/sdb -s 192.168.1.129:26101 shell 0 applist
~/tizen-studio/tools/sdb -s 192.168.1.129:26101 shell 0 debug IPTVPlayer.IPTV
# Use the debugger port reported above. Labels cannot overwrite snapshots.
/usr/bin/python3 scripts/personal-tv.py 192.168.1.129 DEBUG_PORT before
/usr/bin/python3 scripts/personal-package.py /private/path/ENPlayer.wgt KinoTV
npm run test:e2e
python3 -m unittest discover -s guide -v
npx prettier --check docs/PERSONAL_DELIVERY.md
```

The packager runs test, lint, and build, stages the current feature tree,
converts browser asset paths to widget-relative paths, and calls the existing
Tizen CLI profile. It checks the original and new package's author certificate
and IDs, preserves `original-v3.2.0.wgt`, and records source/package SHA-256 plus
HEAD in a per-build `manifest.json`. It stops if feature sources change during
the build. Packaging does not establish the installed author's identity.

This is a repeatable source build, not a byte-identical signing guarantee:
signature timestamps and archive metadata can vary. The source digest covers
the player inputs, root lockfile/version, Tizen config, and icon. Parent fixes
require a new build and relevant checks; select the new manifest explicitly.
Don't invoke the upstream package generator or release script for this flow.

## Establish the installation gate

The preparation snapshot observes one playlist, 347 channels, active index 0,
four storage keys, and native AVPlay `NONE` at time 0. The TV is a
`TQ65Q60CAUXXC`, reports Tizen 9.0, and exposes Chromium 120 debugging.
The page reports hidden visibility. These observations aren't playback proof.

Installation provenance is verified from the earlier OpenCode tool records in
session `ses_e4a79c465ffedc00xJomaaDMsE`. At November 7, 2026, 10:34:34 UTC,
record `prt_1b593096e001YKHwN5Vrvqlvkc` packages the recovered widget with
`KinoTV`. At 10:35:12 UTC, record `prt_1b5939cb1001Jz0gGJ6wClrJWy` copies
the signed package to `ENPlayer.wgt` and installs that file from the recovered
directory onto `192.168.1.129:26101`. Its output confirms
`app_id[IPTVPlayer.IPTV] install completed` and successful installation.
Both recovered signed filenames have the original SHA-256 above. The author
matches the existing profile and personal build. A sanitized evidence record
is preserved privately at `beta/personal-delivery/provenance.json`.

Direct installed-certificate inspection remains unavailable:
`tizen.application.getAppCerts()` returns `SecurityError` without the partner
certificate privilege, and candidate SDB certificate pulls fail. The historical
successful installation record establishes the identity without changing TV
privileges or relying on user recollection.

After the identity gate and parent review, use the exact manifest artifact:

```sh
~/tizen-studio/tools/ide/bin/tizen install -n personal-v3.2.0.wgt -s 192.168.1.129:26101 -- /private/path/to/build
~/tizen-studio/tools/sdb -s 192.168.1.129:26101 shell 0 debug IPTVPlayer.IPTV
/usr/bin/python3 scripts/personal-tv.py 192.168.1.129 NEW_PORT after-update
/usr/bin/python3 scripts/personal-tv.py compare beta/personal-delivery/before.json beta/personal-delivery/after-update.json
```

The comparison checks playlist URLs, channel URLs, active source, hidden groups,
proxy configuration, and favourites without printing their values. Automatic
playlist refresh can legitimately change channels; inspect differences privately.
Snapshot the personal build again before rollback to establish favourite
persistence. Install `original-v3.2.0.wgt` from the private directory with the
same command, snapshot and compare, then reinstall the latest reviewed personal
WGT and compare again. Never uninstall or clear storage. Same-version rollback
acceptance remains a device check; stop on rejection without erasing the app.

The actual in-place cycle passed: personal update, original signed v3.2.0
rollback, and final personal reinstall. Each CLI command returned success for
`IPTVPlayer.IPTV`. Private snapshots `before-install.json`, `after-update.json`,
`after-rollback.json`, and `after-final.json` retain the playlist URLs, all 347
channel URLs, active source, hidden groups, and proxy settings. Favourites were
empty throughout; nonempty favourite persistence still needs verification.
Install logs remain private under `beta/personal-delivery/`.

The final installed artifact is
`beta/personal-delivery/1794076957103294000/personal-v3.2.0.wgt`, SHA-256
`0bb83ab7bdc664b348c9a2ed87d25353f95c6109cdf44e4fff44d60058f82d70`.
Its source digest matched the current feature tree immediately before final
installation. The TV debugger exposes the personal title and its packaged
hashed application script. Native AVPlay remains `NONE`, time 0, with hidden
page visibility; update success does not establish picture/audio or remote/IME
behavior. Open the installed personal app on the TV for human verification.

An independent launch attempt through SDB `execute`, Tizen CLI `run`, and
`tizen.application.launch()` succeeds at the process level, but the TV's
read-only device endpoint reports `PowerState: standby`. Its application
endpoint reports `running: true, visible: false`; the debugger reports hidden
visibility and native AVPlay `NONE`. The final signed artifact still matches
the current source digest and the SHA-256 above. Turn on the TV and open the
personal app before continuing public remote-equivalent dispatch. Playback,
nonempty favourite update/rollback persistence, and guide-failure playback
checks were not attempted against the hidden standby page. No test favourite
was added and no extra signed installation cycle occurred in this pass.

After the TV was powered on, the page became visible. Public dispatched
arrow/OK events selected the known Eurosport HD row. Native AVPlay reached
`PLAYING`, advancing from 30,707 to 42,925 milliseconds; the selected stream's
host remained the Contabo gateway. A single exact favourite was added through
the row's Actions menu. Private snapshots confirm the same nonempty favourite
identity survived a signed personal update, original v3.2.0 rollback, and final
personal reinstall, alongside the playlist and all 347 cached channel URLs.
The test favourite was then removed through the same public menu, restoring
the initially empty list. No uninstall or storage clearing occurred.

Dispatched navigation reached 13 schedule rows, description selection,
programme details, discovery filters, both Search modes, result/query movement,
and Back paths. Live guide responses reported stale data. A debugger
`Network.setBlockedURLs` rule blocked only
`*://161.97.164.253/en-guide/v1/*`; the schedule reported offline while retaining
its 13 cached rows. Native AVPlay remained `PLAYING` and advanced from 46,972
to 58,551 milliseconds. The rule was cleared and the Network domain disabled
in cleanup. No gateway service was interrupted.

The final visible app is playing Eurosport HD: the final private snapshot
records `PLAYING` at 118,659 milliseconds, one playlist, 347 gateway-owned
top-level channels, active source 0, and zero favourites. The discovery filter
was returned to All. The installed final WGT still matches current sources.
These are native API and synthetic dispatch observations, not physical remote,
Samsung IME, audible sound, visible picture, complete dependent-media routing,
or extended match-length confirmation. Automation exercised an explicit Watch
while exploring details, then reselected Eurosport HD through Channels.

## Hardware acceptance

After the installed build's playback and physical remote/Samsung keyboard checks
were requested, the user confirmed that it "works perfectly" and authorized
committing and pushing the feature branch. This records human acceptance of the
delivered app alongside the native playback, guide-failure, and signed
favourite-persistence evidence above. A complete match-length session and
dependent-media network audit aren't separately measured by these checks.

Use the [Samsung IME checklist](PERSONAL_GUIDE.md#samsung-ime-hardware-checklist)
and record human outcomes before closing `kinotv-nsn.6`:

- Confirm visible picture and audible sound, channel switching, alternate
  quality/language, and an extended match-length playback session.
- Confirm remote-only rail, both searches, exact favourites, filters, details,
  future schedule, explicit Watch, and Back/focus restoration.
- Confirm native keyboard composition, Unicode/spaces, deletion, caret arrows,
  completion, no-result handling, and repeated Samsung Back.
- Inspect `webapis.avplay.getState()` and advancing `getCurrentTime()` on the TV;
  `PLAYING` and an advancing timer supplement human picture/audio confirmation.
- Verify guide errors/refresh during playback without tuning or interruption.
  If debugger request interception is available, fail only guide requests for
  this check, then remove interception. Don't interrupt the media service.
- Verify cached stream URLs and actual dependent manifests, segments, keys,
  audio, subtitles, and redirects remain gateway-owned. Top-level URL counts
  and browser Shaka handoff tests don't prove native AVPlay network routing.
- Verify retained settings after update, rollback, and personal reinstall.

## Gateway maintenance

The gateway, TLS renewal, and optional guide service run independently. Check
health without displaying private configuration or authenticated request URLs:

```sh
ssh contabo 'systemctl is-active en-guide mediaflow-proxy nginx obsidian-hermes'
ssh contabo 'systemctl list-timers mediaflow-cert-renew.timer --no-pager'
curl --fail --silent --output /dev/null https://161.97.164.253/health
curl --silent --output /dev/null --write-out '%{http_code}\n' https://161.97.164.253/en-guide/v1/current
```

Health currently returns 200 and unauthenticated guide access returns 403.
SSH currently fails because the key agent refuses signing; unlock/authorize the
existing Contabo key to verify service/timer state. Avoid service logs that can
contain URLs. TLS uses `/etc/letsencrypt/live/mediaflow-ip/` and the twice-daily
`mediaflow-cert-renew.timer`. Check the unit privately before a manual renewal;
retain its existing webroot challenge and Nginx reload procedure.

Replace `/var/lib/mediaflow/source.m3u8` privately, keeping the prior copy with
root-only permissions. Run the existing generator with output captured in a
private root-only log:
`python3 /var/lib/mediaflow/mediaflow-configure.py`. It rebuilds
`/var/lib/mediaflow-playlist/channels.m3u8`, retains the guide advertisement,
and refreshes `/var/lib/en-guide/source.m3u8`. Restart only `en-guide` if an
immediate guide refresh is needed; normal refresh is hourly with atomic
last-good retention. The TV playlist refresh doesn't update the provider file.

Retrieve gateway credentials only from `/etc/mediaflow.env` and
`/var/lib/mediaflow/connection.json`; guide secrets are in `/etc/en-guide.env`
and `/etc/en-guide-advertisement.json`. Keep root-only permissions. Secret
rotation requires updating shared authentication and regenerating advertised
URLs together, then privately updating the TV source. Exact favourites exclude
known gateway secrets, but verify their persistence after rotation.

Guide deployment rollback uses `/var/backups/en-guide/1794074477/`: stop/disable
only `en-guide`, restore the generator, HTTPS site, generated playlist, and
connection file to their documented original paths, run `nginx -t`, and reload
Nginx. See [guide operations](PERSONAL_GUIDE.md#contabo-operation) for the paths.
Keep the gateway and Hermes running. This server rollback is separate from the
signed TV-app rollback above.
