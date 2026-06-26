export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
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
