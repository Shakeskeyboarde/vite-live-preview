# Vite Live Preview

Vite build with preview.

- [Getting Started](#getting-started)
- [Configuration](#configuration)
  - [Reloading](#reloading)
  - [Plugins](#plugins)
- [The Problem](#the-problem)
- [Related Github Issues](#related-github-issues)

## Getting Started

First, please understand that live preview _does not support HMR_, but it does include a feature to automatically reload the browser page when the project is rebuilt. If you want to use HMR, you'll need to stick to the Vite dev server.

Install this package (and its Vite peer dependency) in your project.

```sh
npm install --save-dev vite vite-live-preview
```

Add the plugin to your Vite configuration.

```ts
import { defineConfig } from 'vite'
import preview from 'vite-live-preview'

export default defineConfig({
  plugins: [preview()],
})
```

Start a build with file watching.

```sh
npx vite build --watch
```

Any build with file watching enabled will also start a preview server.

## Configuration

The following configuration can be passed to the plugin. The defaults are shown, and all properties are optional.

```ts
preview({
  // Print extra debugging information to the console.
  debug: false,
  // Automatically reload the browser page on rebuild.
  reload: true,
  // Extend the configuration used by the Vite preview command. This is a
  // standard Vite UserConfig that is deeply merged over your main Vite config.
  config: {},
})
```

All configuration options from the main Vite configuration (ie. the configuration where the plugin is added) are inherited, _except for `plugins`._ See the [Plugins](#plugins) section for more information.

As an example of the Vite config behing inherited, you can change the live preview server port by configuring the Vite `preview.port` option.

```ts
defineConfig({
  plugins: [preview()],
  preview: {
    port: 8080,
  },
})
```

### Reloading

The `reload` option also accepts an options object. The options shown are the defaults, and equivalent to setting the option to `true` (default).

```ts
preview({
  reload: {
    // Whether or not auto reloading is enabled.
    enabled: true,
    // The number of milliseconds to wait after a rebuild before sending the
    // reload message to the browser.
    delay: 1000,
    // The port that the client should use to connect to the preview server's
    // websocket. This intended for cases where your preview server is behind a
    // reverse proxy (like a BFF/backend-for-frontend) that does not forward
    // websocket connections, so the websocket must bypass the proxy.
    clientPort: undefined,
  }
})
```

Reloading uses a websocket connection, similarly to how the Vite dev server implements HMR. The client script is automatically injected into all HTML responses served by the preview server. This client script normally uses the browser's current location to derive the websocket URL: current protocol (http->ws, https->wss), hostname, port, and [base](https://vite.dev/config/shared-options.html#base) path.

If the `clientPort` option is set, the client will use the current protocol, hostname, _provided `clientPort` value_, and base path. Setting the `clientPort` does not change the preview server's port. It just changes the port that the client uses if the browser location's port is incorrect due to reverse proxying or other custom local dev patterns.

### Plugins

Unfortunately, it's not safe to inherit the plugins from the main Vite config when starting the preview server. This is a limitation of the Vite plugin system, but also just a hard problem to solve.

If the preview server needs plugins (it has none by default), you must provide them again using the `config` option.

```ts
preview({
  config: {
    plugins: [/* Re-add plugins for the live preview server. */],
  },
})
```

Most plugins are unnecessary for previewing, so you can add them selectively, or just re-add all of the same plugins from the main config. If you want all plugins to be used for the build and for previewing, you can create a factory function that returns the plugins array. This is the best way to avoid the problems with sharing plugin instances between multiple Vite commands.

```ts
function getPlugins() {
  return [react(), /* etc. */];
}

defineConfig({
  plugins: [
    preview({ config: { plugins: getPlugins() } }),
    ...getPlugins(),
  ],
})
```

## The Problem

There are cases where the Vite dev server is not adequate. It does not bundle the project, and it relies on the browser to load ES modules directly. This can be slow (especially with "barrel" files), and does not accurately represent the final build.

The Vite `preview` command is a good alternative, but it does not do an initial build or automatically rebuild on file changes.

This tool is roughly equivalent to running `vite build --watch & vite preview` to start a build (with file watching), and a preview server in parallel. Additionally, browser page reloads will also be triggered after each rebuild.

## Related Github Issues

- [Vite Preview Watch Mode #5196](https://github.com/vitejs/vite/issues/5196)
- [Consider treeshaking module for serving files in dev mode #8237](https://github.com/vitejs/vite/issues/8237)
- [vite preview can't use --mode option #17410](https://github.com/vitejs/vite/issues/17410)
