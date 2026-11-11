import { esES } from "@clerk/localizations";

// La traducción española de Clerk deja sin traducir los avisos sobre la
// fuerza de la contraseña (salían en inglés al registrarse). Aquí se completan.
const zxcvbn = {
  couldBeStronger: "Tu contraseña sirve, pero podría ser más segura. Prueba a añadir más caracteres.",
  goodPassword: "Tu contraseña cumple todos los requisitos.",
  notEnough: "Tu contraseña no es lo bastante segura.",
  suggestions: {
    allUppercase: "Pon en mayúscula algunas letras, pero no todas.",
    anotherWord: "Añade más palabras poco habituales.",
    associatedYears: "Evita años relacionados contigo.",
    capitalization: "Usa mayúsculas en algo más que la primera letra.",
    dates: "Evita fechas y años relacionados contigo.",
    l33t: "Evita sustituciones previsibles, como «@» por «a».",
    longerKeyboardPattern: "Usa patrones de teclado más largos y cambia de dirección varias veces.",
    noNeed: "Puedes crear contraseñas seguras sin símbolos, números ni mayúsculas.",
    pwned: "Si usas esta contraseña en otro sitio, deberías cambiarla.",
    recentYears: "Evita los años recientes.",
    repeated: "Evita palabras y caracteres repetidos.",
    reverseWords: "Evita palabras comunes escritas al revés.",
    sequences: "Evita secuencias de caracteres habituales.",
    useWords: "Usa varias palabras, pero evita frases hechas.",
  },
  warnings: {
    common: "Es una contraseña muy utilizada.",
    commonNames: "Los nombres y apellidos comunes son fáciles de adivinar.",
    dates: "Las fechas son fáciles de adivinar.",
    extendedRepeat: "Los patrones repetidos como «abcabcabc» son fáciles de adivinar.",
    keyPattern: "Los patrones cortos de teclado son fáciles de adivinar.",
    namesByThemselves: "Un nombre o apellido solo es fácil de adivinar.",
    pwned: "Tu contraseña ha aparecido en una filtración de datos en Internet.",
    recentYears: "Los años recientes son fáciles de adivinar.",
    sequences: "Las secuencias como «abc» son fáciles de adivinar.",
    similarToCommon: "Se parece a una contraseña muy utilizada.",
    simpleRepeat: "Los caracteres repetidos como «aaa» son fáciles de adivinar.",
    straightRow: "Las filas seguidas del teclado son fáciles de adivinar.",
    topHundred: "Es una contraseña de las más utilizadas.",
    topTen: "Es una de las contraseñas más utilizadas.",
    userInputs: "No debe contener datos personales ni de la página.",
    wordByItself: "Una sola palabra es fácil de adivinar.",
  },
};

export const clerkEs = {
  ...esES,
  unstable__errors: { ...(esES as any).unstable__errors, zxcvbn },
} as typeof esES;
