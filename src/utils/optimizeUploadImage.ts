const TARGET_BYTES = 1_000_000;
const MAX_SOURCE_SIDE = 20_000;
const MAX_OUTPUT_SIDE = 3_200;
const MIN_OUTPUT_SIDE = 1_024;
const QUALITIES = [0.88, 0.82, 0.76];

export class ImageOptimizationError extends Error {
  constructor(public readonly reason: "decode" | "unsupported" | "target") {
    super(reason);
  }
}

function readImage(file: File): Promise<{ image: HTMLImageElement; url: string }> {
  const url = URL.createObjectURL(file);
  const image = new Image();
  return new Promise((resolve, reject) => {
    image.onload = () => resolve({ image, url });
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new ImageOptimizationError("decode"));
    };
    image.src = url;
  });
}

function encodeWebp(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      // 不支持 WebP 的浏览器可能退回 PNG，不能用错误的扩展名上传。
      if (!blob || blob.type !== "image/webp") {
        reject(new ImageOptimizationError("unsupported"));
      } else {
        resolve(blob);
      }
    }, "image/webp", quality);
  });
}

export async function optimizeUploadImage(file: File): Promise<File> {
  // 小于 1 MB 的原图直接保留，避免无意义的画质损失。
  if (file.size < TARGET_BYTES) return file;

  const { image, url } = await readImage(file);
  try {
    const { naturalWidth: width, naturalHeight: height } = image;
    if (width < 1 || height < 1 || width > MAX_SOURCE_SIDE || height > MAX_SOURCE_SIDE) {
      throw new ImageOptimizationError("decode");
    }

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) throw new ImageOptimizationError("unsupported");
    const longSide = Math.max(width, height);
    const firstSide = Math.min(longSide, MAX_OUTPUT_SIDE);
    const sides = [firstSide, 2_560, 2_048, 1_600, 1_280, MIN_OUTPUT_SIDE]
      .filter((side, index, all) => side <= firstSide && all.indexOf(side) === index);

    // 先尝试较大分辨率和较高 WebP 画质，只有超出目标才逐级降低。
    for (const side of sides) {
      const scale = side / longSide;
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      // 改变画布尺寸会重置绘图状态，因此每轮都重新设置高质量缩放。
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      for (const quality of QUALITIES) {
        const blob = await encodeWebp(canvas, quality);
        if (blob.size > 0 && blob.size < TARGET_BYTES) {
          const name = file.name.replace(/\.[^.]+$/, "") + ".webp";
          return new File([blob], name, { type: "image/webp", lastModified: Date.now() });
        }
      }
    }
    // 不牺牲到过低画质；未达到目标就明确报错，不上传超限文件。
    throw new ImageOptimizationError("target");
  } finally {
    URL.revokeObjectURL(url);
  }
}
