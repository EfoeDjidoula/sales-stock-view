const ts = require('/dev-server/node_modules/typescript');
const fs = require('fs'), path = require('path');
const root = '/dev-server/src';
const files = [];
(function walk(d){ for (const f of fs.readdirSync(d)) { const p = path.join(d,f); const s = fs.statSync(p);
  if (s.isDirectory()) { if (['integrations','ui','test'].includes(f)) continue; walk(p); }
  else if (/\.(tsx|ts)$/.test(f) && !/\.test\.|\.d\.ts$/.test(f)) files.push(p); } })(root);
const out = new Map();
const SKIP_CALLS = new Set(['from','eq','neq','select','rpc','order','in','is','gte','lte','gt','lt','like','ilike','cn','clsx','cva','invoke','getItem','setItem','removeItem','useQuery','addEventListener','querySelector','match','split','replace','join','includes','startsWith','endsWith','format','toLocaleString','toLocaleDateString','Intl','channel','on','storage','upload','download','createSignedUrl','filter','or','not','contains','single','maybeSingle','upsert','insert','update','delete','padStart','getElementById','test','localeCompare','indexOf']);
const SKIP_ATTRS = new Set(['className','key','id','type','name','value','href','to','variant','size','side','align','role','htmlFor','inputMode','autoComplete','dataKey','stroke','fill','stopColor','strokeDasharray','orientation','defaultValue','src','mode','pattern','stackId','layout','yAxisId','xAxisId','accept','method','target','rel','dir','lang','sizes','textAnchor','dominantBaseline','offset','position','tabIndex','form','asChild']);
const accent = /[àâäéèêëîïôöùûüçœÀÂÉÈÊËÎÏÔÙÛÇŒ«»’]/;
const FR_WORDS = /(^|\s)(de|des|du|la|le|les|en|et|à|au|aux|pour|par|sur|aucun|aucune|jours|jour|mois|semaine|ouvert|ouvertes|ouverts|critiques|panne|non|sans|avec|une|un|est|sont|cette|ce|ces|votre|vos)(\s|$)/;
function looksText(s, jsx){
  const t = s.replace(/\{x\}/g,'').trim(); if (t.length < 2 || !/[A-Za-zÀ-ÿ]/.test(t)) return false;
  if (/^(https?:|\/|\.|#|@|data:|mailto:)/.test(t)) return false;
  if (s.includes('{x}') && /\s/.test(s.trim()) && /[a-zà-ÿ]{4}/.test(t) && !/(^|\s)(bg|text|border|flex|grid|px|py|p|m|mt|mb|ml|mr|w|h|rounded|items|justify|gap|font|ring|shadow|hover|space)-/.test(t) && !/[=;<>]/.test(t)) return true;
  if (/[{}<>=;]|=>|\$\{/.test(t) && !accent.test(t)) return false;
  if (/^[a-z0-9_.\-]+$/.test(t)) return false; // identifiers / keys
  if (/^[A-Z0-9_]+$/.test(t) && t.length > 6 && t.includes('_')) return false;
  if (!jsx && !FR_WORDS.test(t) && !accent.test(t) && t.split(/\s+/).every(w => /^[a-z0-9:\-\/\[\]\.#%!_()&>~*,]+$/.test(w)) ) return false; // classnames, sql
  if (/^[a-z_]+(,\s*[a-z_*().:!]+)+$/.test(t)) return false;
  return true;
}
function add(s, file, jsx){ const k = s.replace(/\s+/g,' ').trim(); if (!looksText(k, jsx)) return; if (!out.has(k)) out.set(k, path.relative(root,file)); }
for (const file of files) {
  const src = ts.createSourceFile(file, fs.readFileSync(file,'utf8'), ts.ScriptTarget.Latest, true, file.endsWith('x')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
  const visit = (n) => {
    if (ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) return;
    if (ts.isJsxText(n)) { add(n.text, file, true); return; }
    if (ts.isJsxElement(n) && n.children.length > 1 && n.children.every(c => ts.isJsxText(c) || ts.isJsxExpression(c))) {
      const parts = n.children.map(c => ts.isJsxText(c) ? c.text.replace(/\s+/g,' ') : (c.expression && (ts.isStringLiteral(c.expression)) ? c.expression.text : (c.expression ? '{x}' : '')));
      const key = parts.join('').replace(/\s+/g,' ').trim();
      if (key.includes('{x}') && /[A-Za-zÀ-ÿ]{3}/.test(key.replace(/\{x\}/g,''))) add(key, file, true);
    }
    if (ts.isJsxAttribute(n) && SKIP_ATTRS.has(n.name.getText())) return;
    if (ts.isCallExpression(n)) { const e = n.expression; const nm = ts.isPropertyAccessExpression(e)? e.name.text : ts.isIdentifier(e)? e.text : ''; if (SKIP_CALLS.has(nm)) return; }
    if (ts.isPropertyAssignment(n) && ['className','queryKey','key','value','id','type','table','column','dataKey','color','icon','module','status','code','format','to','path','href'].includes(n.name.getText().replace(/['"]/g,''))) { return; }
    if (ts.isBinaryExpression(n) && [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken, ts.SyntaxKind.EqualsEqualsToken].includes(n.operatorToken.kind)) return;
    if (ts.isCaseClause(n)) { n.statements.forEach(visit); return; }
    if (ts.isElementAccessExpression(n)) { visit(n.expression); return; }
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) { if (ts.isPropertyName && n.parent && ts.isPropertyAssignment(n.parent) && n.parent.name === n) return; if (ts.isLiteralTypeNode(n.parent)) return; add(n.text, file); return; }
    if (ts.isTemplateExpression(n)) { let s = n.head.text; for (const sp of n.templateSpans) s += '{x}' + sp.literal.text; if (/[A-Za-zÀ-ÿ]{3}/.test(s.replace(/\{x\}/g,''))) add(s, file); }
    ts.forEachChild(n, visit);
  };
  visit(src);
}
const existing = require('fs').readFileSync('/dev-server/src/lib/translations.ts','utf8') + require('fs').readFileSync('/dev-server/src/lib/translations.generated.ts','utf8');
const arr = [...out.entries()].filter(([k]) => !existing.includes(JSON.stringify(k)+':'));
fs.writeFileSync('/tmp/i18n/strings.json', JSON.stringify(arr, null, 1));
console.log(files.length, out.size, arr.length);
