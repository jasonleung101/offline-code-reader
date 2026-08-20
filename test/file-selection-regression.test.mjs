import test from 'node:test';
import assert from 'node:assert/strict';
import { snapshotSelectedImages } from '../public/photo-files.js';

test('retains selected images after the browser clears its live FileList', () => {
  const photo = { name: 'photo.jpg', type: 'image/jpeg' };
  const document = { name: 'note.txt', type: 'text/plain' };
  let currentFiles = [photo, document];
  const liveFileList = { [Symbol.iterator]: () => currentFiles.values() };

  const selectedFiles = snapshotSelectedImages(liveFileList);
  currentFiles = [];

  assert.deepEqual(selectedFiles, [photo]);
});
