import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Button,
  Checkbox,
  ConfigProvider,
  Form,
  Input,
  Progress,
  Switch,
} from "antd";
import toast from "react-hot-toast";
import {
  createBatchDownload,
  createDownload,
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
    default:
      return status;
  }
}

function entryKey(entry, index) {
  return entry.id || entry.webpage_url || String(index);
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
  const pollRef = useRef(null);

  const audioOnly = Form.useWatch("audio_only", form);
  const urlValue = Form.useWatch("url", form);
  const isPlaylist = preview?.type === "playlist";

  const helper = useMemo(() => {
    if (audioOnly) {
      return "Exports audio as MP3 when ffmpeg is available on the server.";
    }
    return "Exports an MP4 with audio — H.264 + AAC when available.";
  }, [audioOnly]);

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
    stopPolling();
  }, [urlValue]);

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
          audioOnly: Boolean(values.audio_only),
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
        audioOnly: Boolean(values.audio_only),
        preview,
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

  return (
    <ConfigProvider theme={antTheme}>
      <section className="mx-auto grid max-w-5xl gap-10 lg:grid-cols-[1fr_1.05fr] lg:items-start lg:gap-14">
        <div className="animate-rise max-w-xl lg:sticky lg:top-10">
          <h1 className="brand-mark font-display text-[clamp(3.4rem,8vw,5.6rem)] leading-[0.92] text-ink">
            Tube<span className="text-accent">Grab</span>
          </h1>

          <p className="mt-5 max-w-md text-lg leading-relaxed text-muted sm:text-xl">
            Preview a video or playlist, pick what you want, then download with
            live progress.
          </p>
        </div>

        <div className="animate-rise-delay panel rounded-[1.6rem] p-6 sm:p-8">
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-ink">New download</h2>
              <p className="mt-1 text-sm text-muted">
                Video, playlist, or youtu.be links.
              </p>
            </div>
            {isBusy ? (
              <span className="loading-dot mt-1 text-xs font-medium uppercase tracking-[0.16em] text-accent">
                Working
              </span>
            ) : null}
          </div>

          <Form
            form={form}
            layout="vertical"
            requiredMark={false}
            initialValues={{ audio_only: false }}
            onFinish={onFinish}
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
                placeholder="https://www.youtube.com/playlist?list=..."
                allowClear
                disabled={isBusy}
              />
            </Form.Item>

            <div className="mb-5 grid grid-cols-2 gap-3">
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
                {queueLoading
                  ? "Starting…"
                  : isPlaylist
                    ? `Download (${selectedEntries.length})`
                    : "Download"}
              </Button>
            </div>

            <div className="mb-5">
              <label className="mb-2 block text-sm font-medium text-ink-soft">
                Quality
              </label>
              <div className="quality-group" role="radiogroup" aria-label="Quality">
                {QUALITY_OPTIONS.map((option) => {
                  const active = quality === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      className={`quality-btn ${active ? "is-active" : ""}`}
                      disabled={Boolean(audioOnly) || isBusy}
                      aria-pressed={active}
                      onClick={() => setQuality(option.value)}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mb-2 flex items-center justify-between rounded-xl border border-line bg-panel/70 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-ink">Audio only</p>
                <p className="text-xs text-muted">Skip video, keep the track</p>
              </div>
              <Form.Item name="audio_only" valuePropName="checked" className="!mb-0">
                <Switch className="tg-switch" disabled={isBusy} />
              </Form.Item>
            </div>

            <p className="mb-2 text-xs leading-relaxed text-muted">{helper}</p>
          </Form>

          {preview && !isPlaylist ? (
            <div className="animate-fade mt-5 overflow-hidden rounded-2xl border border-line bg-white">
              <div className="grid gap-0 sm:grid-cols-[140px_1fr]">
                {preview.thumbnail ? (
                  <img
                    src={preview.thumbnail}
                    alt=""
                    className="h-28 w-full object-cover sm:h-full"
                  />
                ) : (
                  <div className="flex h-28 items-center justify-center bg-panel text-xs text-muted sm:h-full">
                    No thumbnail
                  </div>
                )}
                <div className="min-w-0 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                    Preview
                  </p>
                  <p className="mt-1 line-clamp-2 text-base font-semibold text-ink">
                    {preview.title}
                  </p>
                  <p className="mt-2 text-sm text-muted">
                    {[preview.channel, preview.duration_string]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          {isPlaylist ? (
            <div className="animate-fade mt-5 rounded-2xl border border-line bg-white p-4">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                    Playlist
                  </p>
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
                    <label
                      key={key}
                      className="flex cursor-pointer items-center gap-3 rounded-xl border border-line px-3 py-2 hover:bg-panel/60"
                    >
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
              className={`mt-5 rounded-2xl p-4 sm:p-5 ${
                job.status === "completed"
                  ? "result-shell"
                  : "border border-line bg-panel/80"
              } animate-rise-late`}
            >
              <div className="flex items-center justify-between gap-3">
                <p
                  className={`text-xs font-semibold uppercase tracking-[0.14em] ${
                    job.status === "completed"
                      ? "text-success"
                      : job.status === "failed"
                        ? "text-accent"
                        : "text-muted"
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

              {job.status === "completed" ? (
                <>
                  <p className="mt-1 truncate text-sm text-muted">
                    {job.extension?.toUpperCase() || "FILE"}
                    {job.size ? ` · ${formatBytes(job.size)}` : ""}
                  </p>
                  <Button
                    className="tg-secondary mt-4"
                    type="default"
                    size="large"
                    href={getDownloadFileUrl(job.id)}
                    target="_blank"
                    rel="noreferrer"
                    block
                  >
                    Save file
                  </Button>
                </>
              ) : null}

              {job.status === "failed" && job.error_message ? (
                <p className="mt-2 text-sm text-accent">{job.error_message}</p>
              ) : null}
            </div>
          ) : null}

          {batch ? (
            <div className="animate-rise-late mt-5 rounded-2xl border border-line bg-panel/80 p-4 sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
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

              <div className="mt-4 max-h-80 space-y-2 overflow-y-auto">
                {(batch.jobs || []).map((item) => (
                  <div
                    key={item.id}
                    className="rounded-xl border border-line bg-white px-3 py-3"
                  >
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
                        <a
                          className="shrink-0 text-sm font-semibold text-accent hover:underline"
                          href={getDownloadFileUrl(item.id)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Save
                        </a>
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
      </section>
    </ConfigProvider>
  );
}
