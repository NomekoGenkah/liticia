import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRightIcon } from "lucide-react";
import { obtenerEstadisticasPanel } from "@/api/estadisticas";
import { listarLicitaciones } from "@/api/licitaciones";
import { HorizonteCierres } from "@/components/panel/HorizonteCierres";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatMonto } from "@/lib/format";
import type { EstadisticasPanel, LicitacionListItem } from "@/types/api";

function diasHasta(iso: string | null): number | null {
  if (!iso) return null;

  const cierre = new Date(iso);
  const hoy = new Date();
  cierre.setHours(0, 0, 0, 0);
  hoy.setHours(0, 0, 0, 0);

  return Math.round((cierre.getTime() - hoy.getTime()) / 86_400_000);
}

function textoPlazo(dias: number | null): string {
  if (dias === null) return "sin fecha de cierre";
  if (dias < 0) return "cerrada";
  if (dias === 0) return "cierra hoy";
  if (dias === 1) return "cierra mañana";
  return `en ${dias} días`;
}

function Metrica({
  valor,
  etiqueta,
  detalle,
  acento,
}: {
  valor: number;
  etiqueta: string;
  detalle?: string;
  acento?: "urgente" | "atencion";
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span
        className={cn(
          "text-3xl font-semibold tabular-nums",
          acento === "urgente" && "text-rose-600 dark:text-rose-400",
          acento === "atencion" && "text-amber-600 dark:text-amber-400"
        )}
      >
        {valor}
      </span>
      <span className="text-sm font-medium">{etiqueta}</span>
      {detalle && <span className="text-xs text-muted-foreground">{detalle}</span>}
    </div>
  );
}

/** Agrupa por plazo: con 13 cerrando el mismo día, repetir "cierra mañana" en cada fila es ruido. */
function agruparPorPlazo(licitaciones: LicitacionListItem[]) {
  const grupos: { plazo: string; dias: number | null; licitaciones: LicitacionListItem[] }[] = [];

  for (const licitacion of licitaciones) {
    const dias = diasHasta(licitacion.fechaCierre);
    const plazo = textoPlazo(dias);
    const ultimo = grupos.at(-1);

    if (ultimo?.plazo === plazo) ultimo.licitaciones.push(licitacion);
    else grupos.push({ plazo, dias, licitaciones: [licitacion] });
  }

  return grupos;
}

function ProximosCierres({ licitaciones }: { licitaciones: LicitacionListItem[] }) {
  if (licitaciones.length === 0) {
    return <p className="text-sm text-muted-foreground">No hay licitaciones activas con cierre pendiente.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {agruparPorPlazo(licitaciones).map((grupo) => {
        const urgente = grupo.dias !== null && grupo.dias <= 2;

        return (
          <section key={grupo.plazo} className="flex flex-col gap-1.5">
            <h3
              className={cn(
                "text-xs font-semibold tracking-wide uppercase",
                urgente ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground"
              )}
            >
              {grupo.plazo}
            </h3>
            <ul className="flex flex-col gap-2">
              {grupo.licitaciones.map((licitacion) => (
                <li key={licitacion.id}>
                  <Link
                    to={`/licitaciones/${licitacion.codigoExterno}`}
                    className="group flex flex-col gap-0.5 border-l-2 pl-3 transition-colors hover:border-foreground"
                  >
                    <span className="truncate text-sm group-hover:underline">{licitacion.nombre}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {licitacion.nombreOrganismo ?? "Organismo no informado"}
                      {licitacion.montoEstimado && ` · ${formatMonto(licitacion.montoEstimado, licitacion.moneda)}`}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function EstadoIa({ stats }: { stats: EstadisticasPanel }) {
  const porcentaje = stats.activas === 0 ? 0 : Math.round((stats.analizadasActivas / stats.activas) * 100);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between text-sm">
          <span>Analizadas</span>
          <span className="tabular-nums text-muted-foreground">
            {stats.analizadasActivas} de {stats.activas}
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-foreground transition-all" style={{ width: `${porcentaje}%` }} />
        </div>
      </div>

      {stats.hayPerfil ? (
        <>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between text-sm">
              <span>Evaluadas contra tu perfil</span>
              <span className="tabular-nums text-muted-foreground">
                {stats.matcheadasActivas} de {stats.activas}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-foreground transition-all"
                style={{ width: `${stats.activas === 0 ? 0 : (stats.matcheadasActivas / stats.activas) * 100}%` }}
              />
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="w-fit"
            nativeButton={false}
            render={<Link to="/procesos" />}
          >
            Ir a Procesos
          </Button>
        </>
      ) : (
        // El estado real de una instalación nueva: sin perfil no hay recomendaciones, y ese es
        // justamente el paso que desbloquea el resto.
        <div className="flex flex-col items-start gap-2 rounded-md border border-dashed p-3">
          <p className="text-sm">
            Todavía no declaras qué hace tu empresa, así que LicitIA no puede recomendarte licitaciones.
          </p>
          <Button size="sm" nativeButton={false} render={<Link to="/perfil" />}>
            Crear perfil
            <ArrowRightIcon className="size-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}

export function PanelPage() {
  const { data: stats, isPending: cargandoStats } = useQuery({
    queryKey: ["estadisticas-panel"],
    queryFn: obtenerEstadisticasPanel,
  });

  const { data: proximos } = useQuery({
    queryKey: ["licitaciones", "proximos-cierres"],
    queryFn: () =>
      listarLicitaciones({ estado: "Publicada", orderBy: "fechaCierre:asc", pageSize: 6, page: 1 }),
  });

  const hoy = new Date().toLocaleDateString("es-CL", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  if (cargandoStats || !stats) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-44 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold">Panel</h1>
        <span className="text-sm text-muted-foreground first-letter:uppercase">{hoy}</span>
      </header>

      <section className="grid grid-cols-2 gap-6 rounded-lg border p-5 md:grid-cols-4">
        <Metrica
          valor={stats.cierran48Horas}
          etiqueta="Cierran en 48 horas"
          detalle="Última oportunidad de postular"
          acento={stats.cierran48Horas > 0 ? "urgente" : undefined}
        />
        <Metrica
          valor={stats.cierran7Dias}
          etiqueta="Cierran esta semana"
          detalle="Próximos 7 días"
          acento={stats.cierran7Dias > 0 ? "atencion" : undefined}
        />
        <Metrica
          valor={stats.activas}
          etiqueta="Activas"
          detalle={`${stats.totalLicitaciones} en total, incluyendo cerradas`}
        />
        <Metrica
          valor={stats.recomendadasSi}
          etiqueta="Recomendadas para ti"
          detalle={stats.hayPerfil ? "Según tu perfil" : "Necesitas un perfil"}
        />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Horizonte de cierres</CardTitle>
        </CardHeader>
        <CardContent>
          <HorizonteCierres cierresPorDia={stats.cierresPorDia} />
        </CardContent>
      </Card>

      {/* items-start: si no, la card corta hereda el alto de la larga y queda con un hueco. */}
      <div className="grid items-start gap-4 md:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Cierran primero</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <ProximosCierres licitaciones={proximos?.data ?? []} />
            <Button
              variant="ghost"
              size="sm"
              className="w-fit"
              nativeButton={false}
              render={<Link to="/licitaciones?orderBy=fechaCierre:asc" />}
            >
              Ver todas
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Trabajo de la IA</CardTitle>
          </CardHeader>
          <CardContent>
            <EstadoIa stats={stats} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
