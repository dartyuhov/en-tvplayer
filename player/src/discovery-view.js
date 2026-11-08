import { escapeHtml } from './utils.js';
import { isFavourite } from './favourites.js';
import { guideProgress, guideState } from './logic.js';
import { guideTime, guideTimes } from './guide-format.js';
import './discovery.css';

export const FILTERS = ['All', 'Sports', 'Favourites'];
export function renderDiscovery(groups, data, filter, selectFilter, selectGroup, position) {
  const controls = document.getElementById('browse-controls');
  controls.innerHTML = '<div class="discovery-filters"></div><p class="discovery-status" role="status"></p>';
  FILTERS.forEach((name, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = name;
    button.dataset.filter = index;
    button.className = index === filter ? 'selected' : '';
    button.setAttribute('aria-pressed', String(index === filter));
    button.onclick = () => selectFilter(index);
    controls.firstChild.appendChild(button);
  });
  controls.querySelector('.discovery-status').textContent = data ? guideState(data) : 'Loading guide…';
  const list = document.getElementById('browse-list');
  list.innerHTML = '';
  list.classList.add('discovery-list');
  const cards = document.createElement('div');
  cards.className = 'now-cards';
  list.appendChild(cards);
  const unknown = document.createElement('div');
  unknown.className = 'now-unknown';
  const count = groups.filter((g) => !g.current).length;
  if (count) {
    const heading = document.createElement('h2');
    heading.textContent = `No programme information · ${count} channels`;
    unknown.appendChild(heading);
    list.appendChild(unknown);
  }
  // Keep the focused card's complete grid row in a bounded window.
  const start = Math.max(0, Math.floor((position - 9) / 3) * 3);
  groups.slice(start, start + 30).forEach((group, offset) => {
    const channel = group.versions[0];
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.discoveryIndex = start + offset;
    button.onclick = () => selectGroup(start + offset);
    if (group.current) {
      button.className = 'now-card';
      button.innerHTML = `<span class="channel-art"><span class="now-label">ON NOW</span><strong>${escapeHtml(channel.guideName || channel.name)}</strong></span>
        <span class="now-body"><span class="now-channel">${escapeHtml(channel.guideName || channel.name)} · ${group.versions.length} versions ${group.versions.some(isFavourite) ? '★' : ''}</span>
        <strong class="now-title">${escapeHtml(group.current.title)}</strong><span class="now-time">${guideTimes(group.current)}</span>
        <span class="now-progress" role="progressbar" aria-label="Programme progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.floor(guideProgress(group.current))}"><i style="width:${guideProgress(group.current)}%"></i></span>
        <span class="now-next">${group.next ? 'Next ' + guideTime(group.next.start) + ' · ' + escapeHtml(group.next.title) : 'No next listing'}</span></span>`;
      cards.appendChild(button);
    } else {
      button.className = 'now-unknown-row';
      button.innerHTML = `<strong>${escapeHtml(channel.name)}</strong><span>${group.status === 'no_matching_id' ? 'No matching guide ID' : 'No current listing'} · You can still watch →</span>`;
      unknown.appendChild(button);
    }
  });
  if (!groups.length) {
    const message = document.createElement('p');
    message.className = 'familiar-empty';
    message.textContent = 'No channels in this filter. Choose All, or add a visible stream to Favourites.';
    list.appendChild(message);
  }
  document.getElementById('browse-hints').textContent = '↑ ↓ ← → Navigate    OK Programme details    Back Return to TV';
}
