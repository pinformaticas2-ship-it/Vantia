import { useEffect, useState } from "react";

// Página de aterrizaje del popup de OAuth de Dropbox (ver lib/dropboxConnect.ts).
// No hace ninguna llamada a la API ni necesita sesión propia: solo lee el
// code/error de la URL, se lo pasa a la ventana que la abrió por postMessage,
// y se cierra sola.
export default function DropboxOAuthCallback() {
  const [canAutoClose, setCanAutoClose] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const error = params.get("error");
    const state = params.get("state");
    try {
      window.opener?.postMessage({ type: "dropbox-oauth", code, error, state }, window.location.origin);
    } catch { /* si no hay opener (se abrió sin popup), no hay a quién avisar */ }

    const t = setTimeout(() => {
      try { window.close(); } catch { /* algunos navegadores no dejan cerrar por script */ }
      setCanAutoClose(false);
    }, 400);
    return () => clearTimeout(t);
  }, []);

  return (
    <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", fontFamily: "system-ui, sans-serif", color: "#475569", textAlign: "center", padding: 24 }}>
      <p>{canAutoClose ? "Conectando con Dropbox…" : "Ya puedes cerrar esta ventana."}</p>
    </div>
  );
}
