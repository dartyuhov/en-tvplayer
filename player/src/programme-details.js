import { lastGuideVersion } from './stream-preference.js';
import { favouriteChannels, isFavourite } from './favourites.js';
import { guideDayRange, guideIsCurrent, guideProgress, guideState, preferredVersion } from './logic.js';
import { guideTimes } from './guide-format.js';
import { requestGuide } from './guide-client.js';
import { escapeHtml } from './utils.js';

let panel,
  group,
  version = 0,
  zone = 'watch',
  position = 0,
  listings = [],
  selected,
  callback,
  watch;
let sequence = 0,
  timer,
  scheduleData;
export function isOpen() {
  return !!panel && !panel.classList.contains('hidden');
}
export function close() {
  sequence++;
  clearInterval(timer);
  panel?.classList.add('hidden');
  const restore = callback;
  callback = null;
  restore?.();
}
export function open(result, currentData, channels, onWatch, onClose) {
  group = result;
  version = preferredVersion(group.versions, favouriteChannels(channels), lastGuideVersion(group.versions[0]));
  selected = group.current;
  position = 0;
  listings = [];
  zone = 'watch';
  watch = onWatch;
  callback = onClose;
  scheduleData = currentData || { status: 'unsupported' };
  if (!panel) {
    panel = document.createElement('section');
    panel.id = 'programme-details';
    panel.className = 'discovery-details';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-label', 'Programme details');
    document.getElementById('app').appendChild(panel);
  }
  panel.classList.remove('hidden');
  panel.innerHTML = `<header><span class="detail-channel"></span><span class="detail-status" role="status"></span></header>
    <div class="discovery-detail-layout"><main><div class="detail-copy-scroll"><p class="detail-eyebrow"></p><h1></h1><p class="detail-time"></p>
    <div class="now-progress"><i></i></div><p class="detail-description"></p></div>
    <h2>Choose a stream version</h2><div class="detail-versions" role="group" aria-label="Stream versions"></div>
    <button type="button" id="discovery-watch"></button><p class="detail-note">↑ Versions · ← → Choose version · → Schedule</p></main>
    <aside><h2>Today · Your local time</h2><p class="schedule-status" role="status">Loading guide…</p><div class="detail-schedule"></div></aside></div>
    <footer>↑ ↓ ← → Navigate · OK Watch / Description · Back Return to results</footer>`;
  panel.querySelector('#discovery-watch').onclick = () => {
    if (!canWatch()) return;
    const channel = group.versions[version];
    close();
    watch(channel);
  };
  update();
  timer = setInterval(update, 1000);
  void loadSchedule();
}
function canWatch() {
  return selected ? guideIsCurrent(selected) : !group.current;
}
async function loadSchedule() {
  const token = ++sequence;
  const channel = group.versions[version];
  const data = await requestGuide(channel, 'schedule', { id: channel.guideId || '', ...guideDayRange() });
  if (token !== sequence || !isOpen()) return;
  scheduleData = data;
  listings = (data.listings || []).filter((p) => p.title && Date.parse(p.end) > Date.parse(p.start));
  position = Math.max(
    0,
    listings.findIndex((p) => guideIsCurrent(p)),
  );
  panel.querySelector('.schedule-status').textContent = guideState(data);
  renderSchedule();
  update();
}
function renderSchedule() {
  const container = panel.querySelector('.detail-schedule');
  container.innerHTML = '';
  listings.forEach((programme, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'detail-programme';
    button.dataset.programme = index;
    button.innerHTML = `<span>${guideTimes(programme)}</span><strong>${escapeHtml(programme.title)}</strong>`;
    button.onclick = () => {
      position = index;
      selected = programme;
      zone = 'schedule';
      update();
    };
    container.appendChild(button);
  });
}
function update() {
  if (!isOpen() || document.hidden) return;
  const channel = group.versions[version];
  panel.querySelector('.detail-channel').textContent = channel.name;
  panel.querySelector('.detail-status').textContent = guideState(scheduleData);
  panel.querySelector('.detail-eyebrow').textContent = selected
    ? guideIsCurrent(selected)
      ? 'On now'
      : Date.parse(selected.start) > Date.now()
        ? 'Later today'
        : 'Finished'
    : 'No programme information';
  panel.querySelector('h1').textContent = selected?.title || channel.name;
  panel.querySelector('.detail-time').textContent = selected
    ? guideTimes(selected)
    : 'You can still watch this channel';
  panel.querySelector('.detail-description').textContent = selected?.description || 'No description available';
  panel.querySelector('.now-progress i').style.width = guideProgress(selected) + '%';
  const versions = panel.querySelector('.detail-versions');
  versions.innerHTML = '';
  group.versions.forEach((item, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.version = index;
    button.textContent = (isFavourite(item) ? '★ ' : '') + item.name;
    button.className = index === version ? 'selected' : '';
    button.setAttribute('aria-pressed', String(index === version));
    button.onclick = () => {
      version = index;
      zone = 'versions';
      update();
    };
    versions.appendChild(button);
  });
  const watchButton = panel.querySelector('#discovery-watch');
  watchButton.textContent = 'Watch ' + channel.name;
  watchButton.hidden = !canWatch();
  if (zone === 'watch' && !canWatch()) zone = listings.length ? 'schedule' : 'versions';
  panel.querySelectorAll('.detail-programme').forEach((button, index) => {
    const current = guideIsCurrent(listings[index]);
    button.classList.toggle('current', current);
    button.setAttribute('aria-current', String(current));
  });
  panel.querySelectorAll('.focused').forEach((element) => element.classList.remove('focused'));
  const target =
    zone === 'watch'
      ? watchButton
      : zone === 'versions'
        ? versions.children[version]
        : panel.querySelector(`[data-programme="${position}"]`);
  if (target) {
    target.classList.add('focused');
    target.focus();
    target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
}
export function handle(action) {
  if (!isOpen()) return false;
  if (action === 'back') {
    close();
    return true;
  }
  if (action === 'select') {
    panel.querySelector('.focused')?.click();
    return true;
  }
  if (zone === 'watch') {
    if (action === 'up' || action === 'left') zone = 'versions';
    if ((action === 'right' || action === 'down') && listings.length) {
      zone = 'schedule';
      selected = listings[position];
    }
  } else if (zone === 'versions') {
    if (action === 'left' || action === 'right')
      version = Math.max(0, Math.min(group.versions.length - 1, version + (action === 'right' ? 1 : -1)));
    if (action === 'down') {
      selected = group.current;
      zone = canWatch() ? 'watch' : listings.length ? 'schedule' : 'versions';
    }
  } else {
    if (action === 'up' || action === 'down') {
      position = Math.max(0, Math.min(listings.length - 1, position + (action === 'down' ? 1 : -1)));
      selected = listings[position];
    }
    if (action === 'left') {
      selected = group.current;
      zone = canWatch() ? 'watch' : 'versions';
    }
  }
  update();
  return true;
}
