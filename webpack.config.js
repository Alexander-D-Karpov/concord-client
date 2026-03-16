const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const webpack = require('webpack');

module.exports = (env, argv) => {
    const isProd = argv.mode === 'production';

    return {
        target: 'electron-renderer',
        entry: './src/renderer/index.tsx',
        output: {
            path: path.resolve(__dirname, 'dist/renderer'),
            filename: 'bundle.js',
            clean: true,
        },
        resolve: {
            extensions: ['.ts', '.tsx', '.js', '.jsx'],
            alias: {
                '@': path.resolve(__dirname, 'src/renderer'),
            },
            fallback: {
                path: false,
                fs: false,
                crypto: false,
            },
        },
        module: {
            rules: [
                {
                    test: /\.tsx?$/,
                    use: 'ts-loader',
                    exclude: /node_modules/,
                },
                {
                    test: /\.css$/,
                    use: [
                        'style-loader',
                        'css-loader',
                        {
                            loader: 'postcss-loader',
                            options: {
                                postcssOptions: {
                                    plugins: [
                                        require('tailwindcss'),
                                        require('autoprefixer'),
                                    ],
                                },
                            },
                        },
                    ],
                },
            ],
        },
        plugins: [
            new HtmlWebpackPlugin({
                template: './public/index.html',
            }),
            new CopyWebpackPlugin({
                patterns: [
                    {
                        from: path.resolve(__dirname, 'public'),
                        to: path.resolve(__dirname, 'dist/renderer'),
                        globOptions: {
                            ignore: ['**/index.html'],
                        },
                    },
                ],
            }),
            new webpack.DefinePlugin({
                'process.env.CONCORD_SERVER': JSON.stringify(
                    process.env.CONCORD_SERVER || 'localhost:9090'
                ),
            }),
        ],
        devtool: isProd ? 'source-map' : 'eval-source-map',
        optimization: isProd
            ? {
                minimize: true,
                usedExports: true,
            }
            : undefined,
    };
};