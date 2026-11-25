/* Cloudflare Pages Function: admin access management (approve, block, revoke, create, remove accounts).
   Same one-time setup as set-password.js (FIREBASE_SERVICE_ACCOUNT in Cloudflare Pages). Admin only.
   POST /api/accounts  {action:'scan'|'import'|'create'|'status'|'revoke'|'remove', ...} */
const PROJECT = 'twingulf-logbook-a06fa';
const API_KEY = 'AIzaSyDR588NOdXuLijBd3DKv06XY-CwXmAa6vE'; /* public web key, same as firebase-config.js */
const IDT = 'https://identitytoolkit.googleapis.com/v1/projects/' + PROJECT;
const FS = 'https://firestore.googleapis.com/v1/projects/' + PROJECT + '/databases/(default)/documents';
const ROLE = { press: 'press', lab: 'lab', laboratory: 'lab', pack: 'pack', packing: 'pack', packaging: 'pack', leader: 'all', shiftleader: 'all', shift: 'all', maint: 'maint', maintenance: 'maint' };

const json = (code, body) => new Response(JSON.stringify(body), { status: code, headers: { 'Content-Type': 'application/json' } });
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64uText = (s) => b64u(new TextEncoder().encode(s));
const roleOf = (em) => ROLE[String(em || '').toLowerCase().split('@')[0].replace(/[^a-z]/g, '')] || null;

function readKey(env) {
  let raw = env.FIREBASE_SERVICE_ACCOUNT || '';
  if (raw && raw.trim()[0] !== '{') raw = atob(raw.trim());
  return JSON.parse(raw);
}
async function accessToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const head = b64uText(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64uText(JSON.stringify({ iss: sa.client_email, sub: sa.client_email, aud: 'https://oauth2.googleapis.com/token', scope: 'https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/datastore', iat: now, exp: now + 3000 }));
  const pem = String(sa.private_key).replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(head + '.' + claim));
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=' + encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer') + '&assertion=' + head + '.' + claim + '.' + b64u(sig) });
  const j = await r.json();
  if (!r.ok || !j.access_token) throw new Error('token');
  return j.access_token;
}
const H = (tok) => ({ Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' });
async function isAdminUid(uid, tok) {
  const r = await fetch(FS + '/admins/' + encodeURIComponent(uid), { headers: H(tok) });
  if (r.status === 404) return false;
  if (!r.ok) throw new Error('firestore');
  return true;
}
const fv = (v) => (typeof v === 'boolean' ? { booleanValue: v } : { stringValue: String(v) });
async function fsMerge(path, obj, tok) {
  const keys = Object.keys(obj);
  const fields = {}; keys.forEach((k) => { fields[k] = fv(obj[k]); });
  const mask = keys.map((k) => 'updateMask.fieldPaths=' + encodeURIComponent(k)).join('&');
  const r = await fetch(FS + '/' + path + '?' + mask, { method: 'PATCH', headers: H(tok), body: JSON.stringify({ fields }) });
  if (!r.ok) throw new Error('firestore');
}
async function listUsers(tok) {
  const out = []; let page = '';
  for (let i = 0; i < 10; i++) {
    const r = await fetch(IDT + '/accounts:batchGet?maxResults=500' + (page ? '&nextPageToken=' + encodeURIComponent(page) : ''), { headers: H(tok) });
    const j = await r.json();
    if (!r.ok) throw new Error('auth');
    (j.users || []).forEach((u) => out.push({ uid: u.localId, email: u.email || '', disabled: !!u.disabled, last: u.lastLoginAt || '', created: u.createdAt || '' }));
    if (!j.nextPageToken) break; page = j.nextPageToken;
  }
  return out;
}
async function listDocIds(tok) {
  const ids = {}; let page = '';
  for (let i = 0; i < 10; i++) {
    const r = await fetch(FS + '/accounts?pageSize=300&mask.fieldPaths=status' + (page ? '&pageToken=' + encodeURIComponent(page) : ''), { headers: H(tok) });
    if (r.status === 404) break;
    const j = await r.json();
    if (!r.ok) throw new Error('firestore');
    (j.documents || []).forEach((d) => { ids[d.name.split('/').pop()] = 1; });
    if (!j.nextPageToken) break; page = j.nextPageToken;
  }
  return ids;
}

export async function onRequestPost({ request, env }) {
  let sa;
  try { sa = readKey(env); } catch (e) { return json(500, { error: 'Server setup missing: add FIREBASE_SERVICE_ACCOUNT in Cloudflare Pages.' }); }
  const idToken = String(request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  let who;
  try {
    const r = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + API_KEY, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken }) });
    const j = await r.json();
    if (!r.ok || !j.users || !j.users[0]) return json(401, { error: 'Not signed in.' });
    who = j.users[0].localId;
  } catch (e) { return json(401, { error: 'Not signed in.' }); }
  let tok;
  try { tok = await accessToken(sa); } catch (e) { return json(500, { error: 'Server setup wrong: the FIREBASE_SERVICE_ACCOUNT key was refused.' }); }
  try { if (!(await isAdminUid(who, tok))) return json(403, { error: 'Only the admin can manage access.' }); } catch (e) { return json(500, { error: 'Could not check the admin.' }); }
  let b = {};
  try { b = await request.json(); } catch (e) { return json(400, { error: 'Bad request.' }); }
  const now = new Date().toISOString();
  try {
    if (b.action === 'scan') {
      const users = await listUsers(tok), have = await listDocIds(tok);
      for (const u of users) u.admin = await isAdminUid(u.uid, tok);
      return json(200, { users: users.map((u) => Object.assign(u, { listed: !!have[u.uid], other: !u.admin && !roleOf(u.email) })) });
    }
    if (b.action === 'import') { /* give every existing sign-in account that is not listed yet an 'active' record (so switching the lock on later does not shut anyone out) */
      const users = await listUsers(tok), have = await listDocIds(tok); let n = 0;
      for (const u of users) {
        if (have[u.uid] || u.disabled) continue;
        if (!roleOf(u.email)) continue; /* accounts of other systems on this Firebase project (e.g. logistics) are never approved for the logbook */
        if (await isAdminUid(u.uid, tok)) continue;
        const role = roleOf(u.email);
        await fsMerge('accounts/' + encodeURIComponent(u.uid), { status: 'active', kind: (role === 'press' || role === 'lab' || role === 'pack') ? 'tablet' : 'person', name: String(u.email).split('@')[0], email: u.email, role: role || '', createdAt: now, statusAt: now, statusBy: who }, tok); n++;
      }
      return json(200, { imported: n });
    }
    if (b.action === 'create') {
      const email = String(b.email || '').trim().toLowerCase(), pw = String(b.password || '');
      if (!/^[a-z0-9._-]+@[a-z0-9.-]+$/.test(email)) return json(400, { error: 'Use letters and numbers for the user name.' });
      if (pw.length < 6) return json(400, { error: 'The password needs at least 6 characters.' });
      const r = await fetch(IDT + '/accounts', { method: 'POST', headers: H(tok), body: JSON.stringify({ email, password: pw, emailVerified: true }) });
      const j = await r.json();
      if (!r.ok) return json(400, { error: /EMAIL_EXISTS/.test(JSON.stringify(j)) ? 'That user name already exists.' : 'Could not create the account.' });
      const role = roleOf(email);
      await fsMerge('accounts/' + encodeURIComponent(j.localId), { status: 'active', kind: b.kind === 'person' ? 'person' : 'tablet', name: String(b.name || email.split('@')[0]).slice(0, 60), email, role: role || '', createdAt: now, statusAt: now, statusBy: who }, tok);
      return json(200, { uid: j.localId });
    }
    const uid = String(b.uid || '');
    if (!uid) return json(400, { error: 'Bad request.' });
    if (uid === who || (await isAdminUid(uid, tok))) return json(400, { error: 'The admin account cannot be changed here.' });
    if (b.action === 'status') {
      const st = b.status === 'blocked' ? 'blocked' : 'active';
      if (st === 'blocked') {
        await fsMerge('accounts/' + encodeURIComponent(uid), { status: 'blocked', statusAt: now, statusBy: who }, tok); /* the data lock reacts at once */
        const r = await fetch(IDT + '/accounts:update', { method: 'POST', headers: H(tok), body: JSON.stringify({ localId: uid, disableUser: true, validSince: String(Math.floor(Date.now() / 1000)) }) });
        if (!r.ok) return json(500, { error: 'Blocked in the list, but the sign-in could not be disabled.' });
      } else {
        const r = await fetch(IDT + '/accounts:update', { method: 'POST', headers: H(tok), body: JSON.stringify({ localId: uid, disableUser: false }) });
        if (!r.ok) return json(500, { error: 'Could not enable the sign-in.' });
        const extra = {};
        if (b.email) { const em = String(b.email).toLowerCase(), role = roleOf(em); Object.assign(extra, { email: em, name: String(b.name || em.split('@')[0]).slice(0, 60), kind: b.kind === 'person' ? 'person' : ((role === 'press' || role === 'lab' || role === 'pack') ? 'tablet' : 'person'), role: role || '' }); }
        await fsMerge('accounts/' + encodeURIComponent(uid), Object.assign({ status: 'active', statusAt: now, statusBy: who }, extra), tok);
      }
      return json(200, { ok: true });
    }
    if (b.action === 'revoke') { /* sign the device out everywhere; it can sign in again with the password */
      const r = await fetch(IDT + '/accounts:update', { method: 'POST', headers: H(tok), body: JSON.stringify({ localId: uid, validSince: String(Math.floor(Date.now() / 1000)) }) });
      if (!r.ok) return json(500, { error: 'Could not revoke.' });
      return json(200, { ok: true });
    }
    if (b.action === 'remove') {
      await fsMerge('accounts/' + encodeURIComponent(uid), { status: 'blocked', statusAt: now, statusBy: who }, tok);
      const r = await fetch(IDT + '/accounts:delete', { method: 'POST', headers: H(tok), body: JSON.stringify({ localId: uid }) });
      if (!r.ok) return json(500, { error: 'Could not remove the account.' });
      await fetch(FS + '/accounts/' + encodeURIComponent(uid), { method: 'DELETE', headers: H(tok) });
      return json(200, { ok: true });
    }
    return json(400, { error: 'Unknown action.' });
  } catch (e) { return json(500, { error: 'The server could not finish this. Try again.' }); }
}
