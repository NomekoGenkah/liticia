import { execFile } from "node:child_process";
import os from "node:os";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

export interface HardwareDetectado {
  /** VRAM total en MB, o null si no se pudo detectar (backend en contenedor sin acceso a la GPU). */
  vramMb: number | null;
  vramNombre: string | null;
  ramTotalMb: number;
  ramLibreMb: number;
  gpuDetectada: boolean;
}

const BYTES_POR_MB = 1024 * 1024;

/**
 * Detección best-effort del hardware para prellenar el presupuesto de VRAM/RAM del selector de
 * modelos. NUNCA es la fuente de verdad: el usuario siempre puede editar el presupuesto a mano,
 * porque el backend corre en un contenedor que quizá no ve la GPU (sin nvidia-container-toolkit) y
 * cuya RAM reportada por `os` puede reflejar el host/cgroup, no lo realmente disponible.
 */
export async function detectarHardware(): Promise<HardwareDetectado> {
  const ramTotalMb = Math.round(os.totalmem() / BYTES_POR_MB);
  const ramLibreMb = Math.round(os.freemem() / BYTES_POR_MB);

  let vramMb: number | null = null;
  let vramNombre: string | null = null;
  try {
    const { stdout } = await execFileP(
      "nvidia-smi",
      ["--query-gpu=memory.total,name", "--format=csv,noheader,nounits"],
      { timeout: 3000 }
    );
    const primeraLinea = stdout.trim().split("\n")[0];
    if (primeraLinea) {
      const [mem, ...nombre] = primeraLinea.split(",");
      const parsed = Number.parseInt((mem ?? "").trim(), 10);
      if (Number.isFinite(parsed)) {
        vramMb = parsed;
        vramNombre = nombre.join(",").trim() || null;
      }
    }
  } catch {
    // nvidia-smi ausente o sin GPU visible desde el contenedor: queda en null y se usa el manual.
  }

  return { vramMb, vramNombre, ramTotalMb, ramLibreMb, gpuDetectada: vramMb !== null };
}
