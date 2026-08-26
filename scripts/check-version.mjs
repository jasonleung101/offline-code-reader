import { readFile } from 'node:fs/promises';

const [pkg, manifest, app] = await Promise.all([
  readFile('package.json', 'utf8'),
  readFile('public/manifest.webmanifest', 'utf8'),
  readFile('public/app.js', 'utf8'),
]);

const versions = {
  'package.json': JSON.parse(pkg).version,
  'public/manifest.webmanifest': JSON.parse(manifest).version,
  'public/app.js (APP_VERSION)': /APP_VERSION = '([^']+)'/.exec(app)?.[1],
};

const values = new Set(Object.values(versions));
if (values.size !== 1 || values.has(undefined)) {
  console.error('Version mismatch across sources:');
  for (const [source, version] of Object.entries(versions)) console.error(`  ${source}: ${version ?? '(missing)'}`);
  process.exit(1);
}

console.log(`Version ${[...values][0]} is consistent across all sources.`);
