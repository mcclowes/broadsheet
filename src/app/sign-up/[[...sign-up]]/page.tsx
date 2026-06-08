import { SignUp } from "@clerk/nextjs";

const POST_LOGIN_REDIRECT = "/library?welcome=1";

export default function SignUpPage() {
  return (
    <main
      style={{ display: "grid", placeItems: "center", minHeight: "100svh" }}
    >
      <SignUp
        forceRedirectUrl={POST_LOGIN_REDIRECT}
        signInForceRedirectUrl={POST_LOGIN_REDIRECT}
      />
    </main>
  );
}
