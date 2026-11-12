// Ajustes → Automatizaciones con editor de flujos (12/11/2026).
import { registrarEn } from '../../lib/i18n';

registrarEn({
  // Editor de flujos
  "Quitado": "Removed",
  "Quitar del flujo": "Remove from the flow",
  "Añadir al flujo": "Add to the flow",
  "¿Salir sin guardar?": "Leave without saving?",
  "Los cambios del flujo se perderán.": "Your changes to the flow will be lost.",
  "Salir sin guardar": "Leave without saving",
  "Sin pasos": "No steps",
  "Fin del flujo": "End of flow",
  "Pulsa un paso para verlo y ajustarlo": "Click a step to see and adjust it",
  "Cuando": "When",
  "lo que pone en marcha el flujo": "what starts the flow",
  "Si": "If",
  "lo que se comprueba antes de seguir": "what's checked before going on",
  "Entonces": "Then",
  "lo que hace Vantia": "what Vantia does",
  "quita un paso opcional; con + vuelve al flujo": "removes an optional step; + puts it back",
  "Este paso está en el flujo": "This step is in the flow",
  "Este paso está quitado": "This step is removed",
  "Este paso es fijo: no tiene ajustes.": "This step is fixed: it has no settings.",
  "Datos que se rellenan solos (pulsa para insertar):": "Fields filled in automatically (click to insert):",

  // Fichas
  "Últimas ejecuciones": "Recent runs",
  "Editar flujo": "Edit flow",
  "Ver flujo": "View flow",
  "El despacho no tiene ninguna cuenta de correo conectada: no se puede enviar nada. Conéctala en Correo.":
    "The firm has no email account connected: nothing can be sent. Connect one in Email.",
  "Tareas que Vantia hace sola en esta organización. Abre el flujo de cada una para ver qué hace, paso a paso, y ajustarlo.":
    "Tasks Vantia does on its own in this organisation. Open each one's flow to see what it does, step by step, and adjust it.",
  "Correo del juzgado → expediente y agenda": "Court email → case and calendar",
  "Detecta los señalamientos que llegan al correo, te pide confirmación y, al aceptar, responde, crea el expediente, lo pone en la agenda y guarda los adjuntos.":
    "Detects hearing notices arriving by email, asks you to confirm and, when you accept, replies, creates the case, adds it to the calendar and saves the attachments.",
  "recibidas (30 días)": "received (30 days)",
  "aceptadas (30 días)": "accepted (30 days)",
  "por decidir": "to decide",
  "Expediente nuevo → documentos rellenos": "New case → filled-in documents",
  "generados (30 días)": "generated (30 days)",
  "documentos en el flujo": "documents in the flow",
  "Bienvenida al cliente": "Client welcome",
  "Alta de cliente → correo de bienvenida": "New client → welcome email",
  "Al dar de alta un cliente con correo (a mano o con el formulario del enlace) se le envía un correo confirmando que tenéis sus datos.":
    "When a client with an email address is added (by hand or with the link form), they get an email confirming you have their details.",
  "enviados (30 días)": "sent (30 days)",
  "se envía desde": "sent from",
  "Recordatorios a clientes": "Client reminders",
  "Cita con cliente → correo recordatorio": "Client appointment → reminder email",
  "Antes de cada cita de la Agenda con un cliente, le llega un correo recordándole el día, la hora y el lugar. Menos olvidos y menos huecos perdidos.":
    "Before each calendar appointment with a client, they get an email reminding them of the day, time and place. Fewer no-shows and lost slots.",
  "citas con cliente en 7 días": "client appointments in 7 days",
  "El mismo día": "Same day",
  "{n} día antes": "{n} day before",
  "{n} días antes": "{n} days before",
  "a las {hora}": "at {hora}",
  "Flujo guardado.": "Flow saved.",

  // Flujo: vistas
  "Editar los correos de respuesta": "Edit the reply emails",
  "Llega un correo al buzón vigilado": "An email arrives at the watched mailbox",
  "Sin buzón elegido": "No mailbox chosen",
  "Vantia revisa ese buzón cada minuto (y al momento si el servidor de correo avisa). Solo lo que llega desde que se activó.":
    "Vantia checks that mailbox every minute (and instantly if the mail server notifies it). Only what arrives after it was turned on.",
  "Buzón": "Mailbox",
  "Solo de estos remitentes (opcional)": "Only from these senders (optional)",
  "Uno por línea: direcciones o dominios. Vacío: de cualquiera.": "One per line: addresses or domains. Empty: from anyone.",
  "El correo habla de una vista": "The email is about a hearing",
  "{n} palabra clave": "{n} keyword",
  "{n} palabras clave": "{n} keywords",
  "Tiene que contener alguna de estas palabras y un número de autos. Las respuestas automáticas y los correos sin relación se ignoran.":
    "It must contain one of these words and a case number. Auto-replies and unrelated emails are ignored.",
  "Palabras clave": "Keywords",
  "Una por línea. Sin distinguir mayúsculas ni tildes.": "One per line. Not case- or accent-sensitive.",
  "Leer fecha, hora, juzgado, autos y NIG": "Read date, time, court, case number and NIG",
  "Por patrones (IA no configurada)": "By patterns (AI not set up)",
  "Con IA": "With AI",
  "Se leen el correo y sus adjuntos. Si es un cambio de fecha o una cancelación de una vista que ya teníais, se trata como tal.":
    "The email and its attachments are read. If it's a date change or cancellation of a hearing you already had, it's handled as such.",
  "Comprobar si choca con la agenda": "Check for calendar clashes",
  "Se avisa si a esa hora ya hay algo en la agenda, para decidir con todo a la vista.": "You're told if something is already in the calendar at that time, so you can decide with everything in view.",
  "Pedir confirmación": "Ask for confirmation",
  "A {nombre}": "To {nombre}",
  "Al dueño del buzón": "To the mailbox owner",
  "Llega un aviso (y a la campana) para aceptarla o rechazarla desde Vistas. Por privacidad, solo la ven el dueño del buzón y esta persona.":
    "A notification (and a bell alert) arrives to accept or reject it from Hearings. For privacy, only the mailbox owner and this person can see it.",
  "¿A quién se pide?": "Who is asked?",
  "Si aceptas": "If you accept",
  "Responder al remitente confirmando": "Reply to the sender confirming",
  "Al aceptar puedes revisar el correo antes de que salga, o no enviarlo esa vez.": "When accepting you can review the email before it goes out, or skip it that time.",
  "Dar de alta el expediente o vincularlo": "Create the case or link it",
  "Si los autos o el NIG coinciden con un expediente vuestro, se vincula a él; si no, se crea uno nuevo.":
    "If the case number or NIG matches one of your cases, it's linked to it; otherwise a new one is created.",
  "Añadir la vista a la agenda": "Add the hearing to the calendar",
  "Duración: {n} min": "Duration: {n} min",
  "En la agenda de quien la acepta, con el juzgado y la sala.": "In the calendar of whoever accepts it, with the court and courtroom.",
  "Duración por defecto": "Default duration",
  "{n} minuto": "{n} minute",
  "Guardar los adjuntos en el expediente": "Save the attachments to the case",
  "Los documentos del correo pasan a la documentación del expediente.": "The email's documents go into the case documents.",
  "Recordatorio para prepararla": "Reminder to prepare it",
  "El mismo día a las {hora}": "Same day at {hora}",
  "{n} día antes a las {hora}": "{n} day before at {hora}",
  "{n} días antes a las {hora}": "{n} days before at {hora}",
  "Un aviso para preparar la vista con tiempo.": "A notification to prepare the hearing in good time.",
  "Días antes": "Days before",
  "Si rechazas": "If you reject",
  "Responder que no podéis asistir": "Reply that you can't attend",
  "No se crea nada más. Si lo quitas, al rechazar no se responde (salvo que prepares el correo a mano).":
    "Nothing else is created. If you remove it, rejecting sends no reply (unless you write the email by hand).",
  "Cuando llega un señalamiento al correo, Vantia lo lee, te pide confirmación y, según lo que decidas, hace el resto. Puedes quitar los pasos que no quieras.":
    "When a hearing notice arrives by email, Vantia reads it, asks you to confirm and, depending on what you decide, does the rest. You can remove the steps you don't want.",

  // Flujo: documentos
  "Deja al menos un documento en el flujo.": "Keep at least one document in the flow.",
  "Se crea un expediente": "A case is created",
  "O se abre uno anterior por primera vez": "Or an older one is opened for the first time",
  "Los expedientes que ya existían reciben sus documentos la primera vez que se abren.": "Existing cases get their documents the first time they're opened.",
  "Generar: {doc}": "Generate: {doc}",
  "Dejarlos en la ficha del expediente": "Leave them in the case file",
  "Rellenos con los datos del despacho, del cliente y del expediente. Lo que falte queda marcado para completarlo, y se pueden volver a generar.":
    "Filled in with the firm's, client's and case details. Anything missing is highlighted to complete, and they can be regenerated.",
  "Elige qué documentos se preparan solos en cada expediente. Las plantillas que se usan son las de Documentos.":
    "Choose which documents are prepared automatically for each case. The templates used are the ones in Documents.",

  // Flujo: bienvenida
  "Se da de alta un cliente": "A client is added",
  "A mano o con el formulario del enlace": "By hand or with the link form",
  "No en las importaciones por CSV: no se escribe a cientos de clientes antiguos de golpe.": "Not on CSV imports: hundreds of old clients aren't emailed at once.",
  "El cliente tiene correo electrónico": "The client has an email address",
  "Sin correo, no se envía nada.": "Without an email address, nothing is sent.",
  "Enviar el correo de bienvenida": "Send the welcome email",
  "Sale desde {cuenta}.": "Sent from {cuenta}.",
  "Si el cliente prefiere otro idioma, va en español y en el suyo.": "If the client prefers another language, it goes in Spanish and theirs.",
  "Nombre completo del cliente": "Client's full name",
  "Deja asunto y mensaje vacíos para usar el texto por defecto.": "Leave subject and message empty to use the default text.",
  "Un correo para que el cliente sepa que tenéis sus datos. Pulsa «Enviar el correo de bienvenida» para cambiar el texto.":
    "An email so the client knows you have their details. Click «Send the welcome email» to change the text.",

  // Flujo: recordatorios
  "Elige al menos un tipo de cita.": "Choose at least one appointment type.",
  "No se pudo preparar la vista previa": "The preview couldn't be prepared",
  "Se acerca una cita con un cliente": "A client appointment is coming up",
  "Cuenta cualquier evento de la Agenda de estos tipos que tenga un cliente, o un expediente con cliente. Si la cita se cambia de día, se recuerda la nueva fecha.":
    "Any calendar event of these types with a client, or a case with a client, counts. If the appointment moves to another day, the new date is reminded.",
  "Tipos de cita": "Appointment types",
  "¿Cuándo?": "When?",
  "Las citas canceladas no se recuerdan, y cada cita se recuerda una sola vez.": "Cancelled appointments aren't reminded, and each one is reminded only once.",
  "Enviar el recordatorio al cliente": "Send the reminder to the client",
  "Nombre del cliente": "Client name",
  "Título de la cita": "Appointment title",
  "Lugar": "Place",
  "«Lugar: …» si la cita tiene lugar": "«Place: …» if the appointment has one",
  "Con tu próxima cita con cliente:": "With your next client appointment:",
  "Con una cita de ejemplo:": "With a sample appointment:",
  "Avisarte de que se ha enviado": "Let you know it was sent",
  "Un aviso a quien tiene la cita en su agenda.": "A notification to whoever has the appointment in their calendar.",

  // Mi Despacho
  "Ahora se configura con las demás automatizaciones.": "It's now set up with the other automations.",
  "Ir a Automatizaciones →": "Go to Automations →",
});
