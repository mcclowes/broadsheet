import { redirect } from "next/navigation";
import { SignIn } from "@clerk/nextjs";
import { isPreviewMode } from "@/lib/preview-mode";

export default function SignInPage() {
  if (isPreviewMode()) {
    // No Clerk in preview — send visitors straight into the demo library.
    redirect("/library");
  }
  return (
    <main
      style={{ display: "grid", placeItems: "center", minHeight: "100svh" }}
    >
      <SignIn />
    </main>
  );
}
