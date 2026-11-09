/* JobCam automatic Google Drive backup.
 * - No server and no secrets: a public OAuth *client ID* only, scope drive.file (app-created files only).
 * - Every saved photo / markup / job change is queued in IndexedDB (JobCamBackup) and uploaded
 *   whenever the app is open and online. Nothing nags the user; status lives quietly in Settings.
 * - While GOOGLE_CLIENT_ID is the placeholder, backup is fully disabled and changes nothing.
 */
(function(root){
'use strict';

// ======== CONFIG: paste the Web OAuth client ID here (see DRIVE-BACKUP-SETUP.md) ========
const GOOGLE_CLIENT_ID='PASTE_YOUR_CLIENT_ID.apps.googleusercontent.com';
// =========================================================================================

const PLACEHOLDER_ID='PASTE_YOUR_CLIENT_ID.apps.googleusercontent.com';
const SCOPE='https://www.googleapis.com/auth/drive.file';
const FOLDER_NAME='JobCam Backup';
const MANIFEST_NAME='jobs.json';
const FOLDER_MIME='application/vnd.google-apps.folder';

// ---------------------------------------------------------------------------------------
// Core logic (pure; unit-tested in Node with an in-memory store and a mock Drive)
// ---------------------------------------------------------------------------------------
function isConfigured(id){return typeof id==='string'&&id!==PLACEHOLDER_ID&&/^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/i.test(id)}

// Cheap, stable signature of a (possibly multi-MB) data URL: length + FNV-1a over ~8k sampled chars.
function sigOf(str){
  str=String(str??'');const n=str.length;let h=0x811c9dc5;
  const step=Math.max(1,Math.floor(n/8192));
  for(let i=0;i<n;i+=step){h^=str.charCodeAt(i);h=Math.imul(h,0x01000193)>>>0}
  for(let i=Math.max(0,n-128);i<n;i++){h^=str.charCodeAt(i);h=Math.imul(h,0x01000193)>>>0}
  return n.toString(36)+'.'+h.toString(36);
}
const safeName=s=>String(s).replace(/[^A-Za-z0-9_-]+/g,'-').slice(0,80)||'x';
function mimeOf(dataUrl){const m=/^data:([^;,]+)[;,]/.exec(String(dataUrl||''));return m?m[1]:'application/octet-stream'}
function extOf(mime){return {'image/jpeg':'jpg','image/png':'png','image/webp':'webp','video/mp4':'mp4','video/quicktime':'mov'}[mime]||'bin'}
const MEDIA_FIELDS=[['data','orig'],['annotatedData','markup']];
function mediaKey(projectId,photoId,tag){return 'm:'+projectId+'\u0001'+photoId+'\u0001'+tag}
function mediaName(projectId,photoId,tag,mime){return safeName(projectId)+'__'+safeName(photoId)+(tag==='markup'?'__markup':'')+'.'+extOf(mime)}
function backoffMs(attempts){return Math.min(30*60*1000,5000*Math.pow(2,Math.max(0,attempts-1)))}
const backedUp=p=>p&&!p.demo;

// Manifest: every job and photo record, with media replaced by Drive file names.
function buildManifest(projects){
  return {format:'johnny-jobcam-drive',version:1,projects:projects.filter(backedUp).map(p=>({...p,photos:(p.photos||[]).map(ph=>{
    const out={...ph};delete out.data;delete out.annotatedData;
    for(const [field,tag] of MEDIA_FIELDS){if(typeof ph[field]==='string'&&ph[field])out[field==='data'?'dataFile':'markupFile']=mediaName(p.id,ph.id,tag,mimeOf(ph[field]))}
    return out})}))};
}
const manifestSig=projects=>sigOf(JSON.stringify(buildManifest(projects).projects));

// Diff local projects against what Drive already has and queue only what changed.
async function enqueueChanges(store,projects,now=Date.now()){
  const files=new Map((await store.allFiles()).map(f=>[f.key,f]));
  const queued=new Map((await store.allQueue()).map(q=>[q.key,q]));
  let added=0;
  for(const p of projects.filter(backedUp))for(const ph of p.photos||[])for(const [field,tag] of MEDIA_FIELDS){
    const value=ph[field];if(typeof value!=='string'||!value)continue;
    const key=mediaKey(p.id,ph.id,tag),sig=sigOf(value);
    if(files.get(key)?.sig===sig){if(queued.has(key)){await store.delQueue(key)}continue}
    if(queued.get(key)?.sig===sig)continue;
    await store.putQueue({key,kind:'media',projectId:p.id,photoId:ph.id,field,tag,sig,attempts:0,nextAt:now,addedAt:now});added++;
  }
  const mSig=manifestSig(projects);
  if(added||(await store.getState('manifestSig'))!==mSig){
    if(!queued.has('manifest')||added){await store.putQueue({key:'manifest',kind:'manifest',attempts:0,nextAt:now,addedAt:now})}
    else{const q=queued.get('manifest');if(q.nextAt>now){q.nextAt=now;q.attempts=0;await store.putQueue(q)}}
    added++;
  }
  return added;
}

class AuthError extends Error{constructor(msg){super(msg||'Google sign-in expired');this.name='AuthError'}}

async function resetFolder(store){for(const k of ['folderId','manifestId','manifestSig'])await store.setState(k,null);await store.clearFiles()}
async function ensureFolder(store,drive,verify=false){
  let id=await store.getState('folderId');
  if(id&&verify&&drive.exists&&!(await drive.exists(id))){
    // Backup folder was deleted/trashed in Drive: start a fresh folder and re-upload everything.
    await resetFolder(store);id=null;
  }
  if(id)return id;
  id=await drive.findFolder(FOLDER_NAME);
  if(!id)id=await drive.createFolder(FOLDER_NAME);
  await store.setState('folderId',id);return id;
}

// Upload everything due. Returns {uploaded, failed, remaining}. Throws AuthError on 401 (items stay queued).
async function runQueue({store,drive,getProjects,now=()=>Date.now(),maxItems=500}){
  const due=(await store.allQueue()).filter(q=>q.nextAt<=now()).sort((a,b)=>(a.kind==='manifest')-(b.kind==='manifest')||a.addedAt-b.addedAt).slice(0,maxItems);
  let uploaded=0,failed=0;
  if(!due.length)return {uploaded,failed,remaining:(await store.allQueue()).length};
  let folderId=await ensureFolder(store,drive,true);
  for(const item of due){
    try{
      const projects=getProjects();
      if(item.kind==='media'){
        const p=projects.find(x=>x.id===item.projectId),ph=p?.photos?.find(x=>x.id===item.photoId),value=ph?.[item.field];
        if(!backedUp(p)||typeof value!=='string'||!value){await store.delQueue(item.key);continue}
        const sig=sigOf(value),rec=await store.getFile(item.key);
        if(rec?.sig===sig){await store.delQueue(item.key);continue}
        const mime=mimeOf(value),name=mediaName(p.id,ph.id,item.tag,mime);
        let fileId;
        try{fileId=await drive.upload({name,mimeType:mime,parentId:folderId,dataUrl:value,fileId:rec?.fileId})}
        catch(e){if(e.status===404&&rec?.fileId){fileId=await drive.upload({name,mimeType:mime,parentId:folderId,dataUrl:value})}else throw e}
        await store.putFile({key:item.key,fileId,sig,name,at:now()});
        const latest=await store.getQueue(item.key);
        if(latest&&latest.sig!==sig){}else await store.delQueue(item.key);
      }else if(item.kind==='manifest'){
        const manifest=buildManifest(projects),mSig=manifestSig(projects);
        manifest.updatedAt=new Date(now()).toISOString();
        const text=JSON.stringify(manifest),prev=await store.getState('manifestId');
        let fileId;
        try{fileId=await drive.upload({name:MANIFEST_NAME,mimeType:'application/json',parentId:folderId,text,fileId:prev})}
        catch(e){if(e.status===404&&prev){fileId=await drive.upload({name:MANIFEST_NAME,mimeType:'application/json',parentId:folderId,text})}else throw e}
        await store.setState('manifestId',fileId);await store.setState('manifestSig',mSig);
        await store.delQueue(item.key);
      }else{await store.delQueue(item.key);continue}
      uploaded++;await store.setState('lastBackupAt',now());
    }catch(e){
      if(e instanceof AuthError||e.status===401)throw new AuthError(e.message);
      if(e.status===404&&drive.exists&&!(await drive.exists(folderId).catch(()=>true))){
        await resetFolder(store);folderId=await ensureFolder(store,drive);
        await enqueueChanges(store,getProjects(),now());
      }
      const latest=await store.getQueue(item.key)||item;
      latest.attempts=(latest.attempts||0)+1;latest.nextAt=now()+backoffMs(latest.attempts);latest.lastError=String(e.message||e).slice(0,200);
      await store.putQueue(latest);failed++;
    }
  }
  return {uploaded,failed,remaining:(await store.allQueue()).length};
}

// Rebuild projects from the Drive folder. Returns {projects, files} (files = records to mark as already uploaded).
async function restoreFromDrive({store,drive}){
  const folderId=(await store.getState('folderId'))||await drive.findFolder(FOLDER_NAME);
  if(!folderId)throw Error('No “'+FOLDER_NAME+'” folder found in this Google Drive.');
  const list=await drive.listFolder(folderId),byName=new Map(list.map(f=>[f.name,f.id]));
  const manifestId=byName.get(MANIFEST_NAME);
  if(!manifestId)throw Error('Backup folder has no '+MANIFEST_NAME+' yet.');
  const manifest=JSON.parse(await drive.downloadText(manifestId));
  if(manifest?.format!=='johnny-jobcam-drive'||!Array.isArray(manifest.projects))throw Error('Not a JobCam Drive backup.');
  const files=[];let missing=0;const projects=[];
  for(const p of manifest.projects){
    const photos=[];
    for(const ph of p.photos||[]){
      const out={...ph};delete out.dataFile;delete out.markupFile;
      for(const [field,tag,fileField] of [['data','orig','dataFile'],['annotatedData','markup','markupFile']]){
        const name=ph[fileField];if(!name)continue;const id=byName.get(name);
        if(!id){missing++;continue}
        const dataUrl=await drive.downloadDataUrl(id);out[field]=dataUrl;
        files.push({key:mediaKey(p.id,ph.id,tag),fileId:id,sig:sigOf(dataUrl),name,at:Date.now()});
      }
      if(typeof out.data==='string')photos.push(out);else missing++;
    }
    projects.push({...p,photos});
  }
  await store.setState('folderId',folderId);await store.setState('manifestId',manifestId);
  return {projects,files,missing};
}

// ---------------------------------------------------------------------------------------
// In-memory store (tests) and IndexedDB store (browser)
// ---------------------------------------------------------------------------------------
function memoryStore(){
  const q=new Map(),f=new Map(),s=new Map(),c=v=>v==null?v:JSON.parse(JSON.stringify(v));
  return {q,f,s,
    async allQueue(){return [...q.values()].map(c)},async getQueue(k){return c(q.get(k))},async putQueue(v){q.set(v.key,c(v))},async delQueue(k){q.delete(k)},
    async allFiles(){return [...f.values()].map(c)},async getFile(k){return c(f.get(k))},async putFile(v){f.set(v.key,c(v))},async clearFiles(){f.clear()},
    async getState(k){return c(s.get(k))},async setState(k,v){s.set(k,c(v))}};
}
function idbStore(name='JobCamBackup'){
  let dbp;
  const open=()=>dbp||(dbp=new Promise((res,rej)=>{const r=indexedDB.open(name,1);r.onupgradeneeded=()=>{const d=r.result;d.createObjectStore('queue',{keyPath:'key'});d.createObjectStore('files',{keyPath:'key'});d.createObjectStore('state')};r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)}));
  const run=(st,mode,fn)=>open().then(d=>new Promise((res,rej)=>{const t=d.transaction(st,mode),o=t.objectStore(st);let out;const r=fn(o);if(r)r.onsuccess=()=>{out=r.result};t.oncomplete=()=>res(out);t.onerror=()=>rej(t.error);t.onabort=()=>rej(t.error||Error('Backup queue write failed'))}));
  return {
    allQueue:()=>run('queue','readonly',o=>o.getAll()),getQueue:k=>run('queue','readonly',o=>o.get(k)),putQueue:v=>run('queue','readwrite',o=>o.put(v)),delQueue:k=>run('queue','readwrite',o=>o.delete(k)),
    allFiles:()=>run('files','readonly',o=>o.getAll()),getFile:k=>run('files','readonly',o=>o.get(k)),putFile:v=>run('files','readwrite',o=>o.put(v)),clearFiles:()=>run('files','readwrite',o=>o.clear()),
    getState:k=>run('state','readonly',o=>o.get(k)),setState:(k,v)=>run('state','readwrite',o=>o.put(v,k))};
}

// ---------------------------------------------------------------------------------------
// Drive REST adapter (fetch + bearer token). Multipart < 4 MB, resumable above.
// ---------------------------------------------------------------------------------------
function driveApi(getToken,fetchImpl=(...a)=>fetch(...a)){
  const API='https://www.googleapis.com/drive/v3',UP='https://www.googleapis.com/upload/drive/v3';
  async function call(url,opts={}){
    const token=await getToken();if(!token)throw new AuthError('Not signed in to Google Drive');
    const res=await fetchImpl(url,{...opts,headers:{...(opts.headers||{}),Authorization:'Bearer '+token}});
    if(res.status===401)throw new AuthError('Google sign-in expired');
    if(!res.ok){let msg='Drive error '+res.status;try{const j=await res.json();msg=j?.error?.message||msg}catch{}const e=Error(msg);e.status=res.status;throw e}
    return res;
  }
  const q=s=>encodeURIComponent(s);
  async function toBlob(dataUrl,text,mimeType){return text!=null?new Blob([text],{type:mimeType}):await (await fetch(dataUrl)).blob()}
  return {
    async findFolder(name){const r=await call(API+'/files?spaces=drive&pageSize=10&fields=files(id,name)&q='+q("name='"+name.replace(/'/g,"\\'")+"' and mimeType='"+FOLDER_MIME+"' and trashed=false"));const j=await r.json();return j.files?.[0]?.id||null},
    async createFolder(name){const r=await call(API+'/files?fields=id',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,mimeType:FOLDER_MIME})});return (await r.json()).id},
    async listFolder(id){const out=[];let token='';do{const r=await call(API+'/files?pageSize=1000&fields=nextPageToken,files(id,name,modifiedTime)&q='+q("'"+id+"' in parents and trashed=false")+(token?'&pageToken='+q(token):''));const j=await r.json();out.push(...(j.files||[]));token=j.nextPageToken||''}while(token);return out},
    async upload({name,mimeType,parentId,dataUrl,text,fileId}){
      const blob=await toBlob(dataUrl,text,mimeType);
      const meta=fileId?{name,mimeType}:{name,mimeType,parents:[parentId]};
      const base=fileId?UP+'/files/'+q(fileId):UP+'/files',method=fileId?'PATCH':'POST';
      if(blob.size<4*1024*1024){
        const boundary='jobcam'+Math.random().toString(36).slice(2);
        const body=new Blob(['--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'+JSON.stringify(meta)+'\r\n--'+boundary+'\r\nContent-Type: '+mimeType+'\r\n\r\n',blob,'\r\n--'+boundary+'--'],{type:'multipart/related; boundary='+boundary});
        const r=await call(base+'?uploadType=multipart&fields=id',{method,headers:{'Content-Type':'multipart/related; boundary='+boundary},body});return (await r.json()).id;
      }
      const start=await call(base+'?uploadType=resumable&fields=id',{method,headers:{'Content-Type':'application/json; charset=UTF-8','X-Upload-Content-Type':mimeType,'X-Upload-Content-Length':String(blob.size)},body:JSON.stringify(meta)});
      const loc=start.headers.get('Location');if(!loc)throw Error('Drive did not return an upload URL');
      const r=await call(loc,{method:'PUT',headers:{'Content-Type':mimeType},body:blob});return (await r.json()).id;
    },
    async exists(id){try{const r=await call(API+'/files/'+q(id)+'?fields=id,trashed');const j=await r.json();return !j.trashed}catch(e){if(e.status===404)return false;throw e}},
    async downloadText(id){return (await call(API+'/files/'+q(id)+'?alt=media')).text()},
    async downloadDataUrl(id){const blob=await (await call(API+'/files/'+q(id)+'?alt=media')).blob();return await new Promise((res,rej)=>{const fr=new FileReader();fr.onload=()=>res(fr.result);fr.onerror=()=>rej(fr.error);fr.readAsDataURL(blob)})},
    async about(){const r=await call(API+'/about?fields=user(emailAddress,displayName)');return (await r.json()).user||{}}
  };
}

const Core={GOOGLE_CLIENT_ID,PLACEHOLDER_ID,SCOPE,FOLDER_NAME,MANIFEST_NAME,isConfigured,sigOf,mediaKey,mediaName,mimeOf,backoffMs,buildManifest,manifestSig,enqueueChanges,runQueue,restoreFromDrive,ensureFolder,AuthError,memoryStore,idbStore,driveApi};
if(typeof module==='object'&&module.exports){module.exports=Core;return}
root.JobCamDriveCore=Core;
if(typeof document==='undefined')return;

// ---------------------------------------------------------------------------------------
// Browser wiring
// ---------------------------------------------------------------------------------------
const enabled=isConfigured(GOOGLE_CLIENT_ID);
const LS_TOKEN='jobcam-drive-token',LS_CONNECTED='jobcam-drive-connected',LS_STATE='jobcam-drive-oauth-state',LS_SILENT='jobcam-drive-silent-at',LS_HINT='jobcam-drive-hint',LS_GIS_AT='jobcam-drive-gis-at';
const ls={get(k){try{return localStorage.getItem(k)}catch{return null}},set(k,v){try{localStorage.setItem(k,v)}catch{}},del(k){try{localStorage.removeItem(k)}catch{}}};
const iosStandalone=navigator.standalone===true;
const store=idbStore();
const redirectURI=new URL('./',location.href).href.split('#')[0].split('?')[0];
let tokenClient=null,syncing=false,authPaused=false,lastError='',hiddenAt=0,gisLoading=null;

function readToken(){try{const t=JSON.parse(ls.get(LS_TOKEN)||'null');return t&&t.access_token&&t.expiresAt>Date.now()+60000?t.access_token:null}catch{return null}}
function saveToken(access_token,expiresIn){ls.set(LS_TOKEN,JSON.stringify({access_token,expiresAt:Date.now()+Math.max(60,Number(expiresIn)||3600)*1000}));ls.set(LS_CONNECTED,'1');authPaused=false}
const connected=()=>ls.get(LS_CONNECTED)==='1';

// 1) Redirect return: token arrives in the URL fragment. Strip it immediately.
(function handleRedirect(){
  if(!location.hash||!/access_token=|error=/.test(location.hash))return;
  const params=new URLSearchParams(location.hash.slice(1)),expected=ls.get(LS_STATE);ls.del(LS_STATE);
  history.replaceState(null,'',location.pathname+location.search);
  if(!enabled||!expected||params.get('state')!==expected)return;
  if(params.get('access_token')&&String(params.get('scope')||'').includes(SCOPE))saveToken(params.get('access_token'),params.get('expires_in'));
  else if(params.get('error'))authPaused=connected();
})();

function redirectToGoogle(silent){
  const state=crypto.getRandomValues(new Uint32Array(4)).join('-');ls.set(LS_STATE,state);
  const p=new URLSearchParams({client_id:GOOGLE_CLIENT_ID,redirect_uri:redirectURI,response_type:'token',scope:SCOPE,include_granted_scopes:'true',state});
  if(silent)p.set('prompt','none');
  const hint=ls.get(LS_HINT);if(hint)p.set('login_hint',hint);
  if(silent)ls.set(LS_SILENT,String(Date.now()));
  location.assign('https://accounts.google.com/o/oauth2/v2/auth?'+p);
}
function loadGIS(){return gisLoading||(gisLoading=new Promise((res,rej)=>{if(root.google?.accounts?.oauth2)return res();const s=document.createElement('script');s.src='https://accounts.google.com/gsi/client';s.async=true;s.onload=()=>res();s.onerror=()=>{gisLoading=null;rej(Error('Google sign-in could not load'))};document.head.append(s)}))}
// GIS token popup. prompt:'' = no screens after first consent (Google still flashes a short popup).
async function gisToken(prompt){
  await loadGIS();
  return await new Promise(resolve=>{
    let done=false;const finish=v=>{if(!done){done=true;resolve(v)}};
    const cfg={client_id:GOOGLE_CLIENT_ID,scope:SCOPE,callback:r=>{if(r&&r.access_token&&root.google.accounts.oauth2.hasGrantedAllScopes(r,SCOPE)){saveToken(r.access_token,r.expires_in);finish(r.access_token)}else finish(null)},error_callback:()=>finish(null)};
    const hint=ls.get(LS_HINT);if(hint)cfg.login_hint=hint;
    tokenClient=root.google.accounts.oauth2.initTokenClient(cfg);
    tokenClient.requestAccessToken({prompt});
    setTimeout(()=>finish(null),prompt===''?20000:180000);
  });
}
// Non-interactive token. Never shows a popup to Johnny on its own; only returns a cached token.
async function getToken(){return readToken()}

const drive=driveApi(getToken);
const safeToInterrupt=()=>!(typeof busy!=='undefined'&&busy)&&![...document.querySelectorAll('dialog')].some(d=>d.open)&&!(document.querySelector('#lockGate')&&!document.querySelector('#lockGate').hidden);
// Silent refresh when the cached token has expired: GIS prompt:'' first (not iOS home-screen),
// then a full-page prompt=none round trip at a safe moment (app start / resume), at most every 15 min.
async function silentRefresh(reason){
  if(!enabled||!connected()||!navigator.onLine)return false;
  if(!iosStandalone&&Date.now()-Number(ls.get(LS_GIS_AT)||0)>15*60*1000){ls.set(LS_GIS_AT,String(Date.now()));try{if(await gisToken(''))return true}catch{}}
  const last=Number(ls.get(LS_SILENT)||0);
  if((reason==='startup'||reason==='resume')&&Date.now()-last>15*60*1000&&safeToInterrupt()){redirectToGoogle(true);return false}
  authPaused=true;renderStatus();return false;
}

function allProjects(){try{return typeof projects!=='undefined'&&Array.isArray(projects)?projects:[]}catch{return []}}
const cloudActive=()=>{try{return typeof cloudStore!=='undefined'&&!!cloudStore}catch{return false}};

async function sync(reason){
  if(!enabled||!connected()||syncing||cloudActive())return;
  syncing=true;
  try{
    if(reason!=='timer')await enqueueChanges(store,allProjects());
    if(!navigator.onLine){lastError='';return}
    const pending=(await store.allQueue()).length;
    if(!pending){lastError='';return}
    if(!readToken()){syncing=false;await silentRefresh(reason);syncing=true;if(!readToken())return}
    const r=await runQueue({store,drive,getProjects:allProjects});
    lastError=r.failed?'Some items will retry automatically.':'';
    authPaused=false;
  }catch(e){
    if(e instanceof AuthError){ls.del(LS_TOKEN);syncing=false;await silentRefresh(reason==='startup'||reason==='resume'?reason:'auth');syncing=true}
    else lastError=String(e.message||e).slice(0,120);
  }finally{syncing=false;renderStatus()}
}
let syncTimer;function scheduleSync(reason,delay=1200){clearTimeout(syncTimer);syncTimer=setTimeout(()=>sync(reason),delay)}

// ---------- Settings UI (quiet; Kyler-facing) ----------
const css=document.createElement('style');css.textContent=`
#driveBackup h3{margin:0 0 6px}#driveBackup .drive-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}#driveBackup .drive-actions button{flex:1 1 140px;font-size:14px}
#driveStatus{font-size:13px;line-height:1.5;color:var(--muted);white-space:pre-line;margin:4px 0}
#driveStatus.paused{color:#ffb3bd}#driveReconnect{width:100%;margin-top:8px}`;document.head.append(css);
const box=document.createElement('div');box.className='backup-item';box.id='driveBackup';
box.innerHTML='<h3>Google Drive backup</h3><p id="driveStatus" role="status" aria-live="polite"></p><button class="primary" id="driveReconnect" hidden>Backup paused · tap to reconnect</button><div class="drive-actions"><button class="secondary" id="driveConnect">Connect Google Drive</button><button class="secondary" id="driveRestore">Restore from Drive</button><button class="secondary" id="driveSyncNow" hidden>Back up now</button><button class="text-btn" id="driveDisconnect" hidden>Disconnect</button></div>';
const anchor=document.querySelector('#importInput')||document.querySelector('#exportButton')?.closest('.backup-item');
if(anchor)anchor.after(box);else document.querySelector('#settingsDialog')?.append(box);
const $d=s=>box.querySelector(s);
const fmt=t=>{try{return typeof timeLabel==='function'?timeLabel(t):new Date(t).toLocaleString()}catch{return new Date(t).toLocaleString()}};
async function renderStatus(){
  const status=$d('#driveStatus');if(!status)return;
  if(!enabled){status.className='';status.textContent='Not set up yet. Needs a Google client ID (see setup guide). Export backup still works.';for(const id of ['#driveConnect','#driveRestore','#driveSyncNow','#driveDisconnect','#driveReconnect'])$d(id).hidden=true;return}
  const note=document.querySelector('#storageNote');if(note&&!cloudActive()&&connected())note.textContent='Saved on this phone and backed up automatically to Google Drive whenever JobCam is open with signal.';
  const q=(await store.allQueue().catch(()=>[])).filter(x=>x.kind==='media').length,last=await store.getState('lastBackupAt').catch(()=>null),who=ls.get(LS_HINT);
  const on=connected();
  $d('#driveConnect').hidden=on;$d('#driveSyncNow').hidden=!on;$d('#driveDisconnect').hidden=!on;$d('#driveReconnect').hidden=!(on&&authPaused);
  status.className=on&&authPaused?'paused':'';
  status.textContent=!on?'Off. Connect once on this phone, signed in as the JobCam / Johnny Google account. Photos then back up automatically to a “'+FOLDER_NAME+'” folder.':
    (authPaused?'Backup paused: Google sign-in needs a tap.\n':(syncing?'Backing up…\n':'Automatic backup on.\n'))+
    (who?'Account: '+who+'\n':'')+'Last backup: '+(last?fmt(last):'not yet')+' · Waiting: '+q+(q===1?' photo':' photos')+(navigator.onLine?'':' (offline)')+(lastError?'\n'+lastError:'');
}
async function interactiveConnect(){
  if(iosStandalone){redirectToGoogle(false);return}
  const t=await gisToken(connected()?'':'consent').catch(()=>null);
  if(!t){if(!connected())toast?.('Google sign-in was cancelled or blocked.');renderStatus();return}
}
async function afterConnect(){
  try{const u=await drive.about();if(u.emailAddress)ls.set(LS_HINT,u.emailAddress);await ensureFolder(store,drive)}catch(e){lastError=String(e.message||e).slice(0,120)}
  renderStatus();scheduleSync('connect',200);
}
$d('#driveConnect').onclick=async()=>{await interactiveConnect();if(readToken())await afterConnect()};
$d('#driveReconnect').onclick=async()=>{await interactiveConnect();if(readToken()){authPaused=false;renderStatus();scheduleSync('reconnect',200)}};
$d('#driveSyncNow').onclick=async()=>{if(!readToken()){await interactiveConnect();if(!readToken())return;authPaused=false}sync('manual')};
$d('#driveDisconnect').onclick=async()=>{if(!confirm('Stop automatic Drive backup on this phone? Files already in Drive are kept.'))return;ls.del(LS_TOKEN);ls.del(LS_CONNECTED);authPaused=false;renderStatus()};
$d('#driveRestore').onclick=async()=>{
  const btn=$d('#driveRestore');
  if(!readToken()){
    if(iosStandalone){ls.set('jobcam-drive-restore-after','1');redirectToGoogle(false);return}
    await gisToken(connected()?'':'consent').catch(()=>null);if(!readToken())return;
  }
  if(!confirm('Restore jobs and photos from Google Drive onto this phone? Nothing already on this phone is deleted.'))return;
  btn.disabled=true;$d('#driveStatus').textContent='Restoring from Drive… keep JobCam open.';
  try{
    const u=await drive.about().catch(()=>({}));if(u.emailAddress)ls.set(LS_HINT,u.emailAddress);
    const r=await restoreFromDrive({store,drive});
    let incoming=r.projects;
    try{if(typeof validateBackup==='function')incoming=validateBackup({format:'johnny-jobcam',version:2,exportedAt:new Date().toISOString(),projects:r.projects})}catch(e){throw Error('Backup data did not pass checks: '+e.message)}
    const merged=allProjects().map(p=>({...p,photos:[...(p.photos||[])],logs:[...(p.logs||[])]}));
    let added=0;
    for(const p of incoming){const old=merged.find(x=>x.id===p.id);if(!old){merged.push(p);added+=p.photos.length;continue}const ids=new Set(old.photos.map(x=>x.id)),lids=new Set((old.logs||[]).map(l=>l.id));const np=p.photos.filter(x=>!ids.has(x.id));old.photos.push(...np);added+=np.length;old.logs.push(...(p.logs||[]).filter(l=>!lids.has(l.id)))}
    await persist(merged);projects=merged;
    for(const f of r.files)await store.putFile(f);
    ls.set(LS_CONNECTED,'1');authPaused=false;
    try{$('#settingsDialog')?.close();window.render()}catch{}
    toast?.('Restored '+incoming.length+' jobs ('+added+' photos added).'+(r.missing?' '+r.missing+' files were missing in Drive.':''));
  }catch(e){toast?.('Restore failed: '+e.message);lastError=String(e.message||e).slice(0,120)}
  finally{btn.disabled=false;renderStatus();scheduleSync('restore',500)}
};

// ---------- Hooks: every save queues a backup ----------
if(enabled&&typeof persist==='function'){
  const basePersist=persist;
  persist=async function(list){const r=await basePersist(list);if(connected()&&!cloudActive())scheduleSync('save',800);return r};
}
if(enabled){
  addEventListener('online',()=>scheduleSync('online',500));
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'){hiddenAt=Date.now()}else scheduleSync(Date.now()-hiddenAt>5*60*1000&&hiddenAt?'resume':'visible',800)});
  setInterval(()=>{if(document.visibilityState==='visible')scheduleSync('timer',0)},60000);
}
// Start once the notebook is loaded.
(function waitReady(n=0){
  if(root.jobcamReady===true||n>600){renderStatus();if(enabled&&connected()){if(ls.get('jobcam-drive-restore-after')==='1'&&readToken()){ls.del('jobcam-drive-restore-after');$d('#driveRestore').click()}else if(readToken()&&!ls.get(LS_HINT))afterConnect();else scheduleSync('startup',1500)}return}
  setTimeout(()=>waitReady(n+1),100);
})();
root.JobCamDriveBackup={sync,renderStatus,enabled,status:async()=>({enabled,connected:connected(),paused:authPaused,queue:(await store.allQueue()).length,lastBackupAt:await store.getState('lastBackupAt')})};
})(typeof window!=='undefined'?window:globalThis);
