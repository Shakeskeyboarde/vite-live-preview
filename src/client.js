console.log('[vite] connecting...');

// XXX: The following line must stay exactly as-is so that the real base can be
// injected at runtime.
const base = '/';
const pingUrl = window.location.protocol + '//' + window.location.host + base;
const socketUrl = (window.location.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + window.location.host + base;
const socket = new WebSocket(socketUrl);

socket.addEventListener('open', () => {
  console.log('[vite] connected.');
});

socket.addEventListener('message', (event) => {
  try {
    const message = JSON.parse(event.data);

    if (message?.type === 'full-reload') {
      window.location.reload();
    }
  }
  catch {
    // Ignore invalid messages.
  }
});

socket.addEventListener('close', (event) => {
  if (!event.wasClean) {
    // Only print this message when the server is down, not when a page
    // navigation occurs. Server down should be a non-clean close, and page
    // navigation should be clean cose.
    console.log('[vite] server connection lost. polling for restart...');
  }

  ping().then(() => {
    // Reload the page when the server is back up to get the latest changes.
    window.location.reload();
  });
});

/**
 * Make repeating ping requests to the preview server to check if it is up,
 * with a delay between requests.
 */
async function ping() {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      // Fetch should reject a networking error if the server is down.
      await fetch(pingUrl, {
        mode: 'no-cors',
        headers: {
          // Custom headers won't be included in a request with no-cors so
          // (ab)use one of the safe-listed headers to identify the ping request.
          Accept: 'text/x-vite-ping',
        },
      });

      return;
    }
    catch {
      // Ping failed. Wait for a second and try again.
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
};
