import { createServer } from 'node:http';

// Fictional provider data; matches the production guide HTTP contract.
const base = 'http://127.0.0.1:5184';
const playlist = `#EXTM3U en-guide-url="${base}/guide"
#EXTINF:-1 tvg-id="stadium" tvg-name="Stadium" group-title="Sports",Stadium HD
${base}/streams/stadium-hd.m3u8
#EXTINF:-1 tvg-id="stadium" tvg-name="Stadium" group-title="Sports",Stadium 4K
${base}/streams/stadium-4k.m3u8
#EXTINF:-1 tvg-id="local" group-title="News",Local News
${base}/streams/local.m3u8
`;

createServer((request, response) => {
  const url = new URL(request.url, base);
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Cache-Control', 'no-store');
  if (url.pathname === '/playlist.m3u') {
    response.setHeader('Content-Type', 'audio/x-mpegurl');
    response.end(playlist);
  } else if (url.pathname === '/health') {
    response.end('ready');
  } else if (url.pathname === '/guide/current' || url.pathname === '/guide/schedule') {
    const now = Date.now();
    const programme = {
      title: 'Harbour United v Mountain City',
      description: 'Fictional football fixture.',
      start: new Date(now - 1800000).toISOString(),
      end: new Date(now + 1800000).toISOString(),
    };
    const next = {
      title: 'Match analysis',
      description: 'Studio discussion',
      start: programme.end,
      end: new Date(now + 3600000).toISOString(),
    };
    response.setHeader('Content-Type', 'application/json');
    response.end(
      JSON.stringify({
        updatedAt: new Date(now).toISOString(),
        stale: false,
        ageSeconds: 0,
        cacheStatus: 'fresh',
        status: url.pathname.endsWith('/current') || url.searchParams.get('id') === 'stadium' ? 'ok' : 'no_matching_id',
        channels: [{ guideId: 'stadium', status: 'ok', current: programme, next }],
        listings: url.searchParams.get('id') === 'stadium' ? [programme, next] : [],
      }),
    );
  } else {
    // A stream request means the mocked handoff boundary was bypassed.
    response.writeHead(404);
    response.end('No media served by browser fixtures');
  }
}).listen(5184, '127.0.0.1');
