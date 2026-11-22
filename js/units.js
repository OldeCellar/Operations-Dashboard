(window.OCD_V=window.OCD_V||{})['units.js']='0.1.1';
/* Units tab: the size of each request unit (Growler, Six-pack, ...) in liters.
   Saved to brewery_data.json as "requestUnits" through OCD.save (re-reads the latest file, applies the change, commits).
   Every Dashboard calculation reads sizes from OCD.requestUnits (js/data.js). No table yet = built-in defaults 1.95 L / 2.07 L. */
window.Units=(()=>{
  let started=false,wired=false,draft=[];
  const $=id=>document.getElementById(id);
  const MAXL=50;
  const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const newId=()=>'unit-'+((window.crypto&&crypto.randomUUID)?crypto.randomUUID().replace(/-/g,'').slice(0,12):(Date.now().toString(36)+Math.random().toString(36).slice(2,8)));
  const fmt=v=>String(Math.round(Number(v)*1000)/1000);

  function injectStyle(){
    if(document.getElementById('un-style')) return;
    const s=document.createElement('style'); s.id='un-style';
    s.textContent=`#un .un-note{font:12px var(--mono);color:var(--ink-2);margin:0 0 12px;max-width:760px;line-height:1.5}
#un .un-status{font:12px var(--mono);color:var(--ink-3);margin:0 0 10px}
#un .un-status.err{color:var(--red);font-weight:700}
#un .tablewrap{overflow-x:auto;background:var(--panel);border:1px solid var(--border);border-radius:6px;max-width:760px}
#un table{border-collapse:collapse;width:100%;font-size:13px}
#un th{background:#8a8478;color:#fff;font:11px var(--mono);letter-spacing:.08em;text-transform:uppercase;text-align:left;padding:9px 10px;white-space:nowrap}
#un td{padding:8px 10px;border-top:1px solid var(--border);vertical-align:middle}
#un th.n{text-align:right}
#un input[type=text]{font:13px var(--mono);padding:6px 8px;border:1px solid var(--border);border-radius:3px;background:#fff;color:var(--ink);width:100%;box-sizing:border-box}
#un input.vol{text-align:right;max-width:110px}
#un td.id{font:11px var(--mono);color:var(--ink-3)}
#un td.tag{font:11px var(--mono);color:var(--ink-2);white-space:nowrap}
#un tr.off{opacity:.55}
#un .un-actions{display:flex;gap:10px;align-items:center;margin-top:12px;max-width:760px}
#un .rm{font:11px var(--mono);padding:3px 9px;border:1px solid var(--btn-hover);background:var(--btn);border-radius:3px;cursor:pointer;color:var(--ink)}`;
    document.head.appendChild(s);
  }
  function build(){
    $('un').innerHTML=`<p class="un-note">Set the size in liters of each unit a customer can request. The Beer Request app (Code.gs) reads these sizes for every order once Stage 3A-2 is installed. The Request Log shows the liters recorded in the Database tab for completed requests, and uses these sizes only for rows that have no recorded liters. Built-in units cannot be removed. A saved unit can be switched off with Active instead of being deleted, so history keeps its meaning. A six-pack is 6 &times; 0.345 L = 2.07 L.</p>
<p class="un-status" id="un-status"></p>
<div class="tablewrap"><table><thead><tr><th>Unit name</th><th class="n">Liters per unit</th><th>Active</th><th>ID</th><th></th></tr></thead><tbody id="un-body"></tbody></table></div>
<div class="un-actions"><button class="ocd-btn ghost" id="un-add">+ Add unit</button><span style="flex:1"></span><button class="ocd-btn ghost" id="un-revert">Discard changes</button><button class="ocd-btn" id="un-save">Save units</button></div>`;
  }
  function wire(){
    if(wired) return; wired=true;
    $('un-add').onclick=()=>{draft.push({id:newId(),name:'',volL:'',active:true,builtin:false,isNew:true});render();const r=$('un-body').querySelectorAll('input[data-f=name]');if(r.length)r[r.length-1].focus();};
    $('un-revert').onclick=()=>{loadDraft();render();status('Changes discarded.');};
    $('un-save').onclick=save;
    const body=$('un-body');
    body.addEventListener('input',e=>{const t=e.target,id=t.dataset.id,f=t.dataset.f,r=draft.find(x=>x.id===id);if(r&&(f==='name'||f==='volL'))r[f]=t.value;});
    body.addEventListener('change',e=>{const t=e.target;if(t.dataset.f==='active'){const r=draft.find(x=>x.id===t.dataset.id);if(r){r.active=t.checked;render();}}});
    body.addEventListener('click',e=>{const b=e.target.closest('[data-rm]');if(b){draft=draft.filter(x=>x.id!==b.dataset.rm);render();}});
  }
  function loadDraft(){draft=OCD.requestUnits.list().map(u=>({id:u.id,name:u.name||'',volL:fmt(u.volL),active:u.active!==false,builtin:!!u.builtin,isNew:false}));}
  function status(text,err){const s=$('un-status');if(!s)return;s.className='un-status'+(err?' err':'');s.textContent=text;}
  function baseStatus(){
    const d=OCD.get();
    if(!d){status('Could not load the data file'+(OCD.status.error?': '+OCD.status.error:'.'),true);return;}
    status((OCD.requestUnits.hasTable()?'Saved table in use':'No table saved yet: the built-in defaults are in use. Press Save units to create it')+' · data saved '+(d.savedAt?new Date(d.savedAt).toLocaleString():'unknown')+(OCD.gh.has()?'':' · add your GitHub token in Settings to save'));
  }
  function render(){
    $('un-body').innerHTML=draft.map(r=>`<tr class="${r.active?'':'off'}">
      <td><input type="text" data-f="name" data-id="${esc(r.id)}" value="${esc(r.name)}" placeholder="e.g. Bottle" autocomplete="off"></td>
      <td class="n"><input type="text" class="vol" inputmode="decimal" data-f="volL" data-id="${esc(r.id)}" value="${esc(r.volL)}" placeholder="0.000" autocomplete="off"></td>
      <td>${r.builtin?'<span class="tag">Always on</span>':`<input type="checkbox" data-f="active" data-id="${esc(r.id)}" ${r.active?'checked':''}>`}</td>
      <td class="id">${esc(r.id)}</td>
      <td class="tag">${r.builtin?'Built-in':(r.isNew?`<button class="rm" data-rm="${esc(r.id)}">Remove</button>`:'')}</td></tr>`).join('')||'<tr><td colspan="5">No units.</td></tr>';
  }
  function collect(){
    const out=[],names=new Set();
    for(const r of draft){
      const name=String(r.name).trim(); if(!name) throw new Error('Every unit needs a name.');
      const k=name.toLowerCase(); if(names.has(k)) throw new Error('Two units are called "'+name+'". Names must be different.'); names.add(k);
      const raw=String(r.volL).trim().replace(',','.'), v=raw===''?NaN:Number(raw);
      if(!isFinite(v)||v<=0||v>MAXL) throw new Error('"'+name+'": liters per unit must be a number above 0 and at most '+MAXL+'.');
      out.push({id:r.id,name,volL:Math.round(v*1000)/1000,active:r.builtin?true:!!r.active,builtin:!!r.builtin});
    }
    return out;
  }
  async function save(){
    if(!OCD.gh.has()){OCDSettings.open('To save, paste your GitHub token and click Save & test.');return;}
    let out; try{out=collect();}catch(e){status(e.message,true);return;}
    const before=new Map(OCD.requestUnits.list().map(u=>[u.id,u]));
    const changed=out.filter(u=>before.has(u.id)&&Number(before.get(u.id).volL)!==u.volL);
    if(changed.length&&!confirm('Completed requests keep the liters recorded in the Database tab. Changing a size re-values only rows with no recorded liters, and the size used for new orders:\n\n'+changed.map(u=>'  '+u.name+': '+fmt(before.get(u.id).volL)+' L to '+fmt(u.volL)+' L').join('\n')+'\n\nContinue?')) return;
    const btn=$('un-save'); btn.disabled=true; status('Saving to GitHub…');
    try{
      await OCD.save(obj=>{
        const cur=Array.isArray(obj.requestUnits)?obj.requestUnits:[], byId=new Map(cur.map(u=>[u.id,u]));
        out.forEach(u=>{const e=byId.get(u.id); if(e) Object.assign(e,u); else {const c=Object.assign({},u); cur.push(c); byId.set(c.id,c);}});
        obj.requestUnits=cur;
      },'Update request unit sizes (dashboard)');
      loadDraft(); render(); baseStatus();
      status('Saved to GitHub. '+$('un-status').textContent);
      try{ if(window.RequestLog&&RequestLog.reload) RequestLog.reload(); }catch(e){}
      try{ if(window.OnTap&&OnTap.reload) OnTap.reload(); }catch(e){}
    }catch(e){status(e.message,true);}
    finally{btn.disabled=false;}
  }
  function start(){loadDraft();render();baseStatus();}
  return{
    mount(){ if(started) return; started=true; injectStyle(); build(); wire(); OCD.ready.then(start); },
    reload(){ if(started) OCD.reload().then(start); }
  };
})();
