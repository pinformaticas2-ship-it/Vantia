// Opciones de listas y desplegables definidas como datos en el código (meses,
// estados, materias, formas de pago...). Se ven traducidas gracias al traductor
// de pantalla (texto exacto) o a t(opcion.label) donde se pintan.
import { registrarEn } from '../../lib/i18n';

registrarEn({
  // Meses y días
  "Enero": "January", "Febrero": "February", "Marzo": "March", "Abril": "April", "Mayo": "May", "Junio": "June",
  "Julio": "July", "Agosto": "August", "Septiembre": "September", "Octubre": "October", "Noviembre": "November", "Diciembre": "December",
  "Ene": "Jan", "Feb": "Feb", "Mar": "Mar", "Abr": "Apr", "May": "May", "Jun": "Jun",
  "Jul": "Jul", "Ago": "Aug", "Sep": "Sep", "Oct": "Oct", "Nov": "Nov", "Dic": "Dec",
  "Lun": "Mon", "Jue": "Thu", "Vie": "Fri", "Dom": "Sun",
  "Trimestre 1": "Quarter 1", "Trimestre 2": "Quarter 2", "Trimestre 3": "Quarter 3", "Trimestre 4": "Quarter 4",
  "Ayer": "Yesterday", "Desde siempre": "All time", "Pasadas": "Past", "Rango": "Range",

  // Materias, tipos y fases
  "Procesal": "Procedural", "Mercantil": "Commercial", "Laboral": "Employment", "Familia": "Family", "Penal": "Criminal",
  "Fiscal": "Tax", "Legal": "Legal", "Comercial": "Sales", "Herencias": "Inheritance", "Despidos": "Dismissals",
  "Contencioso-Administrativo": "Administrative litigation", "Materia": "Area of law",
  "Expediente Judicial": "Court case", "Expediente Extrajudicial": "Out-of-court case",
  "Procedimiento Ordinario": "Ordinary proceedings", "Verbal": "Verbal proceedings", "Monitorio": "Payment order proceedings",
  "Diligencias Previas": "Preliminary proceedings", "Exhorto": "Letter rogatory", "Prejudicial": "Pre-litigation",
  "Indeterminado": "Undetermined", "Plazo Procesal": "Procedural deadline", "Sentencia": "Judgment", "Decreto": "Decree",
  "Providencia": "Order", "Requerimiento": "Request", "Tribunales": "Courts", "Audiencia Provincial": "Provincial Court",
  "Decanato de los Juzgados": "Courts' Dean's Office", "Nº Juzgado": "Court no.", "Demandantes": "Claimants", "Demandados": "Defendants",
  "Representamos a": "We represent", "Propio": "Own", "Propio (clientes)": "Own (clients)", "Contrarios": "Opposing parties",
  "Abogado Propio": "Own lawyer", "Procurador/a de los Tribunales": "Court representative (procurador)",
  "En Juicio": "In court", "En juicio": "In court", "Cierre": "Closing", "Reapertura": "Reopening", "Cerrado": "Closed",
  "Exp. relacionado": "Related case", "Exp. relacionados": "Related cases", "Historial Expediente": "Case history",
  "Tareas/Plazos": "Tasks/Deadlines", "Tareas / Plazos": "Tasks / Deadlines", "Tareas-Plazos": "Tasks-Deadlines",
  "Expedientes / Clientes": "Cases / Clients", "Datos": "Details", "Cobros": "Collections", "Contrato": "Contract",
  "Presupuesto": "Quote", "Pago / Factura": "Payment / Invoice", "Imp. Cobros Vencidos Pdtes.": "Overdue outstanding amount",
  "Consentimiento RGPD": "GDPR consent", "NDA entre despacho y cliente": "NDA between firm and client",
  "Ley, Real Decreto...": "Act, Royal Decree...", "Con DNI": "With ID", "Nat.": "Nat.",

  // Estados
  "Borrador": "Draft", "Atrasado": "Overdue", "Confirmada": "Confirmed", "Aceptada": "Accepted", "Aceptadas": "Accepted",
  "Rechazada": "Rejected", "Rechazadas": "Rejected", "Cancelada": "Cancelled", "Canceladas": "Cancelled",
  "Descartada": "Discarded", "Descartadas": "Discarded", "Fallida": "Failed", "Resuelto": "Resolved", "Revisando": "Reviewing",
  "Seguimiento": "Follow-up", "Subido": "Uploaded", "Configurando": "Setting up", "Desconectado": "Disconnected",
  "Disponible": "Available", "Disponibles": "Available", "Ocupado": "Busy", "Ausente": "Away", "Vacaciones": "On holiday",
  "Visibles": "Visible", "Creados": "Created", "Compartido": "Shared", "Compartidos": "Shared", "Frecuentes": "Frequent",
  "Procesando…": "Processing…", "Sigo aquí": "I'm still here",

  // CRM
  "Pipeline": "Pipeline", "Abiertas": "Open", "Ganadas": "Won", "Perdidas": "Lost", "Abandonadas": "Abandoned",
  "Formulario": "Form", "Presencial": "In person", "Cambio": "Change", "Oportunidades": "Opportunities",
  "Oportunidad": "Opportunity", "Valor": "Value", "Kanban": "Kanban", "Gantt": "Gantt",

  // Tipo de contacto (se guarda en mayúsculas y se muestra tal cual)
  "CLIENTE": "CLIENT", "CONTRARIO": "OPPOSING PARTY", "JUZGADO": "COURT", "PERITO": "EXPERT", "PROVEEDOR": "SUPPLIER",

  // Facturación
  "Transferencia": "Bank transfer", "Tarjeta": "Card", "Bizum": "Bizum", "Efectivo": "Cash", "Suministros": "Utilities",
  "Abono (pagado)": "Credit note (paid)",

  // Equipo, roles y comunicación
  "Colaborador": "Collaborator", "Equipo": "Team", "Equipo del despacho": "Firm team", "Departamento": "Department",
  "Sistema": "System", "Correo Corporativo": "Company email", "Mensaje Interno": "Internal message",
  "Programar WhatsApp": "Schedule WhatsApp", "Mensajes": "Messages", "Comunicaciones": "Communications",
  "Comentar": "Comment", "Escribir": "Write", "Responder a...": "Reply to...", "Detalles": "Details", "Tickets": "Tickets",
  "Actividades": "Activities", "Adjuntar todos": "Attach all", "Importar CSV": "Import CSV",
  "Importar expediente desde documento": "Import case from a document", "Generar PDF": "Generate PDF",
  "Diagnosticar buzón": "Diagnose mailbox", "Editar páginas": "Edit pages", "Recuperar borrador": "Recover draft",
  "Reintentar fallidas": "Retry failed", "Seleccionar empresa": "Select company", "Crear nuevo ...": "Create new ...",
  "Tienes un borrador sin guardar · Recuperar / Descartar": "You have an unsaved draft · Recover / Discard",
  "Comentario no encontrado": "Comment not found", "Conversación no encontrada": "Conversation not found",
  "Vantia no está configurada...": "Vantia is not set up...",
  "En la demostración no se puede desconectar la cuenta.": "The account can't be disconnected in the demo.",
  "Google Calendar conectado correctamente.": "Google Calendar connected.",
  "Google Calendar desconectado.": "Google Calendar disconnected.",
  "Han pasado más de 24 horas desde el último mensaje de esta persona: Instagram no deja contestar hasta que vuelva a escribir.":
    "More than 24 hours have passed since this person's last message: Instagram won't let you reply until they write again.",
  "No debe contener datos personales ni de la página.": "It must not contain personal or page data.",

  // Redes sociales
  "Seguidores": "Followers", "Publicaciones": "Posts", "Visualizaciones": "Views", "Amigos (seguidores mutuos)": "Friends (mutual followers)",
  "Historia": "Story", "Video": "Video", "Branded content": "Branded content",

  // Colores, países e idiomas
  "Amarillo": "Yellow", "Azul": "Blue", "Morado": "Purple", "Naranja": "Orange", "Rojo": "Red", "Rosa": "Pink", "Verde": "Green",
  "Alemania": "Germany", "Argentina": "Argentina", "Colombia": "Colombia", "Francia": "France", "Italia": "Italy",
  "Portugal": "Portugal", "Reino Unido": "United Kingdom", "Suiza": "Switzerland", "Estados Unidos": "United States",
  "Venezuela": "Venezuela", "Italiano": "Italian", "Català": "Catalan", "Polski (polaco)": "Polski (Polish)",
  "Română (rumano)": "Română (Romanian)",

  // Emojis y atajos
  "Caras": "Faces", "Gestos": "Gestures", "Objetos": "Objects", "Banderas": "Flags", "Moverse": "Move",
  "Bloque": "Block", "Widget": "Widget", "Atajo": "Shortcut", "Todo.": "Everything.", "Intro": "Enter", "Esc": "Esc",
  "G y luego D, E, L, A, T, V, C, M, O o S": "G then D, E, L, A, T, V, C, M, O or S",

  // Skills de ejemplo que se crean con cada despacho (si se editan, se ven como se escriban)
  "Estilo del despacho": "Firm style",
  "Formato y tono de todo lo que redacta la IA.": "Format and tone of everything the AI drafts.",
  "Demanda de juicio verbal (reclamación de cantidad)": "Verbal proceedings claim (claim for an amount)",
  "Demanda para reclamar cantidades de hasta 15.000 € (art. 250.2 LEC).": "Claim for amounts up to €15,000 (art. 250.2 LEC).",
  "Burofax de reclamación previa": "Pre-action demand burofax",
  "Requerimiento extrajudicial de pago o de cumplimiento antes de demandar.": "Out-of-court demand for payment or performance before suing.",
  "Hoja de encargo profesional": "Engagement letter",
  "Encargo profesional entre el despacho y el cliente, con honorarios.": "Engagement between the firm and the client, with fees.",
  "Correo al cliente sobre el estado del asunto": "Email to the client on the status of the matter",
  "Explicar al cliente cómo va su expediente, sin jerga.": "Explain to the client how their case is going, without jargon.",
  "Resumen del expediente": "Case summary",
  "Resumen interno: partes, hechos, estado, plazos y riesgos.": "Internal summary: parties, facts, status, deadlines and risks.",

  // Manual
  "Dashboard, Expedientes, Directorio (clientes, procuradores, abogados, contrarios), Agenda, Tareas":
    "Dashboard, Cases, Directory (clients, court representatives, lawyers, opposing parties), Calendar, Tasks",
  "Chat, Correo, Vistas (si su despacho tiene activada la automatización), Comunicación externa (WhatsApp)":
    "Chat, Email, Hearings (if your firm has automation turned on), External communication (WhatsApp)",
  "Tesorería (facturación), Documental, Chat IA": "Treasury (billing), Documents, AI Chat",
  "Citas, vistas y calendario": "Appointments, hearings and calendar",
  "CENDOJ, BOE y Lexnet": "CENDOJ, BOE and Lexnet",
  "Cobros, gastos y Quipu": "Collections, expenses and Quipu",
  "Documentos / Drive / Dropbox": "Documents / Drive / Dropbox",

  // Seguridad de la contraseña
  "Añade más palabras poco habituales.": "Add more uncommon words.",
  "Es una contraseña de las más utilizadas.": "This is one of the most used passwords.",
  "Es una contraseña muy utilizada.": "This is a very common password.",
  "Es una de las contraseñas más utilizadas.": "This is one of the most used passwords.",
  "Evita años relacionados contigo.": "Avoid years related to you.",
  "Evita fechas y años relacionados contigo.": "Avoid dates and years related to you.",
  "Evita los años recientes.": "Avoid recent years.",
  "Evita palabras comunes escritas al revés.": "Avoid common words spelled backwards.",
  "Evita palabras y caracteres repetidos.": "Avoid repeated words and characters.",
  "Evita secuencias de caracteres habituales.": "Avoid common character sequences.",
  "Evita sustituciones previsibles, como «@» por «a».": "Avoid predictable substitutions, such as «@» for «a».",
  "Las fechas son fáciles de adivinar.": "Dates are easy to guess.",
  "Las filas seguidas del teclado son fáciles de adivinar.": "Straight rows of keys are easy to guess.",
  "Las secuencias como «abc» son fáciles de adivinar.": "Sequences like «abc» are easy to guess.",
  "Los años recientes son fáciles de adivinar.": "Recent years are easy to guess.",
  "Los caracteres repetidos como «aaa» son fáciles de adivinar.": "Repeated characters like «aaa» are easy to guess.",
  "Los nombres y apellidos comunes son fáciles de adivinar.": "Common names and surnames are easy to guess.",
  "Los patrones cortos de teclado son fáciles de adivinar.": "Short keyboard patterns are easy to guess.",
  "Los patrones repetidos como «abcabcabc» son fáciles de adivinar.": "Repeated patterns like «abcabcabc» are easy to guess.",
  "No debe contener datos personales": "It must not contain personal data",
  "Pon en mayúscula algunas letras, pero no todas.": "Capitalise some letters, but not all.",
  "Puedes crear contraseñas seguras sin símbolos, números ni mayúsculas.": "You can make strong passwords without symbols, numbers or capital letters.",
  "Se parece a una contraseña muy utilizada.": "This is similar to a very common password.",
  "Si usas esta contraseña en otro sitio, deberías cambiarla.": "If you use this password elsewhere, you should change it.",
  "Tu contraseña cumple todos los requisitos.": "Your password meets all the requirements.",
  "Tu contraseña ha aparecido en una filtración de datos en Internet.": "Your password has appeared in a data breach online.",
  "Tu contraseña no es lo bastante segura.": "Your password isn't strong enough.",
  "Tu contraseña sirve, pero podría ser más segura. Prueba a añadir más caracteres.": "Your password works, but it could be stronger. Try adding more characters.",
  "Un nombre o apellido solo es fácil de adivinar.": "A name or surname on its own is easy to guess.",
  "Una sola palabra es fácil de adivinar.": "A single word is easy to guess.",
  "Usa mayúsculas en algo más que la primera letra.": "Use capitals in more than just the first letter.",
  "Usa patrones de teclado más largos y cambia de dirección varias veces.": "Use longer keyboard patterns and change direction several times.",
  "Usa varias palabras, pero evita frases hechas.": "Use several words, but avoid common phrases.",
});
