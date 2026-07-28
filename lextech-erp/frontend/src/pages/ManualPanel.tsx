import React from "react";

// ── Bloques reutilizables para reproducir el manual ─────────────

function Chapter({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <section id={`cap-${n}`} className="scroll-mt-8 mb-14">
      <div className="mb-4 flex items-center gap-3">
        <span className="inline-flex items-center justify-center rounded-md border border-rose-200 bg-rose-50 px-2 py-0.5 text-xs font-bold text-rose-600">
          {n}
        </span>
        <h2 className="text-xl font-extrabold text-slate-800">{title}</h2>
      </div>
      <div className="mb-6 border-b border-slate-200" />
      <div className="space-y-4 text-sm leading-relaxed text-slate-600">{children}</div>
    </section>
  );
}

function SubHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="!mt-8 text-base font-bold text-slate-800">{children}</h3>;
}

function P({ children }: { children: React.ReactNode }) {
  return <p>{children}</p>;
}

function Callout({ tone, label, children }: { tone: "green" | "pink" | "amber"; label: string; children: React.ReactNode }) {
  const box: Record<string, string> = {
    green: "border-emerald-200 bg-emerald-50/70",
    pink: "border-rose-200 bg-rose-50/70",
    amber: "border-amber-200 bg-amber-50/70",
  };
  const labelColor: Record<string, string> = {
    green: "text-emerald-600",
    pink: "text-rose-600",
    amber: "text-amber-600",
  };
  return (
    <div className={`rounded-2xl border px-5 py-4 ${box[tone]}`}>
      <p className={`mb-1.5 text-[10px] font-bold uppercase tracking-widest ${labelColor[tone]}`}>{label}</p>
      <div className="text-sm leading-relaxed text-slate-700">{children}</div>
    </div>
  );
}

function Steps({ items }: { items: React.ReactNode[] }) {
  return (
    <ol className="space-y-3">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3">
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rose-600 text-xs font-bold text-white">
            {i + 1}
          </span>
          <div className="flex-1 pt-0.5">{item}</div>
        </li>
      ))}
    </ol>
  );
}

function Bullets({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="list-disc space-y-2 pl-5 marker:text-rose-400">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

function InfoTable({ headers, rows }: { headers: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="min-w-full text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50">
            {headers.map((h, i) => (
              <th key={i} className="whitespace-nowrap px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j} className="px-4 py-2.5 align-top text-slate-600">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Pills({ items }: { items: string[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((it) => (
        <span key={it} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600">
          {it}
        </span>
      ))}
    </div>
  );
}

const TOC: { n: string; title: string }[] = [
  { n: "01", title: "Introducción a Vantia" },
  { n: "02", title: "Acceso y navegación general" },
  { n: "03", title: "Panel principal" },
  { n: "04", title: "Clientes" },
  { n: "05", title: "Expedientes" },
  { n: "06", title: "Agenda" },
  { n: "07", title: "Tareas y plazos" },
  { n: "08", title: "Facturación" },
  { n: "09", title: "Documental" },
  { n: "10", title: "Correo" },
  { n: "11", title: "WhatsApp" },
  { n: "12", title: "Chat interno" },
  { n: "13", title: "VantIA — el asistente de inteligencia artificial" },
  { n: "14", title: "Configuración" },
  { n: "15", title: "Trazabilidad" },
  { n: "16", title: "Preguntas frecuentes" },
  { n: "17", title: "Glosario" },
];

export default function ManualPanel() {
  return (
    <div className="max-w-none">
      {/* ── Portada ── */}
      <div className="mb-10 rounded-3xl border border-slate-200 bg-white p-8">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">Manual de usuario · Versión 1.0</p>
        <h1 className="mt-2 font-serif text-3xl font-bold text-slate-900">
          Vantia Legis
          <br />
          Guía completa del ERP legal
        </h1>
        <p className="mt-4 max-w-3xl text-sm leading-relaxed text-slate-500">
          Todo lo que necesita el equipo del despacho para gestionar clientes, expedientes, agenda, facturación,
          documentación y comunicaciones desde una sola plataforma, con el apoyo del asistente de inteligencia
          artificial VantIA.
        </p>
        <div className="mt-6 grid grid-cols-1 gap-4 border-t border-slate-100 pt-5 sm:grid-cols-3">
          <div>
            <p className="text-sm font-bold text-slate-800">17 capítulos</p>
            <p className="text-xs text-slate-400">De la primera sesión a la auditoría de uso</p>
          </div>
          <div>
            <p className="text-sm font-bold text-slate-800">10 módulos operativos</p>
            <p className="text-xs text-slate-400">Clientes, expedientes, agenda, tareas, facturación…</p>
          </div>
          <div>
            <p className="text-sm font-bold text-slate-800">Perfil de lectura</p>
            <p className="text-xs text-slate-400">Abogados, procuradores y personal administrativo</p>
          </div>
        </div>
      </div>

      {/* ── Índice ── */}
      <div className="mb-10 rounded-3xl border border-slate-200 bg-white p-6">
        <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-slate-800">Índice</h3>
        <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
          {TOC.map((c) => (
            <a
              key={c.n}
              href={`#cap-${c.n}`}
              className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm text-slate-600 transition-colors hover:bg-rose-50 hover:text-rose-700"
            >
              <span className="inline-flex h-5 w-6 shrink-0 items-center justify-center rounded border border-rose-200 bg-rose-50 text-[10px] font-bold text-rose-600">
                {c.n}
              </span>
              {c.title}
            </a>
          ))}
        </div>
      </div>

      {/* ── 01 Introducción a Vantia ── */}
      <Chapter n="01" title="Introducción a Vantia">
        <P>
          Vantia (también identificada internamente como LexTech AI ERP) es el sistema de gestión del despacho: reúne
          en una sola aplicación la ficha de cada cliente y expediente, el calendario, las tareas con plazo, la
          facturación, el correo, WhatsApp, el chat interno y un buscador jurídico, y añade sobre todo ello un
          asistente de inteligencia artificial que conoce los datos reales del despacho.
        </P>
        <P>
          Este manual describe, módulo por módulo, qué puede hacer cada persona del equipo dentro de la aplicación:
          qué ve, qué botones tiene disponibles y qué flujo de trabajo debe seguir para completar las tareas más
          habituales de un despacho de abogados: dar de alta un cliente, abrir un expediente, programar una vista,
          facturar una provisión de fondos o responder un correo sin salir de Vantia.
        </P>
        <Callout tone="green" label="Cómo usar este manual">
          Los capítulos 4 a 13 corresponden uno a uno con los módulos del menú lateral de la aplicación, en el mismo
          orden en que aparecen agrupados dentro de Vantia. Puede leerlos en orden o ir directamente al módulo que
          necesite desde el índice de la izquierda.
        </Callout>
        <SubHeading>¿Para quién es Vantia?</SubHeading>
        <P>
          La aplicación está pensada para todo el personal del despacho: abogados y abogadas que llevan expedientes,
          procuradores, personal administrativo que gestiona la agenda y la facturación, y responsables del despacho
          que necesitan una visión de conjunto y trazabilidad de lo que ocurre en el sistema.
        </P>
      </Chapter>

      {/* ── 02 Acceso y navegación general ── */}
      <Chapter n="02" title="Acceso y navegación general">
        <P>
          Estos elementos son comunes a toda la aplicación: aparecen en cualquier módulo en el que se encuentre, y
          conviene conocerlos bien antes de entrar en el detalle de cada sección.
        </P>
        <SubHeading>2.1 Iniciar sesión</SubHeading>
        <P>
          Al abrir Vantia sin haber iniciado sesión, se muestra la página de acceso: a la derecha, el formulario de
          inicio de sesión; a la izquierda, un panel de marca con citas de juristas y tres características del
          producto (cifrado extremo a extremo, extracción de expedientes con IA y trazabilidad total). Si ya tiene
          una sesión activa en el navegador, verá directamente un botón «Entrar al dashboard».
        </P>
        <SubHeading>2.2 El menú lateral</SubHeading>
        <P>
          La barra lateral izquierda es el punto de partida para moverse por la aplicación. Puede plegarse para
          ganar espacio de pantalla y se organiza en tres bloques:
        </P>
        <InfoTable
          headers={["Bloque", "Módulos"]}
          rows={[
            ["Principal", "Dashboard, Expedientes, Clientes, Trazabilidad"],
            ["Productividad", "Agenda, Tareas, Chat, WhatsApp, Correo, Facturación"],
            ["Conocimiento", <>Documental, Plaud IA <em>(en construcción)</em>, Chat IA</>],
          ]}
        />
        <P>
          En la parte inferior de la barra lateral encontrará el selector de despacho/empresa (si trabaja con
          varios), su perfil de usuario con la opción de cerrar sesión, el acceso a Configuración y una insignia de
          «Conexión Segura». Los iconos de Chat, WhatsApp y Correo muestran una burbuja roja con el número de
          mensajes no leídos.
        </P>
        <SubHeading>2.3 Buscador global y notificaciones</SubHeading>
        <P>
          En la cabecera superior, el buscador global permite escribir el nombre de cualquier módulo (por ejemplo
          «factura» o «agenda») y saltar directamente a él sin usar el menú lateral. Junto al buscador, el icono de
          campana abre el panel de notificaciones, que agrupa avisos de chat, correo y WhatsApp con la indicación de
          cuánto tiempo hace que llegaron.
        </P>
        <SubHeading>2.4 El widget VantIA</SubHeading>
        <P>
          En la esquina inferior derecha, visible en cualquier pantalla de la aplicación, hay un botón circular rojo
          que abre el asistente de inteligencia artificial VantIA. Se explica en detalle en el capítulo 13, pero
          conviene saber desde ya que está siempre a mano: cambia de «especialidad» según el módulo en el que se
          encuentre (especialista en clientes, en expedientes, en agenda, en correo…) y puede consultar datos reales
          del despacho para responder.
        </P>
        <SubHeading>2.5 Atajos personalizados</SubHeading>
        <P>
          Desde los módulos de Clientes y Expedientes, el sistema de Atajos permite crear accesos rápidos que
          combinan una acción habitual (enviar correo, SMS o WhatsApp, imprimir, generar un PDF, crear una tarea,
          dar de alta o cerrar un expediente, solicitar documentación o provisión de fondos, enviar a firma…) con
          una plantilla y, si procede, una carpeta de archivo concreta. Un atajo bien configurado convierte un
          proceso de varios pasos en un solo clic.
        </P>
        <Callout tone="green" label="Consejo">
          Si su despacho repite a menudo el mismo trámite (por ejemplo, «enviar hoja de encargo y crear tarea de
          seguimiento a 15 días»), merece la pena invertir cinco minutos en crear un atajo la primera vez: se
          amortiza rápidamente.
        </Callout>
      </Chapter>

      {/* ── 03 Panel principal ── */}
      <Chapter n="03" title="Panel principal">
        <P>
          El Dashboard es la pantalla de inicio tras acceder a Vantia: un resumen configurable de lo que está
          pasando en el despacho hoy.
        </P>
        <SubHeading>3.1 Cabecera y altas rápidas</SubHeading>
        <P>
          En la parte superior del panel encontrará un saludo personalizado según la hora del día y un pequeño
          widget de clima basado en su ubicación. Junto a él, dos botones concentran las altas más frecuentes:
        </P>
        <Bullets
          items={[
            <>
              <strong>Nuevo Cliente</strong>, con tres opciones: crear manualmente, dar de alta con lectura de DNI
              (OCR) o generar un enlace para que el propio cliente rellene sus datos.
            </>,
            <>
              <strong>Nuevo Expediente</strong>, con tres opciones: crear manualmente, importar desde un archivo
              CSV, o crear automáticamente a partir de un conjunto de documentos mediante inteligencia artificial.
            </>,
          ]}
        />
        <P>Estas mismas opciones se detallan paso a paso en los capítulos 4 y 5.</P>
        <SubHeading>3.2 Widgets configurables</SubHeading>
        <P>
          El cuerpo del panel es una cuadrícula de widgets que usted mismo elige y ordena, mediante el menú «···» →
          Elegir elementos. Puede arrastrarlos para reordenarlos; la selección y la disposición se guardan por
          usuario, de modo que cada persona del despacho puede tener su propio panel.
        </P>
        <InfoTable
          headers={["Widget", "Qué muestra"]}
          rows={[
            ["Agenda", "Próximas citas: fecha, hora, ubicación y tipo de evento"],
            ["Tareas", "Contadores de vencidas, próximas (7 días), urgentes, pendientes y completadas"],
            ["Actividad reciente", "Últimos movimientos del despacho, con enlace directo a Trazabilidad"],
            ["Correo", "Cuenta activa y últimos 5 mensajes, con acciones rápidas"],
            ["WhatsApp", "Estado de conexión y del webhook, mensajes programados"],
            ["Documental", "Fuentes activas (BOE, CENDOJ, LexNET) y resoluciones destacadas"],
            ["Facturación", "Ingresos, gastos, IVA e IRPF a liquidar, con selector de año y periodo"],
            ["Expedientes / Clientes", "Accesos directos con estadísticas: totales, activos, con email o teléfono"],
          ]}
        />
      </Chapter>

      {/* ── 04 Clientes ── */}
      <Chapter n="04" title="Clientes">
        <P>
          El módulo de Clientes centraliza la ficha de cada persona o empresa con la que trabaja el despacho, con
          tres formas distintas de darla de alta y un conjunto de herramientas heredado de los programas de gestión
          clásicos.
        </P>
        <SubHeading>4.1 Listado de clientes</SubHeading>
        <P>
          La pantalla principal muestra el contador de clientes totales, activos y de baja, y una barra de
          herramientas con las acciones disponibles sobre el registro seleccionado: Alta (manual, con DNI o con
          enlace), Baja, Modificar, Enviar Correo, Enviar WhatsApp, Sign (firma electrónica), Tareas, Adjuntos,
          Imprimir, Excel y Atajos.
        </P>
        <P>
          El menú Opciones añade funciones adicionales: marcar opciones como favoritas, elegir qué columnas se
          muestran en la tabla, ir directamente a la ficha, a los expedientes o a las notas del cliente, asignar un
          color al registro, crear un recall, duplicar o fusionar clientes, enviar un SMS y comparar versiones
          anteriores del registro.
        </P>
        <P>
          Puede combinar varios filtros a la vez y alternar entre tres vistas: listado simple, listado con detalle
          expandible, o selección múltiple para aplicar una acción a varios clientes a la vez.
        </P>
        <SubHeading>4.2 Exportar a Excel</SubHeading>
        <P>
          Al exportar, usted elige qué columnas incluir y puede guardar esa selección como una plantilla de
          exportación reutilizable, para no tener que configurar las columnas cada vez que necesite el mismo tipo de
          listado.
        </P>
        <SubHeading>4.3 Dar de alta un cliente</SubHeading>
        <P>Vantia ofrece tres caminos para crear un cliente nuevo, pensados para situaciones distintas:</P>
        <p className="!mt-6 text-sm font-bold text-slate-800">A. Alta manual</p>
        <Steps
          items={[
            <>Pulse Nuevo Cliente → Crear manualmente desde el Dashboard o desde el listado de Clientes.</>,
            <>Rellene los datos de identificación, dirección y contacto en el formulario.</>,
            <>Añada notas internas si lo necesita.</>,
            <>Guarde el registro.</>,
          ]}
        />
        <p className="!mt-6 text-sm font-bold text-slate-800">B. Alta con lectura de DNI (OCR con IA)</p>
        <P>Pensada para cuando el cliente está físicamente en el despacho y trae su documento de identidad.</P>
        <Steps
          items={[
            <>Pulse Nuevo Cliente → Con DNI.</>,
            <>Fotografíe o suba el anverso y el reverso del DNI, NIE, TIE o pasaporte.</>,
            <>
              El sistema escanea el documento y muestra los campos detectados automáticamente (nombre, apellidos,
              NIF, fecha de nacimiento, dirección…) junto con un porcentaje de confianza de la lectura.
            </>,
            <>Revise y corrija los campos si es necesario: están resaltados para que sepa cuáles ha rellenado el escáner.</>,
            <>Complete los datos de contacto que falten (teléfono, correo) y guarde el alta.</>,
          ]}
        />
        <Callout tone="pink" label="Con inteligencia artificial">
          La lectura del documento combina reconocimiento óptico de caracteres, lectura de la banda MRZ del
          documento y visión por IA para maximizar el acierto. Aun así, el sistema siempre le deja revisar y
          corregir antes de guardar: la IA no da el alta por usted, se la propone.
        </Callout>
        <p className="!mt-6 text-sm font-bold text-slate-800">C. Alta con enlace</p>
        <P>Útil cuando el cliente no está presente y prefiere que rellene sus propios datos desde casa.</P>
        <Steps
          items={[
            <>Vaya a Nuevo Cliente → Con enlace.</>,
            <>Ponga una etiqueta identificativa al enlace, por ejemplo «Juan García – Divorcio».</>,
            <>Genere el enlace: es de un solo uso y caduca a los 30 días.</>,
            <>Envíe el enlace al cliente por el canal que prefiera (correo, WhatsApp…).</>,
            <>
              El cliente accede sin necesidad de cuenta a un formulario público (nombre, apellidos, correo, teléfono,
              NIF/CIF y observaciones, con aviso de cumplimiento RGPD/LOPDGDD).
            </>,
            <>En cuanto lo envía, el alta aparece automáticamente en su listado de Clientes.</>,
          ]}
        />
        <P>
          Desde la pantalla de enlaces generados puede ver su estado (pendiente, completado o expirado), quién lo
          completó y cuándo, copiar el enlace de nuevo o eliminarlo.
        </P>
        <SubHeading>4.4 Ficha del cliente</SubHeading>
        <P>Al abrir un cliente, la información se organiza en pestañas:</P>
        <Pills items={["Perfil", "Expedientes", "Adjuntos", "Agenda", "Tareas/Plazos", "Económico", "Notas", "Historial"]} />
        <Bullets
          items={[
            <><strong>Perfil:</strong> datos de identificación, dirección y contacto, editables directamente sobre la ficha.</>,
            <><strong>Expedientes:</strong> todos los expedientes vinculados a este cliente.</>,
            <>
              <strong>Adjuntos:</strong> el gestor documental del cliente, con generación de documentos a partir de
              plantillas del despacho ya listas para rellenar: hoja de encargo profesional, contrato de prestación
              de servicios jurídicos, poder de representación apud acta, acuerdo de confidencialidad, cláusula de
              protección de datos (RGPD) y requerimiento previo o carta de reclamación.
            </>,
            <><strong>Agenda:</strong> citas y eventos relacionados con este cliente.</>,
            <>
              <strong>Tareas/Plazos:</strong> tareas asociadas, que pueden vincularse además a un expediente,
              juzgado, número de procedimiento e importe.
            </>,
            <><strong>Económico:</strong> facturas emitidas al cliente.</>,
            <><strong>Notas:</strong> anotaciones internas con fecha, editables y con historial.</>,
            <><strong>Historial:</strong> línea temporal de todos los cambios realizados sobre el registro.</>,
          ]}
        />
      </Chapter>

      {/* ── 05 Expedientes ── */}
      <Chapter n="05" title="Expedientes">
        <P>
          El módulo de Expedientes gestiona los casos del despacho, desde el alta hasta el cierre, con la
          posibilidad más singular de Vantia: crear expedientes automáticamente a partir de la documentación
          judicial recibida.
        </P>
        <SubHeading>5.1 Listado de expedientes</SubHeading>
        <P>
          Comparte la filosofía del listado de Clientes: barra de herramientas con Baja, Modificar, Enviar Correo,
          Enviar WhatsApp, Sign, Tareas, Asociar (para vincular expedientes entre sí), Adjuntos, Excel, Imprimir,
          Informes y Atajos; tres vistas (listado, detalle, multiselección); y una tabla configurable por columnas:
          año, número de expediente, referencia propia, descripción, tipo, cliente, contrario, procurador, juzgado,
          tipo de procedimiento, número de autos, NIG y estado, entre otras.
        </P>
        <SubHeading>5.2 Dar de alta un expediente</SubHeading>
        <p className="!mt-6 text-sm font-bold text-slate-800">A. Alta manual</p>
        <P>
          Se abre un formulario completo con el tipo de expediente (judicial, extrajudicial, monitorio, obligación
          de hacer, prejudicial, diligencias previas, penal, laboral, contencioso-administrativo u otro), la etapa
          del procedimiento, el juzgado, las cuantías, las partes intervinientes y notas.
        </P>
        <p className="!mt-6 text-sm font-bold text-slate-800">B. Importación masiva por CSV</p>
        <P>
          Pensada para migrar un volumen de expedientes desde otro sistema o desde una hoja de cálculo, en tres
          pasos guiados:
        </P>
        <Steps
          items={[
            <><strong>Subir archivo:</strong> seleccione el CSV con sus expedientes.</>,
            <><strong>Configurar columnas:</strong> mapee cada columna del archivo con el campo correspondiente en Vantia.</>,
            <>
              <strong>Revisar e importar:</strong> compruebe una vista previa antes de confirmar. El sistema
              conserva un historial de importaciones con el detalle de cualquier error encontrado.
            </>,
          ]}
        />
        <p className="!mt-6 text-sm font-bold text-slate-800">C. Importación desde documentos, con inteligencia artificial</p>
        <P>
          Esta es la vía más avanzada: en lugar de introducir los datos a mano, se le entrega el trabajo ya hecho a
          partir de los propios documentos judiciales.
        </P>
        <Steps
          items={[
            <>Prepare un archivo ZIP con los documentos judiciales del caso (PDF o imágenes escaneadas).</>,
            <>Vaya a Nuevo Expediente → Desde documentos y suba el ZIP.</>,
            <>Siga el progreso en pantalla: «Subiendo ZIP…» y después «Procesando documentos…».</>,
            <>
              El sistema analiza cada documento con inteligencia artificial y crea un expediente por documento,
              completando automáticamente tipo de procedimiento, descripción, demandantes y demandados, abogados y
              procuradores de cada parte, juzgado, número de autos, NIG, fecha de inicio, cuantía y observaciones.
            </>,
            <>
              Opcionalmente, indique un cliente y un procurador por defecto para que se asignen automáticamente a
              todos los expedientes generados en esa importación.
            </>,
            <>Revise el resultado antes de darlo por definitivo, como con cualquier proceso automático.</>,
          ]}
        />
        <Callout tone="pink" label="Con inteligencia artificial">
          El sistema combina OCR con modelos de IA en texto y en visión, con reintentos automáticos si un documento
          es difícil de leer. Presta especial atención a la fecha de notificación, que suele ser la más importante
          para no perder un plazo: la busca aunque no esté explícitamente rotulada, a partir de sellos, fechas
          manuscritas o menciones como «Notificado», «Emplazado» o «Recibido el…».
        </Callout>
        <SubHeading>5.3 Ficha del expediente</SubHeading>
        <Pills
          items={[
            "Datos", "Propio (clientes)", "Contrarios", "Adjuntos", "Agenda", "Actuaciones", "Tareas/Plazos",
            "Económico", "Notas", "Correo", "Conversaciones", "Historial", "Cronología",
          ]}
        />
        <P>Dos pestañas merecen especial atención:</P>
        <Bullets
          items={[
            <>
              <strong>Cronología:</strong> línea de tiempo de las notificaciones judiciales del expediente (cédulas
              de emplazamiento, providencias, autos, sentencias, diligencias de ordenación, decretos, citaciones,
              requerimientos, exhortos…), cada una con su fecha de recepción, fecha límite y estado, y filtrable por
              estado.
            </>,
            <>
              <strong>Historial del expediente:</strong> registro categorizado de todo lo ocurrido: altas, cierres,
              reaperturas, cambios, notas, tareas, actuaciones, archivos, facturas, presupuestos, correos y eventos
              de agenda vinculados.
            </>,
          ]}
        />
        <Callout tone="amber" label="Importante">
          Cuando un expediente se cierra, quedan bloqueadas la edición de notificaciones, los adjuntos y las tareas
          asociadas. Antes de cerrar un expediente, compruebe que no queda ningún plazo ni documento pendiente.
        </Callout>
      </Chapter>

      {/* ── 06 Agenda ── */}
      <Chapter n="06" title="Agenda">
        <P>
          El calendario del despacho, con vista de mes, semana o día, pensado para no perder de vista vistas orales,
          reuniones y plazos.
        </P>
        <Bullets
          items={[
            <>Cambie entre las vistas de mes, semana y día, y reprograme un evento arrastrándolo directamente sobre el calendario.</>,
            <>Cree un evento indicando título, fecha y hora de inicio y fin (o «todo el día»), lugar y notas.</>,
            <>
              Elija el tipo de evento: Cita, Vista oral, Reunión, Plazo, Llamada, Videollamada u Otro; cada tipo
              tiene un color distintivo que puede personalizar con una paleta de 15 colores.
            </>,
            <>
              En la pestaña Organización del evento, vincúlelo a un expediente existente y a un usuario del
              despacho — muy útil para eventos ligados a un plazo procesal o a la reunión de un caso concreto.
            </>,
            <>Cada evento tiene un estado: pendiente, completado o cancelado.</>,
          ]}
        />
      </Chapter>

      {/* ── 07 Tareas y plazos ── */}
      <Chapter n="07" title="Tareas y plazos">
        <P>
          El módulo de Tareas permite trabajar con listas, tablero o diagrama de tiempos, según lo que mejor se
          adapte a cada equipo.
        </P>
        <Bullets
          items={[
            <><strong>Lista:</strong> vista tradicional, con filtros por estado, prioridad y búsqueda de texto, y ordenación por plazo, título o prioridad.</>,
            <><strong>Kanban:</strong> columnas de Pendientes, Urgentes y Completadas; arrastre una tarea de columna para cambiar su estado.</>,
            <><strong>Gantt:</strong> línea temporal de todas las tareas; arrastre la barra de una tarea para mover su plazo.</>,
          ]}
        />
        <P>
          Al crear una tarea indique título, descripción o instrucciones, prioridad (alta, media o baja), tipo,
          plazo y aviso, y —si corresponde— vincúlela a un expediente, juzgado, número de procedimiento e importe.
          Puede marcar tareas como completadas de una en una o en lote.
        </P>
      </Chapter>

      {/* ── 08 Facturación ── */}
      <Chapter n="08" title="Facturación">
        <P>El módulo económico del despacho, con conexión directa a Quipu para no llevar la contabilidad por duplicado.</P>
        <Pills items={["Dashboard", "Facturas", "Gastos", "Presupuestos", "Contactos", "Cuentas bancarias", "Cobros", "Configuración"]} />
        <SubHeading>8.1 Conexión con Quipu</SubHeading>
        <Steps
          items={[
            <>
              Vaya a Facturación → Configuración e introduzca las credenciales de conexión (<code>app_id</code> y{" "}
              <code>app_secret</code>) de su cuenta de Quipu.
            </>,
            <>
              Una vez conectado, un indicador de estado le confirma que la sincronización está activa; desde ahí
              puede reconectar o desconectar la cuenta cuando lo necesite.
            </>,
            <>Los contactos, cuentas bancarias, movimientos y cobros se sincronizan automáticamente.</>,
          ]}
        />
        <P>
          Las facturas creadas en Vantia pueden enviarse a Quipu, y puede abrir directamente el PDF que Quipu genera
          para cada factura.
        </P>
        <SubHeading>8.2 Dar de alta una factura, gasto o presupuesto</SubHeading>
        <P>
          Indique el concepto, el importe base, el porcentaje de IVA y el porcentaje de IRPF: Vantia calcula los
          totales automáticamente. Puede añadir observaciones que aparecerán impresas en la factura.
        </P>
        <SubHeading>8.3 Panel económico</SubHeading>
        <P>
          El dashboard de Facturación resume ingresos, gastos, total, IVA e IRPF a liquidar, con un selector de año
          y de periodo (trimestre o mes concreto) para consultar cualquier momento del ejercicio.
        </P>
      </Chapter>

      {/* ── 09 Documental ── */}
      <Chapter n="09" title="Documental">
        <P>Un buscador jurídico integrado, con tres fuentes distintas en la misma pantalla.</P>
        <SubHeading>9.1 BOE</SubHeading>
        <P>
          Busque por identificador oficial (por ejemplo <code>BOE-A-2020-8099</code>) o por texto libre, con filtros
          avanzados de título, texto, rango normativo, departamento, materia y años. Cada resultado abre una ficha
          con el rango, la fecha, el estado de consolidación y las materias de la norma, y su estructura por
          bloques y artículos, consultables en un modal con el texto íntegro y enlaces al BOE oficial y al PDF.
        </P>
        <SubHeading>9.2 CENDOJ</SubHeading>
        <P>
          Busque jurisprudencia por texto libre y filtros avanzados de órgano judicial, tipo de resolución, ponente
          y año. Los resultados muestran ROJ, ECLI, órgano, ponente y resumen, con enlace directo al portal oficial
          del CGPJ. Cuando no hay una búsqueda activa, se muestran resoluciones destacadas.
        </P>
        <SubHeading>9.3 LexNET</SubHeading>
        <P>
          Panel informativo del estado de la integración con LexNET, el sistema de comunicaciones judiciales
          electrónicas: indica si está «Preparado» o «Pendiente de configuración» (esta última requiere el
          certificado digital del despacho), con enlace al portal oficial.
        </P>
      </Chapter>

      {/* ── 10 Correo ── */}
      <Chapter n="10" title="Correo">
        <P>
          Un cliente de correo de tres paneles, al estilo de las bandejas de entrada más habituales, integrado en el
          propio ERP.
        </P>
        <Bullets
          items={[
            <><strong>Conexión de cuentas:</strong> Gmail/Google mediante OAuth («conexión segura, sin contraseñas») o cualquier cuenta IMAP/POP3 genérica.</>,
            <><strong>Multi-cuenta:</strong> conecte varias cuentas (Gmail e IMAP a la vez) y cambie entre ellas.</>,
            <>
              <strong>Carpetas:</strong> las carpetas de sistema habituales (Bandeja de entrada, Enviados,
              Borradores, Papelera, Destacados) y carpetas personalizadas que puede crear tanto en Vantia como en el
              propio servidor de correo.
            </>,
            <><strong>Acciones sobre mensajes:</strong> redactar, responder, responder a todos, reenviar, adjuntar archivos, marcar como leído o no leído y mover a otra carpeta.</>,
          ]}
        />
        <P>
          Recuerde que también puede enviar correos directamente desde la ficha de un cliente o de un expediente,
          quedando vinculados a ese registro.
        </P>
      </Chapter>

      {/* ── 11 WhatsApp ── */}
      <Chapter n="11" title="WhatsApp">
        <P>Integración con WhatsApp Cloud API para atender a los clientes por el canal que ya usan a diario.</P>
        <SubHeading>11.1 Conectar el canal</SubHeading>
        <P>
          A diferencia de otras aplicaciones de mensajería, la conexión no se hace escaneando un código QR, sino
          configurando un canal de WhatsApp Business: token de acceso, identificador del número de teléfono y
          webhook. La pantalla de conexión muestra el estado de cada uno de estos tres elementos.
        </P>
        <SubHeading>11.2 Uso diario</SubHeading>
        <Bullets
          items={[
            <>
              Una vez conectado, el panel de conversaciones muestra, a la izquierda, la lista de clientes con foto,
              último mensaje y fecha; cada conversación se vincula automáticamente al expediente del cliente si
              existe un número interno asociado.
            </>,
            <>
              La ventana de chat muestra los mensajes entrantes y salientes en burbujas, con respuestas rápidas
              predefinidas y un campo de composición libre.
            </>,
            <>
              Desde el listado de Clientes o de Expedientes puede iniciar una conversación nueva, enviar con
              plantilla, programar un envío o abrir directamente una conversación existente.
            </>,
          ]}
        />
      </Chapter>

      {/* ── 12 Chat interno ── */}
      <Chapter n="12" title="Chat interno">
        <P>
          Un espacio de mensajería de equipo, con canales públicos, privados, mensajes directos y canales vinculados
          a un expediente concreto.
        </P>
        <Steps
          items={[
            <>Pulse crear canal y siga el asistente de dos pasos: nombre, privacidad y descripción del canal.</>,
            <>Invite a los miembros que deban participar.</>,
            <>Escriba con texto enriquecido (negrita, cursiva, código, enlaces), mencione a compañeros con @ y reaccione a los mensajes con emoji o GIFs.</>,
          ]}
        />
        <P>
          Puede fijar mensajes importantes y marcar otros como favoritos —cada uno con su propio panel para
          encontrarlos rápido—, gestionar los miembros de un canal en cualquier momento, y salir de un canal cuando
          ya no lo necesite.
        </P>
        <Callout tone="green" label="Nota">
          Un canal vinculado a un expediente es una forma cómoda de que todo el equipo que trabaja en un caso tenga
          una conversación aparte, sin mezclarla con el chat general del despacho.
        </Callout>
      </Chapter>

      {/* ── 13 VantIA ── */}
      <Chapter n="13" title="VantIA — el asistente de inteligencia artificial">
        <P>
          VantIA es el asistente de IA que acompaña toda la aplicación: aparece como un widget flotante en cualquier
          pantalla y también como un módulo de página completa, Chat IA, con historial de conversaciones.
        </P>
        <SubHeading>13.1 Qué puede pedirle</SubHeading>
        <P>
          VantIA responde siempre en español y combina conocimiento jurídico (derecho español e internacional,
          jurisprudencia, doctrina) con la capacidad de redactar directamente contratos, escritos, demandas, correos
          y cartas. Algunos ejemplos de lo que puede pedirle, tal y como sugiere la propia aplicación al abrir una
          conversación nueva:
        </P>
        <Bullets
          items={[
            "«Resume el expediente más reciente del despacho.»",
            "«Redacta un contrato de arrendamiento de vivienda.»",
            "«Muéstrame las estadísticas actuales del despacho.»",
            "«Explícame paso a paso el proceso monitorio.»",
            "«Ayúdame a redactar un escrito de demanda ordinaria.»",
            "«Busca jurisprudencia del TS sobre cláusulas abusivas.»",
          ]}
        />
        <SubHeading>13.2 Un asistente que conoce los datos reales del despacho</SubHeading>
        <Callout tone="pink" label="Con inteligencia artificial">
          A diferencia de un chat genérico, VantIA puede consultar en tiempo real la información del despacho:
          estadísticas generales, buscar y listar clientes, ver los expedientes de un cliente, listar expedientes,
          tareas del usuario (incluidas las vencidas), facturas, gastos y presupuestos, próximos eventos de agenda y
          notas internas. No inventa datos: siempre consulta la base real antes de responder.
        </Callout>
        <P>
          Si está viendo la ficha de un cliente o de un expediente concreto cuando abre VantIA, el asistente ya
          conoce esos datos y no necesita que se los repita.
        </P>
        <SubHeading>13.3 Especialidad según el módulo</SubHeading>
        <P>
          El widget flotante cambia su mensaje de bienvenida y su enfoque según dónde se encuentre: especialista en
          Clientes, en Expedientes, en Agenda, asistente de Correo, de WhatsApp, de Documental, de Facturación, etc.
          El historial de conversación se guarda por módulo, de modo que puede retomar cada conversación donde la
          dejó.
        </P>
        <SubHeading>13.4 Chat IA (página completa)</SubHeading>
        <P>
          El módulo Chat IA ofrece una barra lateral con las conversaciones guardadas, agrupadas por fecha (hoy,
          ayer, anteriores). Puede iniciar una conversación nueva, eliminarla o dejar que se renombre
          automáticamente a partir del primer mensaje. Las respuestas admiten formato enriquecido (títulos, listas,
          citas, bloques de código) y ofrecen acciones de copiar, valorar con «me gusta» o «no me gusta», y
          regenerar la respuesta o reintentar si algo falla.
        </P>
        <Callout tone="amber" label="Importante">
          VantIA lo indica de forma permanente en su interfaz: «La IA puede cometer errores. Verifica la
          información.» Trate cualquier redacción o dato generado por el asistente como un primer borrador que debe
          revisar antes de utilizarlo formalmente.
        </Callout>
      </Chapter>

      {/* ── 14 Configuración ── */}
      <Chapter n="14" title="Configuración">
        <P>El módulo de Configuración es, por ahora, deliberadamente reducido.</P>
        <Bullets
          items={[
            <>
              <strong>Paleta de colores:</strong> elija entre dos temas visuales, «Rojo y Negro» (corporativo) o
              «Azul y Blanco», con una vista previa en miniatura antes de aplicarlo. El cambio se aplica al instante
              en toda la aplicación.
            </>,
          ]}
        />
        <P>
          Las secciones de Notificaciones, Empresa (datos del despacho y logotipo) y Seguridad (contraseñas,
          sesiones y accesos) aparecen anunciadas como «Próximamente»: todavía no están activas en esta versión.
        </P>
      </Chapter>

      {/* ── 15 Trazabilidad ── */}
      <Chapter n="15" title="Trazabilidad">
        <P>El panel de auditoría del despacho: quién ha hecho qué, cuándo y desde dónde.</P>
        <P>
          La pantalla se divide en dos: a la izquierda, la lista de usuarios del despacho, con el número total de
          acciones registradas, sus inicios y cierres de sesión, la última IP utilizada y un indicador de «Activo
          ahora»; a la derecha, la línea de tiempo detallada del usuario seleccionado.
        </P>
        <P>
          Cada evento de la línea de tiempo indica su tipo —inicio o cierre de sesión, error de acceso, creación,
          edición o borrado de un cliente o expediente, exportación, subida o descarga de un archivo, consulta…—,
          junto con la IP, el navegador y el sistema operativo detectados, y un enlace directo a la entidad
          afectada. Puede filtrar por tipo de evento y por módulo, buscar por usuario o IP, y cargar registros
          anteriores de forma incremental.
        </P>
        <Callout tone="green" label="Para qué sirve">
          Además de la seguridad, Trazabilidad es útil para reconstruir qué ocurrió con un expediente o un cliente
          concreto: quién lo modificó por última vez, quién exportó un listado o quién descargó un documento.
        </Callout>
      </Chapter>

      {/* ── 16 Preguntas frecuentes ── */}
      <Chapter n="16" title="Preguntas frecuentes">
        {[
          {
            q: "¿Puedo deshacer una eliminación por error?",
            a: "Sí, en varios módulos (por ejemplo, tareas, notas o enlaces de alta de cliente) al eliminar un registro aparece una notificación temporal con la opción de deshacer la acción.",
          },
          {
            q: "¿Qué diferencia hay entre el widget VantIA y el módulo Chat IA?",
            a: "Son el mismo asistente en dos formatos: el widget flotante está pensado para consultas rápidas sin salir de la pantalla en la que se encuentra, mientras que Chat IA es una página completa con historial organizado, pensada para conversaciones más largas o para redactar documentos extensos.",
          },
          {
            q: "Si cierro un expediente por error, ¿puedo reabrirlo?",
            a: "El historial del expediente registra tanto los cierres como las reaperturas, lo que indica que la reapertura es una operación contemplada en el sistema; consulte con la persona responsable de administración del despacho para realizarla.",
          },
          {
            q: "¿La importación de expedientes por IA sustituye la revisión humana?",
            a: "No. Está pensada para ahorrar la transcripción manual de datos que ya están en los documentos, pero el resultado debe revisarse antes de darlo por bueno, igual que con la lectura de DNI: la IA propone, usted confirma.",
          },
          {
            q: "¿Puedo tener varias cuentas de correo conectadas a la vez?",
            a: "Sí, el módulo de Correo admite varias cuentas simultáneas, tanto Gmail como IMAP/POP3, con un selector para cambiar entre ellas.",
          },
          {
            q: "¿Qué pasa si mi despacho todavía no tiene certificado digital?",
            a: "La integración con LexNET, dentro de Documental, mostrará el estado «Pendiente de configuración» hasta que se instale el certificado digital del despacho; el resto de funciones de Vantia no dependen de él.",
          },
        ].map((item, i) => (
          <div key={i} className={i > 0 ? "border-t border-slate-100 pt-4" : ""}>
            <p className="font-bold text-slate-800">{item.q}</p>
            <p className="mt-1">{item.a}</p>
          </div>
        ))}
      </Chapter>

      {/* ── 17 Glosario ── */}
      <Chapter n="17" title="Glosario">
        <InfoTable
          headers={["Término", "Significado en Vantia"]}
          rows={[
            ["VantIA", "Asistente de inteligencia artificial integrado en toda la aplicación."],
            ["Atajo", "Acceso rápido personalizado que combina una acción, una plantilla y una carpeta de archivo."],
            ["OCR", "Reconocimiento óptico de caracteres; en Vantia se usa para leer documentos de identidad y documentos judiciales escaneados."],
            ["MRZ", "Banda de lectura mecánica de un documento de identidad, usada para extraer sus datos con más precisión."],
            ["Cronología", "Línea de tiempo de notificaciones judiciales dentro de un expediente."],
            ["Trazabilidad", "Registro de auditoría de toda la actividad de los usuarios en el sistema."],
            ["Quipu", "Software de contabilidad externo con el que se sincroniza el módulo de Facturación."],
            ["LexNET", "Sistema oficial de comunicaciones judiciales electrónicas."],
            ["BOE / CENDOJ", "Fuentes oficiales de normativa (BOE) y jurisprudencia (CENDOJ) consultables desde Documental."],
            ["NIG", "Número de Identificación General de un procedimiento judicial."],
          ]}
        />
        <p className="!mt-8 border-t border-slate-100 pt-4 text-xs italic text-slate-400">
          Manual de usuario de Vantia Legis — documento de referencia para el equipo del despacho. Los nombres de
          botones y pantallas pueden variar ligeramente a medida que la aplicación evoluciona.
        </p>
      </Chapter>
    </div>
  );
}
