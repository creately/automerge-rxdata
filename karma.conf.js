const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin'); 
module.exports = function (config) {
    config.set({
      frameworks: ['jasmine'],
      files: [
        'test/**/*.spec.ts',
        'dist_test/**/*.wasm',
      ],
      preprocessors: {
        'test/**/*.spec.ts': ['webpack']
      },
      webpack: {
        mode: 'development',
        devtool: 'source-map',
        entry: {
          index: './src/index.ts',
        },
        output: {
          filename: '[name].bundle.js',
          path: path.resolve('./dist_test'),
          clean: true,
          assetModuleFilename: 'assets/[name][ext][query]',
        },
        plugins: [
          new HtmlWebpackPlugin({
            title: 'Output Management',
          }),
        ],
        resolve: {
          extensions: ['.ts', '.js', '.wasm'],
        },
        module: {
          rules: [
            {
              test: /\.ts$/,
              use: 'ts-loader',
              exclude: /node_modules/,
            }
          ],
        },
        experiments: {
          asyncWebAssembly: true,
        },
        devServer: {
          static: './dist_test',
          open: true,
          hot: true,
        },
      },
      client: {
        captureConsole: true,
      },
      browsers: ['Chrome'],
      reporters: ['verbose'],
      singleRun: true,
      autoWatch: true,
      singleRun: false,
    });
  };
  