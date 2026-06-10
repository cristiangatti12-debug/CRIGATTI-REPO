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
  ]),
  // Project-level rule overrides
  {
    rules: {
      // External API responses (Yahoo Finance, Groq) don't have TS types — allow any
      "@typescript-eslint/no-explicit-any": "off",
      // setState inside useEffect is intentional for initialisation patterns (lang, userId)
      "react-hooks/set-state-in-effect": "off",
    },
  },
]);

export default eslintConfig;
