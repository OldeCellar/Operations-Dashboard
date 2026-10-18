(window.OCD_V=window.OCD_V||{})['request-log.js']='0.1.0';
/* Request Log module: reads the public Google Sheet (gviz CSV). RequestLog.mount() runs once. */
window.RequestLog=(()=>{
let mounted=false,reload=()=>{};
function mount(){
if(mounted)return;mounted=true;
const root=document.getElementById("rl");


const SHEET_ID="1bbU3rU6K7-t5n1jnE6USjTngIFBTJEoAYgKQvsdlPMk",GID="0",CSV_URL=`https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&gid=${GID}`,GROWLER_L=1.95,SIXPACK_L=2.07,EXPO=.5;
// ============================================================
    // BEER CATEGORY ASSIGNMENTS
    //
    // primary     = the beer's main/default portfolio category.
    // categories  = every category view in which the beer should appear.
    //
    // A beer may appear in more than one view by listing multiple
    // categories. For example, MaiBock appears in both Seasonal
    // and Core Brands while Seasonal remains its primary category.
    // ============================================================
    const BEER_CATALOG = {
        "Czech Mate": {
            primary: "Core Brands",
            categories: ["Core Brands"]
        },
        "MaiBock": {
            primary: "Seasonal",
            categories: ["Seasonal", "Core Brands"]
        },
        "Equinox": {
            primary: "Core Brands",
            categories: ["Core Brands"]
        },
        "Mellow Yellow": {
            primary: "Core Brands",
            categories: ["Core Brands"]
        },
        "Golden Dragon": {
            primary: "Core Brands",
            categories: ["Core Brands"]
        },
        "Strata": {
            primary: "Core Brands",
            categories: ["Core Brands"]
        },
        "Pliny the Elder": {
            primary: "Core Brands",
            categories: ["Core Brands"]
        },
        "Queen Citra": {
            primary: "Core Brands",
            categories: ["Core Brands"]
        },
        "Zephyr": {
            primary: "Fillers",
            categories: ["Fillers"]
        },
        "Belma Bottom Blues": {
            primary: "Fillers",
            categories: ["Fillers"]
        },
        "NA Seltzer": {
            primary: "Fillers",
            categories: ["Fillers"]
        },
        "Hard Seltzer": {
            primary: "Fillers",
            categories: ["Fillers"]
        },
        "Rising Sun": {
            primary: "Fillers",
            categories: ["Fillers"]
        },
        "Fiddlers Flame": {
            primary: "Seasonal",
            categories: ["Seasonal","Fillers"]
        },
        "White Lotus": {
            primary: "Fillers",
            categories: ["Fillers"]
        },
        "Landshark Lager": {
            primary: "Fillers",
            categories: ["Fillers"]
        },
        "Low Tide IPA": {
            primary: "Fillers",
            categories: ["Fillers"]
        },
        "Modelo Negra": {
            primary: "Fillers",
            categories: ["Fillers"]
        },
        "Olde King Kolsch": {
            primary: "Seasonal",
            categories: ["Seasonal"]
        },
        "Vanilla Porter": {
            primary: "Seasonal",
            categories: ["Seasonal"]
        },
        "Dark Side of the Moon": {
            primary: "Seasonal",
            categories: ["Seasonal"]
        },
        "Poor Richards Spruce Ale": {
            primary: "Seasonal",
            categories: ["Seasonal"]
        },
        "Sam Adams October Fest": {
            primary: "Seasonal",
            categories: ["Seasonal"]
        }
};
let ROWS=[],filter="",view="weekly",sorts={all:{k:"popularityScore",d:-1},core:{k:"popularityScore",d:-1},fillers:{k:"popularityScore",d:-1},seasonal:{k:"popularityScore",d:-1},raw:{k:"date",d:-1}};
const esc=v=>String(v).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;");
const catalog=b=>BEER_CATALOG[b]||null;
const cat=b=>catalog(b)?.primary||"Uncategorized";
const cats=b=>catalog(b)?.categories||[];

function csv(t){let out=[],r=[],f="",q=false;for(let i=0;i<t.length;i++){let c=t[i];if(q){if(c==='"'){if(t[i+1]==='"'){f+='"';i++}else q=false}else f+=c}else if(c==='"')q=true;else if(c===','){r.push(f);f=""}else if(c==='\n'){r.push(f);out.push(r);r=[];f=""}else if(c!=='\r')f+=c}if(f||r.length){r.push(f);out.push(r)}return out}

function mdy(s){let p=(s||"").trim().split(/[\/\-]/);if(p.length!==3)return null;let [m,d,y]=p.map(Number);if(!m||!d||!y)return null;if(y<100)y+=2000;let z=new Date(y,m-1,d);return isNaN(z)?null:z}

function iso(d){let z=new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate())),day=z.getUTCDay()||7;z.setUTCDate(z.getUTCDate()+4-day);let ys=new Date(Date.UTC(z.getUTCFullYear(),0,1));return{y:z.getUTCFullYear(),w:Math.ceil(((z-ys)/86400000+1)/7)}}

function fmt(d){return `${d.getMonth()+1}/${d.getDate()}/${d.getFullYear()}`}

function weekStart(y,w){let j=new Date(Date.UTC(y,0,4)),day=j.getUTCDay()||7;j.setUTCDate(j.getUTCDate()-day+1+(w-1)*7);return j}
async function load(){let s=$("status");s.textContent="loading…";try{let res=await fetch(CSV_URL,{cache:"no-store"});if(!res.ok)throw Error(`HTTP ${res.status}`);let a=csv(await res.text()),start=mdy(a[0]?.[3])?0:1;ROWS=a.slice(start).map(x=>{let date=mdy(x[3]);if(!x?.[0]?.trim()||!date)return null;let z=iso(date),g=parseInt(x[1])||0,p=parseInt(x[2])||0;return{beer:x[0].trim(),growlers:g,sixpacks:p,date,dateStr:fmt(date),isoYearWk:z.y*100+z.w,volume:g*GROWLER_L+p*SIXPACK_L}}).filter(Boolean);if(!ROWS.length)throw Error("No valid rows found");s.textContent=`${ROWS.length} requests · updated ${new Date().toLocaleTimeString()}`;weeks();beerOptions();render()}catch(e){s.textContent=`Failed to load: ${e.message}`;s.className="err"}}
const $=id=>document.getElementById(id);function weeks(){let ws=[...new Set(ROWS.map(r=>r.isoYearWk))].sort((a,b)=>b-a),s=$("week");s.innerHTML=ws.map(w=>`<option value="${w}">${w} — ISO week ${w%100}, ${Math.floor(w/100)}</option>`).join("");$("weeksData").textContent=`${ws.length} weeks of data`;dateRange()}

function dateRange(){let x=+$("week").value,y=Math.floor(x/100),w=x%100,a=weekStart(y,w),b=new Date(a);b.setUTCDate(a.getUTCDate()+6);let ff=d=>d.toLocaleDateString(undefined,{timeZone:"UTC",weekday:"short",month:"short",day:"numeric"});$("weekDates").innerHTML=`<strong>${ff(a)} – ${ff(b)}, ${b.getUTCFullYear()}</strong>`}

function beerOptions(){let a=[...new Set(ROWS.map(r=>r.beer))].sort(),s=$("beer");s.innerHTML='<option value="">All beers</option>'+a.map(b=>`<option>${esc(b)}</option>`).join("");s.value=filter}

function rows(){return filter?ROWS.filter(r=>r.beer===filter):ROWS}
function metric(rs){let den={};ROWS.forEach(r=>den[r.isoYearWk]=(den[r.isoYearWk]||0)+r.volume);let a={};rs.forEach(r=>{let x=a[r.beer]||(a[r.beer]={beer:r.beer,requests:0,growlers:0,sixpacks:0,volume:0,weeks:new Set(),bw:{},firstDate:r.date,lastDate:r.date});x.requests++;x.growlers+=r.growlers;x.sixpacks+=r.sixpacks;x.volume+=r.volume;x.weeks.add(r.isoYearWk);x.bw[r.isoYearWk]=(x.bw[r.isoYearWk]||0)+r.volume;if(r.date<x.firstDate)x.firstDate=r.date;if(r.date>x.lastDate)x.lastDate=r.date});let l=Object.values(a).map(x=>{let ws=[...x.weeks],share=Object.entries(x.bw).reduce((n,[w,v])=>n+v/den[w],0)/ws.length;return{...x,category:cat(x.beer),categories:cats(x.beer),weeks:ws.length,avgVolWeek:x.volume/ws.length,avgWeeklyShare:share,status:x.weeks.size>=8?"Established":x.weeks.size>=4?"Early signal":"Limited data",pattern:pattern(ws.map(w=>w%100).sort((a,b)=>a-b))}}),max=Math.max(...l.map(x=>x.weeks),1);return l.map(x=>({...x,popularityScore:x.avgWeeklyShare*100*Math.pow(x.weeks/max,EXPO)}))}

function pattern(a){if(!a.length)return"—";let r=[],s=a[0],p=a[0];for(let i=1;i<a.length;i++){if(a[i]===p+1)p=a[i];else{r.push(s===p?`W${s}`:`W${s}–${p}`);s=p=a[i]}}r.push(s===p?`W${s}`:`W${s}–${p}`);return r.join(", ")}
function status(x){let c=x.status==="Established"?"established":x.status==="Early signal"?"early":"limited";return `<span class="status ${c}">${x.status}</span>`}

function sort(a,o){return a.sort((x,y)=>{let p=x[o.k],q=y[o.k];if(o.k==="firstDate"||o.k==="lastDate")return(p-q)*o.d;if(typeof p==="string")return p.localeCompare(q)*o.d;return(p-q)*o.d})}

function headers(type){return type==="all"?`<thead><tr><th data-k="beer">Beer</th><th data-k="avgVolWeek" class="num">Avg Vol/Week (L)</th><th data-k="avgWeeklyShare" class="num">Avg Weekly Share</th><th data-k="popularityScore" class="num">Popularity Score</th><th data-k="status">Data Status</th><th data-k="weeks" class="num">Weeks Offered</th><th data-k="requests" class="num">Requests</th><th data-k="volume" class="num">Total Volume (L)</th><th data-k="sixpacks" class="num">6-Packs</th><th data-k="growlers" class="num">Growlers</th></tr></thead>`:`<thead><tr><th data-k="beer">Beer</th><th data-k="avgVolWeek" class="num">Avg Vol/Week (L)</th><th data-k="avgWeeklyShare" class="num">Avg Weekly Share</th><th data-k="popularityScore" class="num">Popularity Score</th><th data-k="status">Data Status</th><th data-k="weeks" class="num">Weeks Offered</th><th data-k="volume" class="num">Total Volume (L)</th><th data-k="firstDate">First Offered</th><th data-k="lastDate">Last Offered</th><th data-k="pattern">ISO Weeks Seen</th></tr></thead>`}

function row(x,type){let base=`<td class="beer">${esc(x.beer)}</td><td class="num">${x.avgVolWeek.toFixed(2)}</td><td class="num">${(x.avgWeeklyShare*100).toFixed(2)}%</td><td class="num">${x.popularityScore.toFixed(2)}</td><td>${status(x)}</td><td class="num">${x.weeks}</td>`;return type==="all"?`<tr>${base}<td class="num">${x.requests}</td><td class="num">${x.volume.toFixed(2)}</td><td class="num">${x.sixpacks}</td><td class="num">${x.growlers}</td></tr>`:`<tr>${base}<td class="num">${x.volume.toFixed(2)}</td><td>${x.firstDate.toLocaleDateString()}</td><td>${x.lastDate.toLocaleDateString()}</td><td>${x.pattern}</td></tr>`}
function table(id,type,list,o){let t=$(id);t.innerHTML=headers(type)+`<tbody>${sort(list,o).map(x=>row(x,type)).join("")}</tbody>`;t.querySelectorAll("th").forEach(h=>h.classList.toggle("sorted",h.dataset.k===o.k))}

function pending(category,id){let p=Object.entries(BEER_CATALOG).filter(([b,c])=>c.categories.includes(category)&&!ROWS.some(r=>r.beer===b)).map(x=>x[0]).sort(),el=$(id);el.hidden=!p.length;if(p.length)el.innerHTML=`<h2>Planned / Not Yet Distributed — ${p.length}</h2><ul>${p.map(b=>`<li><span>${esc(b)}</span><small>No request-log data yet</small></li>`).join("")}</ul>`}
function catView(category,id,empty,sortKey,pendingId){let l=metric(rows()).filter(x=>x.categories.includes(category));table(id,"cat",l,sorts[sortKey]);$(empty).hidden=!!l.length;pending(category,pendingId)}
function render(){weekly();let m=metric(rows());table("allT","all",m,sorts.all);catView("Core Brands","coreT","coreEmpty","core","corePending");catView("Fillers","fillersT","fillersEmpty","fillers","fillersPending");catView("Seasonal","seasonalT","seasonalEmpty","seasonal","seasonalPending");let u=m.filter(x=>x.category==="Uncategorized").map(x=>x.beer),n=$("uncat");n.hidden=!u.length;if(u.length)n.innerHTML=`<b>${u.length} uncategorized beer${u.length===1?"":"s"}:</b> ${u.map(esc).join(", ")}`;raw()}
function weekly(){let r=rows().filter(x=>x.isoYearWk===+$("week").value),a={};r.forEach(x=>{let z=a[x.beer]||(a[x.beer]={n:0,g:0,p:0,v:0});z.n++;z.g+=x.growlers;z.p+=x.sixpacks;z.v+=x.volume});let l=Object.entries(a).sort((x,y)=>y[1].v-x[1].v),t=r.reduce((z,x)=>({n:z.n+1,g:z.g+x.growlers,p:z.p+x.sixpacks,v:z.v+x.volume}),{n:0,g:0,p:0,v:0});$("weeklyT").querySelector("tbody").innerHTML=l.map(([b,x])=>`<tr><td class="beer">${esc(b)}</td><td class="num">${x.n}</td><td class="num">${x.g}</td><td class="num">${x.p}</td><td class="num">${x.v.toFixed(2)}</td></tr>`).join("");$("weeklyT").querySelector("tfoot").innerHTML=`<tr><td>Total</td><td class="num">${t.n}</td><td class="num">${t.g}</td><td class="num">${t.p}</td><td class="num">${t.v.toFixed(2)}</td></tr>`;$("stats").innerHTML=`<div class="stat"><b>${l.length}</b><small>Beers requested</small></div><div class="stat"><b>${t.n}</b><small>Total requests</small></div><div class="stat"><b>${t.v.toFixed(1)} L</b><small>Total volume</small></div>`}

function raw(){let q=$("search").value.toLowerCase(),a=rows().filter(x=>x.beer.toLowerCase().includes(q));a=sort(a,sorts.raw);$("rawT").querySelector("tbody").innerHTML=a.map(x=>`<tr><td>${x.dateStr}</td><td>${x.isoYearWk}</td><td class="beer">${esc(x.beer)}</td><td class="num">${x.growlers}</td><td class="num">${x.sixpacks}</td><td class="num">${x.volume.toFixed(2)}</td></tr>`).join("")}
$("refresh").onclick=load;$("beer").onchange=e=>{filter=e.target.value;render()};$("week").onchange=()=>{dateRange();render()};$("search").oninput=raw;root.querySelectorAll(".tab").forEach(b=>b.onclick=()=>{root.querySelectorAll(".tab,.view").forEach(x=>x.classList.remove("active"));b.classList.add("active");$("v-"+b.dataset.v).classList.add("active")});[["allT","all",()=>render()],["coreT","core",()=>catView("Core Brands","coreT","coreEmpty","core","corePending")],["fillersT","fillers",()=>catView("Fillers","fillersT","fillersEmpty","fillers","fillersPending")],["seasonalT","seasonal",()=>catView("Seasonal","seasonalT","seasonalEmpty","seasonal","seasonalPending")],["rawT","raw",raw]].forEach(([id,k,fn])=>$(id).addEventListener("click",e=>{let h=e.target.closest("th[data-k]");if(!h)return;let o=sorts[k];o.d=o.k===h.dataset.k?-o.d:-1;o.k=h.dataset.k;fn()}));load();reload=load;
}
return{mount,reload:()=>mounted&&reload()};
})();
