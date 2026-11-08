// Pure, DOM-free logic for unit testing (Vitest, node env).
// Everything here must stay side-effect free: no localStorage, no
// document, no timers — inputs in, values out. Callers in main.js,
// ui.js and player.js own the module state and the DOM.

export function filterDisplayChannels(allChannels, hiddenGroups, selectedGroup) {
  const hidden = hiddenGroups || [];
  const visible = (allChannels || []).filter((ch) => !hidden.includes((ch && ch.group) || 'Ungrouped'));
  if (selectedGroup === 'all' || !selectedGroup) return visible;
  return visible.filter((ch) => ((ch && ch.group) || 'Ungrouped') === selectedGroup);
}

// Only recognized MediaFlow transport wrappers and documented temporary auth
// selectors are ignored. Provider path, language, quality and unknown queries
// belong to the exact stream, not its programme/guide ID.
export function streamIdentity(raw) {
  let value = String(raw || '').split('|')[0];
  for (let depth = 0; depth < 4; depth++) {
    try {
      const url = new URL(value);
      const wrapped = /^\/(?:proxy\/(?:hls\/manifest\.m3u8|mpd\/manifest\.mpd|stream)|proxy\/hls|proxy\/mpd)\/?$/.test(
        url.pathname,
      );
      const destination = url.searchParams.get('d');
      if (wrapped && destination && /^https?:\/\//i.test(destination)) {
        value = destination;
        continue;
      }
      for (const key of [...url.searchParams.keys()]) {
        if (
          [
            'token',
            'auth_token',
            'access_token',
            'expires',
            'expiry',
            'signature',
            'sig',
            '__hdnea__',
            'hdnea',
            'hdntl',
            'hdnts',
          ].includes(key.toLowerCase())
        ) {
          url.searchParams.delete(key);
        }
      }
      url.searchParams.sort();
      url.hash = '';
      return url.toString();
    } catch {
      return value;
    }
  }
  return value;
}

export function favouriteIdentity(playlistId, channel) {
  return JSON.stringify([playlistId, streamIdentity(channel.url)]);
}

// Boot resume: identity is the channel URL (stable across playlist
// refresh and re-sort); a raw index would rot on every fetch. Returns
// the index, or -1 when nothing was saved, the channel is gone, or its
// group is now hidden.
export function findResumeIndex(channels, lastChannelUrl, hiddenGroups) {
  if (!lastChannelUrl) return -1;
  const at = (channels || []).findIndex((ch) => ch && ch.url === lastChannelUrl);
  if (at < 0) return -1;
  const group = (channels[at] && channels[at].group) || 'Ungrouped';
  if ((hiddenGroups || []).includes(group)) return -1;
  return at;
}

// Background-refresh re-tune: names + groups survive token rotation,
// URLs don't. Returns the index of the same channel, or -1.
export function findIntentIndex(channels, intent) {
  if (!intent) return -1;
  return (channels || []).findIndex(
    (ch) => ch && ch.name === intent.name && ((ch && ch.group) || 'Ungrouped') === intent.group,
  );
}

// Live-segment-404 reload budget: 3 edge re-syncs per URL inside a
// 5-minute window, then the link is condemned. Pure version of the
// player.js segment404* state machine — pass the stored state in, get
// the decision plus the next state back.
export function segment404Decision(prevState, url, now = Date.now()) {
  let attempts = 0;
  if (prevState && prevState.url === url && now - prevState.lastAt <= 5 * 60 * 1000) {
    attempts = prevState.attempts;
  }
  if (attempts >= 3) {
    return { retry: false, state: { url, attempts, lastAt: now } };
  }
  return { retry: true, state: { url, attempts: attempts + 1, lastAt: now } };
}

// 401/403 mid-playback budget: `attempts` is the count AFTER
// incrementing. Three fresh-token retries, then advance channels.
export function lastResortDecision(attempts) {
  return attempts <= 3 ? 'retry' : 'advance';
}

// Expired-token recovery policy: the dead token URL is frozen into the
// channel object, so same-URL reloads only win inside the server grace
// window. Two fast reloads, then ONE playlist refetch for a fresh token
// (the caller owns the refetch), then give up the channel.
export function tokenRecoveryDecision(attempts) {
  if (attempts <= 2) return 'reload';
  if (attempts === 3) return 'refresh';
  return 'advance';
}

// 403 retry cool-down: exponential backoff, capped — a fixed short delay
// hammers rate-limiting relays into banning the IP (BUG-021).
export function forbiddenRetryDelay(attempts) {
  return Math.min(4000 * 2 ** (attempts - 1), 16000);
}

// Channel-switch counter hygiene (#16): a dead channel's error/retry
// counters must not poison the next tune — reset them when the URL changes,
// keep them on same-URL reloads (mid-playback token refresh owns that path).
export function tuneCountersReset(prevUrl, nextUrl) {
  return prevUrl !== nextUrl;
}

// Player-generation guard (#16): a previous Shaka instance whose destroy()
// hung can still fire error/buffering/adaptation events after the switch —
// events from any older generation must be ignored.
export function isStalePlayerEvent(eventGen, currentGen) {
  return eventGen !== currentGen;
}

// Teardown-src filter (#16): our own teardown (video.src='' + load())
// fires a code-4 "Empty src" video error — not a real channel failure.
export function shouldIgnoreVideoError({ code, message, srcEmpty } = {}) {
  if (code !== 4 || !srcEmpty) return false;
  return /empty src/i.test(message || '');
}

// Per-tune hard-reload budget (freeze/crash report): `reloads` counts hard
// reloads already done for this tune (stall-watchdog + consecutive-error).
// Three full destroy/create cycles, then give up with a terminal message —
// an endless loop piles hung players and MSE buffers until the TV kills us.
export function hardReloadDecision(reloads) {
  return reloads < 3 ? 'reload' : 'giveup';
}

// Fast-zap guard (tune race): every remote press runs a full tune body, so a
// burst of presses overlaps N destroy/create cycles on one shared video
// element — a late stale destroy wipes the winner's fresh load (silent
// black). Each tune takes a sequence number; anything superseded by a newer
// press must return before touching the player.
export function tuneSuperseded(mySeq, latestSeq) {
  return mySeq !== latestSeq;
}

// Unexpected-pause resume (fast-zap stuck state): load resolved and the pill
// went away, yet nothing plays — a late stale teardown paused (or wiped) the
// shared video element. Resume unless the pause is the user's own intent or
// playback actually ended. A wiped src fails play() and falls through to the
// normal stall → reload path instead of sitting stuck forever.
export function shouldResumePlayback({ paused, ended, userPaused } = {}) {
  return !!paused && !ended && !userPaused;
}

// Stall-watchdog patience (flaky-relay report): a frozen clock alone is not
// proof of stuck — segments may still be flowing while the decoder waits
// (slow relay, transmux backlog) or Shaka may be mid-retry-cycle. Escalate
// only when the network is idle too; otherwise re-baseline and keep waiting
// instead of trampling a recovery that was already in flight.
export function isNetworkActive(lastActivityAt, now = Date.now(), quietMs = 10000) {
  return now - lastActivityAt < quietMs;
}

// Bounded patience: a frozen picture with a live network gets a few extra
// windows (chatty playlist, starved segments) — then we restart the tune
// anyway instead of waiting forever on a stream that never becomes playable.
export function stallPatienceExceeded(deferrals, maxDeferrals = 4) {
  return deferrals >= maxDeferrals;
}

// Single-narrative tune UX: one bottom line owns "taking too long"
// messaging (thresholds kept: whisper at 4s, plain talk at 9s).
const SLOW_HINTS = [
  [4000, 'Slow server — holding on…'],
  [9000, 'Taking longer than usual — you can wait or try another channel'],
];

export function slowHintFor(elapsedMs) {
  let hint = '';
  for (const [after, text] of SLOW_HINTS) {
    if (elapsedMs >= after) hint = text;
  }
  return hint;
}

// Light attempt indicator for the status line: silent on the first try,
// " • try N" once silent retries begin (user asked to see it, subtly).
export function attemptSuffix(attempt) {
  return attempt > 1 ? ' • try ' + attempt : '';
}
// Calendar boundaries use the viewer's local timezone, including DST changes.
export function guideDayRange(now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return { from: start.toISOString(), to: end.toISOString() };
}

export function guideIsCurrent(programme, now = Date.now()) {
  return !!programme && Date.parse(programme.start) <= now && now < Date.parse(programme.end);
}

export function guideState(data, now = Date.now()) {
  if (data.offline || data.status === 'offline')
    return 'Guide offline' + (data.updatedAt ? ' · showing cached listings' : ' · you can still watch');
  if (data.status === 'unsupported') return 'Programme guide unavailable for this source';
  if (data.status === 'no_matching_id') return 'No matching guide ID';
  if (data.cacheStatus === 'unavailable' || data.status === 'unavailable')
    return 'Guide unavailable · you can still watch';
  const age = data.updatedAt ? Math.max(0, (now - Date.parse(data.updatedAt)) / 1000) : 0;
  const freshness = data.stale || age > 7200 ? 'Guide stale' : 'Guide updated ' + Math.floor(age / 60) + ' min ago';
  return freshness + (data.status === 'no_listings' ? ' · No listings today' : '');
}

export function discoveryGroups(channels, data, filter = 'all', favourites = [], now = Date.now()) {
  const entries = new Map((data.channels || []).map((entry) => [entry.guideId, entry]));
  const known = new Map();
  const unknown = [];
  const scoped = channels.filter((channel) =>
    filter === 'sports'
      ? channel.group === 'Sports'
      : filter === 'favourites'
        ? favourites.some((saved) => streamIdentity(saved.url) === streamIdentity(channel.url))
        : true,
  );
  for (const channel of scoped) {
    const entry = channel.guideId && entries.get(channel.guideId);
    const current = guideIsCurrent(entry?.current, now) && entry.current.title ? entry.current : null;
    if (!current) {
      unknown.push({
        key: 'stream:' + channel.url,
        versions: [channel],
        current: null,
        next: null,
        status: !channel.guideId ? 'no_matching_id' : entry?.status || 'no_matching_id',
      });
    } else if (!known.has(channel.guideId)) {
      known.set(channel.guideId, {
        key: 'guide:' + channel.guideId,
        versions: channels.filter((version) => version.guideId === channel.guideId),
        current,
        next: entry.next && Date.parse(entry.next.end) > now ? entry.next : null,
        status: entry.status,
      });
    }
  }
  return [...known.values(), ...unknown];
}

export function preferredVersion(versions, favourites = [], lastUrl) {
  for (const favourite of favourites) {
    const at = versions.findIndex((channel) => streamIdentity(channel.url) === streamIdentity(favourite.url));
    if (at >= 0) return at;
  }
  const at = lastUrl ? versions.findIndex((channel) => streamIdentity(channel.url) === streamIdentity(lastUrl)) : -1;
  return Math.max(0, at);
}

export function guideProgress(programme, now = Date.now()) {
  const start = Date.parse(programme?.start),
    end = Date.parse(programme?.end);
  return end > start ? Math.max(0, Math.min(100, (100 * (now - start)) / (end - start))) : 0;
}

export function programmeSearch(channels, data, query, filter = 'all', favourites = [], now = Date.now()) {
  const title = query.trim().toLowerCase();
  if (!title) return [];
  return discoveryGroups(channels, data, filter, favourites, now).filter(
    (group) => group.current && group.current.title.toLowerCase().includes(title),
  );
}
