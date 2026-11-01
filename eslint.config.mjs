import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Installed agent-skill directories vendor minified bundles
    // (modern-screenshot.umd.js alone produced 156 findings). Tool code is not
    // project source and should not be linted as if it were.
    ".claude/**",
    ".agents/**",
    ".codex/**",
    ".tmpwork/**",
  ]),
]);

export default eslintConfig;
