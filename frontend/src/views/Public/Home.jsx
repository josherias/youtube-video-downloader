import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Button,
  ConfigProvider,
  Form,
  Input,
  Progress,
  Switch,
} from "antd";
import toast from "react-hot-toast";
import {
  createDownload,
  formatBytes,
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
    case "failed":
      return "Failed";
    default:
      return status;
  }
}

export default function Home() {
  const [form] = Form.useForm();
  const [previewLoading, setPreviewLoading] = useState(false);
  const [queueLoading, setQueueLoading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [job, setJob] = useState(null);
  const [error, setError] = useState("");
  const [quality, setQuality] = useState("best");
  const pollRef = useRef(null);

  const audioOnly = Form.useWatch("audio_only", form);
  const urlValue = Form.useWatch("url", form);

  const helper = useMemo(() => {
    if (audioOnly) {
      return "Exports audio as MP3 when ffmpeg is available on the server.";
    }
    return "Exports an MP4 with audio — H.264 + AAC when available.";
  }, [audioOnly]);

  const isBusy =
    previewLoading ||
    queueLoading ||
    job?.status === "queued" ||
    job?.status === "processing";

  useEffect(() => {
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setPreview(null);
    setJob(null);
    setError("");
  }, [urlValue]);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const startPolling = (id) => {
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
        const message =
          err?.response?.data?.error ||
          err?.message ||
          "Could not check download status.";
        setError(message);
      }
    }, 700);
  };

  const onPreview = async () => {
    try {
      const values = await form.validateFields(["url"]);
      setPreviewLoading(true);
      setError("");
      setJob(null);

      const response = await previewVideo(values.url.trim());
      const payload = response?.data;
      if (!payload?.title) {
        throw new Error("Could not load preview.");
      }
      setPreview(payload);
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

  const onFinish = async (values) => {
    setQueueLoading(true);
    setError("");
    setJob(null);
    stopPolling();

    try {
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
      if (payload.title || payload.thumbnail) {
        setPreview((current) => ({
          ...(current || {}),
          title: payload.title || current?.title,
          thumbnail: payload.thumbnail || current?.thumbnail,
          channel: payload.channel || current?.channel,
          duration_string:
            payload.duration_string || current?.duration_string,
        }));
      }

      if (payload.status === "completed") {
        toast.success("Your file is ready");
      } else if (payload.status === "failed") {
        setError(payload.error_message || "Download failed.");
      } else {
        startPolling(payload.id);
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

  return (
    <ConfigProvider theme={antTheme}>
      <section className="mx-auto grid max-w-5xl gap-10 lg:grid-cols-[1fr_1.05fr] lg:items-center lg:gap-14">
        <div className="animate-rise max-w-xl">
          <h1 className="brand-mark font-display text-[clamp(3.4rem,8vw,5.6rem)] leading-[0.92] text-ink">
            Tube<span className="text-accent">Grab</span>
          </h1>

          <p className="mt-5 max-w-md text-lg leading-relaxed text-muted sm:text-xl">
            Preview the video, then download a clean MP4 with live progress —
            no account, no clutter.
          </p>
        </div>

        <div className="animate-rise-delay panel rounded-[1.6rem] p-6 sm:p-8">
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-ink">New download</h2>
              <p className="mt-1 text-sm text-muted">
                Works with youtube.com and youtu.be links.
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
                placeholder="https://www.youtube.com/watch?v=..."
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
                {queueLoading ? "Starting…" : "Download"}
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

          {preview ? (
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

          {error && !job ? (
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
