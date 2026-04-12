import { redirect } from "next/navigation";
import { SignUp } from "@clerk/nextjs";
import { isPreviewMode } from "@/lib/preview-mode";

export default function SignUpPage() {
  if (isPreviewMode()) {
    redirect("/library");
  }
  return (
    <main
      style={{ display: "grid", placeItems: "center", minHeight: "100svh" }}
    >
      <SignUp />
    </main>
  );
}
