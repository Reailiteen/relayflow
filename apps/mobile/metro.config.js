const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Metro only watches the app directory by default, so edits to packages/* would
// not trigger a reload. Watching the workspace root is what makes the shared
// packages behave like local source.
config.watchFolders = [workspaceRoot];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// Respect the "exports" field so @relayflow/data/native and /admin resolve to
// different files — the subpath split is a security boundary, not a convenience.
config.resolver.unstable_enablePackageExports = true;

module.exports = config;
