import axios from "axios";
import { VITE_API_BASE_URL } from "../config";

const axiosClient = axios.create({
  baseURL: `${VITE_API_BASE_URL}/api`,
  withCredentials: true,
  timeout: 620000,
});

axiosClient.interceptors.request.use((config) => {
  if (config.__skipAuth) {
    return config;
  }
  return config;
});

export default axiosClient;
