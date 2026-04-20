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
  {
    // Structural enforcement of the CLAUDE.md rule: "Every function in
    // src/lib/** that touches user data takes userId as a parameter.
    // auth() is only called at request-entry boundaries." Rules that live
    // only in docs decay — this one fails the build if someone regresses.
    files: ["src/lib/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@clerk/nextjs/server",
              message:
                "Auth must flow via the userId parameter. Don't call auth() from src/lib/**; call it at the route-handler / page-component boundary and pass the resulting AuthedUserId down.",
            },
            {
              name: "@clerk/nextjs",
              message:
                "Client-side Clerk hooks belong in components, not in src/lib/**.",
            },
          ],
        },
      ],
    },
  },
];

export default config;
