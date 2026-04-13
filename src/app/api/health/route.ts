import { getFolio } from "@/lib/folio";

// Liveness/readiness probe. Returns `{status: 'ok'|'degraded', folio: {...}}`
// with 200 on healthy and 503 on degraded so ops dashboards can tell the
// difference. `folio.health()` reports adapter status, stale indices, and
// list-cache availability — see folio-db-next 0.2.0 release notes.
export async function GET() {
  const report = await getFolio().health();
  const degraded =
    report.adapter !== "ok" ||
    Object.values(report.volumes).some(
      (v) => v.adapter !== "ok" || v.indexStale,
    );
  const status = degraded ? "degraded" : "ok";
  return Response.json(
    { status, folio: report },
    {
      status: degraded ? 503 : 200,
      headers: { "Cache-Control": "private, no-store" },
    },
  );
}
