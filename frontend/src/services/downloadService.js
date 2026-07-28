import axiosClient from "../axios/axiosClient";
import { VITE_API_BASE_URL } from "../config";

export async function previewVideo(url) {
  const { data } = await axiosClient.post(
    "/preview",
    { url },
    { __skipAuth: true }
  );
  return data;
}

export async function createDownload({
  url,
  quality = "best",
  audioOnly = false,
  preview = null,
}) {
  const { data } = await axiosClient.post(
    "/downloads",
    {
      url,
      quality,
      audio_only: audioOnly,
      ...(preview
        ? {
            title: preview.title,
            channel: preview.channel,
            duration: preview.duration,
            duration_string: preview.duration_string,
            thumbnail: preview.thumbnail,
          }
        : {}),
    },
    { __skipAuth: true }
  );
  return data;
}

export async function createBatchDownload({
  items,
  quality = "best",
  audioOnly = false,
}) {
  const { data } = await axiosClient.post(
    "/downloads/batch",
    {
      quality,
      audio_only: audioOnly,
      items: items.map((item) => ({
        url: item.webpage_url || item.url,
        title: item.title,
        channel: item.channel,
        duration: item.duration,
        duration_string: item.duration_string,
        thumbnail: item.thumbnail,
      })),
    },
    { __skipAuth: true }
  );
  return data;
}

export async function getDownloadStatus(id) {
  const { data } = await axiosClient.get(`/downloads/${id}`, {
    __skipAuth: true,
  });
  return data;
}

export async function getBatchStatus(id) {
  const { data } = await axiosClient.get(`/batches/${id}`, {
    __skipAuth: true,
  });
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
