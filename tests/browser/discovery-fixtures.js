import { base } from './remote-helpers.js';

export const instant = Date.parse('2026-11-07T18:30:00Z');
export const programme = (
  title,
  start = instant - 1800000,
  end = instant + 1800000,
  description = 'Live fixture description.',
) => ({
  title,
  description,
  start: new Date(start).toISOString(),
  end: new Date(end).toISOString(),
});
export const live = programme(
  'Harbour United v Mountain City — International football championship with a very long programme title',
);
export const next = programme(
  'Post-match studio',
  instant + 1800000,
  instant + 3600000,
  'Future discussion description.',
);
export function currentData(extra = {}) {
  return {
    version: 1,
    updatedAt: new Date(instant).toISOString(),
    stale: false,
    cacheStatus: 'fresh',
    channels: [
      { guideId: 'stadium', status: 'ok', current: live, next },
      { guideId: 'Stadium', status: 'ok', current: programme('Case-sensitive separate broadcast'), next: null },
      { guideId: 'news', status: 'ok', current: programme('Evening News'), next: null },
      { guideId: 'missing', status: 'no_listings', current: null, next: null },
    ],
    ...extra,
  };
}
export const versionUrl = (quality, language) =>
  `${base}/proxy/hls/manifest.m3u8?api_password=fictional&d=${encodeURIComponent(`https://provider.example/live?quality=${quality}&language=${language}&edition=main&token=fixture`)}`;
export async function discoveryFixtures(page) {
  await page.clock.install({ time: new Date(instant) });
  await page.route(`${base}/discovery.m3u`, (route) =>
    route.fulfill({
      contentType: 'audio/x-mpegurl',
      body: `#EXTM3U en-guide-url="${base}/discovery-guide"
#EXTINF:-1 tvg-id="stadium" tvg-name="Stadium" group-title="Sports",Stadium HD
${versionUrl('hd', 'en')}
#EXTINF:-1 tvg-id="stadium" tvg-name="Stadium" group-title="Sports",Stadium 4K Polish
${versionUrl('4k', 'pl')}
#EXTINF:-1 tvg-id="Stadium" group-title="Sports",Stadium separate ID
${base}/streams/case.m3u8
#EXTINF:-1 tvg-id="news" group-title="News",Evening News HD
${base}/streams/news.m3u8
#EXTINF:-1 group-title="Sports",Unknown Sports HD
${base}/streams/unknown-hd.m3u8
#EXTINF:-1 group-title="Sports",Unknown Sports 4K
${base}/streams/unknown-4k.m3u8
#EXTINF:-1 tvg-id="missing" group-title="News",Missing Guide
${base}/streams/missing.m3u8
`,
    }),
  );
  await page.route(`${base}/discovery-guide/current**`, (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify(currentData()) }),
  );
  await page.route(`${base}/discovery-guide/schedule**`, (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        status: new URL(route.request().url()).searchParams.get('id') ? 'ok' : 'no_matching_id',
        updatedAt: new Date(instant).toISOString(),
        stale: false,
        listings: [live, next],
      }),
    }),
  );
}
