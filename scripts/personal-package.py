"""Build with an existing Samsung profile; preserve a compatible rollback."""
import base64
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parents[1]
PRIVATE = ROOT / 'beta' / 'personal-delivery'


def run(args, cwd=ROOT):
    result = subprocess.run(args, cwd=cwd, capture_output=True)
    if result.returncode:
        raise RuntimeError(f'{Path(args[0]).name} failed; command output suppressed')
    return result.stdout


def sha(data):
    return hashlib.sha256(data).hexdigest()


def identity(path):
    with zipfile.ZipFile(path) as archive:
        root = ET.fromstring(archive.read('config.xml'))
        app = root.find('{http://tizen.org/ns/widgets}application')
        if app is None:
            raise RuntimeError('Package has no application identity')
        signature = ET.fromstring(archive.read('author-signature.xml'))
        certificates = [base64.b64decode(e.text or '') for e in signature.iter()
                        if e.tag.endswith('X509Certificate')]
        return {'app': app.attrib['id'], 'package': app.attrib['package'],
                'widget': root.attrib['id'], 'authorSha256': sha(certificates[0])}


def source_hash():
    paths = [ROOT / 'package-lock.json', ROOT / 'package.json']
    paths += [p for p in (ROOT / 'player').rglob('*') if p.is_file()
              and not {'node_modules', 'dist'}.intersection(p.relative_to(ROOT).parts)]
    paths += [ROOT / 'tizen' / n for n in ('config.xml', 'icon.png')]
    digest = hashlib.sha256()
    for path in sorted(paths):
        digest.update(str(path.relative_to(ROOT)).encode() + b'\0' + path.read_bytes())
    return digest.hexdigest()


def main():
    os.umask(0o077)
    original = Path(sys.argv[1]).resolve()
    profile = sys.argv[2] if len(sys.argv) > 2 else 'KinoTV'
    expected = identity(original)
    if expected['app'] != 'IPTVPlayer.IPTV' or expected['package'] != 'IPTVPlayer':
        raise RuntimeError('Unexpected rollback identity')
    snapshot = json.loads((PRIVATE / 'before.json').read_text())
    if snapshot['app']['id'] != expected['app']:
        raise RuntimeError('Installed app differs from rollback')
    run(['git', 'check-ignore', str(PRIVATE / 'probe.json')])
    PRIVATE.mkdir(parents=True, exist_ok=True, mode=0o700)
    rollback = PRIVATE / 'original-v3.2.0.wgt'
    if rollback.exists() and rollback.read_bytes() != original.read_bytes():
        raise RuntimeError('Existing rollback differs; refusing replacement')
    if not rollback.exists():
        shutil.copyfile(original, rollback)
    stamp = str(time.time_ns())
    work = PRIVATE / stamp
    work.mkdir(mode=0o700)
    before = source_hash()
    for command in (['npm', 'test'], ['npm', 'run', 'lint'], ['npm', 'run', 'build']):
        run(command)
    stage = work / 'widget'
    shutil.copytree(ROOT / 'player' / 'dist', stage)
    html = stage / 'index.html'
    html.write_text(html.read_text().replace('/enplayer/', './'))
    config = (ROOT / 'tizen' / 'config.xml').read_text()
    version = json.loads((ROOT / 'package.json').read_text())['version']
    config = config.replace('version="1.0.0"', f'version="{version}"')
    (stage / 'config.xml').write_text(config)
    shutil.copyfile(ROOT / 'tizen' / 'icon.png', stage / 'icon.png')
    cli = str(Path.home() / 'tizen-studio/tools/ide/bin/tizen')
    run([cli, 'package', '-t', 'wgt', '-s', profile, '-o', str(work), '--', str(stage)])
    package = next(work.glob('*.wgt'))
    actual = identity(package)
    if actual != expected:
        raise RuntimeError('Signed profile author or identity mismatch; no install')
    if before != source_hash():
        raise RuntimeError('Feature source changed during build; rebuild after parent review')
    output = work / 'personal-v3.2.0.wgt'
    package.rename(output)
    manifest = {'head': run(['git', 'rev-parse', 'HEAD']).decode().strip(),
                'sourceSha256': before, 'profile': profile, 'identity': actual,
                'package': str(output), 'packageSha256': sha(output.read_bytes()),
                'rollback': str(rollback), 'rollbackSha256': sha(rollback.read_bytes()),
                'checks': ['npm test', 'npm run lint', 'npm run build'],
                'installedAuthorVerified': False,
                'installGate': 'Read installed author or confirm earlier signed package installation provenance'}
    (work / 'manifest.json').write_text(json.dumps(manifest, indent=2))
    for path in work.rglob('*'):
        path.chmod(0o700 if path.is_dir() else 0o600)
    print(json.dumps(manifest, indent=2))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print('Packaging stopped:', str(error) if isinstance(error, RuntimeError)
              else 'private details suppressed', file=sys.stderr)
        sys.exit(1)
