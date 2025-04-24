import babel from "@rollup/plugin-babel"
import resolve from "@rollup/plugin-node-resolve"
import commonjs from "@rollup/plugin-commonjs"
import typescript from "@rollup/plugin-typescript"
import terser from "@rollup/plugin-terser"
const extensions = [".ts", ".js"]

const pluginsBase = [
  resolve(),
  commonjs(),
  typescript({ tsconfig: "./tsconfig.json" }),
  terser(),
]

const babelLegacy = babel({
  babelHelpers: "bundled",
  extensions,
  exclude: "node_modules/**",
  presets: [
    [
      "@babel/preset-env",
      {
        targets: "> 0.25%, not dead, IE 11",
        useBuiltIns: "usage",
        corejs: 3,
      },
    ],
  ],
})

export default [
  {
    input: "src/index.ts",
    output: {
      file: "dist/mse-nav-player.es6.js",
      format: "esm",
      sourcemap: true,
    },
    plugins: [...pluginsBase],
  },
  {
    input: "src/index.ts",
    output: {
      file: "dist/mse-nav-player.es5.js",
      format: "iife",
      name: "MseNavPlayer",
      sourcemap: true,
    },
    plugins: [...pluginsBase, babelLegacy, terser()],
  },
]
