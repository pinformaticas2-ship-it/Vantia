import * as crypto from 'crypto';

const ENC_KEY = (process.env.EMAIL_ENC_KEY || 'lextech-default-enc-key-32-chars!!').slice(0, 32).padEnd(32, '!');
const ENC_IV  = (process.env.EMAIL_ENC_IV  || 'lextech-iv-16!!').slice(0, 16).padEnd(16, '!');

export function encryptPassword(plain: string): string {
  const cipher = crypto.createCipheriv('aes-256-cbc', ENC_KEY, ENC_IV);
  return cipher.update(plain, 'utf8', 'base64') + cipher.final('base64');
}

export function decryptPassword(enc: string): string {
  try {
    const decipher = crypto.createDecipheriv('aes-256-cbc', ENC_KEY, ENC_IV);
    return decipher.update(enc, 'base64', 'utf8') + decipher.final('utf8');
  } catch {
    return enc;
  }
}
