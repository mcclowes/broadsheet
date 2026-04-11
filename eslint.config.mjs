import next from "eslint-config-next";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier";

const config = [
  {
    ignores: [
      ".next/**",
      ".vercel/**",
      "node_modules/**",
      "coverage/**",
      ".broadsheet-data/**",
      "apps/extension/dist/**",
      "next-env.d.ts",
    ],
  },
  ...next,
  ...nextCoreWebVitals,
  ...nextTypescript,
  prettier,
];

export default config;
