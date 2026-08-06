import type { Context, Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

const PROCESOS = ["previo", "durante", "post"];
const store = () => getStore({ name: "sic-metam-sodio-evaluaciones", consistency: "strong" });

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

export default async (req: Request, _context: Context) => {
  const url = new URL(req.url);
  const proceso = url.searchParams.get("proceso");
  const id = url.searchParams.get("id");
  const s = store();

  if (req.method === "GET") {
    const procesosToRead = proceso ? [proceso] : PROCESOS;
    if (proceso && !PROCESOS.includes(proceso)) return json({ error: "proceso inválido" }, 400);

    const results: Record<string, unknown> = {};
    for (const p of procesosToRead) {
      const { blobs } = await s.list({ prefix: `${p}/` });
      const items = await Promise.all(
        blobs.map(async b => await s.get(b.key, { type: "json" }))
      );
      results[p] = items.filter(Boolean);
    }
    return json(proceso ? results[proceso] : results);
  }

  if (req.method === "POST" || req.method === "PUT") {
    let body: any;
    try {
      body = await req.json();
    } catch {
      return json({ error: "cuerpo JSON inválido" }, 400);
    }
    if (!body || !PROCESOS.includes(body.proceso)) return json({ error: "proceso inválido" }, 400);
    const evalId: string = body.id || crypto.randomUUID();
    const record = { ...body, id: evalId, actualizado: new Date().toISOString() };
    await s.setJSON(`${body.proceso}/${evalId}.json`, record);
    return json(record, 201);
  }

  if (req.method === "DELETE") {
    if (!proceso || !id || !PROCESOS.includes(proceso)) return json({ error: "proceso e id requeridos" }, 400);
    await s.delete(`${proceso}/${id}.json`);
    return json({ ok: true });
  }

  return json({ error: "método no soportado" }, 405);
};

export const config: Config = {
  path: "/api/evaluaciones"
};
