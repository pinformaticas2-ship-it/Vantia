import React, { useEffect, useState } from "react";
import { Spinner } from "../components/Spinner";
import { useParams } from "react-router-dom";
import { Scale, Loader2, AlertCircle, CheckCircle2, ChevronRight } from "lucide-react";

interface FormData {
  first_name: string;
  last_name: string;
  email: string;
  telefono: string;
  nif_cif: string;
  observaciones: string;
}

type PageState = "loading" | "valid" | "invalid" | "submitting" | "done" | "error";

export default function FormularioCliente() {
  const { token } = useParams<{ token: string }>();
  const [pageState, setPageState] = useState<PageState>("loading");
  const [linkInfo, setLinkInfo] = useState<{ label?: string; creator_name?: string } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>({
    first_name: "",
    last_name: "",
    email: "",
    telefono: "",
    nif_cif: "",
    observaciones: "",
  });
  const [fieldError, setFieldError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) { setPageState("invalid"); return; }
    fetch(`/api/clientes/invites/public/${token}`)
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          setLinkInfo(d.data);
          setPageState("valid");
        } else {
          setErrorMsg(d.error || "Enlace no válido");
          setPageState("invalid");
        }
      })
      .catch(() => {
        setErrorMsg("No se pudo conectar con el servidor.");
        setPageState("invalid");
      });
  }, [token]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
    setFieldError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.first_name.trim()) { setFieldError("El nombre es obligatorio."); return; }
    setPageState("submitting");
    try {
      const res = await fetch(`/api/clientes/invites/public/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const d = await res.json();
      if (res.ok && d.success) {
        setPageState("done");
      } else {
        setErrorMsg(d.error || "Error al enviar los datos.");
        setPageState("error");
      }
    } catch {
      setErrorMsg("No se pudo conectar con el servidor.");
      setPageState("error");
    }
  };

  /* ── Layout shell ── */
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex flex-col items-center justify-center px-4 py-10">
      {/* Logo / cabecera */}
      <div className="flex items-center gap-2 mb-8">
        <div className="p-2 bg-blue-600 rounded-xl">
          <Scale className="w-6 h-6 text-white" />
        </div>
        <span className="text-xl font-bold text-slate-800 tracking-tight">
          Vantia Legis
        </span>
      </div>

      <div className="w-full max-w-lg bg-white rounded-2xl shadow-lg border border-slate-100 overflow-hidden">
        {/* ── Loading ── */}
        {pageState === "loading" && (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <Spinner size="lg" label="Verificando enlace..." />
          </div>
        )}

        {/* ── Invalid / expired ── */}
        {(pageState === "invalid") && (
          <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
            <div className="p-4 bg-red-50 rounded-full mb-4">
              <AlertCircle className="w-8 h-8 text-red-500" />
            </div>
            <h2 className="text-lg font-semibold text-slate-800 mb-2">Enlace no disponible</h2>
            <p className="text-sm text-slate-500">{errorMsg || "Este enlace no es válido o ha caducado."}</p>
          </div>
        )}

        {/* ── Error after submit ── */}
        {pageState === "error" && (
          <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
            <div className="p-4 bg-red-50 rounded-full mb-4">
              <AlertCircle className="w-8 h-8 text-red-500" />
            </div>
            <h2 className="text-lg font-semibold text-slate-800 mb-2">No se pudo enviar</h2>
            <p className="text-sm text-slate-500 mb-4">{errorMsg}</p>
            <button
              onClick={() => setPageState("valid")}
              className="text-sm text-blue-600 hover:underline"
            >
              Volver al formulario
            </button>
          </div>
        )}

        {/* ── Done ── */}
        {pageState === "done" && (
          <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
            <div className="p-4 bg-emerald-50 rounded-full mb-4">
              <CheckCircle2 className="w-8 h-8 text-emerald-500" />
            </div>
            <h2 className="text-lg font-semibold text-slate-800 mb-2">
              Datos enviados correctamente
            </h2>
            <p className="text-sm text-slate-500">
              Gracias. El despacho recibirá tus datos y se pondrá en contacto contigo.
            </p>
          </div>
        )}

        {/* ── Form ── */}
        {(pageState === "valid" || pageState === "submitting") && (
          <form onSubmit={handleSubmit} className="p-8">
            {/* Header */}
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-slate-800 mb-1">
                {linkInfo?.label ? linkInfo.label : "Formulario de alta"}
              </h2>
              <p className="text-sm text-slate-500">
                Rellena tus datos para que el despacho pueda registrarte como cliente.
                {linkInfo?.creator_name && (
                  <> Gestión a cargo de <strong>{linkInfo.creator_name}</strong>.</>
                )}
              </p>
            </div>

            {/* Campos */}
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Nombre <span className="text-red-500">*</span>
                  </label>
                  <input
                    name="first_name"
                    value={form.first_name}
                    onChange={handleChange}
                    placeholder="Juan"
                    required
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Apellidos</label>
                  <input
                    name="last_name"
                    value={form.last_name}
                    onChange={handleChange}
                    placeholder="García López"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Correo electrónico</label>
                <input
                  name="email"
                  type="email"
                  value={form.email}
                  onChange={handleChange}
                  placeholder="juan@ejemplo.com"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Teléfono</label>
                  <input
                    name="telefono"
                    type="tel"
                    value={form.telefono}
                    onChange={handleChange}
                    placeholder="612 345 678"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">NIF / CIF</label>
                  <input
                    name="nif_cif"
                    value={form.nif_cif}
                    onChange={handleChange}
                    placeholder="12345678A"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Observaciones</label>
                <textarea
                  name="observaciones"
                  value={form.observaciones}
                  onChange={handleChange}
                  placeholder="Información adicional que desees comunicar al despacho..."
                  rows={3}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                />
              </div>
            </div>

            {/* Field error */}
            {fieldError && (
              <p className="mt-3 text-xs text-red-600 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" /> {fieldError}
              </p>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={pageState === "submitting"}
              className="mt-6 w-full flex items-center justify-center gap-2 px-5 py-3 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-60 transition-colors"
            >
              {pageState === "submitting" ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Enviando...</>
              ) : (
                <>Enviar mis datos <ChevronRight className="w-4 h-4" /></>
              )}
            </button>

            <p className="mt-4 text-center text-xs text-slate-400">
              Tus datos serán tratados conforme a la normativa vigente de protección de datos (RGPD / LOPDGDD).
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
