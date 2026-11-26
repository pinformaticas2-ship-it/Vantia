// ── Ayuda de las fórmulas de variables (26/11/2026) ─────────────────────────
// Lo que enseña el editor de fórmulas: cada función con su nombre en
// castellano y en inglés (las dos se pueden escribir), qué hace y un ejemplo.
// El motor está en el backend: services/plantillasFormulas.ts (un test
// comprueba que esta lista y la del motor tienen las mismas funciones).
import { idioma, t } from './i18n';

export type CategoriaFuncion = 'Texto' | 'Condiciones' | 'Género' | 'Números e importes' | 'Fechas';

export interface FuncionFormula {
  nombre: string;
  en: string;
  cat: CategoriaFuncion;
  /** Los datos que lleva, en orden ("texto; n"). */
  args: string;
  desc: string;
  ejemplo: string;
  resultado: string;
}

export const CATEGORIAS: CategoriaFuncion[] = ['Texto', 'Condiciones', 'Género', 'Números e importes', 'Fechas'];

export const FUNCIONES: FuncionFormula[] = [
  // Texto
  { nombre: 'MAYUSCULAS', en: 'UPPER', cat: 'Texto', args: 'texto', desc: 'Todo en mayúsculas.', ejemplo: 'MAYUSCULAS(Cliente_Principal_Nombre)', resultado: 'ANA LÓPEZ' },
  { nombre: 'MINUSCULAS', en: 'LOWER', cat: 'Texto', args: 'texto', desc: 'Todo en minúsculas.', ejemplo: 'MINUSCULAS("HOLA")', resultado: 'hola' },
  { nombre: 'NOMPROPIO', en: 'PROPER', cat: 'Texto', args: 'texto', desc: 'Primera letra de cada palabra en mayúscula (deja «de», «la», «y»… en minúscula).', ejemplo: 'NOMPROPIO("ANA DE LA FUENTE")', resultado: 'Ana de la Fuente' },
  { nombre: 'PRIMERA_MAYUSCULA', en: 'CAPITALIZE', cat: 'Texto', args: 'texto', desc: 'Solo la primera letra en mayúscula.', ejemplo: 'PRIMERA_MAYUSCULA(DON_DONA(Cliente_Principal_Sexo))', resultado: 'Doña' },
  { nombre: 'RECORTAR', en: 'TRIM', cat: 'Texto', args: 'texto', desc: 'Quita los espacios de sobra.', ejemplo: 'RECORTAR("  Ana   López ")', resultado: 'Ana López' },
  { nombre: 'IZQUIERDA', en: 'LEFT', cat: 'Texto', args: 'texto; n', desc: 'Los n primeros caracteres.', ejemplo: 'IZQUIERDA("12345678Z"; 8)', resultado: '12345678' },
  { nombre: 'DERECHA', en: 'RIGHT', cat: 'Texto', args: 'texto; n', desc: 'Los n últimos caracteres.', ejemplo: 'DERECHA("ES12 3456"; 4)', resultado: '3456' },
  { nombre: 'EXTRAE', en: 'MID', cat: 'Texto', args: 'texto; desde; n', desc: 'n caracteres a partir de la posición «desde» (la primera es 1).', ejemplo: 'EXTRAE("2026/0045"; 6; 4)', resultado: '0045' },
  { nombre: 'LARGO', en: 'LEN', cat: 'Texto', args: 'texto', desc: 'Cuántos caracteres tiene.', ejemplo: 'LARGO("Ana")', resultado: '3' },
  { nombre: 'REEMPLAZAR', en: 'REPLACE', cat: 'Texto', args: 'texto; buscar; poner', desc: 'Cambia un trozo por otro (todas las veces).', ejemplo: 'REEMPLAZAR("C/ Mayor"; "C/"; "Calle")', resultado: 'Calle Mayor' },
  { nombre: 'CONTIENE', en: 'CONTAINS', cat: 'Texto', args: 'texto; buscar', desc: 'Sí si el texto lleva ese trozo (sin mirar mayúsculas ni tildes).', ejemplo: 'CONTIENE(Juzgados_por_Líneas_Nombre; "social")', resultado: 'Sí' },
  { nombre: 'EMPIEZA_POR', en: 'STARTS_WITH', cat: 'Texto', args: 'texto; inicio', desc: 'Sí si el texto empieza así.', ejemplo: 'EMPIEZA_POR(«Cliente_Principal_NIF/CIF»; "B")', resultado: 'Sí' },
  { nombre: 'PALABRA', en: 'WORD', cat: 'Texto', args: 'texto; n', desc: 'La palabra número n (con -1, la última).', ejemplo: 'PALABRA("Ana López Ruiz"; 1)', resultado: 'Ana' },
  { nombre: 'UNIR', en: 'JOIN', cat: 'Texto', args: 'separador; a; b; …', desc: 'Junta varios datos con un separador y se salta los vacíos.', ejemplo: 'UNIR(", "; Cliente_Principal_Dirección; Cliente_Principal_Población)', resultado: 'C/ Mayor 1, Palma' },
  { nombre: 'LISTA', en: 'LIST', cat: 'Texto', args: 'a; b; c; …', desc: 'Una lista con comas e «y» (o «e») al final, sin los vacíos.', ejemplo: 'LISTA("Juan"; "Pedro"; "Isabel")', resultado: 'Juan, Pedro e Isabel' },
  { nombre: 'TEXTO_SI', en: 'TEXT_IF', cat: 'Texto', args: 'dato; antes; [después]', desc: 'Pone el dato con un texto delante (y detrás) solo si el dato existe.', ejemplo: 'TEXTO_SI(«Cliente_Principal_NIF/CIF»; ", con DNI ")', resultado: ', con DNI 12345678Z' },
  // Condiciones
  { nombre: 'SI', en: 'IF', cat: 'Condiciones', args: 'condición; si se cumple; [si no]', desc: 'Elige un resultado según una condición.', ejemplo: 'SI(Datos_del_Expediente_Cuantía > 6000; "ordinario"; "verbal")', resultado: 'verbal' },
  { nombre: 'SI_VACIO', en: 'IF_EMPTY', cat: 'Condiciones', args: 'dato; si está vacío', desc: 'El dato, o lo otro si el dato está vacío.', ejemplo: 'SI_VACIO(Procurador_Propio_Principal_Nombre; "sin procurador")', resultado: 'sin procurador' },
  { nombre: 'PRIMERO_NO_VACIO', en: 'COALESCE', cat: 'Condiciones', args: 'a; b; c; …', desc: 'El primero de los datos que tenga algo.', ejemplo: 'PRIMERO_NO_VACIO(Cliente_Principal_Móvil; Cliente_Principal_Teléfono_1)', resultado: '600 000 000' },
  { nombre: 'VACIO', en: 'IS_EMPTY', cat: 'Condiciones', args: 'dato@@formula', desc: 'Sí si el dato está vacío.', ejemplo: 'SI(VACIO(Cliente_Principal_Correo_Electrónico_1); "sin email"; Cliente_Principal_Correo_Electrónico_1)', resultado: 'sin email' },
  { nombre: 'Y', en: 'AND', cat: 'Condiciones', args: 'cond1; cond2; …', desc: 'Sí si se cumplen todas.', ejemplo: 'SI(Y(Datos_del_Expediente_Cuantía > 0; NO(VACIO(Juzgados_por_Líneas_Nombre))); "judicial")', resultado: 'judicial' },
  { nombre: 'O', en: 'OR', cat: 'Condiciones', args: 'cond1; cond2; …', desc: 'Sí si se cumple alguna.', ejemplo: 'SI(O(Cliente_Principal_Tipo_Cliente = "Empresa"; EMPIEZA_POR(«Cliente_Principal_NIF/CIF»; "B")); "la mercantil"; "el cliente")', resultado: 'la mercantil' },
  { nombre: 'NO', en: 'NOT', cat: 'Condiciones', args: 'condición', desc: 'Lo contrario.', ejemplo: 'NO(VACIO(«Cliente_Principal_NIF/CIF»))', resultado: 'Sí' },
  { nombre: 'SEGUN', en: 'SWITCH', cat: 'Condiciones', args: 'dato; caso1; resultado1; …; [si no]', desc: 'Un resultado distinto para cada valor del dato.', ejemplo: 'SEGUN(Datos_del_Expediente_Tipo_de_Expediente; "Laboral"; "Juzgado de lo Social"; "Penal"; "Juzgado de Instrucción"; "Juzgado")', resultado: 'Juzgado de lo Social' },
  // Género
  { nombre: 'DON_DONA', en: 'HONORIFIC', cat: 'Género', args: 'sexo', desc: '«don» o «doña» según el sexo de la ficha (o «don/doña» si no consta).', ejemplo: 'DON_DONA(Cliente_Principal_Sexo)', resultado: 'doña' },
  { nombre: 'GENERO', en: 'GENDER', cat: 'Género', args: 'sexo; masculino; femenino; [si no consta]', desc: 'Concuerda cualquier palabra con el sexo de la ficha.', ejemplo: 'GENERO(Contrario_Principal_Sexo; "el demandado"; "la demandada")', resultado: 'la demandada' },
  // Números e importes
  { nombre: 'NUMERO', en: 'NUMBER', cat: 'Números e importes', args: 'texto', desc: 'Convierte «1.234,50 €» en un número para hacer cuentas.', ejemplo: 'NUMERO("1.234,50 €") * 2', resultado: '2469' },
  { nombre: 'REDONDEAR', en: 'ROUND', cat: 'Números e importes', args: 'número; [decimales]', desc: 'Redondea (sin decimales si no se dice).', ejemplo: 'REDONDEAR(10 / 3; 2)', resultado: '3,33' },
  { nombre: 'IMPORTE', en: 'CURRENCY', cat: 'Números e importes', args: 'número', desc: 'Con puntos de miles, dos decimales y €.', ejemplo: 'IMPORTE(Datos_del_Expediente_Cuantía)', resultado: '1.234,50 €' },
  { nombre: 'FORMATO_NUMERO', en: 'FORMAT_NUMBER', cat: 'Números e importes', args: 'número; [decimales]', desc: 'Con puntos de miles y los decimales que digas (2 si no).', ejemplo: 'FORMATO_NUMERO(1234.5; 1)', resultado: '1.234,5' },
  { nombre: 'LETRAS', en: 'IN_WORDS', cat: 'Números e importes', args: 'número', desc: 'El número escrito en letras.', ejemplo: 'LETRAS(21)', resultado: 'veintiuno' },
  { nombre: 'EUROS_LETRAS', en: 'EUROS_IN_WORDS', cat: 'Números e importes', args: 'importe', desc: 'El importe en letras, con euros y céntimos.', ejemplo: 'EUROS_LETRAS(1234.5)', resultado: 'mil doscientos treinta y cuatro euros con cincuenta céntimos' },
  { nombre: 'PORCENTAJE', en: 'PERCENT', cat: 'Números e importes', args: 'importe; %', desc: 'Ese tanto por ciento del importe.', ejemplo: 'IMPORTE(PORCENTAJE(Datos_del_Expediente_Cuantía; 21))', resultado: '259,25 €' },
  { nombre: 'SUMA', en: 'SUM', cat: 'Números e importes', args: 'a; b; …', desc: 'La suma.', ejemplo: 'IMPORTE(SUMA(1000; 210))', resultado: '1.210,00 €' },
  { nombre: 'MAXIMO', en: 'MAX', cat: 'Números e importes', args: 'a; b; …', desc: 'El mayor.', ejemplo: 'MAXIMO(3; 7)', resultado: '7' },
  { nombre: 'MINIMO', en: 'MIN', cat: 'Números e importes', args: 'a; b; …', desc: 'El menor.', ejemplo: 'MINIMO(3; 7)', resultado: '3' },
  // Fechas
  { nombre: 'HOY', en: 'TODAY', cat: 'Fechas', args: '', desc: 'La fecha de hoy (dd/mm/aaaa).', ejemplo: 'HOY()', resultado: '26/11/2026' },
  { nombre: 'FECHA_CORTA', en: 'SHORT_DATE', cat: 'Fechas', args: 'fecha', desc: 'La fecha como dd/mm/aaaa.', ejemplo: 'FECHA_CORTA("5 de marzo de 2026")', resultado: '05/03/2026' },
  { nombre: 'FECHA_LARGA', en: 'LONG_DATE', cat: 'Fechas', args: 'fecha', desc: 'La fecha con el mes en letra.', ejemplo: 'FECHA_LARGA(HOY())', resultado: '26 de noviembre de 2026' },
  { nombre: 'FECHA_LETRAS', en: 'DATE_IN_WORDS', cat: 'Fechas', args: 'fecha', desc: 'La fecha entera en letras (como en las escrituras).', ejemplo: 'FECHA_LETRAS("05/03/2026")', resultado: 'cinco de marzo de dos mil veintiséis' },
  { nombre: 'DIA', en: 'DAY', cat: 'Fechas', args: 'fecha', desc: 'El día del mes.', ejemplo: 'DIA("05/03/2026")', resultado: '5' },
  { nombre: 'MES', en: 'MONTH', cat: 'Fechas', args: 'fecha', desc: 'El mes en número.', ejemplo: 'MES("05/03/2026")', resultado: '3' },
  { nombre: 'NOMBRE_MES', en: 'MONTH_NAME', cat: 'Fechas', args: 'fecha', desc: 'El mes en letra.', ejemplo: 'NOMBRE_MES("05/03/2026")', resultado: 'marzo' },
  { nombre: 'AÑO', en: 'YEAR', cat: 'Fechas', args: 'fecha', desc: 'El año.', ejemplo: 'AÑO(HOY())', resultado: '2026' },
  { nombre: 'DIA_SEMANA', en: 'WEEKDAY', cat: 'Fechas', args: 'fecha', desc: 'El día de la semana.', ejemplo: 'DIA_SEMANA("05/03/2026")', resultado: 'jueves' },
  { nombre: 'SUMAR_DIAS', en: 'ADD_DAYS', cat: 'Fechas', args: 'fecha; días', desc: 'La fecha más (o menos) esos días naturales.', ejemplo: 'SUMAR_DIAS(HOY(); 30)', resultado: '26/12/2026' },
  { nombre: 'SUMAR_DIAS_HABILES', en: 'ADD_WORKDAYS', cat: 'Fechas', args: 'fecha; días', desc: 'Suma días sin contar sábados ni domingos. Ojo: no descuenta festivos ni agosto.', ejemplo: 'SUMAR_DIAS_HABILES("05/03/2026"; 20)', resultado: '02/04/2026' },
  { nombre: 'SUMAR_MESES', en: 'ADD_MONTHS', cat: 'Fechas', args: 'fecha; meses', desc: 'La fecha más esos meses (31/01 + 1 mes = 28/02).', ejemplo: 'SUMAR_MESES("31/01/2026"; 1)', resultado: '28/02/2026' },
  { nombre: 'SUMAR_AÑOS', en: 'ADD_YEARS', cat: 'Fechas', args: 'fecha; años', desc: 'La fecha más esos años.', ejemplo: 'SUMAR_AÑOS("05/03/2026"; 5)', resultado: '05/03/2031' },
  { nombre: 'DIAS_ENTRE', en: 'DAYS_BETWEEN', cat: 'Fechas', args: 'desde; hasta', desc: 'Los días que hay de una fecha a otra.', ejemplo: 'DIAS_ENTRE("01/03/2026"; "05/03/2026")', resultado: '4' },
  { nombre: 'EDAD', en: 'AGE', cat: 'Fechas', args: 'fecha de nacimiento', desc: 'Los años cumplidos hoy.', ejemplo: 'EDAD(Cliente_Principal_Fecha_Nacimiento)', resultado: '42' },
];

/** Recetas listas para usar: lo que más se repite en los escritos. */
export const RECETAS: { titulo: string; formula: string }[] = [
  { titulo: 'Cliente con tratamiento y DNI', formula: '{DON_DONA(Cliente_Principal_Sexo)} {NOMPROPIO(Cliente_Principal_Nombre)}{TEXTO_SI(«Cliente_Principal_NIF/CIF»; ", con DNI ")}' },
  { titulo: 'Dirección completa del cliente', formula: '{UNIR(", "; Cliente_Principal_Dirección; UNIR(" "; Cliente_Principal_Código_Postal; Cliente_Principal_Población); Cliente_Principal_Provincia)}' },
  { titulo: 'Cuantía en letras y en número', formula: '{EUROS_LETRAS(Datos_del_Expediente_Cuantía)} ({IMPORTE(Datos_del_Expediente_Cuantía)})' },
  { titulo: 'Tipo de juicio según la cuantía', formula: '{SI(NUMERO(Datos_del_Expediente_Cuantía) > 6000; "juicio ordinario"; "juicio verbal")}' },
  { titulo: 'Demandado o demandada', formula: '{GENERO(Contrario_Principal_Sexo; "el demandado"; "la demandada"; "la parte demandada")}' },
  { titulo: 'Lugar y fecha de firma', formula: 'En {Empresa_Población}, a {FECHA_LARGA(HOY())}' },
  { titulo: 'Fecha de hoy en letras', formula: '{FECHA_LETRAS(HOY())}' },
  { titulo: 'Procurador o «sin procurador»', formula: '{SI_VACIO(Procurador_Propio_Principal_Nombre; "sin procurador designado")}' },
  { titulo: 'Plazo: hoy + 20 días hábiles', formula: '{SUMAR_DIAS_HABILES(HOY(); 20)}' },
];

/** Con la app en inglés, las fórmulas de ejemplo se enseñan con los nombres en inglés. */
const RE_FUNCION = new RegExp(`(?<![\\p{L}\\p{N}_])(${FUNCIONES.map((f) => f.nombre).sort((a, b) => b.length - a.length).join('|')})(?=\\s*\\()`, 'gu');
export function formulaEnIdioma(formula: string): string {
  if (idioma() !== 'en') return formula;
  return formula.replace(RE_FUNCION, (n) => FUNCIONES.find((f) => f.nombre === n)?.en || n);
}

// Los errores del servidor llegan en castellano: los que llevan datos se traducen aquí.
const ERRORES: [RegExp, string][] = [
  [/^No se entiende «(.+)»$/, 'No se entiende «{a}»'],
  [/^No existe la función (.+)$/, 'No existe la función {a}'],
  [/^Falta cerrar el paréntesis de (.+)$/, 'Falta cerrar el paréntesis de {a}'],
  [/^(.+) lleva 1 dato y tiene (\d+)$/, '{a} lleva 1 dato y tiene {b}'],
  [/^(.+) lleva (\d+) datos y tiene (\d+)$/, '{a} lleva {b} datos y tiene {c}'],
  [/^(.+) lleva entre (\d+) y (\d+) datos y tiene (\d+)$/, '{a} lleva entre {b} y {c} datos y tiene {d}'],
  [/^No se esperaba «(.+)»$/, 'No se esperaba «{a}»'],
  [/^La fórmula no puede pasar de (\d+) caracteres$/, 'La fórmula no puede pasar de {a} caracteres'],
];
export function traducirErrorFormula(msg: string): string {
  const pre = /^Valor por defecto: (.+)$/.exec(msg);
  if (pre) return t('Valor por defecto: {a}', { a: traducirErrorFormula(pre[1]) });
  for (const [re, plantilla] of ERRORES) {
    const m = re.exec(msg);
    if (m) return t(plantilla, { a: m[1], b: m[2], c: m[3], d: m[4] });
  }
  return t(msg);
}

/** Cómo se escribe una variable dentro de { }: tal cual o entre « » si lleva signos. */
export const refVariable = (nombre: string) => (/^[\p{L}\p{N}_ºª]+$/u.test(nombre) && !/^\d/.test(nombre) ? nombre : `«${nombre}»`);

/** ¿La posición del cursor está dentro de unas llaves { }? */
export function dentroDeLlaves(texto: string, pos: number): boolean {
  let dentro = false;
  for (let i = 0; i < pos && i < texto.length; i++) {
    const c = texto[i];
    if ((c === '{' || c === '}') && texto[i + 1] === c && !dentro) { i++; continue; }
    if (c === '{') dentro = true;
    else if (c === '}') dentro = false;
  }
  return dentro;
}
