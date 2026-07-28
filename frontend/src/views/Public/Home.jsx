import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Button,
  Checkbox,
  ConfigProvider,
  Form,
  Input,
  Progress,
} from "antd";
import toast from "react-hot-toast";
import {
  createBatchDownload,
  createDownload,
  cancelBatch,
  cancelDownload,
  formatBytes,
  getBatchStatus,
  getDownloadFileUrl,
  getDownloadStatus,
  previewVideo,
} from "../../services/downloadService";

const QUALITY_OPTIONS = [
  { label: "Best", value: "best" },
  { label: "1080p", value: "1080" },
  { label: "720p", value: "720" },
  { label: "480p", value: "480" },
];

const FORMAT_OPTIONS = [
  { label: "MP4", value: "mp4" },
  { label: "WebM", value: "webm" },
  { label: "MP3", value: "mp3" },
  { label: "M4A", value: "m4a" },
];

const CODEC_OPTIONS = [
  { label: "Compatible", value: "compatible" },
  { label: "Best quality", value: "best" },
];

const antTheme = {
  token: {
    colorPrimary: "#d61f3c",
    colorText: "#12141a",
    colorTextSecondary: "#6b7280",
    borderRadius: 12,
    fontFamily: '"Outfit", ui-sans-serif, system-ui, sans-serif',
    controlHeightLG: 48,
  },
  components: {
    Form: {
      labelColor: "#2a2e38",
      verticalLabelPadding: "0 0 6px",
    },
  },
};

function statusLabel(status) {
  switch (status) {
    case "queued":
      return "Queued";
    case "processing":
      return "Downloading";
    case "completed":
      return "Ready";
    case "partial":
      return "Partial";
    case "failed":
      return "Failed";
    case "cancelled":
      return "Cancelled";
    default:
      return status;
  }
}

function entryKey(entry, index) {
  return entry.id || entry.webpage_url || String(index);
}

function parseTimestamp(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text) return null;
  if (/^\d+(\.\d+)?$/.test(text)) return Number(text);
  const parts = text.split(":").map((part) => Number(part));
  if (parts.some((part) => Number.isNaN(part))) {
    throw new Error("Use seconds or MM:SS / HH:MM:SS");
  }
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 1) return parts[0];
  throw new Error("Use seconds or MM:SS / HH:MM:SS");
}

function formatTimestamp(seconds) {
  if (seconds == null) return "";
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function Home() {
  const [form] = Form.useForm();
  const [previewLoading, setPreviewLoading] = useState(false);
  const [queueLoading, setQueueLoading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [selectedKeys, setSelectedKeys] = useState([]);
  const [job, setJob] = useState(null);
  const [batch, setBatch] = useState(null);
  const [error, setError] = useState("");
  const [quality, setQuality] = useState("best");
  const [format, setFormat] = useState("mp4");
  const [codec, setCodec] = useState("compatible");
  const [clipEnabled, setClipEnabled] = useState(false);
  const [trimStart, setTrimStart] = useState("0:00");
  const [trimEnd, setTrimEnd] = useState("");
  const [sharing, setSharing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const pollRef = useRef(null);

  const urlValue = Form.useWatch("url", form);
  const isPlaylist = preview?.type === "playlist";
  const isAudioFormat = format === "mp3" || format === "m4a";
  const canShare =
    typeof navigator !== "undefined" &&
    typeof navigator.share === "function";

  const helper = useMemo(() => {
    if (format === "mp3") return "Audio-only MP3 export.";
    if (format === "m4a") return "Audio-only M4A/AAC export.";
    if (format === "webm") {
      return codec === "compatible"
        ? "WebM with VP9 + Opus when available."
        : "Best available streams remuxed into WebM.";
    }
    return codec === "compatible"
      ? "MP4 with H.264 + AAC for widest playback support."
      : "Best available streams remuxed into MP4.";
  }, [format, codec]);

  const activeWork =
    job?.status === "queued" ||
    job?.status === "processing" ||
    batch?.status === "queued" ||
    batch?.status === "processing";

  const isBusy = previewLoading || queueLoading || activeWork;

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  useEffect(() => {
    setPreview(null);
    setSelectedKeys([]);
    setJob(null);
    setBatch(null);
    setError("");
    setClipEnabled(false);
    setTrimStart("0:00");
    setTrimEnd("");
    stopPolling();
  }, [urlValue]);

  useEffect(() => {
    if (preview?.type === "video" && preview.duration && !trimEnd) {
      setTrimEnd(formatTimestamp(preview.duration));
    }
  }, [preview, trimEnd]);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const startJobPolling = (id) => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const response = await getDownloadStatus(id);
        const next = response?.data;
        if (!next) return;
        setJob(next);
        if (next.status === "completed") {
          stopPolling();
          toast.success("Your file is ready");
        } else if (next.status === "failed") {
          stopPolling();
          setError(next.error_message || "Download failed.");
          toast.error(next.error_message || "Download failed.");
        } else if (next.status === "cancelled") {
          stopPolling();
          toast("Download cancelled");
        }
      } catch (err) {
        stopPolling();
        setError(
          err?.response?.data?.error ||
            err?.message ||
            "Could not check download status."
        );
      }
    }, 700);
  };

  const startBatchPolling = (id) => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const response = await getBatchStatus(id);
        const next = response?.data;
        if (!next) return;
        setBatch(next);
        if (next.status === "completed") {
          stopPolling();
          toast.success("Batch complete");
        } else if (next.status === "partial") {
          stopPolling();
          toast.success("Batch finished with some failures");
        } else if (next.status === "failed") {
          stopPolling();
          setError("All videos in this batch failed.");
          toast.error("Batch failed");
        } else if (next.status === "cancelled") {
          stopPolling();
          toast("Batch cancelled");
        }
      } catch (err) {
        stopPolling();
        setError(
          err?.response?.data?.error ||
            err?.message ||
            "Could not check batch status."
        );
      }
    }, 900);
  };

  const onPreview = async () => {
    try {
      const values = await form.validateFields(["url"]);
      setPreviewLoading(true);
      setError("");
      setJob(null);
      setBatch(null);

      const response = await previewVideo(values.url.trim());
      const payload = response?.data;
      if (!payload?.title) {
        throw new Error("Could not load preview.");
      }

      setPreview(payload);
      if (payload.type === "playlist") {
        const keys = (payload.entries || []).map(entryKey);
        setSelectedKeys(keys);
        toast.success(
          `Found ${payload.entry_count || keys.length} videos in playlist`
        );
      } else {
        setSelectedKeys([]);
      }
    } catch (err) {
      if (err?.errorFields) return;
      const message =
        err?.response?.data?.error ||
        err?.message ||
        "Could not fetch video info.";
      setError(message);
      toast.error(message);
    } finally {
      setPreviewLoading(false);
    }
  };

  const selectedEntries = useMemo(() => {
    if (!isPlaylist) return [];
    return (preview.entries || []).filter((entry, index) =>
      selectedKeys.includes(entryKey(entry, index))
    );
  }, [isPlaylist, preview, selectedKeys]);

  const onFinish = async (values) => {
    setQueueLoading(true);
    setError("");
    setJob(null);
    setBatch(null);
    stopPolling();

    try {
      if (isPlaylist) {
        if (selectedEntries.length === 0) {
          throw new Error("Select at least one video from the playlist.");
        }

        const response = await createBatchDownload({
          items: selectedEntries,
          quality: quality || "best",
          format,
          codec,
        });

        const payload = response?.data;
        if (!payload?.id) {
          throw new Error("Unexpected response from server.");
        }

        setBatch(payload);
        if (payload.status === "completed") {
          toast.success("Batch complete");
        } else if (
          payload.status === "processing" ||
          payload.status === "queued"
        ) {
          startBatchPolling(payload.id);
        }
        return;
      }

      const response = await createDownload({
        url: values.url.trim(),
        quality: quality || "best",
        format,
        codec,
        preview,
        ...(clipEnabled && !isPlaylist
          ? (() => {
              const start = parseTimestamp(trimStart) ?? 0;
              const end = parseTimestamp(trimEnd);
              if (end == null) {
                throw new Error("Enter a clip end time.");
              }
              if (end <= start) {
                throw new Error("Clip end must be after start.");
              }
              if (preview?.duration && end > preview.duration) {
                throw new Error("Clip end is past the video duration.");
              }
              return { trimStart: start, trimEnd: end };
            })()
          : {}),
      });

      const payload = response?.data;
      if (!payload?.id) {
        throw new Error("Unexpected response from server.");
      }

      setJob(payload);
      if (payload.status === "completed") {
        toast.success("Your file is ready");
      } else if (payload.status === "failed") {
        setError(payload.error_message || "Download failed.");
      } else {
        startJobPolling(payload.id);
      }
    } catch (err) {
      const message =
        err?.response?.data?.error ||
        err?.message ||
        "Download failed. Please try again.";
      setError(message);
      toast.error(message);
    } finally {
      setQueueLoading(false);
    }
  };

  const toggleAll = (checked) => {
    if (!isPlaylist) return;
    setSelectedKeys(checked ? (preview.entries || []).map(entryKey) : []);
  };

  const shareJob = async (item) => {
    const url = getDownloadFileUrl(item.id);
    setSharing(true);
    try {
      if (canShare) {
        await navigator.share({
          title: item.title || "TubeGrab download",
          text: item.title || "Downloaded with TubeGrab",
          url,
        });
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        toast.success("Download link copied");
      } else {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    } catch (err) {
      if (err?.name !== "AbortError") {
        toast.error("Could not share link");
      }
    } finally {
      setSharing(false);
    }
  };

  const onCancelJob = async () => {
    if (!job?.id) return;
    setCancelling(true);
    try {
      const response = await cancelDownload(job.id);
      const payload = response?.data;
      if (payload) setJob(payload);
      stopPolling();
      toast("Download cancelled");
    } catch (err) {
      toast.error(
        err?.response?.data?.error || err?.message || "Could not cancel"
      );
    } finally {
      setCancelling(false);
    }
  };

  const onCancelBatch = async () => {
    if (!batch?.id) return;
    setCancelling(true);
    try {
      const response = await cancelBatch(batch.id);
      const payload = response?.data;
      if (payload) setBatch(payload);
      stopPolling();
      toast("Batch cancelled");
    } catch (err) {
      toast.error(
        err?.response?.data?.error || err?.message || "Could not cancel batch"
      );
    } finally {
      setCancelling(false);
    }
  };

  const downloadLabel = queueLoading
    ? "Starting…"
    : isPlaylist
      ? `Download (${selectedEntries.length})`
      : clipEnabled
        ? "Download clip"
        : "Download";

  const OptionGroup = ({ label, options, value, onChange, disabled, cols }) => (
    <div className="home-field">
      <p className="home-field-label">{label}</p>
      <div
        className={`home-segment ${cols === 2 ? "home-segment--2" : "home-segment--4"}`}
        role="radiogroup"
        aria-label={label}
      >
        {options.map((option) => {
          const active = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              className={`home-chip ${active ? "is-active" : ""}`}
              disabled={disabled}
              aria-pressed={active}
              onClick={() => onChange(option.value)}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <ConfigProvider theme={antTheme}>
      <section className="home-layout">
        <aside className="home-intro animate-rise order-2 lg:order-1">
          <p className="home-kicker">Personal media tool</p>
          <h1 className="brand-mark home-hero-title">
            Tube<span className="text-accent">Grab</span>
          </h1>
          <p className="home-hero-copy">
            Paste a YouTube link, preview it, then grab a clean file — or clip
            just the part you need.
          </p>

          <ul className="home-points">
            <li>
              <strong>Video & audio</strong>
              <span>MP4, WebM, MP3, M4A</span>
            </li>
            <li>
              <strong>Playlists</strong>
              <span>Pick what you want</span>
            </li>
            <li>
              <strong>Trim clips</strong>
              <span>Start and end times</span>
            </li>
          </ul>
        </aside>

        <div className="home-workspace animate-rise-delay order-1 lg:order-2">
          <div className="home-panel">
            <div className="home-panel-head">
              <div>
                <h2 className="home-panel-title">New download</h2>
                <p className="home-panel-sub">
                  Video, playlist, or youtu.be links
                </p>
              </div>
              {isBusy ? (
                <span className="home-working">
                  <span className="loading-dot" aria-hidden />
                  Working
                </span>
              ) : null}
            </div>

            <Form
              form={form}
              layout="vertical"
              requiredMark={false}
              onFinish={onFinish}
              className="home-form"
            >
              <Form.Item
                label="YouTube URL"
                name="url"
                rules={[
                  { required: true, message: "Paste a YouTube URL" },
                  { type: "url", message: "Enter a valid URL" },
                ]}
              >
                <Input
                  className="tg-input"
                  size="large"
                  inputMode="url"
                  enterKeyHint="go"
                  placeholder="https://youtube.com/watch?v=…"
                  allowClear
                  disabled={isBusy}
                />
              </Form.Item>

              <div className="home-actions mb-6 hidden sm:grid">
                <Button
                  className="tg-secondary"
                  size="large"
                  onClick={onPreview}
                  loading={previewLoading}
                  disabled={isBusy && !previewLoading}
                  block
                >
                  Preview
                </Button>
                <Button
                  className="tg-primary"
                  type="primary"
                  htmlType="submit"
                  size="large"
                  loading={queueLoading}
                  disabled={isBusy && !queueLoading}
                  block
                >
                  {downloadLabel}
                </Button>
              </div>

              <div className="home-settings">
                <div className="home-settings-head">
                  <p className="home-settings-title">Output</p>
                  <p className="home-settings-hint">{helper}</p>
                </div>

                <OptionGroup
                  label="Format"
                  options={FORMAT_OPTIONS}
                  value={format}
                  onChange={setFormat}
                  disabled={isBusy}
                />
                <OptionGroup
                  label="Codec"
                  options={CODEC_OPTIONS}
                  value={codec}
                  onChange={setCodec}
                  disabled={isBusy}
                  cols={2}
                />
                <OptionGroup
                  label="Quality"
                  options={QUALITY_OPTIONS}
                  value={quality}
                  onChange={setQuality}
                  disabled={isAudioFormat || isBusy}
                />
              </div>

              {!isPlaylist ? (
                <div className={`home-trim ${clipEnabled ? "is-open" : ""}`}>
                  <div className="home-trim-row">
                    <div>
                      <p className="home-trim-title">Trim / clip</p>
                      <p className="home-trim-sub">
                        Download only part of the video
                        {preview?.duration_string
                          ? ` · ${preview.duration_string} total`
                          : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      className={`clip-toggle ${clipEnabled ? "is-on" : ""}`}
                      aria-pressed={clipEnabled}
                      disabled={isBusy}
                      onClick={() => {
                        setClipEnabled((value) => {
                          const next = !value;
                          if (
                            next &&
                            !trimEnd &&
                            preview?.type === "video" &&
                            preview.duration
                          ) {
                            setTrimEnd(formatTimestamp(preview.duration));
                          }
                          return next;
                        });
                      }}
                    >
                      {clipEnabled ? "On" : "Off"}
                    </button>
                  </div>

                  {clipEnabled ? (
                    <div className="home-trim-fields">
                      <label className="block">
                        <span className="mb-1 block text-xs font-medium text-muted">
                          Start
                        </span>
                        <Input
                          className="tg-input"
                          value={trimStart}
                          disabled={isBusy}
                          placeholder="0:00"
                          inputMode="numeric"
                          onChange={(e) => setTrimStart(e.target.value)}
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-xs font-medium text-muted">
                          End
                        </span>
                        <Input
                          className="tg-input"
                          value={trimEnd}
                          disabled={isBusy}
                          placeholder="1:30"
                          inputMode="numeric"
                          onChange={(e) => setTrimEnd(e.target.value)}
                        />
                      </label>
                      <p className="col-span-2 text-xs text-muted">
                        Use seconds or MM:SS / HH:MM:SS.
                      </p>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </Form>

            {preview && !isPlaylist ? (
              <div className="home-preview animate-fade">
                {preview.thumbnail ? (
                  <img
                    src={preview.thumbnail}
                    alt=""
                    className="home-preview-thumb"
                  />
                ) : (
                  <div className="home-preview-placeholder">No thumbnail</div>
                )}
                <div className="home-preview-body">
                  <p className="home-eyebrow">Preview</p>
                  <p className="home-preview-title">{preview.title}</p>
                  <p className="home-preview-meta">
                    {[preview.channel, preview.duration_string]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
              </div>
            ) : null}

            {isPlaylist ? (
              <div className="home-playlist animate-fade">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="home-eyebrow">Playlist</p>
                    <p className="mt-1 truncate text-base font-semibold text-ink">
                      {preview.title}
                    </p>
                    <p className="mt-1 text-sm text-muted">
                      {[preview.channel, `${preview.entry_count || 0} videos`]
                        .filter(Boolean)
                        .join(" · ")}
                      {preview.truncated ? " · showing first items" : ""}
                    </p>
                  </div>
                  <Checkbox
                    checked={
                      selectedKeys.length > 0 &&
                      selectedKeys.length === (preview.entries || []).length
                    }
                    indeterminate={
                      selectedKeys.length > 0 &&
                      selectedKeys.length < (preview.entries || []).length
                    }
                    onChange={(e) => toggleAll(e.target.checked)}
                    disabled={isBusy}
                  >
                    All
                  </Checkbox>
                </div>

                <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                  {(preview.entries || []).map((entry, index) => {
                    const key = entryKey(entry, index);
                    return (
                      <label key={key} className="home-playlist-item">
                        <Checkbox
                          checked={selectedKeys.includes(key)}
                          disabled={isBusy}
                          onChange={(e) => {
                            setSelectedKeys((current) =>
                              e.target.checked
                                ? [...current, key]
                                : current.filter((item) => item !== key)
                            );
                          }}
                        />
                        {entry.thumbnail ? (
                          <img
                            src={entry.thumbnail}
                            alt=""
                            className="h-12 w-20 rounded-md object-cover"
                          />
                        ) : (
                          <div className="flex h-12 w-20 items-center justify-center rounded-md bg-panel text-[10px] text-muted">
                            N/A
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-ink">
                            {entry.title}
                          </p>
                          <p className="truncate text-xs text-muted">
                            {[entry.channel, entry.duration_string]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {job ? (
              <div
                className={`home-result animate-rise-late ${
                  job.status === "completed" ? "is-ready" : ""
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <p
                    className={`home-eyebrow ${
                      job.status === "completed"
                        ? "text-success"
                        : job.status === "failed"
                          ? "text-accent"
                          : ""
                    }`}
                  >
                    {statusLabel(job.status)}
                  </p>
                  {job.status === "queued" || job.status === "processing" ? (
                    <span className="text-sm font-medium text-ink">
                      {Math.round(job.progress || 0)}%
                    </span>
                  ) : null}
                </div>

                {(job.status === "queued" || job.status === "processing") && (
                  <Progress
                    className="mt-3"
                    percent={Math.round(job.progress || 0)}
                    showInfo={false}
                    strokeColor="#d61f3c"
                    trailColor="#e4e6eb"
                  />
                )}

                <p className="mt-3 truncate text-base font-semibold text-ink">
                  {job.title || preview?.title || "Preparing download…"}
                </p>

                {(job.status === "queued" || job.status === "processing") && (
                  <Button
                    className="tg-cancel mt-4"
                    danger
                    size="large"
                    loading={cancelling}
                    onClick={onCancelJob}
                    block
                  >
                    Cancel download
                  </Button>
                )}

                {job.status === "cancelled" ? (
                  <p className="mt-2 text-sm text-muted">
                    {job.error_message || "Cancelled by user."}
                  </p>
                ) : null}

                {job.status === "completed" ? (
                  <>
                    <p className="mt-1 truncate text-sm text-muted">
                      {job.extension?.toUpperCase() || "FILE"}
                      {job.size ? ` · ${formatBytes(job.size)}` : ""}
                      {job.trim_end != null
                        ? ` · clip ${formatTimestamp(job.trim_start || 0)}–${formatTimestamp(job.trim_end)}`
                        : ""}
                    </p>
                    <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <Button
                        className="tg-secondary"
                        type="default"
                        size="large"
                        href={getDownloadFileUrl(job.id)}
                        target="_blank"
                        rel="noreferrer"
                        block
                      >
                        Save file
                      </Button>
                      <Button
                        className="tg-secondary"
                        type="default"
                        size="large"
                        loading={sharing}
                        onClick={() => shareJob(job)}
                        block
                      >
                        {canShare ? "Share" : "Copy link"}
                      </Button>
                    </div>
                  </>
                ) : null}

                {job.status === "failed" && job.error_message ? (
                  <p className="mt-2 text-sm text-accent">{job.error_message}</p>
                ) : null}
              </div>
            ) : null}

            {batch ? (
              <div className="home-result animate-rise-late">
                <div className="flex items-center justify-between gap-3">
                  <p className="home-eyebrow">
                    Batch · {statusLabel(batch.status)}
                  </p>
                  <span className="text-sm font-medium text-ink">
                    {batch.completed}/{batch.total}
                  </span>
                </div>

                <Progress
                  className="mt-3"
                  percent={Math.round(batch.progress || 0)}
                  showInfo={false}
                  strokeColor="#d61f3c"
                  trailColor="#e4e6eb"
                />

                {(batch.status === "queued" || batch.status === "processing") && (
                  <Button
                    className="tg-cancel mt-4"
                    danger
                    size="large"
                    loading={cancelling}
                    onClick={onCancelBatch}
                    block
                  >
                    Cancel batch
                  </Button>
                )}

                <div className="mt-4 max-h-80 space-y-2 overflow-y-auto">
                  {(batch.jobs || []).map((item) => (
                    <div key={item.id} className="home-batch-item">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-ink">
                            {item.title || "Video"}
                          </p>
                          <p className="mt-1 text-xs text-muted">
                            {statusLabel(item.status)}
                            {item.status === "processing" ||
                            item.status === "queued"
                              ? ` · ${Math.round(item.progress || 0)}%`
                              : ""}
                            {item.status === "completed" && item.size
                              ? ` · ${formatBytes(item.size)}`
                              : ""}
                          </p>
                        </div>
                        {item.status === "completed" ? (
                          <div className="flex shrink-0 gap-3">
                            <a
                              className="text-sm font-semibold text-accent hover:underline"
                              href={getDownloadFileUrl(item.id)}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Save
                            </a>
                            <button
                              type="button"
                              className="text-sm font-semibold text-ink-soft hover:underline"
                              onClick={() => shareJob(item)}
                            >
                              {canShare ? "Share" : "Copy"}
                            </button>
                          </div>
                        ) : null}
                      </div>
                      {(item.status === "queued" ||
                        item.status === "processing") && (
                        <Progress
                          className="mt-2"
                          percent={Math.round(item.progress || 0)}
                          size="small"
                          showInfo={false}
                          strokeColor="#d61f3c"
                        />
                      )}
                      {item.status === "failed" && item.error_message ? (
                        <p className="mt-2 text-xs text-accent">
                          {item.error_message}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {error && !job && !batch ? (
              <Alert
                className="animate-fade mt-5"
                type="error"
                showIcon
                message={error}
              />
            ) : null}
          </div>
        </div>
      </section>

      <div className="mobile-action-bar">
        <Button
          className="tg-secondary"
          size="large"
          onClick={onPreview}
          loading={previewLoading}
          disabled={isBusy && !previewLoading}
          block
        >
          Preview
        </Button>
        <Button
          className="tg-primary"
          type="primary"
          size="large"
          loading={queueLoading}
          disabled={isBusy && !queueLoading}
          onClick={() => form.submit()}
          block
        >
          {downloadLabel}
        </Button>
      </div>
    </ConfigProvider>
  );
}
