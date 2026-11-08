// Mock the external engine, retaining the app's real player.js handoff path.
// This records load arguments; it does not decode media or emulate Samsung.
class Player {
  static isBrowserSupported() {
    return true;
  }
  getNetworkingEngine() {
    return { registerRequestFilter() {}, registerResponseFilter() {} };
  }
  configure() {}
  addEventListener() {}
  async attach() {}
  async unload() {
    window.dispatchEvent(new CustomEvent('mock-playback-control', { detail: 'unload' }));
  }
  async destroy() {
    window.dispatchEvent(new CustomEvent('mock-playback-control', { detail: 'destroy' }));
  }
  async load(url, startTime, mimeType) {
    window.dispatchEvent(new CustomEvent('mock-playback-handoff', { detail: { url, startTime, mimeType } }));
  }
  getVariantTracks() {
    return [];
  }
  getAudioTracks() {
    return [];
  }
}

export default { Player, polyfill: { installAll() {} } };
