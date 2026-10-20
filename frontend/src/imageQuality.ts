export type ImageQualityReport = {
  width: number;
  height: number;
  sharpness: number;
  clippedShadows: number;
  clippedHighlights: number;
};

export async function inspectImage(file: File): Promise<ImageQualityReport> {
  const bitmap = await createImageBitmap(file);
  try {
    const width = bitmap.width;
    const height = bitmap.height;
    const scale = Math.min(1, 160 / Math.max(width, height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(3, Math.round(width * scale));
    canvas.height = Math.max(3, Math.round(height * scale));
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Canvas is unavailable');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    const gray = new Float32Array(canvas.width * canvas.height);
    let shadows = 0;
    let highlights = 0;
    for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
      const value = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      gray[p] = value;
      if (value < 12) shadows += 1;
      if (value > 243) highlights += 1;
    }
    let sum = 0;
    let sumSquares = 0;
    let count = 0;
    for (let y = 1; y < canvas.height - 1; y += 1) {
      for (let x = 1; x < canvas.width - 1; x += 1) {
        const i = y * canvas.width + x;
        const laplacian = gray[i - 1] + gray[i + 1] + gray[i - canvas.width] + gray[i + canvas.width] - 4 * gray[i];
        sum += laplacian;
        sumSquares += laplacian * laplacian;
        count += 1;
      }
    }
    const mean = sum / count;
    return {
      width, height,
      sharpness: Math.max(0, sumSquares / count - mean * mean),
      clippedShadows: shadows / gray.length,
      clippedHighlights: highlights / gray.length,
    };
  } finally {
    bitmap.close();
  }
}
