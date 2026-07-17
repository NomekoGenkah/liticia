import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { IngestaPanel } from "@/components/procesos/IngestaPanel";
import { IngestaRunsTable } from "@/components/procesos/IngestaRunsTable";
import { ProcesoPanel } from "@/components/procesos/ProcesoPanel";
import { ProcesoRunsTable } from "@/components/procesos/ProcesoRunsTable";

export function ProcesosPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Procesos</h1>

      <IngestaPanel />

      <Card>
        <CardHeader>
          <CardTitle>Historial de ingestas</CardTitle>
        </CardHeader>
        <CardContent>
          <IngestaRunsTable />
        </CardContent>
      </Card>

      {/* En una columna y no en grid: el panel en vivo muestra el texto del modelo saliendo, y a
          media pantalla el JSON queda ilegible. */}
      <ProcesoPanel tipo="ANALISIS" />
      <ProcesoPanel tipo="MATCHING" />
      <ProcesoPanel tipo="EMBEDDING" />

      <Card>
        <CardHeader>
          <CardTitle>Historial de procesos IA</CardTitle>
          <CardDescription>Cada corrida de análisis, matching o embeddings. Abrí una para ver qué pasó con cada licitación.</CardDescription>
        </CardHeader>
        <CardContent>
          <ProcesoRunsTable />
        </CardContent>
      </Card>
    </div>
  );
}
