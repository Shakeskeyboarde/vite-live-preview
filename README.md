# Vite Live Preview

Vite build with preview.

- [Getting Started](#getting-started)
- [CLI](#cli)
  - [Option `--reload [boolean]`](#option---reload-boolean)
  - [Vite Preview Options](#vite-preview-options)
- [Plugin](#plugin)
  - [Option `reload: boolean`](#option-reload-boolean)
  - [Option `enable: boolean`](#option-enable-boolean)
- [Building for Development](#building-for-development)
- [Debugging](#debugging)
- [The Problem](#the-problem)
  - [Related Github Issues](#related-github-issues)


## Getting Started

Install the package in your project.

```sh
npm install --save-dev vite-live-preview
```

Once installed, you can either use the [CLI](#cli) or the [plugin](#plugin).

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

The command can be run with `npx` if you prefer not to add it as a dependency.

```sh
npx vite-live-preview
```

### Option `--reload [boolean]`

Allow or disable automatic browser reloading on rebuild. The default is true.

Use `--reload false` to disable automatic reloading. Manually reloading the page after a rebuild will still show the updated content.

### Vite Preview Options

All Vite [preview command options](https://vitejs.dev/guide/cli#vite-preview) are also supported.

## Plugin

This utility can also be used as a Vite plugin.

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

Allow or disable automatic browser reloading on rebuild. The default is true. Set it to false to require manual browser reloading.

### Option `enable: boolean`

Forcibly enable or disable the plugin.

By default, the plugin is automatically enabled when the mode starts with `preview`. If this option is set to true, then the plugin is enabled even if a preview mode is not present. If this option is false, then the plugin is disabled even if a preview mode is present.

## Building for Development

Vite's build command, both in the CLI and the JavaScript API, is biased towards building for production. This means the live preview will also represent a production build by default.

To live preview a development build, set the `NODE_ENV=development` environment variable. This can be set in your shell before starting the live preview, or it can be added to a Vite [environment file](https://vitejs.dev/guide/env-and-mode.html#env-files).

Example: `.env.preview`

```
NODE_ENV=development
```

With the above environment file, running `vite build --mode=preview` or `vite-live-preview` will build the project in development mode. You will need to add other environment files if you set the mode to something other than `preview`.

## Debugging

The vite `-d, --debug [feat]` option is supported, and the following feature names are available for this tool.

- `live-preview`: General debugging information.
- `live-preview-request`: Log preview server requests.

## The Problem

There are cases where the Vite dev server is not adequate. It does not bundle the project, and it relies on the browser to load ES modules directly. This can be slow (especially with "barrel" files), and does not accurately represent the final build.

The Vite `preview` command is a good alternative, but it does not do an initial build or automatically rebuild on file changes.

This tool is roughly equivalent to running `vite build --watch & vite preview` to start a build (with file watching), and a preview server, in parallel. Additionally, it will also automatically trigger browser reloads after the watcher triggers a rebuild.

### Related Github Issues

- [Vite Preview Watch Mode #5196](https://github.com/vitejs/vite/issues/5196)
- [Consider treeshaking module for serving files in dev mode #8237](https://github.com/vitejs/vite/issues/8237)
- [vite preview can't use --mode option #17410](https://github.com/vitejs/vite/issues/17410)
