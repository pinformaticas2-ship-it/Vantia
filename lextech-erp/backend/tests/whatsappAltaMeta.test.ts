// Ejecutar con: npm test   (desde lextech-erp/backend)
//
// WhatsApp con alta de Meta (12/11/2026): solo se ofrece si el servidor tiene
// lo necesario, y el estado distingue «caducado» de «revisar».
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { altaMetaDisponible, clasificarErrorWhatsApp } from '../src/controllers/whatsappController';

test('el alta de Meta solo se ofrece con app, secreto y configuración', () => {
  const antes = { ...process.env };
  try {
    delete process.env.META_APP_ID; delete process.env.INSTAGRAM_APP_ID;
    process.env.META_APP_SECRET = 's'; process.env.WHATSAPP_CONFIG_ID = 'c';
    assert.equal(altaMetaDisponible(), false);
    process.env.META_APP_ID = '123';
    assert.equal(altaMetaDisponible(), true);
    delete process.env.WHATSAPP_CONFIG_ID;
    assert.equal(altaMetaDisponible(), false);
  } finally { process.env = antes; }
});

test('token caducado o retirado → «caducado»; lo demás → «revisar»', () => {
  assert.equal(clasificarErrorWhatsApp('Error validating access token: Session has expired on Tuesday'), 'caducado');
  assert.equal(clasificarErrorWhatsApp('The access token has been invalidated because the user changed their password'), 'caducado');
  assert.equal(clasificarErrorWhatsApp('Unsupported get request. Object with ID 123 does not exist'), 'revisar');
  assert.equal(clasificarErrorWhatsApp('fetch failed'), 'revisar');
});
