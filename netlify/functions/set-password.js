/* Lets the admin set a new sign-in password for a tablet account (press@, lab@, ...).
   Needs the FIREBASE_SERVICE_ACCOUNT environment variable in Netlify (see SETUP.md, Part 5). */
const admin = require('firebase-admin');

const reply = (code, body) => ({ statusCode: code, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

function init() {
  if (admin.apps.length) return;
  let raw = process.env.FIREBASE_SERVICE_ACCOUNT || '';
  if (raw && raw.trim()[0] !== '{') raw = Buffer.from(raw, 'base64').toString('utf8');
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)) });
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return reply(405, { error: 'Use POST.' });
  try { init(); } catch (e) { return reply(500, { error: 'Server setup missing: add FIREBASE_SERVICE_ACCOUNT in Netlify.' }); }
  const h = event.headers || {};
  const token = String(h.authorization || h.Authorization || '').replace(/^Bearer\s+/i, '');
  let who;
  try { who = await admin.auth().verifyIdToken(token); } catch (e) { return reply(401, { error: 'Not signed in.' }); }
  const db = admin.firestore();
  const me = await db.doc('admins/' + who.uid).get();
  if (!me.exists) return reply(403, { error: 'Only the admin can change these passwords.' });
  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch (e) { return reply(400, { error: 'Bad request.' }); }
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  if (!/^[^@\s]+@[^@\s]+$/.test(email)) return reply(400, { error: 'Bad email.' });
  if (password.length < 6 || password.length > 128) return reply(400, { error: 'The password needs at least 6 characters.' });
  let user;
  try { user = await admin.auth().getUserByEmail(email); } catch (e) { return reply(404, { error: 'No account with that email.' }); }
  const target = await db.doc('admins/' + user.uid).get();
  if (target.exists) return reply(403, { error: 'An admin account cannot be changed here.' });
  try { await admin.auth().updateUser(user.uid, { password }); } catch (e) { return reply(500, { error: 'Firebase refused the change.' }); }
  return reply(200, { ok: true });
};
