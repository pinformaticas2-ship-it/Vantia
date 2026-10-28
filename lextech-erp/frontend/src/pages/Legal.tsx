import { ReactNode } from "react";
import { Link } from "react-router-dom";
import VantiaBrand from "../components/VantiaBrand";

// Páginas públicas de Términos y Privacidad. Vantia es un ERP privado, pero
// TikTok (y en general cualquier OAuth de terceros) exige enlazar ambas desde
// la ficha de la app. BORRADOR: el despacho debe revisar el texto legal.
const RESPONSABLE = "Ferrández Piña";
const ACTUALIZADO = "28 de octubre de 2026";

function LegalLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10 text-slate-700">
      <div className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
        <Link to="/" className="inline-block"><VantiaBrand /></Link>
        <h1 className="mt-6 text-2xl font-semibold text-slate-900">{title}</h1>
        <p className="mt-1 text-sm text-slate-400">Última actualización: {ACTUALIZADO}</p>
        <div className="mt-6 space-y-4 text-sm leading-relaxed [&_h2]:mt-6 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-slate-900 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5">
          {children}
        </div>
        <p className="mt-10 border-t border-slate-100 pt-4 text-xs text-slate-400">
          <Link to="/terminos" className="hover:text-slate-600">Términos de servicio</Link>
          {" · "}
          <Link to="/privacidad" className="hover:text-slate-600">Política de privacidad</Link>
        </p>
      </div>
    </div>
  );
}

export function Terminos() {
  return (
    <LegalLayout title="Términos de servicio">
      <p>
        Vantia es un software de gestión para despachos de abogados operado por {RESPONSABLE}.
        El acceso está restringido a los usuarios dados de alta por cada organización; no es un servicio abierto al público.
      </p>
      <h2>Uso del servicio</h2>
      <ul>
        <li>Cada organización es responsable de los usuarios a los que da acceso y del contenido que gestiona en Vantia.</li>
        <li>No está permitido usar Vantia para fines ilícitos ni para vulnerar derechos de terceros.</li>
      </ul>
      <h2>Servicios de terceros (TikTok y otros)</h2>
      <p>
        Vantia permite conectar cuentas de servicios externos, como TikTok, para publicar contenido y consultar sus estadísticas.
        Al conectar una cuenta, el usuario autoriza a Vantia a actuar en su nombre solo en lo que haya aceptado en la pantalla de autorización
        y se compromete a cumplir también las condiciones de ese servicio. Lo que se publique es responsabilidad de la organización que lo publica.
        La conexión puede revocarse en cualquier momento desde Vantia o desde la configuración de la propia cuenta de TikTok.
      </p>
      <h2>Responsabilidad</h2>
      <p>
        Vantia se ofrece tal cual. {RESPONSABLE} no responde de interrupciones o cambios en servicios de terceros ajenos a su control.
      </p>
      <h2>Cambios</h2>
      <p>Estos términos pueden actualizarse; la fecha de la última versión aparece al principio de esta página.</p>
    </LegalLayout>
  );
}

export function Privacidad() {
  return (
    <LegalLayout title="Política de privacidad">
      <p>
        Responsable del tratamiento: {RESPONSABLE}. Vantia trata los datos de los usuarios de cada organización solo para prestar el servicio
        de gestión del despacho, conforme al Reglamento General de Protección de Datos (RGPD).
      </p>
      <h2>Datos que obtenemos de TikTok</h2>
      <p>Si un usuario conecta su cuenta de TikTok, y solo con los permisos que acepte, Vantia obtiene:</p>
      <ul>
        <li>Datos básicos del perfil: identificador, nombre visible y foto.</li>
        <li>La lista de vídeos publicados y sus estadísticas (visualizaciones, me gusta, comentarios y compartidos).</li>
        <li>Los tokens de acceso necesarios para mantener la conexión, guardados cifrados.</li>
      </ul>
      <h2>Para qué los usamos</h2>
      <ul>
        <li>Mostrar a la organización su cuenta de TikTok y las estadísticas de sus vídeos dentro de Vantia.</li>
        <li>Publicar en TikTok el contenido que el propio usuario prepare y confirme desde Vantia.</li>
      </ul>
      <p>No vendemos estos datos, no los cedemos a terceros ni los usamos para publicidad.</p>
      <h2>Conservación y eliminación</h2>
      <p>
        Los datos de TikTok se conservan mientras la cuenta siga conectada. Al desconectarla desde Vantia se revoca el acceso
        y se eliminan los tokens y los datos obtenidos de TikTok. También puede retirarse el permiso desde la configuración de la cuenta de TikTok.
      </p>
      <h2>Derechos</h2>
      <p>
        Puede ejercer sus derechos de acceso, rectificación, supresión, oposición, limitación y portabilidad dirigiéndose a {RESPONSABLE},
        y presentar una reclamación ante la Agencia Española de Protección de Datos (aepd.es).
      </p>
    </LegalLayout>
  );
}
