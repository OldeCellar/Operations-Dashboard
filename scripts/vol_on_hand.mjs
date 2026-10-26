// Publishes live Vol On Hand per beer to vol_on_hand.json, using the SAME calculation as the dashboard (js/vol-calc.js).
// Inputs : Brewfather (Completed batches, all custom fields), the public Request View sheet, and brewery_data.json
//          (events log + sheetSync: which beers are offered in the Request app, and manual items such as seltzers).
// Output : vol_on_hand.json  -> read by the Bellvale Apps Script (Settings E / H / I / J) and the weekly email.
// If anything looks wrong it exits WITHOUT writing, so a bad run can never publish bad numbers.
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { createRequire } from 'module';
const VolCalc = createRequire(import.meta.url)('../js/vol-calc.js');

const REQUEST_SHEET_ID = '1bbU3rU6K7-t5n1jnE6USjTngIFBTJEoAYgKQvsdlPMk';
const REQUEST_CSV_URL = `https://docs.google.com/spreadsheets/d/${REQUEST_SHEET_ID}/gviz/tq?tqx=out:csv&gid=0`;
const OUT = process.env.VOL_OUT || 'vol_on_hand.json';
const DATA = process.env.DATA_FILE || 'brewery_data.json';
const HEARTBEAT_HOURS = 20;                       // rewrite at least this often so "generatedAt" stays fresh

const { BF_USER_ID, BF_API_KEY } = process.env;
if (!BF_USER_ID || !BF_API_KEY) { console.error('Missing BF_USER_ID / BF_API_KEY secrets.'); process.exit(1); }
const auth = 'Basic ' + Buffer.from(`${BF_USER_ID}:${BF_API_KEY}`).toString('base64');

async function fetchCompletedBatches() {
  const out = []; let startAfter = null; const limit = 50;
  for (let page = 0; page < 60; page++) {
    let url = `https://api.brewfather.app/v2/batches?complete=True&limit=${limit}&status=Completed`;
    if (startAfter) url += '&start_after=' + encodeURIComponent(startAfter);
    const res = await fetch(url, { headers: { Authorization: auth } });
    if (!res.ok) throw new Error(`Brewfather API ${res.status} ${res.statusText}`);
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) break;
    out.push(...data);
    if (data.length < limit) break;
    startAfter = data[data.length - 1]._id;
  }
  return out;
}

async function main() {
  const data = existsSync(DATA) ? JSON.parse(readFileSync(DATA, 'utf8')) : {};
  const batches = await fetchCompletedBatches();
  if (batches.length === 0) { console.error('Brewfather returned no Completed batches - not publishing.'); process.exit(1); }

  const res = await fetch(REQUEST_CSV_URL);
  if (!res.ok) { console.error('Request sheet fetch failed: HTTP ' + res.status + ' - not publishing.'); process.exit(1); }
  const requestRows = VolCalc.requestRowsFromCSV(await res.text());
  if (requestRows.length === 0) { console.error('Request sheet returned no usable rows (filter left on? columns moved?) - not publishing.'); process.exit(1); }

  const now = new Date();
  const sync = data.sheetSync || {};
  const volResults = VolCalc.compute({ batches, requestRows, events: data.events || [], now });
  const plan = VolCalc.sheetPlan({ volResults, manualItems: sync.manual || [], offered: sync.offered || [], requestRows, events: data.events || [], now });

  const out = {
    generatedAt: now.toISOString(),
    inventoryDate: plan.inventoryDate,                 // yyyy-mm-dd, written to Settings column I
    beers: plan.beers,                                 // [{ name, volume (L), source, offered }]  -> H / J
    offered: plan.offered,                             // beer names for column E
    counts: { completedBatches: batches.length, requestRows: requestRows.length, events: (data.events || []).length },
  };

  let prev = null;
  try { if (existsSync(OUT)) prev = JSON.parse(readFileSync(OUT, 'utf8')); } catch {}
  const strip = o => JSON.stringify({ ...o, generatedAt: undefined });
  const fresh = prev && prev.generatedAt && (now - new Date(prev.generatedAt)) < HEARTBEAT_HOURS * 3600e3;
  if (prev && strip(prev) === strip(out) && fresh) { console.log('No change - not rewriting ' + OUT); return; }

  writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
  console.log(`Wrote ${OUT}: ${out.beers.length} beers (${out.offered.length} offered), ${requestRows.length} request rows, ${out.counts.events} events.`);
  out.beers.forEach(b => console.log(`  ${b.name.padEnd(24)} ${String(b.volume).padStart(8)} L  ${b.offered ? '[offered]' : '         '} ${b.source}`));
}
main().catch(e => { console.error('vol_on_hand failed: ' + e.message); process.exit(1); });
