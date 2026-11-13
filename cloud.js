/* JobCam two-tier cloud layer (admins + client links), backed by Supabase.
   Completely inert while config.js holds placeholders: no network calls, no UI changes.
   Admins: email+password login, stays signed in. Phone stays local-first; changes queue and upload when online.
   Clients: per-job link/code -> read-only view of that one job. Access is enforced by Supabase RLS + Storage policies. */
'use strict';
(function(){
if(!(window.jobcamCloudConfigured&&window.jobcamCloudConfigured()))return;
const CFG=window.JOBCAM_CONFIG,URL_=CFG.SUPABASE_URL.replace(/\/$/,''),KEY=CFG.SUPABASE_ANON_KEY;
const SDK='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.8/+esm';
const BUCKET='job-photos',SAFE=/^[A-Za-z0-9._-]{1,150}$/;
const q=s=>document.querySelector(s),h=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtDate=t=>new Date(t).toLocaleDateString('en-CA',{timeZone:'America/Coral_Harbour',month:'short',day:'numeric',year:'numeric'});
const fmtTime=t=>new Date(t).toLocaleTimeString('en-CA',{timeZone:'America/Coral_Harbour',hour:'numeric',minute:'2-digit'});
let sdkPromise=null;function sdk(){if(!sdkPromise)sdkPromise=import(SDK).catch(e=>{sdkPromise=null;throw e});return sdkPromise}
const check=({data,error})=>{if(error)throw Error(error.message||String(error));return data};
const css=document.createElement('style');css.textContent=`
.team-box{border:2px solid var(--line);border-radius:12px;padding:14px;margin:16px 0;background:var(--panel2)}.team-box h3{margin:0 0 6px}.team-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}.team-row button{flex:1}
.share-code{font:700 22px/1.2 ui-monospace,Menlo,monospace;letter-spacing:2px;word-break:break-all}.share-link{width:100%;font-size:13px!important}.share-item{display:flex;align-items:center;justify-content:space-between;gap:10px;border:1px solid var(--line);border-radius:10px;padding:10px 12px;margin-top:8px;font-size:13px}.share-item.off{opacity:.55}.share-item button{min-height:44px;padding:6px 12px}
.client-view h1{margin:6px 0}.client-phase{margin-top:22px}.client-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.client-grid button{padding:0;border:0;background:none;min-height:0}.client-grid img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:10px;display:block}.client-grid small{display:block;font-size:11px;margin-top:4px}.client-foot{margin:28px 0 90px;font-size:13px;color:var(--muted)}.client-code-form{margin-top:14px}.jobcam-client #viewer button:not([data-close]){display:none!important}
`;document.head.append(css);

/* ---------------- Client mode (link/code) ---------------- */
function codeFromHash(){const m=/[#&]client=([A-Za-z0-9-]{4,40})/.exec(location.hash);return m?m[1]:''}
function clientShell(html){const main=q('#main');main.hidden=false;main.innerHTML='<div class="client-view">'+html+'</div>'}
function codeForm(msg){return '<form class="client-code-form" id="clientCodeForm"><p class="caption">'+h(msg)+'</p><label class="field">Client code<input id="clientCodeInput" autocomplete="one-time-code" autocapitalize="characters" maxlength="20" placeholder="XXXX-XXXX-XXXX" required></label><button class="primary wide" type="submit">Open my project</button></form>'}
function bindCodeForm(){const f=q('#clientCodeForm');if(f)f.onsubmit=e=>{e.preventDefault();location.hash='client='+q('#clientCodeInput').value.trim();location.reload()}}
function exitClient(){try{localStorage.removeItem('jobcam-client-mode')}catch{}history.replaceState(null,'',location.pathname+location.search);location.reload()}
async function startClient(){
  document.documentElement.classList.add('jobcam-client');
  document.querySelectorAll('.header .icon-btn,.bottom-nav,#lockGate').forEach(el=>el.setAttribute('hidden',''));
  clientShell('<p class="load">Opening your project…</p>');
  const code=codeFromHash();
  try{
    const {createClient}=await sdk();
    const sb=createClient(URL_,KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,storageKey:'jobcam-client-auth'}});
    window.jobcamClientSB=sb;
    let session=check(await sb.auth.getSession()).session;
    if(!session)session=check(await sb.auth.signInAnonymously()).session;
    let jobId='',expires='';
    if(code){
      const res=await sb.rpc('claim_client_code',{p_code:code});
      history.replaceState(null,'',location.pathname+location.search);
      if(res.error){clientShell('<h1>Link not working</h1>'+codeForm('This link has expired, was turned off, or was typed wrong. Ask Carpenter Johnny for a new one, or type the code below.'));bindCodeForm();return}
      const row=(res.data||[])[0];jobId=row.job_id;expires=row.expires_at;try{sessionStorage.setItem('jobcam-client-job',jobId)}catch{}
      try{localStorage.setItem('jobcam-client-mode','1')}catch{}
    }
    const access=check(await sb.rpc('my_client_access'))||[];
    if(!jobId){if(!access.length){clientShell('<h1>Your project</h1>'+codeForm('Your link has expired or was turned off. Ask Carpenter Johnny for a new link, or type a code.')+'<p class="client-foot"><button class="text-btn" id="clientExit">Not a client? Exit client view</button></p>');bindCodeForm();q('#clientExit').onclick=exitClient;return}let pick=null;try{pick=sessionStorage.getItem('jobcam-client-job')}catch{}const row=access.find(x=>x.job_id===pick)||access[0];jobId=row.job_id;expires=row.expires_at}
    const job=check(await sb.from('jobs').select('id,name,category,area,job_date,note,completed_on').eq('id',jobId).single());
    const photos=check(await sb.from('photos').select('id,phase,original_path,stamp,caption,added_at').eq('job_id',jobId).order('added_at',{ascending:true}))||[];
    const paths=photos.map(p=>p.original_path);let urls={};
    if(paths.length){for(const r of check(await sb.storage.from(BUCKET).createSignedUrls(paths,3600))||[])if(r.signedUrl)urls[r.path]=r.signedUrl}
    const others=access.filter(a=>a.job_id!==jobId);
    let html='<span class="badge">View-only · your project</span><h1>'+h(job.name)+'</h1><p class="caption">'+h(job.category)+(job.area?' · '+h(job.area):'')+' · '+h(fmtDate(job.job_date+'T12:00:00-05:00'))+'</p>'+(job.note?'<p class="note">'+h(job.note)+'</p>':'');
    for(const phase of ['Before','During','After']){const list=photos.filter(p=>p.phase===phase&&urls[p.original_path]);if(!list.length)continue;html+='<section class="client-phase"><div class="section-head"><h2>'+phase+'</h2></div><div class="client-grid">'+list.map(p=>'<button type="button" data-client-photo="'+h(p.id)+'"><img loading="lazy" src="'+h(urls[p.original_path])+'" alt="'+phase+' photo"><small>'+h(p.caption||p.stamp||'')+'</small></button>').join('')+'</div></section>'}
    if(!photos.length)html+='<div class="empty"><h3>No photos yet</h3><p>Photos will show up here as the job goes.</p></div>';
    html+='<div class="client-foot"><p>Private link from Carpenter Johnny. You can only see this project. Link works until '+h(fmtDate(expires))+'.</p>'+(others.length?'<p>'+others.map(a=>'<button class="secondary" data-client-job="'+h(a.job_id)+'">Open my other project</button>').join(' ')+'</p>':'')+'<button class="text-btn" id="clientExit">Not a client? Exit client view</button></div>';
    clientShell(html);q('#clientExit').onclick=exitClient;
    document.querySelectorAll('[data-client-photo]').forEach(b=>b.onclick=()=>{const p=photos.find(x=>x.id===b.dataset.clientPhoto);q('#viewerImage').src=urls[p.original_path];q('#viewerImage').alt=p.phase+' photo';q('#viewerTitle').textContent=p.phase;q('#viewerCaption').textContent=p.caption||p.stamp||'';q('#viewer').showModal()});
    document.querySelectorAll('[data-client-job]').forEach(b=>b.onclick=()=>{try{sessionStorage.setItem('jobcam-client-job',b.dataset.clientJob)}catch{}location.reload()});
  }catch(err){console.error(err);clientShell('<h1>Can’t open right now</h1><p class="caption">Check your internet connection and try again.</p><button class="primary wide" onclick="location.reload()">Try again</button><p class="client-foot"><button class="text-btn" id="clientExit">Not a client? Exit client view</button></p>');q('#clientExit').onclick=exitClient}
  finally{window.jobcamClientReady=true}
}
window.JobcamClient={start:startClient};
if(window.jobcamClientPending){startClient();return}

/* Lock gate: let a client type a code instead of the install passcode. */
(function addGateCodeLink(){const card=q('.lock-card');if(!card||q('#gateClientBtn'))return;const wrap=document.createElement('div');wrap.innerHTML='<button class="text-btn" id="gateClientBtn" type="button" style="width:100%;margin-top:10px">Client? Open your project with a code</button><form id="gateClientForm" hidden style="margin-top:10px"><label class="field">Client code<input id="gateClientCode" autocapitalize="characters" maxlength="20" placeholder="XXXX-XXXX-XXXX" required></label><button class="secondary wide" type="submit">Open my project</button></form>';card.append(wrap);q('#gateClientBtn').onclick=()=>{q('#gateClientForm').hidden=false;q('#gateClientCode').focus()};q('#gateClientForm').onsubmit=e=>{e.preventDefault();location.hash='client='+q('#gateClientCode').value.trim();location.reload()}})();

/* ---------------- Admin mode ---------------- */
// Legacy single-key "crew mode" targets an older schema; the team login below replaces it.
try{connectCloud=async function(){cloudStatus('Replaced by Team sign-in above.')}}catch{}
let sb=null,admin=null,syncing=false,syncAgain=false,syncTimer=null,lastSync=0,lastError='',pendingCount=0;
async function adminClient(){if(sb)return sb;const {createClient}=await sdk();sb=createClient(URL_,KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,storageKey:'jobcam-admin-auth'}});window.jobcamAdminSB=sb;return sb}
const hasStoredSession=()=>{try{return !!localStorage.getItem('jobcam-admin-auth')}catch{return false}};

// Sync bookkeeping lives in its own IndexedDB so the notebook DB is never touched by this layer's schema.
let stateDB;function openState(){if(stateDB)return Promise.resolve(stateDB);return new Promise((res,rej)=>{const r=indexedDB.open('JobCamCloud',1);r.onupgradeneeded=()=>r.result.createObjectStore('kv');r.onsuccess=()=>{stateDB=r.result;res(stateDB)};r.onerror=()=>rej(r.error)})}
async function loadState(){const d=await openState();return new Promise((res,rej)=>{const g=d.transaction('kv').objectStore('kv').get('state');g.onsuccess=()=>res(g.result||{jobs:{},photos:{},notes:{}});g.onerror=()=>rej(g.error)})}
async function saveState(st){const d=await openState();return new Promise((res,rej)=>{const t=d.transaction('kv','readwrite');t.objectStore('kv').put(st,'state');t.oncomplete=res;t.onerror=()=>rej(t.error)})}
function stable(v){if(Array.isArray(v))return '['+v.map(stable).join(',')+']';if(v&&typeof v==='object')return '{'+Object.keys(v).filter(k=>v[k]!==undefined).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}';return JSON.stringify(v===undefined?null:v)}
function fp(v){const s=typeof v==='string'?v:stable(v);let h1=0xdeadbeef,h2=0x41c6ce57;for(let i=0;i<s.length;i++){const c=s.charCodeAt(i);h1=Math.imul(h1^c,2654435761);h2=Math.imul(h2^c,1597334677)}h1=Math.imul(h1^(h1>>>16),2246822507)^Math.imul(h2^(h2>>>13),3266489909);h2=Math.imul(h2^(h2>>>16),2246822507)^Math.imul(h1^(h1>>>13),3266489909);return (h2>>>0).toString(36)+(h1>>>0).toString(36)+':'+s.length}
const cut=(s,n)=>String(s??'').slice(0,n);
const iso=t=>{if(!t)return null;const d=new Date(t);return isNaN(d)?null:d.toISOString()};
const jobRow=p=>({id:p.id,name:cut(p.name,90),category:cut(p.category,40),area:cut(p.area,70),job_date:p.date,note:cut(p.note,2000),tags:p.tags||[],featured_photo_id:p.featuredPhotoId||null});
const photoMeta=(p,ph)=>({id:ph.id,job_id:p.id,phase:ph.phase,name:cut(ph.name,300),stamp:cut(ph.stamp,300),taken_at:ph.takenAt||null,added_at:iso(ph.addedAt),source:cut(ph.source,100),uploaded_by:cut(ph.uploader,50),gps:ph.gps||null,tags:ph.tags||[],caption:cut(ph.caption,500),annotations:ph.annotations||[],annotated_at:iso(ph.annotatedAt)});
const noteRow=(p,l)=>({id:l.id,job_id:p.id,log_date:l.date,author:cut(l.author,50),work:cut(l.work,2000),issues:cut(l.issues,1000),next_steps:cut(l.next,1000),weather:cut(l.weather,200),created_at:iso(l.createdAt)||iso(l.date+'T12:00:00-05:00')||new Date(0).toISOString()});
const syncable=p=>p&&!p.demo&&SAFE.test(p.id);

function planPush(list,st){const ops=[];for(const p of list){if(!syncable(p))continue;const jf=fp(jobRow(p));if(st.jobs[p.id]!==jf)ops.push({t:'job',p,f:jf});for(const ph of p.photos||[]){if(!SAFE.test(ph.id))continue;const s=st.photos[ph.id]||{};if(!s.orig)ops.push({t:'orig',p,ph});const annF=ph.annotatedData?fp(ph.annotatedData):'';if(annF&&s.annFp!==annF)ops.push({t:'ann',p,ph,f:annF});const mf=fp(photoMeta(p,ph));if(s.meta!==mf||!s.row)ops.push({t:'meta',p,ph,f:mf})}for(const l of p.logs||[]){if(!SAFE.test(l.id))continue;const nf=fp(noteRow(p,l));if(st.notes[l.id]!==nf)ops.push({t:'note',p,l,f:nf})}}return ops}
async function upload(path,dataUrl){const blob=await(await fetch(dataUrl)).blob();const type=/^image\/(jpeg|png|webp)$/.test(blob.type)?blob.type:'image/jpeg';const r=await sb.storage.from(BUCKET).upload(path,blob,{contentType:type,upsert:false,cacheControl:'3600'});if(r.error&&!/exist|duplicate/i.test(r.error.message||''))throw Error(r.error.message);return path}
async function push(st){const list=await localLoad();const ops=planPush(list,st);let done=0;
  for(const op of ops){const {p,ph}=op;
    if(op.t==='job'){check(await sb.from('jobs').upsert(jobRow(p),{onConflict:'id'}));st.jobs[p.id]=op.f}
    else if(op.t==='orig'){if(!st.jobs[p.id])continue;const s=st.photos[ph.id]||(st.photos[ph.id]={});s.orig=await upload(p.id+'/'+ph.id+'/original-'+crypto.randomUUID()+'.jpg',ph.data)}
    else if(op.t==='ann'){const s=st.photos[ph.id];if(!s?.orig)continue;s.ann=await upload(p.id+'/'+ph.id+'/markup-'+crypto.randomUUID()+'.jpg',ph.annotatedData);s.annFp=op.f;s.meta=''}
    else if(op.t==='meta'){const s=st.photos[ph.id];if(!s?.orig)continue;check(await sb.from('photos').upsert({...photoMeta(p,ph),original_path:s.orig,annotated_path:s.ann||null},{onConflict:'id'}));s.meta=op.f;s.row=true}
    else if(op.t==='note'){if(!st.jobs[p.id])continue;check(await sb.from('notes').upsert(noteRow(p,op.l),{onConflict:'id'}));st.notes[op.l.id]=op.f}
    done++;if(done%5===0)await saveState(st)}
  await saveState(st);return planPush(await localLoad(),st).length}
async function fetchAll(table){let out=[],from=0;for(;;){const rows=check(await sb.from(table).select('*').order('id',{ascending:true}).range(from,from+999))||[];out=out.concat(rows);if(rows.length<1000)return out;from+=1000}}
const blobToData=b=>new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=()=>rej(r.error);r.readAsDataURL(b)});
async function download(path){const {signedUrl}=check(await sb.storage.from(BUCKET).createSignedUrl(path,300));const r=await fetch(signedUrl,{cache:'no-store'});if(!r.ok)throw Error('Photo download failed');return blobToData(await r.blob())}
async function pull(st){
  const [jobs,photos,notes]=[await fetchAll('jobs'),await fetchAll('photos'),await fetchAll('notes')];
  const localNow=await localLoad(),byId=new Map(localNow.map(p=>[p.id,p]));const images=new Map();
  for(const r of photos){const local=byId.get(r.job_id)?.photos?.find(x=>x.id===r.id);const s=st.photos[r.id];
    if(!local){try{images.set(r.id,{data:await download(r.original_path),ann:r.annotated_path?await download(r.annotated_path):null})}catch(e){console.warn('JobCam: photo will retry',e)}}
    else if(r.annotated_path&&s&&s.ann!==r.annotated_path&&(!local.annotatedData||fp(local.annotatedData)===s.annFp)){try{images.set(r.id,{ann:await download(r.annotated_path)})}catch{}}}
  // Merge against the freshest in-memory copy to avoid clobbering edits made during downloads.
  const current=(Array.isArray(projects)?projects:[]).slice(),map=new Map(current.map(p=>[p.id,p])),changed=new Map();
  const edit=id=>{if(!changed.has(id)){const p=map.get(id);changed.set(id,{...p,tags:[...(p.tags||[])],photos:[...(p.photos||[])],logs:[...(p.logs||[])]})}return changed.get(id)};
  for(const j of jobs){const remote={name:j.name,category:j.category,area:j.area,date:j.job_date,note:j.note,tags:j.tags||[],featuredPhotoId:j.featured_photo_id||''};
    if(!map.has(j.id)){const p={id:j.id,demo:false,photos:[],logs:[],...remote};map.set(j.id,p);changed.set(j.id,p);st.jobs[j.id]=fp(jobRow(p));continue}
    const local=map.get(j.id),lf=fp(jobRow(local)),rf=fp(jobRow({id:j.id,...remote}));
    if(lf!==rf&&st.jobs[j.id]===lf){Object.assign(edit(j.id),remote);st.jobs[j.id]=rf}else if(lf===rf)st.jobs[j.id]=lf}
  for(const r of photos){if(!map.has(r.job_id))continue;const p=changed.get(r.job_id)||map.get(r.job_id);const local=p.photos.find(x=>x.id===r.id);const img=images.get(r.id);
    const remoteMeta={phase:r.phase,name:r.name,stamp:r.stamp,takenAt:r.taken_at,addedAt:r.added_at,source:r.source,uploader:r.uploaded_by,gps:r.gps,tags:r.tags||[],caption:r.caption,annotations:r.annotations||[],annotatedAt:r.annotated_at||undefined};
    if(!local){if(!img?.data)continue;const ph={id:r.id,...remoteMeta,data:img.data,...(img.ann?{annotatedData:img.ann}:{})};edit(r.job_id).photos.push(ph);const q2=changed.get(r.job_id);st.photos[r.id]={orig:r.original_path,ann:r.annotated_path||null,annFp:img.ann?fp(img.ann):'',meta:fp(photoMeta(q2,ph)),row:true};continue}
    const s=st.photos[r.id]||(st.photos[r.id]={orig:r.original_path,row:true});s.orig=s.orig||r.original_path;s.row=true;
    const lm=fp(photoMeta(p,local)),rm=fp(photoMeta(p,{...local,...remoteMeta}));
    if(lm!==rm&&s.meta===lm){const tgt=edit(r.job_id);tgt.photos=tgt.photos.map(x=>x.id===r.id?{...x,...remoteMeta,...(img?.ann?{annotatedData:img.ann}:{})}:x);const np=tgt.photos.find(x=>x.id===r.id);s.meta=fp(photoMeta(tgt,np));if(img?.ann){s.ann=r.annotated_path;s.annFp=fp(img.ann)}}
    else if(lm===rm)s.meta=lm}
  for(const n of notes){if(!map.has(n.job_id))continue;const p=changed.get(n.job_id)||map.get(n.job_id);if((p.logs||[]).some(l=>l.id===n.id)){if(!st.notes[n.id])st.notes[n.id]=fp(noteRow(p,p.logs.find(l=>l.id===n.id)));continue}const log={id:n.id,date:n.log_date,author:n.author,work:n.work,issues:n.issues,next:n.next_steps,weather:n.weather,createdAt:n.created_at};edit(n.job_id).logs.push(log);st.notes[n.id]=fp(noteRow(p,log))}
  if(changed.size){await localPersist([...changed.values()]);const fresh=Array.isArray(projects)?projects.slice():[];for(const [id,p] of changed){const i=fresh.findIndex(x=>x.id===id);if(i>=0)fresh[i]=p;else fresh.push(p)}projects=fresh;const dialogOpen=[...document.querySelectorAll('dialog')].some(d=>d.open);if(!dialogOpen&&!busy)render()}
  await saveState(st);return changed.size}
async function syncNow(manual=false){
  if(!admin)return;if(syncing){syncAgain=true;return}
  if(!navigator.onLine){pendingCount=planPush(await localLoad(),await loadState()).length;teamUI();return}
  syncing=true;teamUI('Syncing…');
  try{const st=await loadState();pendingCount=await push(st);const got=await pull(st);pendingCount=await push(st);lastSync=Date.now();lastError='';if(manual)toast(got?'Synced. '+got+' job'+(got===1?'':'s')+' updated from the team.':'All synced.')}
  catch(err){console.error(err);lastError=err.message||'Sync failed';try{pendingCount=planPush(await localLoad(),await loadState()).length}catch{}if(manual)toast('Not synced yet. It will retry automatically.')}
  finally{syncing=false;teamUI();if(syncAgain){syncAgain=false;setTimeout(()=>syncNow(),500)}}}
function scheduleSync(){clearTimeout(syncTimer);syncTimer=setTimeout(()=>syncNow(),3000)}
// Every local save also queues an upload (the queue is "anything not yet in the cloud", so nothing is lost offline).
try{const innerPersist=persist;persist=async function(list){const r=await innerPersist(list);if(admin)scheduleSync();return r}}catch{}
window.addEventListener('online',()=>{if(admin)syncNow()});
document.addEventListener('visibilitychange',()=>{if(admin&&document.visibilityState==='visible')syncNow()});
setInterval(()=>{if(admin&&navigator.onLine&&document.visibilityState!=='hidden')syncNow()},60000);

async function becomeAdmin(){const client=await adminClient();const session=check(await client.auth.getSession()).session;if(!session){admin=null;teamUI();return false}
  const row=(check(await client.rpc('am_i_admin'))||[])[0];if(!row?.is_admin){admin=null;await client.auth.signOut();teamUI('That account is not on the JobCam admin list.');return false}
  admin={role:row.role_label};teamUI();syncNow();if(typeof current!=='undefined'&&current)renderDetail();return true}
function teamUI(msg){const box=q('#teamBox');if(!box)return;const sn=q('#storageNote');if(sn){if(!sn.dataset.local)sn.dataset.local=sn.textContent;sn.textContent=admin?'Saved on this phone first, then copied to the private JobCam cloud for the team.':sn.dataset.local}q('#teamLogin').hidden=!!admin;q('#teamSignedIn').hidden=!admin;
  let text=msg||'';if(!text){if(!admin)text='Admins only (Kyler, Johnny, marketing). Clients never sign in here — they get a link.';else{const label={owner:'Owner',carpenter:'Carpenter',marketing:'Marketing'}[admin.role]||'Admin';text='Signed in · '+label+'. Photos save on this phone first, then copy to the private JobCam cloud.\n'+(syncing?'Syncing…':pendingCount?pendingCount+' change'+(pendingCount===1?'':'s')+' waiting to upload'+(navigator.onLine?'':' (offline — will upload when back online)')+'.':'Everything uploaded.')+(lastSync?' Last sync '+fmtTime(lastSync)+' (UTC−5).':'')+(lastError?'\nLast problem: '+lastError:'')}}
  q('#teamStatus').textContent=text}
function addTeamBox(){if(q('#teamBox'))return;const legacy=q('.cloud-setup');if(legacy)legacy.hidden=true;const box=document.createElement('section');box.className='team-box';box.id='teamBox';
  box.innerHTML='<h3>Team sign-in</h3><p class="v2-status" id="teamStatus" style="white-space:pre-line"></p><form id="teamLogin"><label class="field">Email<input id="teamEmail" type="email" autocomplete="username" required></label><label class="field">Password<input id="teamPassword" type="password" autocomplete="current-password" required minlength="6"></label><button class="primary wide" type="submit" id="teamSignIn">Sign in</button></form><div id="teamSignedIn" hidden><div class="team-row"><button class="secondary" id="teamSync" type="button">Sync now</button><button class="secondary" id="teamSignOut" type="button">Sign out</button></div></div>';
  const anchor=q('#storageNote');anchor?anchor.after(box):q('#settingsDialog').append(box);
  q('#teamLogin').onsubmit=async e=>{e.preventDefault();const b=q('#teamSignIn');b.disabled=true;teamUI('Signing in…');try{const client=await adminClient();const r=await client.auth.signInWithPassword({email:q('#teamEmail').value.trim(),password:q('#teamPassword').value});if(r.error)throw Error(/invalid/i.test(r.error.message)?'Wrong email or password.':r.error.message);q('#teamPassword').value='';if(await becomeAdmin())toast('Signed in. Your jobs will upload in the background.')}catch(err){teamUI(navigator.onLine?err.message:'Sign-in needs internet.')}finally{b.disabled=false}};
  q('#teamSync').onclick=()=>syncNow(true);
  q('#teamSignOut').onclick=async()=>{try{await sb.auth.signOut()}catch{}admin=null;teamUI('Signed out. Everything stays on this phone.');if(typeof current!=='undefined'&&current)renderDetail()};
  teamUI()}

/* Share with client (admin, on a job) */
function shareDialog(){if(q('#shareDialog'))return q('#shareDialog');return addDialog('shareDialog','Share with client','<p class="caption">Makes a private, view-only link to <strong>this job only</strong>. The client sees its photos and design note — never other jobs, daily notes or prices.</p><label class="field">Job finished on (links run from this date)<input type="date" id="shareFinished"></label><button class="secondary wide" id="shareFinishSave" type="button">Save finish date</button><label class="field" style="margin-top:14px">Link lasts<select id="shareDays"><option value="30">30 days</option><option value="60">60 days</option><option value="90" selected>90 days after the job finishes</option><option value="180">180 days</option><option value="365">1 year</option></select></label><button class="primary wide" id="shareCreate" type="button">Create client link</button><div id="shareResult" hidden><p class="caption">Text this link to the client. It’s shown once — make a new one if it’s lost.</p><input class="share-link" id="shareLink" readonly><p class="share-code" id="shareCode"></p><div class="team-row"><button class="secondary" id="shareCopy" type="button">Copy link</button><button class="secondary" id="shareSend" type="button">Send…</button></div></div><div class="section-head"><h2>Client links</h2></div><div id="shareList"><p class="caption">Loading…</p></div><p class="v2-status" id="shareStatus" role="status"></p>')}
async function loadShares(jobId){const list=q('#shareList');try{const rows=check(await sb.from('client_access').select('id,code_hint,expires_at,revoked,last_used_at,created_at').eq('job_id',jobId).order('created_at',{ascending:false}))||[];const job=check(await sb.from('jobs').select('completed_on').eq('id',jobId).maybeSingle());q('#shareFinished').value=job?.completed_on||'';
  list.innerHTML=rows.length?rows.map(r=>{const live=!r.revoked&&new Date(r.expires_at)>new Date();return '<div class="share-item'+(live?'':' off')+'"><span>Code …'+h(r.code_hint)+'<br><small>'+(r.revoked?'Turned off':live?'Works until '+h(fmtDate(r.expires_at)):'Expired '+h(fmtDate(r.expires_at)))+(r.last_used_at?' · opened '+h(fmtDate(r.last_used_at)):' · not opened yet')+'</small></span>'+(live?'<button class="secondary" data-revoke="'+h(r.id)+'">Turn off</button>':'')+'</div>'}).join(''):'<p class="caption">No client links yet.</p>';
  list.querySelectorAll('[data-revoke]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{check(await sb.from('client_access').update({revoked:true,revoked_at:new Date().toISOString()}).eq('id',b.dataset.revoke));toast('Client link turned off.');loadShares(jobId)}catch(err){q('#shareStatus').textContent='Could not turn off: '+err.message;b.disabled=false}})}
  catch(err){list.innerHTML='<p class="caption">'+(navigator.onLine?'Could not load links: '+h(err.message):'Needs internet to manage client links.')+'</p>'}}
async function openShare(){const p=getCurrent();if(!p||!admin)return;const d=shareDialog();q('#shareResult').hidden=true;q('#shareStatus').textContent='';d.showModal();
  if(!navigator.onLine){q('#shareList').innerHTML='<p class="caption">Needs internet to make a client link. Your photos are safe on this phone.</p>';return}
  q('#shareStatus').textContent='Uploading this job first…';await syncNow();q('#shareStatus').textContent=pendingCount?'Some photos are still uploading; the client will see them once they finish.':'';await loadShares(p.id);
  q('#shareFinishSave').onclick=async()=>{try{check(await sb.from('jobs').update({completed_on:q('#shareFinished').value||null}).eq('id',p.id));toast('Finish date saved. Links now run from that date.');loadShares(p.id)}catch(err){q('#shareStatus').textContent=err.message}};
  q('#shareCreate').onclick=async()=>{const b=q('#shareCreate');b.disabled=true;q('#shareStatus').textContent='Making link…';try{await syncNow();const row=(check(await sb.rpc('create_client_access',{p_job_id:p.id,p_valid_days:Number(q('#shareDays').value)}))||[])[0];const pretty=row.code.replace(/(.{4})(?=.)/g,'$1-');const link=location.origin+location.pathname+'#client='+pretty;q('#shareLink').value=link;q('#shareCode').textContent=pretty;q('#shareResult').hidden=false;q('#shareStatus').textContent='Works until '+fmtDate(row.expires_at)+'.';
    q('#shareCopy').onclick=async()=>{try{await navigator.clipboard.writeText(link);toast('Link copied.')}catch{q('#shareLink').select();toast('Select and copy the link.')}};
    q('#shareSend').onclick=async()=>{if(navigator.share){try{await navigator.share({title:'Your project photos',text:'Your project photos from Carpenter Johnny (view-only):',url:link})}catch{}}else q('#shareCopy').click()};
    loadShares(p.id)}catch(err){q('#shareStatus').textContent=/not uploaded/i.test(err.message)?'This job hasn’t uploaded yet. Check your connection and try again.':'Could not make a link: '+err.message}finally{b.disabled=false}}}
try{const innerDetail=renderDetail;renderDetail=function(){innerDetail();const p=getCurrent();if(!p||!admin||p.demo)return;const tools=q('.v2-tools');if(!tools||q('#shareClientButton'))return;const b=document.createElement('button');b.className='primary';b.id='shareClientButton';b.type='button';b.textContent='Share with client';b.style.gridColumn='1 / -1';b.onclick=openShare;tools.append(b)}}catch{}

/* Boot: wait for the notebook to finish loading (after the install passcode). */
(function boot(){if(!window.jobcamReady){setTimeout(boot,200);return}addTeamBox();const off=q('#offlineStatus');if(off)off.textContent=off.textContent.replace('Cloud mode requires a connection; it has no offline sync queue.','Team sync queues changes offline and uploads them when the phone is back online.');if(hasStoredSession()){const go=()=>becomeAdmin().catch(err=>{teamUI(navigator.onLine?'Sign-in check failed: '+err.message:'Offline. Saved changes will upload when back online.');if(!navigator.onLine)window.addEventListener('online',()=>{if(!admin)becomeAdmin().catch(()=>{})},{once:true})});go()}})();
window.JobcamTeam={syncNow,state:loadState,get admin(){return admin},get pending(){return pendingCount}};
})();
