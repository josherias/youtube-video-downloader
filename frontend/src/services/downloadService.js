import axiosClient from "../axios/axiosClient";
import { VITE_API_BASE_URL } from "../config";

export async function createDownload({ url, quality = "best", audioOnly = false }) {
  const { data } = await axiosClient.post(
    "/downloads",
    {
      url,
      quality,
      audio_only: audioOnly,
    },
    { __skipAuth: true }
  );

  return data;
}

export function getDownloadFileUrl(id) {
  return `${VITE_API_BASE_URL}/api/downloads/${id}/file`;
}

export function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}
