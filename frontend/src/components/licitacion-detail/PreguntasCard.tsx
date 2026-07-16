import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { crearPregunta, listarPreguntas } from "@/api/preguntas";
import { ApiError } from "@/api/client";
import { formatFechaHora } from "@/lib/format";
import type { LicitacionPregunta } from "@/types/api";

const MENSAJE_POR_CODE: Record<string, string> = {
  CHUNKS_REQUERIDOS: "Esta licitación todavía no tiene documentos indexados. Genera los embeddings en Procesos.",
  PREGUNTA_REQUERIDA: "Escribe una pregunta de hasta 2000 caracteres.",
  OLLAMA_API_ERROR: "No se pudo contactar al modelo. ¿Está corriendo Ollama?",
};

function Turno({ turno }: { turno: LicitacionPregunta }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-end">
        <p className="max-w-[85%] rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground">{turno.pregunta}</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <p className="max-w-[85%] whitespace-pre-line rounded-lg bg-muted px-3 py-2 text-sm">{turno.respuesta}</p>

        {turno.fuentes.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {turno.fuentes.map((fuente) => (
              <Badge
                key={`${fuente.documentoId}-${fuente.chunkIndex}`}
                variant="outline"
                className="font-normal"
                title={fuente.extracto}
              >
                {fuente.nombreArchivo} · fragmento {fuente.chunkIndex} · {Math.round(fuente.similitud * 100)}%
              </Badge>
            ))}
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          {formatFechaHora(turno.creadoEn)} · {turno.modelo} · {(turno.duracionMs / 1000).toFixed(1)}s
        </p>
      </div>
    </div>
  );
}

export function PreguntasCard({ codigoExterno }: { codigoExterno: string }) {
  const queryClient = useQueryClient();
  const [pregunta, setPregunta] = useState("");

  const { data: historial = [] } = useQuery({
    queryKey: ["licitacion-preguntas", codigoExterno],
    queryFn: () => listarPreguntas(codigoExterno),
  });

  const mutation = useMutation({
    mutationFn: (texto: string) => crearPregunta(codigoExterno, texto),
    onSuccess: () => {
      setPregunta("");
      queryClient.invalidateQueries({ queryKey: ["licitacion-preguntas", codigoExterno] });
    },
    onError: (err) => {
      if (err instanceof ApiError && MENSAJE_POR_CODE[err.code]) toast.error(MENSAJE_POR_CODE[err.code]);
      else toast.error(err instanceof Error ? err.message : "No se pudo responder la pregunta");
    },
  });

  function preguntar() {
    const texto = pregunta.trim();
    if (!texto || mutation.isPending) return;
    mutation.mutate(texto);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Preguntas sobre los documentos</CardTitle>
        <CardDescription>
          Las respuestas salen únicamente de los documentos cargados en esta licitación, con los fragmentos que las
          respaldan.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {historial.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Todavía no hay preguntas. Prueba con algo como "¿Cuál es el plazo de entrega?".
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {historial.map((turno) => (
              <Turno key={turno.id} turno={turno} />
            ))}
          </div>
        )}

        {mutation.isPending && (
          <p className="text-sm text-muted-foreground">
            Consultando los documentos… (con un modelo local puede tardar hasta un par de minutos)
          </p>
        )}

        <div className="flex flex-col gap-2">
          <Textarea
            value={pregunta}
            onChange={(e) => setPregunta(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) preguntar();
            }}
            placeholder="¿Qué garantías exigen las bases?"
            rows={3}
            maxLength={2000}
            disabled={mutation.isPending}
          />
          <div className="flex items-center gap-3">
            <Button className="w-fit" disabled={!pregunta.trim() || mutation.isPending} onClick={preguntar}>
              {mutation.isPending ? "Consultando…" : "Preguntar"}
            </Button>
            <span className="text-xs text-muted-foreground">Ctrl+Enter para enviar</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
