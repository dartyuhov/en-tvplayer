const cache = new Map();
const pending = new Map();

// Metadata fetches have their own timeout and never import the playback engine.
export async function requestGuide(channel, resource, parameters = {}) {
  if (!channel?.guideUrl) return { status: 'unsupported', listings: [] };
  if (!channel.guideId && resource === 'schedule') return { status: 'no_matching_id', listings: [] };
  let url;
  try {
    url = new URL(channel.guideUrl);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
    url.pathname = url.pathname.replace(/\/$/, '') + '/' + resource;
    for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, value);
  } catch {
    return { status: 'unsupported', listings: [] };
  }
  const key = url.href;
  const previous = cache.get(key);
  if (previous && Date.now() - previous.saved < 30000) return previous.data;
  if (pending.has(key)) return pending.get(key);
  const promise = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(key, { signal: controller.signal, referrerPolicy: 'no-referrer' });
      if (!response.ok) throw new Error();
      const data = await response.json();
      if (!data || !Array.isArray(data[resource === 'current' ? 'channels' : 'listings'])) throw new Error();
      cache.set(key, { saved: Date.now(), data });
      return data;
    } catch {
      if (previous) return { ...previous.data, offline: true, stale: true };
      return { status: 'offline', offline: true, listings: [], channels: [] };
    } finally {
      clearTimeout(timer);
      pending.delete(key);
    }
  })();
  pending.set(key, promise);
  return promise;
}
