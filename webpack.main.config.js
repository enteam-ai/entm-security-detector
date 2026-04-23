module.exports = {
  /**
   * This is the main entry point for your application, it's the first file
   * that runs in the main process.
   */
  entry: './src/main.js',
  // Put your normal webpack config below here
  module: {
    rules: require('./webpack.rules'),
  },
  // Keep native modules outside the webpack bundle. They load .node binaries
  // at runtime via node-pre-gyp (which has optional requires for mock-aws-s3,
  // aws-sdk, nock that webpack otherwise tries to resolve and fails on).
  // plugin-auto-unpack-natives ensures these stay unpacked in the asar.
  externals: {
    'active-win': 'commonjs2 active-win',
    'ps-list': 'commonjs2 ps-list',
  },
};
