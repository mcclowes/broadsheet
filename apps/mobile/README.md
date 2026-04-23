# Broadsheet mobile

Expo (React Native) app for iOS and Android. Thin client over the Next.js API at `/api/articles/**`.

## Setup

```bash
cd apps/mobile
cp .env.example .env
# EXPO_PUBLIC_API_URL — deployed or tunneled web app URL
# EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY — same Clerk instance as the web app
npm install
npm run ios    # or: npm run android
```

## Architecture

- `app/` — Expo Router screens. `(tabs)/index.tsx` is the library list; `read/[id].tsx` is the reader stub; `sign-in.tsx` is email-code sign-in.
- `lib/api.ts` — fetch client. Bearer token comes from `@clerk/clerk-expo` `getToken()`.
- `lib/token-cache.ts` — Clerk session cache backed by `expo-secure-store`.

Auth uses the same Clerk instance as the web app — the existing API routes already call `auth()` from `@clerk/nextjs/server`, which verifies tokens from either client.

## Status

v0 scaffold. Follow-up issues:

- Native share extension (iOS) / Android `SEND` intent handler to save from other apps.
- Markdown rendering in the reader.
- Archived/read/highlights, offline cache.
