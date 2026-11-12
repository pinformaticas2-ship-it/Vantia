import { useLayoutEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MessageCirclePlus } from "lucide-react";
import InstagramPanel from "../components/InstagramPanel";
import VantiaBrand from "../components/VantiaBrand";
import { t } from '../lib/i18n';

// Demostración pública de Comunicación Externa → Instagram, sin sesión y con
// datos inventados. Es el mismo InstagramPanel de la app: aquí se interceptan
// sus llamadas a /api/instagram y se responden desde memoria, así que nada
// sale del navegador ni toca una cuenta real. Sirve para enseñarlo o grabarlo.

const ahora = () => new Date().toISOString();
const hace = (min: number) => new Date(Date.now() - min * 60_000).toISOString();

const imagen = (tono: number, texto: string) =>
  "data:image/svg+xml;utf8," + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="540" height="960"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">`
    + `<stop offset="0" stop-color="hsl(${tono},55%,38%)"/><stop offset="1" stop-color="hsl(${tono + 40},60%,22%)"/></linearGradient></defs>`
    + `<rect width="540" height="960" fill="url(#g)"/><text x="270" y="470" font-size="46" font-weight="700" fill="white" text-anchor="middle" font-family="sans-serif">${texto}</text></svg>`,
  );

interface Contacto { igsid: string; username: string; nombre: string; noLeidos: number; inboundMin: number }
interface Msg { id: string; direccion: "entrante" | "saliente"; texto: string; adjuntos: null; enviado_por: string | null; created_at: string }
interface Coment { id: string; text: string; username: string; timestamp: string; hidden: boolean; like_count: number; replies: { data: { id: string; text: string; username: string; timestamp: string }[] } }

function estadoInicial() {
  const contactos: Contacto[] = [
    { igsid: "d1", username: "marta.coll", nombre: "Marta Coll", noLeidos: 1, inboundMin: 2 },
    { igsid: "d2", username: "jorge_ruiz", nombre: "Jorge Ruiz", noLeidos: 0, inboundMin: 45 },
    { igsid: "d3", username: "lauradiaz.bcn", nombre: "Laura Díaz", noLeidos: 0, inboundMin: 60 * 30 },
  ];
  const mensajes: Record<string, Msg[]> = {
    d1: [
      { id: "m1", direccion: "entrante", texto: "Buenas tardes", adjuntos: null, enviado_por: null, created_at: hace(12) },
      { id: "m2", direccion: "saliente", texto: "¡Hola, Marta! ¿En qué podemos ayudarte?", adjuntos: null, enviado_por: "Equipo del despacho", created_at: hace(10) },
      { id: "m3", direccion: "entrante", texto: "Mi padre falleció hace un mes y no sabemos cómo empezar con la herencia. ¿Lleváis estos temas?", adjuntos: null, enviado_por: null, created_at: hace(2) },
    ],
    d2: [
      { id: "m4", direccion: "entrante", texto: "¿Tenéis cita esta semana para un tema de despido?", adjuntos: null, enviado_por: null, created_at: hace(60) },
      { id: "m5", direccion: "saliente", texto: "Sí, Jorge. Te podemos ver el jueves a las 10:00. ¿Te va bien?", adjuntos: null, enviado_por: "Equipo del despacho", created_at: hace(50) },
      { id: "m6", direccion: "entrante", texto: "Perfecto, allí estaré. ¡Gracias!", adjuntos: null, enviado_por: null, created_at: hace(45) },
    ],
    d3: [
      { id: "m7", direccion: "entrante", texto: "¿Cuánto cuesta una primera consulta?", adjuntos: null, enviado_por: null, created_at: hace(60 * 30) },
    ],
  };
  const medios = [
    { id: "p1", caption: "3 cosas que debes saber antes de aceptar una herencia 👇 #herencias #abogados", media_type: "VIDEO", media_product_type: "REELS", thumbnail_url: imagen(220, "Herencias"), timestamp: hace(60 * 26), like_count: 214, comments_count: 3, permalink: "#" },
    { id: "p2", caption: "¿Te han despedido? Estos son tus plazos para reclamar.", media_type: "VIDEO", media_product_type: "REELS", thumbnail_url: imagen(10, "Despidos"), timestamp: hace(60 * 24 * 4), like_count: 132, comments_count: 1, permalink: "#" },
    { id: "p3", caption: "Nuevo despacho en el centro. ¡Os esperamos!", media_type: "IMAGE", media_url: imagen(160, "Despacho"), timestamp: hace(60 * 24 * 9), like_count: 98, comments_count: 0, permalink: "#" },
  ];
  const comentarios: Record<string, Coment[]> = {
    p1: [
      { id: "c1", text: "¿Y si la herencia tiene deudas?", username: "pepe.martin", timestamp: hace(90), hidden: false, like_count: 4,
        replies: { data: [{ id: "r1", text: "Puedes aceptarla a beneficio de inventario: solo respondes con los bienes heredados.", username: "despacho.demo", timestamp: hace(80) }] } },
      { id: "c2", text: "Muy útil, gracias 🙌", username: "ana.g", timestamp: hace(40), hidden: false, like_count: 1, replies: { data: [] } },
      { id: "c3", text: "Gana dinero desde casa, entra en mi perfil!!!", username: "promo_ganancias99", timestamp: hace(15), hidden: false, like_count: 0, replies: { data: [] } },
    ],
    p2: [
      { id: "c4", text: "A mí me despidieron ayer, ¿qué hago?", username: "lucia_pm", timestamp: hace(300), hidden: false, like_count: 2, replies: { data: [] } },
    ],
  };
  return { contactos, mensajes, medios, comentarios, publicaciones: 0 };
}

type Estado = ReturnType<typeof estadoInicial>;

function respuesta(data: any, status = 200) {
  return new Response(JSON.stringify(status < 400 ? { success: true, data } : { success: false, error: data }), {
    status, headers: { "Content-Type": "application/json" },
  });
}

/** Responde a las llamadas del panel como lo haría el backend, con el estado en memoria. */
async function responder(e: Estado, metodo: string, ruta: string, body: any): Promise<Response> {
  const seg = ruta.split("?")[0].replace(/^\/api\/instagram\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  const ventana = (c: Contacto) => c.inboundMin < 24 * 60;

  if (seg[0] === "status") {
    return respuesta({
      configured: true, connected: true, webhookOk: true, webhookUrl: "", verifyTokenConfigurado: true,
      noLeidos: e.contactos.reduce((n, c) => n + c.noLeidos, 0),
      account: { username: "despacho.demo", name: "Despacho Demo Abogados", followers: 1840, media: e.medios.length },
    });
  }
  if (seg[0] === "conversaciones" && !seg[1]) {
    const lista = e.contactos.map((c) => {
      const ult = e.mensajes[c.igsid].at(-1)!;
      return { igsid: c.igsid, username: c.username, nombre: c.nombre, foto: null, noLeidos: c.noLeidos, ultimoMensaje: ult.texto, ultimoMensajeAt: ult.created_at, ventanaAbierta: ventana(c) };
    }).sort((a, b) => (b.ultimoMensajeAt || "").localeCompare(a.ultimoMensajeAt || ""));
    return respuesta(lista);
  }
  if (seg[0] === "conversaciones" && seg[1]) {
    const c = e.contactos.find((x) => x.igsid === seg[1]);
    if (!c) return respuesta("Conversación no encontrada", 404);
    if (seg[2] === "mensajes" && metodo === "POST") {
      if (!ventana(c)) return respuesta("Han pasado más de 24 horas desde el último mensaje de esta persona: Instagram no deja contestar hasta que vuelva a escribir.", 400);
      const m: Msg = { id: `s${Date.now()}`, direccion: "saliente", texto: String(body?.texto || ""), adjuntos: null, enviado_por: "Tú (demostración)", created_at: ahora() };
      e.mensajes[c.igsid].push(m);
      return respuesta(m);
    }
    c.noLeidos = 0;
    const cierra = new Date(Date.now() + (24 * 60 - c.inboundMin) * 60_000).toISOString();
    return respuesta({ mensajes: e.mensajes[c.igsid], ventanaAbierta: ventana(c), ventanaCierra: ventana(c) ? cierra : null });
  }
  if (seg[0] === "medios" && seg[2] === "comentarios") {
    return respuesta(e.comentarios[seg[1]] || []);
  }
  if (seg[0] === "medios") return respuesta({ medios: e.medios, siguiente: null });
  if (seg[0] === "comentarios" && seg[1]) {
    const todos = Object.values(e.comentarios).flat();
    const c = todos.find((x) => x.id === seg[1]);
    if (!c) return respuesta("Comentario no encontrado", 404);
    if (seg[2] === "responder") {
      if (!body?.privado) c.replies.data.push({ id: `r${Date.now()}`, text: String(body?.texto || ""), username: "despacho.demo", timestamp: ahora() });
      return respuesta({ ok: true });
    }
    if (seg[2] === "ocultar") { c.hidden = Boolean(body?.ocultar); return respuesta({ ok: true }); }
    if (metodo === "DELETE") {
      for (const [id, l] of Object.entries(e.comentarios)) e.comentarios[id] = l.filter((x) => x.id !== c.id);
      return respuesta({ ok: true });
    }
  }
  if (seg[0] === "publicar" && metodo === "POST") {
    const form = body as FormData;
    const formato = String(form?.get?.("formato") || "REELS");
    e.publicaciones++;
    if (formato !== "STORIES") {
      e.medios.unshift({
        id: `n${e.publicaciones}`, caption: String(form?.get?.("caption") || ""), media_type: formato === "IMAGE" ? "IMAGE" : "VIDEO",
        media_product_type: formato === "IMAGE" ? "FEED" : "REELS", thumbnail_url: imagen(280 + e.publicaciones * 30, "Nuevo"),
        timestamp: ahora(), like_count: 0, comments_count: 0, permalink: "#",
      } as any);
    }
    return respuesta({ publicacionId: `demo${e.publicaciones}` });
  }
  if (seg[0] === "publicar" && seg[1]) return respuesta({ estado: "publicado", error: null, mediaId: seg[1] });
  if (metodo === "DELETE" && !seg.length) return respuesta("En la demostración no se puede desconectar la cuenta.", 400);
  return respuesta({ ok: true });
}

/** Sustituye fetch solo para /api/instagram; devuelve cómo restaurarlo. */
function instalarSimulacion(estado: Estado): () => void {
  const original = window.fetch;
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const ruta = url.replace(/^https?:\/\/[^/]+/, "");
    if (!ruta.startsWith("/api/instagram")) return original.call(window, input as any, init);
    await new Promise((r) => setTimeout(r, 250));
    let body: any = init?.body;
    if (typeof body === "string") { try { body = JSON.parse(body); } catch { /* texto */ } }
    return responder(estado, (init?.method || "GET").toUpperCase(), ruta, body);
  };
  return () => { window.fetch = original; };
}

const NUEVOS = [
  { username: "carlos.vidal", nombre: "Carlos Vidal", texto: "Hola, tengo un accidente de tráfico pendiente de reclamar al seguro. ¿Me podéis ayudar?" },
  { username: "nuria.sanz", nombre: "Núria Sanz", texto: "Buenos días, ¿hacéis divorcios de mutuo acuerdo? ¿Cuánto tardaría?" },
  { username: "alex_moreno", nombre: "Álex Moreno", texto: "Mi casero no me devuelve la fianza. ¿Qué puedo hacer?" },
];

export default function DemoInstagram() {
  return (
    <div className="flex h-screen flex-col bg-white">
      <InstagramSimulado conMarca />
    </div>
  );
}

/** Panel de Instagram con datos de ejemplo; también se usa dentro del ERP (ver WhatsApp.tsx). */
export function InstagramSimulado({ conMarca = false }: { conMarca?: boolean }) {
  const [estado] = useState(estadoInicial);
  const [clave, setClave] = useState(0);
  const [simulados, setSimulados] = useState(0);

  // Efecto de diseño: corre antes que los useEffect del panel, que son los que
  // hacen las llamadas; al salir de la página se restaura fetch.
  useLayoutEffect(() => instalarSimulacion(estado), [estado]);

  const simularMensaje = () => {
    const n = NUEVOS[simulados % NUEVOS.length];
    const igsid = `n${simulados}`;
    estado.contactos.push({ igsid, username: n.username, nombre: n.nombre, noLeidos: 1, inboundMin: 0 });
    estado.mensajes[igsid] = [{ id: `e${Date.now()}`, direccion: "entrante", texto: n.texto, adjuntos: null, enviado_por: null, created_at: ahora() }];
    setSimulados((x) => x + 1);
    setClave((x) => x + 1); // vuelve a montar el panel para que lo vea al momento
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-white">
      <div className="flex flex-shrink-0 flex-wrap items-center gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2">
        {conMarca && <Link to="/" className="shrink-0"><VantiaBrand /></Link>}
        <p className="min-w-0 flex-1 text-xs text-slate-500">
          <span className="mr-1.5 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-700">{t("Demostración")}</span>
          <span className="hidden sm:inline">{t("Comunicación Externa → Instagram con datos de ejemplo. Nada se envía a Instagram.")}</span>
        </p>
        <button type="button" onClick={simularMensaje} title={t("Simular mensaje nuevo")}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100">
          <MessageCirclePlus size={14} /> <span className="hidden sm:inline">{t("Simular mensaje nuevo")}</span><span className="sm:hidden">{t("Simular")}</span>
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        <InstagramPanel key={clave} />
      </div>
    </div>
  );
}
