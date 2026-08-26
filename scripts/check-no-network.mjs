import { readFile } from 'node:fs/promises';

const sourceFiles = ['public/index.html', 'public/app.js', 'public/styles.css', 'public/serial.js', 'public/recognition.js', 'public/sw.js', 'public/manifest.webmanifest'];
const externalReference = /(?:src|href)=["']https?:\/\/|fetch\(\s*["']https?:\/\//i;
let failed = false;

for (const file of sourceFiles) {
  const contents = await readFile(file, 'utf8');
  if (externalReference.test(contents)) {
    console.error(`External network dependency found in ${file}`);
    failed = true;
  }
}

if (failed) process.exitCode = 1;
else console.log('No external network dependencies found in application source.');
