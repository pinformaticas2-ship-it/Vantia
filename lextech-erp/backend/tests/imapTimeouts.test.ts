// Ejecutar con: npm test  (desde lextech-erp/backend)
//
// Regresión del 05/10/2026: una cuenta IMAP cuyo servidor no respondía dejaba
// colgada la sincronización automática para SIEMPRE (connect agotaba su tiempo
// pero el logout posterior esperaba indefinidamente), y ninguna cuenta
// posterior volvía a sincronizarse. Estas pruebas fijan que conectar y cerrar
// contra servidores que no responden siempre terminan en un tiempo acotado.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { ImapClient, withTimeout } from '../src/utils/imap';

/** Servidor TCP que acepta conexiones y, opcionalmente, saluda y luego calla. */
function trapServer(greet: boolean): Promise<{ port: number; close: () => void }> {
  return new Promise((resolve) => {
    const sockets: net.Socket[] = [];
    const server = net.createServer((sock) => {
      sockets.push(sock);
      sock.on('error', () => undefined);
      if (greet) sock.write('* OK IMAP4rev1 ready\r\n'); // ...y no contesta a nada más
    });
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as net.AddressInfo;
      resolve({ port, close: () => { sockets.forEach((s) => s.destroy()); server.close(); } });
    });
  });
}

async function connectAndClose(port: number) {
  const client = new ImapClient({ host: '127.0.0.1', port, secure: false, user: 'u', password: 'p' });
  const t0 = Date.now();
  let error = '';
  try {
    await client.connect();
  } catch (e: any) {
    error = String(e?.message || e);
  } finally {
    await client.logout();
  }
  return { error, ms: Date.now() - t0 };
}

test('servidor que acepta la conexión y nunca saluda: falla en tiempo acotado, sin colgarse', async () => {
  const srv = await trapServer(false);
  try {
    const r = await withTimeout(connectAndClose(srv.port), 40_000, 'connect+logout colgado');
    assert.ok(r.error, 'debe dar error');
    assert.ok(r.ms < 25_000, `tardó ${r.ms} ms`);
  } finally { srv.close(); }
});

test('servidor que saluda y luego no responde al login: falla en tiempo acotado, sin colgarse', async () => {
  const srv = await trapServer(true);
  try {
    const r = await withTimeout(connectAndClose(srv.port), 40_000, 'connect+logout colgado');
    assert.ok(r.error, 'debe dar error');
    assert.ok(r.ms < 25_000, `tardó ${r.ms} ms`);
  } finally { srv.close(); }
});

test('withTimeout corta una operación que no termina', async () => {
  await assert.rejects(withTimeout(new Promise(() => undefined), 200, 'nunca'), /Tiempo agotado/);
});
