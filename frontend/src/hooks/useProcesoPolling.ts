import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import type { ProcesoEstado } from "@/types/api";

const POLL_INTERVAL_MS = 2000;

/**
 * Consulta un endpoint GET /.../estado repitiendo cada POLL_INTERVAL_MS mientras enProceso sea true.
 * Llama onFinalizado() la vez que enProceso pasa de true a false (batch recién terminado).
 */
export function useProcesoPolling(queryKey: unknown[], fetchEstado: () => Promise<ProcesoEstado>, onFinalizado?: () => void) {
  const query = useQuery({
    queryKey,
    queryFn: fetchEstado,
    refetchInterval: (q) => (q.state.data?.enProceso ? POLL_INTERVAL_MS : false),
  });

  const eraEnProceso = useRef(false);

  useEffect(() => {
    const enProceso = query.data?.enProceso ?? false;
    if (eraEnProceso.current && !enProceso) onFinalizado?.();
    eraEnProceso.current = enProceso;
  }, [query.data?.enProceso, onFinalizado]);

  return { enProceso: query.data?.enProceso ?? false, isLoading: query.isLoading };
}
