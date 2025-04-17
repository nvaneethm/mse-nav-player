import babel from '@rollup/plugin-babel';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';

export default {
  input: 'src/index.ts',
  output: {
    file: 'dist/mse-nav-player.es5.js',
    format: 'iife',
    name: 'MseNavPlayer',
    sourcemap: true,
  },
  plugins: [
    resolve(),
    commonjs(),
    typescript({
      target: 'es5',
      module: 'esnext',
      tsconfig: './tsconfig.json',
    }),
    babel({
      babelHelpers: 'bundled',
      exclude: 'node_modules/**',
      extensions: ['.ts', '.js'],
      presets: [['@babel/preset-env', { targets: '> 0.25%, not dead' }]],
    }),
  ]
};