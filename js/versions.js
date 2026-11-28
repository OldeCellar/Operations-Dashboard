window.OCD_V=window.OCD_V||{};OCD_V['versions.js']='0.1.0';
/* Single source of truth for a Dashboard release. Edit THIS file (plus the files that changed) every release.
   index.html never needs editing: it loads this file first (never cached), then loads every style and script below with ?v=<release>.
   - release : the package number shown in the header and footer
   - styles  : css files, in load order (paths relative to the site root)
   - scripts : js files, in load order (app.js must stay last)
   - expected: the version every file must report; the footer shows any mismatch in red */
window.OCD_VERSIONS={
  release:'0.20.0',
  styles:['css/theme.css','css/request-log.css','css/on-tap.css','css/catalog.css','css/schedule.css','css/history.css','css/purchasing.css'],
  scripts:['js/data.js','js/settings.js','js/request-log.js','js/catalog.js','js/units.js','js/scheduler-engine.js','js/schedule.js','js/history.js','js/demand-calc.js','js/purchasing.js','js/vol-calc.js','js/on-tap.js','js/app.js'],
  expected:{
    "index.html":"0.20.0","versions.js":"0.1.0","app.js":"0.19.0","on-tap.js":"0.10.1","request-log.js":"0.4.0",
    "theme.css":"0.4.3","request-log.css":"0.1.0","on-tap.css":"0.3.4","data.js":"0.4.0","catalog.js":"0.2.1",
    "catalog.css":"0.2.0","scheduler-engine.js":"0.4.0","schedule.js":"0.4.1","schedule.css":"0.3.1","settings.js":"0.2.0",
    "history.js":"0.1.1","history.css":"0.1.0","vol-calc.js":"0.6.0","units.js":"0.1.1","purchasing.js":"0.7.0",
    "purchasing.css":"0.5.0","demand-calc.js":"0.4.0"
  }
};
