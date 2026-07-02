export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

// 上传前把图片压缩：超过 maxDim 的边等比缩小，并重新编码为 JPEG，
// 避免多张大图 base64 撑爆请求体（413）。小图（未超尺寸且体积不大）原样返回，保留格式/透明。
export async function fileToDownscaledDataUrl(file: File, maxDim = 1600, quality = 0.85): Promise<string> {
  const original = await fileToDataUrl(file);
  if (!file.type.startsWith("image/") || file.type === "image/svg+xml") return original;
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("image load failed"));
      img.src = original;
    });
    const longest = Math.max(img.width, img.height);
    if (longest <= maxDim && original.length < 2_000_000) return original;
    const scale = Math.min(1, maxDim / longest);
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return original;
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", quality);
  } catch {
    return original;
  }
}

export async function urlToDataUrl(url: string): Promise<string> {
  const response = await fetch(url);
  const blob = await response.blob();
  return fileToDataUrl(new File([blob], "sample.png", { type: blob.type || "image/png" }));
}

export type ExportedImage = {
  filename: string;
  path?: string;
  downloadUrl: string;
};

type ExportCoverResponse = {
  ok?: boolean;
  filename?: string;
  path?: string;
  downloadUrl?: string;
  message?: string;
};

export async function exportImageUrl(imageUrl: string, filename: string): Promise<ExportedImage> {
  const response = await fetch("/api/export-cover", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageUrl, filename }),
  });
  const data = (await response.json().catch(() => ({}))) as ExportCoverResponse;
  if (!response.ok || !data.ok || !data.downloadUrl) {
    throw new Error(data.message || "导出失败");
  }
  return {
    filename: data.filename || filename,
    path: data.path,
    downloadUrl: data.downloadUrl,
  };
}

export function downloadImageUrl(imageUrl: string, filename: string): void {
  const anchor = document.createElement("a");
  anchor.href = imageUrl;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

export function formatTime(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
