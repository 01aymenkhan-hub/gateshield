type PhotoCapabilities = { imageWidth?: { max: number }; imageHeight?: { max: number } };
type PhotoCapture = {
  takePhoto(settings?: { imageWidth: number; imageHeight: number }): Promise<Blob>;
  getPhotoCapabilities?(): Promise<PhotoCapabilities>;
};

/** Obtain sensor photo detail without continuously running a 4K preview. */
export async function takeNativePhoto(track: MediaStreamTrack, timeoutMs = 2500): Promise<ImageBitmap | null> {
  const Capture = (globalThis as unknown as { ImageCapture?: new (track: MediaStreamTrack) => PhotoCapture }).ImageCapture;
  if (!Capture || track.readyState !== 'live') return null;
  let expired = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const work = (async () => {
    try {
      const capture = new Capture(track);
      const caps = await capture.getPhotoCapabilities?.();
      if (expired) return null;
      const maxW = caps?.imageWidth?.max;
      const maxH = caps?.imageHeight?.max;
      // Avoid allocating a huge 50/100 MP phone-camera bitmap in the browser.
      const ratio = maxW && maxH ? Math.min(1, 4096 / Math.max(maxW, maxH)) : 1;
      const settings = maxW && maxH ? {
        imageWidth: Math.max(1, Math.round(maxW * ratio)),
        imageHeight: Math.max(1, Math.round(maxH * ratio)),
      } : undefined;
      const blob = await capture.takePhoto(settings);
      if (expired) return null;
      const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
      if (expired) { bitmap.close(); return null; }
      return bitmap;
    } catch { return null; }
  })();
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => { expired = true; resolve(null); }, timeoutMs);
  });
  const result = await Promise.race([work, timeout]);
  clearTimeout(timer);
  return result;
}

/** Map the contained preview guide into video or a larger sensor photo. */
export function cameraCrop(
  videoW: number, videoH: number, previewW: number, previewH: number,
  guideX: number, guideY: number, guideW: number, guideH: number,
  sourceW = videoW, sourceH = videoH,
) {
  const scale = Math.min(previewW / videoW, previewH / videoH);
  const clamp = (n: number, max: number) => Math.max(0, Math.min(max, n));
  const left = (previewW - videoW * scale) / 2;
  const top = (previewH - videoH * scale) / 2;
  const x1 = clamp((guideX - left) / scale, videoW);
  const y1 = clamp((guideY - top) / scale, videoH);
  const x2 = clamp((guideX + guideW - left) / scale, videoW);
  const y2 = clamp((guideY + guideH - top) / scale, videoH);
  // Still photos can be 4:3 while video is 16:9: match the centered video FOV.
  const matchedW = Math.min(sourceW, sourceH * videoW / videoH);
  const matchedH = Math.min(sourceH, sourceW * videoH / videoW);
  const x = (sourceW - matchedW) / 2 + x1 / videoW * matchedW;
  const y = (sourceH - matchedH) / 2 + y1 / videoH * matchedH;
  const width = Math.max(1, (x2 - x1) / videoW * matchedW);
  const height = Math.max(1, (y2 - y1) / videoH * matchedH);
  const outputW = Math.max(1, Math.min(2600, Math.floor(width)));
  return { x, y, width, height, outputW, outputH: Math.max(1, Math.round(outputW * height / width)) };
}

/** Preserve accepted original photos; avoid lossy re-encoding of small Urdu strokes. */
export async function preparePhonePhoto(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    if (bitmap.width * bitmap.height <= 32_000_000 && file.size <= 15 * 1024 * 1024 &&
        ['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return file;
    const scale = Math.min(1, 6000 / Math.max(bitmap.width, bitmap.height), Math.sqrt(32_000_000 / (bitmap.width * bitmap.height)));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(bitmap.width * scale));
    canvas.height = Math.max(1, Math.floor(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Photo encoding is unavailable.');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(value => value ? resolve(value) : reject(new Error('Could not encode photo.')), 'image/jpeg', .96);
    });
    return new File([blob], 'cnic_phone_photo.jpg', { type: 'image/jpeg', lastModified: Date.now() });
  } finally { bitmap.close(); }
}
