import { getActivePlaylist } from './config.js';
import { favouriteIdentity } from './logic.js';

const KEY = 'en_favourites_v1';
export function savedFavourites() {
  try {
    const data = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(data) ? data.filter((id) => typeof id === 'string') : [];
  } catch {
    return [];
  }
}
function identity(channel) {
  const playlist = getActivePlaylist();
  return playlist?.localId && channel ? favouriteIdentity(playlist.localId, channel) : null;
}
export function isFavourite(channel) {
  const id = identity(channel);
  return !!id && savedFavourites().includes(id);
}
export function toggleFavourite(channel) {
  const id = identity(channel);
  if (!id) return false;
  const saved = savedFavourites();
  const next = saved.includes(id) ? saved.filter((entry) => entry !== id) : [...saved, id];
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
    return true;
  } catch {
    return false;
  }
}
export function favouriteChannels(channels) {
  const playlistId = getActivePlaylist()?.localId;
  if (!playlistId) return [];
  const byId = new Map();
  for (const channel of channels) {
    const id = favouriteIdentity(playlistId, channel);
    if (!byId.has(id)) byId.set(id, channel);
  }
  return savedFavourites()
    .map((id) => byId.get(id))
    .filter(Boolean);
}
