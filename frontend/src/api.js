import axios from "axios";

const api = axios.create({ baseURL: "/api", withCredentials: true });
api.interceptors.request.use(config => {
  const csrf = document.cookie.split("; ").find(part => part.startsWith("verifi_csrf="))?.split("=").slice(1).join("=");
  if (csrf && !["get", "head", "options"].includes((config.method || "get").toLowerCase())) config.headers["X-CSRF-Token"] = decodeURIComponent(csrf);
  return config;
});
api.interceptors.response.use(response => response, error => {
  if (error.response?.status === 401 && !error.config?.url?.includes("/auth/login")) window.dispatchEvent(new Event("verifi:session-expired"));
  return Promise.reject(error);
});
export default api;
