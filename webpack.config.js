const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin'); 


module.exports = {
  mode: 'development',
  entry: {
    index: './src/index.ts',
  },
  output: {
    filename: '[name].bundle.js',
    path: path.resolve('./dist'),
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
    static: './dist',
    open: true,
    hot: true,
  },
};
