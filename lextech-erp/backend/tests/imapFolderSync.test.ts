// Ejecutar con: npm test  (desde lextech-erp/backend)
//
// Regresiones del 05/10/2026 que fija esta prueba:
//  - imapflow devuelve `false` (sin error) cuando el servidor rechaza un
//    SEARCH y Recibidos dejó de actualizarse en silencio -> la sincronización
//    ya no depende de SEARCH: pide la lista completa de UID (FETCH 1:* UID).
//  - Solo se cargaban los últimos 120 días (carpetas de miles de mensajes con
//    50 en Vantia) -> ahora se completa todo el historial por tandas, de más
//    nuevo a más antiguo.
// Regla: pase lo que pase, el último mensaje real de la carpeta siempre llega.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchFolderEnvelopes, FolderClient, FolderServerState } from '../src/utils/imap';

/** Servidor IMAP simulado con UIDs dados (en orden de posición). */
function fakeServer(uids: number[], opts: { allUidsBroken?: boolean } = {}) {
  const fetched: number[][] = [];
  const client: FolderClient = {
    selectFolder: async () => ({ exists: uids.length, unseen: 0 }),
    recentUidsBySequence: async (n: number) => uids.slice(-n),
    allUids: async () => (opts.allUidsBroken ? uids.slice(-3) : [...uids]),
    fetchEnvelopes: async (list: number[]) => {
      fetched.push([...list]);
      return list.map((uid) => ({ uid, flags: [], date: '', subject: `m${uid}`, from: '', fromName: '', to: '', messageId: '', size: 0, hasAttachments: false }));
    },
  };
  return { client, fetched };
}

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const uidsOf = (msgs: { uid: number }[]) => msgs.map((m) => m.uid).sort((a, b) => a - b);

test('Recibidos atrasado: llega el correo nuevo sin usar SEARCH', async () => {
  const { client } = fakeServer(range(1, 10));
  const msgs = await fetchFolderEnvelopes(client, 'INBOX', 50, undefined, new Set(range(1, 5)));
  assert.deepEqual(uidsOf(msgs).filter((u) => u > 5), [6, 7, 8, 9, 10]);
});

test('carpeta enorme: se completa entera por tandas, empezando por lo más nuevo', async () => {
  const server = range(1, 1000);
  const { client } = fakeServer(server);
  const known = new Set<number>();
  const tandas: number[][] = [];
  for (let i = 0; i < 20 && known.size < server.length; i++) {
    const msgs = await fetchFolderEnvelopes(client, 'Sent', 200, undefined, new Set(known));
    tandas.push(uidsOf(msgs));
    msgs.forEach((m) => known.add(m.uid));
  }
  assert.ok(tandas[0].includes(1000), 'la primera tanda trae el último mensaje');
  assert.equal(known.size, 1000, 'al final están todos los mensajes, no solo los recientes');
});

test('carpeta sin cambios: no pide la lista completa ni descarga nada nuevo', async () => {
  const { client, fetched } = fakeServer(range(1, 30));
  let state: FolderServerState | null = null;
  const msgs = await fetchFolderEnvelopes(client, 'INBOX', 50, undefined, new Set(range(1, 30)), undefined, (s) => { state = s; });
  assert.equal(state!.allUids, null, 'sin cambios no hace falta la lista completa');
  assert.equal(fetched.length, 1);
  assert.ok(msgs.every((m) => m.uid > 10), 'solo refresca los más recientes (leído/destacado)');
});

test('informa del estado del servidor para limpiar lo borrado o movido', async () => {
  const { client } = fakeServer([2, 3, 7]);
  let state: FolderServerState | null = null;
  await fetchFolderEnvelopes(client, 'INBOX', 50, undefined, new Set([1, 2, 3, 4]), undefined, (s) => { state = s; });
  assert.deepEqual(state!.allUids, [2, 3, 7]);
});

test('si el servidor devuelve una lista incoherente: se avisa y NO se ofrece para limpiar', async () => {
  const { client } = fakeServer(range(1, 10), { allUidsBroken: true });
  const warnings: string[] = [];
  let state: FolderServerState | null = null;
  const msgs = await fetchFolderEnvelopes(client, 'INBOX', 50, undefined, new Set([1, 2]), (w) => warnings.push(w), (s) => { state = s; });
  assert.equal(warnings.length, 1);
  assert.equal(state!.allUids, null, 'con una lista incompleta no se debe borrar nada');
  assert.ok(uidsOf(msgs).includes(10), 'el último mensaje llega igualmente');
});

test('carpeta vacía en el servidor', async () => {
  const { client, fetched } = fakeServer([]);
  const msgs = await fetchFolderEnvelopes(client, 'INBOX', 50, undefined, new Set());
  assert.equal(msgs.length, 0);
  assert.equal(fetched.length, 0);
});
