(window.OCD_V=window.OCD_V||{})['on-tap.js']='0.7.0';
/* On Tap module (from OldeCellarOnTap). Auto mode = live Brewfather when a key is saved in this browser, else snapshot. */

(function(){
  "use strict";

  const LS_KEYS = {
    userId: 'ontap_bf_userid',
    apiKey: 'ontap_bf_apikey',
    tappedField: 'ontap_field_tapped',
    kickedField: 'ontap_field_kicked',
    volUnit: 'ontap_vol_unit',
    conditioningField: 'ontap_field_conditioning',
    volOnHandDateField: 'ontap_field_voh_date',
    dataSource: 'ontap_data_source'
  };

  let currentTab = 'ontap';
  let lastComputed = null; // { kegs, conditioning }

  const el = {
    statusLine: document.getElementById('ot-statusLine'),
    content: document.getElementById('ot-content'),
    settingsBtn: document.getElementById('ot-settingsBtn'),
    refreshBtn: document.getElementById('ot-refreshBtn'),
    settingsOverlay: document.getElementById('ot-settingsOverlay'),
    closeSettingsBtn: document.getElementById('ot-closeSettingsBtn'),
    saveSettingsBtn: document.getElementById('ot-saveSettingsBtn'),
    dataSourceInput: document.getElementById('ot-dataSourceInput'),
    userIdInput: document.getElementById('ot-userIdInput'),
    apiKeyInput: document.getElementById('ot-apiKeyInput'),
    tappedFieldInput: document.getElementById('ot-tappedFieldInput'),
    kickedFieldInput: document.getElementById('ot-kickedFieldInput'),
    volUnitInput: document.getElementById('ot-volUnitInput'),
    conditioningFieldInput: document.getElementById('ot-conditioningFieldInput'),
    volOnHandDateFieldInput: document.getElementById('ot-volOnHandDateFieldInput'),
    debugPanel: document.getElementById('ot-debugPanel'),
    debugOutput: document.getElementById('ot-debugOutput'),
    tabbar: document.getElementById('ot-tabbar')
  };

  const TAP_COLORS = ['#c1861f', '#a8501f', '#4d7654', '#3f6f95', '#8a4f95', '#8a7519'];

  // ---------- Request Log integration (public "Olde Cellar – Public View" sheet) ----------
  const REQUEST_SHEET_ID = "1bbU3rU6K7-t5n1jnE6USjTngIFBTJEoAYgKQvsdlPMk";
  const REQUEST_GID = "0";
  const REQUEST_CSV_URL = 'https://docs.google.com/spreadsheets/d/' + REQUEST_SHEET_ID + '/gviz/tq?tqx=out:csv&gid=' + REQUEST_GID;
  const GROWLER_L = 1.95;
  const SIXPACK_L = 6 * 0.345; // 2.07

  function parseRequestCSV(text){
    const rows = [];
    let row = [], field = "", inQuotes = false;
    for(let i=0;i<text.length;i++){
      const c = text[i];
      if(inQuotes){
        if(c === '"'){
          if(text[i+1] === '"'){ field += '"'; i++; }
          else inQuotes = false;
        } else field += c;
      } else {
        if(c === '"') inQuotes = true;
        else if(c === ','){ row.push(field); field = ""; }
        else if(c === '\n'){ row.push(field); rows.push(row); row = []; field = ""; }
        else if(c === '\r'){ /* skip */ }
        else field += c;
      }
    }
    if(field.length || row.length){ row.push(field); rows.push(row); }
    return rows;
  }

  function parseRequestMDY(str){
    if(!str) return null;
    const parts = str.trim().split(/[\/\-]/);
    if(parts.length !== 3) return null;
    let [m, d, y] = parts.map(s => parseInt(s, 10));
    if(!m || !d || !y) return null;
    if(y < 100) y += 2000;
    const dt = new Date(y, m - 1, d);
    return isNaN(dt.getTime()) ? null : dt;
  }

  async function fetchRequestRows(){
    const resp = await fetch(REQUEST_CSV_URL, { cache: "no-store" });
    if(!resp.ok) throw new Error('Request Log HTTP ' + resp.status);
    const text = await resp.text();
    const table = parseRequestCSV(text);
    if(!table.length) return [];

    // detect header row (skip if first row's column D doesn't look like a date)
    let startIdx = 0;
    const first = table[0];
    if(first[3] !== undefined && parseRequestMDY(first[3]) === null) startIdx = 1;

    const rows = [];
    for(let i = startIdx; i < table.length; i++){
      const r = table[i];
      if(!r || r.length < 4) continue;
      const beer = (r[0] || "").trim();
      const growlers = parseInt(r[1], 10) || 0;
      const sixpacks = parseInt(r[2], 10) || 0;
      const dt = parseRequestMDY(r[3]);
      if(!beer || !dt) continue;
      const volume = growlers * GROWLER_L + sixpacks * SIXPACK_L;
      rows.push({ beer, growlers, sixpacks, date: dt, volume });
    }
    return rows;
  }

  function getSettings(){
    return {
      userId: localStorage.getItem(LS_KEYS.userId) || '',
      apiKey: localStorage.getItem(LS_KEYS.apiKey) || '',
      tappedField: localStorage.getItem(LS_KEYS.tappedField) || 'Date Tapped',
      kickedField: localStorage.getItem(LS_KEYS.kickedField) || 'Date Kicked',
      volUnit: localStorage.getItem(LS_KEYS.volUnit) || 'Liters',
      conditioningField: localStorage.getItem(LS_KEYS.conditioningField) || 'Conditioning Time',
      volOnHandDateField: localStorage.getItem(LS_KEYS.volOnHandDateField) || 'Vol On Hand Date',
      dataSource: localStorage.getItem(LS_KEYS.dataSource) || 'auto'
    };
  }

  function openSettings(){
    const s = getSettings();
    el.dataSourceInput.value = s.dataSource;
    el.userIdInput.value = s.userId;
    el.apiKeyInput.value = s.apiKey;
    el.tappedFieldInput.value = s.tappedField;
    el.kickedFieldInput.value = s.kickedField;
    el.volUnitInput.value = s.volUnit;
    el.conditioningFieldInput.value = s.conditioningField;
    el.settingsOverlay.style.display = 'flex';
  }
  function closeSettings(){ el.settingsOverlay.style.display = 'none'; }

  el.settingsBtn.addEventListener('click', openSettings);
  el.closeSettingsBtn.addEventListener('click', closeSettings);
  el.settingsOverlay.addEventListener('click', (e)=>{ if(e.target === el.settingsOverlay) closeSettings(); });
  el.saveSettingsBtn.addEventListener('click', ()=>{
    localStorage.setItem(LS_KEYS.dataSource, el.dataSourceInput.value);
    localStorage.setItem(LS_KEYS.userId, el.userIdInput.value.trim());
    localStorage.setItem(LS_KEYS.apiKey, el.apiKeyInput.value.trim());
    localStorage.setItem(LS_KEYS.tappedField, el.tappedFieldInput.value.trim() || 'Date Tapped');
    localStorage.setItem(LS_KEYS.kickedField, el.kickedFieldInput.value.trim() || 'Date Kicked');
    localStorage.setItem(LS_KEYS.volUnit, el.volUnitInput.value.trim() || 'Liters');
    localStorage.setItem(LS_KEYS.conditioningField, el.conditioningFieldInput.value.trim() || 'Conditioning Time');
    closeSettings();
    loadAndRender();
  });
  el.refreshBtn.addEventListener('click', loadAndRender);

  el.tabbar.addEventListener('click', (e)=>{
    const btn = e.target.closest('.tab');
    if(!btn) return;
    currentTab = btn.dataset.tab;
    el.tabbar.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t === btn));
    if(lastComputed) renderCurrentTab();
  });

  function setStatus(text, type){
    el.statusLine.className = 'status-line' + (type === 'error' ? ' error' : '');
    let dotClass = 'dot';
    if(type === 'error') dotClass += ' warn';
    if(type === 'loading') dotClass += ' pulse';
    el.statusLine.innerHTML = '<span class="' + dotClass + '"></span><span>' + text + '</span>';
  }

  // ---------- Brewfather fetch ----------

  async function fetchAllBatches(userId, apiKey){
    const auth = btoa(userId + ':' + apiKey);
    const batches = [];
    let startAfter = null;
    const limit = 50;
    for(let page = 0; page < 60; page++){ // hard safety cap ~3000 batches
      let url = 'https://api.brewfather.app/v2/batches?complete=True&limit=' + limit;
      if(startAfter) url += '&start_after=' + encodeURIComponent(startAfter);
      const res = await fetch(url, {
        headers: { 'Authorization': 'Basic ' + auth }
      });
      if(!res.ok){
        const bodyText = await res.text().catch(()=> '');
        throw new Error('Brewfather API returned ' + res.status + ' ' + res.statusText + (bodyText ? (' — ' + bodyText.slice(0,200)) : ''));
      }
      const pageData = await res.json();
      if(!Array.isArray(pageData) || pageData.length === 0) break;
      batches.push(...pageData);
      if(pageData.length < limit) break;
      startAfter = pageData[pageData.length - 1]._id;
    }
    return batches;
  }

  // ---------- Custom field extraction ----------

  // Recursively search a batch object for a {name: <target>, value: ...} pair,
  // since Brewfather's custom measurement fields aren't in a fixed documented location.
  function findMeasuredNode(batch, targetName){
    const target = String(targetName).trim().toLowerCase();
    let found = null;
    const seen = new Set();
    function walk(node){
      if(found !== null || node === null || node === undefined) return;
      if(typeof node !== 'object'){ return; }
      if(seen.has(node)) return;
      seen.add(node);
      if(Array.isArray(node)){
        for(const item of node){ walk(item); if(found !== null) return; }
        return;
      }
      const label = (typeof node.name === 'string' && node.name) ||
                    (typeof node.text === 'string' && node.text) || null;
      if(label && label.trim().toLowerCase() === target){
        if('value' in node && node.value !== '' && node.value !== null && node.value !== undefined){
          found = node;
          return;
        }
      }
      for(const key of Object.keys(node)){
        walk(node[key]);
        if(found !== null) return;
      }
    }
    walk(batch);
    if(found === null){
      // fallback: exact top-level key match, e.g. batch["Date Tapped"]
      if(targetName in batch && batch[targetName] !== null && batch[targetName] !== undefined && batch[targetName] !== ''){
        found = { value: batch[targetName] };
      }
    }
    return found;
  }

  function findMeasuredField(batch, targetName){
    const node = findMeasuredNode(batch, targetName);
    return node ? node.value : null;
  }

  function findMeasuredUnit(batch, targetName){
    const node = findMeasuredNode(batch, targetName);
    return (node && typeof node.unit === 'string') ? node.unit : null;
  }

  // Your Date Tapped / Date Kicked custom fields are entered as compact digit
  // strings (Brewfather wouldn't accept mm/dd/yyyy directly) — e.g. 7042026
  // means month=7, day=04, year=2026. Length 7 = M+DD+YYYY, length 8 = MM+DD+YYYY.
  function parseCompactDigitDate(str){
    let month, day, year;
    if(str.length === 8){
      month = str.slice(0,2); day = str.slice(2,4); year = str.slice(4,8);
    } else if(str.length === 7){
      month = str.slice(0,1); day = str.slice(1,3); year = str.slice(3,7);
    } else {
      return null;
    }
    const m = parseInt(month,10), d = parseInt(day,10), y = parseInt(year,10);
    if(!(m>=1 && m<=12) || !(d>=1 && d<=31) || y < 2000 || y > 2100) return null;
    const dt = new Date(y, m-1, d);
    return isNaN(dt.getTime()) ? null : dt;
  }

  function parseBFValue(v){
    if(v === null || v === undefined || v === '') return null;
    const asString = String(v).trim();
    // Compact digit-encoded date (your workaround for BF rejecting real dates)
    if(/^\d{7,8}$/.test(asString)){
      const compact = parseCompactDigitDate(asString);
      if(compact) return compact;
    }
    if(typeof v === 'number'){
      // Brewfather timestamps are epoch ms; guard against epoch-seconds just in case
      const ms = v < 10000000000 ? v * 1000 : v;
      const d = new Date(ms);
      return isNaN(d.getTime()) ? null : d;
    }
    if(typeof v === 'string'){
      const trimmed = v.trim();
      const asNum = Number(trimmed);
      if(!isNaN(asNum) && trimmed !== ''){
        const ms = asNum < 10000000000 ? asNum * 1000 : asNum;
        const d = new Date(ms);
        if(!isNaN(d.getTime())) return d;
      }
      const d2 = new Date(trimmed);
      if(!isNaN(d2.getTime())) return d2;
    }
    return null;
  }

  function getRecipeName(batch){
    if(batch.recipe && typeof batch.recipe.name === 'string' && batch.recipe.name.trim()){
      return batch.recipe.name;
    }
    return batch.name;
  }

  function normalizeBeerName(name){
    return (name || 'Unnamed Beer').trim().replace(/\s+/g, ' ');
  }

  function colorForBeer(name){
    let hash = 0;
    for(let i=0;i<name.length;i++){ hash = (hash * 31 + name.charCodeAt(i)) >>> 0; }
    return TAP_COLORS[hash % TAP_COLORS.length];
  }

  const FERMENT_COLORS = ['#a83232', '#8f2d3e', '#b5473a', '#7a2e2e', '#9c3b4f', '#b3512b'];
  function fermentColorForBeer(name){
    let hash = 0;
    for(let i=0;i<name.length;i++){ hash = (hash * 17 + name.charCodeAt(i)) >>> 0; }
    return FERMENT_COLORS[hash % FERMENT_COLORS.length];
  }

  function daysBetween(a, b){
    return (b.getTime() - a.getTime()) / 86400000;
  }

  const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  function fmtDate(d){
    const day = String(d.getDate()).padStart(2,'0');
    return MONTH_ABBR[d.getMonth()] + ' ' + day + ' ' + d.getFullYear();
  }

  // ---------- Core computation ----------

  function lookupAvgDuration(name, historyByBeer, breweryAvg){
    const hist = historyByBeer[name];
    const hasHistory = hist && hist.length > 0;
    const avgDays = hasHistory
      ? hist.reduce((a,c)=>a+c,0) / hist.length
      : breweryAvg;
    return {
      avgDays: (avgDays === undefined) ? null : avgDays,
      usedFallback: !hasHistory,
      historyCount: hasHistory ? hist.length : 0
    };
  }

  function computeHistory(batches, tappedFieldName, kickedFieldName){
    const historyByBeer = {}; // recipe name -> [durationDays]
    const allDurations = [];
    for(const b of batches){
      if(b.status === 'Completed') continue; // Completed = currently tapped, not history
      const name = normalizeBeerName(getRecipeName(b));
      const tappedDate = parseBFValue(findMeasuredField(b, tappedFieldName));
      const kickedDate = parseBFValue(findMeasuredField(b, kickedFieldName));
      if(tappedDate && kickedDate){
        const dur = daysBetween(tappedDate, kickedDate);
        if(dur > 0 && dur < 400){ // sanity guard against bad data
          if(!historyByBeer[name]) historyByBeer[name] = [];
          historyByBeer[name].push(dur);
          allDurations.push(dur);
        }
      }
    }
    const breweryAvg = allDurations.length
      ? allDurations.reduce((a,c)=>a+c,0) / allDurations.length
      : null;
    return { historyByBeer, breweryAvg };
  }

  // Averages the *entered* Conditioning Time value itself (not a date difference)
  // across every batch of a beer that has one set, regardless of status.
  function computeConditioningTimeHistory(batches, conditioningFieldName){
    const byBeer = {}; // recipe name -> [conditioningDays]
    const all = [];
    for(const b of batches){
      const name = normalizeBeerName(getRecipeName(b));
      const raw = findMeasuredField(b, conditioningFieldName);
      const days = (raw !== null && raw !== undefined && raw !== '') ? Number(raw) : null;
      if(days !== null && !isNaN(days) && days > 0 && days < 400){
        if(!byBeer[name]) byBeer[name] = [];
        byBeer[name].push(days);
        all.push(days);
      }
    }
    const breweryAvg = all.length ? all.reduce((a,c)=>a+c,0) / all.length : null;
    return { byBeer, breweryAvg };
  }

  const KEGERATOR_FIELD = 'Vol To Kegerator'; // Brewfather custom batch field, liters moved into a kegerator
  function kegeratorVolOf(b){
    const raw = findMeasuredField(b, KEGERATOR_FIELD);
    const n = (typeof raw === 'number') ? raw : (raw ? Number(raw) : 0);
    return (isNaN(n) || n < 0) ? 0 : n;
  }
  function batchKeyOf(b, name, tappedDate){
    return b._id || (b.batchNo != null ? ('batchno-' + b.batchNo) : (name + '-' + tappedDate.getTime()));
  }

  function computeOnTap(batches, tappedFieldName, kickedFieldName, historyByBeer, breweryAvg){
    const currentlyTapped = []; // { name, tappedDate, batchNumber }

    for(const b of batches){
      if(b.status !== 'Completed') continue;
      const name = normalizeBeerName(getRecipeName(b));
      const tappedDate = parseBFValue(findMeasuredField(b, tappedFieldName));
      const kickedDate = parseBFValue(findMeasuredField(b, kickedFieldName));
      if(tappedDate && !kickedDate){
        // Completed status + tapped + not yet kicked = currently pouring
        const volKegged = (typeof b.measuredBottlingSize === 'number') ? b.measuredBottlingSize : null;
        currentlyTapped.push({
          name,
          tappedDate,
          batchId: batchKeyOf(b, name, tappedDate),
          batchNumber: b.batchNo || b.batchNumber || null,
          volKegged,
          kegeratorVol: kegeratorVolOf(b),
          volOnHand: null // filled in from computeVolOnHand once the Request Log is loaded
        });
      }
    }

    const kegs = currentlyTapped.map(k => {
      const { avgDays, usedFallback, historyCount } = lookupAvgDuration(k.name, historyByBeer, breweryAvg);
      const now = new Date();
      const elapsedDays = daysBetween(k.tappedDate, now);
      const estKickDate = avgDays !== null ? new Date(k.tappedDate.getTime() + avgDays * 86400000) : null;
      const pctElapsed = avgDays ? Math.min(1, Math.max(0, elapsedDays / avgDays)) : 0;
      const daysRemaining = avgDays !== null ? Math.round(avgDays - elapsedDays) : null;

      return {
        name: k.name,
        batchId: k.batchId,
        batchNumber: k.batchNumber,
        tappedDate: k.tappedDate,
        volKegged: k.volKegged,
        kegeratorVol: k.kegeratorVol,
        volOnHand: k.volOnHand,
        avgDays,
        usedFallback,
        historyCount,
        estKickDate,
        pctElapsed,
        daysRemaining
      };
    });

    kegs.sort((a,b) => {
      if(a.daysRemaining === null) return 1;
      if(b.daysRemaining === null) return -1;
      return a.daysRemaining - b.daysRemaining;
    });

    return kegs;
  }

  // Vol On Hand: ONE calculation shared with the weekly report (js/vol-calc.js).
  // Anchor = last Brewfather recount (Vol On Hand + Vol On Hand Date) else Bottling Volume at Date Tapped,
  // minus requests since the anchor, minus events (Events tab), minus Vol To Kegerator when the anchor doesn't already exclude it.
  function computeVolOnHand(batches, tappedFieldName, kickedFieldName, requestRows){
    const ev = (window.OCD && OCD.get() && OCD.get().events) || [];
    return VolCalc.compute({ batches, requestRows, events: ev, tappedField: tappedFieldName, kickedField: kickedFieldName });
  }
  let lastInputs = null;   // { batches, requestRows, tappedField, kickedField } so events can be re-applied without re-fetching
  function applyVol(kegs, volOnHand){
    const byId = new Map(volOnHand.map(v => [v.batchId, v]));
    kegs.forEach(k => { const v = byId.get(k.batchId); k.volOnHand = (v && v.remaining !== null) ? Math.max(0, v.remaining) : null; });
  }
  function recomputeVol(){
    if(!lastInputs || !lastComputed) return;
    const li = lastInputs;
    lastComputed.volOnHand = computeVolOnHand(li.batches, li.tappedField, li.kickedField, li.requestRows);
    applyVol(lastComputed.kegs, lastComputed.volOnHand);
    renderCurrentTab();
  }

  function computeConditioning(batches, conditioningFieldName, historyByBeer, breweryAvg){
    const list = [];
    for(const b of batches){
      if(b.status !== 'Conditioning') continue;
      const name = normalizeBeerName(getRecipeName(b));
      const bottlingDate = parseBFValue(b.bottlingDate);
      const condRaw = findMeasuredField(b, conditioningFieldName);
      const condDays = (condRaw !== null && condRaw !== undefined && condRaw !== '') ? Number(condRaw) : null;
      const hasCondDays = condDays !== null && !isNaN(condDays);

      const readyDate = (bottlingDate && hasCondDays)
        ? new Date(bottlingDate.getTime() + condDays * 86400000)
        : null;

      const { avgDays, usedFallback, historyCount } = lookupAvgDuration(name, historyByBeer, breweryAvg);
      const estKickDate = (readyDate && avgDays !== null) ? new Date(readyDate.getTime() + avgDays * 86400000) : null;

      const now = new Date();
      let pctElapsed = 0, daysUntilReady = null;
      if(bottlingDate && hasCondDays){
        const elapsed = daysBetween(bottlingDate, now);
        pctElapsed = condDays > 0 ? Math.min(1, Math.max(0, elapsed / condDays)) : 1;
        daysUntilReady = Math.round(condDays - elapsed);
      }

      list.push({
        name,
        batchNumber: b.batchNo || b.batchNumber || null,
        bottlingDate,
        condDays: hasCondDays ? condDays : null,
        readyDate,
        pctElapsed,
        daysUntilReady,
        avgDays,
        usedFallback,
        historyCount,
        estKickDate,
        incomplete: !(bottlingDate && hasCondDays)
      });
    }

    list.sort((a,b) => {
      if(a.daysUntilReady === null) return 1;
      if(b.daysUntilReady === null) return -1;
      return a.daysUntilReady - b.daysUntilReady;
    });

    return list;
  }

  // Sums recipe.fermentation.steps[].stepTime (already in days per Brewfather's schema)
  function getFermentationScheduleDays(batch){
    if(batch.recipe && batch.recipe.fermentation && Array.isArray(batch.recipe.fermentation.steps)){
      const total = batch.recipe.fermentation.steps.reduce((sum, step) => {
        return sum + (typeof step.stepTime === 'number' ? step.stepTime : 0);
      }, 0);
      return total > 0 ? total : null;
    }
    return null;
  }

  function computeFermenting(batches, conditioningFieldName, condTimeByBeer, condTimeBreweryAvg, historyByBeer, breweryAvg){
    const list = [];
    for(const b of batches){
      if(b.status !== 'Fermenting') continue;
      const name = normalizeBeerName(getRecipeName(b));
      const brewDate = parseBFValue(b.brewDate);
      const fermDays = getFermentationScheduleDays(b);
      const hasFermDays = fermDays !== null;

      const doneDate = (brewDate && hasFermDays)
        ? new Date(brewDate.getTime() + fermDays * 86400000)
        : null;

      const now = new Date();
      let pctElapsed = 0, daysUntilDone = null;
      if(brewDate && hasFermDays){
        const elapsed = daysBetween(brewDate, now);
        pctElapsed = fermDays > 0 ? Math.min(1, Math.max(0, elapsed / fermDays)) : 1;
        daysUntilDone = Math.round(fermDays - elapsed);
      }

      // Conditioning Time: use the batch's own entered value if present,
      // otherwise fall back to this beer's historical average, then brewery average.
      const ownCondRaw = findMeasuredField(b, conditioningFieldName);
      const ownCondDays = (ownCondRaw !== null && ownCondRaw !== undefined && ownCondRaw !== '') ? Number(ownCondRaw) : null;
      const hasOwnCond = ownCondDays !== null && !isNaN(ownCondDays) && ownCondDays > 0;

      let condDays = null, condSource = 'none';
      if(hasOwnCond){
        condDays = ownCondDays;
        condSource = 'entered';
      } else {
        const beerCondHist = condTimeByBeer[name];
        if(beerCondHist && beerCondHist.length){
          condDays = beerCondHist.reduce((a,c)=>a+c,0) / beerCondHist.length;
          condSource = 'beer average';
        } else if(condTimeBreweryAvg !== null){
          condDays = condTimeBreweryAvg;
          condSource = 'brewery average';
        }
      }

      const readyDate = (doneDate && condDays !== null)
        ? new Date(doneDate.getTime() + condDays * 86400000)
        : null;

      const { avgDays, usedFallback, historyCount } = lookupAvgDuration(name, historyByBeer, breweryAvg);
      const estKickDate = (readyDate && avgDays !== null) ? new Date(readyDate.getTime() + avgDays * 86400000) : null;

      list.push({
        name,
        batchNumber: b.batchNo || b.batchNumber || null,
        brewDate,
        fermDays: hasFermDays ? fermDays : null,
        doneDate,
        pctElapsed,
        daysUntilDone,
        condDays,
        condSource,
        readyDate,
        avgDays,
        usedFallback,
        historyCount,
        estKickDate,
        incomplete: !(brewDate && hasFermDays)
      });
    }

    list.sort((a,b) => {
      if(a.daysUntilDone === null) return 1;
      if(b.daysUntilDone === null) return -1;
      return a.daysUntilDone - b.daysUntilDone;
    });

    return list;
  }

  // ---------- Render ----------

  function renderOnTap(kegs){
    if(kegs.length === 0){
      el.content.innerHTML =
        '<div class="empty-state"><strong>Nothing on tap right now</strong>' +
        'No Completed batches have a ' + '"' + getSettings().tappedField + '"' + ' date without a matching kicked date.<br>' +
        'Check the debug panel below if you expected beers to show here.</div>';
      return;
    }

    const volUnit = getSettings().volUnit;

    const cards = kegs.map(k => {
      const pct = Math.round(k.pctElapsed * 100);
      const overdue = k.daysRemaining !== null && k.daysRemaining < 0;
      const fresh = daysBetween(k.tappedDate, new Date()) < 2;
      const color = colorForBeer(k.name);

      let badge = '';
      if(overdue){
        badge = '<span class="keg-badge overdue">' + Math.abs(k.daysRemaining) + 'd overdue</span>';
      } else if(fresh){
        badge = '<span class="keg-badge fresh">Just tapped</span>';
      } else if(k.daysRemaining !== null){
        badge = '<span class="keg-badge">' + k.daysRemaining + '-d left</span>';
      }

      const remainingLabel = k.avgDays === null
        ? 'no estimate'
        : (overdue ? 'likely kicked' : pct + '% poured');

      const historyNote = k.avgDays === null
        ? 'No history for this beer or the brewery yet — estimate unavailable.'
        : (k.usedFallback
            ? 'No history for this beer yet — using brewery average (' + Math.round(k.avgDays) + ' day est.)'
            : 'Based on ' + k.historyCount + ' prior keg' + (k.historyCount === 1 ? '' : 's') + ' of this beer, avg ' + Math.round(k.avgDays) + ' days on tap.');

      return (
        '<div class="keg" style="--tap-color:' + color + '">' +
          badge +
          '<div class="keg-name">' + escapeHtml(k.name) + '</div>' +
          '<div class="gauge-wrap">' +
            '<div class="gauge-fill" style="width:' + Math.min(100, pct) + '%"></div>' +
            '<div class="gauge-label"><span>' + fmtDate(k.tappedDate) + '</span><span>' + remainingLabel + '</span></div>' +
          '</div>' +
          '<div class="keg-meta">' +
            '<span>Tapped <b>' + fmtDate(k.tappedDate) + '</b></span>' +
            '<span>Est. kicks <b>' + (k.estKickDate ? fmtDate(k.estKickDate) : '—') + '</b></span>' +
          '</div>' +
          '<div class="keg-meta">' +
            '<span>Kegged <b>' + (k.volKegged !== null ? (Math.round(k.volKegged * 100) / 100) + ' ' + volUnit : '—') + '</b></span>' +
            (k.kegeratorVol > 0 ? '<span>Kegerator <b>' + (Math.round(k.kegeratorVol * 100) / 100) + ' ' + volUnit + '</b></span>' : '') +
            '<span>On Hand <b>' + (k.volOnHand !== null ? (Math.round(k.volOnHand * 100) / 100) + ' ' + volUnit : '—') + '</b></span>' +
          '</div>' +
          '<div class="keg-history">' + historyNote + '</div>' +
        '</div>'
      );
    }).join('');

    el.content.innerHTML = '<div class="grid">' + cards + '</div>';
  }

  function renderVolOnHand(list, requestLogError){
    if(requestLogError){
      el.content.innerHTML =
        '<div class="empty-state"><strong>Couldn\'t load the Request Log</strong>' +
        escapeHtml(requestLogError) + '<br>Vol On Hand needs both Brewfather batch data and the Request Log sheet to compute.</div>';
      return;
    }
    if(list.length === 0){
      el.content.innerHTML =
        '<div class="empty-state"><strong>Nothing to project yet</strong>' +
        'No Completed batches have a ' + '"' + getSettings().tappedField + '"' + ' date.</div>';
      return;
    }
    const today = VolCalc.toCompact(new Date());
    const live = list.filter(k => !k.kickedInBF).sort((a,b) => (a.remaining ?? Infinity) - (b.remaining ?? Infinity));
    const done = list.filter(k => k.kickedInBF);
    const row = (label, val, cls) => '<div class="voh-row' + (cls ? ' ' + cls : '') + '"><span>' + label + '</span><b>' + val + '</b></div>';
    const L = v => v.toFixed(2) + ' L';
    const cards = live.concat(done).map(k => {
      const color = colorForBeer(k.name);
      const badge = k.kickedInBF ? '<span class="keg-badge kicked">Kicked ' + fmtDate(k.kickedDate) + '</span>'
                  : (k.kicked ? '<span class="keg-badge kicked">Likely kicked</span>' : '');
      let math, helper = '';
      if(k.kickedInBF){ math = row('Date Kicked recorded in Brewfather', fmtDate(k.kickedDate)); }
      else if(!k.hasVolData){ math = row('No Bottling Volume or recount on this batch, so it can\'t be projected.', '', 'warn'); }
      else {
        const cur = Math.max(k.remaining, 0);
        math = row(k.anchorIsManual ? 'Last recount (' + fmtDate(k.anchorDate) + ')' : 'Bottling Volume at tap (' + fmtDate(k.anchorDate) + ')', L(k.anchorVolume)) +
          (k.kegeratorApplied ? row('To kegerator', '−' + L(k.kegeratorL)) : (k.kegeratorL > 0 ? row('To kegerator (already excluded by the recount)', '—') : '')) +
          row('Requests since (' + k.requestCount + ')', '−' + L(k.requestsL)) +
          row('Events since (' + k.eventCount + ')', '−' + L(k.eventsL)) +
          row('Vol On Hand', L(cur), 'total' + (k.kicked ? ' warn' : ''));
        helper = '<div class="voh-help">To record a fresh recount today in Brewfather: Vol On Hand = <b>' + cur + '</b> <button class="copybtn" data-copy="' + cur + '">copy</button> ' +
                 'Vol On Hand Date = <b>' + today + '</b> <button class="copybtn" data-copy="' + today + '">copy</button></div>';
      }
      return '<div class="keg" style="--tap-color:' + color + '">' + badge +
        '<div class="keg-name">' + escapeHtml(k.name) + '</div>' +
        '<div class="keg-meta"><span>Batch <b>' + (k.batchNumber ? '#' + escapeHtml(String(k.batchNumber)) : '—') + '</b></span><span>Tapped <b>' + fmtDate(k.tappedDate) + '</b></span></div>' +
        '<div class="voh-math">' + math + '</div>' + helper + '</div>';
    }).join('');
    el.content.innerHTML = '<div class="voh-note">Same calculation as the weekly email. Add event drawdowns on the Events tab.</div><div class="grid">' + cards + '</div>';
  }

  // ---- Request App tab: which beers the Bellvale Request app offers (Settings column E), every beer's Vol On Hand (H / I / J),
  //      and manual items (e.g. seltzers that are not in Brewfather). Saved to brewery_data.json "sheetSync"; the Action publishes vol_on_hand.json. ----
  const normSync = o => { const s = (o.sheetSync && typeof o.sheetSync === 'object') ? o.sheetSync : {}; s.offered = Array.isArray(s.offered) ? s.offered : []; s.manual = Array.isArray(s.manual) ? s.manual : []; o.sheetSync = s; return s; };
  const syncNow = () => { const s = ((window.OCD && OCD.get()) || {}).sheetSync || {}; return { offered: s.offered || [], manual: s.manual || [] }; };
  function sheetPlanNow(){
    const st = syncNow();
    return VolCalc.sheetPlan({ volResults: (lastComputed && lastComputed.volOnHand) || [], manualItems: st.manual, offered: st.offered,
                               requestRows: lastInputs ? lastInputs.requestRows : [], events: ((window.OCD && OCD.get()) || {}).events || [] });
  }
  function renderSheet(){
    const st = syncNow(), plan = sheetPlanNow();
    const manualNames = new Set(st.manual.map(m => m.name.toLowerCase()));
    const beerRows = plan.beers.map(b => '<tr><td><input type="checkbox" data-offer="' + escapeHtml(b.name) + '" ' + (b.offered ? 'checked' : '') + '></td>' +
      '<td>' + escapeHtml(b.name) + '</td><td class="n">' + b.volume.toFixed(1) + ' L</td><td>' + (b.source === 'manual' ? 'manual item' : 'Brewfather') + '</td></tr>').join('');
    const manualRows = st.manual.map(m => '<tr data-mid="' + escapeHtml(m.id) + '"><td><input type="text" class="m-name" value="' + escapeHtml(m.name) + '"></td>' +
      '<td><input type="number" class="m-vol" step="0.1" min="0" value="' + escapeHtml(String(m.vol)) + '"></td><td><input type="date" class="m-date" value="' + escapeHtml(String(m.date || '')) + '"></td>' +
      '<td><button class="copybtn" data-m-save="' + escapeHtml(m.id) + '">save</button> <button class="copybtn" data-m-del="' + escapeHtml(m.id) + '">delete</button></td></tr>').join('');
    const prev = plan.beers.map(b => '<tr><td>' + escapeHtml(b.name) + '</td><td>' + plan.inventoryDate + '</td><td class="n">' + b.volume.toFixed(1) + ' L</td></tr>').join('');
    el.content.innerHTML =
      '<div class="voh-note">Tick the beers the Bellvale Request app should offer this week. Volumes come from the same Vol On Hand calculation as the weekly email. ' +
      'The GitHub Action publishes them hourly and the sheet script copies them into Settings.</div>' +
      (plan.offered.length > 9 ? '<div class="ev-msg err">Only the first 9 offered beers fit in Settings E2:E10.</div>' : '') +
      '<h3 class="sh-h">Beers and Vol On Hand <small>(' + plan.offered.length + ' offered)</small></h3>' +
      '<table class="ev-table"><thead><tr><th>Offer</th><th>Beer (column H)</th><th class="n">Vol in kegs (J)</th><th>Source</th></tr></thead><tbody>' +
      (beerRows || '<tr><td colspan="4" class="empty">No beers yet.</td></tr>') + '</tbody></table>' +
      '<h3 class="sh-h">Manual items <small>(not in Brewfather: seltzers, guest kegs)</small></h3>' +
      '<div class="voh-note">Enter the volume you counted and the date. Requests and events after that date come off it automatically.</div>' +
      '<table class="ev-table"><thead><tr><th>Name (exactly as in the Request app)</th><th>Liters counted</th><th>Counted on</th><th></th></tr></thead><tbody>' + manualRows +
      '<tr><td><input type="text" id="m-new-name" placeholder="Hard Seltzer"></td><td><input type="number" id="m-new-vol" step="0.1" min="0" placeholder="36"></td>' +
      '<td><input type="date" id="m-new-date" value="' + isoDay(new Date()) + '"></td><td><button class="btn primary" id="m-add">Add item</button></td></tr></tbody></table>' +
      '<div class="ev-msg" id="sh-msg"></div>' +
      '<h3 class="sh-h">What the Settings sheet will receive</h3>' +
      '<div class="voh-note">Column E (offered): <b>' + (plan.offered.map(escapeHtml).join(', ') || 'none') + '</b></div>' +
      '<table class="ev-table"><thead><tr><th>H · On Tap</th><th>I · inventory date</th><th class="n">J · Vol in kegs</th></tr></thead><tbody>' + (prev || '<tr><td colspan="3" class="empty">Nothing yet.</td></tr>') + '</tbody></table>' +
      '<div class="voh-note" id="sh-pub">Checking the published file…</div>';
    showPublished();
  }
  async function showPublished(){
    const box = document.getElementById('sh-pub'); if(!box) return;
    try{ const c = (window.OCD && OCD.gh.cfg()) || { repo: 'OldeCellar/Operations-Dashboard', branch: 'main' };
      const r = await fetch('https://raw.githubusercontent.com/' + c.repo + '/' + c.branch + '/vol_on_hand.json?t=' + Date.now());
      if(!r.ok) throw new Error('HTTP ' + r.status); const p = await r.json(); if(!p.generatedAt) throw new Error('not a Vol On Hand file'); const h = Math.round((Date.now() - new Date(p.generatedAt)) / 3600000);
      box.textContent = 'Published file vol_on_hand.json: calculated ' + new Date(p.generatedAt).toLocaleString() + ' (' + h + ' h ago). The sheet shows this file\'s numbers, so changes here reach it after the next hourly run.';
    }catch(e){ box.textContent = 'Published file vol_on_hand.json not found yet. It appears after the "Publish Vol On Hand" Action has run once.'; }
  }
  function shMsg(t, err){ const m = document.getElementById('sh-msg'); if(m){ m.textContent = t; m.className = 'ev-msg' + (err ? ' err' : ''); } }
  async function shSave(mutator, message){
    if(!(window.OCD && OCD.gh.has())){ if(window.OCDSettings) OCDSettings.open('To change these settings, paste your GitHub token and click Save & test.'); renderSheet(); return false; }
    try{ await OCD.save(mutator, message); renderSheet(); return true; }catch(e){ renderSheet(); shMsg(e.message, true); return false; }
  }
  el.content.addEventListener('change', async (e) => {
    const cb = e.target.closest('[data-offer]'); if(!cb) return;
    const name = cb.dataset.offer, on = cb.checked, k = name.toLowerCase();
    await shSave(o => { const s = normSync(o); s.offered = s.offered.filter(n => n.toLowerCase() !== k); if(on) s.offered.push(name); },
      (on ? 'Offer ' : 'Stop offering ') + name + ' in the Request app (dashboard)');
  });
  el.content.addEventListener('click', async (e) => {
    const nameTaken = (n, exceptId) => {
      const k = n.trim().toLowerCase();
      const bf = ((lastComputed && lastComputed.volOnHand) || []).some(r => !r.kickedInBF && r.name.toLowerCase() === k);
      return bf || syncNow().manual.some(m => m.id !== exceptId && m.name.trim().toLowerCase() === k);
    };
    if(e.target.closest('#m-add')){
      const name = document.getElementById('m-new-name').value.trim(), vol = parseFloat(document.getElementById('m-new-vol').value), date = document.getElementById('m-new-date').value;
      if(!name || !(vol >= 0) || !date){ shMsg('Enter a name, the liters counted and the date.', true); return; }
      if(nameTaken(name)){ shMsg('"' + name + '" is already used by another beer or item.', true); return; }
      shMsg('Saving to GitHub…');
      await shSave(o => { normSync(o).manual.push({ id: 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2,4), name, vol, date }); }, 'Add manual item: ' + name + ' ' + vol + ' L (dashboard)');
      return;
    }
    const sv = e.target.closest('[data-m-save]');
    if(sv){ const row = sv.closest('tr'), id = sv.dataset.mSave;
      const name = row.querySelector('.m-name').value.trim(), vol = parseFloat(row.querySelector('.m-vol').value), date = row.querySelector('.m-date').value;
      if(!name || !(vol >= 0) || !date){ shMsg('Enter a name, the liters counted and the date.', true); return; }
      if(nameTaken(name, id)){ shMsg('"' + name + '" is already used by another beer or item.', true); return; }
      shMsg('Saving to GitHub…');
      await shSave(o => { const m = normSync(o).manual.find(x => x.id === id); if(!m) throw new Error('That item no longer exists.'); m.name = name; m.vol = vol; m.date = date; }, 'Update manual item: ' + name + ' (dashboard)');
      return; }
    const dl = e.target.closest('[data-m-del]');
    if(dl && confirm('Delete this manual item?')){ const id = dl.dataset.mDel;
      await shSave(o => { const s = normSync(o); s.manual = s.manual.filter(x => x.id !== id); }, 'Delete manual item (dashboard)'); }
  });

  // ---- Events: extra drawdowns outside the Request Log (beer served at events etc.). Saved to brewery_data.json "events". ----
  const isoDay = d => d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  function renderEvents(){
    const d = (window.OCD && OCD.get()) || {};
    const ev = (d.events || []).slice().sort((a,b) => String(b.date).localeCompare(String(a.date)));
    const beers = [...new Set(((lastComputed && lastComputed.volOnHand) || []).filter(r => !r.kickedInBF).map(r => r.name))].sort();
    const opt = beers.map(n => '<option>' + escapeHtml(n) + '</option>').join('');
    const rows = ev.map(e => '<tr><td>' + escapeHtml(e.date) + '</td><td>' + escapeHtml(e.beer) + '</td><td class="n">' + Number(e.volumeL).toFixed(1) + ' L</td><td>' + escapeHtml(e.note || '') + '</td>' +
      '<td><button class="copybtn" data-ev-del="' + escapeHtml(e.id) + '">delete</button></td></tr>').join('');
    el.content.innerHTML =
      '<div class="ev-form"><div class="voh-note">Beer served outside the Request Log (events, tastings, spills). Each entry comes off that beer\'s Vol On Hand from its date, after the last recount.</div>' +
      '<div class="ev-grid"><label>Date<input type="date" id="ev-date" value="' + isoDay(new Date()) + '"></label>' +
      '<label>Beer<select id="ev-beer">' + opt + '</select></label>' +
      '<label>Liters<input type="number" id="ev-vol" min="0" step="0.1" placeholder="e.g. 20"></label>' +
      '<label>Note<input type="text" id="ev-note" placeholder="Open house"></label>' +
      '<button class="btn primary" id="ev-add">Add event</button></div><div class="ev-msg" id="ev-msg"></div></div>' +
      '<table class="ev-table"><thead><tr><th>Date</th><th>Beer</th><th class="n">Volume</th><th>Note</th><th></th></tr></thead><tbody>' +
      (rows || '<tr><td colspan="5" class="empty">No events recorded yet.</td></tr>') + '</tbody></table>';
  }
  function evMsg(t, err){ const m = document.getElementById('ev-msg'); if(m){ m.textContent = t; m.className = 'ev-msg' + (err ? ' err' : ''); } }
  async function evSave(mutator, message){
    if(!(window.OCD && OCD.gh.has())){ if(window.OCDSettings) OCDSettings.open('To record events, paste your GitHub token and click Save & test.'); return false; }
    try{ await OCD.save(mutator, message); recomputeVol(); return true; }catch(e){ evMsg(e.message, true); return false; }
  }
  el.content.addEventListener('click', async (e) => {
    const cp = e.target.closest('[data-copy]');
    if(cp){ try{ await navigator.clipboard.writeText(cp.dataset.copy); const t = cp.textContent; cp.textContent = 'copied'; setTimeout(() => cp.textContent = t, 1200); }catch(_){} return; }
    if(e.target.closest('#ev-add')){
      const date = document.getElementById('ev-date').value, beer = document.getElementById('ev-beer').value;
      const vol = parseFloat(document.getElementById('ev-vol').value), note = document.getElementById('ev-note').value.trim();
      if(!date || !beer || !(vol > 0)){ evMsg('Pick a date and beer, and enter liters greater than 0.', true); return; }
      evMsg('Saving to GitHub…');
      await evSave(o => { o.events = Array.isArray(o.events) ? o.events : [];
        o.events.push({ id: 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2,5), date, beer, volumeL: vol, note }); },
        'Add event: ' + beer + ' ' + vol + ' L on ' + date + ' (dashboard)');
      return;
    }
    const del = e.target.closest('[data-ev-del]');
    if(del && confirm('Delete this event?')){ const id = del.dataset.evDel;
      await evSave(o => { o.events = (o.events || []).filter(x => x.id !== id); }, 'Delete event (dashboard)'); }
  });

  function renderConditioning(list){
    if(list.length === 0){
      el.content.innerHTML =
        '<div class="empty-state"><strong>Nothing conditioning right now</strong>' +
        'No batches have a Brewfather status of "Conditioning".</div>';
      return;
    }

    const cards = list.map(k => {
      const color = colorForBeer(k.name);

      if(k.incomplete){
        return (
          '<div class="keg" style="--tap-color:' + color + '">' +
            '<span class="keg-badge overdue">missing data</span>' +
            '<div class="keg-name">' + escapeHtml(k.name) + '</div>' +
            '<div class="keg-history">Needs both a bottling date and a "' + escapeHtml(getSettings().conditioningField) + '" value to estimate readiness. Check the debug panel.</div>' +
          '</div>'
        );
      }

      const pct = Math.round(k.pctElapsed * 100);
      const ready = k.daysUntilReady !== null && k.daysUntilReady <= 0;

      let badge = '';
      if(ready){
        badge = '<span class="keg-badge fresh">Ready</span>';
      } else if(k.daysUntilReady !== null){
        badge = '<span class="keg-badge">' + k.daysUntilReady + '-d to go</span>';
      }

      const gaugeLabel = ready ? 'ready to tap' : (pct + '% conditioned');

      const historyNote = k.avgDays === null
        ? 'No on-tap history for this beer or the brewery yet — can\'t estimate how long it\'ll last once tapped.'
        : (k.usedFallback
            ? 'Once tapped, expect ~' + Math.round(k.avgDays) + ' days on tap (brewery average — no history for this beer yet).'
            : 'Once tapped, expect ~' + Math.round(k.avgDays) + ' days on tap, based on ' + k.historyCount + ' prior keg' + (k.historyCount === 1 ? '' : 's') + '.');

      return (
        '<div class="keg" style="--tap-color:' + color + '">' +
          badge +
          '<div class="keg-name">' + escapeHtml(k.name) + '</div>' +
          '<div class="gauge-wrap">' +
            '<div class="gauge-fill" style="width:' + Math.min(100, pct) + '%"></div>' +
            '<div class="gauge-label"><span>' + fmtDate(k.bottlingDate) + '</span><span>' + gaugeLabel + '</span></div>' +
          '</div>' +
          '<div class="keg-meta">' +
            '<span>Bottled <b>' + fmtDate(k.bottlingDate) + '</b></span>' +
            '<span>Ready to tap <b>' + fmtDate(k.readyDate) + '</b></span>' +
          '</div>' +
          '<div class="keg-meta">' +
            '<span>Conditioning <b>' + k.condDays + 'd</b></span>' +
            '<span>Est. kicks <b>' + (k.estKickDate ? fmtDate(k.estKickDate) : '—') + '</b></span>' +
          '</div>' +
          '<div class="keg-history">' + historyNote + '</div>' +
        '</div>'
      );
    }).join('');

    el.content.innerHTML = '<div class="grid">' + cards + '</div>';
  }

  function renderFermenting(list){
    if(list.length === 0){
      el.content.innerHTML =
        '<div class="empty-state"><strong>Nothing fermenting right now</strong>' +
        'No batches have a Brewfather status of "Fermenting".</div>';
      return;
    }

    const cards = list.map(k => {
      const color = colorForBeer(k.name);

      if(k.incomplete){
        return (
          '<div class="keg" style="--tap-color:' + color + '">' +
            '<span class="keg-badge overdue">missing data</span>' +
            '<div class="keg-name">' + escapeHtml(k.name) + '</div>' +
            '<div class="keg-history">Needs a brew date and a recipe fermentation schedule (Change Fermentation Profile in Brewfather) to estimate when it\'ll be done. Check the debug panel.</div>' +
          '</div>'
        );
      }

      const pct = Math.round(k.pctElapsed * 100);
      const done = k.daysUntilDone !== null && k.daysUntilDone <= 0;

      let badge = '';
      if(done){
        badge = '<span class="keg-badge fresh">Done fermenting</span>';
      } else if(k.daysUntilDone !== null){
        badge = '<span class="keg-badge">' + k.daysUntilDone + '-d to go</span>';
      }

      const gaugeLabel = done ? 'fermentation complete' : (pct + '% through');

      const condNote = k.condDays === null
        ? 'No Conditioning Time set and no history yet — can\'t project a ready-to-tap date.'
        : (k.condSource === 'entered'
            ? 'Conditioning Time entered: ' + Math.round(k.condDays) + 'd.'
            : 'No Conditioning Time entered yet — using ' + k.condSource + ' (' + Math.round(k.condDays) + 'd).');

      const kickNote = k.avgDays === null
        ? 'No on-tap history for this beer or the brewery yet — can\'t project a kick date.'
        : (k.usedFallback
            ? 'Once tapped, expect ~' + Math.round(k.avgDays) + ' days on tap (brewery average).'
            : 'Once tapped, expect ~' + Math.round(k.avgDays) + ' days on tap, based on ' + k.historyCount + ' prior keg' + (k.historyCount === 1 ? '' : 's') + '.');

      return (
        '<div class="keg" style="--tap-color:' + color + '">' +
          badge +
          '<div class="keg-name">' + escapeHtml(k.name) + '</div>' +
          '<div class="gauge-wrap">' +
            '<div class="gauge-fill" style="width:' + Math.min(100, pct) + '%"></div>' +
            '<div class="gauge-label"><span>' + fmtDate(k.brewDate) + '</span><span>' + gaugeLabel + '</span></div>' +
          '</div>' +
          '<div class="keg-meta">' +
            '<span>Brewed <b>' + fmtDate(k.brewDate) + '</b></span>' +
            '<span>Ferm. done <b>' + fmtDate(k.doneDate) + '</b></span>' +
          '</div>' +
          '<div class="keg-meta">' +
            '<span>Ready to tap <b>' + (k.readyDate ? fmtDate(k.readyDate) : '—') + '</b></span>' +
            '<span>Est. kicks <b>' + (k.estKickDate ? fmtDate(k.estKickDate) : '—') + '</b></span>' +
          '</div>' +
          '<div class="keg-history">' + condNote + '<br>' + kickNote + '</div>' +
        '</div>'
      );
    }).join('');

    el.content.innerHTML = '<div class="grid">' + cards + '</div>';
  }

  // ---- Kegerator (4 taps). Brewfather is the source of truth; four custom batch fields. ----
  const KEG_FIELDS = { vol: 'Vol To Kegerator', into: 'Date Into Kegerator', kicked: 'Date Kicked From Kegerator', tap: 'Kegerator Tap Number' };
  const KEGERATOR_TAPS = 4;

  function computeKegerator(batches){
    const items = [];
    for(const b of batches){
      const vol = kegeratorVolOf(b);
      const dateInto = parseBFValue(findMeasuredField(b, KEG_FIELDS.into));
      const dateKicked = parseBFValue(findMeasuredField(b, KEG_FIELDS.kicked));
      const tapRaw = findMeasuredField(b, KEG_FIELDS.tap);
      const tapNum = (tapRaw !== null && tapRaw !== '' && !isNaN(Number(tapRaw))) ? Number(tapRaw) : null;
      if(!(vol > 0) && !dateInto && !dateKicked) continue;
      items.push({
        name: normalizeBeerName(getRecipeName(b)),
        batchNumber: b.batchNo || b.batchNumber || null,
        vol, dateInto, dateKicked, tap: tapNum
      });
    }
    const inKegerator = items.filter(i => i.dateInto && !i.dateKicked);
    const slots = [];
    for(let n = 1; n <= KEGERATOR_TAPS; n++) slots.push({ tap: n, items: inKegerator.filter(i => i.tap === n) });
    return {
      slots,
      noTap: inKegerator.filter(i => !(i.tap >= 1 && i.tap <= KEGERATOR_TAPS)),
      waiting: items.filter(i => !i.dateInto && !i.dateKicked && i.vol > 0),
      kicked: items.filter(i => i.dateKicked).sort((a,b) => b.dateKicked - a.dateKicked).slice(0, 8)
    };
  }

  function renderKegerator(kz){
    const volText = v => (v > 0 ? (Math.round(v * 100) / 100) + ' L' : '—');
    const daysIn = d => Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000));
    const heading = t => '<div style="font-family:var(--font-mono);font-size:12px;letter-spacing:.1em;text-transform:uppercase;margin:26px 0 10px">' + t + '</div>';
    const card = (i, badge) => {
      const color = colorForBeer(i.name);
      return '<div class="keg" style="--tap-color:' + color + '">' + (badge || '') +
        '<div class="keg-name">' + escapeHtml(i.name) + '</div>' +
        '<div class="keg-meta"><span>Batch <b>' + (i.batchNumber ? '#' + escapeHtml(String(i.batchNumber)) : '—') + '</b></span>' +
        '<span>Volume <b>' + volText(i.vol) + '</b></span></div>' +
        '<div class="keg-meta"><span>Into kegerator <b>' + (i.dateInto ? fmtDate(i.dateInto) : '—') + '</b></span>' +
        '<span>' + (i.dateKicked ? 'Kicked <b>' + fmtDate(i.dateKicked) + '</b>' : 'In for <b>' + (i.dateInto ? daysIn(i.dateInto) + ' d' : '—') + '</b>') + '</span></div>' +
        '</div>';
    };
    const slotCards = kz.slots.map(s => {
      if(s.items.length === 0){
        return '<div class="keg" style="opacity:.55"><span class="keg-badge">Tap ' + s.tap + '</span><div class="keg-name">Open</div>' +
          '<div class="keg-meta"><span>Nothing assigned to this tap</span></div></div>';
      }
      const dup = s.items.length > 1;
      return s.items.map(i => card(i, '<span class="keg-badge' + (dup ? ' kicked' : '') + '">Tap ' + s.tap + (dup ? ' · double-booked' : '') + '</span>')).join('');
    }).join('');

    let html = heading('Kegerator taps') + '<div class="grid">' + slotCards + '</div>';
    if(kz.noTap.length){
      html += heading('In kegerator but no valid tap number (1–' + KEGERATOR_TAPS + ')') +
        '<div class="grid">' + kz.noTap.map(i => card(i, '<span class="keg-badge kicked">No tap #</span>')).join('') + '</div>';
    }
    if(kz.waiting.length){
      html += heading('Volume set, not yet in kegerator') +
        '<div class="grid">' + kz.waiting.map(i => card(i, '<span class="keg-badge">Waiting</span>')).join('') + '</div>';
    }
    if(kz.kicked.length){
      html += heading('Recently kicked') +
        '<div class="grid">' + kz.kicked.map(i => card(i, '<span class="keg-badge kicked">Kicked</span>')).join('') + '</div>';
    }
    el.content.innerHTML = html;
  }

  function renderCurrentTab(){
    if(!lastComputed) return;
    if(currentTab === 'conditioning'){
      renderConditioning(lastComputed.conditioning);
    } else if(currentTab === 'fermenting'){
      renderFermenting(lastComputed.fermenting);
    } else if(currentTab === 'timeline'){
      renderTimeline(lastComputed.kegs, lastComputed.conditioning, lastComputed.fermenting);
    } else if(currentTab === 'volonhand'){
      renderVolOnHand(lastComputed.volOnHand, lastComputed.requestLogError);
    } else if(currentTab === 'sheet'){
      renderSheet();
    } else if(currentTab === 'events'){
      renderEvents();
    } else if(currentTab === 'kegerator'){
      renderKegerator(lastComputed.kegerator);
    } else {
      renderOnTap(lastComputed.kegs);
    }
  }

  function escapeHtml(str){
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  const MS_PER_DAY = 86400000;
  function daysFromBase(base, d){ return Math.round((d.getTime() - base.getTime()) / MS_PER_DAY); }

  function computeTimeline(kegs, conditioning, fermenting){
    const rows = [];

    kegs.forEach((k, i) => {
      const tapEndKnown = !!k.estKickDate;
      const tapEnd = k.estKickDate || new Date(Date.now() + 14 * MS_PER_DAY);
      rows.push({
        key: 'ontap-' + i,
        name: k.name,
        batchNumber: k.batchNumber,
        color: colorForBeer(k.name),
        segments: [
          { phase: 'ontap', start: k.tappedDate, end: tapEnd, projected: false, estimated: !tapEndKnown }
        ],
        sortStart: k.tappedDate,
        onTapDate: k.tappedDate,
        subtitle: 'On tap now',
        detail: k
      });
    });

    conditioning.forEach((c, i) => {
      if(c.incomplete) return;
      const segs = [{ phase: 'conditioning', start: c.bottlingDate, end: c.readyDate, projected: false, estimated: false }];
      const tapEndKnown = !!c.estKickDate;
      const tapEnd = c.estKickDate || new Date(c.readyDate.getTime() + 14 * MS_PER_DAY);
      segs.push({ phase: 'ontap', start: c.readyDate, end: tapEnd, projected: true, estimated: !tapEndKnown });
      rows.push({
        key: 'cond-' + i,
        name: c.name,
        batchNumber: c.batchNumber,
        color: colorForBeer(c.name),
        segments: segs,
        sortStart: c.bottlingDate,
        onTapDate: c.readyDate,
        subtitle: 'Conditioning',
        detail: c
      });
    });

    fermenting.forEach((f, i) => {
      if(f.incomplete) return;
      const segs = [{ phase: 'fermenting', start: f.brewDate, end: f.doneDate, projected: false, estimated: false }];
      if(f.readyDate){
        segs.push({ phase: 'conditioning', start: f.doneDate, end: f.readyDate, projected: true, estimated: f.condSource !== 'entered' });
        const tapEnd = f.estKickDate || new Date(f.readyDate.getTime() + 14 * MS_PER_DAY);
        segs.push({ phase: 'ontap', start: f.readyDate, end: tapEnd, projected: true, estimated: !f.estKickDate });
      }
      rows.push({
        key: 'ferment-' + i,
        name: f.name,
        batchNumber: f.batchNumber,
        color: colorForBeer(f.name),
        segments: segs,
        sortStart: f.brewDate,
        onTapDate: f.readyDate || null,
        subtitle: 'Fermenting',
        detail: f
      });
    });

    return rows;
  }

  function sortTimelineRows(rows, mode){
    const sorted = rows.slice();
    if(mode === 'batch'){
      sorted.sort((a, b) => {
        const an = (a.batchNumber !== null && a.batchNumber !== undefined) ? Number(a.batchNumber) : null;
        const bn = (b.batchNumber !== null && b.batchNumber !== undefined) ? Number(b.batchNumber) : null;
        const aValid = an !== null && !isNaN(an);
        const bValid = bn !== null && !isNaN(bn);
        if(!aValid && !bValid) return a.sortStart - b.sortStart;
        if(!aValid) return 1;
        if(!bValid) return -1;
        return an - bn;
      });
    } else if(mode === 'ontap'){
      sorted.sort((a, b) => {
        const aValid = !!a.onTapDate;
        const bValid = !!b.onTapDate;
        if(!aValid && !bValid) return a.sortStart - b.sortStart;
        if(!aValid) return 1;
        if(!bValid) return -1;
        return a.onTapDate - b.onTapDate;
      });
    } else {
      sorted.sort((a, b) => a.sortStart - b.sortStart);
    }
    return sorted;
  }

  let timelineRowsCache = [];
  let timelineSortMode = 'batch';

  function renderTimeline(kegs, conditioning, fermenting){
    const rows = sortTimelineRows(computeTimeline(kegs, conditioning, fermenting), timelineSortMode);
    timelineRowsCache = rows;

    if(rows.length === 0){
      el.content.innerHTML = '<div class="empty-state"><strong>Nothing to plot yet</strong>Nothing is currently on tap or conditioning.</div>';
      return;
    }

    const today = new Date();
    const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    let minDate = new Date(todayMidnight.getTime() - 3 * MS_PER_DAY);
    let maxDate = new Date(todayMidnight.getTime() + 7 * MS_PER_DAY);
    rows.forEach(r => {
      r.segments.forEach(s => {
        if(s.start < minDate) minDate = s.start;
        if(s.end > maxDate) maxDate = s.end;
      });
    });
    // Clamp to something sane so a bad data point can't blow out the chart
    const maxCap = new Date(todayMidnight.getTime() + 240 * MS_PER_DAY);
    if(maxDate > maxCap) maxDate = maxCap;

    const PX_PER_DAY = 20;
    const totalDays = daysFromBase(minDate, maxDate) + 2;
    const trackWidth = totalDays * PX_PER_DAY;

    // Weekly gridlines, aligned to ISO Monday week starts
    let gridHtml = '';
    // getDay(): 0=Sun..6=Sat. Distance back to the most recent Monday.
    const dback = (minDate.getDay() + 6) % 7;
    for(let gd = new Date(minDate.getTime() - dback * MS_PER_DAY); gd <= maxDate; gd = new Date(gd.getTime() + 7 * MS_PER_DAY)){
      const offsetDays = daysFromBase(minDate, gd);
      if(offsetDays < 0) continue;
      const left = offsetDays * PX_PER_DAY;
      gridHtml += '<div class="tl-gridline" style="left:' + left + 'px"></div>' +
        '<div class="tl-gridline-label" style="left:' + left + 'px">' + MONTH_ABBR[gd.getMonth()] + ' ' + gd.getDate() + '</div>';
    }
    const todayLeft = daysFromBase(minDate, todayMidnight) * PX_PER_DAY;
    const todayLineHtml = '<div class="tl-today-line" style="left:' + todayLeft + 'px"></div>';

    const rowsHtml = rows.map(r => {
      const bars = r.segments.map(s => {
        const left = Math.max(0, daysFromBase(minDate, s.start) * PX_PER_DAY);
        const width = Math.max(6, daysFromBase(s.start, s.end) * PX_PER_DAY);
        const phaseCls = s.phase === 'conditioning' ? 'tl-conditioning' : (s.phase === 'fermenting' ? 'tl-fermenting' : '');
        const cls = 'tl-bar ' + phaseCls + (s.projected ? ' tl-projected' : '');
        return '<div class="' + cls + '" data-row-key="' + r.key + '" style="left:' + left + 'px;width:' + width + 'px;--tap-color:' + r.color + ';--ferment-color:' + fermentColorForBeer(r.name) + '"></div>';
      }).join('');
      return (
        '<div class="tl-row">' +
          '<div class="tl-label" data-row-key="' + r.key + '">' + escapeHtml(r.name) + '<small>' + r.subtitle + (r.batchNumber ? ' · #' + escapeHtml(String(r.batchNumber)) : '') + '</small></div>' +
          '<div class="tl-track" style="width:' + trackWidth + 'px">' + gridHtml + todayLineHtml + bars + '</div>' +
        '</div>'
      );
    }).join('');

    el.content.innerHTML =
      '<div class="timeline-sortbar">' +
        '<span>Sort by</span>' +
        '<button class="sort-btn' + (timelineSortMode === 'batch' ? ' active' : '') + '" data-sort="batch">Batch #</button>' +
        '<button class="sort-btn' + (timelineSortMode === 'ontap' ? ' active' : '') + '" data-sort="ontap">On Tap Date</button>' +
      '</div>' +
      '<div class="timeline-legend">' +
        '<span><span class="legend-swatch ferment"></span>Fermenting</span>' +
        '<span><span class="legend-swatch cond"></span>Conditioning</span>' +
        '<span><span class="legend-swatch tap"></span>On tap</span>' +
        '<span><span class="legend-swatch proj"></span>Projected (not tapped yet)</span>' +
        '<span><span class="legend-line"></span>Today</span>' +
      '</div>' +
      '<div class="timeline-scroll">' +
        '<div class="timeline-inner" style="width:' + (132 + trackWidth) + 'px">' +
          '<div class="tl-axis-row">' +
            '<div class="tl-spacer"></div>' +
            '<div class="tl-axis-track" style="width:' + trackWidth + 'px">' + gridHtml + todayLineHtml + '</div>' +
          '</div>' +
          rowsHtml +
        '</div>' +
      '</div>' +
      '<div class="timeline-detail" id="ot-timelineDetail">Tap a bar or a beer name for details.</div>';

    el.content.querySelectorAll('.sort-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if(timelineSortMode === btn.dataset.sort) return;
        timelineSortMode = btn.dataset.sort;
        renderTimeline(kegs, conditioning, fermenting);
      });
    });

    // Auto-scroll so "today" starts near the left edge
    const scrollEl = el.content.querySelector('.timeline-scroll');
    if(scrollEl) scrollEl.scrollLeft = Math.max(0, todayLeft - 40);

    el.content.querySelectorAll('.tl-bar, .tl-label').forEach(node => {
      node.addEventListener('click', () => {
        el.content.querySelectorAll('.tl-bar.selected').forEach(b => b.classList.remove('selected'));
        el.content.querySelectorAll('.tl-bar[data-row-key="' + node.dataset.rowKey + '"]').forEach(b => b.classList.add('selected'));
        showTimelineDetail(node.dataset.rowKey);
      });
    });
  }

  function showTimelineDetail(rowKey){
    const row = timelineRowsCache.find(r => r.key === rowKey);
    const panel = document.getElementById('ot-timelineDetail');
    if(!row || !panel) return;
    const d = row.detail;
    let lines = [];
    const now = new Date();
    if(row.subtitle === 'Fermenting'){
      const daysSinceBrew = Math.round(daysBetween(d.brewDate, now));
      lines.push('Brewed ' + fmtDate(d.brewDate) + ' — day ' + daysSinceBrew + ' of ' + (d.fermDays !== null ? d.fermDays + '  d fermentation' : '—'));
      lines.push('Est. fermentation complete ' + fmtDate(d.doneDate));
      if(d.readyDate){
        const daysUntilTap = Math.round(daysBetween(now, d.readyDate));
        lines.push('Ready to tap ' + fmtDate(d.readyDate) + ' (' + (daysUntilTap >= 0 ? daysUntilTap + '-d left' : Math.abs(daysUntilTap) + 'd overdue') + ') — ' + d.condSource + ' conditioning time (' + Math.round(d.condDays) + 'd)');
      } else {
        lines.push('No conditioning time available to project readiness');
      }
      lines.push(d.estKickDate ? 'Projected to kick ' + fmtDate(d.estKickDate) : 'No history yet to project a kick date');
    } else if(row.subtitle === 'Conditioning'){
      const daysSinceBottling = Math.round(daysBetween(d.bottlingDate, now));
      lines.push('Bottled ' + fmtDate(d.bottlingDate) + ' — day ' + daysSinceBottling + ' of ' + (d.condDays !== null ? d.condDays + 'd conditioning' : '—'));
      lines.push('Ready to tap ' + fmtDate(d.readyDate) + (d.daysUntilReady !== null ? ' (' + (d.daysUntilReady >= 0 ? d.daysUntilReady + '-d left' : Math.abs(d.daysUntilReady) + 'd overdue') + ')' : ''));
      lines.push(d.estKickDate ? 'Projected to kick ' + fmtDate(d.estKickDate) : 'No history yet to project a kick date');
    } else {
      lines.push('Tapped ' + fmtDate(d.tappedDate));
      lines.push(d.estKickDate ? 'Est. kicks ' + fmtDate(d.estKickDate) : 'No estimate available');
      if(d.volKegged !== null || d.volOnHand !== null){
        const volUnit = getSettings().volUnit;
        lines.push('Kegged ' + (d.volKegged !== null ? d.volKegged + ' ' + volUnit : '—') + ' · On hand ' + (d.volOnHand !== null ? d.volOnHand + ' ' + volUnit : '—'));
      }
    }
    panel.innerHTML = '<strong>' + escapeHtml(row.name) + (row.batchNumber ? ' — batch #' + escapeHtml(String(row.batchNumber)) : '') + '</strong>' +
      lines.map(l => '<div>' + escapeHtml(l) + '</div>').join('');
  }

  // ---------- Load flow ----------

  async function fetchSnapshot(){
    const res = await fetch('https://oldecellar.github.io/OldeCellarOnTap/data/batches.json', { cache: 'no-store' });
    if(!res.ok) throw new Error('Snapshot not found (HTTP ' + res.status + ')');
    const data = await res.json();
    if(!data || !Array.isArray(data.batches)) throw new Error('Snapshot file is malformed');
    return data; // { generatedAt, batches }
  }

  async function loadAndRender(){
    const s = getSettings();
    el.refreshBtn.disabled = true;

    let batches = null;
    let sourceLabel = '';

    try{
      if(s.dataSource === 'live'){
        if(!s.userId || !s.apiKey){
          setStatus('Live mode needs your Brewfather User ID and API Key — add them in Settings.');
          openSettings();
          el.refreshBtn.disabled = false;
          return;
        }
        setStatus('Fetching live batches from Brewfather…', 'loading');
        batches = await fetchAllBatches(s.userId, s.apiKey);
        sourceLabel = 'Live';
      } else if(s.dataSource === 'snapshot'){
        setStatus('Loading snapshot…', 'loading');
        const snap = await fetchSnapshot();
        batches = snap.batches;
        sourceLabel = 'Snapshot from ' + new Date(snap.generatedAt).toLocaleString();
      } else {
        // auto: live when a key is saved in this browser, otherwise the published snapshot
        let liveErr = null;
        if(s.userId && s.apiKey){
          setStatus('Fetching live batches from Brewfather…', 'loading');
          try{ batches = await fetchAllBatches(s.userId, s.apiKey); sourceLabel = 'Live'; }
          catch(e){ liveErr = e; console.error(e); }
        }
        if(!batches){
          setStatus('Loading snapshot…', 'loading');
          const snap = await fetchSnapshot();
          batches = snap.batches;
          sourceLabel = (liveErr ? 'Live failed, showing snapshot from ' : 'Snapshot from ') + new Date(snap.generatedAt).toLocaleString();
        }
      }

      const { historyByBeer, breweryAvg } = computeHistory(batches, s.tappedField, s.kickedField);
      const kegs = computeOnTap(batches, s.tappedField, s.kickedField, historyByBeer, breweryAvg);
      const conditioning = computeConditioning(batches, s.conditioningField, historyByBeer, breweryAvg);
      const { byBeer: condTimeByBeer, breweryAvg: condTimeBreweryAvg } = computeConditioningTimeHistory(batches, s.conditioningField);
      const fermenting = computeFermenting(batches, s.conditioningField, condTimeByBeer, condTimeBreweryAvg, historyByBeer, breweryAvg);

      let requestLogError = null;
      let volOnHand = [];
      try{
        const requestRows = await fetchRequestRows();
        volOnHand = computeVolOnHand(batches, s.tappedField, s.kickedField, requestRows);
        applyVol(kegs, volOnHand);
        lastInputs = { batches, requestRows, tappedField: s.tappedField, kickedField: s.kickedField };
      } catch(reqErr){
        console.error(reqErr);
        requestLogError = reqErr.message;
      }

      lastComputed = { kegs, conditioning, fermenting, volOnHand, requestLogError, kegerator: computeKegerator(batches) };
      renderCurrentTab();

      if(batches.length > 0){
        el.debugPanel.style.display = 'block';
        el.debugOutput.textContent = JSON.stringify(batches[0], null, 2);
      }

      setStatus(sourceLabel + ' · ' + batches.length + ' batches · ' + kegs.length + ' on tap · ' + conditioning.length + ' conditioning · ' + fermenting.length + ' fermenting');
    } catch(err){
      console.error(err);
      setStatus('Error: ' + err.message, 'error');
    } finally {
      el.refreshBtn.disabled = false;
    }
  }

  let started=false;
  window.OnTap={mount(){ if(!started){started=true; loadAndRender();} }, reload(){ if(started) loadAndRender(); }, recompute(){ recomputeVol(); }};
})();
