import { getActivePlaylist, getHiddenGroups } from './config.js';
import { favouriteChannels } from './favourites.js';
import { streamIdentity, filterDisplayChannels } from './logic.js';
import { createShell, renderHeader, row, empty } from './browse-view.js';
import * as actions from './channel-actions.js';
import * as discovery from './discovery.js';
import * as search from './search.js';
import * as details from './programme-details.js';

let all = [];
let tune;
let settings;
let screen = 3;
let rail = 3;
let zone = 'rows';
const positions = [0, 0, 0, 0, 0];
let group = 'all';
let groupsOpen = false;
let groupPosition = 0;
let shown = [];
const WINDOW = 30;

export function init(channels, onTune, onSettings) {
  all = channels;
  tune = onTune;
  settings = onSettings;
  createShell();
  document.querySelectorAll('[data-screen]').forEach((button, index) => {
    button.onclick = () => chooseScreen(index);
  });
  render();
}
export function visible() {
  return !!document.getElementById('browse') && !document.getElementById('browse').classList.contains('hidden');
}
export function open() {
  if (!document.getElementById('browse')) return;
  document.getElementById('browse').classList.remove('hidden');
  render();
}
export function close() {
  discovery.leave();
  search.leave();
  if (actions.isOpen()) actions.close();
  document.getElementById('browse')?.classList.add('hidden');
  document.activeElement?.blur();
}
export function toggle() {
  if (visible()) close();
  else open();
}
export function refresh(channels = all) {
  const focused = shown[positions[screen]];
  all = channels;
  const visibleChannels = filterDisplayChannels(all, getHiddenGroups(), 'all');
  if (screen === 0) discovery.updateChannels(visibleChannels);
  if (screen === 1) search.updateChannels(visibleChannels);
  const identity = focused && streamIdentity(focused.url);
  derive();
  const at = identity ? shown.findIndex((channel) => streamIdentity(channel.url) === identity) : -1;
  if (at >= 0) positions[screen] = at;
  render();
}
function derive() {
  const channels = filterDisplayChannels(all, getHiddenGroups(), 'all');
  shown = screen === 2 ? favouriteChannels(channels) : channels;
  if (screen === 3 && group !== 'all') shown = channels.filter((channel) => (channel.group || 'Ungrouped') === group);
  if (screen === 0 || screen === 4) shown = [];
  positions[screen] = Math.max(0, Math.min(positions[screen], shown.length - 1));
}
function chooseScreen(index) {
  discovery.leave();
  search.leave();
  rail = index;
  if (index === 4) {
    zone = 'rail';
    close();
    settings();
    return;
  }
  screen = index;
  if (index === 1) search.navigate();
  groupsOpen = false;
  zone = index === 1 ? 'search' : index === 0 ? 'discovery' : 'rows';
  render();
}
function render() {
  if (details.isOpen() || document.hidden) return;
  derive();
  renderHeader(screen, getActivePlaylist()?.name, shown.length);
  const controls = document.getElementById('browse-controls');
  const list = document.getElementById('browse-list');
  controls.innerHTML = '';
  list.innerHTML = '';
  list.classList.remove('discovery-list');
  if (screen === 0) {
    if (!visible()) {
      discovery.leave();
      return;
    }
    discovery.enter(filterDisplayChannels(all, getHiddenGroups(), 'all'), {
      watch: (channel) => {
        close();
        tune(channel);
      },
      rail: () => {
        zone = 'rail';
        updateFocus();
      },
    });
    return;
  }
  if (screen === 1) {
    if (!visible()) return;
    search.enter(filterDisplayChannels(all, getHiddenGroups(), 'all'), {
      watch: (channel) => {
        close();
        tune(channel);
      },
      rail: () => {
        zone = 'rail';
        updateFocus();
      },
    });
    return;
  }
  if (screen === 3) {
    const button = document.createElement('button');
    button.id = 'browse-group';
    button.type = 'button';
    button.textContent = `Group: ${group === 'all' ? 'All Channels' : group}`;
    button.onclick = () => {
      groupsOpen = !groupsOpen;
      groupPosition = 0;
      zone = 'groups';
      render();
    };
    controls.appendChild(button);
  }
  renderRows();
}
function renderRows() {
  derive();
  const list = document.getElementById('browse-list');
  if (screen === 0) {
    updateFocus();
    return;
  }
  list.innerHTML = '';
  if (groupsOpen) {
    const names = [
      'all',
      ...new Set(filterDisplayChannels(all, getHiddenGroups(), 'all').map((channel) => channel.group || 'Ungrouped')),
    ];
    names.forEach((name) => {
      const button = document.createElement('button');
      button.className = 'familiar-group';
      button.textContent = name === 'all' ? 'All Channels' : name;
      button.onclick = () => {
        group = name;
        groupsOpen = false;
        positions[3] = 0;
        zone = 'rows';
        render();
      };
      list.appendChild(button);
    });
  } else if (shown.length) {
    const start = Math.max(0, positions[screen] - Math.floor(WINDOW / 2));
    shown.slice(start, start + WINDOW).forEach((channel, offset) => {
      const index = start + offset;
      list.appendChild(
        row(channel, index, () => {
          positions[screen] = index;
          close();
          tune(channel);
        }),
      );
    });
  } else {
    list.appendChild(
      empty(
        screen === 2 ? 'No favourites available' : 'No channels found',
        screen === 2
          ? 'From Channels or Search, focus a stream → Actions → Add to favourites. Missing saved streams return when your source supplies them again.'
          : 'Try another search or choose a channel source in Settings.',
      ),
    );
  }
  updateFocus();
}
function updateFocus() {
  if (!visible()) return;
  document.querySelectorAll('#browse .focused').forEach((element) => element.classList.remove('focused'));
  let target;
  if (zone === 'rail') target = document.getElementById(`browse-nav-${rail}`);
  if (zone === 'group-control') target = document.getElementById('browse-group');
  if (zone === 'groups') target = document.querySelectorAll('.familiar-group')[groupPosition];
  if (zone === 'rows') target = document.querySelector(`#browse-list [data-index="${positions[screen]}"]`);
  if (!target) {
    zone = 'rail';
    target = document.getElementById(`browse-nav-${rail}`);
  }
  target.classList.add('focused');
  target.focus();
  target.scrollIntoView({ block: 'nearest' });
}
export function handle(action) {
  if (discovery.handle(action)) return true;
  if (actions.handle(action)) return true;
  if (search.handle(action)) return true;
  if (!visible()) return false;
  if (action === 'back') {
    if (groupsOpen) {
      groupsOpen = false;
      zone = 'group-control';
      render();
    } else close();
    return true;
  }
  if (action === 'left') {
    zone = 'rail';
    updateFocus();
  }
  if (zone === 'rail') {
    if (action === 'up' || action === 'down') {
      rail = (rail + (action === 'down' ? 1 : 4)) % 5;
      updateFocus();
    }
    if (action === 'select' || action === 'right') chooseScreen(rail);
    return true;
  }
  if (action === 'right' && zone === 'rows' && shown.length) {
    document.querySelector('#browse .focused')?.classList.remove('focused');
    actions.open(shown[positions[screen]], () => refresh());
    return true;
  }
  if (action === 'select') {
    document.querySelector('#browse .focused')?.click();
    return true;
  }
  if (action === 'up' || action === 'down') {
    const dir = action === 'down' ? 1 : -1;
    if (zone === 'group-control' && dir > 0) zone = 'rows';
    else if (zone === 'groups') {
      const count = document.querySelectorAll('.familiar-group').length;
      groupPosition = (groupPosition + dir + count) % count;
    } else if (zone === 'rows') {
      if (positions[screen] === 0 && dir < 0) zone = screen === 3 ? 'group-control' : 'rail';
      else positions[screen] = Math.max(0, Math.min(shown.length - 1, positions[screen] + dir));
    }
    if (zone === 'groups') updateFocus();
    else renderRows();
  }
  return true;
}
