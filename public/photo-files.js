export function snapshotSelectedImages(fileList) {
  return [...fileList].filter((file) => file.type.startsWith('image/'));
}
