import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAuth, useUser } from "@clerk/clerk-react";
import { usePreferencias } from "../lib/preferencias";
import { AlertTriangle, Calculator, Copy, FileText, FolderSearch, Gavel, Link2, Plus, Printer, RotateCcw, Scale, Settings2, Trash2, X } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import {
  datosCalculadora, nombreCliente, refExpediente,
  type ClienteCostas, type DatosCalculadora, type ExpedienteCostas, type ProcuradorCostas,
} from "../lib/costasExpediente";
import { apiFetch } from "../lib/api";
import { aviso } from "../lib/avisos";
import { Modal } from "../components/Modal";
import {
  CUANTIA_INDETERMINADA, ESCALA_EJEMPLO, IRPF_PCT, IVA_PCT,
  borradorJuraDeCuentas, calcularCostas, calcularMinuta, fmtEur, honorariosPorEscala, redondear,
  type Escala,
} from "../lib/calculoHonorarios";

type Pestana = "honorarios" | "costas" | "jura";

// Acepta "1.500,50", "1500,50", "1500.50" y "1.500".
const num = (v: string) => {
  let t = String(v ?? "").trim().replace(/[€\s]/g, "");
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
};

const campo = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-400";

function Campo({ label, ayuda, children }: { label: string; ayuda?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}</span>
      {children}
      {ayuda && <span className="block text-xs text-slate-400">{ayuda}</span>}
    </label>
  );
}

function Importe({ value, onChange, placeholder, disabled }: { value: string; onChange: (v: string) => void; placeholder?: string; disabled?: boolean }) {
  return (
    <div className="relative">
      <input inputMode="decimal" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} placeholder={placeholder || "0,00"} className={`${campo} pr-8 disabled:bg-slate-50 disabled:text-slate-500`} />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">€</span>
    </div>
  );
}

function Interruptor({ checked, onChange, label, ayuda }: { checked: boolean; onChange: (v: boolean) => void; label: string; ayuda?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5" />
      <span>
        <span className="block text-sm text-slate-700">{label}</span>
        {ayuda && <span className="block text-xs text-slate-400">{ayuda}</span>}
      </span>
    </label>
  );
}

function Linea({ label, valor, fuerte, negativo, tenue }: { label: ReactNode; valor: number; fuerte?: boolean; negativo?: boolean; tenue?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-4 py-1.5 ${fuerte ? "border-t border-slate-200 pt-3 text-base font-bold text-slate-900" : tenue ? "text-xs text-slate-400" : "text-sm text-slate-600"}`}>
      <span>{label}</span>
      <span className="tabular-nums">{negativo && valor ? "−" : ""}{fmtEur(valor)}</span>
    </div>
  );
}

const copiar = async (texto: string) => {
  try { await navigator.clipboard.writeText(texto); aviso.ok("Copiado al portapapeles"); }
  catch { aviso.error("No se ha podido copiar."); }
};

function CalculadoraRapida() {
  const { getToken } = useAuth();
  const [pestana, setPestana] = useState<Pestana>("honorarios");
  const [escala, setEscala] = useState<Escala>(ESCALA_EJEMPLO);
  const [escalaPropia, setEscalaPropia] = useState(false);
  const [puedeEditar, setPuedeEditar] = useState(false);
  const [editandoEscala, setEditandoEscala] = useState(false);

  useEffect(() => {
    apiFetch("/api/organizacion/escala-honorarios", { getToken })
      .then((r) => {
        if (!r?.success) return;
        setPuedeEditar(Boolean(r.data?.puedeEditar));
        if (r.data?.escala?.tramos?.length) { setEscala(r.data.escala); setEscalaPropia(true); }
      })
      .catch(() => {});
  }, [getToken]);

  // ── Honorarios ──
  const [cuantia, setCuantia] = useState("");
  const [indeterminada, setIndeterminada] = useState(false);
  const [pctTrabajo, setPctTrabajo] = useState("100");
  const [ajuste, setAjuste] = useState("");
  const [conIva, setConIva] = useState(true);
  const [conIrpf, setConIrpf] = useState(false);
  const [suplidos, setSuplidos] = useState("");
  const [provisiones, setProvisiones] = useState("");

  const cuantiaEfectiva = indeterminada ? CUANTIA_INDETERMINADA : num(cuantia);
  const porEscala = useMemo(() => honorariosPorEscala(cuantiaEfectiva, escala), [cuantiaEfectiva, escala]);
  const pct = Math.min(Math.max(num(pctTrabajo), 0), 1000);
  const baseHonorarios = redondear((porEscala.importe * pct) / 100 + num(ajuste));
  const minuta = calcularMinuta({ base: baseHonorarios, conIva, conIrpf, suplidos: num(suplidos), provisiones: num(provisiones) });

  // ── Costas ──
  const [costasHonorarios, setCostasHonorarios] = useState("");
  const [costasProcurador, setCostasProcurador] = useState("");
  const [costasSuplidos, setCostasSuplidos] = useState("");
  const [litigantes, setLitigantes] = useState("1");
  const [temeridad, setTemeridad] = useState(false);
  const [aplicarLimite, setAplicarLimite] = useState(true);
  const [incluirIva, setIncluirIva] = useState(true);
  const costas = calcularCostas({
    honorarios: num(costasHonorarios), derechosProcurador: num(costasProcurador), suplidos: num(costasSuplidos),
    cuantia: num(cuantia), indeterminada, litigantes: num(litigantes), temeridad, incluirIva, aplicarLimite,
  });

  // ── Jura de cuentas ──
  const [profesional, setProfesional] = useState<"abogado" | "procurador">("abogado");
  const [juraBase, setJuraBase] = useState("");
  const [juraIva, setJuraIva] = useState(true);
  const [juraIrpf, setJuraIrpf] = useState(false);
  const [juraSuplidos, setJuraSuplidos] = useState("");
  const [juraProvisiones, setJuraProvisiones] = useState("");
  const [nombreProfesional, setNombreProfesional] = useState("");
  const [deudor, setDeudor] = useState("");
  const [juzgado, setJuzgado] = useState("");
  const [procedimiento, setProcedimiento] = useState("");
  const juraMinuta = calcularMinuta({ base: num(juraBase), conIva: juraIva, conIrpf: juraIrpf, suplidos: num(juraSuplidos), provisiones: num(juraProvisiones) });
  const escrito = borradorJuraDeCuentas({ profesional, nombreProfesional, deudor, juzgado, procedimiento, minuta: juraMinuta });

  const aCadena = (n: number) => (n ? String(n).replace(".", ",") : "");
  const usarEnCostas = () => { setCostasHonorarios(aCadena(baseHonorarios)); setPestana("costas"); };
  const usarEnJura = () => {
    setJuraBase(aCadena(baseHonorarios)); setJuraIva(conIva); setJuraIrpf(conIrpf);
    setJuraSuplidos(suplidos); setJuraProvisiones(provisiones); setPestana("jura");
  };

  const textoMinuta = [
    `Cuantía: ${fmtEur(cuantiaEfectiva)}${indeterminada ? " (indeterminada)" : ""}`,
    `Honorarios por escala: ${fmtEur(porEscala.importe)}${pct !== 100 ? ` × ${pct} %` : ""}${num(ajuste) ? ` ${num(ajuste) > 0 ? "+" : "−"} ${fmtEur(Math.abs(num(ajuste)))}` : ""}`,
    `Base: ${fmtEur(minuta.base)}`,
    ...(minuta.iva ? [`IVA ${IVA_PCT} %: ${fmtEur(minuta.iva)}`] : []),
    ...(minuta.irpf ? [`Retención IRPF ${IRPF_PCT} %: −${fmtEur(minuta.irpf)}`] : []),
    ...(minuta.suplidos ? [`Suplidos: ${fmtEur(minuta.suplidos)}`] : []),
    `Total minuta: ${fmtEur(minuta.total)}`,
    ...(minuta.provisiones ? [`Provisiones recibidas: −${fmtEur(minuta.provisiones)}`, `Pendiente de cobro: ${fmtEur(minuta.pendiente)}`] : []),
  ].join("\n");

  const pestanas: { id: Pestana; label: string; icon: typeof Calculator }[] = [
    { id: "honorarios", label: "Honorarios", icon: Calculator },
    { id: "costas", label: "Tasación de costas", icon: Scale },
    { id: "jura", label: "Jura de cuentas", icon: Gavel },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-red-50 text-red-700"><Calculator size={20} /></div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Calculadora</h1>
            <p className="text-xs text-slate-500">Honorarios, tasación de costas y jura de cuentas</p>
          </div>
        </div>
        <div className="flex rounded-2xl border border-slate-200 bg-white p-1">
          {pestanas.map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" onClick={() => setPestana(id)}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold ${pestana === id ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-50"}`}>
              <Icon size={14} /> <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {pestana === "honorarios" && (
        <div key="h" className="anim-fade-in grid grid-cols-1 gap-5 lg:grid-cols-[1fr_0.9fr]">
          <div className="space-y-4 rounded-3xl border border-slate-200 bg-white p-5">
            {!escalaPropia && (
              <div className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                <span>Estás usando una <strong>escala de ejemplo</strong>. {puedeEditar ? "Pulsa «Escala» y pon los criterios orientativos de vuestro Colegio." : "Pide al propietario o a un administrador que configure la de vuestro Colegio."}</span>
              </div>
            )}
            <div className="flex items-center justify-between gap-3">
              <p className="min-w-0 truncate text-xs text-slate-500">Escala: <strong className="text-slate-700">{escala.nombre || "Escala del despacho"}</strong></p>
              {puedeEditar && (
                <button type="button" onClick={() => setEditandoEscala(true)} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                  <Settings2 size={13} /> Escala
                </button>
              )}
            </div>
            <Campo label="Cuantía del asunto">
              <Importe value={indeterminada ? "18.000" : cuantia} onChange={setCuantia} disabled={indeterminada} />
            </Campo>
            <Interruptor checked={indeterminada} onChange={setIndeterminada} label="Cuantía indeterminada"
              ayuda={`Se valora en ${fmtEur(CUANTIA_INDETERMINADA)} (art. 394.3 LEC).`} />
            <div className="grid grid-cols-2 gap-3">
              <Campo label="% del trabajo" ayuda="Fase o parte realizada">
                <input inputMode="decimal" value={pctTrabajo} onChange={(e) => setPctTrabajo(e.target.value)} className={campo} />
              </Campo>
              <Campo label="Ajuste (±)" ayuda="Complejidad, urgencia…">
                <Importe value={ajuste} onChange={setAjuste} />
              </Campo>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Interruptor checked={conIva} onChange={setConIva} label={`IVA ${IVA_PCT} %`} />
              <Interruptor checked={conIrpf} onChange={setConIrpf} label={`Retención IRPF ${IRPF_PCT} %`} ayuda="Cliente empresa o profesional" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Campo label="Suplidos"><Importe value={suplidos} onChange={setSuplidos} /></Campo>
              <Campo label="Provisiones recibidas"><Importe value={provisiones} onChange={setProvisiones} /></Campo>
            </div>
          </div>

          <div className="space-y-4 rounded-3xl border border-slate-200 bg-slate-50 p-5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Minuta</p>
            {porEscala.detalle.length > 0 && (
              <div className="rounded-2xl bg-white p-3">
                {porEscala.detalle.map((t) => (
                  <Linea key={t.desde} tenue valor={t.importe}
                    label={`${fmtEur(t.desde)} – ${t.hasta === null ? "en adelante" : fmtEur(t.hasta)} · ${t.pct} % de ${fmtEur(t.base)}`} />
                ))}
                {porEscala.aplicadoMinimo && <p className="pt-1 text-xs text-amber-700">Se aplica el mínimo de la escala ({fmtEur(escala.minimo)}).</p>}
              </div>
            )}
            <div>
              <Linea label="Honorarios por escala" valor={porEscala.importe} />
              {pct !== 100 && <Linea label={`× ${pct} % del trabajo`} valor={redondear((porEscala.importe * pct) / 100)} />}
              {num(ajuste) !== 0 && <Linea label="Ajuste" valor={num(ajuste)} />}
              <Linea label="Base imponible" valor={minuta.base} />
              {conIva && <Linea label={`IVA ${IVA_PCT} %`} valor={minuta.iva} />}
              {conIrpf && <Linea label={`Retención IRPF ${IRPF_PCT} %`} valor={minuta.irpf} negativo />}
              {minuta.suplidos > 0 && <Linea label="Suplidos (sin IVA)" valor={minuta.suplidos} />}
              <Linea label="Total minuta" valor={minuta.total} fuerte />
              {minuta.provisiones > 0 && <>
                <Linea label="Provisiones recibidas" valor={minuta.provisiones} negativo />
                <Linea label="Pendiente de cobro" valor={minuta.pendiente} fuerte />
              </>}
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <button type="button" onClick={() => void copiar(textoMinuta)} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"><Copy size={13} /> Copiar</button>
              <button type="button" onClick={usarEnCostas} disabled={!baseHonorarios} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-40"><Scale size={13} /> Usar en costas</button>
              <button type="button" onClick={usarEnJura} disabled={!baseHonorarios} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-40"><Gavel size={13} /> Usar en jura de cuentas</button>
            </div>
          </div>
        </div>
      )}

      {pestana === "costas" && (
        <div key="c" className="anim-fade-in grid grid-cols-1 gap-5 lg:grid-cols-[1fr_0.9fr]">
          <div className="space-y-4 rounded-3xl border border-slate-200 bg-white p-5">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Campo label="Honorarios del abogado" ayuda="Sin IVA"><Importe value={costasHonorarios} onChange={setCostasHonorarios} /></Campo>
              <Campo label="Derechos del procurador" ayuda="Según arancel, sin IVA"><Importe value={costasProcurador} onChange={setCostasProcurador} /></Campo>
              <Campo label="Suplidos" ayuda="Tasas, peritos, edictos…"><Importe value={costasSuplidos} onChange={setCostasSuplidos} /></Campo>
              <Campo label="Cuantía del proceso"><Importe value={indeterminada ? "18.000" : cuantia} onChange={setCuantia} disabled={indeterminada} /></Campo>
            </div>
            <Interruptor checked={indeterminada} onChange={setIndeterminada} label="Cuantía indeterminada" ayuda={`Se valora en ${fmtEur(CUANTIA_INDETERMINADA)} a estos efectos.`} />
            <Interruptor checked={aplicarLimite} onChange={setAplicarLimite} label="Aplicar el límite del tercio (art. 394.3 LEC)"
              ayuda="Condena en costas por vencimiento: los honorarios no pueden pasar de un tercio de la cuantía por cada litigante vencedor." />
            {aplicarLimite && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Campo label="Litigantes vencedores"><input inputMode="numeric" value={litigantes} onChange={(e) => setLitigantes(e.target.value)} className={campo} /></Campo>
                <div className="sm:pt-6"><Interruptor checked={temeridad} onChange={setTemeridad} label="Declarada temeridad" ayuda="Entonces no hay límite" /></div>
              </div>
            )}
            <Interruptor checked={incluirIva} onChange={setIncluirIva} label="Incluir IVA" ayuda="Si la parte vencedora no puede deducírselo (particulares)." />
          </div>

          <div className="space-y-2 rounded-3xl border border-slate-200 bg-slate-50 p-5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Tasación</p>
            <Linea label="Honorarios del abogado solicitados" valor={costas.honorariosPedidos} />
            {costas.limite !== null && <Linea tenue label="Límite: un tercio de la cuantía" valor={costas.limite} />}
            {costas.recortado && (
              <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Los honorarios superan el límite: se reducen en {fmtEur(costas.honorariosPedidos - costas.honorariosReconocidos)}.
              </p>
            )}
            <Linea label="Honorarios reconocidos" valor={costas.honorariosReconocidos} />
            {incluirIva && <Linea label={`IVA honorarios ${IVA_PCT} %`} valor={costas.ivaHonorarios} />}
            <Linea label="Derechos del procurador" valor={costas.derechosProcurador} />
            {incluirIva && <Linea label={`IVA procurador ${IVA_PCT} %`} valor={costas.ivaProcurador} />}
            {costas.suplidos > 0 && <Linea label="Suplidos" valor={costas.suplidos} />}
            <Linea label="Total costas" valor={costas.total} fuerte />
            <p className="pt-2 text-[11px] leading-relaxed text-slate-400">
              El límite se calcula sobre los honorarios sin IVA y no alcanza a los derechos del procurador (sujetos a arancel) ni a los suplidos.
              Es una estimación: el criterio final es del Letrado de la Administración de Justicia.
            </p>
            <button type="button" onClick={() => void copiar([
              `Honorarios reconocidos: ${fmtEur(costas.honorariosReconocidos)}`,
              ...(incluirIva ? [`IVA honorarios: ${fmtEur(costas.ivaHonorarios)}`] : []),
              `Derechos del procurador: ${fmtEur(costas.derechosProcurador)}`,
              ...(incluirIva ? [`IVA procurador: ${fmtEur(costas.ivaProcurador)}`] : []),
              ...(costas.suplidos ? [`Suplidos: ${fmtEur(costas.suplidos)}`] : []),
              `TOTAL COSTAS: ${fmtEur(costas.total)}`,
            ].join("\n"))} className="mt-2 inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"><Copy size={13} /> Copiar</button>
          </div>
        </div>
      )}

      {pestana === "jura" && (
        <div key="j" className="anim-fade-in grid grid-cols-1 gap-5 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="space-y-4 rounded-3xl border border-slate-200 bg-white p-5">
            <div className="flex rounded-xl border border-slate-200 p-1">
              {(["abogado", "procurador"] as const).map((p) => (
                <button key={p} type="button" onClick={() => setProfesional(p)}
                  className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold ${profesional === p ? "bg-slate-900 text-white" : "text-slate-500"}`}>
                  {p === "abogado" ? "Abogado (art. 35 LEC)" : "Procurador (art. 34 LEC)"}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Campo label={profesional === "abogado" ? "Honorarios devengados" : "Derechos devengados"} ayuda="Sin IVA"><Importe value={juraBase} onChange={setJuraBase} /></Campo>
              <Campo label="Suplidos"><Importe value={juraSuplidos} onChange={setJuraSuplidos} /></Campo>
              <Campo label="Provisiones / pagos a cuenta"><Importe value={juraProvisiones} onChange={setJuraProvisiones} /></Campo>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Interruptor checked={juraIva} onChange={setJuraIva} label={`IVA ${IVA_PCT} %`} />
              <Interruptor checked={juraIrpf} onChange={setJuraIrpf} label={`Retención IRPF ${IRPF_PCT} %`} ayuda="Cliente empresa o profesional" />
            </div>
            <p className="pt-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">Datos para el escrito</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Campo label={profesional === "abogado" ? "Abogado/a" : "Procurador/a"}><input value={nombreProfesional} onChange={(e) => setNombreProfesional(e.target.value)} className={campo} /></Campo>
              <Campo label="Cliente deudor"><input value={deudor} onChange={(e) => setDeudor(e.target.value)} className={campo} /></Campo>
              <Campo label="Juzgado"><input value={juzgado} onChange={(e) => setJuzgado(e.target.value)} placeholder="Juzgado de Primera Instancia nº…" className={campo} /></Campo>
              <Campo label="Procedimiento"><input value={procedimiento} onChange={(e) => setProcedimiento(e.target.value)} placeholder="Juicio ordinario 123/2026" className={campo} /></Campo>
            </div>
          </div>

          <div className="space-y-4 rounded-3xl border border-slate-200 bg-slate-50 p-5">
            <div>
              <p className="pb-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">Cuenta</p>
              <Linea label={profesional === "abogado" ? "Honorarios" : "Derechos"} valor={juraMinuta.base} />
              {juraIva && <Linea label={`IVA ${IVA_PCT} %`} valor={juraMinuta.iva} />}
              {juraIrpf && <Linea label={`Retención IRPF ${IRPF_PCT} %`} valor={juraMinuta.irpf} negativo />}
              {juraMinuta.suplidos > 0 && <Linea label="Suplidos" valor={juraMinuta.suplidos} />}
              {juraMinuta.provisiones > 0 && <Linea label="Provisiones recibidas" valor={juraMinuta.provisiones} negativo />}
              <Linea label="Importe a reclamar" valor={juraMinuta.pendiente} fuerte />
            </div>
            <div>
              <div className="flex items-center justify-between pb-2">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Borrador del escrito</p>
                <div className="flex gap-2">
                  <button type="button" onClick={() => void copiar(escrito)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100"><Copy size={13} /> Copiar</button>
                  <button type="button" onClick={() => imprimirTexto("Jura de cuentas", escrito)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100"><Printer size={13} /> Imprimir</button>
                </div>
              </div>
              <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap rounded-2xl border border-slate-200 bg-white p-4 font-serif text-[13px] leading-relaxed text-slate-800">{escrito}</pre>
              <p className="pt-2 text-[11px] text-slate-400">Revisa y completa los datos entre corchetes antes de presentarlo. Acompaña la cuenta detallada y justificada.</p>
            </div>
          </div>
        </div>
      )}

      {editandoEscala && (
        <EditorEscala inicial={escala} onClose={() => setEditandoEscala(false)}
          onGuardada={(e) => { setEscala(e); setEscalaPropia(true); setEditandoEscala(false); }} />
      )}
    </div>
  );
}

function imprimirTexto(titulo: string, texto: string) {
  const w = window.open("", "_blank", "width=820,height=900");
  if (!w) { aviso.error("El navegador ha bloqueado la ventana. Permite las ventanas emergentes para Vantia."); return; }
  const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));
  w.document.open();
  w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(titulo)}</title>
<style>body{font-family:Georgia,serif;max-width:720px;margin:48px auto;padding:0 24px;line-height:1.8;white-space:pre-wrap;font-size:14px}</style>
</head><body>${esc(texto)}<script>setTimeout(function(){print()},300)</script></body></html>`);
  w.document.close();
}

function EditorEscala({ inicial, onClose, onGuardada }: { inicial: Escala; onClose: () => void; onGuardada: (e: Escala) => void }) {
  const { getToken } = useAuth();
  const [nombre, setNombre] = useState(inicial === ESCALA_EJEMPLO ? "" : inicial.nombre);
  const [minimo, setMinimo] = useState(String(inicial.minimo || ""));
  const [filas, setFilas] = useState(inicial.tramos.map((t) => ({ hasta: t.hasta === null ? "" : String(t.hasta), pct: String(t.pct) })));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const cambiar = (i: number, k: "hasta" | "pct", v: string) => setFilas((f) => f.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const guardar = async () => {
    setGuardando(true); setError("");
    try {
      const body = {
        nombre: nombre.trim() || "Escala del despacho",
        minimo: num(minimo),
        tramos: filas.map((f, i) => ({ hasta: i === filas.length - 1 ? null : num(f.hasta), pct: num(f.pct) })),
      };
      const r = await apiFetch("/api/organizacion/escala-honorarios", { getToken, method: "PUT", body: JSON.stringify(body) });
      if (!r?.success) throw new Error(r?.error || "No se pudo guardar.");
      aviso.ok("Escala guardada para todo el despacho");
      onGuardada(r.data.escala);
    } catch (e: any) {
      setError(e?.message || "No se pudo guardar.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Escala de honorarios" subtitle="Calculadora" maxWidth="max-w-xl"
      footer={<>
        <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancelar</button>
        <button type="button" onClick={() => void guardar()} disabled={guardando} className="rounded-xl bg-red-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-800 disabled:opacity-50">{guardando ? "Guardando…" : "Guardar"}</button>
      </>}>
      <div className="space-y-4">
        <p className="text-xs text-slate-500">
          Tramos acumulativos sobre la cuantía, como en los criterios orientativos de los Colegios: cada parte de la cuantía se multiplica por el porcentaje de su tramo y se suman.
          El último tramo es «en adelante». La escala la comparte todo el despacho.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Campo label="Nombre"><input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Criterios ICA… 2026" className={campo} /></Campo>
          <Campo label="Honorarios mínimos"><Importe value={minimo} onChange={setMinimo} /></Campo>
        </div>
        <div className="space-y-2">
          {filas.map((f, i) => {
            const ultimo = i === filas.length - 1;
            const desde = i === 0 ? 0 : num(filas[i - 1].hasta);
            return (
              <div key={i} className="flex items-center gap-2">
                <span className="w-24 shrink-0 text-right text-xs text-slate-400">desde {fmtEur(desde)}</span>
                {ultimo
                  ? <span className="flex-1 rounded-xl border border-dashed border-slate-200 px-3 py-2.5 text-sm text-slate-400">en adelante</span>
                  : <div className="flex-1"><Importe value={f.hasta} onChange={(v) => cambiar(i, "hasta", v)} placeholder="hasta" /></div>}
                <div className="relative w-24 shrink-0">
                  <input inputMode="decimal" value={f.pct} onChange={(e) => cambiar(i, "pct", e.target.value)} className={`${campo} pr-7`} />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">%</span>
                </div>
                <button type="button" title="Quitar tramo" disabled={filas.length <= 1} onClick={() => setFilas((x) => x.filter((_, j) => j !== i))}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"><Trash2 size={14} /></button>
              </div>
            );
          })}
          <button type="button" onClick={() => setFilas((x) => [...x.slice(0, -1), { hasta: "", pct: "" }, x[x.length - 1]])}
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"><Plus size={13} /> Añadir tramo</button>
        </div>
        {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
      </div>
    </Modal>
  );
}

// ── Página: la calculadora completa de tasación de costas y jura de cuentas
// (copiada tal cual en public/herramientas/costas.html) y, aparte, la rápida.
// La completa vive en un iframe del mismo origen; su IA (leer la resolución,
// asistente de cambios) pasa por /api/ia/json con la sesión de esta página.
declare global { interface Window {
  __vantiaIA?: (prompt: string, imagenes: { mime: string; base64: string }[]) => Promise<any>;
  __vantiaLetrado?: { nombre: string; colegiado: string; colegio: string };
  __vantiaExpedientePendiente?: DatosCalculadora | null;
  __vantiaDocGenerado?: (blob: Blob, nombre: string) => void;
} }

// ── Vínculo con un expediente o un cliente ──────────────────────────────
// Se abre con ?expediente=<id> (desde el expediente) o ?cliente=<id> (desde la
// ficha del cliente). Los datos que ya tiene el ERP se pasan a la calculadora;
// el Word generado se puede guardar en el expediente con un clic.
interface Vinculo {
  expediente: ExpedienteCostas | null;
  cliente: ClienteCostas | null;
  delCliente: ExpedienteCostas[];   // expedientes del cliente (si se abrió desde su ficha)
}
interface DocExp { id: string; original_name: string; document_name?: string | null; mimetype?: string | null; created_at?: string }
const LEIBLE = /pdf|image\/(jpeg|png|webp)/i;
const sinAcentos = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

async function cargarVinculo(getToken: Parameters<typeof apiFetch>[1]["getToken"], expId: string, cliId: string) {
  const g = (url: string) => apiFetch(url, { getToken }).catch(() => null);
  let expediente: ExpedienteCostas | null = null;
  let delCliente: ExpedienteCostas[] = [];
  if (expId) {
    const r = await g(`/api/expedientes/${encodeURIComponent(expId)}`);
    expediente = r?.data || null;
    if (!expediente) throw new Error("No se encontró el expediente o no tienes acceso.");
  }
  const idCliente = cliId || expediente?.cliente_id || "";
  const [rc, rl] = await Promise.all([
    idCliente ? g(`/api/entities/${encodeURIComponent(idCliente)}`) : null,
    cliId ? g(`/api/expedientes?limit=100&clienteId=${encodeURIComponent(cliId)}`) : null,
  ]);
  const cliente: ClienteCostas | null = rc?.data || null;
  if (cliId && !cliente) throw new Error("No se encontró el cliente o no tienes acceso.");
  delCliente = rl?.data || [];
  // Nº de colegiado y Colegio de nuestro procurador, si está en el Directorio.
  let procurador: ProcuradorCostas | null = null;
  const nomProc = (expediente?.procurador || "").trim();
  if (nomProc) {
    const primera = nomProc.split(/\s+/)[0];
    const rp = await g(`/api/directorio?tipo=PROCURADOR&q=${encodeURIComponent(primera)}`);
    const objetivo = sinAcentos(nomProc);
    procurador = (rp?.data || []).find((p: any) => sinAcentos(`${p.first_name || ""} ${p.last_name || ""}`) === objetivo) || null;
  }
  return { vinculo: { expediente, cliente, delCliente } as Vinculo, procurador };
}

function BarraVinculo({ vinculo, cargando, docs, onElegirExpediente, onLeerDoc, onRecargar, onQuitar }: {
  vinculo: Vinculo | null;
  cargando: boolean;
  docs: DocExp[] | null;
  onElegirExpediente: (id: string) => void;
  onLeerDoc: (d: DocExp) => void;
  onRecargar: () => void;
  onQuitar: () => void;
}) {
  const [verDocs, setVerDocs] = useState(false);
  if (cargando && !vinculo) return <div className="h-10 flex-shrink-0 animate-pulse border-b border-slate-200 bg-slate-50" />;
  if (!vinculo) return null;
  const { expediente: e, cliente: c, delCliente } = vinculo;
  const leibles = (docs || []).filter((d) => LEIBLE.test(d.mimetype || "") || /\.(pdf|jpe?g|png|webp)$/i.test(d.original_name));
  return (
    <div className="flex flex-shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-amber-200 bg-amber-50/70 px-4 py-1.5 text-xs text-slate-700">
      <Link2 size={13} className="text-amber-700" />
      {e ? (
        <Link to={`/dashboard/expedientes/${e.id}`} className="font-semibold text-slate-900 hover:underline">
          Expediente {refExpediente(e)}{e.descripcion ? ` · ${e.descripcion.slice(0, 60)}` : ""}
        </Link>
      ) : <span className="font-semibold text-slate-900">Sin expediente</span>}
      {c && <Link to={`/dashboard/clientes/${c.id}`} className="text-slate-500 hover:underline">{nombreCliente(c)}</Link>}
      {delCliente.length > 0 && (
        <select value={e?.id || ""} onChange={(ev) => onElegirExpediente(ev.target.value)}
          className="max-w-[16rem] rounded-lg border border-amber-200 bg-white px-2 py-1 text-xs">
          <option value="">{e ? "Solo datos del cliente" : `Elegir expediente (${delCliente.length})`}</option>
          {delCliente.map((x) => <option key={x.id} value={x.id}>{refExpediente(x)}{x.descripcion ? ` · ${x.descripcion.slice(0, 40)}` : ""}</option>)}
        </select>
      )}
      <div className="ml-auto flex items-center gap-1">
        {e && (
          <div className="relative">
            <button type="button" onClick={() => setVerDocs((v) => !v)} disabled={docs === null}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50">
              <FileText size={13} /> Leer resolución del expediente
            </button>
            {verDocs && (
              <div className="absolute right-0 top-full z-20 mt-1 max-h-72 w-80 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
                {leibles.length === 0 ? (
                  <p className="px-3 py-2 text-slate-500">El expediente no tiene PDF ni imágenes. Súbelo en la calculadora o en Documentos del expediente.</p>
                ) : leibles.map((d) => (
                  <button key={d.id} type="button" onClick={() => { setVerDocs(false); onLeerDoc(d); }}
                    className="block w-full truncate rounded-lg px-3 py-2 text-left hover:bg-slate-50">
                    {d.document_name || d.original_name}
                    {d.created_at && <span className="ml-1 text-slate-400">· {new Date(d.created_at).toLocaleDateString("es-ES")}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <button type="button" onClick={onRecargar} title="Volver a cargar los datos del expediente (borra lo que hayas cambiado)"
          className="rounded-lg p-1.5 text-slate-500 hover:bg-amber-100"><RotateCcw size={13} /></button>
        <button type="button" onClick={onQuitar} title="Desvincular" className="rounded-lg p-1.5 text-slate-500 hover:bg-amber-100"><X size={13} /></button>
      </div>
    </div>
  );
}

function BuscarExpediente({ onElegir, onClose }: { onElegir: (id: string) => void; onClose: () => void }) {
  const { getToken } = useAuth();
  const [q, setQ] = useState("");
  const [lista, setLista] = useState<ExpedienteCostas[] | null>(null);
  useEffect(() => {
    const t = setTimeout(async () => {
      const r = await apiFetch(`/api/expedientes?limit=30${q.trim() ? `&q=${encodeURIComponent(q.trim())}` : ""}`, { getToken }).catch(() => null);
      setLista(r?.data || []);
    }, 250);
    return () => clearTimeout(t);
  }, [q, getToken]);
  return (
    <Modal open onClose={onClose} title="Cargar datos de un expediente" subtitle="Juzgado, autos, partes, procurador y cuantía pasan a la calculadora" maxWidth="max-w-lg">
      <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por número, cliente, contrario, autos…" className={campo} />
      <div className="mt-3 max-h-80 space-y-1 overflow-y-auto">
        {lista === null ? <p className="px-1 py-2 text-sm text-slate-400">Buscando…</p>
          : lista.length === 0 ? <p className="px-1 py-2 text-sm text-slate-500">Sin resultados.</p>
          : lista.map((x) => (
            <button key={x.id} type="button" onClick={() => onElegir(x.id)} className="block w-full rounded-xl px-3 py-2 text-left hover:bg-slate-50">
              <span className="font-mono text-xs text-slate-500">{refExpediente(x)}</span>{" "}
              <span className="text-sm font-semibold text-slate-800">{x.descripcion || x.cliente_nombre || "—"}</span>
              <span className="block truncate text-xs text-slate-500">{[x.cliente_nombre, x.contrario && `c/ ${x.contrario}`, x.juzgado].filter(Boolean).join(" · ")}</span>
            </button>
          ))}
      </div>
    </Modal>
  );
}

export default function Calculadora() {
  const { getToken } = useAuth();
  const { user } = useUser();
  const { prefs, guardar } = usePreferencias();
  const [editandoLetrado, setEditandoLetrado] = useState(false);
  // Quien firma las notas: sus datos de letrado (Mi perfil); si aún no los ha
  // puesto, su nombre de usuario. Nunca los de otra persona.
  const letrado = useMemo(() => ({
    nombre: prefs.letradoNombre || user?.fullName || "",
    colegiado: prefs.colegiado || "",
    colegio: prefs.colegio || "",
  }), [prefs.letradoNombre, prefs.colegiado, prefs.colegio, user?.fullName]);
  useEffect(() => {
    window.__vantiaLetrado = letrado;
    try { (iframeRef.current?.contentWindow as any)?.__vantiaLetradoCambio?.(); } catch { /* aún cargando */ }
  }, [letrado]);
  useEffect(() => () => { delete window.__vantiaLetrado; }, []);
  const [vista, setVista] = useState<"completa" | "rapida">(() => {
    try { return (localStorage.getItem("vantia.calculadora.vista") as any) === "rapida" ? "rapida" : "completa"; } catch { return "completa"; }
  });
  const [cargada, setCargada] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    window.__vantiaIA = async (prompt, imagenes) => {
      const r = await apiFetch("/api/ia/json", { getToken, method: "POST", body: JSON.stringify({ prompt, imagenes }) });
      if (!r?.success) {
        const e: any = new Error(r?.error || "La IA no respondió.");
        e.code = r?.motivo === "sin_clave" ? "capability_disabled" : "error";
        throw e;
      }
      return r.data;
    };
    return () => { delete window.__vantiaIA; };
  }, [getToken]);

  const cambiar = (v: "completa" | "rapida") => {
    setVista(v);
    try { localStorage.setItem("vantia.calculadora.vista", v); } catch { /* sin almacenamiento */ }
  };

  // ── Vínculo con expediente / cliente ──
  const [params, setParams] = useSearchParams();
  const expId = params.get("expediente") || "";
  const cliId = params.get("cliente") || "";
  const [vinculo, setVinculo] = useState<Vinculo | null>(null);
  const [cargandoVinculo, setCargandoVinculo] = useState(false);
  const [docs, setDocs] = useState<DocExp[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [recarga, setRecarga] = useState(0);

  const enviar = (d: DatosCalculadora) => {
    const w = iframeRef.current?.contentWindow as any;
    if (w?.__vantiaCargarExpediente && w.document?.readyState !== "loading") {
      window.__vantiaExpedientePendiente = null;
      try { w.__vantiaCargarExpediente(d); } catch { aviso.error("La calculadora no pudo recibir los datos del expediente."); }
    } else window.__vantiaExpedientePendiente = d; // la calculadora lo recoge al cargar
  };

  useEffect(() => {
    if (!expId && !cliId) { setVinculo(null); setDocs(null); return; }
    if (vista !== "completa") cambiar("completa");
    let vivo = true;
    setCargandoVinculo(true);
    (async () => {
      try {
        const { vinculo: v, procurador } = await cargarVinculo(getToken, expId, cliId);
        if (!vivo) return;
        setVinculo(v);
        // Si el cliente solo tiene un expediente, se usa ese directamente.
        if (!expId && cliId && v.delCliente.length === 1) { setParams({ cliente: cliId, expediente: v.delCliente[0].id }, { replace: true }); return; }
        // Los datos se cargan una vez por vínculo: al volver a la calculadora
        // se conserva lo que hayas cambiado (salvo que pulses «Volver a cargar»).
        const clave = `${expId}|${cliId}`;
        let ya = "";
        try { ya = sessionStorage.getItem("vantia.costas.vinculo") || ""; } catch { /* nada */ }
        if (ya !== clave || recarga > 0) {
          enviar(datosCalculadora({ expediente: v.expediente, cliente: v.cliente, procurador }));
          try { sessionStorage.setItem("vantia.costas.vinculo", clave); } catch { /* nada */ }
        }
        if (v.expediente) {
          const r = await apiFetch(`/api/files/${encodeURIComponent(v.expediente.id)}`, { getToken }).catch(() => null);
          if (vivo) setDocs(r?.data || []);
        } else setDocs(null);
      } catch (e: any) {
        if (vivo) { aviso.error(e?.message || "No se pudieron cargar los datos."); setVinculo(null); }
      } finally {
        if (vivo) setCargandoVinculo(false);
      }
    })();
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expId, cliId, recarga, getToken]);

  const leerDoc = async (d: DocExp) => {
    const id = vinculo?.expediente?.id; if (!id) return;
    try {
      const token = await getToken({ skipCache: true });
      const res = await fetch(`/api/files/${id}/${d.id}/download`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const archivo = new File([blob], d.original_name, { type: d.mimetype || blob.type });
      (iframeRef.current?.contentWindow as any)?.__vantiaUsarResolucion?.(archivo, true);
    } catch { aviso.error("No se pudo abrir el documento del expediente."); }
  };

  // Word descargado desde la calculadora → ofrecer guardarlo en el expediente.
  const expVinculado = vinculo?.expediente || null;
  useEffect(() => {
    if (!expVinculado) { delete window.__vantiaDocGenerado; return; }
    window.__vantiaDocGenerado = (blob, nombre) => {
      aviso.info("Documento descargado", {
        duracion: 12000,
        accion: {
          label: `Guardar en el exp. ${refExpediente(expVinculado)}`,
          onClick: async () => {
            try {
              const token = await getToken({ skipCache: true });
              const fd = new FormData();
              fd.append("files", new File([blob], nombre, { type: blob.type || "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }));
              const res = await fetch(`/api/files/${expVinculado.id}`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd });
              if (!res.ok) throw new Error();
              const r = await res.json().catch(() => null);
              const fileId = r?.data?.[0]?.id;
              if (fileId) await fetch(`/api/files/${expVinculado.id}/${fileId}`, {
                method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ document_name: nombre.replace(/\.[^/.]+$/, ""), attachment_type: "Sin clasificar" }),
              }).catch(() => {});
              aviso.ok(`Guardado en Documentos del expediente ${refExpediente(expVinculado)}`);
            } catch { aviso.error("No se pudo guardar en el expediente."); }
          },
        },
      });
    };
    return () => { delete window.__vantiaDocGenerado; };
  }, [expVinculado, getToken]);
  useEffect(() => () => { delete window.__vantiaExpedientePendiente; }, []);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-4 py-2">
        <Calculator size={16} className="text-red-700" />
        <span className="mr-2 text-sm font-semibold text-slate-800">Calculadora</span>
        <div className="flex rounded-xl border border-slate-200 p-0.5">
          {([["completa", "Tasación de costas y jura de cuentas"], ["rapida", "Calculadora rápida"]] as const).map(([v, t]) => (
            <button key={v} type="button" onClick={() => cambiar(v)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${vista === v ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-50"}`}>{t}</button>
          ))}
        </div>
        {vista === "completa" && !vinculo && !cargandoVinculo && (
          <button type="button" onClick={() => setBuscando(true)}
            className="ml-2 hidden items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 sm:inline-flex">
            <FolderSearch size={13} /> Cargar expediente
          </button>
        )}
        {vista === "completa" && (
          <button type="button" onClick={() => setEditandoLetrado(true)} title="Datos que salen en las notas y escritos"
            className="ml-auto inline-flex min-w-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-slate-500 hover:bg-slate-50">
            <Gavel size={13} className="shrink-0" />
            <span className="truncate">
              {letrado.nombre || "Sin nombre"}{letrado.colegiado ? ` · nº ${letrado.colegiado}` : ""}
              {!letrado.colegiado && <span className="ml-1 font-semibold text-amber-700">· añade tu nº de colegiado</span>}
            </span>
          </button>
        )}
      </div>
      {vista === "completa" && (
        <BarraVinculo vinculo={vinculo} cargando={cargandoVinculo} docs={docs}
          onElegirExpediente={(id) => setParams(id ? { ...(cliId ? { cliente: cliId } : {}), expediente: id } : { cliente: cliId })}
          onLeerDoc={leerDoc}
          onRecargar={() => setRecarga((n) => n + 1)}
          onQuitar={() => { setParams({}); try { sessionStorage.removeItem("vantia.costas.vinculo"); } catch { /* nada */ } }} />
      )}
      {buscando && <BuscarExpediente onClose={() => setBuscando(false)} onElegir={(id) => { setBuscando(false); setParams({ expediente: id }); }} />}
      {editandoLetrado && (
        <DatosLetrado inicial={letrado} onClose={() => setEditandoLetrado(false)}
          onGuardar={async (d) => { await guardar({ letradoNombre: d.nombre, colegiado: d.colegiado, colegio: d.colegio }); setEditandoLetrado(false); aviso.ok("Datos de letrado guardados"); }} />
      )}
      {vista === "completa" ? (
        <div className="relative min-h-0 flex-1 bg-white">
          {!cargada && <div className="absolute inset-0 animate-pulse bg-slate-50" />}
          <iframe ref={iframeRef} title="Calculadora de tasación de costas y jura de cuentas" src="/herramientas/costas.html"
            onLoad={() => {
              setCargada(true);
              try {
                const w = iframeRef.current?.contentWindow as any;
                w?.__vantiaLetradoCambio?.();
                // Por si los datos llegaron justo mientras cargaba.
                const p = window.__vantiaExpedientePendiente;
                if (p && w?.__vantiaCargarExpediente) { window.__vantiaExpedientePendiente = null; w.__vantiaCargarExpediente(p); }
              } catch { /* nada */ }
            }}
            className={`h-full w-full border-0 transition-opacity duration-300 ${cargada ? "opacity-100" : "opacity-0"}`} />
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-8"><CalculadoraRapida /></div>
      )}
    </div>
  );
}

function DatosLetrado({ inicial, onClose, onGuardar }: {
  inicial: { nombre: string; colegiado: string; colegio: string };
  onClose: () => void;
  onGuardar: (d: { nombre: string; colegiado: string; colegio: string }) => Promise<void>;
}) {
  const [d, setD] = useState(inicial);
  const [guardando, setGuardando] = useState(false);
  return (
    <Modal open onClose={onClose} title="Datos de letrado" subtitle="Salen en tus notas de honorarios y escritos" maxWidth="max-w-lg"
      footer={<>
        <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancelar</button>
        <button type="button" disabled={guardando || !d.nombre.trim()} onClick={async () => { setGuardando(true); try { await onGuardar(d); } finally { setGuardando(false); } }}
          className="rounded-xl bg-red-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-800 disabled:opacity-50">{guardando ? "Guardando…" : "Guardar"}</button>
      </>}>
      <div className="space-y-4">
        <Campo label="Nombre completo"><input value={d.nombre} onChange={(e) => setD({ ...d, nombre: e.target.value })} className={campo} /></Campo>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[0.6fr_1.4fr]">
          <Campo label="Nº de colegiado"><input value={d.colegiado} onChange={(e) => setD({ ...d, colegiado: e.target.value })} placeholder="1.234" className={campo} /></Campo>
          <Campo label="Colegio"><input value={d.colegio} onChange={(e) => setD({ ...d, colegio: e.target.value })} placeholder="Ilustre Colegio de Abogados de …" className={campo} /></Campo>
        </div>
        <p className="text-xs text-slate-500">Son tuyos: cada usuario tiene los suyos y no los ve nadie más del despacho salvo en los documentos que generes.</p>
      </div>
    </Modal>
  );
}
