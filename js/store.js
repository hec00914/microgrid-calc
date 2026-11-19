/*
 * 資料存取層 (Store)
 * ─────────────────────────────────────────────
 * 目前版本：GitHub Pages（靜態網站）＋ 密碼加密
 *   - 清單/參數：網站上的 data.enc.json（加密）→ 輸入密碼後在瀏覽器內解密
 *     管理分頁的修改也以加密形式暫存在本機瀏覽器
 *   - 案件紀錄：存在本機瀏覽器 (localStorage)，可匯出/匯入 JSON
 *
 * 日後轉到公司伺服器時，把下面函式改成呼叫後端 API（並改用伺服器登入）即可，
 * 畫面程式 (app.js) 不需要修改。所有函式都回傳 Promise。
 */
(function (root) {
  'use strict';
  const C = root.MGCrypto;
  const KEY_DATA = 'mg.v3.data.local.enc';
  const KEY_CASES = 'mg.v3.cases';
  const KEY_SESSION = 'mg.v3.keys';

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } }
  function ssGet(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
  function ssSet(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* ignore */ } }
  function ssDel(k) { try { sessionStorage.removeItem(k); } catch (e) { /* ignore */ } }

  let siteEnv = null, localEnv = null;
  let work = null; // { key, salt } 目前用來加密本機修改與匯出的金鑰

  function keyMap() { const s = ssGet(KEY_SESSION) || lsGet(KEY_SESSION); try { const o = s ? JSON.parse(s) : {}; if (o.exp && Date.now() > o.exp) { lsDel(KEY_SESSION); return {}; } return o; } catch (e) { return {}; } }
  async function remember(salt, key, persist) {
    const m = keyMap(); m.keys = m.keys || {}; m.keys[salt] = await C.exportKey(key);
    ssSet(KEY_SESSION, JSON.stringify(m));
    if (persist) { m.exp = Date.now() + 30 * 864e5; lsSet(KEY_SESSION, JSON.stringify(m)); }
  }

  async function tryKey(env, keyB64) { try { const k = await C.importKey(keyB64); return { data: await C.decryptWithKey(env, k), key: k }; } catch (e) { return null; } }
  async function tryPw(env, pw) { try { return await C.decrypt(env, pw); } catch (e) { return null; } }

  const Store = {
    mode: 'local-encrypted',

    /* 讀取加密檔（網站 data.enc.json；直接雙擊 index.html 時改用內嵌檔） */
    async loadEnvelopes() {
      siteEnv = null;
      try { const res = await fetch('data.enc.json', { cache: 'no-store' }); if (res.ok) siteEnv = await res.json(); } catch (e) { /* file:// */ }
      if (!C.isEnvelope(siteEnv)) siteEnv = root.MG_ENC_DATA || null;
      try { const s = lsGet(KEY_DATA); localEnv = s ? JSON.parse(s) : null; } catch (e) { localEnv = null; }
      return { site: !!siteEnv, local: !!localEnv, savedAt: siteEnv && siteEnv.savedAt };
    },

    /* 用已記住的金鑰自動解鎖；失敗回傳 null */
    async autoUnlock() {
      const m = keyMap().keys || {};
      const s = siteEnv && m[siteEnv.salt] ? await tryKey(siteEnv, m[siteEnv.salt]) : null;
      const l = localEnv && m[localEnv.salt] ? await tryKey(localEnv, m[localEnv.salt]) : null;
      if (!s && !l) return null;
      work = l ? { key: l.key, salt: localEnv.salt } : { key: s.key, salt: siteEnv.salt };
      return { siteData: s ? s.data : null, localData: l ? l.data : null };
    },

    /* 輸入密碼解鎖 */
    async unlock(pw, persist) {
      const s = siteEnv ? await tryPw(siteEnv, pw) : null;
      const l = localEnv ? await tryPw(localEnv, pw) : null;
      if (!s && !l) throw new Error('密碼錯誤');
      if (s) await remember(siteEnv.salt, s.key, persist);
      if (l) await remember(localEnv.salt, l.key, persist);
      work = l ? { key: l.key, salt: localEnv.salt } : { key: s.key, salt: siteEnv.salt };
      return { siteData: s ? s.data : null, localData: l ? l.data : null };
    },

    logout() { ssDel(KEY_SESSION); lsDel(KEY_SESSION); work = null; },

    /* 本機修改（加密保存） */
    async saveLocalData(d) { if (!work) return false; localEnv = await C.encryptWithKey(d, work.key, work.salt); return lsSet(KEY_DATA, JSON.stringify(localEnv)); },
    async clearLocalData() { lsDel(KEY_DATA); localEnv = null; },

    /* 產生要上傳 GitHub 的加密檔（目前密碼） */
    async exportEnvelope(d) { return C.encryptWithKey(d, work.key, work.salt); },

    /* 變更密碼：用新密碼重新加密，回傳新的 data.enc.json 內容 */
    async changePassword(newPw, d) {
      const r = await C.encrypt(d, newPw);
      work = { key: r.key, salt: r.env.salt };
      await remember(r.env.salt, r.key, !!lsGet(KEY_SESSION));
      localEnv = r.env; lsSet(KEY_DATA, JSON.stringify(localEnv));
      return r.env;
    },

    /* 匯入的檔案若是加密檔，用目前密碼或指定密碼解密 */
    async decryptImported(env, pw) {
      if (pw) return (await C.decrypt(env, pw)).data;
      return C.decryptWithKey(env, work.key);
    },

    /* 案件紀錄 */
    async listCases() {
      const s = lsGet(KEY_CASES);
      try { return s ? JSON.parse(s) : []; } catch (e) { return []; }
    },
    async saveCase(c) {
      const all = await Store.listCases();
      const now = new Date().toISOString();
      if (!c.id) { c.id = 'MG' + Date.now().toString(36).toUpperCase(); c.createdAt = now; c.version = 1; }
      else { c.version = (c.version || 1) + 1; }
      c.updatedAt = now;
      const i = all.findIndex(x => x.id === c.id);
      if (i >= 0) all[i] = c; else all.unshift(c);
      if (!lsSet(KEY_CASES, JSON.stringify(all))) throw new Error('瀏覽器儲存空間不足或被停用');
      return c;
    },
    async deleteCase(id) {
      const all = (await Store.listCases()).filter(x => x.id !== id);
      lsSet(KEY_CASES, JSON.stringify(all));
    },
    async importCases(list) {
      const all = await Store.listCases();
      let added = 0;
      list.forEach(c => { if (!c || !c.id || !c.input) return; const i = all.findIndex(x => x.id === c.id); if (i >= 0) all[i] = c; else { all.push(c); added++; } });
      lsSet(KEY_CASES, JSON.stringify(all));
      return added;
    }
  };
  root.MGStore = Store;
})(this);
