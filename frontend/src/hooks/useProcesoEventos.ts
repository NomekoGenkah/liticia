import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { toast } from "sonner";
import { obtenerEstadoProceso } from "@/api/procesos";
import type { EstadoProceso, ProcesoEvento, ProcesoTipo } from "@/types/procesos";

export const keyEstadoProceso = (tipo: ProcesoTipo) => ["proceso-estado", tipo] as const;
export const keyStreamProceso = (tipo: ProcesoTipo) => ["proceso-stream", tipo] as const;

/** Lo que va escribiendo el modelo en el ítem en curso. */
export interface StreamProceso {
  texto: string;
  pensamiento: string;
}

const STREAM_VACIO: StreamProceso = { texto: "", pensamiento: "" };

const ETIQUETA: Record<ProcesoTipo, string> = {
  ANALISIS: "Análisis",
  MATCHING: "Matching",
  EMBEDDING: "Indexado de documentos",
};

function avisarFin(evento: Extract<ProcesoEvento, { evento: "run-finalizado" }>) {
  const nombre = ETIQUETA[evento.tipo];
  const detalle = `${evento.completadas} completadas${evento.fallidas > 0 ? `, ${evento.fallidas} fallidas` : ""}`;

  if (evento.estado === "COMPLETADO") toast.success(`${nombre} finalizado: ${detalle}`);
  else if (evento.estado === "CANCELADO") toast.info(`${nombre} cancelado: ${detalle}`);
  else toast.error(`${nombre} terminó con estado ${evento.estado}: ${evento.detalleError ?? detalle}`);
}

function aplicar(qc: QueryClient, evento: ProcesoEvento): void {
  const keyEstado = keyEstadoProceso(evento.tipo);
  const keyStream = keyStreamProceso(evento.tipo);

  const parchearRun = (cambios: Parameters<typeof Object.assign>[1]) =>
    qc.setQueryData<EstadoProceso>(keyEstado, (previo) =>
      previo?.run ? { ...previo, run: { ...previo.run, ...cambios } } : previo
    );

  switch (evento.evento) {
    case "snapshot":
      // El snapshot manda y se descarta lo local. Es lo que hace innecesario un replay de eventos
      // al reconectar: cada conexión nueva arranca con la verdad completa.
      qc.setQueryData(keyEstado, evento.estado);
      qc.setQueryData(keyStream, {
        texto: evento.estado.run?.actual?.texto ?? "",
        pensamiento: evento.estado.run?.actual?.pensamiento ?? "",
      });
      return;

    case "run-iniciado":
      qc.setQueryData<EstadoProceso>(keyEstado, { enProceso: true, run: evento.run });
      qc.setQueryData(keyStream, STREAM_VACIO);
      return;

    case "item-iniciado":
      qc.setQueryData(keyStream, STREAM_VACIO);
      parchearRun({ actual: evento.actual });
      return;

    case "token":
      // Los tokens NO tocan el estado: llegan ~10 veces por segundo y re-renderizarían el panel
      // entero (barra, contadores, cronómetro). Esta key tiene un único suscriptor, el visor.
      qc.setQueryData<StreamProceso>(keyStream, (previo = STREAM_VACIO) =>
        evento.canal === "respuesta"
          ? { ...previo, texto: previo.texto + evento.texto }
          : { ...previo, pensamiento: previo.pensamiento + evento.texto }
      );
      return;

    case "item-reintentado":
      // La salida del intento fallido no es válida: si no se descarta, queda pegada a la del
      // intento nuevo y se lee como un solo texto corrupto.
      qc.setQueryData(keyStream, STREAM_VACIO);
      return;

    case "item-finalizado":
      parchearRun({ completadas: evento.completadas, fallidas: evento.fallidas, omitidos: evento.omitidos });
      // Refresca el detalle apenas termina ESTA licitación, sin esperar a que cierre el batch de
      // 140. Con el polling de `{enProceso}` esto era invisible.
      qc.invalidateQueries({ queryKey: ["licitacion", evento.etiqueta] });
      return;

    case "run-finalizado":
      qc.setQueryData<EstadoProceso>(keyEstado, (previo) =>
        previo?.run
          ? {
              enProceso: false,
              run: {
                ...previo.run,
                estado: evento.estado,
                completadas: evento.completadas,
                fallidas: evento.fallidas,
                omitidos: evento.omitidos,
                detalleError: evento.detalleError,
                actual: null,
                fechaFin: new Date().toISOString(),
              },
            }
          : previo
      );
      qc.invalidateQueries({ queryKey: ["licitaciones"] });
      qc.invalidateQueries({ queryKey: ["proceso-runs"] });
      qc.invalidateQueries({ queryKey: ["estadisticas-panel"] });
      // El conteo del botón "todas" quedó viejo: lo que se acaba de procesar ya no está pendiente.
      qc.invalidateQueries({ queryKey: ["proceso-pendientes"] });
      avisarFin(evento);
      return;
  }
}

/**
 * Abre la única conexión de eventos de la app y vuelca lo que llega al caché de queries. Se monta
 * una sola vez (ver ProcesosEventos): así el EventSource vive en un solo lugar y cualquier
 * componente lee el estado con useQuery, como con cualquier otro dato.
 */
export function useProcesoEventosGlobales(): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    const source = new EventSource("/api/procesos/eventos");

    source.onmessage = (mensaje) => aplicar(queryClient, JSON.parse(mensaje.data) as ProcesoEvento);

    // Sin el close(), StrictMode deja dos conexiones abiertas en desarrollo y todo llega duplicado.
    return () => source.close();
  }, [queryClient]);
}

export function useProcesoEstado(tipo: ProcesoTipo) {
  return useQuery({
    queryKey: keyEstadoProceso(tipo),
    // Carga inicial, y respaldo si el navegador todavía no conectó el stream.
    queryFn: () => obtenerEstadoProceso(tipo),
    // El stream es la fuente de verdad a partir de acá: refetchear solo pisaría datos más frescos.
    staleTime: Infinity,
  });
}

export function useProcesoStream(tipo: ProcesoTipo) {
  const { data } = useQuery<StreamProceso>({
    queryKey: keyStreamProceso(tipo),
    // Nunca se pide por HTTP: lo llena el stream. La query existe solo para suscribirse al caché.
    queryFn: () => STREAM_VACIO,
    staleTime: Infinity,
  });

  return data ?? STREAM_VACIO;
}
