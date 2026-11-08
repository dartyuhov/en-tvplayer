// Personal builds are updated manually with the verified existing author
// certificate. Ignore upstream consent and cached links, preserving settings.
export function hasConsented() {
  return false;
}

export function consentAsked() {
  return true;
}

// Keep the existing Settings integration; its toggle cannot enable updates.
export function setConsented() {}

export function compareVersions(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export async function checkForUpdate() {
  return null;
}

export function sendUsagePing() {}
