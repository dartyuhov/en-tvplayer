import { getSettings, saveSettings } from './config.js';
import { favouriteChannels } from './favourites.js';
import { programmeSearch, streamIdentity } from './logic.js';
import { requestGuide } from './guide-client.js';
import { FILTERS } from './discovery-view.js';
import * as view from './search-view.js';
import * as details from './programme-details.js';
import * as actions from './channel-actions.js';

let channels = [],
  items = [],
  data,
  context;
let active = false,
  sequence = 0,
  timer,
  refreshTimer;
let mode = 0,
  modeFocus = 0,
  filter = 0,
  filterFocus = 0;
let query = '',
  position = 0,
  zone = 'input',
  editing = true;
export function navigate() {
  zone = 'input';
  editing = true;
}
export function updateChannels(visibleChannels) {
  const source = visibleChannels.find((channel) => channel.guideUrl)?.guideUrl;
  if (source !== channels.find((channel) => channel.guideUrl)?.guideUrl) {
    sequence++;
    data = undefined;
  }
  channels = visibleChannels;
}
export function enter(visibleChannels, callbacks) {
  updateChannels(visibleChannels);
  context = callbacks;
  if (details.isOpen() || document.hidden) return;
  active = true;
  filter = Math.max(0, FILTERS.map((name) => name.toLowerCase()).indexOf(getSettings().discoveryFilter));
  filterFocus = filter;
  view.controls(mode, filter, query, selectMode, selectFilter, (value) => {
    query = value;
    position = 0;
    items = [];
    render();
  });
  render();
  focus();
  start();
}
function start() {
  clearInterval(timer);
  clearInterval(refreshTimer);
  if (!mode) return;
  void refresh();
  timer = setInterval(render, 1000);
  refreshTimer = setInterval(refresh, 30000);
}
export function leave() {
  active = false;
  sequence++;
  clearInterval(timer);
  clearInterval(refreshTimer);
}
async function refresh() {
  if (!active || !mode || details.isOpen() || document.hidden) return;
  const token = ++sequence;
  const result = await requestGuide(
    channels.find((channel) => channel.guideUrl),
    'current',
  );
  if (!active || token !== sequence || !mode || details.isOpen() || document.hidden) return;
  data = result;
  render();
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) sequence++;
  else if (active && mode) void refresh();
});
function key(item) {
  return mode ? item?.key : item && streamIdentity(item.url);
}
function render() {
  if (!active || details.isOpen() || actions.isOpen() || document.hidden) return;
  const saved = key(items[position]);
  items = mode
    ? programmeSearch(channels, data || {}, query, FILTERS[filter].toLowerCase(), favouriteChannels(channels))
    : channels.filter((channel) => channel.name.toLowerCase().includes(query.trim().toLowerCase()));
  const at = items.findIndex((item) => key(item) === saved);
  position = Math.max(0, Math.min(at >= 0 ? at : position, items.length - 1));
  view.results(items, mode, data, query, position, select);
  if (!document.activeElement?.matches('#browse [data-screen]')) focus();
}
function focus() {
  if (!active || document.hidden || details.isOpen() || actions.isOpen()) return;
  document.querySelectorAll('#browse .focused').forEach((element) => element.classList.remove('focused'));
  const input = document.getElementById('channel-search');
  input.readOnly = !editing || zone !== 'input';
  let target =
    zone === 'input'
      ? input
      : zone === 'modes'
        ? document.querySelector(`[data-search-mode="${modeFocus}"]`)
        : zone === 'filters'
          ? document.querySelector(`[data-search-filter="${filterFocus}"]`)
          : document.querySelector(`#browse-list [data-index="${position}"]`);
  if (!target) {
    zone = 'input';
    editing = false;
    target = input;
  }
  target.classList.add('focused');
  if (document.activeElement !== target) target.focus();
  target.scrollIntoView({ block: 'nearest' });
}
function selectMode(index) {
  sequence++;
  mode = modeFocus = index;
  position = 0;
  items = [];
  zone = 'modes';
  editing = false;
  view.scope(mode, filter);
  render();
  start();
}
function selectFilter(index) {
  filter = filterFocus = index;
  saveSettings({ discoveryFilter: FILTERS[index].toLowerCase() });
  position = 0;
  items = [];
  zone = 'filters';
  view.scope(mode, filter);
  render();
}
function select(index) {
  position = index;
  zone = 'rows';
  if (!mode) {
    context.watch(items[index]);
    return;
  }
  const result = items[index];
  leave();
  details.open(result, data, channels, context.watch, () => enter(channels, context));
}
export function handle(action) {
  if (!active || document.activeElement?.matches('#browse [data-screen]')) return false;
  if (action === 'back') {
    if (zone === 'rows' || zone === 'filters' || zone === 'modes') {
      zone = 'input';
      editing = false;
      focus();
    } else {
      editing = false;
      document.getElementById('channel-search').readOnly = true;
      document.getElementById('channel-search').blur();
      context.rail();
    }
    return true;
  }
  if (action === 'select') {
    if (zone === 'input') {
      editing = true;
      const input = document.getElementById('channel-search');
      input.readOnly = false;
      input.blur();
      input.focus();
    } else if (zone === 'modes') selectMode(modeFocus);
    else if (zone === 'filters') selectFilter(filterFocus);
    else if (items.length) select(position);
    return true;
  }
  if (action === 'left' && (zone === 'rows' || (zone === 'modes' && modeFocus === 0))) {
    context.rail();
    return true;
  }
  if (zone === 'input') {
    if (action === 'up') {
      zone = 'modes';
      editing = false;
    }
    if (action === 'down' && items.length) {
      zone = 'rows';
      editing = false;
    }
    if (action === 'right' && !editing && mode) zone = 'filters';
    if (action === 'left' && !editing) {
      context.rail();
      return true;
    }
  } else if (zone === 'modes') {
    if (action === 'left' || action === 'right')
      modeFocus = Math.max(0, Math.min(1, modeFocus + (action === 'right' ? 1 : -1)));
    if (action === 'down') zone = 'input';
    if (action === 'up' && mode) zone = 'filters';
  } else if (zone === 'filters') {
    if (action === 'left' || action === 'right')
      filterFocus = Math.max(0, Math.min(2, filterFocus + (action === 'right' ? 1 : -1)));
    if (action === 'up') zone = 'input';
    if (action === 'down' && items.length) zone = 'rows';
  } else if (zone === 'rows') {
    if (action === 'right' && items.length) {
      if (mode) select(position);
      else
        actions.open(items[position], () => {
          render();
          focus();
        });
      return true;
    }
    if (action === 'up' && position === 0) {
      zone = 'input';
      editing = false;
    } else if (action === 'up' || action === 'down')
      position = Math.max(0, Math.min(items.length - 1, position + (action === 'down' ? 1 : -1)));
  }
  render();
  return true;
}
