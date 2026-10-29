(window.OCD_V=window.OCD_V||{})['settings.js']='0.2.0';
/* Settings modal: GitHub repo + token (stored in this browser only). */
window.OCDSettings=(()=>{
  const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  let box=null;
  function build(){
    box=document.createElement('div'); box.className='ocd-modal'; box.hidden=true;
    box.innerHTML=`<div class="ocd-box"><h3>Settings</h3>
      <p class="ocd-help">Your GitHub token lets the dashboard save changes. It is stored only in this browser (not in the repo), so enter it once on each device.</p>
      <label>Repository<input id="set-repo" type="text"></label>
      <label>Branch<input id="set-branch" type="text"></label>
      <label>Bookkeeping repository (private)<input id="set-books" type="text" placeholder="OldeCellar/Olde-Cellar-Bookeeping"></label>
      <label>GitHub token<input id="set-token" type="password" autocomplete="off" placeholder="github_pat_…"></label>
      <p class="ocd-msg" id="set-msg"></p>
      <div class="ocd-actions"><button class="ocd-btn danger" id="set-clear">Clear token</button><span style="flex:1"></span>
      <button class="ocd-btn ghost" id="set-close">Close</button><button class="ocd-btn" id="set-save">Save &amp; test</button></div></div>`;
    document.body.appendChild(box);
    box.addEventListener('click',e=>{if(e.target===box)close();});
    box.querySelector('#set-close').onclick=close;
    box.querySelector('#set-clear').onclick=()=>{const c=OCD.gh.cfg();c.token='';OCD.gh.setCfg(c);msg('Token cleared from this browser.');fill();};
    box.querySelector('#set-save').onclick=async()=>{
      const c={repo:val('set-repo').trim(),branch:val('set-branch').trim()||'main',booksRepo:val('set-books').trim()||'OldeCellar/Olde-Cellar-Bookeeping',token:val('set-token').trim()||OCD.gh.cfg().token};
      OCD.gh.setCfg(c); msg('Testing…');
      try{const t=await OCD.gh.test();let extra='';try{const b=OCD.books.cfg();const br=await fetch('https://api.github.com/repos/'+b.repo,{headers:OCD.gh.headers()});extra=br.ok?' Bookkeeping repo '+b.repo+': connected.':' Bookkeeping repo '+b.repo+': NOT reachable (HTTP '+br.status+') - give the token access to it.';}catch(_){}msg('Connected to '+t.repo+(t.canPush?'':' (read-only: this token cannot save)')+'. Data last saved '+(t.savedAt?new Date(t.savedAt).toLocaleString():'unknown')+'.'+extra,!t.canPush);fill();}
      catch(e){msg(e.message,true);}
    };
  }
  const val=id=>box.querySelector('#'+id).value, msg=(t,err)=>{const m=box.querySelector('#set-msg');m.textContent=t;m.className='ocd-msg'+(err?' err':'');};
  function fill(){const c=OCD.gh.cfg();box.querySelector('#set-repo').value=c.repo;box.querySelector('#set-branch').value=c.branch;box.querySelector('#set-books').value=c.booksRepo||'OldeCellar/Olde-Cellar-Bookeeping';box.querySelector('#set-token').value='';box.querySelector('#set-token').placeholder=c.token?'Token saved in this browser (leave blank to keep it)':'github_pat_…';}
  function open(note){if(!box)build();fill();msg(note||'');box.hidden=false;}
  function close(){if(box)box.hidden=true;}
  document.addEventListener('DOMContentLoaded',()=>{const b=document.getElementById('open-settings');if(b)b.onclick=()=>open();});
  if(document.readyState!=='loading'){const b=document.getElementById('open-settings');if(b)b.onclick=()=>open();}
  return{open,close};
})();
