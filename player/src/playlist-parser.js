import { parseStreamHeaders, parseLicenseKeyValue, processStreamUrl, extractAuthQuery } from './utils.js';

function findNameSeparator(line) {
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') inQuotes = !inQuotes;
    else if (line[i] === ',' && !inQuotes) return i;
  }
  return -1;
}

export function parseM3u(text) {
  const lines = text.split('\n');
  const header = lines.find((line) => line.trim().startsWith('#EXTM3U')) || '';
  const guideUrl = header.match(/\ben-guide-url="([^"]+)"/)?.[1] || null;
  const result = [];
  let index = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line.startsWith('#EXTINF:')) continue;
    const sepIdx = findNameSeparator(line);
    const name = sepIdx >= 0 ? line.slice(sepIdx + 1).trim() : 'Channel ' + (index + 1);
    const attrPart = sepIdx >= 0 ? line.slice(0, sepIdx) : line;
    const groupMatch = attrPart.match(/\bgroup-title="([^"]*)"/);
    const chnoMatch = attrPart.match(/\btvg-chno="([^"]*)"/) || attrPart.match(/\bchannel-number="([^"]*)"/);
    let group = groupMatch ? groupMatch[1] : null;
    let drm = null;
    let userAgent = null;
    let customHeaders = null;
    let urlIdx = i + 1;
    while (urlIdx < lines.length) {
      const next = lines[urlIdx].trim();
      if (next.startsWith('#EXTGRP:')) {
        if (!groupMatch) group = next.slice(8).trim();
      } else if (next.startsWith('#KODIPROP:')) {
        const lower = next.toLowerCase();
        if (lower.includes('stream_headers=')) {
          const raw = next.slice(next.indexOf('stream_headers=') + 'stream_headers='.length);
          const { headers, userAgent: ua } = parseStreamHeaders(raw);
          if (Object.keys(headers).length > 0) customHeaders = { ...(customHeaders || {}), ...headers };
          if (ua && !userAgent) userAgent = ua;
        } else if (lower.includes('license_key=')) {
          const raw = next.slice(next.indexOf('license_key=') + 'license_key='.length);
          const parsed = parseLicenseKeyValue(raw);
          if (parsed) drm = parsed;
        }
      } else if (next.startsWith('#EXTSYS')) {
        // Existing provider system tags do not describe the stream URL.
      } else if (next.startsWith('#EXTVLCOPT:')) {
        const uaMatch = next.match(/http-user-agent=(.+)/);
        if (uaMatch) userAgent = uaMatch[1].trim();
      } else if (next.startsWith('#EXTHTTP:')) {
        try {
          const json = JSON.parse(next.slice('#EXTHTTP:'.length));
          if (json && typeof json === 'object') {
            customHeaders = {};
            for (const [k, v] of Object.entries(json)) customHeaders[k] = String(v);
          }
        } catch {}
      } else break;
      urlIdx++;
    }
    const rawUrl = lines[urlIdx] ? lines[urlIdx].trim() : '';
    if (!rawUrl || rawUrl.startsWith('#')) continue;
    if (!drm) {
      const urlDrm = rawUrl.match(/[?&]drmLicense=([a-fA-F0-9-]+):([a-fA-F0-9-]+)/);
      if (urlDrm) drm = parseLicenseKeyValue(urlDrm[1] + ':' + urlDrm[2]);
    }
    const { url, extraHeaders } = processStreamUrl(rawUrl);
    if (extraHeaders) customHeaders = { ...(customHeaders || {}), ...extraHeaders };
    const parsedChno = chnoMatch ? parseInt(chnoMatch[1], 10) : NaN;
    result.push({
      name,
      url,
      channelNumber: !isNaN(parsedChno) && parsedChno > 0 ? parsedChno : index + 1,
      drm,
      userAgent,
      customHeaders,
      authQuery: extractAuthQuery(customHeaders),
      group,
      guideId: attrPart.match(/\btvg-id="([^"]*)"/)?.[1] || null,
      guideName: attrPart.match(/\btvg-name="([^"]*)"/)?.[1] || null,
      guideUrl,
    });
    index++;
    i = urlIdx;
  }
  return result;
}
