import { createBrowserRouter } from "react-router-dom";
import GuestLayout from "../layouts/GuestLayout";
import Home from "../views/Public/Home";
import { HOME_PATH } from "./routes";

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
]);

export default router;
