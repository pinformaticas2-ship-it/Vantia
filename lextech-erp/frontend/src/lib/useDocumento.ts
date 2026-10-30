import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import { apiFetch, safeJson } from "./api";
import { useEditorTexto } from "../components/EditorTexto";

// Un documento de Vantia abierto en el editor: carga, guardado automático y
// descarga en Word. Lo usan la página Documentos y el panel lateral de Chat IA.

export const SIN_TITULO = "Documento sin título";

export interface DocumentoAbierto {
  id: string;
  titulo: string;
  contenido: string;
  expedienteId: string | null;
  expediente: string | null;
  actualizado: string;
  actualizadoPor: string | null;
}

export type EstadoGuardado = "guardado" | "pendiente" | "guardando" | "error";
type Cambios = { titulo?: string; contenido?: string };

export function useDocumento(id: string | null | undefined, opts: { onGuardado?: (doc: DocumentoAbierto, cambios: Cambios) => void } = {}) {
  const { getToken } = useAuth();
  const [doc, setDoc] = useState<DocumentoAbierto | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [titulo, setTitulo] = useState("");
  const [estadoGuardado, setEstadoGuardado] = useState<EstadoGuardado>("guardado");
  const [exportando, setExportando] = useState(false);

  const pendiente = useRef<Cambios>({});
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  const docIdRef = useRef<string | null>(null);
  // Id del documento cuyo texto ya está en el editor. Hasta entonces se
  // ignoran los cambios: al abrir, el editor emite un cambio "vacío" propio
  // que, si se guardaba, machacaba el documento con <p></p>.
  const cargadoPara = useRef<string | null>(null);
  const onGuardado = useRef(opts.onGuardado);
  onGuardado.current = opts.onGuardado;

  const guardarYa = useCallback(async () => {
    if (temporizador.current) { clearTimeout(temporizador.current); temporizador.current = null; }
    const docId = docIdRef.current;
    const cambios = pendiente.current;
    if (!docId || !Object.keys(cambios).length) return;
    pendiente.current = {};
    setEstadoGuardado("guardando");
    try {
      const r = await apiFetch(`/api/documentos/${docId}`, { getToken, method: "PUT", body: JSON.stringify(cambios) });
      if (r?.success === false) throw new Error(r.error);
      setEstadoGuardado(Object.keys(pendiente.current).length ? "pendiente" : "guardado");
      onGuardado.current?.(r.data, cambios);
    } catch {
      pendiente.current = { ...cambios, ...pendiente.current };
      setEstadoGuardado("error");
    }
  }, [getToken]);

  const programarGuardado = useCallback((cambios: Cambios) => {
    pendiente.current = { ...pendiente.current, ...cambios };
    setEstadoGuardado("pendiente");
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => { void guardarYa(); }, 900);
  }, [guardarYa]);

  const editor = useEditorTexto({
    contenido: "",
    onChange: (html) => {
      if (!docIdRef.current || cargadoPara.current !== docIdRef.current) return;
      programarGuardado({ contenido: html });
    },
  });

  // Al cerrar la pestaña con cambios sin guardar, y al desmontar.
  useEffect(() => {
    const antesDeSalir = (e: BeforeUnloadEvent) => {
      if (Object.keys(pendiente.current).length) { void guardarYa(); e.preventDefault(); }
    };
    window.addEventListener("beforeunload", antesDeSalir);
    return () => { window.removeEventListener("beforeunload", antesDeSalir); void guardarYa(); };
  }, [guardarYa]);

  useEffect(() => {
    if (!id) { docIdRef.current = null; cargadoPara.current = null; setDoc(null); return; }
    let vivo = true;
    void guardarYa();
    cargadoPara.current = null;
    docIdRef.current = id;
    setCargando(true);
    setError(null);
    apiFetch(`/api/documentos/${id}`, { getToken })
      .then((r) => {
        if (!vivo) return;
        if (r?.success === false) throw new Error(r.error);
        setDoc(r.data);
        setTitulo(r.data.titulo);
        setEstadoGuardado("guardado");
      })
      .catch((e) => { if (vivo) { setDoc(null); setError(e.message || "No se pudo abrir el documento."); } })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [id, getToken, guardarYa]);

  // Pasa el contenido al editor sin disparar el guardado.
  useEffect(() => {
    if (!editor || !doc) return;
    editor.commands.setContent(doc.contenido || "", { emitUpdate: false });
    cargadoPara.current = doc.id;
  }, [editor, doc?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const cambiarTitulo = useCallback((t: string) => {
    setTitulo(t);
    programarGuardado({ titulo: t.trim() || SIN_TITULO });
  }, [programarGuardado]);

  /** Guarda lo pendiente y descarga el .docx. Devuelve el error, si lo hay. */
  const descargarWord = useCallback(async (): Promise<string | null> => {
    const docId = docIdRef.current;
    if (!docId) return null;
    setExportando(true);
    try {
      await guardarYa();
      const token = await getToken({ skipCache: true });
      const res = await fetch(`/api/documentos/${docId}/docx`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error((await safeJson(res))?.error || "No se pudo exportar a Word.");
      const blob = await res.blob();
      const disp = res.headers.get("Content-Disposition") || "";
      const nombre = decodeURIComponent(/filename\*=UTF-8''([^;]+)/.exec(disp)?.[1] || "documento.docx");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = nombre; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      return null;
    } catch (e: any) {
      return e.message || "No se pudo exportar a Word.";
    } finally {
      setExportando(false);
    }
  }, [getToken, guardarYa]);

  /** Olvida lo pendiente de guardar (p. ej. al borrar el documento). */
  const descartarCambios = useCallback(() => {
    if (temporizador.current) { clearTimeout(temporizador.current); temporizador.current = null; }
    pendiente.current = {};
  }, []);

  return { doc, setDoc, cargando, error, titulo, cambiarTitulo, estadoGuardado, editor, guardarYa, descargarWord, exportando, descartarCambios };
}
