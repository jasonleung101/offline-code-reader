import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';

const workerSource = await readFile('public/sw.js', 'utf8');
const assetMatches = [...workerSource.matchAll(/'([^']+\.(?:html|css|js|webmanifest|svg|gz|wasm))'/g)];
const assets = assetMatches.map((match) => match[1]).filter((asset) => asset !== './');

await Promise.all(assets.map(async (asset) => {
  await access(`public/${asset.replace(/^\.\//, '')}`, constants.R_OK);
}));

console.log(`Verified ${assets.length} service-worker assets.`);
