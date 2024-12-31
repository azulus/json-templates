// rollup.config.js
import commonjs from "@rollup/plugin-commonjs";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";

export default {
  input: "src/index.ts",
  output: {
    dir: "dist",
    format: "es",
    sourcemap: true,
  },
  plugins: [
    typescript({
      tsconfig: "./tsconfig.json",
      include: ["src/*.ts", "src/**/*.ts"],
    }),
    nodeResolve({
      extensions: [".ts", ".js"], // Resolve both TS and JS files
    }),
    commonjs(),
  ],
};
