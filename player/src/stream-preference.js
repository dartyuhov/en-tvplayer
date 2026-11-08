import { getActivePlaylist, getSettings, saveSettings } from './config.js';

export function rememberGuideVersion(channel) {
  const playlist = getActivePlaylist()?.localId;
  if (!playlist || !channel.guideId) return;
  const key = JSON.stringify([playlist, channel.guideId]);
  saveSettings({ lastGuideVersions: { ...getSettings().lastGuideVersions, [key]: channel.url } });
}
export function lastGuideVersion(channel) {
  const settings = getSettings();
  const key = JSON.stringify([getActivePlaylist()?.localId, channel.guideId]);
  return settings.lastGuideVersions?.[key] || settings.lastChannelUrl;
}
