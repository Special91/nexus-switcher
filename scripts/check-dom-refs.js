// Dev helper: find getElementById calls referencing ids that don't exist in index.html.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const js = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

const htmlIds = new Set([...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
// ids created dynamically in app.js (createElement + id = / innerHTML id=")
const jsCreatedIds = new Set(
  [...js.matchAll(/\.id\s*=\s*'([^']+)'/g)]
    .map((m) => m[1])
    .concat([...js.matchAll(/id="([^"]+)"/g)].map((m) => m[1]))
);

const referenced = [...js.matchAll(/getElementById\('([^']+)'\)/g)].map((m) => m[1]);
const missing = [...new Set(referenced)].filter(
  (id) => !htmlIds.has(id) && !jsCreatedIds.has(id)
);

console.log('referenced ids:', new Set(referenced).size);
console.log('missing ids:', missing.length ? missing : 'none');
