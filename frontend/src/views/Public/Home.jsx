import { useMemo, useState } from "react";
import { Alert, Button, ConfigProvider, Form, Input, Switch } from "antd";
import toast from "react-hot-toast";
import {
  createDownload,
  formatBytes,
  getDownloadFileUrl,
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

export default function Home() {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [quality, setQuality] = useState("best");

  const audioOnly = Form.useWatch("audio_only", form);

  const helper = useMemo(() => {
    if (audioOnly) {
      return "Exports audio as MP3 when ffmpeg is available on the server.";
    }
    return "Exports an MP4 with audio — H.264 + AAC when available.";
  }, [audioOnly]);

  const onFinish = async (values) => {
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const response = await createDownload({
        url: values.url.trim(),
        quality: quality || "best",
        audioOnly: Boolean(values.audio_only),
      });

      const payload = response?.data;
      if (!payload?.id) {
        throw new Error("Unexpected response from server.");
      }

      setResult(payload);
      toast.success("Your file is ready");
    } catch (err) {
      const message =
        err?.response?.data?.error ||
        err?.message ||
        "Download failed. Please try again.";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
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
            Paste a link. Choose quality. Download a clean MP4 — no account,
            no clutter.
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
            {loading ? (
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
              />
            </Form.Item>

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
                      disabled={Boolean(audioOnly)}
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
                <Switch className="tg-switch" />
              </Form.Item>
            </div>

            <p className="mb-6 text-xs leading-relaxed text-muted">{helper}</p>

            <Button
              className="tg-primary"
              type="primary"
              htmlType="submit"
              size="large"
              loading={loading}
              block
            >
              {loading ? "Preparing file…" : "Download"}
            </Button>
          </Form>

          {error ? (
            <Alert
              className="animate-fade mt-5"
              type="error"
              showIcon
              message={error}
            />
          ) : null}

          {result ? (
            <div className="result-shell animate-rise-late mt-5 rounded-2xl p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-success">
                    Ready
                  </p>
                  <p className="mt-1 truncate text-base font-semibold text-ink">
                    {result.title}
                  </p>
                  <p className="mt-1 truncate text-sm text-muted">
                    {result.extension?.toUpperCase() || "FILE"}
                    {result.size ? ` · ${formatBytes(result.size)}` : ""}
                  </p>
                </div>
              </div>
              <Button
                className="tg-secondary mt-4"
                type="default"
                size="large"
                href={getDownloadFileUrl(result.id)}
                target="_blank"
                rel="noreferrer"
                block
              >
                Save file
              </Button>
            </div>
          ) : null}
        </div>
      </section>
    </ConfigProvider>
  );
}
