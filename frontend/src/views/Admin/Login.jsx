import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { Alert, Button, Form, Input } from "antd";
import toast from "react-hot-toast";
import { AdminTheme } from "../../components/admin/AdminUI";
import { adminLogin, getAdminToken } from "../../services/adminService";
import { ADMIN_OVERVIEW_PATH, HOME_PATH } from "../../router/routes";

export default function AdminLogin() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (getAdminToken()) {
    return <Navigate to={ADMIN_OVERVIEW_PATH} replace />;
  }

  const submit = async (values) => {
    setLoading(true);
    setError("");
    try {
      await adminLogin(values);
      toast.success("Signed in");
      navigate(ADMIN_OVERVIEW_PATH, { replace: true });
    } catch (err) {
      const msg =
        err?.response?.data?.errors?.email?.[0] ||
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        "Could not sign in.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AdminTheme>
      <div className="admin-login-shell">
        <aside className="admin-login-brand animate-fade">
          <p className="admin-brand-kicker text-white/70">TubeGrab</p>
          <h1 className="mt-4 font-display text-5xl leading-none text-white sm:text-6xl">
            Operations
          </h1>
          <p className="mt-5 max-w-sm text-base leading-relaxed text-white/75">
            Monitor download volume, client IPs, and job health from one place.
          </p>
          <ul className="admin-login-points">
            <li>Real-time job status</li>
            <li>Client IP analytics</li>
            <li>Format & quality trends</li>
          </ul>
        </aside>

        <div className="admin-login-form-wrap">
          <div className="admin-login-card animate-rise">
            <p className="admin-eyebrow">Admin access</p>
            <h2 className="mt-2 font-display text-3xl text-ink sm:text-4xl">
              Sign in
            </h2>
            <p className="mt-2 text-sm text-muted">
              Enter your admin email and password to continue.
            </p>

            <Form
              className="mt-8"
              layout="vertical"
              onFinish={submit}
              requiredMark={false}
            >
              <Form.Item
                label="Email"
                name="email"
                rules={[
                  { required: true, message: "Email is required" },
                  { type: "email", message: "Enter a valid email" },
                ]}
              >
                <Input
                  size="large"
                  className="admin-field"
                  autoComplete="username"
                  placeholder="admin@example.com"
                />
              </Form.Item>
              <Form.Item
                label="Password"
                name="password"
                rules={[{ required: true, message: "Password is required" }]}
              >
                <Input.Password
                  size="large"
                  className="admin-field"
                  autoComplete="current-password"
                  placeholder="Password"
                />
              </Form.Item>
              {error ? (
                <Alert className="mb-4" type="error" showIcon message={error} />
              ) : null}
              <Button
                type="primary"
                htmlType="submit"
                size="large"
                className="admin-btn-primary"
                loading={loading}
                block
              >
                Sign in
              </Button>
            </Form>

            <Link
              to={HOME_PATH}
              className="mt-6 inline-block text-sm text-muted underline-offset-2 hover:text-ink hover:underline"
            >
              ← Back to downloader
            </Link>
          </div>
        </div>
      </div>
    </AdminTheme>
  );
}
