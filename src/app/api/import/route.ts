import { auth } from "@clerk/nextjs/server";
import { parseImportFile } from "@/lib/import";
import { importArticles } from "@/lib/articles";

const MAX_IMPORT_BYTES = 10 * 1024 * 1024; // 10 MB

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return Response.json(
      { error: "Expected multipart/form-data with a file field" },
      { status: 400 },
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return Response.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: 'Missing "file" field' }, { status: 400 });
  }

  if (file.size > MAX_IMPORT_BYTES) {
    return Response.json(
      { error: "File too large (max 10 MB)" },
      { status: 413 },
    );
  }

  let content: string;
  try {
    content = await file.text();
  } catch {
    return Response.json(
      { error: "Could not read file as text" },
      { status: 400 },
    );
  }

  const result = parseImportFile(content, file.name);
  if (!result) {
    return Response.json(
      {
        error:
          "Could not detect file format. Supported formats: Pocket (HTML), Instapaper (CSV), Omnivore (JSON).",
      },
      { status: 422 },
    );
  }

  if (result.items.length === 0) {
    return Response.json(
      { error: "No articles found in file" },
      { status: 422 },
    );
  }

  try {
    const stats = await importArticles(userId, result.items);
    return Response.json(
      { format: result.format, ...stats, total: result.items.length },
      { status: 200 },
    );
  } catch (err) {
    console.error("[api/import] import failed", err);
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}
