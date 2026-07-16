import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { App } from "./App.tsx";
import { aplicarFuente, CLAVE_FUENTE, FUENTE_POR_DEFECTO } from "@/lib/fuentes";

// Antes del primer render: si esperara a un efecto, la página parpadearía con la fuente anterior.
aplicarFuente(localStorage.getItem(CLAVE_FUENTE) ?? FUENTE_POR_DEFECTO);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
