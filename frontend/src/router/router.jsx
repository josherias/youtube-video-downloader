import { createBrowserRouter } from "react-router-dom";
import AdminLayout from "../layouts/AdminLayout";
import GuestLayout from "../layouts/GuestLayout";
import AdminClients from "../views/Admin/Clients";
import AdminDownloads from "../views/Admin/Downloads";
import AdminLogin from "../views/Admin/Login";
import AdminOverview from "../views/Admin/Overview";
import Home from "../views/Public/Home";
import {
  ADMIN_LOGIN_PATH,
  ADMIN_PATH,
  HOME_PATH,
} from "./routes";

const router = createBrowserRouter([
  {
    path: HOME_PATH,
    element: <GuestLayout />,
    children: [
      {
        index: true,
        element: <Home />,
      },
    ],
  },
  {
    path: ADMIN_LOGIN_PATH,
    element: <AdminLogin />,
  },
  {
    path: ADMIN_PATH,
    element: <AdminLayout />,
    children: [
      {
        index: true,
        element: <AdminOverview />,
      },
      {
        path: "downloads",
        element: <AdminDownloads />,
      },
      {
        path: "clients",
        element: <AdminClients />,
      },
    ],
  },
]);

export default router;
