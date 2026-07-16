import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardAction } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { subirDocumento, eliminarDocumento } from "@/api/documentos";
import { ApiError } from "@/api/client";
import { DocumentoEstadoBadge } from "./DocumentoEstadoBadge";
import { formatBytes, formatFechaHora } from "@/lib/format";
import type { LicitacionDocumento } from "@/types/api";

const MENSAJE_POR_CODE: Record<string, string> = {
  TIPO_ARCHIVO_NO_SOPORTADO: "Tipo de archivo no soportado. Solo se aceptan PDF, DOCX y XLSX.",
  ARCHIVO_DEMASIADO_GRANDE: "El archivo supera el límite de 20MB.",
  ARCHIVO_REQUERIDO: "Debes seleccionar un archivo.",
};

export function DocumentosCard({
  codigoExterno,
  documentos,
}: {
  codigoExterno: string;
  documentos: LicitacionDocumento[];
}) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [arrastrando, setArrastrando] = useState(false);

  const subirMutation = useMutation({
    mutationFn: (archivo: File) => subirDocumento(codigoExterno, archivo),
    onSuccess: () => {
      toast.success("Documento subido correctamente");
      queryClient.invalidateQueries({ queryKey: ["licitacion", codigoExterno] });
    },
    onError: (err) => {
      if (err instanceof ApiError && MENSAJE_POR_CODE[err.code]) {
        toast.error(MENSAJE_POR_CODE[err.code]);
      } else {
        toast.error(err instanceof Error ? err.message : "No se pudo subir el documento");
      }
    },
  });

  const eliminarMutation = useMutation({
    mutationFn: (id: string) => eliminarDocumento(codigoExterno, id),
    onSuccess: () => {
      toast.success("Documento eliminado");
      queryClient.invalidateQueries({ queryKey: ["licitacion", codigoExterno] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "No se pudo eliminar el documento");
    },
  });

  function handleFile(file: File | undefined) {
    if (!file) return;
    subirMutation.mutate(file);
  }

  function handleEliminar(documento: LicitacionDocumento) {
    if (!window.confirm(`¿Eliminar "${documento.nombreArchivo}"? Esta acción no se puede deshacer.`)) return;
    eliminarMutation.mutate(documento.id);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Documentos</CardTitle>
        <CardAction>
          <Button size="sm" disabled={subirMutation.isPending} onClick={() => inputRef.current?.click()}>
            {subirMutation.isPending ? "Subiendo…" : "Subir documento"}
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.docx,.xlsx"
            className="hidden"
            onChange={(e) => {
              handleFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setArrastrando(true);
          }}
          onDragLeave={() => setArrastrando(false)}
          onDrop={(e) => {
            e.preventDefault();
            setArrastrando(false);
            handleFile(e.dataTransfer.files?.[0]);
          }}
          className={`flex items-center justify-center rounded-md border border-dashed p-4 text-sm text-muted-foreground transition-colors ${
            arrastrando ? "border-primary bg-primary/5" : "border-border"
          }`}
        >
          Arrastra un archivo aquí (PDF, DOCX o XLSX, máx. 20MB) o usa el botón "Subir documento"
        </div>

        {documentos.length === 0 ? (
          <p className="text-sm text-muted-foreground">Esta licitación todavía no tiene documentos.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Tamaño</TableHead>
                <TableHead>Subido</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {documentos.map((doc) => (
                <TableRow key={doc.id}>
                  <TableCell>
                    <div className="font-medium">{doc.nombreArchivo}</div>
                    {doc.estadoExtraccion === "FALLIDO" && doc.detalleError && (
                      <p className="text-xs text-destructive">{doc.detalleError}</p>
                    )}
                    {doc.estadoExtraccion === "COMPLETADO" && !doc.textoExtraido?.trim() && (
                      <p className="text-xs text-muted-foreground">Sin texto extraído (puede ser un documento escaneado).</p>
                    )}
                  </TableCell>
                  <TableCell>{formatBytes(doc.tamañoBytes)}</TableCell>
                  <TableCell>{formatFechaHora(doc.fechaCarga)}</TableCell>
                  <TableCell>
                    <DocumentoEstadoBadge estado={doc.estadoExtraccion} />
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={eliminarMutation.isPending}
                      onClick={() => handleEliminar(doc)}
                    >
                      Eliminar
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
