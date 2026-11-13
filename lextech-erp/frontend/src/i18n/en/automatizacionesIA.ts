// Automatizaciones con IA de Vantia, webhook entrante, notas (13/11/2026).
import { registrarEn } from '../../lib/i18n';

registrarEn({
  // Móvil
  "Información": "Information",
  "Arrastra con un dedo para moverte; pellizca para acercar o alejar.": "Drag with one finger to move around; pinch to zoom in or out.",
  "Para añadir un paso, toca su icono arriba; se engancha al paso que tengas seleccionado.": "To add a step, tap its icon at the top; it attaches to the step you have selected.",
  "El flujo no puede volver a un paso anterior (daría vueltas sin fin).": "The flow can't go back to an earlier step (it would loop forever).",

  // Paleta y pasos
  "Inteligencia artificial": "Artificial intelligence",
  "IA de Vantia": "Vantia AI", "Redacta, resume, clasifica o decide": "Drafts, summarises, classifies or decides",
  "Añadir nota": "Add note", "En el expediente o el cliente": "On the case or the client",
  "Completar tarea": "Complete task", "Marcar la tarea como hecha": "Mark the task as done",
  "Escribe qué debe hacer": "Write what it should do", "En el expediente": "On the case", "Escribe la nota": "Write the note",
  "La tarea del disparador": "The trigger's task", "Faltan las instrucciones": "Instructions missing", "Falta el texto": "Text missing",
  "Respuesta de la IA ({v})": "AI answer ({v})",

  // Formularios
  "Dirección para enviar los datos": "Address to send the data to",
  "Guarda la automatización para obtener su dirección.": "Save the automation to get its address.",
  "Envía un POST con JSON o formulario (por ejemplo nombre, email, telefono, mensaje). Cada campo queda como {entrada.campo}. Trátala como una contraseña: quien la tenga puede lanzar la automatización.":
    "Send a POST with JSON or a form (for example nombre, email, telefono, mensaje). Each field becomes {entrada.campo}. Treat it like a password: anyone who has it can run the automation.",
  "La IA de Vantia no está configurada en el servidor: este paso fallará hasta que lo esté.": "Vantia AI isn't set up on the server: this step will fail until it is.",
  "¿Qué tiene que hacer la IA?": "What should the AI do?",
  "Por ejemplo: «Resume este correo en una frase», «¿Es urgente?», «Redacta una respuesta amable». Recibe todos los datos del disparador.":
    "For example: «Summarise this email in one sentence», «Is it urgent?», «Draft a friendly reply». It receives all the trigger data.",
  "Modelo": "Model", "Skill (opcional)": "Skill (optional)", "Ninguna": "None", "Qué devuelve": "What it returns",
  "Texto": "Text", "Sí o no": "Yes or no", "Una opción": "One option",
  "Separadas por comas. Úsalas luego en una condición.": "Comma-separated. Use them later in a condition.",
  "laboral, familia, penal, otro": "employment, family, criminal, other",
  "Guardar la respuesta como": "Save the answer as", "Los pasos siguientes la usan con": "Later steps use it with",
  "Dejar que consulte los datos del despacho": "Let it look up the firm's data",
  "Como en el chat: puede buscar clientes, expedientes, tareas, agenda o facturas para responder. Solo lee; nunca cambia nada.":
    "Like in the chat: it can look up clients, cases, tasks, calendar or invoices to answer. It only reads; it never changes anything.",
  "Cada ejecución cuenta en el uso diario de la IA, como el chat.": "Each run counts towards the daily AI usage, like the chat.",
  "En el expediente (o en el cliente si no hay expediente)": "On the case (or on the client if there's no case)", "En el cliente": "On the client",
  "Marca como completada la tarea del disparador (plazo que se acerca, tarea vencida o tarea nueva).": "Marks the trigger's task as completed (approaching deadline, overdue task or new task).",

  // Pedir a la IA / crear con IA
  "La IA no ha podido cambiar el flujo": "The AI couldn't change the flow", "Pedir cambios a la IA": "Ask the AI for changes", "Pedir a la IA": "Ask the AI",
  "¿Qué quieres cambiar?": "What do you want to change?",
  "Por ejemplo: «añade una espera de 2 días antes del correo» o «si el cliente no tiene correo, avisa al responsable». Podrás deshacerlo con Ctrl+Z.":
    "For example: «add a 2-day wait before the email» or «if the client has no email, notify the person responsible». You can undo it with Ctrl+Z.",
  "Aplicar": "Apply",
  "La IA no ha podido crear el flujo": "The AI couldn't create the flow",
  "Créala con IA: descríbela con tus palabras": "Create it with AI: describe it in your own words",
  "Por ejemplo: «Cuando entre un cliente nuevo, espera 2 días, y si tiene correo mándale uno preguntando qué tal; si no, crea una tarea para llamarle»":
    "For example: «When a new client comes in, wait 2 days, and if they have an email send them one asking how it's going; if not, create a task to call them»",
  "Crear con IA": "Create with AI", "Creando…": "Creating…",
  "La IA de Vantia no está configurada en el servidor.": "Vantia AI isn't set up on the server.",
  "Se abre en el lienzo para que la revises antes de guardarla; nada se activa solo.": "It opens on the canvas for you to review before saving; nothing turns on by itself.",
  "O empieza desde una plantilla": "Or start from a template",

  // Plantillas
  "Clasificar correos con IA": "Classify emails with AI", "La IA lee cada correo que llega y, si es urgente, avisa a todo el despacho.": "The AI reads every incoming email and, if it's urgent, notifies the whole firm.",
  "Bienvenida personalizada con IA": "Personalised welcome with AI", "La IA redacta un correo de bienvenida a la medida de cada cliente nuevo.": "The AI drafts a tailored welcome email for each new client.",
  "Formulario web → CRM": "Website form → CRM", "Tu web envía el formulario a Vantia y entra como aviso con un resumen hecho por la IA.": "Your website sends the form to Vantia and it arrives as a notification with an AI summary.",

  // Servidor
  "Llega una petición de otra herramienta": "A request arrives from another tool",
  "Un formulario web, Zapier, Make… envía datos a una dirección propia de esta automatización.": "A website form, Zapier, Make… sends data to this automation's own address.",
  "Dato «nombre» recibido": "Received «nombre» field", "Dato «email» recibido": "Received «email» field", "Dato «telefono» recibido": "Received «telefono» field", "Dato «mensaje» recibido": "Received «mensaje» field",
  "Día de la semana": "Day of the week", "Hora actual": "Current time", "Respuesta de la IA en un paso anterior": "AI answer from an earlier step",
  "La IA respondería: «{texto}»": "The AI would answer: «{texto}»", "La IA ha respondido: «{texto}»": "The AI answered: «{texto}»",
  "Aquí no hay expediente ni cliente donde dejar la nota.": "There's no case or client here to leave the note on.",
  "Se añadiría una nota al {donde}": "A note would be added to the {donde}", "Nota añadida al {donde}": "Note added to the {donde}",
  "expediente": "case", "cliente": "client",
  "Aquí no hay ninguna tarea.": "There's no task here.", "La tarea ya no existe.": "The task no longer exists.",
  "Se marcaría como completada la tarea «{titulo}»": "Task «{titulo}» would be marked as completed", "Tarea «{titulo}» completada": "Task «{titulo}» completed",
});
