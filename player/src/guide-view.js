import { requestGuide } from './guide-client.js';
import { guideDayRange, guideIsCurrent, guideState } from './logic.js';
import './guide.css';
import { guideTime as time, guideTimes as times } from './guide-format.js';
import { rememberGuideVersion } from './stream-preference.js';

let panel,
  brief,
  callback,
  position = 0,
  listings = [],
  panelSequence = 0,
  briefSequence = 0,
  hideTimer,
  panelTimer,
  panelData,
  panelLoaded = false;
function create(id, className) {
  const element = document.createElement('section');
  element.id = id;
  element.className = className;
  document.getElementById('app').appendChild(element);
  return element;
}
export function isOpen() {
  return !!panel && !panel.classList.contains('hidden');
}
export function close() {
  panelSequence++;
  clearInterval(panelTimer);
  if (panel) panel.classList.add('hidden');
  const restore = callback;
  callback = null;
  restore?.();
}
export function selectionChanged(channel) {
  rememberGuideVersion(channel);
  if (isOpen()) close();
  const sequence = ++briefSequence;
  clearTimeout(hideTimer);
  if (brief) brief.classList.add('hidden');
  const deadline = Date.now() + 6000;
  void requestGuide(channel, 'current').then((data) => {
    if (sequence !== briefSequence || Date.now() >= deadline) return;
    const entry = data.channels?.find((item) => item.guideId === channel.guideId);
    if (!entry || (!guideIsCurrent(entry.current) && !entry.next)) return;
    if (!brief) brief = create('guide-brief', 'guide-brief hidden');
    brief.innerHTML = '<h2></h2><div><p class="brief-now"></p><p class="brief-next"></p></div><small></small>';
    brief.querySelector('h2').textContent = channel.name;
    brief.querySelector('.brief-now').textContent = guideIsCurrent(entry.current)
      ? 'Now · ' + entry.current.title + ' · ' + times(entry.current)
      : 'No current programme';
    brief.querySelector('.brief-next').textContent = entry.next
      ? 'Next · ' + time(entry.next.start) + ' · ' + entry.next.title
      : 'No next listing';
    brief.querySelector('small').textContent = guideState(data);
    brief.classList.remove('hidden');
    hideTimer = setTimeout(() => brief.classList.add('hidden'), Math.max(0, deadline - Date.now()));
  });
}
export async function open(channel, onClose) {
  const sequence = ++panelSequence;
  clearInterval(panelTimer);
  panelData = undefined;
  panelLoaded = false;
  callback = onClose;
  listings = [];
  if (!panel) panel = create('programme-guide', 'programme-guide');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Programme guide');
  panel.classList.remove('hidden');
  panel.innerHTML =
    '<header><h1></h1><p class="guide-status" role="status">Loading guide…</p></header><div class="guide-layout"><div class="guide-details"><h2></h2><p class="guide-time"></p><p class="guide-description"></p></div><aside><h2>Today · Your local time</h2><div class="guide-list"></div></aside></div><footer>↑ ↓ Navigate · OK Description · Back Return</footer>';
  panel.querySelector('h1').textContent = 'Today on ' + channel.name;
  panel.tabIndex = -1;
  panel.focus();
  const data = await requestGuide(channel, 'schedule', { id: channel.guideId || '', ...guideDayRange() });
  if (sequence !== panelSequence || !isOpen()) return;
  panelData = data;
  if (document.hidden) return;
  renderSchedule();
  panelTimer = setInterval(() => update(false), 1000);
}
function renderSchedule() {
  const data = panelData;
  panelLoaded = true;
  panel.querySelector('.guide-status').textContent = guideState(data);
  listings = (data.listings || []).filter(
    (p) => p.title && Number.isFinite(Date.parse(p.start)) && Date.parse(p.end) > Date.parse(p.start),
  );
  position = Math.max(
    0,
    listings.findIndex((p) => guideIsCurrent(p)),
  );
  if (!listings.length) return;
  const container = panel.querySelector('.guide-list');
  for (const [index, programme] of listings.entries()) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'guide-row';
    row.textContent = times(programme) + ' · ' + programme.title;
    row.onclick = () => {
      position = index;
      update();
    };
    container.appendChild(row);
  }
  update();
}
function update(moveFocus = true) {
  if (!isOpen() || document.hidden) return;
  if (panelData) panel.querySelector('.guide-status').textContent = guideState(panelData);
  panel.querySelectorAll('.guide-row').forEach((row, index) => {
    const current = guideIsCurrent(listings[index]);
    row.classList.toggle('current', current);
    row.classList.toggle('focused', position === index);
    row.setAttribute('aria-current', current ? 'true' : 'false');
    if (moveFocus && position === index) {
      row.focus();
      row.scrollIntoView({ block: 'nearest' });
    }
  });
  const programme = listings[position];
  if (!programme) return;
  panel.querySelector('.guide-details h2').textContent = programme.title;
  panel.querySelector('.guide-time').textContent = times(programme) + (guideIsCurrent(programme) ? ' · On now' : '');
  panel.querySelector('.guide-description').textContent = programme.description || 'No description available';
}
document.addEventListener('visibilitychange', () => {
  clearInterval(panelTimer);
  if (!document.hidden && isOpen() && panelData) {
    if (!panelLoaded) renderSchedule();
    update(false);
    panelTimer = setInterval(() => update(false), 1000);
  }
});
export function handle(action) {
  if (!isOpen()) return false;
  if (action === 'back') close();
  else if (listings.length && ['up', 'down', 'select'].includes(action)) {
    if (action !== 'select')
      position = Math.max(0, Math.min(listings.length - 1, position + (action === 'down' ? 1 : -1)));
    update();
  }
  return true;
}
