import axios from "axios";
import { VITE_API_BASE_URL } from "../config";
import { getAdminToken } from "../services/adminAuth";

const axiosClient = axios.create({
  baseURL: `${VITE_API_BASE_URL}/api`,
  withCredentials: true,
  timeout: 620000,
});

axiosClient.interceptors.request.use((config) => {
  if (config.__skipAuth) {
    return config;
  }

  const token = getAdminToken();
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

export default axiosClient;
