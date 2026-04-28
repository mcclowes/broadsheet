import { SignIn } from "@clerk/nextjs";

// `welcome=1` triggers the masthead title-card animation on first paint of
// /library — see WelcomeOverlay. Cleared from the URL once it plays.
const POST_LOGIN_REDIRECT = "/library?welcome=1";

export default function SignInPage() {
  return (
    <main
      style={{ display: "grid", placeItems: "center", minHeight: "100svh" }}
    >
      <SignIn
        forceRedirectUrl={POST_LOGIN_REDIRECT}
        signUpForceRedirectUrl={POST_LOGIN_REDIRECT}
      />
    </main>
  );
}
