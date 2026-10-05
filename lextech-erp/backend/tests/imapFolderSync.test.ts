// Ejecutar con: npm test  (desde lextech-erp/backend)
//
// Regresión del 05/10/2026: imapflow devuelve `false` (sin lanzar error)
// cuando el servidor rechaza un SEARCH; se trataba como "carpeta sin
// mensajes" y Recibidos dejó de actualizarse en silencio. Estas pruebas
// fijan la regla: pase lo que pase con la búsqueda, el último mensaje real de
// la carpeta siempre se descarga, y cualquier anomalía se avisa.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchFolderEnvelopes, FolderClient } from '../src/utils/imap';

/** Servidor IMAP simulado con UIDs 1..total; `search` decide qué devuelve la búsqueda. */
function fakeServer(total: number, search: () => number[] | null) {
  const fetched: number[][] = [];
  const all = Array.from({ length: total }, (_, i) => i + 1);
  const client: FolderClient = {
    selectFolder: async () => ({ exists: total, unseen: 0 }),
    searchUidsSince: async () => search(),
    recentUidsBySequence: async (n: number) => all.slice(-n),
    searchUids: async () => all,
    fetchEnvelopes: async (uids: number[]) => {
      fetched.push([...uids]);
      return uids.map((uid) => ({ uid, flags: [], date: '', subject: `m${uid}`, from: '', fromName: '', to: '', messageId: '', size: 0, hasAttachments: false }));
    },
  };
  return { client, fetched };
}

const since = new Date(Date.now() - 120 * 86400000);
const uidsOf = (msgs: { uid: number }[]) => msgs.map((m) => m.uid).sort((a, b) => a - b);

test('el servidor rechaza la búsqueda: se usa el plan B y llega el correo nuevo', async () => {
  const { client } = fakeServer(10, () => null);
  const warnings: string[] = [];
  const msgs = await fetchFolderEnvelopes(client, 'INBOX', 50, since, new Set([1, 2, 3, 4, 5]), (w) => warnings.push(w));
  assert.ok(uidsOf(msgs).includes(10), 'el último mensaje (UID 10) debe descargarse');
  assert.deepEqual(uidsOf(msgs).filter((u) => u > 5), [6, 7, 8, 9, 10]);
  assert.equal(warnings.length, 1, 'el rechazo debe avisarse, no pasar en silencio');
});

test('la búsqueda "funciona" pero viene vacía/incompleta: la comprobación de seguridad la completa', async () => {
  const { client } = fakeServer(10, () => []);
  const warnings: string[] = [];
  const msgs = await fetchFolderEnvelopes(client, 'INBOX', 50, since, new Set([1, 2, 3]), (w) => warnings.push(w));
  assert.ok(uidsOf(msgs).includes(10));
  assert.equal(warnings.length, 1);
});

test('caso normal: sin avisos y con el último mensaje incluido', async () => {
  const { client } = fakeServer(10, () => [8, 9, 10]);
  const warnings: string[] = [];
  const msgs = await fetchFolderEnvelopes(client, 'INBOX', 50, since, new Set([1, 2, 3, 4, 5, 6, 7]), (w) => warnings.push(w));
  assert.deepEqual(uidsOf(msgs), [8, 9, 10]);
  assert.equal(warnings.length, 0);
});

test('nada nuevo (el último ya está guardado): no hay falsos avisos', async () => {
  const { client, fetched } = fakeServer(10, () => []);
  const warnings: string[] = [];
  const msgs = await fetchFolderEnvelopes(client, 'INBOX', 50, since, new Set(Array.from({ length: 10 }, (_, i) => i + 1)), (w) => warnings.push(w));
  assert.equal(msgs.length, 0);
  assert.equal(fetched.length, 0);
  assert.equal(warnings.length, 0);
});

test('carpeta enorme atrasada: cada pasada trae como mucho el límite, empezando por lo más nuevo', async () => {
  const { client } = fakeServer(1000, () => Array.from({ length: 1000 }, (_, i) => i + 1));
  const msgs = await fetchFolderEnvelopes(client, 'INBOX', 20, since, new Set([1, 2, 3]));
  const got = uidsOf(msgs);
  assert.ok(got.length <= 40);
  assert.ok(got.includes(1000));
});
