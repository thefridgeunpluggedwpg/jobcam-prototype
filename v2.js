/* Johnny Jobs v2: additive features. Local original photos and v1 records are preserved. */
'use strict';
const V2='2.0.0';
const localPersist=persist,localLoad=loadAll,baseJobs=renderJobs,baseDetail=renderDetail,baseEstimate=renderEstimate,baseCard=photoCard,baseOpenPhoto=openPhoto,baseOpenUpload=openUpload,baseProcess=processPhoto;
let preferLocal=false;
let store,cloudStore=null,cloudProfile=null,uploadGPS=null,photoSelection=null,annotation=null,comparePair={},portfolioList=[],portfolioIndex=0,cloudRefreshTimer,refreshBusy=false;
const baseStorageError=storageError;storageError=function(err){if(cloudStore){toast(err.message||'Crew save failed. Keep this page open and retry.');cloudStatus('Save failed: '+err.message);return}baseStorageError(err)};
const cleanTags=value=>[...new Set(String(value||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean))].slice(0,20).map(t=>t.slice(0,50));
const validImage=s=>typeof s==='string'&&s.length<=15000000&&/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(s);
const validGPS=g=>g&&Number.isFinite(g.lat)&&Math.abs(g.lat)<=90&&Number.isFinite(g.lng)&&Math.abs(g.lng)<=180&&Number.isFinite(g.accuracy)&&g.accuracy>=0&&Number.isFinite(Date.parse(g.at));
const displayGPS=g=>g.lat.toFixed(5)+', '+g.lng.toFixed(5)+' · ±'+Math.round(g.accuracy)+' m';
const mapURL=g=>'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(g.lat+','+g.lng);
const safeFile=s=>String(s).replace(/[^a-z0-9-]+/gi,'-').slice(0,70)||'job';
function downloadFile(body,type,name){const url=URL.createObjectURL(new Blob([body],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000)}
function addDialog(id,label,body){const d=document.createElement('dialog');d.id=id;d.setAttribute('aria-labelledby',id+'Heading');d.innerHTML='<div class="dialog-heading"><h2 id="'+id+'Heading">'+label+'</h2><button class="icon-btn" data-close="'+id+'" aria-label="Close">×</button></div>'+body;document.body.append(d);return d}
const style=document.createElement('style');style.textContent=`
.v2-tools{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:18px 0}.v2-tools button{font-size:13px;padding:11px 9px}.gps-line{display:block;font-size:11px;margin-top:8px;color:var(--green);overflow-wrap:anywhere}.gps-line a{display:inline-flex;min-height:44px;align-items:center;color:var(--green)}.metadata-tools{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0}.metadata-tools button{font-size:13px}.check-label{display:flex;align-items:center;gap:10px;min-height:46px;font-size:13px}.check-label input{width:22px;min-height:22px;height:22px;flex:none;accent-color:var(--wood)}.v2-status{font-size:12px;color:var(--muted);margin:10px 0;line-height:1.7}.daily-entry{border:1px solid var(--line);background:var(--panel);border-radius:12px;padding:15px;margin-top:12px}.daily-entry p{font-size:13px;white-space:pre-wrap;overflow-wrap:anywhere;margin-top:9px}.daily-entry h3{font-size:14px}.report-controls{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px}.report-controls label{font-size:12px}.report-controls input{margin-top:6px}.viewer-actions{display:flex;gap:10px;justify-content:center;flex-wrap:wrap}.viewer-actions button{min-height:46px;font-size:13px}.viewer-actions a{color:var(--green);padding:10px}#viewer .viewer-stage{height:calc(100% - 235px);min-height:150px}#viewer .viewer-caption{white-space:pre-wrap;margin:10px auto;max-width:650px}#annotationDialog{max-width:950px}#annotationCanvas{display:block;width:100%;height:auto;touch-action:none;border:1px solid var(--line);border-radius:10px;background:var(--panel)}.mark-tools{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;align-items:center}.mark-tools button{padding:9px 14px}.mark-tools button[aria-pressed=true]{background:var(--wood);color:var(--bg)}.mark-tools label{font-size:12px}.mark-tools input[type=color]{width:48px;height:46px;padding:4px}.mark-tools select{width:85px}.text-position{display:grid;grid-template-columns:1fr 1fr;gap:10px}.text-position label{font-size:12px}.text-position input{margin-top:5px}#textPlacement{margin:14px 0}.select-pair{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px}.select-pair label{font-size:12px}.select-pair select{font-size:14px;margin-top:5px}.side-compare{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px}.side-compare figure{margin:0;min-width:0}.side-compare img{width:100%;aspect-ratio:1.2;object-fit:contain;background:var(--panel);border-radius:10px}.side-compare figcaption{text-align:center;font-size:12px}.gallery-select{display:flex;gap:12px;align-items:center;padding:10px 0;border-bottom:1px solid var(--line)}.gallery-select input{width:22px;height:22px;min-height:22px;flex:none}.gallery-select img{width:70px;height:60px;object-fit:cover;border-radius:7px}.gallery-select span{font-size:12px;overflow-wrap:anywhere}.portfolio-open{margin:10px 0 20px}#portfolioDialog{width:100vw;height:100dvh;max-width:none;max-height:100dvh;border:0;border-radius:0;padding:20px;background:var(--bg)}.portfolio-frame{max-width:1100px;margin:auto}.portfolio-frame img{width:100%;height:52dvh;object-fit:contain;background:#101512;border-radius:14px}.portfolio-frame h2{margin-top:15px;font-size:28px}.portfolio-frame p{margin-top:10px;max-width:70ch;white-space:pre-wrap;overflow-wrap:anywhere}.portfolio-frame .toolbar{margin-bottom:15px}.portfolio-navigation{display:grid;grid-template-columns:1fr auto 1fr;gap:12px;align-items:center;margin:18px 0}.portfolio-navigation span{font-size:12px;color:var(--muted)}.version-label{display:block;text-align:center;color:var(--muted);font-size:12px;margin-top:20px}details.cloud-setup{border:1px solid var(--line);padding:12px;border-radius:12px;margin:18px 0}details.cloud-setup summary{min-height:44px;cursor:pointer;font-weight:600}#cloudStatus{white-space:pre-wrap;overflow-wrap:anywhere}#cloudConfig input{font-size:16px}button:active{filter:brightness(.9)}@media(max-width:360px){.container{padding-left:16px;padding-right:16px}.v2-tools{grid-template-columns:1fr}}@media(min-width:700px){.portfolio-frame img{height:60dvh}}
.danger{background:#7e0a1d;color:#fff;border:2px solid #ff5c74;border-bottom-width:4px;border-radius:10px;font-family:"Barlow Condensed",sans-serif;font-weight:700;font-size:18px;letter-spacing:.8px;text-transform:uppercase;padding:13px 18px;min-height:52px;display:inline-flex;align-items:center;justify-content:center;gap:8px}.danger:active{transform:translateY(2px);border-bottom-width:2px}.danger-outline{background:transparent;color:#ff8a9a;border:2px solid #c8102e;border-radius:10px;font-weight:700;padding:11px 16px;display:inline-flex;align-items:center;justify-content:center;gap:6px}.photo-meta .photo-delete{width:100%;min-height:44px;margin-top:7px;font-size:13px;padding:6px 8px}.delete-preview{display:block;width:100%;max-height:220px;object-fit:contain;border-radius:10px;background:#000;margin:4px 0 12px}#deletePhotoText{font-size:16px;color:var(--ink)}.detail-problem{border-left-color:var(--red)!important;color:var(--ink)!important;font-size:14px!important}.app-problem{position:fixed;left:12px;right:12px;bottom:calc(92px + env(safe-area-inset-bottom));z-index:9000;display:flex;gap:10px;align-items:center;background:#3a0d14;color:#fff;border:2px solid #ff5c74;border-radius:12px;padding:10px 12px;font-size:14px;box-shadow:0 8px 30px #0009}.app-problem[hidden]{display:none}.app-problem span{flex:1}.app-problem button{min-height:40px;width:40px;border-radius:10px;background:transparent;color:#fff;border:1px solid #fff6;font-size:20px}.photo-meta .photo-date{width:100%;min-height:44px;margin-top:7px;font-size:13px;padding:6px 8px}.time-pick{border:2px solid var(--line);border-radius:12px;padding:10px 12px;margin:12px 0;background:var(--panel)}.time-pick>strong{display:block;font:700 15px 'Barlow Condensed',sans-serif;text-transform:uppercase;letter-spacing:.8px;margin-bottom:6px}.time-seg{display:flex;gap:6px;flex-wrap:wrap}.time-seg button{flex:1 1 0;min-height:46px;padding:6px 8px;font-size:14px;border:2px solid #6b5848;background:var(--panel2);border-radius:10px;font-weight:700;color:var(--ink)}.time-seg button[aria-pressed=true]{background:var(--red);border-color:#fff;color:#fff}.time-pick input{margin-top:8px}.date-edit-preview{display:block;width:100%;max-height:200px;object-fit:contain;border-radius:10px;background:#000;margin:4px 0 12px}#dateEditForm input{font-size:18px;min-height:52px}.delete-actions{display:grid;gap:10px;margin-top:16px}.delete-actions button{min-height:54px;font-size:18px}
/* v2.7.4 full-bleed swipeable job photo viewer */
html.viewer-open,html.viewer-open body{overflow:hidden;overscroll-behavior:none;width:100%;height:100%;height:100dvh}
#viewer{overflow:hidden!important;overscroll-behavior:none;touch-action:none;position:fixed;width:100%;width:100dvw;max-width:none!important;height:100%;height:100dvh;max-height:none!important;margin:0;border:0!important;border-radius:0;border-top:0!important;padding:0!important;background:#090e0b!important;inset:auto auto auto auto}
#viewer .toolbar{position:absolute;top:0;left:0;right:0;z-index:4;display:flex;margin:0;gap:8px;align-items:center;box-sizing:border-box;padding:calc(6px + env(safe-area-inset-top,0px)) calc(8px + env(safe-area-inset-right,0px)) 16px calc(8px + env(safe-area-inset-left,0px));background:linear-gradient(180deg,#090e0bf0 0%,#090e0ba8 55%,transparent);color:#f4eee4;pointer-events:none}
#viewer .toolbar > *{pointer-events:auto}
#viewer .toolbar #viewerTitle{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#f4eee4;font-size:15px}
#viewer .viewer-counter{flex:1;text-align:center;font-size:13px;color:#c9d4cc;font-variant-numeric:tabular-nums;white-space:nowrap}
#viewer .toolbar .icon-btn{width:48px;min-width:48px;min-height:48px;flex:none;z-index:3;color:#f4eee4;border-color:#ffffff44;background:#00000066}
#viewer .viewer-stage{display:block!important;position:absolute;inset:0;width:100%;height:100%!important;min-height:0;touch-action:none;overscroll-behavior:none;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;-webkit-tap-highlight-color:transparent}
#viewer .viewer-frame{display:flex;width:300%;min-width:300%;max-width:none;height:100%;margin:0;padding:0;border:0;transform:translate3d(-33.333%,0,0);will-change:transform}
#viewer .viewer-frame.is-animating{transition:transform 240ms ease-out}
@media (prefers-reduced-motion:reduce){#viewer .viewer-frame.is-animating{transition:none}}
#viewer .viewer-frame>*{box-sizing:border-box;flex:0 0 33.333%;width:33.333%;min-width:0;max-width:33.333%;height:100%;margin:0;padding:0;display:flex;align-items:center;justify-content:center;overflow:hidden;pointer-events:none}
#viewer .viewer-peek,#viewer .viewer-current img,#viewer #viewerImage{max-width:100%;max-height:100%;object-fit:contain;-webkit-user-drag:none;pointer-events:none}
#viewer .viewer-peek.is-empty{visibility:hidden}
#viewer .viewer-current{touch-action:none;width:100%;height:100%}
#viewer .viewer-nav{position:absolute;top:50%;transform:translateY(-50%);z-index:2;width:36px;min-width:36px;min-height:36px;height:36px;padding:0;border-radius:50%;background:#000000b3;border:1px solid #ffffff55;color:#fff;display:grid;place-items:center}
#viewer .viewer-nav-prev{left:calc(6px + env(safe-area-inset-left,0px))}
#viewer .viewer-nav-next{right:calc(6px + env(safe-area-inset-right,0px))}
#viewer .viewer-nav:disabled{opacity:.35}
#viewer.is-touch .viewer-nav{display:none}
#viewer .viewer-bottom{position:absolute;left:0;right:0;bottom:0;z-index:4;display:flex;flex-direction:column;gap:4px;box-sizing:border-box;padding:14px calc(8px + env(safe-area-inset-right,0px)) calc(8px + env(safe-area-inset-bottom,0px)) calc(8px + env(safe-area-inset-left,0px));background:linear-gradient(0deg,#090e0bf5 0%,#090e0bd8 62%,transparent);pointer-events:none}
#viewer .viewer-bottom > *{pointer-events:auto}
#viewer .viewer-caption{margin:0 auto;max-width:100%;padding:0 4px;font-size:11px;line-height:1.3;color:#c9d4cc;text-align:center;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;white-space:pre-wrap}
#viewer .viewer-actions{display:flex;flex-wrap:nowrap;justify-content:space-around;align-items:stretch;gap:2px;margin:0}
#viewer .viewer-tool{flex:1 1 0;min-width:0;min-height:52px;padding:4px 2px 5px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;background:transparent;border:0;border-radius:10px;color:#f4eee4;font-family:"Barlow Condensed",sans-serif;font-weight:700;font-size:11px;letter-spacing:.5px;text-transform:uppercase;-webkit-tap-highlight-color:transparent;-webkit-user-select:none;user-select:none}
#viewer .viewer-tool svg{width:20px;height:20px;stroke:currentColor;fill:none;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
#viewer .viewer-tool-danger{color:#ff8a9a}
#viewer .viewer-tool[hidden]{display:none!important}
#viewer .viewer-reveal{display:none;position:absolute;left:50%;bottom:calc(10px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:5;width:52px;min-width:52px;min-height:36px;height:36px;padding:0;border-radius:20px;background:#000000c4;border:1px solid #ffffff55;color:#fff;place-items:center;-webkit-tap-highlight-color:transparent}
#viewer .viewer-reveal svg{width:20px;height:20px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
#viewer.is-chrome-hidden .toolbar,#viewer.is-chrome-hidden .viewer-bottom,#viewer.is-chrome-hidden .viewer-nav{opacity:0;visibility:hidden;pointer-events:none;transition:opacity 160ms ease,visibility 160ms ease}
#viewer.is-chrome-hidden .toolbar *,#viewer.is-chrome-hidden .viewer-bottom *,#viewer.is-chrome-hidden .viewer-nav{pointer-events:none!important}
#viewer.is-chrome-hidden .viewer-reveal{display:grid;visibility:visible;pointer-events:auto}
#viewer.is-chrome-hidden .viewer-reveal[hidden]{display:none}
@media (prefers-reduced-motion:reduce){#viewer.is-chrome-hidden .toolbar,#viewer.is-chrome-hidden .viewer-bottom,#viewer.is-chrome-hidden .viewer-nav{transition:none}}

`;document.head.append(style);
// Small storage boundary: same shape for browser-local and shared crew data.
// Job records are normalised on load so an odd or older record (missing photos/tags, number id, cloud row without local fields) can never stop a job from opening.
function normalizeJob(p){if(!p||typeof p!=='object')return null;const str=v=>v==null?'':String(v);const photos=(Array.isArray(p.photos)?p.photos:[]).filter(ph=>ph&&typeof ph==='object'&&ph.id!=null).map(ph=>typeof ph.id==='string'&&PHASES.includes(ph.phase)?ph:{...ph,id:String(ph.id),phase:PHASES.includes(ph.phase)?ph.phase:'During'});const out={...p,id:str(p.id),name:str(p.name)||'Untitled job',category:str(p.category)||'Decks',area:str(p.area),note:str(p.note),date:/^\d{4}-\d{2}-\d{2}$/.test(p.date||'')?p.date:(typeof p.date==='string'&&p.date.length>=10&&/^\d{4}-\d{2}-\d{2}/.test(p.date)?p.date.slice(0,10):dayKey()),tags:(Array.isArray(p.tags)?p.tags:[]).filter(t=>typeof t==='string'),photos,logs:Array.isArray(p.logs)?p.logs:[]};return out}
const normalizeAll=list=>(Array.isArray(list)?list:[]).map(normalizeJob).filter(p=>p&&p.id);
window.jobcamNormalizeJob=normalizeJob;
loadAll=async()=>normalizeAll(await(store?store.list():localLoad()));
persist=async list=>store?store.save(list):localPersist(list);
filtered=function(){return projects.filter(p=>{const allTags=[...p.tags,...p.photos.flatMap(ph=>ph.tags||[])];return(!category||p.category===category)&&(!tag||allTags.includes(tag))&&(!query||[p.name,p.area,p.note,...allTags,...p.photos.flatMap(ph=>[ph.caption||'',ph.uploader||''])].join(' ').toLowerCase().includes(query.toLowerCase()))})};
renderTags=function(){const tags=[...new Set(projects.flatMap(p=>[...p.tags,...p.photos.flatMap(ph=>ph.tags||[])]))].sort();$('#tags').innerHTML='<button class="chip '+(!tag?'active':'')+'" data-tag="">All tags</button>'+tags.map(t=>'<button class="chip '+(tag===t?'active':'')+'" data-tag="'+esc(t)+'">'+esc(t)+'</button>').join('')};
photoCard=function(p,ph,editable){let html=baseCard(p,ph,editable);const gps=validGPS(ph.gps)?'<span class="gps-line">Device at upload · '+esc(displayGPS(ph.gps))+'<br><a href="'+mapURL(ph.gps)+'" target="_blank" rel="noopener noreferrer">View map</a></span>':'';return html.replace('</div></article>','<span class="gps-line">Added '+esc(timeLabel(ph.addedAt))+'</span>'+gps+(ph.caption?'<p>'+esc(ph.caption)+'</p>':'')+(ph.tags||[]).map(t=>'<span class="tag">'+esc(t)+'</span>').join('')+(ph.annotatedData?'<span class="gps-line">Marked-up copy · original kept</span>':'')+(editable&&canDeletePhoto(ph)?'<button class="secondary photo-date" type="button" data-edit-date="'+esc(ph.id)+'" data-owner="'+esc(p.id)+'" aria-label="Edit the date on this '+esc(ph.phase)+' photo">Edit date</button>':'')+(editable&&canDeletePhoto(ph)?'<button class="danger-outline photo-delete" type="button" data-delete-photo="'+esc(ph.id)+'" data-owner="'+esc(p.id)+'" aria-label="Delete this '+esc(ph.phase)+' photo">Delete photo</button>':'')+'</div></article>')};
renderJobs=function(){baseJobs();if(cloudProfile?.role==='sub')$('#newJob').hidden=true};
function detailProblem(msg){let el=$('#detailProblem');if(!el){el=document.createElement('p');el.id='detailProblem';el.className='notice detail-problem';el.setAttribute('role','alert');const anchor=$('#main .detail-title')||$('#main .toolbar');if(anchor)anchor.after(el);else $('#main').prepend(el)}el.textContent=msg}
function safeDetailFallback(p,err){console.error('JobCam: job details failed',err);$('#main').innerHTML='<div class="toolbar"><button class="back" id="backToJobs">← All jobs</button><button class="primary" id="addPhotos">+ Photos</button></div><div class="detail-title"><h1>'+esc(p?.name||'Job')+'</h1><div class="facts"><span>'+esc(p?.category||'')+(p?.area?' · '+esc(p.area):'')+'</span></div></div><p class="notice detail-problem" role="alert">Part of this job couldn’t be shown ('+esc(err?.message||err)+'). Your job and photos are still saved. Send Kyler a screenshot of this message.</p><div class="photo-grid">'+(p?.photos||[]).map(ph=>'<article class="photo-card"><button class="photo-open" data-photo="'+esc(ph.id)+'" data-owner="'+esc(p.id)+'"><img src="'+(ph.annotatedData||ph.data||'')+'" alt="" loading="lazy"></button><div class="photo-meta"><strong>'+esc(ph.uploader||'')+'</strong><span>'+esc(ph.stamp||'')+'</span></div></article>').join('')+'</div>';$('#backToJobs').onclick=()=>{current=null;render();window.scrollTo(0,0)};$('#addPhotos').onclick=()=>{try{openUpload()}catch(e){toast('Couldn’t open Add photos: '+e.message)}}}
renderDetail=function(){const raw=getCurrent();if(raw){const fixed=normalizeJob(raw);if(stable2(fixed)!==stable2(raw)){const i=projects.indexOf(raw);if(i>=0)projects[i]=fixed}}try{baseDetail()}catch(err){safeDetailFallback(getCurrent(),err);return}try{v2DetailExtras()}catch(err){console.error('JobCam: job tools failed',err);detailProblem('Some job tools didn’t load ('+(err.message||err)+'). The job and its photos are fine.')}};
const stable2=v=>{try{return JSON.stringify([v.id,v.name,v.category,v.area,v.note,v.date,Array.isArray(v.tags),Array.isArray(v.photos),Array.isArray(v.logs),typeof v.id])}catch{return ''}};
function v2DetailExtras(){const p=getCurrent();if(!p)return;const tools=document.createElement('div');tools.className='v2-tools';tools.innerHTML='<button class="secondary" id="dailyLogButton">Daily log & report</button><button class="secondary" id="clientGalleryButton">Client gallery</button>';$('#editJob').after(tools);if(cloudProfile?.role==='sub'){$('#editJob').hidden=true;for(const select of document.querySelectorAll('[data-phase]')){const ph=p.photos.find(ph=>ph.id===select.dataset.phase);select.disabled=ph?.cloudUserId!==cloudProfile.id}}$('#dailyLogButton').onclick=openDailyLog;$('#clientGalleryButton').onclick=openClientGallery;const before=p.photos.filter(ph=>ph.phase==='Before'),after=p.photos.filter(ph=>ph.phase==='After');if(before.length&&after.length){const box=$('.compare'),controls=document.createElement('div');controls.innerHTML='<div class="select-pair"><label>Before<select id="beforeChoice">'+before.map((ph,i)=>'<option value="'+esc(ph.id)+'">'+(i+1)+'. '+esc(ph.name)+'</option>').join('')+'</select></label><label>After<select id="afterChoice">'+after.map((ph,i)=>'<option value="'+esc(ph.id)+'">'+(i+1)+'. '+esc(ph.name)+'</option>').join('')+'</select></label></div><label class="check-label"><input type="checkbox" id="sideBySide"> Side-by-side view</label><div id="sideCompare" class="side-compare" hidden></div>';box.before(controls);const pair=comparePair[p.id]||{};if(before.some(ph=>ph.id===pair.before))$('#beforeChoice').value=pair.before;if(after.some(ph=>ph.id===pair.after))$('#afterChoice').value=pair.after;function showPair(){const b=before.find(ph=>ph.id===$('#beforeChoice').value),a=after.find(ph=>ph.id===$('#afterChoice').value);comparePair[p.id]={before:b.id,after:a.id};box.querySelector(':scope > img').src=photoData(a);$('#compareOver img').src=photoData(b);$('#sideCompare').innerHTML='<figure><img src="'+photoData(b)+'" alt="Before"><figcaption>Before</figcaption></figure><figure><img src="'+photoData(a)+'" alt="After"><figcaption>After</figcaption></figure>'}$('#beforeChoice').onchange=showPair;$('#afterChoice').onchange=showPair;$('#sideBySide').onchange=e=>{box.hidden=e.target.checked;$('#sideCompare').hidden=!e.target.checked};showPair()}}
renderEstimate=function(){baseEstimate();const p=document.createElement('div');p.innerHTML='<div class="search"><input type="search" id="portfolioSearch" placeholder="Find cedar, privacy, railings…" aria-label="Search jobs and photo tags"></div><div class="chips" id="tags"></div><button id="openPortfolio" class="primary wide portfolio-open">Show client portfolio</button>';$('.estimate-categories').after(p);$('#portfolioSearch').value=query;renderTags();$('#portfolioSearch').oninput=e=>{query=e.target.value;const grid=$('#main .project-grid');grid.innerHTML=filtered().map(card).join('')||'<div class="empty">No matching jobs. Try another tag or search.</div>'};$('#openPortfolio').onclick=openPortfolio};
// Existing delegated tag click updates the correct estimate result without leaving the search field.
const oldRenderResults=renderResults;renderResults=function(){if(view==='estimate'&&!current){$('#main .project-grid').innerHTML=filtered().map(card).join('')||'<div class="empty">No matching jobs. Try another filter.</div>';return}oldRenderResults()};
openUpload=function(){uploadGPS=null;baseOpenUpload();$('#uploaderName').readOnly=!!cloudProfile;if(cloudProfile)$('#uploaderName').value=cloudProfile.display_name;$('#gpsStatus').textContent='Optional. GPS records this device now, not where an older library photo was taken.';$('#gpsButton').disabled=false};
processPhoto=async function(file){skipStamp=true;let ph;try{ph=await baseProcess(file)}finally{skipStamp=false}rawPending.set(ph.id,{data:ph.data,stamp:ph.stamp,takenAt:ph.takenAt});return {...ph,...pendingTime(ph.id),gps:uploadGPS?{...uploadGPS}:null,tags:[]}};
const gpsArea=document.createElement('div');gpsArea.innerHTML='<button class="secondary wide" id="gpsButton">Attach current device GPS</button><p class="v2-status" id="gpsStatus" role="status"></p>';$('#pendingPhotos').before(gpsArea);
$('#gpsButton').onclick=async()=>{const b=$('#gpsButton');if(!navigator.geolocation||!isSecureContext){$('#gpsStatus').textContent='GPS unavailable here. Photos can still be saved without it. Use HTTPS or localhost.';return}b.disabled=true;$('#gpsStatus').textContent='Finding location… You can deny permission and still save photos.';try{const pos=await new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:true,timeout:10000,maximumAge:0}));uploadGPS={lat:pos.coords.latitude,lng:pos.coords.longitude,accuracy:pos.coords.accuracy,at:new Date(pos.timestamp||Date.now()).toISOString(),source:'Device at upload'};pending.forEach(ph=>ph.gps={...uploadGPS});$('#gpsStatus').textContent='Attached to this batch: '+displayGPS(uploadGPS)+' · device at upload, not historical photo location.'}catch(err){uploadGPS=null;pending.forEach(ph=>ph.gps=null);$('#gpsStatus').textContent=(err.code===1?'Location denied.':err.code===3?'Location timed out.':'Location unavailable.')+' Photos will save without GPS.'}finally{b.disabled=false}};
// Viewer tools: original image remains in ph.data; marked-up result is a separate field.
function viewerToolLabel(btn,text){if(!btn)return '';if(text!=null){btn.dataset.label=text;const lab=btn.querySelector('[data-tool-label]');if(lab)lab.textContent=text;else btn.textContent=text;return text}return btn.dataset.label||btn.querySelector('[data-tool-label]')?.textContent||(btn.textContent||'').trim()}
const toolSvg=n=>'<svg viewBox="0 0 24 24" aria-hidden="true">'+n+'</svg>';
const viewerActions=document.createElement('div');viewerActions.className='viewer-actions';viewerActions.innerHTML='<button class="viewer-tool" id="annotateButton" type="button">'+toolSvg('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>')+'<span data-tool-label>Mark up</span></button><button class="viewer-tool" id="photoTagsButton" type="button">'+toolSvg('<path d="M20.6 13.4 12.8 5.6A2 2 0 0 0 11.4 5H5v6.4a2 2 0 0 0 .6 1.4l7.8 7.8a2 2 0 0 0 2.8 0l4.4-4.4a2 2 0 0 0 0-2.8Z"/><circle cx="8.5" cy="8.5" r="1.2"/>')+'<span data-tool-label>Tags</span></button><button class="viewer-tool" id="originalButton" type="button">'+toolSvg('<rect x="3" y="5" width="14" height="14" rx="2"/><path d="M9 9h12v12H9"/>')+'<span data-tool-label>Original</span></button><button class="viewer-tool" id="editDateButton" type="button">'+toolSvg('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>')+'<span data-tool-label>Date</span></button><button class="viewer-tool viewer-tool-danger" id="deletePhotoButton" type="button">'+toolSvg('<path d="M4 7h16M9 7V5h6v2m-8 0v12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V7"/>')+'<span data-tool-label>Delete</span></button>';
$('#viewerCaption').after(viewerActions);
openPhoto=function(owner,id){openJobViewer(owner,id)};
/* v2.7.4: swipeable full-screen viewer for every photo on the job, in grid order. */
(function(){
  const viewer=$('#viewer'), stage=viewer&&viewer.querySelector('.viewer-stage'), img=$('#viewerImage');
  if(!viewer||!stage||!img||viewer.dataset.galleryReady)return;
  viewer.dataset.galleryReady='1';
  stage.id='viewerStage';
  const toolbar=viewer.querySelector('.toolbar');
  const counter=document.createElement('span');
  counter.id='viewerCounter';counter.className='viewer-counter';counter.setAttribute('aria-live','polite');
  if(toolbar){const closeBtn=toolbar.querySelector('[data-close]');if(closeBtn)toolbar.insertBefore(counter,closeBtn);else toolbar.append(counter)}
  const frame=document.createElement('div');frame.id='viewerFrame';frame.className='viewer-frame';
  const peekPrev=document.createElement('img');peekPrev.id='viewerPeekPrev';peekPrev.className='viewer-peek';peekPrev.alt='';
  const current=document.createElement('div');current.id='viewerCurrent';current.className='viewer-current';
  const peekNext=document.createElement('img');peekNext.id='viewerPeekNext';peekNext.className='viewer-peek';peekNext.alt='';
  img.replaceWith(frame);current.append(img);frame.append(peekPrev,current,peekNext);
  const chevron=dir=>'<svg viewBox="0 0 24 24" aria-hidden="true">'+(dir==='prev'?'<path d="M15 5 8 12l7 7"/>':'<path d="M9 5l7 7-7 7"/>')+'</svg>';
  const prevBtn=document.createElement('button');prevBtn.type='button';prevBtn.id='viewerPrev';prevBtn.className='viewer-nav viewer-nav-prev';prevBtn.setAttribute('aria-label','Previous photo');prevBtn.innerHTML=chevron('prev');
  const nextBtn=document.createElement('button');nextBtn.type='button';nextBtn.id='viewerNext';nextBtn.className='viewer-nav viewer-nav-next';nextBtn.setAttribute('aria-label','Next photo');nextBtn.innerHTML=chevron('next');
  stage.append(prevBtn,nextBtn);
  const bottom=document.createElement('div');
  bottom.id='viewerBottom';
  bottom.className='viewer-bottom';
  const cap=$('#viewerCaption');
  if(cap){cap.replaceWith(bottom);bottom.append(cap)}else viewer.append(bottom);
  if(viewerActions){if(viewerActions.parentNode&&viewerActions.parentNode!==bottom)viewerActions.remove();bottom.append(viewerActions)}
  const reveal=document.createElement('button');
  reveal.type='button';
  reveal.id='viewerReveal';
  reveal.className='viewer-reveal';
  reveal.setAttribute('aria-label','Show photo options');
  reveal.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 14l6-6 6 6"/></svg>';
  viewer.append(reveal);
  let chromeOn=true, tapTimer=null;
  function setChrome(on){
    chromeOn=!!on;
    viewer.classList.toggle('is-chrome-hidden',!chromeOn);
    reveal.hidden=chromeOn;
    reveal.setAttribute('aria-expanded',chromeOn?'true':'false');
  }
  function toggleChrome(){setChrome(!chromeOn)}
  function cancelTap(){if(tapTimer){clearTimeout(tapTimer);tapTimer=null}}
  reveal.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();cancelTap();setChrome(true)});
  setChrome(true);
  viewer.classList.toggle('is-touch',('ontouchstart' in window)||((navigator.maxTouchPoints||0)>0));
  function unlockOrientation(){try{screen.orientation&&screen.orientation.unlock&&screen.orientation.unlock()}catch{}}
  function onViewport(){
    if(!viewer.open){
      viewer.style.width=viewer.style.height=viewer.style.top=viewer.style.left='';
      return;
    }
    unlockOrientation();
    const vv=window.visualViewport;
    if(vv){
      viewer.style.width=vv.width+'px';
      viewer.style.height=vv.height+'px';
      viewer.style.left=(vv.offsetLeft||0)+'px';
      viewer.style.top=(vv.offsetTop||0)+'px';
    }else{
      viewer.style.width='';
      viewer.style.height='';
      viewer.style.left='';
      viewer.style.top='';
    }
    applyZoom();
    if(!animating)resetFrame(false);
  }
  window.addEventListener('resize',onViewport);
  window.addEventListener('orientationchange',()=>{unlockOrientation();setTimeout(onViewport,60);setTimeout(onViewport,300)});
  if(window.visualViewport)visualViewport.addEventListener('resize',onViewport);
  unlockOrientation();


  let list=[], index=0, owner=null, scale=1, panX=0, panY=0, animating=false, scrollLockY=0;
  const pointers=new Map();
  let gesture=null, startX=0, startY=0, startT=0, startPanX=0, startPanY=0, startScale=1, startDist=0, startMidX=0, startMidY=0, dragX=0, dragY=0, lastTap=0, lastTapX=0, lastTapY=0;
  const reduce=()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const srcOf=ph=>{if(!ph)return '';try{const s=photoData(ph);return (s&&s!=='undefined')?s:''}catch{return ''}};
  function jobPhotos(p){return p?PHASES.flatMap(phase=>p.photos.filter(x=>x.phase===phase).sort(byShotTime)):[]}
  function lockPage(on){
    const html=document.documentElement, body=document.body;
    if(on){
      scrollLockY=window.scrollY||0;
      html.classList.add('viewer-open');
      body.style.position='fixed';body.style.top='-'+scrollLockY+'px';body.style.left='0';body.style.right='0';body.style.width='100%';
    }else{
      html.classList.remove('viewer-open');
      body.style.position=body.style.top=body.style.left=body.style.right=body.style.width='';
      window.scrollTo(0,scrollLockY);
    }
  }
  function pushViewerHistory(){if(!history.state||!history.state.carpenterViewer)history.pushState({carpenterViewer:true},'')}
  function dropViewerHistory(){if(history.state&&history.state.carpenterViewer)history.back()}
  function setFrame(dx,dy,animate){
    frame.classList.toggle('is-animating',!!animate&&!reduce());
    frame.style.transform='translate3d(calc(-33.333% + '+dx+'px), '+dy+'px, 0)';
  }
  function resetFrame(animate){setFrame(0,0,animate)}
  function applyZoom(){
    if(scale<=1.01){scale=1;panX=0;panY=0}
    img.style.transform=scale===1?'':'translate('+panX+'px,'+panY+'px) scale('+scale+')';
    stage.classList.toggle('is-zoomed',scale>1);
  }
  function resetZoom(){scale=1;panX=0;panY=0;applyZoom()}
  function paint(id){
    const p=projects.find(x=>x.id===owner), ph=p?.photos.find(x=>x.id===id);
    if(!p||!ph)return;
    photoSelection={owner,id};
    const src=srcOf(ph);
    img.src=src||'';
    img.alt=ph.phase+' photo: '+p.name;
    $('#viewerTitle').textContent=ph.phase+(p.demo?' · Demo':'');
    let cap=(ph.stamp||'')+' · '+(ph.uploader||'Unknown uploader')+' · '+(ph.source||'');
    if(ph.gps)cap+='\nDevice at upload: '+displayGPS(ph.gps)+' · '+timeLabel(ph.gps.at);
    if(ph.caption)cap+='\n'+ph.caption;
    if(!src)cap+=(cap?'\n':'')+'Photo is still downloading on this phone.';
    $('#viewerCaption').textContent=cap;
    const canEdit=!cloudProfile||cloudProfile.role!=='sub'||ph.cloudUserId===cloudProfile.id;
    const ab=$('#annotateButton'),tb=$('#photoTagsButton'),ob=$('#originalButton'),db=$('#deletePhotoButton'),eb=$('#editDateButton');
    if(ab)ab.hidden=!canEdit;if(tb)tb.hidden=!canEdit;
    if(ob){ob.hidden=!ph.annotatedData;ob.dataset.mode='photo';viewerToolLabel(ob,'Original')}
    if(db)db.hidden=!canDeletePhoto(ph);if(eb)eb.hidden=!canDeletePhoto(ph);
  }
  function chrome(){
    const n=list.length;
    counter.textContent=n?(index+1)+' / '+n:'';
    prevBtn.hidden=nextBtn.hidden=n<2;
    prevBtn.disabled=index<=0||n<2;
    nextBtn.disabled=index>=n-1||n<2;
    const prev=index>0?list[index-1]:null, next=index<n-1?list[index+1]:null;
    peekPrev.src=prev?srcOf(prev):'';peekPrev.classList.toggle('is-empty',!prev);
    peekNext.src=next?srcOf(next):'';peekNext.classList.toggle('is-empty',!next);
    if(prev){const pre=new Image();pre.src=srcOf(prev)}
    if(next){const pre=new Image();pre.src=srcOf(next)}
  }
  function go(delta,animate){
    const next=index+delta;
    if(next<0||next>=list.length){resetFrame(true);return}
    const apply=()=>{
      animating=false;index=next;cancelTap();resetZoom();paint(list[index].id);chrome();
      frame.classList.remove('is-animating');resetFrame(false);
    };
    if(animate&&!reduce()){
      animating=true;setFrame(delta>0?-stage.clientWidth:stage.clientWidth,0,true);
      let finished=false;
      const done=e=>{
        if(finished||(e&&e.target!==frame))return;
        finished=true;frame.removeEventListener('transitionend',done);apply();
      };
      frame.addEventListener('transitionend',done);
      setTimeout(done,280);
    }else apply();
  }
  window.openJobViewer=function(jobId,photoId){
    owner=jobId;
    const p=projects.find(x=>x.id===jobId);
    list=jobPhotos(p);
    const found=list.findIndex(ph=>ph.id===photoId);
    index=found<0?0:found;
    if(!list.length)return;
    cancelTap();resetZoom();setChrome(true);paint(list[index].id);chrome();resetFrame(false);
    if(!viewer.open){lockPage(true);viewer.showModal();pushViewerHistory();onViewport()}
  };
  prevBtn.onclick=()=>{if(!animating)go(-1,true)};
  nextBtn.onclick=()=>{if(!animating)go(1,true)};
  document.addEventListener('keydown',e=>{
    if(!viewer.open||animating)return;
    if(e.target.closest('input,textarea,select,[contenteditable]'))return;
    if(e.key==='ArrowLeft'){e.preventDefault();go(-1,true)}
    else if(e.key==='ArrowRight'){e.preventDefault();go(1,true)}
    else if(e.key==='Escape'){
      const others=[...document.querySelectorAll('dialog[open]')].filter(d=>d!==viewer);
      if(!others.length&&viewer.open){e.preventDefault();viewer.close()}
    }
  });
  viewer.addEventListener('close',()=>{
    cancelTap();resetZoom();setChrome(true);pointers.clear();gesture=null;viewer.style.width=viewer.style.height=viewer.style.top=viewer.style.left='';lockPage(false);dropViewerHistory();
  });
  window.addEventListener('popstate',()=>{
    if(viewer.open)viewer.close();
  });
  function dist(a,b){const dx=a.x-b.x,dy=a.y-b.y;return Math.hypot(dx,dy)}
  function mid(a,b){return {x:(a.x+b.x)/2,y:(a.y+b.y)/2}}
  function resist(dx){
    if(dx>0&&index<=0)return dx*0.28;
    if(dx<0&&index>=list.length-1)return dx*0.28;
    return dx;
  }
  stage.addEventListener('pointerdown',e=>{
    if(e.target.closest('button'))return;
    if(animating)return;
    try{stage.setPointerCapture(e.pointerId)}catch{}
    pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(pointers.size===2){
      const [a,b]=[...pointers.values()];
      gesture='pinch';startScale=scale;startDist=dist(a,b)||1;const m=mid(a,b);startMidX=m.x;startMidY=m.y;startPanX=panX;startPanY=panY;
      return;
    }
    startX=e.clientX;startY=e.clientY;startT=performance.now();startPanX=panX;startPanY=panY;dragX=0;dragY=0;
    gesture=scale>1?'pan':null;
  });
  stage.addEventListener('pointermove',e=>{
    if(!pointers.has(e.pointerId))return;
    pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(pointers.size>=2||gesture==='pinch'){
      if(pointers.size>=2){
        const [a,b]=[...pointers.values()];
        const d=dist(a,b)||1,m=mid(a,b);
        const next=Math.min(4,Math.max(1,startScale*(d/startDist)));
        const box=current.getBoundingClientRect();
        const cx=box.left+box.width/2,cy=box.top+box.height/2;
        const ratio=next/Math.max(scale,0.01);
        panX=(startPanX+(m.x-cx))*ratio-(m.x-cx);
        panY=(startPanY+(m.y-cy))*ratio-(m.y-cy);
        scale=next;applyZoom();
        gesture='pinch';
      }
      e.preventDefault();return;
    }
    const dx=e.clientX-startX,dy=e.clientY-startY;
    if(scale>1||gesture==='pan'){
      gesture='pan';panX=startPanX+dx;panY=startPanY+dy;applyZoom();e.preventDefault();return;
    }
    if(!gesture){
      if(Math.abs(dx)>12&&Math.abs(dx)>Math.abs(dy)+6)gesture='swipe';
      else if(dy>16&&dy>Math.abs(dx)*1.2)gesture='dismiss';
    }
    if(gesture==='swipe'){cancelTap();dragX=resist(dx);dragY=0;resetZoom();setFrame(dragX,0,false);e.preventDefault()}
    else if(gesture==='dismiss'){dragX=0;dragY=Math.max(0,dy);setFrame(0,dragY,false);e.preventDefault()}
  },{passive:false});
  function endPointer(e){
    if(!pointers.has(e.pointerId))return;
    pointers.delete(e.pointerId);
    if(stage.hasPointerCapture(e.pointerId))try{stage.releasePointerCapture(e.pointerId)}catch{}
    if(pointers.size>=1&&gesture==='pinch'){
      const remain=[...pointers.values()][0];
      startX=remain.x;startY=remain.y;startPanX=panX;startPanY=panY;gesture=scale>1?'pan':null;
      return;
    }
    const now=performance.now(), dx=e.clientX-startX, dy=e.clientY-startY, dt=Math.max(1,now-startT);
    const isTap=Math.hypot(dx,dy)<12 && now-startT<280;
    if((gesture==='pinch'||gesture==='pan')&&!isTap){
      if(scale<=1.02)resetZoom();
      gesture=null;return;
    }
    if(gesture==='dismiss'){
      const vy=dy/dt;
      if(dy>110||vy>0.7){resetFrame(true);viewer.close()}
      else resetFrame(true);
      gesture=null;return;
    }
    if(gesture==='swipe'){
      const vx=dx/dt, width=Math.max(stage.clientWidth,1);
      const should= (Math.abs(resist(dx))>Math.min(72,width*0.18) || Math.abs(vx)>0.45) && resist(dx)===dx;
      if(should)go(dx<0?1:-1,true);
      else resetFrame(true);
      gesture=null;return;
    }
    // Single tap toggles the bars; wait so a double-tap can still zoom.
    if(Math.hypot(dx,dy)<12 && now-startT<280){
      if(now-lastTap<320 && Math.hypot(e.clientX-lastTapX,e.clientY-lastTapY)<40){
        lastTap=0;
        cancelTap();
        if(scale>1)resetZoom();
        else{
          const box=current.getBoundingClientRect();
          const cx=box.left+box.width/2,cy=box.top+box.height/2;
          const next=2.5;
          panX=(e.clientX-cx)*(1-next);panY=(e.clientY-cy)*(1-next);scale=next;applyZoom();
        }
      }else{
        lastTap=now;lastTapX=e.clientX;lastTapY=e.clientY;
        cancelTap();
        tapTimer=setTimeout(()=>{tapTimer=null;if(viewer.open)toggleChrome()},300);
      }
    }
    gesture=null;
  }
  stage.addEventListener('pointerup',endPointer);
  stage.addEventListener('pointercancel',endPointer);
  stage.addEventListener('lostpointercapture',e=>{if(pointers.has(e.pointerId))endPointer(e)});
  // Stop the page behind the dialog from rubber-banding while it is open.
  viewer.addEventListener('touchmove',e=>{if(viewer.open)e.preventDefault()},{passive:false});

  // Touch fallback for iOS Safari / Android WebView, where pointer events inside
  // a modal <dialog> can drop. Skip these if a pointer gesture is already live.
  let touchBacking=false;
  function touchPts(list){return [...list].map(t=>({x:t.clientX,y:t.clientY,id:t.identifier}))}
  stage.addEventListener('touchstart',e=>{
    if(e.target.closest('button'))return;
    if(animating)return;
    if(pointers.size&&!touchBacking)return;
    touchBacking=true;
    const pts=touchPts(e.touches);
    pointers.clear();
    pts.forEach(pt=>pointers.set(pt.id,pt));
    if(pts.length>=2){
      const [a,b]=pts;
      gesture='pinch';startScale=scale;startDist=dist(a,b)||1;const m=mid(a,b);startMidX=m.x;startMidY=m.y;startPanX=panX;startPanY=panY;
      e.preventDefault();return;
    }
    const t=pts[0];if(!t)return;
    startX=t.x;startY=t.y;startT=performance.now();startPanX=panX;startPanY=panY;dragX=0;dragY=0;
    gesture=scale>1?'pan':null;
    e.preventDefault();
  },{passive:false});
  stage.addEventListener('touchmove',e=>{
    if(!touchBacking)return;
    const pts=touchPts(e.touches);
    pointers.clear();
    pts.forEach(pt=>pointers.set(pt.id,pt));
    if(pts.length>=2||gesture==='pinch'){
      if(pts.length>=2){
        const [a,b]=pts;
        const d=dist(a,b)||1,m=mid(a,b);
        const next=Math.min(4,Math.max(1,startScale*(d/startDist)));
        const box=current.getBoundingClientRect();
        const cx=box.left+box.width/2,cy=box.top+box.height/2;
        const ratio=next/Math.max(scale,0.01);
        panX=(startPanX+(m.x-cx))*ratio-(m.x-cx);
        panY=(startPanY+(m.y-cy))*ratio-(m.y-cy);
        scale=next;applyZoom();
        gesture='pinch';
      }
      e.preventDefault();return;
    }
    const t=pts[0];if(!t)return;
    const dx=t.x-startX,dy=t.y-startY;
    if(scale>1||gesture==='pan'){
      gesture='pan';panX=startPanX+dx;panY=startPanY+dy;applyZoom();e.preventDefault();return;
    }
    if(!gesture){
      if(Math.abs(dx)>12&&Math.abs(dx)>Math.abs(dy)+6)gesture='swipe';
      else if(dy>16&&dy>Math.abs(dx)*1.2)gesture='dismiss';
    }
    if(gesture==='swipe'){cancelTap();dragX=resist(dx);dragY=0;resetZoom();setFrame(dragX,0,false);e.preventDefault()}
    else if(gesture==='dismiss'){dragX=0;dragY=Math.max(0,dy);setFrame(0,dragY,false);e.preventDefault()}
  },{passive:false});
  stage.addEventListener('touchend',e=>{
    if(!touchBacking)return;
    const leftover=touchPts(e.touches);
    if(leftover.length){
      pointers.clear();
      leftover.forEach(pt=>pointers.set(pt.id,pt));
      if(gesture==='pinch'){
        const remain=leftover[0];
        startX=remain.x;startY=remain.y;startPanX=panX;startPanY=panY;gesture=scale>1?'pan':null;
      }
      e.preventDefault();return;
    }
    const t=e.changedTouches[0];
    endPointer({pointerId:t?t.identifier:-1,clientX:t?t.clientX:startX,clientY:t?t.clientY:startY});
    touchBacking=false;
  },{passive:false});
  stage.addEventListener('touchcancel',e=>{
    if(!touchBacking)return;
    const t=e.changedTouches[0];
    endPointer({pointerId:t?t.identifier:-1,clientX:t?t.clientX:startX,clientY:t?t.clientY:startY});
    touchBacking=false;
  },{passive:false});
})();


(function(){
  if(document.documentElement.dataset.nativeFeel==='1')return;
  document.documentElement.dataset.nativeFeel='1';
  document.addEventListener('contextmenu',e=>{
    if(!e.target.closest('input,textarea,select,[contenteditable],[contenteditable="true"]'))e.preventDefault();
  });
})();
function selectedPhoto(){const p=projects.find(p=>p.id===photoSelection?.owner),ph=p?.photos.find(ph=>ph.id===photoSelection?.id);return {p,ph}}
async function savePhotoChanges(change){const {p,ph}=selectedPhoto();if(!p||!ph)throw Error('Photo no longer available');const updated={...p,photos:p.photos.map(item=>item.id===ph.id?{...item,...change}:item)};await persist([updated]);projects[projects.indexOf(p)]=updated;if(current===p.id)renderDetail();else render();return updated}
$('#originalButton').onclick=()=>{const {ph}=selectedPhoto();if(!ph)return;const btn=$('#originalButton');const showOrig=btn.dataset.mode!=='original';$('#viewerImage').src=showOrig?ph.data:photoData(ph);btn.dataset.mode=showOrig?'original':'photo';viewerToolLabel(btn,showOrig?'Markup':'Original')};
addDialog('photoMetaDialog','Photo details','<form id="photoMetaForm"><label class="field">Caption<textarea id="photoCaption" maxlength="500" placeholder="e.g. Cedar rail detail for the estimate"></textarea></label><label class="field">Photo tags<input id="photoTags" maxlength="500" placeholder="cedar, railings, built-in seating"><small>Separate tags with commas. Searchable across all jobs.</small></label><label class="check-label"><input type="checkbox" id="featuredAfter"> Best After photo for portfolio</label><button class="primary wide" type="submit">Save photo details</button></form>');
$('#photoTagsButton').onclick=()=>{const {p,ph}=selectedPhoto();if(!ph)return;$('#viewer').close();$('#photoCaption').value=ph.caption||'';$('#photoTags').value=(ph.tags||[]).join(', ');$('#featuredAfter').checked=p.featuredPhotoId===ph.id;$('#featuredAfter').disabled=ph.phase!=='After'||cloudProfile?.role==='sub';$('#photoMetaDialog').showModal()};
$('#photoMetaForm').onsubmit=async e=>{e.preventDefault();const b=e.target.querySelector('button[type=submit]');b.disabled=true;try{await savePhotoChanges({caption:$('#photoCaption').value.trim(),tags:cleanTags($('#photoTags').value)});const {p,ph}=selectedPhoto();if(cloudProfile?.role!=='sub'&&ph.phase==='After'&&($('#featuredAfter').checked||p.featuredPhotoId===ph.id)){const updated={...p,featuredPhotoId:$('#featuredAfter').checked?ph.id:''};await persist([updated]);projects[projects.indexOf(p)]=updated;render()}$('#photoMetaDialog').close();toast('Photo details saved.')}catch(err){storageError(err)}finally{b.disabled=false}};
addDialog('annotationDialog','Mark up photo','<p class="caption">Draw on a copy. The saved original stays untouched.</p><div class="mark-tools"><button class="secondary" id="drawMode" aria-pressed="true">Draw</button><button class="secondary" id="textMode" aria-pressed="false">Text</button><label>Colour <input type="color" id="markColor" value="#ffcf54"></label><label>Width <select id="markWidth"><option value="4">Thin</option><option value="8" selected>Medium</option><option value="16">Thick</option></select></label><button class="secondary" id="undoMark">Undo</button></div><div id="textPlacement" hidden><label class="field">Text label<input id="markText" maxlength="120" placeholder="e.g. Replace this board"></label><p class="caption">Tap photo to place text, or use position fields.</p><div class="text-position"><label>Across (%)<input id="textX" type="number" min="0" max="95" value="10"></label><label>Down (%)<input id="textY" type="number" min="5" max="95" value="20"></label></div><button class="secondary" id="placeText">Add text at position</button></div><canvas id="annotationCanvas" aria-label="Photo markup canvas. Use Draw or Text tools. Text also has numeric position controls."></canvas><p id="annotationStatus" class="caption" role="status"></p><div class="form-actions"><button class="secondary" data-close="annotationDialog">Cancel</button><button class="primary" id="saveAnnotation">Save marked-up copy</button></div>');
function drawAnnotations(){if(!annotation)return;const c=$('#annotationCanvas'),x=c.getContext('2d');x.clearRect(0,0,c.width,c.height);x.drawImage(annotation.image,0,0);for(const m of annotation.marks){x.strokeStyle=x.fillStyle=m.color;x.lineWidth=m.width;x.lineCap=x.lineJoin='round';if(m.type==='draw'&&m.points?.length){x.beginPath();x.moveTo(m.points[0][0],m.points[0][1]);for(const p of m.points)x.lineTo(p[0],p[1]);x.stroke()}if(m.type==='text'){x.font='bold '+Math.round(c.width/24)+'px sans-serif';x.lineWidth=Math.max(2,c.width/400);x.strokeStyle='#101512';x.strokeText(m.text,m.x,m.y);x.fillText(m.text,m.x,m.y)}}$('#undoMark').disabled=!annotation.marks.length}
$('#annotateButton').onclick=async()=>{const {ph}=selectedPhoto();if(!ph)return;$('#viewer').close();const image=new Image();image.src=ph.data;try{await image.decode();annotation={image,mode:'draw',marks:structuredClone(ph.annotations||[])};const c=$('#annotationCanvas');c.width=image.naturalWidth;c.height=image.naturalHeight;$('#annotationStatus').textContent='Drag with a finger or mouse to draw. Text labels have a keyboard alternative.';$('#annotationDialog').showModal();setMarkMode('draw');drawAnnotations()}catch{toast('Photo could not be opened.')}};
function setMarkMode(mode){if(!annotation)return;annotation.mode=mode;$('#drawMode').setAttribute('aria-pressed',String(mode==='draw'));$('#textMode').setAttribute('aria-pressed',String(mode==='text'));$('#textPlacement').hidden=mode!=='text'}
$('#drawMode').onclick=()=>setMarkMode('draw');$('#textMode').onclick=()=>setMarkMode('text');$('#undoMark').onclick=()=>{annotation.marks.pop();drawAnnotations()};
function addText(x,y){const text=$('#markText').value.trim();if(!text){$('#markText').focus();$('#annotationStatus').textContent='Type a text label first.';return}annotation.marks.push({type:'text',text,x,y,color:$('#markColor').value,width:8});drawAnnotations()}
$('#placeText').onclick=()=>{const c=$('#annotationCanvas');addText(Math.max(0,Math.min(95,Number($('#textX').value)))/100*c.width,Math.max(5,Math.min(95,Number($('#textY').value)))/100*c.height)};
const canvas=$('#annotationCanvas');let stroke=null;
function canvasPoint(e){const rect=canvas.getBoundingClientRect();return [(e.clientX-rect.left)*canvas.width/rect.width,(e.clientY-rect.top)*canvas.height/rect.height]}
canvas.onpointerdown=e=>{if(!annotation)return;e.preventDefault();const [x,y]=canvasPoint(e);if(annotation.mode==='text'){addText(x,y);return}if(annotation.marks.length>=1000){toast('This photo has many marks. Save this version first.');return}stroke={type:'draw',color:$('#markColor').value,width:Number($('#markWidth').value)*canvas.width/1000,points:[[x,y]]};annotation.marks.push(stroke);canvas.setPointerCapture(e.pointerId);drawAnnotations()};
canvas.onpointermove=e=>{if(!stroke)return;e.preventDefault();stroke.points.push(canvasPoint(e));drawAnnotations()};canvas.onpointerup=canvas.onpointercancel=e=>{stroke=null;if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId)};
$('#saveAnnotation').onclick=async()=>{const b=$('#saveAnnotation');b.disabled=true;try{await savePhotoChanges({annotatedData:canvas.toDataURL('image/jpeg',.88),annotations:annotation.marks,annotatedAt:new Date().toISOString()});$('#annotationDialog').close();toast('Marked-up copy saved. Original kept.')}catch(err){storageError(err)}finally{b.disabled=false}};
// Photo date/time (admins): pick the time stamp when adding photos (Now / Photo's date / Pick date) and fix it later with Edit date.
// The stamp is burned into the photo, so a changed date redraws the stamp bar on the photo (and its marked-up copy).
const baseStamp=stamp;let skipStamp=false;stamp=function(...a){if(skipStamp)return;return baseStamp(...a)};
const rawPending=new Map();let timeMode='now';
const toLocalInput=t=>{const v=Date.parse(t||'');return Number.isFinite(v)?new Date(v-5*3600e3).toISOString().slice(0,16):''};
const fromLocalInput=v=>/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v||'')&&Number.isFinite(Date.parse(v+':00-05:00'))?v+':00-05:00':'';
function pendingTime(id){const raw=rawPending.get(id);if(timeMode==='photo'&&raw)return {stamp:raw.stamp,takenAt:raw.takenAt};if(timeMode==='pick'){const iso=fromLocalInput($('#uploadPickTime').value);if(iso)return {stamp:timeLabel(iso),takenAt:iso}}const now=new Date().toISOString();return {stamp:timeLabel(now),takenAt:now}}
async function burnStamp(dataUrl,label,cover){const image=new Image();image.src=dataUrl;await image.decode();const c=document.createElement('canvas');c.width=image.naturalWidth;c.height=image.naturalHeight;const x=c.getContext('2d');x.drawImage(image,0,0);if(cover){const size=Math.max(13,Math.round(c.width/58)),h=Math.ceil(size*2.8)+3;x.fillStyle='rgb(12,25,18)';x.fillRect(0,c.height-h,c.width,h)}baseStamp(x,c.width,c.height,label);const out=c.toDataURL('image/jpeg',.88);c.width=c.height=0;if(!/^data:image\/jpeg;base64,./.test(out))throw Error('This phone couldn’t make the JPEG. Close other apps and try again.');return out}
const timeBox=document.createElement('div');timeBox.className='time-pick';timeBox.id='uploadTimeBox';timeBox.innerHTML='<strong>Time stamp</strong><div class="time-seg" role="group" aria-label="Time stamp for these photos"><button type="button" data-time-mode="now" aria-pressed="true">Now</button><button type="button" data-time-mode="photo" aria-pressed="false">Photo’s date</button><button type="button" data-time-mode="pick" aria-pressed="false">Pick date</button></div><input type="datetime-local" id="uploadPickTime" aria-label="Date and time taken (UTC−5)" hidden><small class="v2-status" id="uploadTimeNote">Stamped with the time you save.</small>';$('.upload-choices').after(timeBox);
function setTimeMode(mode){timeMode=mode;timeBox.querySelectorAll('[data-time-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.timeMode===mode)));$('#uploadPickTime').hidden=mode!=='pick';if(mode==='pick'&&!$('#uploadPickTime').value)$('#uploadPickTime').value=toLocalInput(new Date().toISOString());$('#uploadTimeNote').textContent=mode==='now'?'Stamped with the time you save.':mode==='photo'?'Uses the date saved in each photo (camera date, or the file’s date if none).':'Pick when the photos were taken (UTC−5).';pending=pending.map(ph=>({...ph,...pendingTime(ph.id)}));renderPending()}
timeBox.querySelectorAll('[data-time-mode]').forEach(b=>b.onclick=()=>setTimeMode(b.dataset.timeMode));$('#uploadPickTime').onchange=()=>{pending=pending.map(ph=>({...ph,...pendingTime(ph.id)}));renderPending()};
{const innerOpen=openUpload;openUpload=function(){rawPending.clear();innerOpen();$('#uploadTimeBox').hidden=!canEditPhotos();$('#uploadPickTime').value='';setTimeMode('now');$('#uploadCaption').textContent='Photos only. Each photo is resized and stamped with the time you choose below.'}}
{const baseSave=$('#savePhotos').onclick;$('#savePhotos').onclick=async()=>{if(busy||!pending.length)return;if(!$('#uploaderName').value.trim())return baseSave();if(timeMode==='pick'&&!fromLocalInput($('#uploadPickTime').value)){$('#uploadPickTime').focus();toast('Pick a date and time, or choose Now.');return}$('#savePhotos').disabled=true;try{const stamped=[];for(const ph of pending){const raw=rawPending.get(ph.id),t=pendingTime(ph.id);stamped.push(raw?{...ph,...t,data:await burnStamp(raw.data,t.stamp,false)}:ph)}pending=stamped}catch(err){$('#savePhotos').disabled=false;toast('Couldn’t stamp the photos: '+(err.message||err));return}$('#savePhotos').disabled=false;await baseSave();if(!pending.length)rawPending.clear()}}
function canEditPhotos(){return canDeletePhoto({})}
addDialog('dateEditDialog','Edit photo date','<form id="dateEditForm"><img id="dateEditPreview" class="date-edit-preview" alt=""><p class="caption" id="dateEditNow"></p><label class="field">Date and time taken (UTC−5)<input type="datetime-local" id="dateEditInput" required></label><p class="caption" id="dateEditNote"></p><div class="form-actions"><button class="secondary" type="button" data-close="dateEditDialog">Cancel</button><button class="primary" type="submit" id="dateEditSave">Save date</button></div><p class="v2-status" id="dateEditStatus" role="status"></p></form>');
let dateTarget=null;
function askEditDate(owner,id){const p=projects.find(x=>x.id===owner),ph=p?.photos.find(x=>x.id===id);if(!canDeletePhoto(ph)){toast('Only signed-in team members can change photo dates.');return}dateTarget={owner,id};if($('#viewer').open)$('#viewer').close();$('#dateEditPreview').src=photoData(ph);$('#dateEditNow').textContent='Now stamped: '+(ph.stamp||'no date');$('#dateEditInput').value=toLocalInput(ph.takenAt)||toLocalInput(ph.addedAt)||toLocalInput(new Date().toISOString());$('#dateEditNote').textContent=p.demo?'Demo photo: the label changes, the illustration stays the same.':'The date stamp on the photo itself is redrawn too'+(cloudOn()?', on every phone and the client link.':'.');$('#dateEditStatus').textContent='';$('#dateEditSave').disabled=false;$('#dateEditDialog').showModal();setTimeout(()=>$('#dateEditInput').focus(),60)}
$('#editDateButton').onclick=()=>{const {p,ph}=selectedPhoto();if(p&&ph)askEditDate(p.id,ph.id)};
document.addEventListener('click',e=>{const b=e.target.closest('[data-edit-date]');if(b)askEditDate(b.dataset.owner,b.dataset.editDate)});
$('#dateEditForm').onsubmit=async e=>{e.preventDefault();const b=$('#dateEditSave'),t=dateTarget;const p=projects.find(x=>x.id===t?.owner),ph=p?.photos.find(x=>x.id===t?.id);if(!ph){$('#dateEditDialog').close();return}if(!canDeletePhoto(ph))return;const iso=fromLocalInput($('#dateEditInput').value);if(!iso){$('#dateEditStatus').textContent='Pick a date and a time.';$('#dateEditInput').focus();return}const label=timeLabel(iso);if(label===ph.stamp&&iso===ph.takenAt){$('#dateEditDialog').close();return}b.disabled=true;$('#dateEditStatus').textContent='Saving…';try{const change={stamp:label,takenAt:iso,stampEditedAt:new Date().toISOString()};if(!p.demo){change.data=await burnStamp(ph.data,label,true);change.dataRev=change.stampEditedAt+'-'+Math.random().toString(36).slice(2,8);if(ph.annotatedData)change.annotatedData=await burnStamp(ph.annotatedData,label,true)}photoSelection={owner:p.id,id:ph.id};await savePhotoChanges(change);dateTarget=null;$('#dateEditDialog').close();toast('Photo date changed to '+label+'.')}catch(err){$('#dateEditStatus').textContent='Couldn’t save: '+(err.message||err);b.disabled=false}};
// Tapping a category (e.g. "Fences · 3 jobs") filters the job list further down the page; scroll the matching jobs into view so the tap visibly does something.
function scrollToResults(){const el=$('#resultsLabel')||$('#estimateLabel')||$('#main .project-grid');if(!el)return;const head=$('.header')?.getBoundingClientRect().height||0;window.scrollTo({top:Math.max(0,el.getBoundingClientRect().top+window.scrollY-head-12),behavior:'smooth'})}
document.addEventListener('click',e=>{const b=e.target.closest&&e.target.closest('[data-cat]');if(!b||current)return;if(category)setTimeout(scrollToResults,30)});
// Any unexpected error is shown in a small visible bar (not silently swallowed), so a screenshot tells us what went wrong.
(function(){let bar=null,shown=0;function show(msg){if(!msg||/ResizeObserver|Script error\.?$/i.test(msg))return;const now=Date.now();if(now-shown<1500&&bar&&!bar.hidden)return;shown=now;if(!bar){bar=document.createElement('div');bar.id='appProblem';bar.className='app-problem';bar.setAttribute('role','alert');bar.innerHTML='<span></span><button type="button" aria-label="Dismiss">×</button>';document.body.append(bar);bar.querySelector('button').onclick=()=>{bar.hidden=true}}bar.querySelector('span').textContent='Something went wrong: '+String(msg).slice(0,200)+'. Your saved jobs are safe.';bar.hidden=false;clearTimeout(bar._t);bar._t=setTimeout(()=>{bar.hidden=true},12000)}
  window.addEventListener('error',e=>{if(e.target&&e.target!==window)return;show(e.message||e.error?.message)});
  window.addEventListener('unhandledrejection',e=>{const m=e.reason?.message||String(e.reason||'');if(/fetch|network|load failed|import/i.test(m))return;show(m)});
  window.jobcamShowProblem=show})();
// Delete photo: confirm, remove it from the job on this phone; in cloud mode cloud.js queues the cloud delete (works offline, runs on next sync). Never shown to clients.
const isClientView=()=>document.documentElement.classList.contains('jobcam-client')||/[#&]client=/.test(location.hash||'');
const cloudOn=()=>!!(window.jobcamCloudConfigured&&window.jobcamCloudConfigured());
function canDeletePhoto(ph){if(!ph||isClientView()||cloudStore)return false;if(cloudOn())return !!window.JobcamTeam?.canDelete;return true}
let deleteTarget=null;
addDialog('deletePhotoDialog','Delete this photo?','<img id="deletePhotoPreview" class="delete-preview" alt=""><p class="caption" id="deletePhotoText"></p><div class="delete-actions"><button class="danger wide" id="confirmDeletePhoto" type="button">Delete photo</button><button class="secondary wide" data-close="deletePhotoDialog" type="button">Keep photo</button></div><p class="v2-status" id="deletePhotoStatus" role="status"></p>');
function askDeletePhoto(owner,id){const p=projects.find(x=>x.id===owner),ph=p?.photos.find(x=>x.id===id);if(!canDeletePhoto(ph)){toast('Only signed-in team members can delete photos.');return}deleteTarget={owner,id};if($('#viewer').open)$('#viewer').close();$('#deletePhotoPreview').src=photoData(ph);$('#deletePhotoPreview').alt=ph.phase+' photo: '+p.name;$('#deletePhotoText').textContent=cloudOn()?'This removes it from the job on every phone and the client link.':'This removes it from the job on this phone. It can’t be undone.';$('#deletePhotoStatus').textContent='';$('#confirmDeletePhoto').disabled=false;$('#deletePhotoDialog').showModal()}
$('#deletePhotoButton').onclick=()=>{const {p,ph}=selectedPhoto();if(p&&ph)askDeletePhoto(p.id,ph.id)};
document.addEventListener('click',e=>{const b=e.target.closest('[data-delete-photo]');if(b){e.stopPropagation();askDeletePhoto(b.dataset.owner,b.dataset.deletePhoto)}});
$('#confirmDeletePhoto').onclick=async()=>{const b=$('#confirmDeletePhoto'),t=deleteTarget;const p=projects.find(x=>x.id===t?.owner),ph=p?.photos.find(x=>x.id===t?.id);if(!ph){$('#deletePhotoDialog').close();return}if(!canDeletePhoto(ph))return;b.disabled=true;$('#deletePhotoStatus').textContent='Deleting…';let queued=null;try{if(window.jobcamPhotoDeleteHook)queued=await window.jobcamPhotoDeleteHook(p,ph);const fresh=projects.find(x=>x.id===p.id)||p;const updated={...fresh,photos:fresh.photos.filter(x=>x.id!==ph.id),...(fresh.featuredPhotoId===ph.id?{featuredPhotoId:''}:{})};try{await persist([updated])}catch(err){try{await queued?.undo?.()}catch{}throw err}const i=projects.findIndex(x=>x.id===p.id);if(i>=0)projects[i]=updated;if(photoSelection?.id===ph.id)photoSelection=null;if(comparePair[p.id]&&(comparePair[p.id].before===ph.id||comparePair[p.id].after===ph.id))delete comparePair[p.id];deleteTarget=null;$('#deletePhotoDialog').close();if(current===p.id)renderDetail();else render();toast(queued?.message||'Photo deleted.')}catch(err){$('#deletePhotoStatus').textContent='Couldn’t delete: '+(err.message||err);b.disabled=false}};
// Per-job daily documentation, deliberately manual rather than fabricated AI reports.
addDialog('dailyDialog','Daily log & report','<div class="report-controls"><label>Work date<input type="date" id="reportDate"></label><label>Report<button class="secondary wide" id="printReport">Open printable report</button></label></div><form id="dailyForm"><label class="field">Recorded by<input id="logAuthor" maxlength="50" required placeholder="First name"></label><label class="field">Work completed<textarea id="logWork" maxlength="2000" required placeholder="Posts set, framing finished, boards installed…"></textarea></label><label class="field">Issues / delays<textarea id="logIssues" maxlength="1000" placeholder="Optional"></textarea></label><label class="field">Next steps<textarea id="logNext" maxlength="1000" placeholder="Optional"></textarea></label><label class="field">Weather / site conditions<input id="logWeather" maxlength="200" placeholder="Optional — recorded manually"></label><button class="primary wide" type="submit">Save log entry</button></form><p class="notice">Private working report. Exporting opens a local preview; nothing is sent. Save as PDF from your browser’s Print menu.</p><div id="dailyEntries"></div>');
function openDailyLog(){$('#dailyForm').reset();$('#reportDate').value=dayKey();try{$('#logAuthor').value=localStorage.getItem('johnny-uploader')||''}catch{}$('#logAuthor').readOnly=!!cloudProfile;if(cloudProfile)$('#logAuthor').value=cloudProfile.display_name;showDailyEntries();$('#dailyDialog').showModal()}
function showDailyEntries(){const p=getCurrent(),date=$('#reportDate').value;$('#dailyEntries').innerHTML=(p?.logs||[]).filter(l=>l.date===date).map(l=>'<article class="daily-entry"><h3>'+esc(l.author)+' · '+esc(timeLabel(l.createdAt))+'</h3><p>'+esc(l.work)+'</p>'+(l.issues?'<p><strong>Issues:</strong> '+esc(l.issues)+'</p>':'')+(l.next?'<p><strong>Next:</strong> '+esc(l.next)+'</p>':'')+(l.weather?'<p><strong>Conditions:</strong> '+esc(l.weather)+'</p>':'')+'</article>').join('')||'<p class="caption">No log entries for this date. Photos added that day still appear in the printable report.</p>'}
$('#reportDate').onchange=showDailyEntries;
$('#dailyForm').onsubmit=async e=>{e.preventDefault();const old=getCurrent(),b=e.target.querySelector('button[type=submit]');if(!old)return;if(!$('#reportDate').value){toast('Choose a work date.');return}b.disabled=true;const log={id:uid(),date:$('#reportDate').value,author:$('#logAuthor').value.trim(),work:$('#logWork').value.trim(),issues:$('#logIssues').value.trim(),next:$('#logNext').value.trim(),weather:$('#logWeather').value.trim(),createdAt:new Date().toISOString()};if(!log.author||!log.work){toast('Add your name and work completed.');b.disabled=false;return}const p={...old,logs:[...(old.logs||[]),log]};try{await persist([p]);projects[projects.indexOf(old)]=p;$('#logWork').value=$('#logIssues').value=$('#logNext').value=$('#logWeather').value='';showDailyEntries();toast('Daily log saved.')}catch(err){storageError(err)}finally{b.disabled=false}};
const documentCSS='body{font:16px/1.6 system-ui,sans-serif;margin:0;background:#f7f7f4;color:#17251e}main{max-width:1000px;margin:auto;padding:24px}h1{font:36px/1.15 Georgia,serif;margin:10px 0}h2{font:27px Georgia,serif;margin-top:30px}.muted{color:#4c6053;font-size:13px}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}figure{margin:0;break-inside:avoid;background:white;border:1px solid #c7d0c7;border-radius:10px;overflow:hidden}figure img{display:block;width:100%;height:auto}figcaption{padding:12px;font-size:13px;overflow-wrap:anywhere}.note{white-space:pre-wrap;overflow-wrap:anywhere}.entry{padding:16px 0;border-top:1px solid #c7d0c7;break-inside:avoid}button{min-height:46px;padding:10px 16px;border:0;background:#223b2c;color:white;border-radius:8px;cursor:pointer}small{display:block}.demo{padding:10px;background:#eee5cc}.top{display:flex;justify-content:space-between;align-items:center;gap:15px}@media(max-width:500px){main{padding:18px}.grid{grid-template-columns:1fr}h1{font-size:30px}}@media print{body{background:white}main{max-width:none;padding:0}button,.no-print{display:none!important}figure{border:1px solid #aaa}.grid{grid-template-columns:repeat(2,minmax(0,1fr))}img{max-height:300px;object-fit:contain}h1,h2{break-after:avoid}@page{margin:16mm}}';
function staticDocument(title,body,printable=false){return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data:; style-src \'unsafe-inline\'; script-src \'unsafe-inline\'; base-uri \'none\'; form-action \'none\'; connect-src \'none\'"><title>'+esc(title)+'</title><style>'+documentCSS+'</style></head><body><main>'+(LOGO_DATA?'<img src="'+LOGO_DATA+'" alt="Carpenter Johnny" style="display:block;width:180px;height:auto;margin:0 0 12px">':'')+body+'</main>'+(printable?'<script>document.getElementById("printLocal").addEventListener("click",()=>window.print());<\/script>':'')+'</body></html>'}
function reportHTML(p,date){const logs=(p.logs||[]).filter(l=>l.date===date),photos=p.photos.filter(ph=>dayKey(ph.addedAt)===date);return staticDocument(p.name+' · Daily report','<div class="top"><p>Carpenter Johnny · Internal daily report</p><button id="printLocal">Print / Save PDF</button></div>'+(p.demo?'<p class="demo">Demo project — illustrations, not customer work.</p>':'')+'<h1>'+esc(p.name)+'</h1><p>'+esc(p.category)+' · '+esc(p.area)+' · '+esc(dateLabel(date))+' · America/Coral_Harbour (UTC−5)</p><p class="muted">Photos grouped by date added, not original capture date. Uploaded-by names are '+(cloudStore?'authenticated account labels.':'unverified labels.')+'</p><h2>Work log</h2>'+(logs.map(l=>'<section class="entry"><strong>'+esc(l.author)+'</strong> <span class="muted">'+esc(timeLabel(l.createdAt))+'</span><p class="note">'+esc(l.work)+'</p>'+(l.issues?'<p class="note"><strong>Issues:</strong> '+esc(l.issues)+'</p>':'')+(l.next?'<p class="note"><strong>Next:</strong> '+esc(l.next)+'</p>':'')+(l.weather?'<p><strong>Conditions:</strong> '+esc(l.weather)+'</p>':'')+'</section>').join('')||'<p>No log recorded for this day.</p>')+'<h2>Photos added · '+photos.length+'</h2><div class="grid">'+photos.map(ph=>'<figure><img src="'+photoData(ph)+'" alt="'+esc(ph.phase)+'"><figcaption><strong>'+esc(ph.phase)+' · '+esc(ph.uploader)+'</strong><small>Photo timestamp: '+esc(ph.stamp)+'</small><small>Added '+esc(timeLabel(ph.addedAt))+'</small>'+(validGPS(ph.gps)?'<small>Device GPS at upload: '+esc(displayGPS(ph.gps))+' · '+esc(timeLabel(ph.gps.at))+'</small>':'')+(ph.caption?'<p class="note">'+esc(ph.caption)+'</p>':'')+'</figcaption></figure>').join('')+'</div><p class="muted">Documentation aid only. Device time, names and location are not tamper-proof evidence.</p>',true)}
$('#printReport').onclick=()=>{const p=getCurrent(),date=$('#reportDate').value;if(!p||!date)return;const html=reportHTML(p,date),url=URL.createObjectURL(new Blob([html],{type:'text/html'}));window.open(url,'_blank','noopener');setTimeout(()=>URL.revokeObjectURL(url),60000)};
// A client gallery exports only selected photos, safe job context and optional design note.
addDialog('clientGalleryDialog','Client gallery','<p class="notice">Downloads a read-only HTML file you can review and share yourself. It is a snapshot, not a live link. GPS, uploader names, internal logs and photo captions/tags are excluded. Review the photos themselves for private details before sharing.</p><label class="check-label"><input type="checkbox" id="galleryNote"> Include job design note</label><label class="check-label"><input type="checkbox" id="galleryMarkup"> Include marked-up copies</label><p class="caption">Originals are used by default. Only select photos suitable for a client.</p><div id="galleryPhotos"></div><button class="primary wide" id="exportGallery" style="margin-top:18px">Download client gallery</button>');
function openClientGallery(){const p=getCurrent();if(!p)return;$('#galleryNote').checked=false;$('#galleryMarkup').checked=false;$('#galleryPhotos').innerHTML=p.photos.map(ph=>'<label class="gallery-select"><input type="checkbox" name="clientPhoto" value="'+esc(ph.id)+'"'+(ph.phase==='After'?' checked':'')+'><img src="'+photoData(ph)+'" alt=""><span>'+esc(ph.phase)+' · '+esc(ph.name)+'<br>'+esc(ph.stamp)+'</span></label>').join('')||'<p class="caption">Add photos first.</p>';$('#exportGallery').disabled=!p.photos.length;$('#clientGalleryDialog').showModal()}
function galleryHTML(p,ids,includeNote=false,includeMarkup=false){const photos=p.photos.filter(ph=>ids.includes(ph.id));return staticDocument(p.name+' · Client gallery','<p>Carpenter Johnny · Project gallery</p>'+(p.demo?'<p class="demo">Demo project — illustrations, not customer work.</p>':'')+'<h1>'+esc(p.name)+'</h1><p>'+esc(p.category)+' · '+esc(p.area)+'</p>'+(includeNote&&p.note?'<p class="note">'+esc(p.note)+'</p>':'')+'<p class="muted">Read-only snapshot prepared '+esc(timeLabel(Date.now()))+'. Not a live project feed.</p><div class="grid">'+photos.map(ph=>'<figure><img src="'+(includeMarkup?photoData(ph):ph.data)+'" alt="'+esc(ph.phase)+' job photo"><figcaption><strong>'+esc(ph.phase)+'</strong><small>'+esc(ph.stamp)+'</small></figcaption></figure>').join('')+'</div>')}
$('#exportGallery').onclick=()=>{const p=getCurrent(),ids=[...document.querySelectorAll('[name=clientPhoto]:checked')].map(e=>e.value);if(!ids.length){toast('Choose at least one photo.');return}downloadFile(galleryHTML(p,ids,$('#galleryNote').checked,$('#galleryMarkup').checked),'text/html',safeFile(p.name)+'-client-gallery.html');toast('Gallery downloaded locally. Nothing sent or published.')};
addDialog('portfolioDialog','Client portfolio','<div class="portfolio-frame"><div id="portfolioContent"></div><div class="portfolio-navigation"><button class="secondary" id="portfolioPrev">Previous</button><span id="portfolioCount"></span><button class="primary" id="portfolioNext">Next</button></div></div>');
function openPortfolio(){portfolioList=filtered().map(p=>({p,ph:p.photos.find(ph=>ph.phase==='After'&&ph.id===p.featuredPhotoId)||p.photos.find(ph=>ph.phase==='After')})).filter(item=>item.ph);portfolioIndex=0;renderPortfolio();$('#portfolioDialog').showModal()}
function renderPortfolio(){const item=portfolioList[portfolioIndex];$('#portfolioContent').innerHTML=item?'<img src="'+item.ph.data+'" alt="'+esc(item.p.name)+' — After'+(item.p.demo?' illustration':'')+'">'+(item.p.demo?'<p class="caption">Demo illustration · not customer work</p>':'')+'<h2>'+esc(item.p.name)+'</h2><p class="caption">'+esc(item.p.category)+' · '+esc(item.p.area)+'</p><p>'+esc(item.p.note)+'</p><div class="tag-row">'+item.p.tags.map(t=>'<span class="tag">'+esc(t)+'</span>').join('')+'</div>':'<div class="empty"><h3>No After photos found</h3><p>Try another category or tag, or add an After photo to a job.</p></div>';$('#portfolioCount').textContent=item?(portfolioIndex+1)+' / '+portfolioList.length:'0 photos';$('#portfolioPrev').disabled=portfolioIndex===0;$('#portfolioNext').disabled=portfolioIndex>=portfolioList.length-1}
$('#portfolioPrev').onclick=()=>{if(portfolioIndex>0){portfolioIndex--;renderPortfolio()}};$('#portfolioNext').onclick=()=>{if(portfolioIndex<portfolioList.length-1){portfolioIndex++;renderPortfolio()}};
// Versioned backup: accept v1, preserve v2 fields, validate all image and location payloads.
const validateV1=validateBackup;
validateBackup=function(raw){if(![1,2].includes(raw?.version))throw Error('Unsupported backup version');const base=validateV1({...raw,version:1});for(let i=0;i<base.length;i++){const p=base[i],input=raw.projects[i];p.featuredPhotoId=typeof input.featuredPhotoId==='string'?input.featuredPhotoId.slice(0,150):'';p.logs=(Array.isArray(input.logs)?input.logs:[]).slice(0,5000).map(l=>{if(!l||typeof l.id!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(l.date)||!Number.isFinite(Date.parse(l.createdAt)))throw Error('Invalid log entry');return {id:l.id.slice(0,150),date:l.date,author:String(l.author||'').slice(0,50),work:String(l.work||'').slice(0,2000),issues:String(l.issues||'').slice(0,1000),next:String(l.next||'').slice(0,1000),weather:String(l.weather||'').slice(0,200),createdAt:l.createdAt}});for(let j=0;j<p.photos.length;j++){const ph=p.photos[j],inputPh=input.photos[j];ph.caption=String(inputPh.caption||'').slice(0,500);ph.tags=cleanTags((Array.isArray(inputPh.tags)?inputPh.tags:[]).join(','));ph.gps=validGPS(inputPh.gps)?{lat:inputPh.gps.lat,lng:inputPh.gps.lng,accuracy:inputPh.gps.accuracy,at:inputPh.gps.at,source:'Device at upload'}:null;if(inputPh.annotatedData){if(!validImage(inputPh.annotatedData))throw Error('Invalid marked-up image');ph.annotatedData=inputPh.annotatedData;ph.annotatedAt=Number.isFinite(Date.parse(inputPh.annotatedAt))?inputPh.annotatedAt:ph.addedAt}ph.annotations=(Array.isArray(inputPh.annotations)?inputPh.annotations:[]).slice(0,1000).map(m=>{if(!m||!['draw','text'].includes(m.type)||!/^#[a-fA-F0-9]{6}$/.test(m.color)||!Number.isFinite(m.width)||m.width<0||m.width>100)throw Error('Invalid photo markup');if(m.type==='text'){if(!Number.isFinite(m.x)||!Number.isFinite(m.y))throw Error('Invalid text placement');return {type:'text',text:String(m.text||'').slice(0,120),x:m.x,y:m.y,color:m.color,width:m.width}}if(!Array.isArray(m.points)||m.points.length>50000||m.points.some(p=>!Array.isArray(p)||p.length!==2||p.some(n=>!Number.isFinite(n))))throw Error('Invalid drawing');return {type:'draw',points:m.points,color:m.color,width:m.width}})}}return base};
$('#exportButton').onclick=()=>{downloadFile(JSON.stringify({format:'johnny-jobcam',version:2,exportedAt:new Date().toISOString(),projects}),'application/json','johnny-jobs-v2-'+dayKey()+'.json');toast('Backup downloaded. Includes original photos, markup, GPS and logs; keep it private.')};
$('#importInput').onchange=async e=>{const file=e.target.files[0];if(!file)return;$('#importButton').disabled=true;try{if(cloudStore)throw Error('Import is local-only. Switch to local notebook first. No automatic cloud migration.');if(file.size>150*1024*1024)throw Error('Backup exceeds 150 MB limit');const incoming=validateBackup(JSON.parse(await file.text()));const merged=projects.map(p=>({...p,photos:[...p.photos],logs:[...(p.logs||[])]}));let conflicts=0;for(const p of incoming){const old=merged.find(x=>x.id===p.id);if(!old)merged.push(p);else{const ids=new Set(old.photos.map(ph=>ph.id)),logids=new Set((old.logs||[]).map(l=>l.id));old.photos.push(...p.photos.filter(ph=>!ids.has(ph.id)));old.logs.push(...(p.logs||[]).filter(l=>!logids.has(l.id)));if(old.photos.some(ph=>p.photos.some(x=>x.id===ph.id&&JSON.stringify(x)!==JSON.stringify(ph))))conflicts++}}await persist(merged);projects=merged;$('#settingsDialog').close();render();toast('Imported missing records. Existing versions kept.'+(conflicts?' '+conflicts+' jobs have same-ID differences; original backup kept unchanged.':''))}catch(err){toast('Import failed: '+err.message)}finally{e.target.value='';$('#importButton').disabled=false}};
// App-shell offline status; project data is never put in the service-worker cache.
const offlineNote=document.createElement('p');offlineNote.id='offlineStatus';offlineNote.className='notice';offlineNote.textContent='Checking offline support…';$('#settingsDialog').append(offlineNote);
const versionLabel=document.createElement('span');versionLabel.className='version-label';versionLabel.textContent='CarpenterCam 2.7.4 · Internal crew tool';$('#settingsDialog').append(versionLabel);
async function setupOffline(){if(location.protocol==='file:'){$('#offlineStatus').textContent='File mode: photos save locally, but offline page caching and GPS need HTTPS or localhost.';return}if(!('serviceWorker' in navigator)){$('#offlineStatus').textContent='Offline app cache is not supported in this browser. Export backups regularly.';return}try{await navigator.serviceWorker.register('./sw.js',{scope:'./'});await navigator.serviceWorker.ready;$('#offlineStatus').textContent=(window.jobcamCloudConfigured&&window.jobcamCloudConfigured()?'Works offline. New photos save on this phone and upload to your team’s cloud when you’re back online.':'Offline app ready after this online load. Works without internet.')}catch{$('#offlineStatus').textContent='Offline cache could not be installed. Keep this page open or retry on HTTPS. Local photos are still in browser storage.'}}
// Optional crew login; never enabled with invented keys, never auto-creates users.
const cloudDetails=document.createElement('details');cloudDetails.className='cloud-setup';cloudDetails.innerHTML='<summary>Crew login / live setup</summary><p class="caption">Local mode is working now. Live crew mode needs your own Supabase project and invited accounts. No account is created here. Never use a service-role or secret key.</p><form id="cloudConfig"><label class="field">Supabase project URL<input id="supabaseURL" type="url" required placeholder="https://PROJECT.supabase.co" autocomplete="off"></label><label class="field">Publishable / anon key<input id="supabaseKey" required placeholder="Public browser key only" autocomplete="off"></label><button class="secondary wide" type="submit">Connect crew service</button></form><form id="cloudLogin" hidden><label class="field">Invited account email<input id="crewEmail" type="email" required autocomplete="email"></label><button class="primary wide" type="submit">Email me a sign-in link</button><p class="caption">Existing invited accounts only. Open the link on this phone/browser.</p></form><div class="metadata-tools"><button class="secondary" id="cloudRefresh" hidden>Refresh crew photos</button><button class="secondary" id="localMode" hidden>Use local notebook</button><button class="secondary" id="cloudSignOut" hidden>Sign out</button></div><p class="v2-status" id="cloudStatus" role="status">Local notebook · no crew connection configured.</p>';$('#offlineStatus').before(cloudDetails);
function cloudStatus(text){$('#cloudStatus').textContent=text}
function updateStorageNote(){$('#storageNote').textContent=cloudStore?'Crew mode: private Supabase storage. Writes need internet. Owner/foreman see jobs remotely; assigned sub-trades see their jobs. Local notebook remains untouched.':'Saved on this phone only. Team cloud isn’t set up yet.';$('#importButton').disabled=!!cloudStore;}
async function refreshCloud(showToast=false){if(!cloudStore||refreshBusy||busy||!navigator.onLine)return;refreshBusy=true;try{const next=await cloudStore.list();projects=next;const activeDialog=[...document.querySelectorAll('dialog')].some(d=>d.open);if(!activeDialog)render();if(showToast)toast('Crew photos refreshed.');cloudStatus('Signed in: '+cloudProfile.display_name+' · '+cloudProfile.role+'\nLive refresh every 20 seconds while online. Last checked '+timeLabel(Date.now()))}catch(err){cloudStatus('Refresh failed: '+err.message)}finally{refreshBusy=false}}
async function enableCloud(client){const profile=await client.profile();const remoteProjects=await client.list();cloudProfile=profile;cloudStore=client;store=client;current=null;view='jobs';category=tag=query='';projects=remoteProjects;render();updateStorageNote();$('#cloudLogin').hidden=true;$('#cloudRefresh').hidden=$('#localMode').hidden=$('#cloudSignOut').hidden=false;cloudStatus('Signed in: '+profile.display_name+' · '+profile.role+'\nPrivate crew mode. Live refresh every 20 seconds.');clearInterval(cloudRefreshTimer);cloudRefreshTimer=setInterval(()=>refreshCloud(),20000)}
async function connectCloud(url,key,saveConfig=true){if(saveConfig){preferLocal=false;localStorage.setItem('johnny-prefer-local','false')}cloudStatus('Connecting…');const client=await JobcamAdapters.supabase(url,key);if(saveConfig)localStorage.setItem('johnny-cloud-config',JSON.stringify({url,key}));window.jobcamCloudClient=client;$('#localMode').hidden=false;const session=await client.session();if(session&&!preferLocal)await enableCloud(client);else{$('#cloudLogin').hidden=false;cloudStatus('Service configured. Sign in using an invited account. Local notebook remains active.')}client.onAuth(async session=>{if(session&&!cloudStore&&!preferLocal){try{await enableCloud(client)}catch(err){cloudStatus(err.message)}}else if(!session&&cloudStore){await switchToLocal();cloudStatus('Signed out. Local notebook active.')}})}
$('#cloudConfig').onsubmit=async e=>{e.preventDefault();const url=$('#supabaseURL').value.trim(),key=$('#supabaseKey').value.trim();try{if(!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(url))throw Error('Use the HTTPS project URL from Supabase.');if(/^sb_secret_/.test(key))throw Error('Do not enter a secret key. Use the publishable browser key.');if(key.startsWith('eyJ')){try{const payload=JSON.parse(atob(key.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));if(payload.role!=='anon')throw Error()}catch{throw Error('Only a public anon key may be used in this browser.')}}else if(!key.startsWith('sb_publishable_'))throw Error('Use a Supabase publishable key or legacy public anon key.');await connectCloud(url,key)}catch(err){cloudStatus('Connection not enabled: '+err.message)}};
$('#cloudLogin').onsubmit=async e=>{e.preventDefault();try{await window.jobcamCloudClient.login($('#crewEmail').value.trim(),location.href.split('#')[0].split('?')[0]);cloudStatus('Check your inbox for the sign-in link. No new account was created.')}catch(err){cloudStatus('Sign-in link could not be sent: '+err.message)}};
async function switchToLocal(){preferLocal=true;localStorage.setItem('johnny-prefer-local','true');clearInterval(cloudRefreshTimer);cloudStore=null;cloudProfile=null;store=JobcamAdapters.indexedDB({list:localLoad,save:localPersist});current=null;category=tag=query='';view='jobs';projects=await localLoad();render();updateStorageNote();$('#cloudRefresh').hidden=$('#cloudSignOut').hidden=true;cloudStatus('Local notebook active. Crew data remains in Supabase.');}
$('#localMode').onclick=switchToLocal;$('#cloudRefresh').onclick=()=>refreshCloud(true);$('#cloudSignOut').onclick=async()=>{try{await window.jobcamCloudClient.signOut();await switchToLocal();$('#cloudLogin').hidden=false}catch(err){cloudStatus(err.message)}};
window.addEventListener('online',()=>{if(cloudStore)refreshCloud()});
async function initV2(){store=JobcamAdapters.indexedDB({list:localLoad,save:localPersist});await setupOffline();try{preferLocal=localStorage.getItem('johnny-prefer-local')==='true';const cfg=JSON.parse(localStorage.getItem('johnny-cloud-config')||'null');if(cfg){$('#supabaseURL').value=cfg.url;$('#supabaseKey').value=cfg.key;await connectCloud(cfg.url,cfg.key,false)}}catch(err){cloudStatus('Local notebook active. Crew setup: '+err.message)}window.jobcamReady=true;}
startNotebook();
/* v2.6.1: keep content clear of the fixed bottom menu and the (taller, with the sync banner) sticky header.
   The real bar heights (incl. the iPhone home-bar safe area) are measured live into --nav-h / --hdr-h. */
(function(){const st=document.createElement('style');st.textContent='html{scroll-padding-top:calc(var(--hdr-h,0px) + 8px);scroll-padding-bottom:calc(var(--nav-h,80px) + 12px)}#main.container{padding-bottom:calc(var(--nav-h,80px) + env(safe-area-inset-bottom,0px) + 24px)}.app-problem{bottom:calc(var(--nav-h,80px) + 12px)!important}.toast{bottom:calc(var(--nav-h,80px) + 20px)!important}';document.head.append(st);
  const root=document.documentElement;function measure(){const nav=document.querySelector('.bottom-nav'),hdr=document.querySelector('.header');const nh=nav&&!nav.hidden&&getComputedStyle(nav).display!=='none'?Math.ceil(nav.getBoundingClientRect().height):0;const hh=hdr&&!hdr.hidden&&getComputedStyle(hdr).position==='sticky'?Math.ceil(hdr.getBoundingClientRect().height):0;root.style.setProperty('--nav-h',nh+'px');root.style.setProperty('--hdr-h',hh+'px')}
  measure();if(window.ResizeObserver){const ro=new ResizeObserver(measure);const watch=()=>{const n=document.querySelector('.bottom-nav'),h=document.querySelector('.header');if(n)ro.observe(n);if(h)ro.observe(h)};watch()}if(window.MutationObserver){new MutationObserver(measure).observe(document.body,{attributes:true,subtree:true,attributeFilter:['hidden']})}window.addEventListener('resize',measure);window.addEventListener('orientationchange',measure)})();

/* v2.6.2: Carpenter Johnny logo for saved/shared client galleries and reports (those pages only allow data: images) */
let LOGO_DATA='';fetch('./icons/logo-full-320.png').then(r=>r.ok?r.blob():Promise.reject()).then(b=>new Promise(res=>{const f=new FileReader();f.onload=()=>res(f.result);f.readAsDataURL(b)})).then(d=>{LOGO_DATA=d}).catch(()=>{});
