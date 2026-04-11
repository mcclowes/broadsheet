import Link from "next/link";

export default function NotFound() {
  return (
    <main
      style={{ maxWidth: "32rem", margin: "4rem auto", padding: "0 1.5rem" }}
    >
      <h1 style={{ fontFamily: "var(--font-serif)" }}>Not found</h1>
      <p>That article isn&rsquo;t in your library.</p>
      <p>
        <Link href="/library">← Back to library</Link>
      </p>
    </main>
  );
}
