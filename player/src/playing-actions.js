import * as guide from './guide-view.js';
import { toggleFavourite } from './favourites.js';

// Playback is owned by the existing player. Menu metadata/storage actions never
// load, pause, stop or select a stream.
export function bind(ui, browse, listen) {
  for (const id of ['playing-favourite-btn', 'playing-guide-btn']) {
    listen(document.getElementById(id), 'click', () => {
      const channel = ui.getCurrentChannel();
      if (!channel) return;
      if (id === 'playing-favourite-btn') {
        if (!toggleFavourite(channel)) ui.showTransientNotice('Could not save favourites. Try again.');
        browse.refresh();
        ui.refreshPlayingFavourite();
        return;
      }
      ui.stopInactivityTimer();
      guide.open(channel, () => document.getElementById('playing-guide-btn').focus());
    });
  }
}

export function handleMenu(action, ui, zap) {
  if (!ui.isRightSidebarOpen()) return false;
  switch (action) {
    case 'up':
      ui.rightSidebarNavigateUp();
      break;
    case 'down':
      ui.rightSidebarNavigateDown();
      break;
    case 'select':
      ui.rightSidebarSelect();
      break;
    case 'back':
      ui.toggleRightSidebar();
      break;
    case 'left':
      ui.toggleRightSidebar();
      ui.toggleSidebar();
      break;
    case 'channelUp':
      ui.toggleRightSidebar();
      zap(1);
      break;
    case 'channelDown':
      ui.toggleRightSidebar();
      zap(-1);
      break;
  }
  return true;
}
