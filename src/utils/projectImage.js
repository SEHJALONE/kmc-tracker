// A project's picture, made small enough to live in the catalog JSON: scaled to
// fit the card (never enlarged) and saved as WebP (transparency kept), or as
// PNG where the browser cannot write WebP. Rejects anything that is not a PNG.
import { fitWithin, PROJECT_IMAGE_BOX, PROJECT_IMAGE_MAX } from '../data/projectProcess';

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file could not be read as a picture.')); };
    img.src = url;
  });
}

export async function projectImageFromFile(file) {
  if (!file) throw new Error('Choose a PNG file.');
  if (file.type !== 'image/png' && !/\.png$/i.test(file.name || '')) throw new Error('The picture must be a PNG file.');
  const img = await loadImage(file);
  let box = { ...PROJECT_IMAGE_BOX };
  for (let round = 0; round < 6; round++) {
    const { width, height } = fitWithin(img.naturalWidth || img.width, img.naturalHeight || img.height, box);
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    canvas.getContext('2d').drawImage(img, 0, 0, width, height);
    for (const q of [0.85, 0.7, 0.55]) {
      const url = canvas.toDataURL('image/webp', q);
      if (url.length <= PROJECT_IMAGE_MAX) return url;
      if (!url.startsWith('data:image/webp')) break;   // no WebP here: PNG ignores quality
    }
    box = { width: Math.round(box.width * 0.75), height: Math.round(box.height * 0.75) };
  }
  throw new Error('The picture is still too big after shrinking it. Use a simpler PNG.');
}
