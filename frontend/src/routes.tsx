import { createBrowserRouter } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { PanelPage } from "@/pages/PanelPage";
import { LicitacionesPage } from "@/pages/LicitacionesPage";
import { LicitacionDetailPage } from "@/pages/LicitacionDetailPage";
import { PerfilEmpresaPage } from "@/pages/PerfilEmpresaPage";
import { ProcesosPage } from "@/pages/ProcesosPage";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <PanelPage /> },
      { path: "licitaciones", element: <LicitacionesPage /> },
      { path: "licitaciones/:codigoExterno", element: <LicitacionDetailPage /> },
      { path: "perfil", element: <PerfilEmpresaPage /> },
      { path: "procesos", element: <ProcesosPage /> },
    ],
  },
]);
