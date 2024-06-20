# Vite Live Preview

Vite build with preview.

- [Getting Started](#getting-started)
- [Plugin](#plugin)
  - [Option `reload: boolean`](#option-reload-boolean)
  - [Option `config: LivePreviewConfig`](#option-config-livepreviewconfig)
  - [Option `plugins: PluginOption[]`](#option-plugins-pluginoption)
- [CLI](#cli)
  - [Option `--reload [boolean]`](#option---reload-boolean)
  - [Vite Preview Options](#vite-preview-options)
- [Building for Development](#building-for-development)
- [JavaScript API Limitations](#javascript-api-limitations)
- [Debugging](#debugging)
- [The Problem](#the-problem)
  - [Related Github Issues](#related-github-issues)


## Getting Started

First, please understand that live preview _does not support HMR._ If you want to use HMR, you'll need to stick to the Vite dev server. Live preview uses Vite's build command with watching enabled to trigger rebuilds on code changes, and then tells connected browsers to do a full page reload after each rebuild.

Install the package in your project.

```sh
npm install --save-dev vite-live-preview
```

Once installed, you can either use the [CLI](#cli) or the [plugin](#plugin).

## Plugin

Add the plugin to your Vite configuration.

```ts
import { defineConfig } from 'vite'
import livePreview from 'vite-live-preview'

export default defineConfig({
  plugins: [livePreview({ /* options */ })]
  preview: { /* (optional) configure the preview server. */ }
})
```

Start a build in preview mode. A preview mode is any mode string that begins with `preview`.

```sh
vite build --mode=preview
```

> Note: A preview mode implies watching, so the Vite `--watch` flag is optional.

### Option `reload: boolean`

Allow or disable automatic browser reloading on rebuild. Set it to false to require manual browser reloading. The default is true.

### Option `config: LivePreviewConfig`

Provide configuration overrides that will be deeply merged when live preview is enabled. This can be used to set options like `build.sourcemap` or `outDir` for the preview build.

### Option `plugins: PluginOption[]`

Provide plugins that will only be added to the preview server configuration. See also the [JavaScript API Limitations](#javascript-api-limitations) section.

## CLI

Add a `start` script to your `package.json` file.

```json
{
  "scripts": {
    "start": "vite-live-preview"
  }
}
```

Start the live preview.

```sh
npm start
```

The command can also be run with `npx` if you prefer not to add it as a dependency.

```sh
npx vite-live-preview
```

### Option `--reload [boolean]`

Allow or disable automatic browser reloading on rebuild. The default is true.

Use `--reload false` to disable automatic reloading. Manually reloading the page after a rebuild will still show the updated content.

### Vite Preview Options

All Vite [preview command options](https://vitejs.dev/guide/cli#vite-preview) are also supported.

If the `--mode <mode>` option is used, the value _must_ start with `preview`. The default mode is `preview` if the option is not used. Vite configuration files cannot override preview modes.

## Building for Development

Live preview is a build command first, with a preview server added. Vite's build command is biased towards building for production. This means that a live preview build (like any build) is production by default.

Setting up a development build with live preview is the same as setting up any development build. Set the `NODE_ENV=development` environment variable. This can be set in your shell before starting the live preview, or it can be added to a Vite [environment file](https://vitejs.dev/guide/env-and-mode.html#env-files).

```ini
# .env.preview
NODE_ENV=development
```

With the above `.env.preview` environment file, running `vite build --mode=preview` or `vite-live-preview` will build the project in development mode. You will need to add other environment files if you set the mode to something other than `preview`.

See the Vite documentation on [Environment Variables and Modes](https://vitejs.dev/guide/env-and-mode#modes) for more information.

## JavaScript API Limitations

If you use the JavaScript API `build()` command, the preview server will not inherit any plugins that are added "inline".

```ts
await build({
  plugins: [
    // Plugins included in this array are "inline" (not loaded from a
    // config file), and will not be inherited by the preview server.
    livePreview({
      plugins: [
        // You can re-add the plugins here if needed, as well as any
        // additional preview server specific plugins.
      ],
    }),
  ],
})
```

The common convention for plugins is to provide a "factory" function which returns the plugin instance. This allows plugins to accept options, but also provides a closure where a plugin instance can share state between individual hook methods. This is commonly used to save parts of the resolved configuration for use in later hooks, but it can be used for any plugin state.

Unfortunately, the factory return value is added to the plugins array, not the plugin factory functions themselves. So, there is no way to create new instances of the plugins with independent state before passing them to the preview command. Passing the build command's plugin instances to the preview command would result in plugin hooks being called out of order or more times than expected, and any shared state would be shared between the two commands.

## Debugging

The vite `-d, --debug [feat]` option is supported, and the following feature names are available for this tool.

- `live-preview`: General debugging information.
- `live-preview-request`: Log preview server requests.

## The Problem

There are cases where the Vite dev server is not adequate. It does not bundle the project, and it relies on the browser to load ES modules directly. This can be slow (especially with "barrel" files), and does not accurately represent the final build.

The Vite `preview` command is a good alternative, but it does not do an initial build or automatically rebuild on file changes.

This tool is roughly equivalent to running `vite build --watch & vite preview` to start a build (with file watching), and a preview server in parallel. Additionally, browser page reloads will also be triggered after each rebuild.

### Related Github Issues

- [Vite Preview Watch Mode #5196](https://github.com/vitejs/vite/issues/5196)
- [Consider treeshaking module for serving files in dev mode #8237](https://github.com/vitejs/vite/issues/8237)
- [vite preview can't use --mode option #17410](https://github.com/vitejs/vite/issues/17410)
