"""Run as root on Contabo after uploading this directory; prints no secrets."""
import json
import os
import re
import shutil
import subprocess
import time
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import urlopen
from urllib.error import HTTPError


def run(*args):
    subprocess.run(args, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def main():
    if os.geteuid() != 0:
        raise RuntimeError('Root required for isolated installation')
    source = Path(__file__).parent
    generator = Path('/var/lib/mediaflow/mediaflow-configure.py')
    nginx = Path('/etc/nginx/sites-available/mediaflow')
    playlist = Path('/var/lib/mediaflow-playlist/channels.m3u8')
    env = Path('/etc/en-guide.env')
    installed = Path('/opt/en-guide')
    stamp = str(int(time.time()))
    backup = Path('/var/backups/en-guide') / stamp
    backup.mkdir(parents=True, mode=0o700)
    original = generator.read_text()
    config = nginx.read_text()
    if 'en-guide-url=' in original or '/etc/nginx/en-guide-location.conf' in config:
        raise RuntimeError('Already configured: inspect existing deployment first')
    helper = '''\n
def _en_guide_header(header):
    import json
    import pathlib
    import shutil
    metadata = json.loads(pathlib.Path('/etc/en-guide-advertisement.json').read_text())
    shutil.copyfile('/var/lib/mediaflow/source.m3u8', '/var/lib/en-guide/source.m3u8')
    return header.replace('#EXTM3U', '#EXTM3U en-guide-url="' + metadata['base'] + '"', 1)
\n'''
    marker = "    elif line.startswith('#EXTM3U'):\n"
    if original.count(marker) != 1 or original.count('    listen 443 ssl;') != 1:
        raise RuntimeError('Generator no longer matches inspected deployment')
    patched = helper + original.replace(marker, marker + '        line = _en_guide_header(line)\n', 1)
    patched = patched.replace('    listen 443 ssl;', '    listen 443 ssl;\n    include /etc/nginx/en-guide-location.conf;', 1)
    compile(patched, str(generator), 'exec')
    listen = re.search(r'listen\s+[^;]*443[^;]*;', config)
    if not listen:
        raise RuntimeError('Existing HTTPS server not found')
    opening = config.rfind('{', 0, listen.start())
    # listen belongs directly inside the intended server block.
    if not re.search(r'server\s*$', config[:opening]):
        raise RuntimeError('Unexpected HTTPS configuration')
    changed_config = config[:opening + 1] + '\n    include /etc/nginx/en-guide-location.conf;\n' + config[opening + 1:]
    settings = {}
    for line in Path('/etc/mediaflow.env').read_text().splitlines():
        if '=' in line and not line.lstrip().startswith('#'):
            key, value = line.split('=', 1)
            settings[key.strip()] = value.strip().strip('\"\'')
    secret = settings.get('API_PASSWORD')
    if not secret or any(c in secret for c in '\n\r\"\\'):
        raise RuntimeError('Shared secret requires private environment inspection')
    connection = Path('/var/lib/mediaflow/connection.json')
    for path in (generator, nginx, playlist, connection):
        shutil.copy2(path, backup / path.name)
    for path in (env, Path('/etc/en-guide-advertisement.json')):
        if path.exists():
            shutil.copy2(path, backup / path.name)
    try:
        subprocess.run(['id', 'en-guide'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
    except subprocess.CalledProcessError:
        run('useradd', '--system', '--home', '/var/lib/en-guide', '--shell', '/usr/sbin/nologin', 'en-guide')
    run('install', '-d', '-o', 'en-guide', '-g', 'en-guide', '-m', '0700', '/var/lib/en-guide')
    run('install', '-d', '-m', '0755', str(installed))
    for name in ('service.py', 'xmltv.py'):
        run('install', '-m', '0644', str(source / name), str(installed / name))
    env.write_text('API_PASSWORD="' + secret + '"\nGUIDE_PLAYLIST=/var/lib/en-guide/source.m3u8\nGUIDE_CACHE=/var/lib/en-guide/cache.json\n')
    env.chmod(0o600)
    advertisement = Path('/etc/en-guide-advertisement.json')
    advertisement.write_text(json.dumps({'base': 'https://161.97.164.253/en-guide/v1?' + urlencode({'api_password': secret})}))
    advertisement.chmod(0o600)
    shutil.copyfile('/var/lib/mediaflow/source.m3u8', '/var/lib/en-guide/source.m3u8')
    run('chown', 'en-guide:en-guide', '/var/lib/en-guide/source.m3u8')
    run('chmod', '0600', '/var/lib/en-guide/source.m3u8')
    run('install', '-m', '0644', str(source / 'en-guide.service'), '/etc/systemd/system/en-guide.service')
    run('install', '-m', '0644', str(source / 'nginx-location.conf'), '/etc/nginx/en-guide-location.conf')
    try:
        generator.write_text(patched)
        run('python3', str(generator))
        generated_header = playlist.read_text().splitlines()[0]
        if 'en-guide-url=' not in generated_header:
            raise RuntimeError('Advertisement missing after generator run')
        run('systemctl', 'daemon-reload')
        run('systemctl', 'enable', '--now', 'en-guide.service')
        nginx.write_text(changed_config)
        run('nginx', '-t')
        run('systemctl', 'reload', 'nginx')
        time.sleep(2)
        url = 'https://161.97.164.253/en-guide/v1/current'
        try:
            urlopen(url, timeout=10).close()
            raise RuntimeError('Authentication was not enforced')
        except HTTPError as error:
            if error.code != 403:
                raise RuntimeError('Unexpected authentication response') from None
            error.close()
        for _ in range(90):
            with urlopen(url + '?' + urlencode({'api_password': secret}), timeout=10) as response:
                data = json.load(response)
            if data.get('cacheStatus') == 'fresh' and data.get('channels'):
                break
            time.sleep(2)
        else:
            raise RuntimeError('Guide did not produce a fresh cache')
        run('systemctl', 'is-active', 'nginx', 'mediaflow-proxy', 'en-guide')
        with urlopen('https://161.97.164.253/health', timeout=10) as response:
            if response.status != 200:
                raise RuntimeError('Existing gateway health failed')
        print('Guide deployed: authenticated fresh JSON; existing gateway healthy.')
        print('Rollback backup:', backup)
    except Exception:
        for path in (generator, nginx, playlist, connection):
            shutil.copy2(backup / path.name, path)
        subprocess.run(['systemctl', 'disable', '--now', 'en-guide'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        run('nginx', '-t')
        run('systemctl', 'reload', 'nginx')
        raise RuntimeError('Deployment rolled back; inspect private server state') from None


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print('Guide deployment failed. Provider and credentials suppressed.')
        raise SystemExit(1)
