// Quitar miembros, tarjeta de persona en el chat y avisos del correo (16/11/2026).
import { registrarEn } from '../../lib/i18n';

registrarEn({
  "esta persona": "this person",
  "¿Quitar a {nombre} del despacho?": "Remove {nombre} from the firm?",
  "Dejará de ver los clientes, expedientes y todo lo de este despacho. Lo que hizo se queda. Se le puede volver a añadir cuando quieras.":
    "They'll stop seeing this firm's clients, cases and everything else. What they did stays. You can add them back whenever you like.",
  "Quitar del despacho": "Remove from the firm",
  "{nombre} ya no está en el despacho.": "{nombre} is no longer in the firm.",
  "No se pudo quitar.": "Couldn't remove them.",
  "Ver perfil": "View profile",
  "Teléfono copiado.": "Phone number copied.",
  "Sin teléfono": "No phone",
  "Puedes poner tu cargo y tu teléfono en Ajustes → Mi perfil.": "You can add your job title and phone in Settings → My profile.",
  "Conexión": "Connection",
  "Carpeta {carpeta}": "Folder {carpeta}",
  "el servidor de correo rechaza la conexión (¿está bien el servidor y el puerto?)": "the mail server refuses the connection (are the server and port right?)",
  "no se encuentra el servidor de correo (revisa la dirección)": "the mail server can't be found (check the address)",
  "el servidor de correo tarda demasiado en responder": "the mail server is taking too long to respond",
  "el servidor de correo cortó la conexión": "the mail server dropped the connection",
  "el usuario o la contraseña del correo no son correctos": "the email username or password is wrong",
  "el certificado de seguridad del servidor de correo no es válido": "the mail server's security certificate isn't valid",
});
