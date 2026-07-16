import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { IngestaPanel } from "@/components/procesos/IngestaPanel";
import { IngestaRunsTable } from "@/components/procesos/IngestaRunsTable";
import { AnalisisPanel } from "@/components/procesos/AnalisisPanel";
import { MatchingPanel } from "@/components/procesos/MatchingPanel";

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

      <div className="grid gap-4 md:grid-cols-2">
        <AnalisisPanel />
        <MatchingPanel />
      </div>
    </div>
  );
}
