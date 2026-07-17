import { useEffect, useRef } from "react";
import { useProcesoStream } from "@/hooks/useProcesoEventos";
import type { ProcesoTipo } from "@/types/procesos";

/** Mantiene el scroll abajo mientras el texto crece, salvo que el usuario haya subido a leer. */
function useAutoScroll(dependencia: string) {
  const ref = useRef<HTMLPreElement>(null);

  useEffect(() => {
    const nodo = ref.current;
    if (!nodo) return;

    // Si el usuario scrolleó hacia arriba, no lo arrastramos de vuelta: está leyendo algo.
    const pegadoAlFondo = nodo.scrollHeight - nodo.scrollTop - nodo.clientHeight < 40;
    if (pegadoAlFondo) nodo.scrollTop = nodo.scrollHeight;
  }, [dependencia]);

  return ref;
}

function Panel({ texto, etiqueta, tenue }: { texto: string; etiqueta: string; tenue?: boolean }) {
  const ref = useAutoScroll(texto);

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{etiqueta}</span>
      <pre
        ref={ref}
        className={`max-h-48 overflow-y-auto whitespace-pre-wrap break-words rounded-md border bg-muted/40 p-3 text-xs leading-relaxed ${
          tenue ? "text-muted-foreground" : ""
        }`}
      >
        {texto}
        {/* El cursor deja claro que el texto sigue llegando y no es una respuesta ya terminada. */}
        <span className="ml-px inline-block h-3 w-1.5 animate-pulse bg-foreground align-middle" />
      </pre>
    </div>
  );
}

/**
 * Lo que el modelo está escribiendo ahora mismo.
 *
 * Lee su propia query del caché en vez de recibir el texto por props: los tokens llegan ~10 veces
 * por segundo, y así el único que se re-renderiza a ese ritmo es este componente.
 */
export function StreamViewer({ tipo }: { tipo: ProcesoTipo }) {
  const { texto, pensamiento } = useProcesoStream(tipo);

  if (!texto && !pensamiento) {
    return <p className="text-xs text-muted-foreground">Esperando la respuesta del modelo…</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Solo aparece con OLLAMA_THINK=true: el modelo razona antes de responder. */}
      {pensamiento && <Panel texto={pensamiento} etiqueta="Razonamiento del modelo" tenue />}
      {texto && <Panel texto={texto} etiqueta="Salida del modelo" />}
    </div>
  );
}
