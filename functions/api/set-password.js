/* Cloudflare Pages Function: lets the admin set a new sign-in password for a tablet account
   (press@, lab@, ...). Needs the FIREBASE_SERVICE_ACCOUNT variable in Cloudflare Pages
   (Settings > Variables and Secrets). Same JSON key file that was used with Netlify. */
const PROJECT = 'twingulf-logbook-a06fa';
const API_KEY = 'AIzaSyDR588NOdXuLijBd3DKv06XY-CwXmAa6vE'; /* public web key, same as firebase-config.js */

const json = (code, body) => new Response(JSON.stringify(body), { status: code, headers: { 'Content-Type': 'application/json' } });
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64uText = (s) => b64u(new TextEncoder().encode(s));

function readKey(env) {
  let raw = env.FIREBASE_SERVICE_ACCOUNT || '';
  if (raw && raw.trim()[0] !== '{') raw = atob(raw.trim());
  return JSON.parse(raw);
}

async function accessToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const head = b64uText(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64uText(JSON.stringify({
    iss: sa.client_email, sub: sa.client_email, aud: 'https://oauth2.googleapis.com/token',
    scope: 'https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/datastore',
    iat: now, exp: now + 3000
  }));
  const pem = String(sa.private_key).replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(head + '.' + claim));
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=' + encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer') + '&assertion=' + head + '.' + claim + '.' + b64u(sig)
  });
  const j = await r.json();
  if (!r.ok || !j.access_token) throw new Error('token');
  return j.access_token;
}

async function isAdminDoc(uid, tok) {
  const r = await fetch('https://firestore.googleapis.com/v1/projects/' + PROJECT + '/databases/(default)/documents/admins/' + encodeURIComponent(uid), { headers: { Authorization: 'Bearer ' + tok } });
  if (r.status === 404) return false;
  if (!r.ok) throw new Error('firestore');
  return true;
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
  try { if (!(await isAdminDoc(who, tok))) return json(403, { error: 'Only the admin can change these passwords.' }); } catch (e) { return json(500, { error: 'Could not check the admin.' }); }
  let body = {};
  try { body = await request.json(); } catch (e) { return json(400, { error: 'Bad request.' }); }
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  if (!/^[^@\s]+@[^@\s]+$/.test(email)) return json(400, { error: 'Bad email.' });
  if (password.length < 6 || password.length > 128) return json(400, { error: 'The password needs at least 6 characters.' });
  const H = { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' };
  let uid;
  try {
    const r = await fetch('https://identitytoolkit.googleapis.com/v1/projects/' + PROJECT + '/accounts:lookup', { method: 'POST', headers: H, body: JSON.stringify({ email: [email] }) });
    const j = await r.json();
    if (!r.ok) return json(500, { error: 'Firebase lookup failed (' + r.status + '): ' + String((j.error && j.error.message) || '').slice(0, 120) });
    if (!j.users || !j.users[0]) return json(404, { error: 'No account with that email in Firebase Authentication.' });
    uid = j.users[0].localId;
  } catch (e) { return json(500, { error: 'Firebase lookup failed.' }); }
  try { if (await isAdminDoc(uid, tok)) return json(403, { error: 'An admin account cannot be changed here.' }); } catch (e) { return json(500, { error: 'Could not check the account.' }); }
  const r = await fetch('https://identitytoolkit.googleapis.com/v1/projects/' + PROJECT + '/accounts:update', { method: 'POST', headers: H, body: JSON.stringify({ localId: uid, password }) });
  if (!r.ok) return json(500, { error: 'Firebase refused the change.' });
  return json(200, { ok: true });
}
export async function onRequest({ request }) { return json(405, { error: 'Use POST.' }); }
