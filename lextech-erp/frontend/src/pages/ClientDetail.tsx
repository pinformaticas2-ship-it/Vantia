import React, { useEffect, useState, useRef, useCallback } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";
import {
  ArrowLeft, Edit3, Loader2, AlertCircle,
  Mail, Phone, MapPin, User, Briefcase,
  Calendar, Hash, FileText, Shield, StickyNote,
  Paperclip, Clock, AlertTriangle, CheckCircle2,
  Upload, Plus, Trash2, ChevronRight, Gavel,
  FolderOpen, Eye, Download, X, Sparkles,
  ScrollText, Receipt, Scale, UserCheck,
  MessageSquare, FileSignature, ShieldAlert, FilePlus,
  FilePlus2, Search, ChevronDown, ChevronRight as ChevronR,
} from "lucide-react";
import { safeJson } from "../lib/api";

// ── helpers ───────────────────────────────────────────────────
const statusColor: Record<string, string> = {
  Alta:       "bg-emerald-100 text-emerald-700",
  Baja:       "bg-red-100 text-red-700",
  Suspendido: "bg-amber-100 text-amber-700",
  Potencial:  "bg-blue-100 text-blue-700",
};
const typeColor: Record<string, string> = {
  CLIENTE:   "bg-slate-100 text-slate-700",
  CONTRARIO: "bg-red-100 text-red-700",
  JUZGADO:   "bg-blue-100 text-blue-700",
  PERITO:    "bg-purple-100 text-purple-700",
  PROVEEDOR: "bg-amber-100 text-amber-700",
};

const Section = ({ title, icon: Icon, children }: any) => (
  <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
    <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
      <Icon size={14} className="text-slate-400" />
      <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">{title}</h3>
    </div>
    <div className="p-4 grid grid-cols-2 md:grid-cols-3 gap-4">
      {children}
    </div>
  </div>
);

const Field = ({ label, value, mono = false }: { label: string; value?: string | null; mono?: boolean }) => (
  <div>
    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">{label}</p>
    <p className={`text-sm text-slate-700 font-medium ${mono ? "font-mono" : ""}`}>
      {value || <span className="text-slate-300 font-normal">—</span>}
    </p>
  </div>
);

const Indicador = ({ label, value, color = "text-slate-700" }: any) => (
  <div className="flex justify-between items-center py-1.5 border-b border-slate-100 last:border-0">
    <span className="text-xs text-slate-500">{label}</span>
    <span className={`text-xs font-bold ${color}`}>{value}</span>
  </div>
);

// ── Tabs ──────────────────────────────────────────────────────
const TABS = [
  { id: "perfil",      label: "Perfil",         icon: User },
  { id: "expedientes", label: "Expedientes",     icon: Briefcase },
  { id: "historial",   label: "Historial",       icon: Clock },
  { id: "notas",       label: "Notas",           icon: StickyNote },
  { id: "tareas",      label: "Tareas / Plazos", icon: AlertTriangle },
  { id: "adjuntos",    label: "Adjuntos",        icon: Paperclip },
];

// ── Tab: Perfil ───────────────────────────────────────────────
function TabPerfil({ client, formatDate, age }: any) {
  return (
    <div className="space-y-4">
      <Section title="Identificación" icon={User}>
        <Field label="Tipo documento"      value={client.document_type} />
        <Field label="NIF / CIF"           value={client.nif_cif} mono />
        <Field label="Naturaleza jurídica" value={client.legal_nature} />
        <Field label="Sexo"                value={client.gender === "M" ? "Masculino" : client.gender === "F" ? "Femenino" : client.gender} />
        <Field label="Fecha nacimiento"    value={formatDate(client.birth_date)} />
        <Field label="Edad"                value={age !== null ? `${age} años` : null} />
        <Field label="Nacionalidad"        value={client.nationality} />
        <Field label="País expedición"     value={client.expedition_country} />
      </Section>

      <Section title="Dirección" icon={MapPin}>
        <div className="col-span-2 md:col-span-3">
          <Field label="Dirección" value={client.address_street} />
        </div>
        <Field label="Población"     value={client.address_town} />
        <Field label="Código postal" value={client.address_cp} />
        <Field label="Provincia"     value={client.address_province} />
        <Field label="País"          value={client.address_country} />
      </Section>

      <Section title="Contacto" icon={Phone}>
        <div className="col-span-2 md:col-span-3">
          <Field label="Correo electrónico" value={client.email} />
        </div>
        <Field label="Teléfono"   value={client.phone_1} />
        <Field label="Móvil"      value={client.phone_mobile} />
        <Field label="Teléfono 2" value={client.phone_2} />
        <Field label="Teléfono 3" value={client.phone_3} />
        <Field label="Fax"        value={client.phone_fax} />
        <Field label="Web"        value={client.website} />
      </Section>

      <Section title="Administración" icon={Shield}>
        <Field label="Estado"                     value={client.client_status} />
        <Field label="Fecha alta"                 value={formatDate(client.date_alta)} />
        <Field label="Fecha baja"                 value={formatDate(client.date_baja)} />
        <Field label="LOPD"                       value={client.lopd} />
        <Field label="Comunicaciones comerciales" value={client.commercial_communications} />
        <Field label="Centro"                     value={client.center} />
        <Field label="Alta por"                   value={client.created_by} />
        <Field label="Fecha registro"             value={formatDate(client.created_at)} />
      </Section>
    </div>
  );
}

// ── Tab: Expedientes ──────────────────────────────────────────
function TabExpedientes() {
  const expedientes: any[] = []; // TODO: cargar desde /api/expedientes?clientId=...

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-slate-500">{expedientes.length} expedientes vinculados</p>
        <button className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl shadow-sm active:scale-95 transition-all">
          <Plus size={15} /> Nuevo expediente
        </button>
      </div>

      {expedientes.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-16 flex flex-col items-center gap-3 text-slate-400">
          <Gavel size={40} className="opacity-20" />
          <p className="font-medium text-sm">No hay expedientes vinculados</p>
          <p className="text-xs text-slate-300">Crea el primero usando el botón de arriba</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="px-5 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Referencia</th>
                <th className="px-5 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Asunto</th>
                <th className="px-5 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Estado</th>
                <th className="px-5 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Fecha apertura</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {expedientes.map((exp: any) => (
                <tr key={exp.id} className="hover:bg-slate-50/70 transition-colors">
                  <td className="px-5 py-3 font-mono text-xs text-slate-600">{exp.reference}</td>
                  <td className="px-5 py-3 text-sm font-medium text-slate-800">{exp.subject}</td>
                  <td className="px-5 py-3">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700">
                      {exp.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-xs text-slate-500">{exp.opened_at}</td>
                  <td className="px-5 py-3 text-right">
                    <ChevronRight size={16} className="text-slate-300 inline" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Tab: Historial ────────────────────────────────────────────
function TabHistorial({ clientId }: { clientId: string }) {
  // Historial de actuaciones — placeholder hasta que se implemente el módulo
  const actuaciones = [
    { id: 1, fecha: "11/03/2026", tipo: "Alta cliente", descripcion: "Registro del cliente en el sistema", usuario: "Admin", estado: "ok" },
  ];

  const tipoColor: Record<string, string> = {
    "Alta cliente":    "bg-emerald-100 text-emerald-700",
    "Actuación":       "bg-blue-100 text-blue-700",
    "Documento":       "bg-amber-100 text-amber-700",
    "Comunicación":    "bg-purple-100 text-purple-700",
    "Vencimiento":     "bg-red-100 text-red-700",
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <p className="text-sm text-slate-500">{actuaciones.length} actuaciones registradas</p>
        <button className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl shadow-sm active:scale-95 transition-all">
          <Plus size={15} /> Nueva actuación
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {actuaciones.length === 0 ? (
          <div className="p-16 flex flex-col items-center gap-3 text-slate-400">
            <Clock size={40} className="opacity-20" />
            <p className="font-medium text-sm">Sin actuaciones registradas</p>
          </div>
        ) : (
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="px-5 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Fecha</th>
                <th className="px-5 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tipo</th>
                <th className="px-5 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Descripción</th>
                <th className="px-5 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest hidden md:table-cell">Usuario</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {actuaciones.map((a) => (
                <tr key={a.id} className="hover:bg-slate-50/70 transition-colors">
                  <td className="px-5 py-3 text-xs font-mono text-slate-500 whitespace-nowrap">{a.fecha}</td>
                  <td className="px-5 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${tipoColor[a.tipo] || "bg-slate-100 text-slate-600"}`}>
                      {a.tipo}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-sm text-slate-700">{a.descripcion}</td>
                  <td className="px-5 py-3 text-xs text-slate-500 hidden md:table-cell">{a.usuario}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── Tab: Notas ────────────────────────────────────────────────
function TabNotas() {
  const [notas, setNotas] = useState<{ id: number; texto: string; fecha: string; autor: string }[]>([]);
  const [nueva, setNueva] = useState("");
  const [saving, setSaving] = useState(false);

  const addNota = () => {
    if (!nueva.trim()) return;
    setSaving(true);
    setTimeout(() => {
      const now = new Date().toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
      setNotas(prev => [{ id: Date.now(), texto: nueva.trim(), fecha: now, autor: "Yo" }, ...prev]);
      setNueva("");
      setSaving(false);
    }, 400);
  };

  const deleteNota = (id: number) => setNotas(prev => prev.filter(n => n.id !== id));

  return (
    <div className="space-y-4">
      {/* Nueva nota */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Nueva nota</p>
        <textarea
          value={nueva}
          onChange={e => setNueva(e.target.value)}
          placeholder="Escribe una nota sobre este cliente…"
          rows={3}
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100"
        />
        <div className="flex justify-end">
          <button
            onClick={addNota}
            disabled={saving || !nueva.trim()}
            className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-40 rounded-xl active:scale-95 transition-all"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Guardar nota
          </button>
        </div>
      </div>

      {/* Lista notas */}
      {notas.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 flex flex-col items-center gap-3 text-slate-400">
          <StickyNote size={36} className="opacity-20" />
          <p className="text-sm font-medium">No hay notas todavía</p>
        </div>
      ) : (
        <div className="space-y-3">
          {notas.map(n => (
            <div key={n.id} className="bg-white border border-slate-200 rounded-xl p-4 flex gap-3">
              <div className="h-8 w-8 bg-amber-100 rounded-lg flex items-center justify-center shrink-0">
                <StickyNote size={15} className="text-amber-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-800 leading-relaxed">{n.texto}</p>
                <p className="text-[10px] text-slate-400 mt-1">{n.autor} · {n.fecha}</p>
              </div>
              <button onClick={() => deleteNota(n.id)} className="p-1 text-slate-300 hover:text-red-500 transition-colors shrink-0">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Tab: Tareas / Plazos ──────────────────────────────────────
function TabTareas() {
  const tareas = [
    { id: 1, titulo: "Ejemplo: Presentar escrito de demanda", plazo: "15/04/2026", estado: "pendiente",  prioridad: "alta",  expediente: "EXP-001" },
    { id: 2, titulo: "Ejemplo: Revisión de contrato",         plazo: "20/03/2026", estado: "urgente",    prioridad: "media", expediente: "EXP-002" },
  ];

  const estadoStyle: Record<string, string> = {
    pendiente: "bg-amber-100 text-amber-700",
    urgente:   "bg-red-100 text-red-700",
    completada:"bg-emerald-100 text-emerald-700",
  };

  const prioridadStyle: Record<string, string> = {
    alta:  "text-red-500",
    media: "text-amber-500",
    baja:  "text-slate-400",
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="flex gap-4 text-xs">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-red-500 inline-block"></span>
            <span className="text-slate-500">{tareas.filter(t => t.estado === "urgente").length} urgentes</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-amber-400 inline-block"></span>
            <span className="text-slate-500">{tareas.filter(t => t.estado === "pendiente").length} pendientes</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-500 inline-block"></span>
            <span className="text-slate-500">{tareas.filter(t => t.estado === "completada").length} completadas</span>
          </span>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl shadow-sm active:scale-95 transition-all">
          <Plus size={15} /> Nueva tarea
        </button>
      </div>

      {tareas.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-16 flex flex-col items-center gap-3 text-slate-400">
          <AlertTriangle size={40} className="opacity-20" />
          <p className="font-medium text-sm">Sin tareas o plazos pendientes</p>
        </div>
      ) : (
        <div className="space-y-2">
          {tareas.map(t => (
            <div key={t.id} className="bg-white border border-slate-200 rounded-xl p-4 flex items-start gap-4 hover:border-slate-300 transition-colors">
              <button className="mt-0.5 h-4 w-4 rounded border-2 border-slate-300 hover:border-red-400 shrink-0 transition-colors" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800">{t.titulo}</p>
                <div className="flex items-center gap-3 mt-1 text-[11px] text-slate-400">
                  <span className="flex items-center gap-1"><Calendar size={10} /> {t.plazo}</span>
                  <span className="flex items-center gap-1"><Briefcase size={10} /> {t.expediente}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`text-[10px] font-bold uppercase ${prioridadStyle[t.prioridad]}`}>● {t.prioridad}</span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${estadoStyle[t.estado]}`}>{t.estado}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Plantillas de documentos para despacho de abogados ────────
const PLANTILLAS = [
  {
    id: "encargo",
    label: "Hoja de Encargo",
    desc: "Encargo profesional obligatorio (Ley 34/2006)",
    icon: ScrollText,
    color: "bg-blue-50 text-blue-600 border-blue-200",
    generate: (c: any) => `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<title>Hoja de Encargo — ${c.first_name} ${c.last_name || ""}</title>
<style>body{font-family:Arial,sans-serif;max-width:800px;margin:40px auto;color:#222;line-height:1.6}
h1{font-size:18px;text-align:center;margin-bottom:4px}h2{font-size:13px;text-align:center;color:#555;margin-top:0}
.datos{border:1px solid #ccc;padding:16px;border-radius:4px;margin:20px 0}
.fila{display:grid;grid-template-columns:160px 1fr;gap:4px;margin-bottom:6px}
.etiq{font-weight:bold;color:#444}.firma{margin-top:60px;display:flex;justify-content:space-between}
.bloque-firma{text-align:center;width:45%}.linea{border-top:1px solid #333;margin-top:40px;padding-top:6px}
p{margin:8px 0}</style></head><body>
<h1>HOJA DE ENCARGO PROFESIONAL</h1>
<h2>Despacho de Abogados</h2>
<div class="datos">
  <div class="fila"><span class="etiq">Cliente:</span><span>${c.first_name} ${c.last_name || ""}</span></div>
  <div class="fila"><span class="etiq">NIF/CIF:</span><span>${c.nif_cif || "—"}</span></div>
  <div class="fila"><span class="etiq">Domicilio:</span><span>${c.address_street || "—"}, ${c.address_town || ""} ${c.address_cp || ""}</span></div>
  <div class="fila"><span class="etiq">Teléfono:</span><span>${c.phone_1 || c.phone_mobile || "—"}</span></div>
  <div class="fila"><span class="etiq">Email:</span><span>${c.email || "—"}</span></div>
</div>
<p><strong>Objeto del encargo:</strong></p>
<p>_______________________________________________________________________________________________________________</p>
<p>_______________________________________________________________________________________________________________</p>
<p><strong>Honorarios estimados:</strong> __________ € + IVA</p>
<p><strong>Forma de pago:</strong> ____________________________________________</p>
<p><strong>Provisión de fondos:</strong> __________ €</p>
<p>El cliente declara haber sido informado de los derechos que le asisten conforme a la Ley 34/2006, así como de la posibilidad de recurrir al Colegio de Abogados en caso de discrepancia sobre honorarios.</p>
<div class="firma">
  <div class="bloque-firma"><div class="linea">El Letrado/a</div></div>
  <div class="bloque-firma"><div class="linea">El Cliente</div></div>
</div>
<p style="text-align:center;margin-top:30px;font-size:11px;color:#999">Fecha: ${new Date().toLocaleDateString("es-ES")}</p>
</body></html>`,
  },
  {
    id: "contrato",
    label: "Contrato de Servicios",
    desc: "Contrato de prestación de servicios jurídicos",
    icon: FileSignature,
    color: "bg-indigo-50 text-indigo-600 border-indigo-200",
    generate: (c: any) => `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<title>Contrato de Servicios — ${c.first_name} ${c.last_name || ""}</title>
<style>body{font-family:Arial,sans-serif;max-width:800px;margin:40px auto;color:#222;line-height:1.7}
h1{font-size:17px;text-align:center}h2{font-size:13px;margin-top:20px;text-transform:uppercase;color:#333}
.firma{margin-top:60px;display:flex;justify-content:space-between}
.bloque-firma{text-align:center;width:45%}.linea{border-top:1px solid #333;margin-top:40px;padding-top:6px}
p{margin:6px 0}</style></head><body>
<h1>CONTRATO DE PRESTACIÓN DE SERVICIOS JURÍDICOS</h1>
<p>En _______________, a ${new Date().toLocaleDateString("es-ES")}.</p>
<h2>REUNIDOS</h2>
<p><strong>De una parte:</strong> D./Dña. _______________________, Letrado/a colegiado/a nº _______, con domicilio profesional en _________________________.</p>
<p><strong>De otra parte:</strong> D./Dña. <strong>${c.first_name} ${c.last_name || ""}</strong>, con NIF <strong>${c.nif_cif || "—"}</strong>, domiciliado/a en ${c.address_street || "—"}, ${c.address_town || ""} (en adelante, "el Cliente").</p>
<h2>ACUERDAN</h2>
<p><strong>PRIMERO. Objeto.</strong> El Letrado/a se compromete a prestar al Cliente los servicios jurídicos consistentes en: _______________________________________________.</p>
<p><strong>SEGUNDO. Duración.</strong> El presente contrato tendrá vigencia desde la fecha de su firma hasta la finalización del asunto objeto del encargo.</p>
<p><strong>TERCERO. Honorarios.</strong> Los honorarios profesionales se fijan en __________ €, más el IVA correspondiente.</p>
<p><strong>CUARTO. Confidencialidad.</strong> El Letrado/a queda obligado al secreto profesional respecto de toda información que le sea revelada por el Cliente.</p>
<p><strong>QUINTO. Legislación aplicable.</strong> El presente contrato se rige por la legislación española vigente.</p>
<div class="firma">
  <div class="bloque-firma"><div class="linea">El Letrado/a</div></div>
  <div class="bloque-firma"><div class="linea">El Cliente</div></div>
</div>
</body></html>`,
  },
  {
    id: "factura",
    label: "Factura de Honorarios",
    desc: "Factura de honorarios profesionales",
    icon: Receipt,
    color: "bg-emerald-50 text-emerald-600 border-emerald-200",
    generate: (c: any) => `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<title>Factura — ${c.first_name} ${c.last_name || ""}</title>
<style>body{font-family:Arial,sans-serif;max-width:800px;margin:40px auto;color:#222}
.cabecera{display:flex;justify-content:space-between;margin-bottom:30px}
.titulo{font-size:28px;font-weight:bold;color:#c0392b}
table{width:100%;border-collapse:collapse;margin:20px 0}
th{background:#f5f5f5;padding:10px;text-align:left;border:1px solid #ddd;font-size:12px}
td{padding:10px;border:1px solid #ddd;font-size:13px}
.total{font-size:16px;font-weight:bold;text-align:right;margin-top:10px}
.pie{margin-top:40px;font-size:11px;color:#888;text-align:center}</style></head><body>
<div class="cabecera">
  <div><div class="titulo">FACTURA</div><p>Nº: _____ / ${new Date().getFullYear()}<br>Fecha: ${new Date().toLocaleDateString("es-ES")}</p></div>
  <div style="text-align:right"><strong>Despacho de Abogados</strong><br>___________________________<br>CIF: ___________<br>Tel: ___________</div>
</div>
<p><strong>Facturado a:</strong><br>${c.first_name} ${c.last_name || ""}<br>NIF: ${c.nif_cif || "—"}<br>${c.address_street || ""}, ${c.address_town || ""}</p>
<table>
  <thead><tr><th>Descripción</th><th style="width:100px;text-align:right">Importe</th></tr></thead>
  <tbody>
    <tr><td>Honorarios profesionales por _________________________</td><td style="text-align:right">__________ €</td></tr>
    <tr><td>Suplidos y gastos</td><td style="text-align:right">__________ €</td></tr>
    <tr><td style="text-align:right"><strong>Base imponible</strong></td><td style="text-align:right">__________ €</td></tr>
    <tr><td style="text-align:right">IVA (21%)</td><td style="text-align:right">__________ €</td></tr>
    <tr><td style="text-align:right"><strong>TOTAL</strong></td><td style="text-align:right"><strong>__________ €</strong></td></tr>
  </tbody>
</table>
<p><strong>Forma de pago:</strong> _________________________ | <strong>IBAN:</strong> ES__ ____ ____ ____ ____ ____</p>
<div class="pie">Documento emitido el ${new Date().toLocaleDateString("es-ES")} · Conservar a efectos fiscales</div>
</body></html>`,
  },
  {
    id: "poder",
    label: "Poder de Representación",
    desc: "Apoderamiento para actuaciones judiciales",
    icon: Scale,
    color: "bg-amber-50 text-amber-600 border-amber-200",
    generate: (c: any) => `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<title>Poder de Representación — ${c.first_name} ${c.last_name || ""}</title>
<style>body{font-family:Arial,sans-serif;max-width:800px;margin:40px auto;color:#222;line-height:1.7}
h1{font-size:16px;text-align:center;text-transform:uppercase}
.firma{margin-top:80px;display:flex;justify-content:center}
.bloque-firma{text-align:center;width:50%}.linea{border-top:1px solid #333;margin-top:60px;padding-top:6px}</style></head><body>
<h1>PODER DE REPRESENTACIÓN APUD ACTA</h1>
<p>Don/Doña <strong>${c.first_name} ${c.last_name || ""}</strong>, mayor de edad, con NIF <strong>${c.nif_cif || "—"}</strong>, domiciliado/a en <strong>${c.address_street || "—"}, ${c.address_town || ""}</strong>,</p>
<p><strong>OTORGA PODER</strong> a favor del/la Letrado/a _______________________, colegiado/a nº _______, para que en su nombre y representación:</p>
<p>— Intervenga en el procedimiento relativo a _______________________________________________</p>
<p>— Realice cuantos actos y gestiones sean necesarios para la defensa de sus intereses.</p>
<p>— Pueda interponer recursos, firmar escritos y comparecer ante cualquier órgano judicial o administrativo.</p>
<p>El presente apoderamiento se entiende conferido con carácter general para el asunto indicado.</p>
<p>En _______________, a ${new Date().toLocaleDateString("es-ES")}.</p>
<div class="firma"><div class="bloque-firma"><div class="linea">Firma del poderdante<br><small>${c.first_name} ${c.last_name || ""}</small></div></div></div>
</body></html>`,
  },
  {
    id: "carta",
    label: "Carta al Cliente",
    desc: "Comunicación formal al cliente",
    icon: MessageSquare,
    color: "bg-slate-50 text-slate-600 border-slate-200",
    generate: (c: any) => `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<title>Carta — ${c.first_name} ${c.last_name || ""}</title>
<style>body{font-family:Arial,sans-serif;max-width:800px;margin:40px auto;color:#222;line-height:1.7}
.membrete{text-align:right;margin-bottom:30px;font-size:12px}
.destinatario{margin:20px 0}.asunto{font-weight:bold;margin:20px 0}
.firma{margin-top:60px}</style></head><body>
<div class="membrete">
  <strong>Despacho de Abogados</strong><br>
  ___________________________<br>
  Tel: ___________ | Email: ___________<br>
  Fecha: ${new Date().toLocaleDateString("es-ES")}
</div>
<div class="destinatario">
  <strong>${c.first_name} ${c.last_name || ""}</strong><br>
  ${c.address_street || "—"}<br>
  ${c.address_cp || ""} ${c.address_town || ""}<br>
  ${c.email || ""}
</div>
<div class="asunto">ASUNTO: _______________________________________________</div>
<p>Estimado/a cliente:</p>
<p>_______________________________________________________________________________________________________________</p>
<p>_______________________________________________________________________________________________________________</p>
<p>_______________________________________________________________________________________________________________</p>
<p>Quedamos a su disposición para cualquier consulta.</p>
<div class="firma">
  <p>Atentamente,</p>
  <p>___________________________<br>Letrado/a</p>
</div>
</body></html>`,
  },
  {
    id: "nda",
    label: "Acuerdo de Confidencialidad",
    desc: "NDA entre despacho y cliente",
    icon: ShieldAlert,
    color: "bg-purple-50 text-purple-600 border-purple-200",
    generate: (c: any) => `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<title>NDA — ${c.first_name} ${c.last_name || ""}</title>
<style>body{font-family:Arial,sans-serif;max-width:800px;margin:40px auto;color:#222;line-height:1.7}
h1{font-size:16px;text-align:center;text-transform:uppercase}
h2{font-size:13px;margin-top:16px;text-transform:uppercase}
.firma{margin-top:60px;display:flex;justify-content:space-between}
.bloque-firma{text-align:center;width:45%}.linea{border-top:1px solid #333;margin-top:40px;padding-top:6px}</style></head><body>
<h1>ACUERDO DE CONFIDENCIALIDAD</h1>
<p>En _______________, a ${new Date().toLocaleDateString("es-ES")}.</p>
<h2>PARTES</h2>
<p><strong>El Despacho:</strong> _______________________, con CIF ___________, con domicilio en ___________________________.</p>
<p><strong>El Cliente:</strong> ${c.first_name} ${c.last_name || ""}, con NIF ${c.nif_cif || "—"}, con domicilio en ${c.address_street || "—"}, ${c.address_town || ""}.</p>
<h2>OBJETO</h2>
<p>Ambas partes acuerdan mantener la más estricta confidencialidad sobre toda la información intercambiada en el marco de la relación profesional, incluyendo datos personales, documentación aportada y estrategia jurídica.</p>
<h2>DURACIÓN</h2>
<p>El presente acuerdo tendrá vigencia durante toda la relación profesional y subsistirá durante un período de 5 años tras su finalización.</p>
<div class="firma">
  <div class="bloque-firma"><div class="linea">El Despacho</div></div>
  <div class="bloque-firma"><div class="linea">El Cliente</div></div>
</div>
</body></html>`,
  },
  {
    id: "lopd",
    label: "Consentimiento RGPD",
    desc: "Cláusula de protección de datos",
    icon: UserCheck,
    color: "bg-teal-50 text-teal-600 border-teal-200",
    generate: (c: any) => `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<title>RGPD — ${c.first_name} ${c.last_name || ""}</title>
<style>body{font-family:Arial,sans-serif;max-width:800px;margin:40px auto;color:#222;line-height:1.7}
h1{font-size:16px;text-align:center}h2{font-size:12px;text-transform:uppercase;margin-top:14px}
.firma{margin-top:50px;display:flex;justify-content:center}
.bloque-firma{text-align:center;width:50%}.linea{border-top:1px solid #333;margin-top:40px;padding-top:6px}
small{font-size:10px;color:#888}</style></head><body>
<h1>CLÁUSULA DE PROTECCIÓN DE DATOS PERSONALES (RGPD)</h1>
<p>En cumplimiento del Reglamento (UE) 2016/679 (RGPD) y la Ley Orgánica 3/2018 (LOPDGDD), le informamos:</p>
<h2>Responsable del Tratamiento</h2>
<p>Despacho de Abogados ___________________________, CIF: ___________, Domicilio: ___________________________.</p>
<h2>Finalidad</h2>
<p>La gestión de la relación profesional, defensa de sus intereses ante organismos judiciales y administrativos, así como el cumplimiento de obligaciones legales.</p>
<h2>Legitimación</h2>
<p>Ejecución de contrato de prestación de servicios jurídicos y cumplimiento de obligaciones legales.</p>
<h2>Destinatarios</h2>
<p>Sus datos no serán cedidos a terceros salvo obligación legal o requerimiento judicial.</p>
<h2>Derechos</h2>
<p>Puede ejercer sus derechos de acceso, rectificación, supresión, limitación, portabilidad y oposición dirigiéndose al correo: ___________</p>
<p><strong>DECLARO</strong> haber sido informado/a de los anteriores extremos y <strong>CONSIENTO</strong> el tratamiento de mis datos personales para las finalidades indicadas.</p>
<p>Nombre: <strong>${c.first_name} ${c.last_name || ""}</strong> · NIF: <strong>${c.nif_cif || "—"}</strong></p>
<div class="firma"><div class="bloque-firma"><div class="linea">Firma<br><small>${new Date().toLocaleDateString("es-ES")}</small></div></div></div>
</body></html>`,
  },
  {
    id: "reclamacion",
    label: "Carta de Reclamación",
    desc: "Requerimiento previo a demanda",
    icon: FilePlus,
    color: "bg-red-50 text-red-600 border-red-200",
    generate: (c: any) => `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<title>Carta de Reclamación</title>
<style>body{font-family:Arial,sans-serif;max-width:800px;margin:40px auto;color:#222;line-height:1.7}
.ref{font-size:11px;color:#888;margin-bottom:20px}h1{font-size:15px;text-align:center;text-transform:uppercase}
.firma{margin-top:60px}</style></head><body>
<h1>REQUERIMIENTO PREVIO — CARTA DE RECLAMACIÓN</h1>
<p class="ref">Fecha: ${new Date().toLocaleDateString("es-ES")} | Ref: ___________</p>
<p><strong>Dirigido a:</strong> ___________________________<br>Domicilio: ___________________________</p>
<p>En nombre y representación de D./Dña. <strong>${c.first_name} ${c.last_name || ""}</strong>, con NIF <strong>${c.nif_cif || "—"}</strong>, me dirijo a Ud. con el fin de:</p>
<p><strong>PRIMERO.</strong> Exponer que _______________________________________________________________________________________________________________</p>
<p><strong>SEGUNDO.</strong> Requerir formalmente a Ud. para que en el plazo de ___ días hábiles desde la recepción de la presente: _______________________________________________</p>
<p><strong>TERCERO.</strong> Advertir que, de no atenderse el presente requerimiento en el plazo indicado, mi representado/a se verá obligado/a a ejercitar las acciones judiciales que en Derecho correspondan.</p>
<div class="firma">
  <p>Letrado/a<br>___________________________</p>
</div>
</body></html>`,
  },
];

// ── Helpers de archivos ────────────────────────────────────────
function fileIcon(mime: string, name: string) {
  if (mime.startsWith("image/"))           return { icon: "🖼️", color: "bg-emerald-100 text-emerald-700" };
  if (mime === "application/pdf")          return { icon: "📄", color: "bg-red-100 text-red-700" };
  if (mime.includes("word") || name.endsWith(".doc") || name.endsWith(".docx"))
                                           return { icon: "📝", color: "bg-blue-100 text-blue-700" };
  if (mime.includes("excel") || mime.includes("spreadsheet") || name.endsWith(".xlsx") || name.endsWith(".xls"))
                                           return { icon: "📊", color: "bg-green-100 text-green-700" };
  if (mime.startsWith("text/"))            return { icon: "📃", color: "bg-slate-100 text-slate-700" };
  return { icon: "📎", color: "bg-slate-100 text-slate-600" };
}

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isPreviewable(mime: string) {
  return mime === "application/pdf" || mime.startsWith("image/") || mime.startsWith("text/");
}

// ── Tab: Adjuntos ─────────────────────────────────────────────
function TabAdjuntos({ clientId, client }: { clientId: string; client: any }) {
  const { getToken } = useAuth();

  const [files, setFiles]           = useState<any[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(true);
  const [uploading, setUploading]   = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [preview, setPreview]       = useState<{ url: string; name: string; mime: string } | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [genLoading, setGenLoading] = useState<string | null>(null);
  // DocPlant templates
  const [docPlantFolders, setDocPlantFolders] = useState<{ name: string; files: { name: string; path: string; ext: string }[] }[]>([]);
  const [docPlantLoading, setDocPlantLoading] = useState(false);
  const [docPlantError, setDocPlantError]     = useState<string | null>(null);
  const [templateTab, setTemplateTab] = useState<'docplant' | 'generated'>('docplant');
  const [templateSearch, setTemplateSearch] = useState('');
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  // Thumbnails de imágenes (blobURL por fileId)
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const loadingThumbIds = useRef<Set<string>>(new Set());
  const fileInputRef   = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // ── Cargar thumbnails de imágenes ─────────────────────────────
  const loadThumb = useCallback(async (fileId: string) => {
    if (loadingThumbIds.current.has(fileId)) return;
    loadingThumbIds.current.add(fileId);
    try {
      const token = await getToken({ skipCache: true });
      const res = await fetch(`/api/files/${clientId}/${fileId}/download`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setThumbs(prev => ({ ...prev, [fileId]: url }));
    } catch (_e) {
      loadingThumbIds.current.delete(fileId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  // ── Cargar archivos ──────────────────────────────────────────
  const loadFiles = useCallback(async () => {
    setLoadingFiles(true);
    try {
      const token = await getToken({ skipCache: true });
      const res = await fetch(`/api/files/${clientId}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await safeJson(res);
      if (res.ok) {
        setFiles(data.data || []);
        // Pre-cargar thumbnails de imágenes
        for (const f of (data.data || [])) {
          if (f.mimetype?.startsWith('image/')) loadThumb(f.id);
        }
      }
    } catch (_e) {}
    finally { setLoadingFiles(false); }
  }, [clientId, loadThumb]);

  useEffect(() => { loadFiles(); }, [loadFiles]);

  // ── Subir archivos ───────────────────────────────────────────
  const uploadFileList = async (fileList: FileList | File[]) => {
    const arr = Array.from(fileList);
    if (!arr.length) return;
    setUploading(true);
    try {
      const token = await getToken({ skipCache: true });
      const fd = new FormData();
      arr.forEach(f => fd.append("files", f));
      const res = await fetch(`/api/files/${clientId}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (res.ok) await loadFiles();
    } catch (_e) {}
    finally { setUploading(false); }
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setIsDragOver(false);
    const items = e.dataTransfer.items;
    const fileArr: File[] = [];
    for (const item of Array.from(items)) {
      const f = item.getAsFile();
      if (f) fileArr.push(f);
    }
    uploadFileList(fileArr);
  }, [clientId]);

  // ── Borrar archivo ───────────────────────────────────────────
  const handleDelete = async (fileId: string) => {
    const token = await getToken({ skipCache: true });
    await fetch(`/api/files/${clientId}/${fileId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    setFiles(prev => prev.filter(f => f.id !== fileId));
    if (preview) setPreview(null);
  };

  // ── Vista previa ─────────────────────────────────────────────
  const openPreview = async (f: any) => {
    const token = await getToken({ skipCache: true });
    const url = `/api/files/${clientId}/${f.id}/download?t=${token}`;
    setPreview({ url, name: f.original_name, mime: f.mimetype });
  };

  // ── Documento en blanco ──────────────────────────────────────
  const createBlankDoc = async () => {
    const token = await getToken({ skipCache: true });
    const res = await fetch('/api/files/templates/blank.docx', { headers: { Authorization: `Bearer ${token}` } });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Nuevo documento ${new Date().toLocaleDateString('es-ES').replace(/\//g, '-')}.docx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Abrir modal plantillas y cargar DocPlant ──────────────────
  const openTemplatesModal = async (forceReload = false) => {
    setShowTemplates(true);
    setTemplateTab('docplant');
    setTemplateSearch('');
    if (docPlantFolders.length > 0 && !forceReload) return; // ya cargado
    setDocPlantLoading(true);
    setDocPlantError(null);
    try {
      const token = await getToken({ skipCache: true });
      const res = await fetch('/api/files/templates', { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(`Error ${res.status}: ${res.statusText}`);
      const data = await res.json();
      if (data.success) {
        setDocPlantFolders(data.data || []);
        if (data.data && data.data.length > 0) {
          setExpandedFolders(new Set([data.data[0].name]));
        } else {
          setDocPlantError(data.warning || 'No se encontraron plantillas en la carpeta DocPlant.');
        }
      } else {
        setDocPlantError(data.error || 'Error al cargar plantillas.');
      }
    } catch (e: any) {
      setDocPlantError(e.message || 'Error de conexión al cargar plantillas.');
    } finally {
      setDocPlantLoading(false);
    }
  };

  // ── Descargar plantilla de DocPlant ──────────────────────────
  const downloadDocPlantTemplate = async (filePath: string, fileName: string) => {
    const token = await getToken({ skipCache: true });
    const res = await fetch(`/api/files/templates/download?path=${encodeURIComponent(filePath)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = fileName; a.click();
    URL.revokeObjectURL(url);
  };

  // ── Generar documento desde plantilla ────────────────────────
  const generateDoc = (plantilla: typeof PLANTILLAS[0]) => {
    setGenLoading(plantilla.id);
    setTimeout(() => {
      const html = plantilla.generate(client);
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${plantilla.id}_${client.first_name}_${client.last_name || ""}_${new Date().toISOString().split("T")[0]}.html`;
      a.click();
      URL.revokeObjectURL(a.href);
      setGenLoading(null);
      setShowTemplates(false);
    }, 300);
  };

  return (
    <div className="space-y-4">
      {/* Barra de acciones */}
      <div className="flex flex-wrap gap-2 justify-between items-center">
        <p className="text-sm text-slate-500">
          {loadingFiles ? "Cargando…" : `${files.length} ${files.length === 1 ? "archivo" : "archivos"}`}
        </p>
        <div className="flex flex-wrap gap-2">
          {/* Importar carpeta */}
          <button
            onClick={() => folderInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-600 bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 rounded-xl transition-all"
          >
            <FolderOpen size={13} /> Importar carpeta
          </button>
          {/* Subir archivos */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-600 bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 rounded-xl transition-all"
          >
            <Upload size={13} /> Subir archivo
          </button>
          {/* Nuevo documento en blanco */}
          <button
            onClick={createBlankDoc}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-600 bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 rounded-xl transition-all"
          >
            <FilePlus2 size={13} /> Nuevo
          </button>
          {/* Crear desde plantilla */}
          <button
            onClick={() => openTemplatesModal()}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl shadow-sm active:scale-95 transition-all"
          >
            <Sparkles size={13} /> Usar plantilla
          </button>
        </div>
      </div>

      {/* Inputs ocultos */}
      <input
        ref={fileInputRef} type="file" multiple className="hidden"
        onChange={e => e.target.files && uploadFileList(e.target.files)}
      />
      <input
        ref={folderInputRef} type="file" multiple className="hidden"
        {...({ webkitdirectory: "true", directory: "true" } as any)}
        onChange={e => e.target.files && uploadFileList(e.target.files)}
      />

      {/* Drop zone */}
      <div
        onDrop={onDrop}
        onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center gap-2 cursor-pointer transition-all
          ${isDragOver ? "border-red-400 bg-red-50/50 scale-[1.01]" : "border-slate-200 hover:border-red-300 hover:bg-red-50/20"}`}
      >
        {uploading
          ? <><Loader2 size={26} className="text-red-500 animate-spin" /><p className="text-sm font-medium text-red-600">Subiendo archivos…</p></>
          : <><Upload size={26} className={isDragOver ? "text-red-500" : "text-slate-400"} />
              <p className={`text-sm font-medium ${isDragOver ? "text-red-600" : "text-slate-500"}`}>Arrastra archivos o carpetas aquí</p>
              <p className="text-xs text-slate-400">PDF, Word, Excel, imágenes — máx. 50 MB por archivo</p></>
        }
      </div>

      {/* Layout: lista + preview */}
      <div className="flex gap-4">
        {/* Lista de archivos */}
        <div className={`${preview ? "w-1/2" : "w-full"} transition-all`}>
          {loadingFiles ? (
            <div className="bg-white border border-slate-200 rounded-xl p-10 flex justify-center">
              <Loader2 size={24} className="animate-spin text-red-500" />
            </div>
          ) : files.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-12 flex flex-col items-center gap-2 text-slate-400">
              <FileText size={36} className="opacity-20" />
              <p className="text-sm font-medium">No hay documentos adjuntos</p>
              <p className="text-xs text-slate-300">Sube archivos o crea documentos con las plantillas</p>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-left">
                <thead className="bg-slate-50 border-b border-slate-100">
                  <tr>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Archivo</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest hidden md:table-cell">Tamaño</th>
                    <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest hidden md:table-cell">Fecha</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {files.map((f: any) => {
                    const fi = fileIcon(f.mimetype, f.original_name);
                    const canPreview = isPreviewable(f.mimetype);
                    return (
                      <tr key={f.id} className="hover:bg-slate-50/60 transition-colors group">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            {/* Thumbnail para imágenes, icono para el resto */}
                            {f.mimetype?.startsWith('image/') && thumbs[f.id]
                              ? (
                                <img
                                  src={thumbs[f.id]}
                                  alt=""
                                  className="h-10 w-10 rounded-lg object-cover shrink-0 border border-slate-100 shadow-sm cursor-pointer hover:scale-105 transition-transform"
                                  onClick={() => openPreview(f)}
                                />
                              ) : (
                                <span
                                  className={`h-10 w-10 rounded-lg flex items-center justify-center text-base shrink-0 ${fi.color} ${f.mimetype?.startsWith('image/') ? 'animate-pulse' : ''}`}
                                  onClick={() => { if (f.mimetype?.startsWith('image/')) loadThumb(f.id); }}
                                >
                                  {fi.icon}
                                </span>
                              )
                            }
                            <button
                              onClick={() => canPreview ? openPreview(f) : undefined}
                              className={`text-sm font-medium text-slate-700 text-left truncate max-w-[180px] ${canPreview ? "hover:text-red-600 hover:underline cursor-pointer" : ""}`}
                              title={f.original_name}
                            >
                              {f.original_name}
                            </button>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-400 hidden md:table-cell">{fmtSize(f.size_bytes)}</td>
                        <td className="px-4 py-3 text-xs text-slate-400 hidden md:table-cell">
                          {new Date(f.created_at).toLocaleDateString("es-ES")}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                            {canPreview && (
                              <button onClick={() => openPreview(f)} title="Vista previa"
                                className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                                <Eye size={14} />
                              </button>
                            )}
                            <a
                              href={`/api/files/${clientId}/${f.id}/download`}
                              download={f.original_name}
                              title="Descargar"
                              className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                              onClick={async (e) => {
                                e.preventDefault();
                                const token = await getToken({ skipCache: true });
                                const res = await fetch(`/api/files/${clientId}/${f.id}/download`, { headers: { Authorization: `Bearer ${token}` } });
                                const blob = await res.blob();
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement("a"); a.href = url; a.download = f.original_name; a.click();
                                URL.revokeObjectURL(url);
                              }}
                            >
                              <Download size={14} />
                            </a>
                            <button onClick={() => handleDelete(f.id)} title="Eliminar"
                              className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Panel de vista previa */}
        {preview && (
          <div className="w-1/2 bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-100">
              <p className="text-xs font-bold text-slate-600 truncate max-w-[220px]" title={preview.name}>{preview.name}</p>
              <button onClick={() => setPreview(null)} className="p-1 text-slate-400 hover:text-slate-700 rounded transition-colors">
                <X size={14} />
              </button>
            </div>
            <div className="flex-1 min-h-[400px]">
              {preview.mime === "application/pdf" && (
                <iframe src={preview.url} className="w-full h-full min-h-[400px]" title={preview.name} />
              )}
              {preview.mime.startsWith("image/") && (
                <div className="flex items-center justify-center h-full p-4 bg-slate-50">
                  <img src={preview.url} alt={preview.name} className="max-h-[500px] max-w-full rounded-lg shadow object-contain" />
                </div>
              )}
              {preview.mime.startsWith("text/") && (
                <iframe src={preview.url} className="w-full h-full min-h-[400px] bg-white" title={preview.name} />
              )}
            </div>
          </div>
        )}
      </div>

      {/* Modal plantillas */}
      {showTemplates && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowTemplates(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl mx-4 overflow-hidden flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
              <div>
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Sparkles size={16} className="text-red-600" /> Usar plantilla
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Descarga y edita una plantilla del despacho
                </p>
              </div>
              <button onClick={() => setShowTemplates(false)} className="p-2 text-slate-400 hover:text-slate-700 rounded-lg transition-colors">
                <X size={16} />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-slate-100 px-6 shrink-0">
              <button
                onClick={() => setTemplateTab('docplant')}
                className={`py-3 px-1 mr-6 text-xs font-bold border-b-2 transition-colors ${templateTab === 'docplant' ? 'border-red-600 text-red-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
              >
                📁 Plantillas del despacho
              </button>
              <button
                onClick={() => setTemplateTab('generated')}
                className={`py-3 px-1 text-xs font-bold border-b-2 transition-colors ${templateTab === 'generated' ? 'border-red-600 text-red-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
              >
                ✨ Generar con datos del cliente
              </button>
            </div>

            {/* Tab: DocPlant */}
            {templateTab === 'docplant' && (
              <div className="flex flex-col flex-1 overflow-hidden">
                {/* Search */}
                <div className="px-4 py-3 border-b border-slate-100 shrink-0">
                  <div className="relative">
                    <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      value={templateSearch}
                      onChange={e => setTemplateSearch(e.target.value)}
                      placeholder="Buscar plantilla…"
                      className="w-full pl-8 pr-4 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent"
                    />
                  </div>
                </div>

                {/* File tree */}
                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                  {docPlantLoading ? (
                    <div className="flex flex-col items-center justify-center py-12 gap-3 text-slate-400">
                      <Loader2 size={28} className="animate-spin text-red-500" />
                      <p className="text-sm">Cargando plantillas…</p>
                    </div>
                  ) : docPlantError ? (
                    <div className="flex flex-col items-center justify-center py-10 gap-4">
                      <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-center max-w-sm">
                        <p className="text-sm font-bold text-amber-700 mb-1">No se pudieron cargar las plantillas</p>
                        <p className="text-xs text-amber-600">{docPlantError}</p>
                        <p className="text-xs text-amber-500 mt-2">Asegúrate de que el servidor esté en marcha y reinícialo si acabas de actualizar el código.</p>
                      </div>
                      <button
                        onClick={() => openTemplatesModal(true)}
                        className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl active:scale-95 transition-all"
                      >
                        <Loader2 size={12} /> Reintentar
                      </button>
                    </div>
                  ) : docPlantFolders.length === 0 ? (
                    <p className="text-center text-sm text-slate-400 py-10">No se encontraron plantillas</p>
                  ) : (() => {
                    const q = templateSearch.toLowerCase().trim();
                    const filtered = docPlantFolders.map(folder => ({
                      ...folder,
                      files: q
                        ? folder.files.filter(f => f.name.toLowerCase().includes(q))
                        : folder.files,
                    })).filter(f => f.files.length > 0);

                    if (filtered.length === 0) return <p className="text-center text-sm text-slate-400 py-6">Sin resultados para «{templateSearch}»</p>;

                    return filtered.map(folder => {
                      const isOpen = q ? true : expandedFolders.has(folder.name);
                      return (
                        <div key={folder.name} className="border border-slate-200 rounded-xl overflow-hidden">
                          {/* Folder header */}
                          <button
                            onClick={() => {
                              setExpandedFolders(prev => {
                                const next = new Set(prev);
                                if (next.has(folder.name)) next.delete(folder.name);
                                else next.add(folder.name);
                                return next;
                              });
                            }}
                            className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
                          >
                            <span className="text-xs font-bold text-slate-700 flex items-center gap-2">
                              <FolderOpen size={14} className="text-amber-500" />
                              {folder.name}
                              <span className="text-[10px] font-normal text-slate-400">({folder.files.length})</span>
                            </span>
                            {isOpen
                              ? <ChevronDown size={14} className="text-slate-400" />
                              : <ChevronR size={14} className="text-slate-400" />
                            }
                          </button>
                          {/* Files */}
                          {isOpen && (
                            <div className="divide-y divide-slate-50">
                              {folder.files.map(f => (
                                <div key={f.path} className="flex items-center justify-between px-4 py-2.5 hover:bg-blue-50/40 group transition-colors">
                                  <div className="flex items-center gap-2.5 min-w-0">
                                    <span className={`shrink-0 text-sm ${f.ext === '.docx' ? '📝' : '📄'}`}>{f.ext === '.docx' ? '📝' : '📄'}</span>
                                    <span className="text-xs text-slate-700 truncate" title={f.name}>{f.name}</span>
                                    <span className="shrink-0 text-[10px] text-slate-300 font-mono uppercase">{f.ext}</span>
                                  </div>
                                  <button
                                    onClick={() => downloadDocPlantTemplate(f.path, f.name)}
                                    className="shrink-0 ml-3 flex items-center gap-1 px-3 py-1 text-[11px] font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-100 rounded-lg opacity-0 group-hover:opacity-100 transition-all active:scale-95"
                                  >
                                    <Download size={11} /> Descargar
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            )}

            {/* Tab: Generated */}
            {templateTab === 'generated' && (
              <div className="flex-1 overflow-y-auto">
                <div className="p-5 grid grid-cols-2 gap-3">
                  {PLANTILLAS.map(p => {
                    const Icon = p.icon;
                    return (
                      <button
                        key={p.id}
                        onClick={() => generateDoc(p)}
                        disabled={genLoading === p.id}
                        className={`flex items-start gap-3 p-4 border rounded-xl text-left hover:shadow-md active:scale-[0.98] transition-all ${p.color} hover:opacity-90`}
                      >
                        <div className="shrink-0 mt-0.5">
                          {genLoading === p.id ? <Loader2 size={18} className="animate-spin" /> : <Icon size={18} />}
                        </div>
                        <div>
                          <p className="text-sm font-bold leading-snug">{p.label}</p>
                          <p className="text-[11px] opacity-70 mt-0.5">{p.desc}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
                <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 text-[11px] text-slate-400">
                  Documentos pre-rellenados con datos de <strong>{client.first_name} {client.last_name || ""}</strong> · Se generan como HTML apto para Word
                </div>
              </div>
            )}

          </div>
        </div>
      )}
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────
export default function ClientDetail() {
  const { id } = useParams<{ id: string }>();
  const { getToken } = useAuth();
  const navigate = useNavigate();
  const [client, setClient] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("perfil");

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const token = await getToken({ skipCache: true });
        const res = await fetch(`/api/entities/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const result = await safeJson(res);
        if (res.ok) setClient(result.data);
        else throw new Error(result.error || "Cliente no encontrado");
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) return (
    <div className="flex flex-col items-center justify-center h-64 text-slate-400">
      <Loader2 className="animate-spin text-red-600 mb-3" size={32} />
      <p className="text-sm animate-pulse">Cargando ficha...</p>
    </div>
  );

  if (error || !client) return (
    <div className="space-y-4">
      <Link to="/dashboard/clientes" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft size={16} /> Volver
      </Link>
      <div className="flex items-center gap-3 p-5 bg-red-50 border border-red-200 rounded-xl text-red-700">
        <AlertCircle size={20} className="shrink-0" />
        <span className="text-sm">{error || "Cliente no encontrado"}</span>
      </div>
    </div>
  );

  const initials = [(client.first_name || ""), (client.last_name || "")]
    .map((s: string) => s.charAt(0).toUpperCase()).join("") || "?";

  const formatDate = (d: string) =>
    d ? new Date(d).toLocaleDateString("es-ES", { day: "2-digit", month: "long", year: "numeric" }) : null;

  const age = client.birth_date
    ? Math.floor((Date.now() - new Date(client.birth_date).getTime()) / (1000 * 60 * 60 * 24 * 365.25))
    : null;

  return (
    <div className="flex gap-6 animate-in fade-in duration-500">

      {/* ── COLUMNA PRINCIPAL ──────────────────────────────────── */}
      <div className="flex-1 min-w-0 space-y-4">

        {/* Breadcrumb + acciones */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Link to="/dashboard/clientes" className="hover:text-slate-800 transition-colors">Clientes</Link>
            <span>/</span>
            <span className="text-slate-800 font-medium">{client.first_name} {client.last_name}</span>
          </div>
          <div className="flex gap-2">
            <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">
              <ArrowLeft size={15} /> Volver
            </button>
            <button
              onClick={() => navigate(`/dashboard/clientes/${id}/edit`)}
              className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl shadow-sm active:scale-95 transition-all"
            >
              <Edit3 size={14} /> Editar
            </button>
          </div>
        </div>

        {/* Header tarjeta del cliente */}
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center gap-4">
            {client.photo_url
              ? <img src={client.photo_url} alt="Foto" className="h-16 w-16 rounded-xl object-cover shrink-0 shadow" />
              : (
                <div className="h-16 w-16 bg-gradient-to-br from-red-500 to-red-700 rounded-xl flex items-center justify-center text-white font-bold text-2xl shadow-lg shadow-red-200 shrink-0">
                  {initials}
                </div>
              )
            }
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold text-slate-900 truncate">
                  {client.first_name} {client.last_name}
                </h1>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${statusColor[client.client_status] || "bg-slate-100 text-slate-600"}`}>
                  {client.client_status || "Alta"}
                </span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${typeColor[client.type] || "bg-slate-100 text-slate-600"}`}>
                  {client.type || "Cliente"}
                </span>
              </div>
              {client.commercial_name && <p className="text-slate-500 text-sm mt-0.5">{client.commercial_name}</p>}
              <div className="flex items-center gap-4 mt-2 text-xs text-slate-400 flex-wrap">
                {client.nif_cif && (
                  <span className="flex items-center gap-1 font-mono"><Hash size={11} />{client.nif_cif}</span>
                )}
                {client.internal_number && (
                  <span className="flex items-center gap-1">Nº {client.internal_number}</span>
                )}
                {client.date_alta && (
                  <span className="flex items-center gap-1"><Calendar size={11} /> Alta: {formatDate(client.date_alta)}</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── TABS ────────────────────────────────────────────── */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {/* Barra de tabs */}
          <div className="flex border-b border-slate-100 overflow-x-auto">
            {TABS.map(tab => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-5 py-3.5 text-[12px] font-bold whitespace-nowrap transition-all border-b-2 ${
                    active
                      ? "border-red-600 text-red-600 bg-red-50/50"
                      : "border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50"
                  }`}
                >
                  <Icon size={13} />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Contenido del tab activo */}
          <div className="p-5">
            {activeTab === "perfil"      && <TabPerfil client={client} formatDate={formatDate} age={age} />}
            {activeTab === "expedientes" && <TabExpedientes />}
            {activeTab === "historial"   && <TabHistorial clientId={id!} />}
            {activeTab === "notas"       && <TabNotas />}
            {activeTab === "tareas"      && <TabTareas />}
            {activeTab === "adjuntos"    && <TabAdjuntos clientId={id!} client={client} />}
          </div>
        </div>
      </div>

      {/* ── PANEL INDICADORES ───────────────────────────────── */}
      <aside className="w-52 shrink-0 space-y-4">
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden sticky top-6">
          <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100">
            <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Indicadores</h3>
          </div>
          <div className="px-4 py-3">
            <Indicador label="Expedientes"           value="0" />
            <Indicador label="Expedientes abiertos"  value="0" />
            <Indicador label="Días sin actuaciones"  value="0 días" />
            <Indicador label="Actuaciones atrasadas" value="0" />
            <Indicador label="Días morosidad"        value="0 días" />
            <Indicador label="Domicilio económico"   value="No" color="text-red-500" />
            <Indicador label="Domicilio historial"   value="No" color="text-red-500" />
          </div>

          {/* Acciones rápidas */}
          <div className="px-4 pb-4 space-y-2">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Acciones</p>
            <button
              onClick={() => setActiveTab("expedientes")}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors"
            >
              <Briefcase size={13} className="text-red-500" /> Nuevo expediente
            </button>
            <button
              onClick={() => setActiveTab("adjuntos")}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors"
            >
              <FileText size={13} className="text-slate-400" /> Nuevo documento
            </button>
            <button className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors">
              <Mail size={13} className="text-slate-400" /> Enviar email
            </button>
            <button
              onClick={() => setActiveTab("notas")}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors"
            >
              <StickyNote size={13} className="text-amber-500" /> Añadir nota
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}
