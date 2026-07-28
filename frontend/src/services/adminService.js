import axiosClient from "../axios/axiosClient";
import {
  clearAdminToken,
  getAdminToken,
  getAdminUser,
  setAdminToken,
  setAdminUser,
} from "./adminAuth";

export {
  clearAdminToken,
  getAdminToken,
  getAdminUser,
  setAdminToken,
  setAdminUser,
};

export async function adminLogin({ email, password }) {
  const { data } = await axiosClient.post(
    "/admin/login",
    { email, password },
    { __skipAuth: true }
  );
  const token = data.data.token;
  const user = data.data.user;
  setAdminToken(token);
  setAdminUser(user);
  return data.data;
}

export async function adminLogout() {
  try {
    await axiosClient.post("/admin/logout");
  } catch {
    // Still clear local session.
  } finally {
    clearAdminToken();
  }
}

export async function adminMe() {
  const { data } = await axiosClient.get("/admin/me");
  setAdminUser(data.data);
  return data.data;
}

export async function getAdminOverview({ days = 14 } = {}) {
  const { data } = await axiosClient.get("/admin/overview", {
    params: { days },
  });
  return data.data;
}

export async function getAdminJobs({
  page = 1,
  perPage = 25,
  status = "",
  ip = "",
  q = "",
} = {}) {
  const { data } = await axiosClient.get("/admin/jobs", {
    params: {
      page,
      per_page: perPage,
      ...(status ? { status } : {}),
      ...(ip ? { ip } : {}),
      ...(q ? { q } : {}),
    },
  });
  return data;
}
