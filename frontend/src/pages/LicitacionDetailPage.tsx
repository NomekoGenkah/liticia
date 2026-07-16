import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { obtenerLicitacion } from "@/api/licitaciones";
import { EstadoBadge } from "@/components/licitaciones/EstadoBadge";
import { AnalisisCard } from "@/components/licitacion-detail/AnalisisCard";
import { MatchingCard } from "@/components/licitacion-detail/MatchingCard";
import { DocumentosCard } from "@/components/licitacion-detail/DocumentosCard";
import { PreguntasCard } from "@/components/licitacion-detail/PreguntasCard";
import { ItemsTable } from "@/components/licitacion-detail/ItemsTable";
import { RawJsonViewer } from "@/components/licitacion-detail/RawJsonViewer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatFecha, formatMonto } from "@/lib/format";
import { ApiError } from "@/api/client";

export function LicitacionDetailPage() {
  const { codigoExterno } = useParams<{ codigoExterno: string }>();

  const { data: licitacion, isLoading, isError, error } = useQuery({
    queryKey: ["licitacion", codigoExterno],
    queryFn: () => obtenerLicitacion(codigoExterno!),
    enabled: Boolean(codigoExterno),
  });

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (isError || !licitacion) {
    const notFound = error instanceof ApiError && error.status === 404;
    return (
      <p className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
        {notFound ? "No existe esta licitación." : "No se pudo cargar la licitación."}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Button
          variant="ghost"
          size="sm"
          className="mb-2 -ml-2"
          nativeButton={false}
          render={<Link to="/licitaciones" />}
        >
          ← Volver al listado
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold">{licitacion.nombre}</h1>
          <EstadoBadge estado={licitacion.estado} />
        </div>
        <p className="text-sm text-muted-foreground">{licitacion.codigoExterno}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Datos generales</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
          <Dato label="Organismo" value={licitacion.nombreOrganismo} />
          <Dato label="Región / comuna" value={[licitacion.regionUnidad, licitacion.comunaUnidad].filter(Boolean).join(" / ") || null} />
          <Dato label="Tipo" value={licitacion.tipo} />
          <Dato label="Monto estimado" value={formatMonto(licitacion.montoEstimado, licitacion.moneda)} />
          <Dato label="Publicación" value={formatFecha(licitacion.fechaPublicacion)} />
          <Dato label="Cierre" value={formatFecha(licitacion.fechaCierre)} />
          {licitacion.descripcion && (
            <div className="sm:col-span-2">
              <p className="text-xs font-medium text-muted-foreground">Descripción</p>
              <p className="text-sm whitespace-pre-line">{licitacion.descripcion}</p>
            </div>
          )}
          <div className="sm:col-span-2">
            <a
              href={licitacion.urlFichaPublica}
              target="_blank"
              rel="noreferrer"
              className="text-sm font-medium text-primary underline underline-offset-4"
            >
              Ver ficha pública en mercadopublico.cl ↗
            </a>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ítems</CardTitle>
        </CardHeader>
        <CardContent>
          <ItemsTable items={licitacion.items} />
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <AnalisisCard codigoExterno={licitacion.codigoExterno} analisis={licitacion.analisis} />
        <MatchingCard codigoExterno={licitacion.codigoExterno} matching={licitacion.matching} analisis={licitacion.analisis} />
      </div>

      <DocumentosCard codigoExterno={licitacion.codigoExterno} documentos={licitacion.documentos} />

      {licitacion.documentos.some((doc) => doc.chunksCount > 0) && (
        <PreguntasCard codigoExterno={licitacion.codigoExterno} />
      )}

      <RawJsonViewer codigoExterno={licitacion.codigoExterno} />
    </div>
  );
}

function Dato({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="text-sm">{value ?? "—"}</p>
    </div>
  );
}
