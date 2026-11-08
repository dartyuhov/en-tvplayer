import { isFavourite, toggleFavourite } from './favourites.js';
import * as guide from './guide-view.js';

let panel;
let selected;
let callback;
let focus = 0;
export function isOpen() {
  return !!panel && !panel.classList.contains('hidden');
}
export function open(channel, onClose) {
  selected = channel;
  callback = onClose;
  focus = 0;
  if (!panel) {
    panel = document.createElement('aside');
    panel.id = 'channel-actions';
    panel.className = 'familiar-actions';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Channel actions');
    document.getElementById('app').appendChild(panel);
  }
  panel.classList.remove('hidden');
  render();
}
function render() {
  panel.innerHTML =
    '<h2>Actions</h2><h3></h3><p></p><button type="button" id="favourite-action"></button><button type="button" id="guide-action">Programme guide</button>';
  panel.querySelector('h3').textContent = selected.name;
  panel.querySelector('p').textContent = 'Save this exact stream version without changing playback.';
  const favourite = panel.querySelector('#favourite-action');
  favourite.textContent = isFavourite(selected) ? 'Remove favourite' : 'Add to favourites';
  favourite.onclick = () => {
    if (toggleFavourite(selected)) close();
    else panel.querySelector('p').textContent = 'Could not save favourites. Try again.';
  };
  panel.querySelector('#guide-action').onclick = () => {
    focus = 1;
    guide.open(selected, updateFocus);
  };
  updateFocus();
}
function updateFocus() {
  panel.querySelectorAll('button').forEach((button, index) => {
    button.classList.toggle('focused', index === focus);
    if (index === focus) button.focus();
  });
}
export function close() {
  panel.querySelector('.focused')?.classList.remove('focused');
  panel.classList.add('hidden');
  if (callback) callback();
}
export function handle(action) {
  if (!isOpen()) return false;
  if (action === 'back' || action === 'left') close();
  if (action === 'up' || action === 'down') {
    focus = 1 - focus;
    updateFocus();
  }
  if (action === 'select') panel.querySelectorAll('button')[focus].click();
  return true;
}
