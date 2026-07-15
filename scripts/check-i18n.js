// Dev helper: cross-check i18n keys used in code vs defined in JSON files.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

const ar = JSON.parse(fs.readFileSync(path.join(root, 'i18n/ar.json'), 'utf8'));
const en = JSON.parse(fs.readFileSync(path.join(root, 'i18n/en.json'), 'utf8'));

const flat = (o, p = '') =>
  Object.entries(o).flatMap(([k, v]) =>
    typeof v === 'object' && v !== null ? flat(v, p + k + '.') : [p + k]
  );

const arK = new Set(flat(ar));
const enK = new Set(flat(en));

const code =
  fs.readFileSync(path.join(root, 'app.js'), 'utf8') +
  fs.readFileSync(path.join(root, 'index.html'), 'utf8');

const used = new Set(
  [...code.matchAll(/\bt\('([a-z0-9_.]+)'/g)]
    .map((m) => m[1])
    .concat(
      [...code.matchAll(/data-i18n(?:-placeholder|-title)?="([a-z0-9_.]+)"/g)].map(
        (m) => m[1]
      )
    )
);

const missAr = [...used].filter((k) => !arK.has(k));
const missEn = [...used].filter((k) => !enK.has(k));
const arOnly = [...arK].filter((k) => !enK.has(k));
const enOnly = [...enK].filter((k) => !arK.has(k));

console.log('used keys:', used.size);
console.log('missing in ar.json:', missAr.length ? missAr : 'none');
console.log('missing in en.json:', missEn.length ? missEn : 'none');
console.log('ar-only keys:', arOnly.length ? arOnly : 'none');
console.log('en-only keys:', enOnly.length ? enOnly : 'none');
