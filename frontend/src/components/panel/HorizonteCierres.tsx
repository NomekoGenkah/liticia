import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import type { CierrePorDia } from "@/types/api";

const DIAS_HORIZONTE = 14;
const ALTO_MAXIMO_PX = 88;
/** Un día con pocos cierres tiene que seguir siendo visible y clickeable. */
const ALTO_MINIMO_PX = 3;

const NOMBRE_DIA = ["do", "lu", "ma", "mi", "ju", "vi", "sá"];

/** "2026-07-17" a fecha local. `new Date(iso)` la interpretaría como UTC y correría el día. */
function parsearDiaLocal(iso: string): Date {
  const [año, mes, dia] = iso.split("-").map(Number);
  return new Date(año!, mes! - 1, dia!);
}

function aClaveIso(fecha: Date): string {
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}-${String(
    fecha.getDate()
  ).padStart(2, "0")}`;
}

interface Columna {
  iso: string;
  fecha: Date;
  total: number;
  diasRestantes: number;
}

function construirColumnas(cierresPorDia: CierrePorDia[]): Columna[] {
  const totalPorDia = new Map(cierresPorDia.map((cierre) => [cierre.dia, cierre.total]));
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  return Array.from({ length: DIAS_HORIZONTE }, (_, indice) => {
    const fecha = new Date(hoy);
    fecha.setDate(hoy.getDate() + indice);
    const iso = aClaveIso(fecha);

    return { iso, fecha, total: totalPorDia.get(iso) ?? 0, diasRestantes: indice };
  });
}

/** El color codifica cuánto queda, no la cantidad: lo urgente tiene que saltar primero. */
function colorDeBarra(diasRestantes: number): string {
  if (diasRestantes <= 2) return "bg-rose-500";
  if (diasRestantes <= 7) return "bg-amber-500";
  return "bg-muted-foreground/40";
}

export function HorizonteCierres({ cierresPorDia }: { cierresPorDia: CierrePorDia[] }) {
  const columnas = construirColumnas(cierresPorDia);
  const pico = Math.max(...columnas.map((columna) => columna.total), 1);
  const totalHorizonte = columnas.reduce((suma, columna) => suma + columna.total, 0);

  if (totalHorizonte === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Ninguna licitación activa cierra en los próximos {DIAS_HORIZONTE} días.
      </p>
    );
  }

  const diaPico = columnas.reduce((mayor, columna) => (columna.total > mayor.total ? columna : mayor));

  return (
    <div className="flex flex-col gap-3">
      {/* Escala lineal a propósito: si el pico aplasta al resto, es porque el pico es el dato. */}
      <div className="flex items-end gap-1" style={{ height: ALTO_MAXIMO_PX }}>
        {columnas.map((columna) => {
          const esFinDeSemana = columna.fecha.getDay() === 0 || columna.fecha.getDay() === 6;
          const alto = columna.total === 0 ? 0 : Math.max((columna.total / pico) * ALTO_MAXIMO_PX, ALTO_MINIMO_PX);

          return (
            <div key={columna.iso} className="flex flex-1 flex-col justify-end" style={{ height: ALTO_MAXIMO_PX }}>
              {columna.total > 0 ? (
                <Link
                  to={`/licitaciones?estado=Publicada&orderBy=fechaCierre:asc`}
                  title={`${columna.total} ${columna.total === 1 ? "cierra" : "cierran"} el ${columna.fecha.toLocaleDateString("es-CL", { day: "numeric", month: "long" })}`}
                  className={cn(
                    // `block` no es opcional: un <a> es inline y le ignoraría el alto.
                    "block rounded-sm transition-opacity hover:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                    colorDeBarra(columna.diasRestantes)
                  )}
                  style={{ height: alto }}
                />
              ) : (
                // El hueco también informa: los fines de semana no cierran licitaciones.
                <div
                  className={cn("h-px rounded-sm", esFinDeSemana ? "bg-transparent" : "bg-border")}
                  aria-hidden
                />
              )}
            </div>
          );
        })}
      </div>

      <div className="flex gap-1 border-t pt-1.5">
        {columnas.map((columna) => {
          const esFinDeSemana = columna.fecha.getDay() === 0 || columna.fecha.getDay() === 6;

          return (
            <div key={columna.iso} className="flex-1 text-center">
              <div
                className={cn(
                  "text-[10px] leading-tight tabular-nums",
                  columna.diasRestantes === 0 ? "font-semibold text-foreground" : "text-muted-foreground",
                  esFinDeSemana && "opacity-40"
                )}
              >
                {columna.fecha.getDate()}
              </div>
              <div className={cn("text-[9px] leading-tight text-muted-foreground", esFinDeSemana && "opacity-40")}>
                {NOMBRE_DIA[columna.fecha.getDay()]}
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        {totalHorizonte} cierran en los próximos {DIAS_HORIZONTE} días.
        {diaPico.total >= 3 && (
          <>
            {" "}
            El{" "}
            <span className="font-medium text-foreground">
              {diaPico.fecha.toLocaleDateString("es-CL", { day: "numeric", month: "long" })}
            </span>{" "}
            se juntan {diaPico.total}.
          </>
        )}
      </p>
    </div>
  );
}
