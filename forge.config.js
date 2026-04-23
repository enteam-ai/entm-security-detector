const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');

module.exports = {
  packagerConfig: {
    // ps-list and active-win are marked as webpack externals (see
    // webpack.main.config.js) so webpack emits runtime require() calls for
    // them. Those requires only resolve if the modules are physically on
    // disk — asar.unpack extracts their node_modules paths to
    // app.asar.unpacked/ where Node's resolver can find them. Also needed
    // for active-win's bin/ helper binaries that it execs at runtime.
    asar: {
      unpack: '**/node_modules/{ps-list,active-win,@sindresorhus/is-plain-object,pidtree}/**',
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
    {
      name: '@electron-forge/plugin-auto-unpack-natives',
      config: {},
    },
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
