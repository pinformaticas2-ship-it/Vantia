// Palabras con más de un sentido: "Alta@@prioridad" se ve "Alta" en español
// y "High" en inglés. Sin contexto, "Alta"/"Baja" son el estado de un cliente
// o de un profesional del Directorio (dado de alta / de baja).
// Se registra al final: estas claves mandan sobre las generales.
import { registrarEn } from '../../lib/i18n';

registrarEn({
  "Alta": "Active",
  "Baja": "Inactive",
  "Media": "Medium",
  "Alta@@prioridad": "High",
  "Media@@prioridad": "Medium",
  "Baja@@prioridad": "Low",
  "Alta@@nuevo": "New",
  "Baja@@quitar": "Remove",
  "Baja@@cliente": "Deactivate",
  "Baja@@expediente": "Close",
  "Baja ({size})": "Close ({size})",
  "Alta@@historial": "Opened",
});
