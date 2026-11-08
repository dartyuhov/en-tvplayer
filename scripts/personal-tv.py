"""Private Samsung CDP snapshots; never log storage, URLs, or error bodies."""
import base64
import json
import os
from pathlib import Path
import socket
import struct
import sys
from urllib.parse import urlsplit
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]


def compare(first, second):
    before, after = [json.loads(Path(p).read_text()) for p in (first, second)]
    left, right = [json.loads(d['storage'].get('en_settings', '{}')) for d in (before, after)]
    fields = ('activePlaylistIndex', 'hiddenGroups', 'proxyChannels', 'proxyUrl')
    result = {field + 'Retained': left.get(field) == right.get(field) for field in fields}
    result['playlistUrlsRetained'] = ([p.get('url') for p in left.get('playlists', [])]
                                     == [p.get('url') for p in right.get('playlists', [])])
    result['channelUrlsRetained'] = ([c.get('url') for c in left.get('channels', [])]
                                    == [c.get('url') for c in right.get('channels', [])])
    result['favouritesRetained'] = (before['storage'].get('en_favourites_v1')
                                    == after['storage'].get('en_favourites_v1'))
    print(json.dumps(result, indent=2))
    if not all(result.values()):
        raise RuntimeError('Snapshot comparison differs; inspect privately before continuing')


class Inspector:
    def __init__(self, host, port):
        targets = json.load(urlopen(f'http://{host}:{port}/json', timeout=10))
        target = next(t for t in targets if t['type'] == 'page')
        path = target['webSocketDebuggerUrl'].split(str(port), 1)[1]
        self.socket = socket.create_connection((host, int(port)), timeout=15)
        key = base64.b64encode(os.urandom(16)).decode()
        request = (f'GET {path} HTTP/1.1\r\nHost: {host}:{port}\r\n'
                   f'Upgrade: websocket\r\nConnection: Upgrade\r\n'
                   f'Sec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n')
        self.socket.sendall(request.encode())
        header = b''
        while not header.endswith(b'\r\n\r\n'):
            header += self.read(1)
        if b' 101 ' not in header:
            raise RuntimeError('Inspector handshake failed')
        self.sequence = 0

    def read(self, length):
        result = b''
        while len(result) < length:
            chunk = self.socket.recv(length - len(result))
            if not chunk:
                raise RuntimeError('Inspector disconnected')
            result += chunk
        return result

    def evaluate(self, expression):
        response = self.command('Runtime.evaluate', {'expression': expression,
                                'returnByValue': True, 'awaitPromise': True})
        if 'exceptionDetails' in response:
            raise RuntimeError('Inspector evaluation failed (details suppressed)')
        return response['result'].get('value')

    def command(self, method, params):
        self.sequence += 1
        body = json.dumps({'id': self.sequence, 'method': method, 'params': params}).encode()
        mask = os.urandom(4)
        length = len(body)
        header = bytes([129, 128 | length]) if length < 126 else bytes([129, 254]) + struct.pack('!H', length)
        self.socket.sendall(header + mask + bytes(b ^ mask[i % 4] for i, b in enumerate(body)))
        message = b''
        while True:
            opcode, length = self.read(2)
            size = length & 127
            if size == 126:
                size = struct.unpack('!H', self.read(2))[0]
            elif size == 127:
                size = struct.unpack('!Q', self.read(8))[0]
            payload = self.read(size)
            if opcode & 15 not in (0, 1):
                raise RuntimeError('Unexpected inspector frame')
            message += payload
            if not opcode & 128:
                continue
            response = json.loads(message)
            message = b''
            if response.get('id') != self.sequence:
                continue
            result = response.get('result', {})
            if 'error' in response or 'exceptionDetails' in result:
                raise RuntimeError('Inspector evaluation failed (details suppressed)')
            return result


def main():
    os.umask(0o077)
    if sys.argv[1] == 'compare':
        compare(*sys.argv[2:4])
        return
    host, port, label = sys.argv[1:4]
    if not label.replace('-', '').isalnum():
        raise RuntimeError('Use an alphanumeric snapshot label')
    inspector = Inspector(host, port)
    data = inspector.evaluate('''(() => {
      const app = tizen.application.getCurrentApplication().appInfo;
      const storage = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i); storage[key] = localStorage.getItem(key);
      }
      let certificates = null;
      try { certificates = tizen.application.getAppCerts().map(c => ({type: c.type, value: c.value})); } catch (_) {}
      let native = null;
      try { native = {state: webapis.avplay.getState(), time: webapis.avplay.getCurrentTime()}; } catch (_) {}
      return {app: {id: app.id, version: app.version}, storage, certificates, native,
              visibility: document.visibilityState};
    })()''')
    directory = ROOT / 'beta' / 'personal-delivery'
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    destination = directory / f'{label}.json'
    with destination.open('x') as stream:
        json.dump(data, stream)
    settings = json.loads(data['storage'].get('en_settings', '{}'))
    summary = {'app': data['app'], 'storageKeys': len(data['storage']),
               'playlists': len(settings.get('playlists', [])),
               'channels': len(settings.get('channels', [])),
               'activePlaylistIndex': settings.get('activePlaylistIndex'),
               'native': data['native']}
    playlists = settings.get('playlists', [])
    active = settings.get('activePlaylistIndex', -1)
    gateway = urlsplit(playlists[active].get('url', '')).netloc if 0 <= active < len(playlists) else ''
    channels = settings.get('channels', [])
    summary['channelsOnPlaylistGateway'] = sum(bool(gateway) and urlsplit(c.get('url', '')).netloc == gateway
                                              for c in channels)
    summary['favourites'] = len(json.loads(data['storage'].get('en_favourites_v1', '[]')))
    summary['installedCertificatesReadable'] = data['certificates'] is not None
    summary['visibility'] = data['visibility']
    print(json.dumps(summary, indent=2))
    print('Private snapshot:', destination)
    inspector.socket.close()


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print('TV snapshot failed; private details suppressed.', file=sys.stderr)
        sys.exit(1)
