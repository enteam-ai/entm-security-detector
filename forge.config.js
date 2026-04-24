const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');
const fs = require('node:fs');
const path = require('node:path');

// Packages that webpack marks as externals (see webpack.main.config.js)
// so they must live on disk at runtime. @electron-forge/plugin-webpack
// aggressively prunes node_modules inside its packageAfterPrune hook,
// leaving node_modules/ empty even for externals. User-level hooks in
// forge.config.js run after all plugin hooks, so we restore the modules
// here as the last word before asar packaging.
const RUNTIME_MODULES = ['ps-list', 'active-win'];

module.exports = {
  hooks: {
    packageAfterPrune: async (_config, buildPath) => {
      const srcRoot = __dirname;
      for (const name of RUNTIME_MODULES) {
        const src = path.join(srcRoot, 'node_modules', name);
        const dest = path.join(buildPath, 'node_modules', name);
        if (!fs.existsSync(src)) {
          throw new Error(
            `packageAfterPrune: module not found on disk: ${src}. ` +
              `Did "npm install" run before packaging?`,
          );
        }
        fs.cpSync(src, dest, { recursive: true, force: true });
      }
    },
  },
  packagerConfig: {
    // Combined unpack pattern:
    // - **/*.node — any native addon (replaces plugin-auto-unpack-natives,
    //   which is now removed from plugins because it OVERRIDES this field
    //   with its own pattern in packageAfterCopy, wiping our entries)
    // - node_modules/{ps-list,active-win}/** — packages marked as webpack
    //   externals (see webpack.main.config.js). Runtime require() needs
    //   them on disk; asar.unpack extracts them to app.asar.unpacked/.
    //   active-win also ships ./bin helper binaries that must stay at
    //   their path to be exec'd.
    asar: {
      unpack: '**/{*.node,node_modules/{ps-list,active-win}/**}',
    },
    name: 'Enteam Interview Monitor',
    executableName: 'enteam-interview-monitor',
    appBundleId: 'com.enteam.interviewmonitor',
    appCategoryType: 'public.app-category.utilities',
    // Register enteam-interview:// URL scheme at OS level (read by Info.plist on macOS)
    protocols: [
      {
        name: 'Enteam Interview Monitor',
        schemes: ['enteam-interview'],
      },
    ],
  },
  rebuildConfig: {},
  makers: [
    // Windows installer: produces a .exe that installs to AppData and adds Start menu entries
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'enteam_interview_monitor',
        setupExe: 'Enteam-Interview-Monitor-Setup.exe',
      },
    },
    // macOS installer: drag-to-Applications .dmg
    // No explicit `name` — forge defaults to a per-arch filename
    // (Enteam Interview Monitor-1.0.0-arm64.dmg etc.) so the x64 and arm64
    // makers don't collide on the same output path.
    {
      name: '@electron-forge/maker-dmg',
      config: {
        format: 'ULFO',
      },
    },
    // macOS zip fallback (for auto-update infra later)
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin'],
    },
    // Linux packages (phase 2, not shipped yet but built for completeness)
    {
      name: '@electron-forge/maker-deb',
      config: {
        options: {
          maintainer: 'Enteam',
          homepage: 'https://enteam.ai',
          mimeType: ['x-scheme-handler/enteam-interview'],
        },
      },
    },
    {
      name: '@electron-forge/maker-rpm',
      config: {},
    },
  ],
  plugins: [
    // plugin-auto-unpack-natives intentionally NOT used here — its
    // packageAfterCopy hook replaces asar.unpack entirely, clobbering
    // our explicit pattern above. Native .node files are instead covered
    // by the **/*.node glob in asar.unpack.
    {
      name: '@electron-forge/plugin-webpack',
      config: {
        mainConfig: './webpack.main.config.js',
        renderer: {
          config: './webpack.renderer.config.js',
          entryPoints: [
            {
              html: './src/index.html',
              js: './src/renderer.js',
              name: 'main_window',
              preload: {
                js: './src/preload.js',
              },
            },
          ],
        },
      },
    },
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};
