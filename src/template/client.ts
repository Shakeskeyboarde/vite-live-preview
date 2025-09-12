/**
 * The following declarations indicate placeholders that will be replaced
 * during the build process.
 */
declare const __LIVE_PREVIEW_CLIENT_PORT__: number | undefined;
declare const __LIVE_PREVIEW_CLIENT_BASE__: string;

const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
const port = __LIVE_PREVIEW_CLIENT_PORT__;
const host = port == null ? location.host : `${location.hostname}:${port}`;
const base = __LIVE_PREVIEW_CLIENT_BASE__;
const socketUrl = protocol + '//' + host + base;

log('connecting...');
connect();

let connected = false;
let reconnecting = false;

/**
 * @param {boolean} [reconnecting]
 */
function connect(): void {
  const socket = new WebSocket(socketUrl);

  socket.addEventListener('open', () => {
    if (reconnecting) {
      // Reload the window on reconnection because a reload event may have
      // been missed while the socket was disconnected.
      location.reload();
      return;
    }

    // Any future connection will be considered a reconnection after
    // successfully connecting once.
    reconnecting = true;
    connected = true;

    log('connected.');
  });

  socket.addEventListener('message', (event) => {
    try {
      const message = JSON.parse(event.data);

      if (message?.type === 'page-reload') {
        location.reload();
      }
    }
    catch {
      // ignore invalid messages
    }
  });

  socket.addEventListener('close', (event) => {
    if (!event.wasClean && connected) {
      // Only print this message when the server is down, not when a page
      // navigation occurs. Server down should be a non-clean close, and page
      // navigation should be clean cose.
      log('server connection lost. reconnecting...');
    }

    // Reconnect after a short delay.
    setTimeout(() => connect(), 1000);
    connected = false;
  });
}

/**
 * @param {string} message
 */
function log(message: string): void {
  console.log(`[vite-live-preview] ${message}`);
}
