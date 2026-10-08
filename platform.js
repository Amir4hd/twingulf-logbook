/* Connects the logbook to Firebase. It gives the app the same small interface it used inside Claude:
   claude.use('db'|'user'|'downloads'). Sign-in screen, offline storage and admin check live here. */
(function(){
  const cfg=window.FIREBASE_CONFIG||{};
  const q=new URLSearchParams(location.search);
  function el(h){const d=document.createElement('div');d.innerHTML=h;return d.firstElementChild;}
  const css=document.createElement('style');
  css.textContent='#lg{position:fixed;inset:0;z-index:99999;background:#e9ece7;display:flex;align-items:center;justify-content:center;padding:16px;font:16px system-ui,sans-serif;color:#17211c}#lg form{background:#fff;border:1px solid #cdd5ca;border-radius:12px;padding:24px;width:min(380px,100%);display:flex;flex-direction:column;gap:12px}#lg h1{margin:0;font-size:22px}#lg label{display:flex;flex-direction:column;gap:4px;font-size:14px;color:#56645b}#lg input{font-size:18px;padding:12px;border:1px solid #9aa89d;border-radius:8px}#lg button{font-size:18px;padding:14px;border:0;border-radius:8px;background:#1f5a3a;color:#fff}#lg .e{color:#a31d1d;font-size:14px;min-height:18px}';
  document.head.appendChild(css);
  function fail(msg){document.body.appendChild(el('<div id="lg"><form><h1>Setup needed</h1><p>'+msg+'</p></form></div>'));}
  if(!cfg.apiKey||/PASTE/.test(cfg.apiKey)||!window.firebase){window.claude={use:async()=>null};document.addEventListener('DOMContentLoaded',()=>fail('Open firebase-config.js and paste the Firebase settings (see SETUP.md).'));return;}
  firebase.initializeApp(cfg);
  const auth=firebase.auth(),fs=firebase.firestore();
  try{fs.settings({cacheSizeBytes:firebase.firestore.CACHE_SIZE_UNLIMITED});}catch(e){}
  fs.enablePersistence({synchronizeTabs:true}).catch(()=>{});
  const writeErr=e=>{try{window.dispatchEvent(new CustomEvent('plant-write-error',{detail:e}));}catch(_){}};
  // Offline writes are stored on the device and sent later; do not make the screen wait for the server.
  const w=p=>{const slow=new Promise(r=>setTimeout(r,1200));p.catch(writeErr);return Promise.race([p,slow]);};
  const wrapDoc=r=>({id:r.id,path:r.path,
    get:()=>r.get(),
    set:d=>w(r.set(d)),
    update:d=>w(r.set(d,{merge:true})),
    delete:()=>w(r.delete()),
    onSnapshot:(n,e)=>r.onSnapshot({includeMetadataChanges:false},n,e||(()=>{}))});
  const wrapQ=c=>({
    where:(f,o,v)=>wrapQ(c.where(f,o,v)),orderBy:(f,d)=>wrapQ(c.orderBy(f,d)),limit:n=>wrapQ(c.limit(n)),
    get:()=>c.get(),onSnapshot:(n,e)=>c.onSnapshot(n,e||(()=>{})),
    doc:id=>wrapDoc(id?c.doc(id):c.doc()),
    add:async d=>{const r=c.doc();w(r.set(d));return wrapDoc(r);}});
  const db={doc:p=>wrapDoc(fs.doc(p)),collection:p=>wrapQ(fs.collection(p))};
  let ready=null;
  function signedIn(){
    if(ready)return ready;
    ready=new Promise(res=>{
      if(q.has('signout'))auth.signOut().then(()=>history.replaceState(null,'',location.pathname));
      auth.onAuthStateChanged(u=>{
        const old=document.getElementById('lg');if(old)old.remove();
        if(u){res(u);return;}
        const f=el('<div id="lg"><form><h1>Twin Gulf Plant Logbook</h1><label>Email<input id="lgE" type="email" autocomplete="username" required></label><label>Password<input id="lgP" type="password" autocomplete="current-password" required></label><div class="e" id="lgX"></div><button type="submit">Sign in</button></form></div>');
        document.body.appendChild(f);
        f.querySelector('form').onsubmit=async ev=>{ev.preventDefault();
          try{await auth.signInWithEmailAndPassword(f.querySelector('#lgE').value.trim(),f.querySelector('#lgP').value);}
          catch(e){f.querySelector('#lgX').textContent=(navigator.onLine?'Wrong email or password.':'No internet. You must be online for the first sign-in.');}};
      });
    });
    return ready;
  }

  // Sign-out button (bottom-left, small). Asks first; needs internet because signing in again needs it.
  function addSignOut(u){
    if(document.getElementById('lgOut')||!u)return;
    const st=document.createElement('style');
    st.textContent='#lgOut{position:fixed;left:8px;bottom:8px;z-index:9000;font:13px system-ui,sans-serif;padding:8px 12px;border-radius:8px;border:1px solid #9aa89d;background:rgba(251,252,250,.92);color:#17211c;opacity:.75}#lgOut:hover,#lgOut:focus{opacity:1}@media (prefers-color-scheme:dark){#lgOut{background:rgba(23,33,28,.92);color:#e9ece7;border-color:#56645b}}';
    document.head.appendChild(st);
    const b=document.createElement('button');b.id='lgOut';b.type='button';b.textContent='Sign out';b.title=u.email||'';
    b.onclick=async()=>{
      if(!navigator.onLine){alert('No internet. Signing out is blocked, because signing in again needs internet and unsent entries must be uploaded first.');return;}
      if(!confirm('Sign out '+(u.email||'this account')+'?\n\nThis tablet will need the account email and password and internet to sign in again.'))return;
      try{await auth.signOut();}catch(e){}
      try{localStorage.removeItem('plant.view');}catch(e){}
      location.href=location.pathname;};
    document.body.appendChild(b);
  }
  auth.onAuthStateChanged(u=>{if(u)addSignOut(u);else{const o=document.getElementById('lgOut');if(o)o.remove();}});
  const user={
    canEdit:async()=>{const u=await signedIn();try{const s=await fs.doc('admins/'+u.uid).get();return s.exists;}catch(e){return false;}},
    can:async()=>true,isOwner:async()=>false};
  const downloads={save:async x=>{const b=new Blob([x.data],{type:'text/csv;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=x.filename;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},1000);}};
  window.addEventListener('plant-write-error',e=>{const t=document.getElementById('toast');const m=(e.detail&&e.detail.code==='permission-denied')?'This account is not allowed to save that. Ask the admin.':'A saved entry could not be sent to the server.';if(t){t.className='toast bad';t.textContent=m;t.hidden=false;setTimeout(()=>{t.hidden=true},8000);}else alert(m);});
  window.claude={use:async n=>{if(n==='db'){await signedIn();return db;}if(n==='user'){await signedIn();return user;}if(n==='downloads')return downloads;return null;}};
})();
