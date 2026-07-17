import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

// Sin globals de Vitest, el auto-cleanup no se engancha solo: sin esto, cada test hereda el DOM
// del anterior y los queries devuelven nodos de otro caso.
afterEach(() => cleanup());
