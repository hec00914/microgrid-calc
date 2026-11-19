/*
 * 資料加密（AES-256-GCM，金鑰由密碼經 PBKDF2-SHA256 推導）
 * 網站上只放加密後的 data.enc.json，沒有密碼就讀不到任何價格、成本、利潤資料。
 */
(function (root) {
  'use strict';
  const subtle = (root.crypto || globalThis.crypto).subtle;
  const ITER = 250000;
  const enc = new TextEncoder(), dec = new TextDecoder();
  const toB64 = buf => { const b = new Uint8Array(buf); let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return (root.btoa || globalThis.btoa)(s); };
  const fromB64 = s => Uint8Array.from((root.atob || globalThis.atob)(s), c => c.charCodeAt(0));
  const rand = n => (root.crypto || globalThis.crypto).getRandomValues(new Uint8Array(n));

  async function deriveKey(password, saltB64, iter) {
    const base = await subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
    return subtle.deriveKey({ name: 'PBKDF2', salt: fromB64(saltB64), iterations: iter || ITER, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  }
  async function encryptWithKey(obj, key, saltB64, iter) {
    const iv = rand(12);
    const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(obj)));
    return { format: 'mg-enc', v: 1, kdf: 'PBKDF2-SHA256', iter: iter || ITER, salt: saltB64, iv: toB64(iv), ct: toB64(ct), savedAt: new Date().toISOString() };
  }
  async function encrypt(obj, password) {
    const salt = toB64(rand(16));
    const key = await deriveKey(password, salt, ITER);
    return { env: await encryptWithKey(obj, key, salt, ITER), key };
  }
  async function decryptWithKey(env, key) {
    const pt = await subtle.decrypt({ name: 'AES-GCM', iv: fromB64(env.iv) }, key, fromB64(env.ct));
    return JSON.parse(dec.decode(pt));
  }
  async function decrypt(env, password) {
    const key = await deriveKey(password, env.salt, env.iter);
    return { data: await decryptWithKey(env, key), key };
  }
  async function exportKey(key) { return toB64(await subtle.exportKey('raw', key)); }
  async function importKey(b64) { return subtle.importKey('raw', fromB64(b64), { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']); }
  const isEnvelope = o => !!(o && o.format === 'mg-enc' && o.ct && o.iv && o.salt);

  const api = { deriveKey, encrypt, encryptWithKey, decrypt, decryptWithKey, exportKey, importKey, isEnvelope, ITER };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.MGCrypto = api;
})(this);
