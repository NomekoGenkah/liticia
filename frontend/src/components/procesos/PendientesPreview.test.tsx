import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PendientesPreview } from "./PendientesPreview";
import type { VistaPreviaProceso } from "@/types/procesos";

function pendientes(parcial: Partial<VistaPreviaProceso> = {}): VistaPreviaProceso {
  return {
    items: [
      { objetoId: "o1", etiqueta: "A-1", titulo: "Uno", subtitulo: null },
      { objetoId: "o2", etiqueta: "A-2", titulo: "Dos", subtitulo: null },
      { objetoId: "o3", etiqueta: "A-3", titulo: "Tres", subtitulo: null },
    ],
    omitidos: [],
    parametros: {},
    ...parcial,
  };
}

describe("PendientesPreview", () => {
  it("arranca con todo seleccionado", () => {
    render(<PendientesPreview pendientes={pendientes()} onEjecutar={vi.fn()} deshabilitado={false} />);
    expect(screen.getByText("3 de 3 seleccionadas")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Procesar 3" })).toBeEnabled();
  });

  it("destildar un ítem lo saca del conteo y del batch", async () => {
    const onEjecutar = vi.fn();
    render(<PendientesPreview pendientes={pendientes()} onEjecutar={onEjecutar} deshabilitado={false} />);

    await userEvent.click(screen.getByRole("checkbox", { name: "Incluir A-2" }));
    expect(screen.getByText("2 de 3 seleccionadas")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Procesar 2" }));
    // Manda los ids exactos que quedaron, en orden, sin el excluido.
    expect(onEjecutar).toHaveBeenCalledWith(["o1", "o3"]);
  });

  it("'Deseleccionar todas' vacía la selección y deshabilita el botón de procesar", async () => {
    render(<PendientesPreview pendientes={pendientes()} onEjecutar={vi.fn()} deshabilitado={false} />);

    await userEvent.click(screen.getByRole("button", { name: "Deseleccionar todas" }));
    expect(screen.getByText("0 de 3 seleccionadas")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /procesar/i })).toBeDisabled();
  });

  it("'Seleccionar todas' vuelve a incluir lo destildado", async () => {
    render(<PendientesPreview pendientes={pendientes()} onEjecutar={vi.fn()} deshabilitado={false} />);

    await userEvent.click(screen.getByRole("checkbox", { name: "Incluir A-1" }));
    expect(screen.getByText("2 de 3 seleccionadas")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Seleccionar todas" }));
    expect(screen.getByText("3 de 3 seleccionadas")).toBeInTheDocument();
  });

  it("respeta la prop deshabilitado aunque haya selección", () => {
    render(<PendientesPreview pendientes={pendientes()} onEjecutar={vi.fn()} deshabilitado={true} />);
    expect(screen.getByRole("button", { name: "Procesar 3" })).toBeDisabled();
  });

  it("lista los omitidos con su motivo", () => {
    const conOmitidos = pendientes({
      omitidos: [{ objetoId: "x1", etiqueta: "B-9", titulo: null, subtitulo: null, motivo: "sin análisis", codigo: "ANALISIS_REQUERIDO" }],
    });
    render(<PendientesPreview pendientes={conOmitidos} onEjecutar={vi.fn()} deshabilitado={false} />);
    expect(screen.getByText("1 quedan afuera")).toBeInTheDocument();
    expect(screen.getByText(/B-9 — sin análisis/)).toBeInTheDocument();
  });
});
