import type { Context, Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

const store = () => getStore({ name: "sic-metam-sodio-config", consistency: "strong" });
const KEY = "tolerancias.json";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

export default async (req: Request, _context: Context) => {
  const s = store();

  if (req.method === "GET") {
    const data = await s.get(KEY, { type: "json" });
    return json(data || null);
  }

  if (req.method === "PUT" || req.method === "POST") {
    let body: any;
    try {
      body = await req.json();
    } catch {
      return json({ error: "cuerpo JSON inválido" }, 400);
    }
    await s.setJSON(KEY, body);
    return json({ ok: true });
  }

  return json({ error: "método no soportado" }, 405);
};

export const config: Config = {
  path: "/api/config"
};
