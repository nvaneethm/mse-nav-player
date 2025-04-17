import babel from '@rollup/plugin-babel';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';

const extensions = ['.ts', '.js'];

const plugins = [
  resolve(),
  commonjs(),
  typescript({ tsconfig: './tsconfig.json' }),
];

export default [
  // ES6 Module (modern)
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/mse-nav-player.es6.js',
      format: 'esm',
      sourcemap: true,
    },
    plugins: plugins
  },

  // ES5 UMD (legacy)
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/mse-nav-player.es5.js',
      format: 'iife',
      name: 'MseNavPlayer',
      sourcemap: true,
    },
    plugins: [
      ...plugins,
      babel({
        babelHelpers: 'bundled',
        exclude: 'node_modules/**',
        extensions,
        presets: [['@babel/preset-env', { targets: '> 0.25%, not dead' }]],
      }),
    ]
  }
];