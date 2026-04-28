# Clerk social auth — Apple and Google setup

How to wire Google and "Sign in with Apple" into Broadsheet's Clerk
authentication. The Next.js side is already done — `ClerkProvider` is mounted
in `src/app/layout.tsx` and the `<SignIn />` / `<SignUp />` components in
`src/app/sign-in/[[...sign-in]]/page.tsx` and
`src/app/sign-up/[[...sign-up]]/page.tsx` automatically render whatever social
providers you enable in the Clerk dashboard. **No code changes are required.**

This doc covers:

1. The Clerk side (one toggle per provider, plus credentials in production)
2. Google Cloud Console (OAuth client for the Google provider)
3. Apple Developer (Services ID + signing key for "Sign in with Apple")
4. Verifying the flow end-to-end and troubleshooting

### Domains used in this guide

- **Web app:** <https://broadsheet.marginalutility.dev/>
- **Clerk frontend / OAuth callback host (production):**
  `accounts.marginalutility.dev` — the shared Marginal Utility account
  system. The OAuth callback URL Google and Apple need is therefore
  `https://accounts.marginalutility.dev/v1/oauth_callback`.
- **Clerk dev frontend:** `<slug>.clerk.accounts.dev` (auto-assigned;
  shown in the Clerk dashboard's **API Keys** / provider panels).

> **Shared Clerk instance — heads-up.** `accounts.marginalutility.dev` is
> the root of a Clerk instance shared across multiple Marginal Utility
> sites, not a Broadsheet-only instance. Toggling a social provider or
> rotating its credentials affects every app on that instance. Coordinate
> with whoever owns the other apps before disabling a provider, and reuse
> existing Google/Apple credentials if they're already configured rather
> than creating a second OAuth client for the same Clerk instance.

> **Development vs production.** Clerk's *development* instance ships with
> shared OAuth credentials for most social providers — you can flip Google
> and Apple on with one click and they'll work on `localhost`. The shared
> credentials show a generic "via Clerk" consent screen and are explicitly
> **not allowed in production**. Everything in §2 and §3 is required when
> you promote to the production instance (or any time you want a branded
> consent screen in dev).

---

## 1. Clerk dashboard

1. Sign in to <https://dashboard.clerk.com> and pick the Broadsheet
   application. Confirm the **instance** selector at the top of the sidebar
   (Development vs Production) — the steps below need to be done in *both*
   instances when you're ready to ship to prod.
2. Open **User & Authentication → Social Connections**.
3. (Optional but recommended) Under **User & Authentication → Email, Phone,
   Username**, decide whether email/password should stay enabled alongside
   social. Broadsheet doesn't care either way; if you go social-only, also
   disable username.
4. Toggle **Google** and **Apple** on. In development you're done — the
   `<SignIn />` component will render "Continue with Google" and "Continue
   with Apple" buttons immediately.
5. For each provider, click the row to open its settings panel. The
   **Authorized redirect URI** Clerk shows you is what Google and Apple
   need:
   - **Production:** `https://accounts.marginalutility.dev/v1/oauth_callback`
   - **Development:** `https://<slug>.clerk.accounts.dev/v1/oauth_callback`
     (the `<slug>` is auto-assigned per Clerk app — copy it from the
     dashboard, don't guess).
   Keep that tab open — you'll paste the URI into Google and Apple in the
   next sections.

The env vars in `.env.example` (`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`,
`CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in`,
`NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up`) are already correct and don't need
to change for social auth.

---

## 2. Google

You need an OAuth 2.0 Client ID from Google Cloud Console, then paste its
client ID + secret into Clerk's Google panel.

### 2.1 Create or pick a Google Cloud project

1. Go to <https://console.cloud.google.com/>.
2. Top-left project picker → **New project** (or reuse one). Name it e.g.
   `broadsheet-prod`. Note the project ID.

### 2.2 Configure the OAuth consent screen

This is what users see when they click "Continue with Google" — the branded
"Broadsheet wants to access your Google account" page.

1. **APIs & Services → OAuth consent screen.**
2. **User Type:** *External*. Click **Create**.
3. Fill in:
   - **App name:** `Broadsheet`
   - **User support email:** an address you monitor
   - **App logo:** optional but recommended (square PNG ≤1 MB).
   - **App domain → Application home page:**
     `https://broadsheet.marginalutility.dev`
   - **Authorised domains:** `marginalutility.dev` covers both
     `broadsheet.marginalutility.dev` and the Clerk frontend
     `accounts.marginalutility.dev` in one entry. (For the shared Clerk dev
     instance, also add `clerk.accounts.dev`.)
   - **Developer contact:** your email.
4. **Scopes:** click **Add or Remove Scopes** and select `openid`,
   `userinfo.email`, `userinfo.profile`. That's all Clerk needs.
5. **Test users** (only relevant while the app is in *Testing* status): add
   any Google accounts you want to be able to sign in before the app is
   verified. Skip this if you publish straight away.
6. **Publish app.** Until you publish, only test users can sign in and
   Google shows an "unverified app" warning. For a public production app,
   click **Publish App** at the top of the consent screen page. Google may
   require verification (logo review, domain verification) if you request
   sensitive scopes — `openid email profile` are non-sensitive, so
   verification is usually instant.

### 2.3 Create the OAuth client

1. **APIs & Services → Credentials → Create credentials → OAuth client ID.**
2. **Application type:** *Web application*.
3. **Name:** `Broadsheet — Clerk` (free-form, for your reference).
4. **Authorised JavaScript origins:** leave empty. Clerk handles the popup
   from its own domain, not yours.
5. **Authorised redirect URIs:** paste the URL Clerk gave you in §1.5. Add
   both if you want the same OAuth client to cover dev and prod:
   - Production: `https://accounts.marginalutility.dev/v1/oauth_callback`
   - Development (shared Clerk dev frontend):
     `https://<slug>.clerk.accounts.dev/v1/oauth_callback`
6. **Create.** Copy the **Client ID** and **Client secret**.

### 2.4 Paste credentials into Clerk

1. Back in **Clerk dashboard → Social Connections → Google**, toggle off
   **Use shared credentials** (it's only on by default in development).
2. Paste the **Client ID** and **Client secret** from §2.3.
3. Save.

### 2.5 Test

1. `npm run dev`, open <http://localhost:3000/sign-in>.
2. Click **Continue with Google**. You should see the branded Broadsheet
   consent screen, not the generic Clerk one. Sign in with a real Google
   account, get redirected to `/library`.
3. In Clerk dashboard → **Users**, confirm a user was created with the
   Google OAuth provider attached.

---

## 3. Apple

"Sign in with Apple" is more involved. You need:

- An **Apple Developer Program** membership ($99/year). Free Apple IDs can't
  create the Services ID and key required.
- An **App ID** with the *Sign in with Apple* capability enabled.
- A **Services ID** — this is the OAuth `client_id`.
- A **Key** with *Sign in with Apple* enabled — this gives you a `.p8`
  private key file used to sign the client secret JWT.
- The Clerk frontend domain you'll authenticate from
  (`accounts.marginalutility.dev` in prod, the
  `<slug>.clerk.accounts.dev` host in dev) verified via a `.well-known`
  file Apple asks you to host — Clerk hosts this for you, see §3.2.7.

### 3.1 Create an App ID (Identifier)

Even if Broadsheet doesn't ship a native iOS app, Apple still requires a
"primary App ID" to associate with the Services ID.

1. <https://developer.apple.com/account/resources/identifiers/list>
2. **+ → App IDs → App.** Continue.
3. **Description:** `Broadsheet`. **Bundle ID:** explicit, e.g.
   `app.broadsheet.web` (anything reverse-DNS that you control).
4. Scroll the **Capabilities** list and tick **Sign In with Apple**. Leave
   it as a *Primary App ID*.
5. Continue → Register.

### 3.2 Create a Services ID

The Services ID is the OAuth client ID Clerk will use.

1. **+ → Services IDs.** Continue.
2. **Description:** `Broadsheet web sign-in`. **Identifier:** e.g.
   `app.broadsheet.web.signin`. Continue → Register.
3. Open the new Services ID from the list and tick **Sign In with Apple →
   Configure**.
4. **Primary App ID:** the one from §3.1.
5. **Domains and Subdomains:** the Clerk frontend host without scheme.
   - Production: `accounts.marginalutility.dev`
   - Development: the `<slug>.clerk.accounts.dev` host shown in Clerk's
     Apple panel.
6. **Return URLs:** the full redirect URI from Clerk's panel.
   - Production: `https://accounts.marginalutility.dev/v1/oauth_callback`
   - Development: `https://<slug>.clerk.accounts.dev/v1/oauth_callback`
7. Apple will generate a domain verification file
   (`apple-developer-domain-association.txt`) and tell you to host it at
   `/.well-known/apple-developer-domain-association.txt` on each domain.
   **Clerk hosts this for you on the Clerk frontend domain** — you don't
   need to add anything to Broadsheet's `public/` folder. Just click
   **Verify** in Apple's panel and it should pass.
8. Save.

### 3.3 Create the signing key

1. **Keys → + (Create a new key).**
2. **Key Name:** `Broadsheet Sign In with Apple`.
3. Tick **Sign In with Apple → Configure**, choose the App ID from §3.1,
   save.
4. Continue → Register → **Download** the `.p8` file. Apple only lets you
   download it once; if you lose it you have to revoke the key and make a
   new one.
5. Note the **Key ID** (10-character string shown next to the key name) and
   your **Team ID** (top right of the developer portal — also 10 chars).

### 3.4 Paste credentials into Clerk

In **Clerk dashboard → Social Connections → Apple**, fill in:

| Field                  | Value                                                       |
| ---------------------- | ----------------------------------------------------------- |
| **Apple Services ID**  | The Services ID from §3.2 (e.g. `app.broadsheet.web.signin`) |
| **Apple Team ID**      | From §3.3.5                                                 |
| **Apple Key ID**       | From §3.3.5                                                 |
| **Apple Private Key**  | Paste the **entire contents** of the `.p8` file, including the `-----BEGIN PRIVATE KEY-----` / `-----END PRIVATE KEY-----` lines |

Save. Clerk will use these to mint the short-lived client-secret JWT Apple
requires on every token exchange.

### 3.5 Test

1. Open `/sign-in` and click **Continue with Apple**. You'll be sent to
   `appleid.apple.com`, sign in, and be asked once whether to share or hide
   your real email.
2. If the user picks "Hide My Email", Apple gives Clerk a relay address of
   the form `<random>@privaterelay.appleid.com`. Broadsheet treats this as
   the canonical email — the digest emails (`src/lib/digest`) will go
   through Apple's relay and reach the user. This is normal and expected.
3. Confirm a user was created in Clerk dashboard → Users with the Apple
   provider attached.

> **Apple gotcha — name on first sign-in only.** Apple sends the user's
> name *only* on the very first authorization. If sign-in fails partway
> through and the user retries, Apple won't re-send it; Clerk will store
> the email but no display name. To force a re-send during testing, the
> user can revoke Broadsheet from <https://appleid.apple.com> → *Sign in
> with Apple* → *Stop Using Apple ID*.

---

## 4. Verifying it all works

Manual smoke test — do this in both your dev instance after §2/§3, and
again in production after promoting:

1. From a private/incognito window, visit `/sign-in`.
2. Confirm both **Continue with Google** and **Continue with Apple** buttons
   render.
3. Sign in via Google with a fresh account → land on `/library` → save an
   article via the URL form → confirm it appears.
4. Sign out (user menu → Sign out, see `src/app/components/user-menu.tsx`).
5. Sign in via Apple with a fresh account → repeat.
6. In Clerk dashboard → **Users**, confirm both users exist with the
   correct OAuth provider in the *Connected accounts* column.

### Updating the Playwright e2e test

`e2e/` and the `npm run test:e2e` / `test:e2e:prod-smoke` flows currently
sign in with username + password (`E2E_CLERK_USER_USERNAME` /
`E2E_CLERK_USER_PASSWORD` — see `.env.example` and the *Uptime monitoring*
section of `README.md`). Social auth flows can't be driven headlessly in CI
because Google and Apple block automated browsers, so **leave the e2e user
on email/password**. Don't disable email/password auth in Clerk unless you
also rewrite the e2e auth helper to use a Clerk testing token.

---

## 5. Troubleshooting

**`redirect_uri_mismatch` from Google.** The redirect URI in Google Cloud
Console (§2.3.5) doesn't byte-for-byte match what Clerk is sending. Most
common cause: you set up the dev instance's redirect URI but switched Clerk
to production (different frontend domain). Add the production redirect URI
to the same OAuth client, or create a separate one — both are fine.

**`invalid_client` from Apple.** Either the Services ID, Team ID, or Key ID
in Clerk doesn't match Apple, or the `.p8` key has been revoked. Re-check
the three IDs against Apple's portal. If you've recently rotated the key,
regenerate the secret (Clerk does this automatically on save — re-paste the
key contents to force it).

**"Domain could not be verified" on Apple's Services ID.** Apple is
fetching `https://<your-domain>/.well-known/apple-developer-domain-association.txt`
and either getting a 404 or wrong content. The domain you put in Apple's
*Domains and Subdomains* field must be the Clerk frontend domain (where
Clerk hosts the verification file) — i.e. `accounts.marginalutility.dev`,
**not** `broadsheet.marginalutility.dev`. If you *are* using the Clerk
domain and it still fails, wait a few minutes for DNS/CDN propagation
and retry.

**Google consent screen says "Google hasn't verified this app".** Your
OAuth consent screen is in *Testing* status with sensitive scopes, or
publishing is in review. For `openid email profile` only, click **Publish
App** and the warning should go away within minutes.

**Apple sign-in works in dev but redirects to a 404 in prod.** You forgot
to redo §1 / §3 in the production Clerk instance. Each Clerk instance has
its own social connection config; switching the dashboard's instance
selector (top-left) shows you which one you're editing.

**A user signed in with Google, then later tried Apple with the same
email — got "account already exists".** Clerk's default account-linking
mode requires the user to first sign in with the original provider, then
link the new one from the user-profile page. If you want automatic linking
by verified email, change **User & Authentication → Account Linking**
settings in the Clerk dashboard. Be aware of the security trade-off
(silently linking on email-match assumes the email is verified by both
providers — Google and Apple both do verify, so this is generally safe,
but document the choice).
