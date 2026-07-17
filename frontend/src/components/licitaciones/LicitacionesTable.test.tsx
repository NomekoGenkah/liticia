import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LicitacionesTable } from "./LicitacionesTable";
import type { LicitacionListItem } from "@/types/api";

// LicitacionesTable solo usa useNavigate de react-router-dom; se mockea para observar la navegación
// sin montar un Router de verdad.
const { navigateMock } = vi.hoisted(() => ({ navigateMock: vi.fn() }));
vi.mock("react-router-dom", () => ({ useNavigate: () => navigateMock }));

function licitacion(parcial: Partial<LicitacionListItem> = {}): LicitacionListItem {
  return {
    id: parcial.id ?? "id-1",
    codigoExterno: parcial.codigoExterno ?? "1234-5-L1",
    nombre: parcial.nombre ?? "Servicio de desarrollo",
    codigoEstado: 5,
    estado: "Publicada",
    descripcion: null,
    nombreOrganismo: "Municipalidad",
    codigoOrganismo: "6945",
    rutOrganismo: null,
    regionUnidad: null,
    comunaUnidad: null,
    fechaPublicacion: null,
    fechaCierre: null,
    fechaAdjudicacion: null,
    montoEstimado: null,
    visibilidadMonto: null,
    moneda: null,
    tipo: null,
    codigoTipo: null,
    urlActaAdjudicacion: null,
    urlFichaPublica: "https://example.cl",
    analisis: null,
    matching: null,
    ...parcial,
  };
}

const TRES = [
  licitacion({ id: "id-1", codigoExterno: "A-1" }),
  licitacion({ id: "id-2", codigoExterno: "A-2" }),
  licitacion({ id: "id-3", codigoExterno: "A-3" }),
];

const headerCheckbox = () => screen.getByRole("checkbox", { name: /seleccionar todas/i });

describe("LicitacionesTable — checkbox de cabecera tri-estado", () => {
  it("queda vacío cuando no hay nada seleccionado", () => {
    render(<LicitacionesTable licitaciones={TRES} seleccion={new Set()} onToggle={vi.fn()} onToggleTodas={vi.fn()} />);
    expect(headerCheckbox()).toHaveAttribute("aria-checked", "false");
  });

  it("queda indeterminado (mixed) cuando hay algunas pero no todas", () => {
    render(
      <LicitacionesTable licitaciones={TRES} seleccion={new Set(["id-1"])} onToggle={vi.fn()} onToggleTodas={vi.fn()} />
    );
    // Ni lleno (mentiría "todas") ni vacío: mixed es la única lectura honesta.
    expect(headerCheckbox()).toHaveAttribute("aria-checked", "mixed");
  });

  it("queda lleno cuando están todas las de la página", () => {
    render(
      <LicitacionesTable
        licitaciones={TRES}
        seleccion={new Set(["id-1", "id-2", "id-3"])}
        onToggle={vi.fn()}
        onToggleTodas={vi.fn()}
      />
    );
    expect(headerCheckbox()).toHaveAttribute("aria-checked", "true");
  });

  it("tilda todas las de la página al hacer click estando vacío", async () => {
    const onToggleTodas = vi.fn();
    render(
      <LicitacionesTable licitaciones={TRES} seleccion={new Set()} onToggle={vi.fn()} onToggleTodas={onToggleTodas} />
    );
    await userEvent.click(headerCheckbox());
    expect(onToggleTodas).toHaveBeenCalledWith(["id-1", "id-2", "id-3"], true);
  });
});

describe("LicitacionesTable — click de fila vs. checkbox", () => {
  beforeEach(() => navigateMock.mockClear());

  it("navega al detalle al hacer click en la fila", async () => {
    render(
      <LicitacionesTable
        licitaciones={[licitacion({ codigoExterno: "A-1" })]}
        seleccion={new Set()}
        onToggle={vi.fn()}
        onToggleTodas={vi.fn()}
      />
    );
    await userEvent.click(screen.getByText("Servicio de desarrollo"));
    expect(navigateMock).toHaveBeenCalledWith("/licitaciones/A-1");
  });

  it("tildar NO navega: el stopPropagation de la celda corta el click de la fila", async () => {
    const onToggle = vi.fn();
    render(
      <LicitacionesTable
        licitaciones={[licitacion({ id: "id-1", codigoExterno: "A-1" })]}
        seleccion={new Set()}
        onToggle={onToggle}
        onToggleTodas={vi.fn()}
      />
    );
    await userEvent.click(screen.getByRole("checkbox", { name: "Seleccionar A-1" }));
    expect(onToggle).toHaveBeenCalledWith("id-1");
    expect(navigateMock).not.toHaveBeenCalled();
  });
});

// Guard contra el bug de la Fase 8 (dos controles idénticos en pantalla): cada checkbox — la
// cabecera y una por fila — tiene un nombre accesible distinto.
it("cada checkbox tiene un label único", () => {
  render(<LicitacionesTable licitaciones={TRES} seleccion={new Set()} onToggle={vi.fn()} onToggleTodas={vi.fn()} />);
  const nombres = screen.getAllByRole("checkbox").map((c) => c.getAttribute("aria-label"));
  expect(nombres).toHaveLength(4); // 1 cabecera + 3 filas
  expect(new Set(nombres).size).toBe(nombres.length);
});
