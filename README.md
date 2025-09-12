# Vite Live Preview

Vite build with preview.

- [Getting Started](#getting-started)
- [Configuration](#configuration)
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
  // Extend the configuration used by the Vite preview command.
  // (This is deeply merged with your main Vite config.)
  config: {},
})
```

All configuration options from the main Vite configuration (ie. the configuration where the plugin is added) are inherited, _except for `plugins` which cannot be safely inherited_.

As an example of the Vite config behing inherited, you can change the live preview server port by configuring the Vite `preview.port` option.

```ts
defineConfig({
  plugins: [preview()],
  preview: {
    port: 8080,
  },
})
```

If the preview server needs plugins (it has none by default), you must provide them again using the `config` option. Most plugins are unnecessary for preview serving, because they affect the build and not the preview server.

```ts
preview({
  config: {
    plugins: [/* Re-add plugins for the live preview server. */],
  },
})
```

The `reload` option also accepts an options object. The options shown are the defaults, and equivalent to passing `true`.

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
    clientPort: preview.port,
  }
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
