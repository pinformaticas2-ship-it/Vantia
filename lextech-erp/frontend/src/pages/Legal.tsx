import { ReactNode } from "react";
import { Link } from "react-router-dom";
import VantiaBrand from "../components/VantiaBrand";
import { t } from '../lib/i18n';

// Páginas públicas de Términos y Privacidad. Vantia es un ERP privado, pero
// TikTok, Meta (y en general cualquier OAuth de terceros) exigen enlazar ambas desde
// la ficha de la app. BORRADOR: el despacho debe revisar el texto legal.
const RESPONSABLE = "Ferrández Piña";
const ACTUALIZADO = "3 de noviembre de 2026";

function LegalLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10 text-slate-700">
      <div className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
        <Link to="/" className="inline-block"><VantiaBrand /></Link>
        <h1 className="mt-6 text-2xl font-semibold text-slate-900">{title}</h1>
        <p className="mt-1 text-sm text-slate-400">{t("Última actualización:")}{" "}{ACTUALIZADO}</p>
        <div className="mt-6 space-y-4 text-sm leading-relaxed [&_h2]:mt-6 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-slate-900 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5">
          {children}
        </div>
        <p className="mt-10 border-t border-slate-100 pt-4 text-xs text-slate-400">
          <Link to="/terminos" className="hover:text-slate-600">{t("Términos de servicio")}</Link>
          {" · "}
          <Link to="/privacidad" className="hover:text-slate-600">{t("Política de privacidad")}</Link>
        </p>
      </div>
    </div>
  );
}

export function Terminos() {
  return (
    <LegalLayout title={t("Términos de servicio")}>
      <p>{t("Vantia es un software de gestión para despachos de abogados operado por")}{" "}{RESPONSABLE}{t(". El acceso está restringido a los usuarios dados de alta por cada organización; no es un servicio abierto al público.")}</p>
      <h2>{t("Uso del servicio")}</h2>
      <ul>
        <li>{t("Cada organización es responsable de los usuarios a los que da acceso y del contenido que gestiona en Vantia.")}</li>
        <li>{t("No está permitido usar Vantia para fines ilícitos ni para vulnerar derechos de terceros.")}</li>
      </ul>
      <h2>{t("Servicios de terceros (TikTok y otros)")}</h2>
      <p>{t("Vantia permite conectar cuentas de servicios externos, como TikTok, para publicar contenido y consultar sus estadísticas. Al conectar una cuenta, el usuario autoriza a Vantia a actuar en su nombre solo en lo que haya aceptado en la pantalla de autorización y se compromete a cumplir también las condiciones de ese servicio. Lo que se publique es responsabilidad de la organización que lo publica. La conexión puede revocarse en cualquier momento desde Vantia o desde la configuración de la propia cuenta de TikTok.")}</p>
      <h2>{t("Responsabilidad")}</h2>
      <p>{t("Vantia se ofrece tal cual.")}{" "}{RESPONSABLE}{" "}{t("no responde de interrupciones o cambios en servicios de terceros ajenos a su control.")}</p>
      <h2>{t("Cambios")}</h2>
      <p>{t("Estos términos pueden actualizarse; la fecha de la última versión aparece al principio de esta página.")}</p>
    </LegalLayout>
  );
}

export function Privacidad() {
  return (
    <LegalLayout title={t("Política de privacidad")}>
      <p>{t("Responsable del tratamiento:")}{" "}{RESPONSABLE}{t(". Vantia trata los datos de los usuarios de cada organización solo para prestar el servicio de gestión del despacho, conforme al Reglamento General de Protección de Datos (RGPD).")}</p>
      <h2>{t("Datos que obtenemos de TikTok")}</h2>
      <p>{t("Si un usuario conecta su cuenta de TikTok, y solo con los permisos que acepte, Vantia obtiene:")}</p>
      <ul>
        <li>{t("Datos básicos del perfil: identificador, nombre visible y foto.")}</li>
        <li>{t("La lista de vídeos publicados y sus estadísticas (visualizaciones, me gusta, comentarios y compartidos).")}</li>
        <li>{t("Los tokens de acceso necesarios para mantener la conexión, guardados cifrados.")}</li>
      </ul>
      <h2>{t("Datos que obtenemos de Instagram (Meta)")}</h2>
      <p>{t("Si una organización conecta la cuenta profesional de Instagram de su despacho, y solo con los permisos que acepte, Vantia obtiene:")}</p>
      <ul>
        <li>{t("Datos de la cuenta conectada: identificador, nombre de usuario, nombre, foto de perfil y número de seguidores y publicaciones.")}</li>
        <li>{t("Los mensajes directos que otras personas envían a esa cuenta y las respuestas que se envían desde Vantia, junto con el nombre de usuario, nombre y foto de perfil de quien escribe.")}</li>
        <li>{t("Las publicaciones de la cuenta y sus comentarios (texto, autor y fecha).")}</li>
        <li>{t("El token de acceso necesario para mantener la conexión, guardado cifrado.")}</li>
      </ul>
      <h2>{t("Para qué los usamos")}</h2>
      <ul>
        <li>{t("Mostrar a la organización su cuenta de TikTok y las estadísticas de sus vídeos dentro de Vantia.")}</li>
        <li>{t("Publicar en TikTok el contenido que el propio usuario prepare y confirme desde Vantia.")}</li>
        <li>{t("Que el despacho lea y conteste desde Vantia los mensajes directos y comentarios que recibe en su cuenta de Instagram.")}</li>
        <li>{t("Publicar en Instagram los reels, fotos e historias que el propio usuario prepare y confirme desde Vantia, y moderar los comentarios (responder, ocultar o borrar).")}</li>
      </ul>
      <p>{t("No vendemos estos datos, no los cedemos a terceros ni los usamos para publicidad. Solo los ven los usuarios de la organización que conectó la cuenta; cada organización está aislada de las demás.")}</p>
      <h2>{t("Conservación y eliminación")}</h2>
      <p>{t("Los datos de TikTok se conservan mientras la cuenta siga conectada. Al desconectarla desde Vantia se revoca el acceso y se eliminan los tokens y los datos obtenidos de TikTok. También puede retirarse el permiso desde la configuración de la cuenta de TikTok.")}</p>
      <p>{t("Al desconectar Instagram desde Vantia se elimina el token de acceso. Los mensajes y comentarios ya recibidos se conservan como parte del historial de comunicaciones del despacho hasta que la organización los elimine o lo solicite. También puede retirarse el acceso desde la configuración de la cuenta de Instagram o del portfolio empresarial de Meta.")}</p>
      <h2 id="eliminar-datos">{t("Cómo solicitar la eliminación de sus datos")}</h2>
      <p>{t("Cualquier persona (usuario de Vantia o alguien que haya escrito o comentado a una cuenta conectada) puede pedir que se borren sus datos:")}</p>
      <ul>
        <li>{t("Si es la organización que conectó la cuenta: desconéctela desde Ajustes → Integraciones en Vantia y pida el borrado del historial.")}</li>
        <li>{t("En cualquier caso: dirija la solicitud a")}{" "}{RESPONSABLE}{" "}{t("indicando su nombre de usuario en Instagram o TikTok. Eliminaremos sus datos en un plazo máximo de 30 días y le confirmaremos el borrado.")}</li>
      </ul>
      <h2>{t("Derechos")}</h2>
      <p>{t("Puede ejercer sus derechos de acceso, rectificación, supresión, oposición, limitación y portabilidad dirigiéndose a")}{" "}{RESPONSABLE}{t(", y presentar una reclamación ante la Agencia Española de Protección de Datos (aepd.es).")}</p>
    </LegalLayout>
  );
}
