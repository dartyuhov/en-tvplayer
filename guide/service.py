"""Private guide cache and read-only HTTP API. No credential-bearing logging."""
import hmac
import json
import os
import threading
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

from xmltv import import_guide, iso


class Guide:
    def __init__(self, playlist, cache, secret, clock=None, timeout=120):
        if not secret:
            raise ValueError('Authentication required')
        self.playlist, self.cache, self.secret = Path(playlist), Path(cache), secret
        self.clock = clock or (lambda: datetime.now(timezone.utc))
        self.timeout = timeout
        self.lock = threading.Lock()
        self.data = None
        try:
            self.data = json.loads(self.cache.read_text())
        except (OSError, ValueError):
            pass

    def refresh(self):
        if not self.lock.acquire(blocking=False):
            return False
        temporary = self.cache.with_suffix('.tmp')
        try:
            data = import_guide(self.playlist, self.clock(), self.timeout)
            with temporary.open('w') as output:
                json.dump(data, output, separators=(',', ':'))
                output.flush()
                os.fsync(output.fileno())
            os.replace(temporary, self.cache)
            self.data = data
            return True
        except Exception:
            # Exception messages can contain provider URLs. Never log them.
            return False
        finally:
            temporary.unlink(missing_ok=True)
            self.lock.release()

    def response(self, resource, query):
        data, now = self.data, self.clock()
        age = max(0, (now - datetime.fromisoformat(data['updatedAt'].replace('Z', '+00:00'))).total_seconds()) if data else None
        result = {'version': 1, 'updatedAt': data['updatedAt'] if data else None,
                  'ageSeconds': int(age) if age is not None else None,
                  'stale': age is None or age > 7200, 'cacheStatus': 'unavailable' if age is None else 'stale' if age > 7200 else 'fresh'}
        entries = data['channels'] if data else {}
        if resource == 'current':
            result['channels'] = []
            for key, entry in entries.items():
                current = next((p for p in entry['listings'] if p['start'] <= iso(now) < p['end']), None)
                following = next((p for p in entry['listings'] if p['start'] >= (current['end'] if current else iso(now))), None)
                status = 'no_matching_id' if not entry['matched'] else 'ok' if current else 'no_current' if entry['listings'] else 'no_listings'
                result['channels'].append({'guideId': key, 'status': status, 'current': current, 'next': following})
        else:
            key = query.get('id', [''])[0]
            entry = entries.get(key)
            begin, end = query.get('from', [''])[0], query.get('to', [''])[0]
            try:
                left = datetime.fromisoformat(begin.replace('Z', '+00:00'))
                right = datetime.fromisoformat(end.replace('Z', '+00:00'))
                if not left.tzinfo or not right.tzinfo or not 0 < (right-left).total_seconds() <= 172800:
                    raise ValueError()
            except ValueError:
                return 400, {'error': 'Supply absolute from/to instants (maximum 48 hours)'}
            listings = [p for p in entry['listings'] if p['start'] < iso(right) and p['end'] > iso(left)] if entry else []
            status = 'unavailable' if not data else 'no_matching_id' if not entry or not entry['matched'] else 'ok' if listings else 'no_listings'
            result.update(guideId=key, status=status, listings=listings)
        return 200, result


def serve(guide, host='127.0.0.1', port=8890):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, format, *args):
            pass

        def do_GET(self):
            url = urlsplit(self.path)
            query = parse_qs(url.query)
            token = query.get('api_password', [''])[0]
            authorization = self.headers.get('Authorization', '')
            if authorization.startswith('Bearer '):
                token = authorization[7:]
            if not hmac.compare_digest(token.encode(), guide.secret.encode()):
                status, body = 403, {'error': 'Forbidden'}
            elif url.path not in ('/en-guide/v1/current', '/en-guide/v1/schedule') or set(query) - {'api_password', 'id', 'from', 'to'}:
                status, body = 404, {'error': 'Not found'}
            else:
                status, body = guide.response(url.path.rsplit('/', 1)[1], query)
            payload = json.dumps(body, separators=(',', ':')).encode()
            self.send_response(status)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(payload)))
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(payload)

    return ThreadingHTTPServer((host, port), Handler)


def main():
    guide = Guide(os.environ['GUIDE_PLAYLIST'], os.environ['GUIDE_CACHE'], os.environ['API_PASSWORD'])
    def update():
        while True:
            guide.refresh()
            threading.Event().wait(3600)
    threading.Thread(target=update, daemon=True).start()
    serve(guide).serve_forever()


if __name__ == '__main__':
    main()
