import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Vendor hook from shadcn registry (installed via `npx shadcn add sidebar`,
    // file is not hand-edited — see CLAUDE.md). Upstream's SSR-safe pattern
    // (compute initial value inside the effect body) trips the newer
    // react-hooks/set-state-in-effect rule; disabled only for this exact file.
    files: ["hooks/use-mobile.ts"],
    rules: {
      "react-hooks/set-state-in-effect": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Vendored Claude Code skill/command assets — reference material, not app source.
    ".claude/**",
  ]),
]);

export default eslintConfig;
