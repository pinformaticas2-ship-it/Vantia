import { Router } from 'express';

// Política de privacidad pública servida por el backend. El frontend de Vercel
// tiene la protección de despliegue activada, así que Meta (y cualquiera sin
// sesión en Vercel) no puede leer /privacidad allí. Mismo texto que
// frontend/src/pages/Legal.tsx: si se cambia uno, cambiar el otro.
// BORRADOR: el despacho debe revisar el texto legal.

const RESPONSABLE = 'Ferrández Piña';
const ACTUALIZADO = '3 de noviembre de 2026';

const PRIVACIDAD = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Política de privacidad · Vantia</title>
<style>
  body { margin: 0; background: #f8fafc; color: #334155; font: 15px/1.6 system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { max-width: 760px; margin: 40px auto; background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 40px; }
  h1 { color: #0f172a; font-size: 24px; margin: 0; }
  h2 { color: #0f172a; font-size: 16px; margin-top: 28px; }
  .fecha { color: #94a3b8; font-size: 13px; margin-top: 4px; }
  ul { padding-left: 20px; }
  @media (max-width: 600px) { main { margin: 0; border-radius: 0; border: 0; padding: 24px 16px; } }
</style>
</head>
<body>
<main>
<h1>Política de privacidad de Vantia</h1>
<p class="fecha">Última actualización: ${ACTUALIZADO}</p>
<p>Responsable del tratamiento: ${RESPONSABLE}. Vantia trata los datos de los usuarios de cada organización solo para prestar el servicio
de gestión del despacho, conforme al Reglamento General de Protección de Datos (RGPD).</p>

<h2>Datos que obtenemos de TikTok</h2>
<p>Si un usuario conecta su cuenta de TikTok, y solo con los permisos que acepte, Vantia obtiene:</p>
<ul>
  <li>Datos básicos del perfil: identificador, nombre visible y foto.</li>
  <li>La lista de vídeos publicados y sus estadísticas (visualizaciones, me gusta, comentarios y compartidos).</li>
  <li>Los tokens de acceso necesarios para mantener la conexión, guardados cifrados.</li>
</ul>

<h2>Datos que obtenemos de Instagram (Meta)</h2>
<p>Si una organización conecta la cuenta profesional de Instagram de su despacho, y solo con los permisos que acepte, Vantia obtiene:</p>
<ul>
  <li>Datos de la cuenta conectada: identificador, nombre de usuario, nombre, foto de perfil y número de seguidores y publicaciones.</li>
  <li>Los mensajes directos que otras personas envían a esa cuenta y las respuestas que se envían desde Vantia, junto con el nombre de usuario, nombre y foto de perfil de quien escribe.</li>
  <li>Las publicaciones de la cuenta y sus comentarios (texto, autor y fecha).</li>
  <li>El token de acceso necesario para mantener la conexión, guardado cifrado.</li>
</ul>

<h2>Para qué los usamos</h2>
<ul>
  <li>Mostrar a la organización su cuenta de TikTok y las estadísticas de sus vídeos dentro de Vantia.</li>
  <li>Publicar en TikTok el contenido que el propio usuario prepare y confirme desde Vantia.</li>
  <li>Que el despacho lea y conteste desde Vantia los mensajes directos y comentarios que recibe en su cuenta de Instagram.</li>
  <li>Publicar en Instagram los reels, fotos e historias que el propio usuario prepare y confirme desde Vantia, y moderar los comentarios (responder, ocultar o borrar).</li>
</ul>
<p>No vendemos estos datos, no los cedemos a terceros ni los usamos para publicidad. Solo los ven los usuarios de la organización
que conectó la cuenta; cada organización está aislada de las demás.</p>

<h2>Conservación y eliminación</h2>
<p>Los datos de TikTok se conservan mientras la cuenta siga conectada. Al desconectarla desde Vantia se revoca el acceso
y se eliminan los tokens y los datos obtenidos de TikTok. También puede retirarse el permiso desde la configuración de la cuenta de TikTok.</p>
<p>Al desconectar Instagram desde Vantia se elimina el token de acceso. Los mensajes y comentarios ya recibidos se conservan como parte
del historial de comunicaciones del despacho hasta que la organización los elimine o lo solicite. También puede retirarse el acceso
desde la configuración de la cuenta de Instagram o del portfolio empresarial de Meta.</p>

<h2 id="eliminar-datos">Cómo solicitar la eliminación de sus datos</h2>
<p>Cualquier persona (usuario de Vantia o alguien que haya escrito o comentado a una cuenta conectada) puede pedir que se borren sus datos:</p>
<ul>
  <li>Si es la organización que conectó la cuenta: desconéctela desde Ajustes → Integraciones en Vantia y pida el borrado del historial.</li>
  <li>En cualquier caso: dirija la solicitud a ${RESPONSABLE} indicando su nombre de usuario en Instagram o TikTok. Eliminaremos sus datos en un plazo máximo de 30 días y le confirmaremos el borrado.</li>
</ul>

<h2>Derechos</h2>
<p>Puede ejercer sus derechos de acceso, rectificación, supresión, oposición, limitación y portabilidad dirigiéndose a ${RESPONSABLE},
y presentar una reclamación ante la Agencia Española de Protección de Datos (aepd.es).</p>
</main>
</body>
</html>`;

const router = Router();
router.get('/privacidad', (_req, res) => {
  res.type('html').set('Cache-Control', 'public, max-age=3600').send(PRIVACIDAD);
});

export default router;
