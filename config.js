/* JobCam cloud settings. While these are placeholders the app is 100% local (exactly like before).
   To switch on admin logins + client links, paste the Project URL and the PUBLISHABLE (or legacy anon) key
   from Supabase -> Project Settings -> API Keys. Both are public by design. NEVER paste a secret/service_role key. */
window.JOBCAM_CONFIG={
  SUPABASE_URL:'PASTE_SUPABASE_URL',
  SUPABASE_ANON_KEY:'PASTE_SUPABASE_PUBLISHABLE_KEY'
};
window.jobcamCloudConfigured=function(){
  const c=window.JOBCAM_CONFIG||{},url=String(c.SUPABASE_URL||''),key=String(c.SUPABASE_ANON_KEY||'');
  if(!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(url))return false;
  if(key.length<20||/^PASTE_/i.test(key)||/^sb_secret_/i.test(key))return false;
  const parts=key.split('.');
  if(parts.length===3){try{const claims=JSON.parse(atob(parts[1].replace(/-/g,'+').replace(/_/g,'/')));if(claims.role!=='anon')return false}catch{return false}}
  return true;
};
