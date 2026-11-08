import { escapeHtml } from './utils.js';
import { isFavourite } from './favourites.js';

export const SCREENS = ['On now', 'Search', 'Favourites', 'Channels', 'Settings'];
const paths = [
  '<rect x="3" y="5" width="18" height="15" rx="2"/><path d="m8 1 4 4 4-4m-7 10 5-3-5-3z"/>',
  '<circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/>',
  '<path d="m12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z"/>',
  '<path d="M8 5h14M8 12h14M8 19h14M2 5h1M2 12h1M2 19h1"/>',
  '<circle cx="12" cy="12" r="4"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2"/>',
];
export function icon(index) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[index]}</svg>`;
}
export function createShell() {
  let root = document.getElementById('browse');
  if (root) return root;
  root = document.createElement('section');
  root.id = 'browse';
  root.className = 'familiar hidden';
  root.setAttribute('aria-label', 'Live television');
  root.innerHTML = `<nav class="familiar-rail" aria-label="Main navigation">
    <div class="familiar-brand">EN <em>TV</em></div><p>Personal television</p>
    ${SCREENS.map((name, index) => `<button id="browse-nav-${index}" data-screen="${index}" type="button">${icon(index)}${name}</button>`).join('')}
    <small>Personal build</small></nav>
    <main class="familiar-content"><header><span id="browse-source"></span><span id="browse-clock"></span></header>
    <h1 id="browse-title"></h1><div id="browse-controls"></div><div id="browse-list"></div></main>
    <footer id="browse-hints"></footer>`;
  document.getElementById('app').appendChild(root);
  return root;
}
export function row(channel, index, tune) {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = 'familiar-row channel-item';
  element.dataset.index = index;
  element.innerHTML = `<span class="familiar-number">${index + 1}</span>
    <span class="familiar-row-info"><strong>${escapeHtml(channel.name)}</strong>
    <small>${escapeHtml(channel.group || 'Ungrouped')}</small></span>
    <span class="favourite-star" aria-label="${isFavourite(channel) ? 'Favourite' : 'Not saved'}">${isFavourite(channel) ? '★' : ''}</span>
    <span class="familiar-action-hint">Actions →</span>`;
  element.onclick = tune;
  return element;
}
export function empty(text, detail) {
  const element = document.createElement('div');
  element.className = 'familiar-empty';
  element.innerHTML = `<h2>${escapeHtml(text)}</h2><p>${escapeHtml(detail)}</p>`;
  return element;
}
export function renderHeader(screen, source, count) {
  document.getElementById('browse-title').textContent = SCREENS[screen];
  document.getElementById('browse-source').textContent = source || 'No channel source';
  document.getElementById('browse-clock').textContent = new Date().toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
  document.getElementById('browse-hints').textContent =
    '↑ ↓ Navigate    OK Watch / Select    → Actions    ← Navigation    Back Return to TV';
  document.querySelectorAll('[data-screen]').forEach((element, index) => {
    element.classList.toggle('selected', index === screen);
    if (index === screen) element.setAttribute('aria-current', 'page');
    else element.removeAttribute('aria-current');
  });
  if (screen === 2) document.getElementById('browse-source').textContent += ` · ${count} saved streams available`;
}
