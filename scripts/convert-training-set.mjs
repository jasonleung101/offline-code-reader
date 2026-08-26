import { access, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { isValidSerial, normalizeSerial } from '../public/serial.js';

const DATASET_FORMAT = 'offline-code-reader-training-set/v1';
const JPEG_DATA_URL = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/;

export function trainingPairEntries(dataset) {
  if (dataset?.format !== DATASET_FORMAT || !Array.isArray(dataset.examples)) {
    throw new Error(`Expected a ${DATASET_FORMAT} dataset.`);
  }
  return dataset.examples.map((example, index) => {
    const label = normalizeSerial(example?.label);
    if (!isValidSerial(label)) throw new Error(`Example ${index + 1} does not have a valid 16-character serial label.`);
    if (!JPEG_DATA_URL.test(String(example?.image))) throw new Error(`Example ${index + 1} does not contain a JPEG training crop.`);
    return { name: `serial-${String(index + 1).padStart(4, '0')}`, label, image: String(example.image) };
  });
}

function convertToPng(source, destination) {
  return new Promise((resolve, reject) => {
    const command = spawn('sips', ['-s', 'format', 'png', source, '--out', destination], { stdio: 'pipe' });
    let error = '';
    command.stderr.on('data', (chunk) => { error += chunk; });
    command.on('error', () => reject(new Error('macOS `sips` is required to convert private JPEG crops to PNG.')));
    command.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Could not convert ${path.basename(source)} to PNG: ${error.trim() || `sips exited ${code}`}`));
    });
  });
}

async function ensureEmptyDirectory(directory) {
  try {
    await access(directory);
  } catch {
    await mkdir(directory, { recursive: true });
    return;
  }
  if ((await readdir(directory)).length > 0) {
    throw new Error(`Refusing to overwrite non-empty output directory: ${directory}`);
  }
}

export async function writeTrainingPairs(entries, outputDirectory) {
  await ensureEmptyDirectory(outputDirectory);
  for (const entry of entries) {
    const jpeg = Buffer.from(JPEG_DATA_URL.exec(entry.image)[1], 'base64');
    const jpegPath = path.join(outputDirectory, `${entry.name}.jpg`);
    const pngPath = path.join(outputDirectory, `${entry.name}.png`);
    await writeFile(jpegPath, jpeg);
    try {
      await convertToPng(jpegPath, pngPath);
    } finally {
      await rm(jpegPath, { force: true });
    }
    await writeFile(path.join(outputDirectory, `${entry.name}.gt.txt`), `${entry.label}\n`, 'utf8');
  }
  await writeFile(path.join(outputDirectory, 'manifest.json'), JSON.stringify({ format: DATASET_FORMAT, pairs: entries.map(({ name, label }) => ({ name, label })) }, null, 2));
}

async function main() {
  const [datasetPath, outputDirectory = 'training-ground-truth'] = process.argv.slice(2);
  if (!datasetPath) throw new Error('Usage: node scripts/convert-training-set.mjs <private-training-set.json> [output-directory]');
  const dataset = JSON.parse(await readFile(datasetPath, 'utf8'));
  const entries = trainingPairEntries(dataset);
  if (!entries.length) throw new Error('The private dataset contains no labeled training examples.');
  const output = path.resolve(outputDirectory);
  await writeTrainingPairs(entries, output);
  console.log(`Created ${entries.length} PNG + .gt.txt training pairs in ${output}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  });
}
