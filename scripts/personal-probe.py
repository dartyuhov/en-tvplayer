"""Public remote-key dispatch and sanitized TV observations."""
import importlib.util
import json
from pathlib import Path
import sys
import time

spec = importlib.util.spec_from_file_location('tv', Path(__file__).with_name('personal-tv.py'))
assert spec and spec.loader
tv = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tv)
inspector = tv.Inspector('192.168.1.129', sys.argv[1])
codes = {'ArrowUp': 38, 'ArrowDown': 40, 'ArrowLeft': 37, 'ArrowRight': 39,
         'Enter': 13, 'GoBack': 10009}
try:
    for key in sys.argv[2:]:
        if key.startswith('wait='):
            time.sleep(float(key.split('=')[1]))
            continue
        if key not in codes:
            raise RuntimeError('Unsupported public key')
        inspector.evaluate(f'''document.dispatchEvent(new KeyboardEvent('keydown',
            {{key:{json.dumps(key)}, keyCode:{codes[key]}, which:{codes[key]}, bubbles:true}})); true''')
        time.sleep(0.2)
    result = inspector.evaluate('''(() => {
      const settings = JSON.parse(localStorage.getItem('en_settings') || '{}');
      const active = document.activeElement;
      const row = document.querySelector('.familiar-row.focused');
      const hidden = id => !document.getElementById(id) || document.getElementById(id).classList.contains('hidden');
      const urls = settings.channels || [];
      const selected = urls.find(c => c.url === settings.lastChannelUrl);
      let host = null; try { host = new URL(settings.lastChannelUrl).hostname; } catch (_) {}
      return {visibility:document.visibilityState, native:webapis.avplay.getState(),
        time:webapis.avplay.getCurrentTime(), focusedId:active?.id,
        focusedRowIndex:row?.dataset.index, focusedEurosportHD:!!row && /Eurosport HD/i.test(row.textContent),
        selectedEurosportHD:!!selected && /Eurosport HD/i.test(selected.name), mediaHost:host,
        browseHidden:hidden('browse'), actionsHidden:hidden('channel-actions'),
        guideHidden:hidden('programme-guide'), detailsHidden:hidden('programme-details'),
        favourites:JSON.parse(localStorage.getItem('en_favourites_v1') || '[]').length,
        rowCount:document.querySelectorAll('.familiar-row').length,
        favouriteAction:document.getElementById('favourite-action')?.textContent};
    })()''')
    print(json.dumps(result, indent=2))
finally:
    inspector.socket.close()
