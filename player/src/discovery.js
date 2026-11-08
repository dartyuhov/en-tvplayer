import { getSettings, saveSettings } from './config.js';
import { favouriteChannels } from './favourites.js';
import { discoveryGroups } from './logic.js';
import { requestGuide } from './guide-client.js';
import { renderDiscovery, FILTERS } from './discovery-view.js';
import * as details from './programme-details.js';

let channels = [],
  data,
  active = false,
  sequence = 0,
  timer,
  refreshTimer;
let position = 0,
  filterFocus = 0,
  zone = 'filters',
  groups = [],
  context;
let filter = Math.max(0, ['all', 'sports', 'favourites'].indexOf(getSettings().discoveryFilter));
filterFocus = filter;
export function updateChannels(visibleChannels) {
  if (
    visibleChannels.find((channel) => channel.guideUrl)?.guideUrl !==
    channels.find((channel) => channel.guideUrl)?.guideUrl
  ) {
    sequence++;
    data = undefined;
  }
  channels = visibleChannels;
}
export function enter(visibleChannels, callbacks) {
  updateChannels(visibleChannels);
  context = callbacks;
  if (details.isOpen() || document.hidden) return;
  if (active) {
    render();
    return;
  }
  active = true;
  filter = Math.max(0, FILTERS.map((name) => name.toLowerCase()).indexOf(getSettings().discoveryFilter));
  filterFocus = filter;
  render();
  focus();
  void refresh();
  timer = setInterval(render, 1000);
  refreshTimer = setInterval(refresh, 30000);
}
export function leave(suspend = false) {
  active = false;
  sequence++;
  clearInterval(timer);
  clearInterval(refreshTimer);
  if (!suspend) data = undefined;
}
async function refresh() {
  if (!active || document.hidden || details.isOpen()) return;
  const token = ++sequence;
  const source = channels.find((channel) => channel.guideUrl);
  const result = await requestGuide(source, 'current');
  if (!active || token !== sequence || document.hidden || details.isOpen()) return;
  data = result;
  render();
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) sequence++;
  if (active && !document.hidden) void refresh();
});
function render() {
  if (!active || document.hidden || details.isOpen()) return;
  const key = groups[position]?.key;
  groups = discoveryGroups(channels, data || {}, FILTERS[filter].toLowerCase(), favouriteChannels(channels));
  const at = groups.findIndex((group) => group.key === key);
  position = Math.max(0, Math.min(at >= 0 ? at : position, groups.length - 1));
  const onRail = document.activeElement?.matches('#browse [data-screen]');
  renderDiscovery(groups, data, filter, selectFilter, selectGroup, position);
  if (!onRail) focus();
}
function focus() {
  if (!active || document.hidden || details.isOpen()) return;
  document.querySelectorAll('#browse .focused').forEach((element) => element.classList.remove('focused'));
  let target =
    zone === 'filters'
      ? document.querySelector(`[data-filter="${filterFocus}"]`)
      : document.querySelector(`[data-discovery-index="${position}"]`);
  if (!target) {
    zone = 'filters';
    filterFocus = filter;
    target = document.querySelector(`[data-filter="${filterFocus}"]`);
  }
  if (!target) return;
  target.classList.add('focused');
  target.focus();
  target.scrollIntoView({ block: 'nearest' });
}
function selectFilter(index) {
  filter = filterFocus = index;
  saveSettings({ discoveryFilter: FILTERS[index].toLowerCase() });
  position = 0;
  groups = [];
  zone = 'filters';
  render();
  focus();
}
function selectGroup(index) {
  position = index;
  zone = 'cards';
  leave(true);
  details.open(groups[index], data, channels, context.watch, () => {
    enter(channels, context);
    focus();
  });
}
export function handle(action) {
  if (details.handle(action)) return true;
  if (!active || document.activeElement?.matches('#browse [data-screen]')) return false;
  if (action === 'back') return false;
  if (action === 'select') {
    if (zone === 'filters') selectFilter(filterFocus);
    else if (groups.length) selectGroup(position);
  } else if (zone === 'filters') {
    if (action === 'left' && filterFocus === 0) {
      context.rail();
      return true;
    }
    if (action === 'left' || action === 'right')
      filterFocus = Math.max(0, Math.min(2, filterFocus + (action === 'right' ? 1 : -1)));
    if (action === 'down' && groups.length) zone = 'cards';
    if (action === 'up') {
      context.rail();
      return true;
    }
  } else {
    const known = groups.filter((group) => group.current).length;
    if (action === 'left' && (position >= known || position % 3 === 0)) {
      context.rail();
      return true;
    }
    if (action === 'up' && position < 3) {
      zone = 'filters';
      filterFocus = filter;
    } else {
      const step = position < known ? 3 : 1;
      const delta = { up: -step, down: step, left: -1, right: 1 }[action] || 0;
      position = Math.max(0, Math.min(groups.length - 1, position + delta));
    }
  }
  render();
  focus();
  return true;
}
