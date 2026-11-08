"""Fictional compressed provider fixtures tested through guide HTTP."""
import gzip
import json
import tempfile
import threading
import unittest
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import urlopen

from service import Guide, serve


class Contract(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.directory = Path(self.temp.name)
        self.now = datetime(2026, 11, 7, 23, 30, tzinfo=timezone.utc)
        self.xml = b'''<tv><channel id="sport"/><channel id="empty"/>
        <programme channel="sport" start="20261108003000 +0100" stop="20261108013000 +0100">
        <title>Midnight match</title><desc>Live &amp; local</desc></programme>
        <programme channel="sport" start="20261108013000 +0100" stop="20261108023000 +0100"><title>Next</title></programme>
        <programme channel="outside" start="20261108003000 +0100" stop="20261108013000 +0100"><title>Excluded</title></programme></tv>'''
        owner = self
        self.release = threading.Event()
        self.release.set()
        self.entered = threading.Event()
        self.payload = None

        class Provider(BaseHTTPRequestHandler):
            def do_GET(self):
                owner.entered.set()
                owner.release.wait(5)
                self.send_response(200)
                self.end_headers()
                self.wfile.write(owner.payload if owner.payload is not None else gzip.compress(owner.xml))

            def log_message(self, format, *args):
                pass

        provider = ThreadingHTTPServer(('127.0.0.1', 0), Provider)
        threading.Thread(target=provider.serve_forever, daemon=True).start()
        self.addCleanup(provider.server_close)
        self.addCleanup(provider.shutdown)
        playlist = self.directory / 'source.m3u8'
        playlist.write_text(f'''#EXTM3U url-tvg="http://127.0.0.1:{provider.server_port}/guide.gz"
#EXTINF:-1 tvg-id="sport",HD
http://example.test/hd
#EXTINF:-1 tvg-id="sport",4K
http://example.test/4k
#EXTINF:-1 tvg-id="empty",Empty
http://example.test/empty
#EXTINF:-1 tvg-id="unmatched",Unmatched
http://example.test/unmatched
''')
        self.guide = Guide(playlist, self.directory / 'cache.json', 'fictional', clock=lambda: self.now)
        self.assertTrue(self.guide.refresh())
        server = serve(self.guide, '127.0.0.1', 0)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        self.addCleanup(server.server_close)
        self.addCleanup(server.shutdown)
        self.base = f'http://127.0.0.1:{server.server_port}/en-guide/v1/'

    def get(self, resource, authenticated=True):
        separator = '&' if '?' in resource else '?'
        with urlopen(self.base + resource + (separator + 'api_password=fictional' if authenticated else '')) as response:
            return json.load(response)

    def test_authenticated_current_has_unique_matching_ids_and_absolute_instants(self):
        with self.assertRaises(HTTPError) as error:
            self.get('current', False)
        self.assertEqual(error.exception.code, 403)
        error.exception.close()
        data = self.get('current')
        self.assertFalse(data['stale'])
        self.assertEqual(data['ageSeconds'], 0)
        channels = {c['guideId']: c for c in data['channels']}
        self.assertEqual(list(channels), ['empty', 'sport', 'unmatched'])
        self.assertEqual(channels['sport']['current']['start'], '2026-11-07T23:30:00Z')
        self.assertEqual(channels['sport']['next']['title'], 'Next')
        self.assertEqual(channels['empty']['status'], 'no_listings')
        self.assertEqual(channels['unmatched']['status'], 'no_matching_id')

    def test_local_midnight_schedule_and_stale_last_good_survive_interruption(self):
        resource = 'schedule?id=sport&from=2026-11-07T23%3A00%3A00Z&to=2026-11-08T23%3A00%3A00Z'
        before = self.get(resource)
        self.assertEqual([p['title'] for p in before['listings']], ['Midnight match', 'Next'])
        self.assertEqual(before['listings'][0]['description'], 'Live & local')
        disk = (self.directory / 'cache.json').read_bytes()
        self.xml = self.xml[:-8]
        self.now = datetime(2026, 11, 8, 1, 30, 1, tzinfo=timezone.utc)
        self.assertFalse(self.guide.refresh())
        after = self.get(resource)
        self.assertEqual(after['listings'], before['listings'])
        self.assertTrue(after['stale'])
        self.assertEqual(after['ageSeconds'], 7201)
        self.assertEqual((self.directory / 'cache.json').read_bytes(), disk)
        self.assertFalse((self.directory / 'cache.tmp').exists())
        self.assertEqual(self.get(resource.replace('sport', 'empty'))['status'], 'no_listings')
        self.assertEqual(self.get(resource.replace('sport', 'unmatched'))['status'], 'no_matching_id')

    def test_no_upstream_relay_and_expired_current(self):
        with self.assertRaises(HTTPError) as error:
            self.get('current?d=http://example.test')
        self.assertEqual(error.exception.code, 404)
        error.exception.close()
        self.now = datetime(2026, 11, 8, 0, 30, tzinfo=timezone.utc)
        sport = next(c for c in self.get('current')['channels'] if c['guideId'] == 'sport')
        self.assertEqual(sport['current']['title'], 'Next')
        self.assertIsNone(sport['next'])

    def test_refresh_is_single_flight_and_readers_keep_complete_old_snapshot(self):
        self.release.clear()
        self.entered.clear()
        self.xml = self.xml.replace(b'Midnight match', b'New match')
        thread = threading.Thread(target=self.guide.refresh)
        thread.start()
        self.assertTrue(self.entered.wait(2))
        self.assertFalse(self.guide.refresh())
        old = next(c for c in self.get('current')['channels'] if c['guideId'] == 'sport')
        self.assertEqual(old['current']['title'], 'Midnight match')
        self.release.set()
        thread.join(3)
        new = next(c for c in self.get('current')['channels'] if c['guideId'] == 'sport')
        self.assertEqual(new['current']['title'], 'New match')

    def test_truncated_gzip_retains_cache_and_retention_excludes_outside_days(self):
        self.xml = self.xml.replace(b'</tv>', b'''<programme channel="sport" start="20261106000000 +0000" stop="20261106010000 +0000"><title>Prior day</title></programme>
        <programme channel="sport" start="20261110000000 +0000" stop="20261110010000 +0000"><title>Too late</title></programme>
        <programme channel="sport" start="20261105000000 +0000" stop="20261105010000 +0000"><title>Too early</title></programme></tv>''')
        self.assertTrue(self.guide.refresh())
        data = self.get('schedule?id=sport&from=2026-11-06T00%3A00%3A00Z&to=2026-11-08T00%3A00%3A00Z')
        self.assertEqual([p['title'] for p in data['listings']], ['Prior day', 'Midnight match'])
        disk = (self.directory / 'cache.json').read_bytes()
        self.payload = gzip.compress(self.xml)[:-6]
        self.assertFalse(self.guide.refresh())
        self.assertEqual((self.directory / 'cache.json').read_bytes(), disk)


if __name__ == '__main__':
    unittest.main()
