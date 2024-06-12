# Vite Live Preview

Start preview server which updates on file changes.

## Usage

Install the package in your project.

```sh
npm install --save-dev vite-live-preview
```

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

## Options

All Vite [preview command options](https://vitejs.dev/guide/cli#vite-preview) are supported, in addition to the following options.

### `--reload [boolean]`

Allow or disable automatic browser reloading on rebuild. The default is true.

Use `--reload false` to disable automatic reloading. Manually reloading the page after a rebuild will still show the updated content.

## The Problem

There are cases where the Vite dev server is not adequate. It does not bundle the project, and it relies on the browser to load ES modules directly. This can be slow (especially with "barrel" files), and does not accurately represent the final build.

The Vite `preview` command is a good alternative, but it does not do an initial build or automatically rebuild on file changes.

This tool is roughly equivalent to running `vite build --watch & vite preview` to start a build (with file watching), and a preview server, in parallel. Additionally, it will also automatically trigger browser reloads after the watcher triggers a rebuild.

### Related Github Issues

- [Vite Preview Watch Mode #5196](https://github.com/vitejs/vite/issues/5196)
- [Consider treeshaking module for serving files in dev mode #8237](https://github.com/vitejs/vite/issues/8237)
- [vite preview can't use --mode option #17410](https://github.com/vitejs/vite/issues/17410)
