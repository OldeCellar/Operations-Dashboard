(function(root, factory){
  if(typeof module === 'object' && module.exports) module.exports = factory();
  else { root.DemandCalc = factory(); (root.OCD_V = root.OCD_V || {})['demand-calc.js'] = '0.1.0'; }
})(typeof self !== 'undefined' ? self : this, function(){
  /* Ingredient demand from planned brews, ported from the Scheduler's "Demand by Period" (matching rules), plus order quantities:
       need = recipe amounts of every planned brew inside the look-ahead window
       to order = max(0, minStock - (onHand - need))        (so stock never drops below the minimum after the brews)
     Units: everything is converted into the Brewfather inventory item's unit (kg, g, ml, pkg ...). */
  const norm = s => (s || '').toString().toLowerCase().trim().replace(/\s+/g, ' ');
  const stripYear = s => norm(s).replace(/\s+20\d{2}\s*$/, '').trim();
  const MASS = { mg:0.001, g:1, kg:1000, oz:28.349523125, lb:453.59237, lbs:453.59237 };
  const VOL  = { ml:1, l:1000, tsp:4.92892159375, tbsp:14.78676478125, floz:29.5735295625, gal:3785.411784 };
  const COUNT = { pkg:1, items:1, item:1, each:1, pk:1 };
  function convert(amount, from, to){
    from = norm(from); to = norm(to); if(from === to) return amount;
    for(const t of [MASS, VOL, COUNT]) if(from in t && to in t) return amount * t[from] / t[to];
    return null;
  }
  const defaultUnit = type => ({ Fermentable:'kg', Hop:'g', Yeast:'pkg', Misc:'g' }[type] || 'g');

  function matchInventory(ing, type, inventory){
    const raw = ing.name || '?', code = norm(raw);
    const ofType = inventory.filter(i => i.type === type);
    if(type === 'Hop'){
      const form = norm(ing.type), c = stripYear(raw);
      return ofType.find(i => stripYear(i.name) === c && (!form || !i.bf_type || norm(i.bf_type) === form)) || ofType.find(i => stripYear(i.name) === c) || null;
    }
    if(type === 'Yeast'){
      const lab = norm(ing.laboratory), pid = norm(ing.productId);
      const cand = ofType.filter(i => norm(i.bf_productId) === code || (pid && norm(i.bf_productId) === pid) || norm(i.name) === code);
      return cand.find(i => !lab || !i.bf_laboratory || norm(i.bf_laboratory) === lab) || cand[0] || null;
    }
    return ofType.find(i => norm(i.name) === code) || ofType.find(i => norm(i.name).startsWith(code) || code.startsWith(norm(i.name))) || null;
  }

  // brews: [{batch, name, date}], recipes: lookup(brew) -> recipe object or null
  function computeDemand(brews, getRecipe, inventory){
    const rows = new Map(); let uncached = 0;
    const add = (ing, type, brew) => {
      const inv = matchInventory(ing, type, inventory);
      const key = inv ? inv.bf_id : 'x|' + type + '|' + norm(ing.name);
      const unit = inv ? (inv.unit || defaultUnit(type)) : (ing.unit || defaultUnit(type));
      const rawUnit = ing.unit || defaultUnit(type);
      let amt = Number(ing.amount) || 0, conv = convert(amt, rawUnit, unit), unitMismatch = false;
      if(conv === null){ conv = amt; unitMismatch = true; }
      let r = rows.get(key);
      if(!r){ r = { key, bfId: inv ? inv.bf_id : null, name: inv ? inv.name : (ing.name || '?'), type, unit, matched: !!inv, onHand: inv ? Number(inv.onHand) || 0 : null, total: 0, refs: [], unitMismatch: false }; rows.set(key, r); }
      r.total += conv; r.unitMismatch = r.unitMismatch || unitMismatch;
      r.refs.push({ batch: brew.batch, beer: brew.name, date: brew.date, amount: conv, rawAmount: amt, rawUnit });
    };
    brews.forEach(b => {
      const rec = getRecipe(b); if(!rec){ uncached++; return; }
      const R = rec.recipe || rec;
      (R.fermentables || []).forEach(x => add(x, 'Fermentable', b));
      (R.hops || []).forEach(x => add(x, 'Hop', b));
      (R.yeasts || []).forEach(x => add(x, 'Yeast', b));
      (R.miscs || []).forEach(x => add(x, 'Misc', b));
    });
    return { rows: [...rows.values()], uncached };
  }

  // join demand with catalog items (min stock, offers) and compute what to order
  function shortfalls(demandRows, inventory, catalogItems){
    const byBf = new Map((catalogItems || []).filter(i => i.bfId).map(i => [i.bfId, i]));
    const seen = new Set(), out = [];
    const mk = (r, inv) => {
      const it = byBf.get(r.bfId), min = it && it.minStock != null ? Number(it.minStock) : null;
      const onHand = r.onHand != null ? r.onHand : 0, need = r.total || 0;
      const target = min != null ? min : 0;
      const projected = onHand - need;
      const order = Math.max(0, target - projected);
      return Object.assign({}, r, { catalogItem: it || null, minStock: min, projected, order });
    };
    demandRows.forEach(r => { out.push(mk(r)); if(r.bfId) seen.add(r.bfId); });
    // items with a minimum but no demand in the window
    (catalogItems || []).forEach(it => {
      if(!it.bfId || seen.has(it.bfId) || it.minStock == null) return;
      const inv = inventory.find(i => i.bf_id === it.bfId); if(!inv) return;
      out.push(mk({ key: inv.bf_id, bfId: inv.bf_id, name: inv.name, type: inv.type, unit: inv.unit || defaultUnit(inv.type), matched: true, onHand: Number(inv.onHand) || 0, total: 0, refs: [], unitMismatch: false }));
    });
    return out;
  }

  // vendor pack -> item unit; returns {perPack, packs, cost}
  function packQuantity(offer, itemUnit, units, shortfall){
    const u = units && units[offer.unit]; if(!u || !offer.packSize) return null;
    const metricUnit = u.to === 'Liters' ? 'l' : u.to === 'gram' ? 'g' : u.to;       // settings.json names
    const perPack = convert(offer.packSize * u.factor, metricUnit, itemUnit);
    if(perPack === null || !(perPack > 0)) return null;
    const packs = Math.ceil(shortfall / perPack - 1e-9);
    return { perPack, packs, cost: offer.lastPrice != null ? packs * offer.lastPrice : null };
  }
  return { computeDemand, shortfalls, packQuantity, matchInventory, convert, norm };
});
