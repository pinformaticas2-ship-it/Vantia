// Sonido corto de aviso dentro de la app (12/11/2026). Se genera al vuelo con
// el audio del navegador (no hay archivo que descargar). Los navegadores solo
// dejan sonar después de que la persona haya tocado la página alguna vez; si
// aún no, no suena y ya está.

let ctx: AudioContext | null = null;
let ultimo = 0;

export function sonarAviso() {
  try {
    // Ráfagas de mensajes: como mucho un sonido cada 1,5 s.
    const ahora = Date.now();
    if (ahora - ultimo < 1500) return;
    ultimo = ahora;
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    ctx = ctx || new AC();
    if (ctx.state === 'suspended') void ctx.resume();
    const t0 = ctx.currentTime;
    // Dos notas suaves (re–la), muy cortas.
    [[587.33, 0], [880, 0.09]].forEach(([frecuencia, retraso]) => {
      const osc = ctx!.createOscillator();
      const vol = ctx!.createGain();
      osc.type = 'sine';
      osc.frequency.value = frecuencia;
      vol.gain.setValueAtTime(0.0001, t0 + retraso);
      vol.gain.exponentialRampToValueAtTime(0.12, t0 + retraso + 0.015);
      vol.gain.exponentialRampToValueAtTime(0.0001, t0 + retraso + 0.22);
      osc.connect(vol).connect(ctx!.destination);
      osc.start(t0 + retraso);
      osc.stop(t0 + retraso + 0.25);
    });
  } catch { /* sin audio: nada */ }
}

/** Avisa a quien escuche (el chat) de que han cambiado las preferencias de avisos. */
export const AVISOS_CAMBIADOS = 'vantia:avisos-cambiados';
