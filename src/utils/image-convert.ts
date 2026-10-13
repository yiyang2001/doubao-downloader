export type ImageSaveFormat = "png" | "webp" | "jpeg";

export const IMAGE_SAVE_FORMATS: { value: ImageSaveFormat; label: string }[] = [
  { value: "png", label: "原图 PNG" },
  { value: "webp", label: "无损 WebP" },
  { value: "jpeg", label: "高质量 JPEG" },
];

const JPEG_QUALITY = 0.92;

export function imageSuffix(format: ImageSaveFormat) {
  return format === "jpeg" ? "jpg" : format;
}

export function supportsImageConversion() {
  return typeof OffscreenCanvas !== "undefined" && typeof createImageBitmap === "function";
}

// 不做色彩空间转换和预乘，保证读到的就是文件里的像素值
const decode = (blob: Blob) =>
  createImageBitmap(blob, { colorSpaceConversion: "none", premultiplyAlpha: "none" });

/** 把下载到的图片重新编码成指定格式。 */
export async function convertImage(blob: Blob, format: Exclude<ImageSaveFormat, "png">) {
  const bitmap = await decode(blob);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  try {
    if (format === "webp") {
      // Chromium 在 quality 为 1 时输出无损 WebP，是否成立由 isWebpLossless 实测
      canvas.getContext("bitmaprenderer")!.transferFromImageBitmap(bitmap);
      return await canvas.convertToBlob({ type: "image/webp", quality: 1 });
    }
    const context = canvas.getContext("2d")!;
    // JPEG 没有透明通道，透明部分铺白底
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0);
    return await canvas.convertToBlob({ type: "image/jpeg", quality: JPEG_QUALITY });
  } finally {
    bitmap.close();
  }
}

let webpLossless: Promise<boolean> | undefined;

/**
 * 实测当前浏览器的 WebP 编码是否真的无损：编码一张随机噪点图再解码，逐像素比对。
 * 结果在页面生命周期内缓存。
 */
export function isWebpLossless() {
  webpLossless ??= (async () => {
    try {
      const size = 64;
      const source = new ImageData(size, size);
      for (let i = 0; i < source.data.length; i++) {
        source.data[i] = i % 4 === 3 ? 255 : Math.floor(Math.random() * 256);
      }
      const canvas = new OffscreenCanvas(size, size);
      canvas.getContext("2d")!.putImageData(source, 0, 0);
      const png = await canvas.convertToBlob({ type: "image/png" });
      const webp = await convertImage(png, "webp");
      if (webp.type !== "image/webp") return false;

      const bitmap = await decode(webp);
      const check = new OffscreenCanvas(size, size);
      const context = check.getContext("2d")!;
      context.drawImage(bitmap, 0, 0);
      bitmap.close();
      const decoded = context.getImageData(0, 0, size, size).data;
      return decoded.every((value, index) => value === source.data[index]);
    } catch (error) {
      console.warn("豆包下载器: 无损 WebP 检测失败", error);
      return false;
    }
  })();
  return webpLossless;
}
