"""Bounded streaming XMLTV import; provider destinations never come from HTTP."""
import gzip
import io
import re
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from urllib.request import Request, urlopen


def instant(value):
    return datetime.strptime(value.strip(), '%Y%m%d%H%M%S %z').astimezone(timezone.utc)


def iso(value):
    return value.astimezone(timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z')


class BoundedReader:
    def __init__(self, stream, deadline, limit):
        self.stream, self.deadline, self.remaining = stream, deadline, limit

    def read(self, size=-1):
        if time.monotonic() > self.deadline:
            raise TimeoutError('Guide import deadline')
        data = self.stream.read(min(size if size > 0 else 65536, 65536))
        self.remaining -= len(data)
        if self.remaining < 0:
            raise ValueError('Guide import size limit')
        return data


def import_guide(playlist, now, timeout=120):
    text = playlist.read_text()
    header = next((line for line in text.splitlines() if line.startswith('#EXTM3U')), '')
    source = re.search(r'(?:url-tvg|x-tvg-url)="([^"]+)"', header)
    if not source or not source[1].startswith(('https://', 'http://')):
        raise ValueError('Configured guide missing')
    ids = set(re.findall(r'\btvg-id="([^"]+)"', text))
    channels = {key: {'matched': False, 'listings': []} for key in sorted(ids)}
    start = now.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=1)
    end = start + timedelta(days=4)
    deadline = time.monotonic() + timeout
    request = Request(source[1], headers={'User-Agent': 'VLC/3.0.21', 'Accept-Encoding': 'identity'})
    with urlopen(request, timeout=min(15, timeout)) as response:
        raw = io.BufferedReader(response)
        compressed = raw.peek(2)[:2] == b'\x1f\x8b'
        stream = gzip.GzipFile(fileobj=raw) if compressed else raw
        reader = BoundedReader(stream, deadline, 512 * 1024 * 1024)
        iterator = ET.iterparse(reader, events=('start', 'end'))
        _, root = next(iterator)
        if root.tag != 'tv':
            raise ValueError('Not XMLTV')
        for event, element in iterator:
            if event != 'end' or element.tag not in ('programme', 'channel'):
                continue
            key = element.get('channel') if element.tag == 'programme' else element.get('id')
            if key in channels:
                entry = channels[key]
                entry['matched'] = True
                if element.tag == 'programme':
                    begin, finish = instant(element.get('start', '')), instant(element.get('stop', ''))
                    if finish <= begin:
                        raise ValueError('Invalid programme interval')
                    if begin < end and finish > start:
                        entry['listings'].append({
                            'title': (element.findtext('title') or 'Untitled programme')[:1000],
                            'description': (element.findtext('desc') or '')[:12000],
                            'start': iso(begin), 'end': iso(finish),
                        })
            root.remove(element)
        # Reading to EOF validates the gzip trailer, including truncated downloads.
        while reader.read(65536):
            pass
    if not any(entry['listings'] for entry in channels.values()):
        raise ValueError('No relevant programmes; retain last good cache')
    for entry in channels.values():
        unique = {(p['start'], p['end'], p['title']): p for p in entry['listings']}
        entry['listings'] = sorted(unique.values(), key=lambda p: (p['start'], p['end'], p['title']))
    return {'updatedAt': iso(now), 'channels': channels}
