const assert = require('node:assert/strict');
const { cameraCrop, takeNativePhoto, preparePhonePhoto } = require('../src/utils/cameraCapture.ts');

(async () => {
  const video = cameraCrop(1280, 720, 640, 360, 80, 30, 480, 300);
  assert.equal(video.outputW, 960); // Do not manufacture native detail.
  const photo = cameraCrop(1280, 720, 640, 360, 80, 30, 480, 300, 4096, 3072);
  assert.deepEqual(photo, { x: 512, y: 576, width: 3072, height: 1920, outputW: 2600, outputH: 1625 });
  const portrait = cameraCrop(720, 1280, 360, 640, 30, 220, 300, 190, 3072, 4096);
  assert.equal(portrait.width, 1920);
  assert.equal(portrait.outputW, 1920);
  const track = { readyState: 'live' };
  const previousCapture = globalThis.ImageCapture;
  const previousBitmap = globalThis.createImageBitmap;
  let settings, bitmaps = 0;
  try {
    delete globalThis.ImageCapture;
    assert.equal(await takeNativePhoto(track), null);
    globalThis.createImageBitmap = async () => { bitmaps++; return { width: 4096, height: 3072, close() {} }; };
    globalThis.ImageCapture = class {
      async getPhotoCapabilities() { return { imageWidth: { max: 12000 }, imageHeight: { max: 9000 } }; }
      async takePhoto(value) { settings = value; return new Blob(['photo']); }
    };
    assert.equal((await takeNativePhoto(track)).width, 4096);
    assert.deepEqual(settings, { imageWidth: 4096, imageHeight: 3072 });
    globalThis.ImageCapture = class { async takePhoto() { throw Error('unsupported'); } };
    assert.equal(await takeNativePhoto(track), null);
    let release;
    globalThis.ImageCapture = class { takePhoto() { return new Promise(resolve => { release = resolve; }); } };
    assert.equal(await takeNativePhoto(track, 10), null);
    release(new Blob(['late photo']));
    await new Promise(resolve => setTimeout(resolve, 1));
    assert.equal(bitmaps, 1); // Timed-out photos are not decoded or leaked.
    globalThis.createImageBitmap = async () => ({ width: 6313, height: 3916, close() {} });
    const original = new File([Buffer.alloc(2991362)], 'original.jpg', { type: 'image/jpeg' });
    assert.equal(await preparePhonePhoto(original), original); // Preserve accepted bytes.
    const previousDocument = globalThis.document;
    let canvas;
    try {
      globalThis.createImageBitmap = async () => ({ width: 8000, height: 6000, close() {} });
      globalThis.document = { createElement() { return canvas = { width: 0, height: 0,
        getContext() { return { drawImage() {} }; },
        toBlob(callback) { callback(new Blob(['encoded'], { type: 'image/jpeg' })); },
      }; } };
      const bounded = await preparePhonePhoto(original);
      assert.notEqual(bounded, original);
      assert.deepEqual([canvas.width, canvas.height], [6000, 4500]);
      assert.equal(bounded.type, 'image/jpeg');
    } finally { globalThis.document = previousDocument; }
  } finally {
    globalThis.ImageCapture = previousCapture;
    globalThis.createImageBitmap = previousBitmap;
  }
  console.log('Camera mapping, sensor-photo, size cap, fallback and timeout checks passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
