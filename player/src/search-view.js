import { row, empty } from './browse-view.js';
import { isFavourite } from './favourites.js';
import { guideState } from './logic.js';
import { guideTimes } from './guide-format.js';
import { FILTERS } from './discovery-view.js';
import { escapeHtml } from './utils.js';
import './search.css';

export function controls(mode, filter, query, changeMode, changeFilter, changeQuery) {
  const root = document.getElementById('browse-controls');
  root.innerHTML =
    '<div class="search-tabs" role="group" aria-label="Search mode"></div><label for="channel-search"></label><input id="channel-search" type="text" autocomplete="off"><div class="search-filters" role="group" aria-label="Programme filters"></div><p class="search-status" role="status"></p>';
  ['Channels', 'Programmes on now'].forEach((name, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = name;
    button.dataset.searchMode = index;
    button.onclick = () => changeMode(index);
    root.firstChild.appendChild(button);
  });
  FILTERS.forEach((name, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = name;
    button.dataset.searchFilter = index;
    button.onclick = () => changeFilter(index);
    root.querySelector('.search-filters').appendChild(button);
  });
  const input = root.querySelector('input');
  input.value = query;
  input.oninput = () => changeQuery(input.value);
  scope(mode, filter);
}
export function scope(mode, filter) {
  document.querySelectorAll('[data-search-mode]').forEach((button, index) => {
    button.classList.toggle('selected', index === mode);
    button.setAttribute('aria-pressed', String(index === mode));
  });
  document.querySelectorAll('[data-search-filter]').forEach((button, index) => {
    button.classList.toggle('selected', index === filter);
    button.setAttribute('aria-pressed', String(index === filter));
  });
  document.querySelector('.search-filters').hidden = !mode;
  document.querySelector('#browse-controls label').textContent = mode
    ? 'Search programme titles airing right now · future listings are in the schedule'
    : 'Search channel names across all visible groups';
  document.getElementById('channel-search').placeholder = mode ? 'Search programmes on now…' : 'Search channels…';
  document.getElementById('browse-hints').textContent =
    '↑ Modes    OK Keyboard / Select    ↓ Results    → Actions / Filters    Back Query / Navigation / TV';
}
export function results(items, mode, data, query, position, select) {
  const list = document.getElementById('browse-list');
  list.innerHTML = '';
  document.querySelector('.search-status').textContent = mode
    ? `${data ? guideState(data) : 'Loading guide…'} · ${items.length} live results · exact guide IDs grouped`
    : `${items.length} channels · OK watches a stream; Right opens Actions without tuning`;
  if (!items.length) {
    list.appendChild(
      empty(
        mode ? (query.trim() ? 'No programmes on now found' : 'Enter a programme title') : 'No channels found',
        mode
          ? 'Try another title or filter. Channels search remains available without guide data.'
          : 'Try another channel name or choose a source in Settings.',
      ),
    );
  }
  const start = Math.max(0, position - 15);
  items.slice(start, start + 30).forEach((item, offset) => {
    const index = start + offset;
    if (!mode) {
      list.appendChild(row(item, index, () => select(index)));
      return;
    }
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'familiar-row channel-item search-programme';
    button.dataset.index = index;
    const channel = item.versions[0];
    button.innerHTML = `<span class="familiar-row-info"><strong>${escapeHtml(item.current.title)}</strong><small>${escapeHtml(channel.guideName || channel.name)} · ${guideTimes(item.current)}</small></span><span class="favourite-star">${item.versions.some(isFavourite) ? '★' : ''}</span><span class="search-versions">${item.versions.length} versions<br>Details →</span>`;
    button.onclick = () => select(index);
    list.appendChild(button);
  });
}
