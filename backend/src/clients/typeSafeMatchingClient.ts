import {
  APIUserAbortError,
  choice,
  score,
  TypeSafeClient,
} from "@typesafe-ai/sdk";
import type {
  LicitacionParaMatching,
  MatchingLlmResultado,
  PerfilEmpresaParaMatching,
  RecomendacionMatchingLlm,
} from "./ollamaClient.types";
import type { MatchingClient } from "./matchingClient.interface";
import type { OpcionesItem } from "../types/procesos";
import { ProcesoCanceladoError, TypeSafeApiError } from "../utils/errors";
import { config } from "../config/env";
import { logger } from "../config/logger";

export const RUBRO_LEVELS = [
  "Sin relación: rubro completamente ajeno a la actividad o capacidades del postulante",
  "Alineación lejana: rubros adyacentes pero con bajo solapamiento directo de capacidades",
  "Buena afinidad: cubre una porción relevante del requerimiento y competencias declaradas",
  "Alineación directa y precisa: calce exacto con la especialidad principal y rubro del postulante",
] as const;

export const MONTO_LEVELS = [
  "Inconveniente: monto fuera de escala (muy por debajo o excede capacidad financiera)",
  "Fuera de rango declarado o no informado, requiriendo evaluación de conveniencia financiera",
  "Viable: monto razonable y cercano a los parámetros de interés",
  "Ideal: monto estimado dentro del rango de interés declarado",
] as const;

export const COMPATIBILIDAD_LEVELS = [
  "Incompatible: restricciones excluyentes de territorio o condiciones que el postulante no cumple",
  "Compatibilidad parcial: dificultades territoriales o condiciones logísticas desfavorables",
  "Compatible: no hay restricciones excluyentes y el tipo de postulante es admisible",
  "Plenamente compatible: región declarada de interés y cumple formalmente el perfil solicitado",
] as const;

export const RECOMENDACION_CHOICES = {
  no: "No conviene postular: rubro incompatible, requisitos excluyentes o inviable para el postulante",
  tal_vez: "Evaluar con cautela: afinidad parcial, requiere revisar bases o verificar capacidades",
  si: "Conviene postular: alto grado de compatibilidad y oportunidad clara para el postulante",
} as const;

export interface TypeSafeMatchingClientConfig {
  apiKey?: string;
  model?: string;
  baseURL?: string;
  timeoutMs?: number;
  client?: TypeSafeClient;
}

/**
 * Cliente de calificación y matching de licitaciones usando TypeSafe AI (System One, Jev).
 *
 * En vez de pedirle a un LLM generativo que redacte texto y parsear JSON, utiliza juicios tipados
 * y probabilidades calibradas:
 * - Primitiva Score para calificar dimensiones ordenadas (afinidad de rubro, viabilidad de monto, compatibilidad territorial).
 * - Primitiva Choice para seleccionar la recomendación final ("si" | "no" | "tal_vez").
 * - Patrón Composite Scoring con ponderaciones explícitas en código para producir el puntaje 0-100.
 */
export class TypeSafeMatchingClient implements MatchingClient {
  public readonly modelo: string;
  private readonly client: TypeSafeClient;

  constructor(cfg?: TypeSafeMatchingClientConfig) {
    this.modelo = cfg?.model ?? config.TYPESAFE_MODEL;
    if (cfg?.client) {
      this.client = cfg.client;
    } else {
      const apiKey = cfg?.apiKey ?? config.TYPESAFE_API_KEY;
      if (!apiKey) {
        throw new Error("Se requiere TYPESAFE_API_KEY para inicializar TypeSafeMatchingClient");
      }
      this.client = new TypeSafeClient({
        apiKey,
        baseURL: cfg?.baseURL ?? config.TYPESAFE_BASE_URL,
        defaultModel: this.modelo,
        timeout: cfg?.timeoutMs ?? config.TYPESAFE_TIMEOUT_MS,
      });
    }
  }

  async generarMatching(
    perfil: PerfilEmpresaParaMatching,
    licitacion: LicitacionParaMatching,
    opts?: OpcionesItem
  ): Promise<MatchingLlmResultado> {
    if (opts?.signal?.aborted) {
      throw new ProcesoCanceladoError("Proceso de matching cancelado antes de iniciar");
    }

    const state = {
      postulante: {
        tipo: perfil.tipo,
        nombre: perfil.nombre,
        descripcion: perfil.descripcion,
        rubro: perfil.rubro ?? "no informado",
        palabrasClave: perfil.palabrasClave,
        categoriasUnspsc: perfil.categoriasUnspsc,
        regionesInteres: perfil.regionesInteres,
        montoMinimo: perfil.montoMinimo,
        montoMaximo: perfil.montoMaximo,
      },
      licitacion: {
        nombre: licitacion.nombre,
        descripcion: licitacion.descripcion ?? "no informada",
        organismo: licitacion.nombreOrganismo ?? "no informado",
        tipo: licitacion.tipo ?? "no informado",
        montoEstimado: licitacion.montoEstimado,
        moneda: licitacion.moneda ?? "CLP",
        region: licitacion.regionUnidad ?? "no informada",
        fechaCierre: licitacion.fechaCierre ? licitacion.fechaCierre.toISOString().slice(0, 10) : "no informada",
        resumenEjecutivo: licitacion.analisis?.resumenEjecutivo ?? null,
        puntosClave: licitacion.analisis?.puntosClave ?? [],
        palabrasClave: licitacion.analisis?.palabrasClave ?? [],
        nivelComplejidad: licitacion.analisis?.nivelComplejidad ?? null,
        items: (licitacion.items ?? []).slice(0, 20).map((it) => ({
          producto: it.nombreProducto,
          unspsc: it.categoriaUnspsc ?? null,
          cantidad: it.cantidad ?? null,
          unidadMedida: it.unidadMedida ?? null,
        })),
      },
    };

    const questions = {
      afinidad_rubro: score(
        "¿Qué tan alineada está la actividad, rubro, capacidades y palabras clave del postulante con el objeto, descripción y productos/ítems de la licitación?",
        RUBRO_LEVELS
      ),
      viabilidad_monto: score(
        "¿Qué tan viable y conveniente es la escala y monto estimado de la licitación respecto al rango de monto declarado por el postulante?",
        MONTO_LEVELS
      ),
      compatibilidad_requisitos: score(
        "¿Existe compatibilidad geográfica (región) y formal según el tipo de postulante (empresa o persona natural)?",
        COMPATIBILIDAD_LEVELS
      ),
      recomendacion: choice(
        "Considerando la afinidad de rubro, capacidad económica y requisitos, ¿recomiendas a este postulante participar en esta licitación?",
        RECOMENDACION_CHOICES
      ),
    };

    try {
      const response = await this.client.systemOne(
        {
          state,
          questions,
          model: this.modelo,
        },
        {
          signal: opts?.signal,
        }
      );

      const answers = response.answers;

      const normRubro = Math.min(Math.max(answers.afinidad_rubro.score / 3, 0), 1);
      const normMonto = Math.min(Math.max(answers.viabilidad_monto.score / 3, 0), 1);
      const normCompat = Math.min(Math.max(answers.compatibilidad_requisitos.score / 3, 0), 1);

      // Composite scoring: 50% afinidad de rubro, 25% viabilidad monto, 25% compatibilidad requisitos/región
      const puntajePonderado = (0.5 * normRubro + 0.25 * normMonto + 0.25 * normCompat) * 100;
      const puntaje = Math.round(Math.min(Math.max(puntajePonderado, 0), 100));

      const recomendacion = answers.recomendacion.choice as RecomendacionMatchingLlm;

      const pctRubro = Math.round(normRubro * 100);
      const pctMonto = Math.round(normMonto * 100);
      const pctCompat = Math.round(normCompat * 100);
      const confRecom = Math.round(answers.recomendacion.confidence * 100);

      const recLabel = recomendacion === "si" ? "Sí" : recomendacion === "no" ? "No" : "Tal vez";
      const justificacion = `Evaluación TypeSafe (${this.modelo}): afinidad de rubro al ${pctRubro}%, viabilidad de monto al ${pctMonto}%, compatibilidad territorial/formal al ${pctCompat}%. Recomendación: ${recLabel} (confianza ${confRecom}%).`;

      if (opts?.onToken) {
        opts.onToken(justificacion, "respuesta");
      }

      return {
        puntaje,
        recomendacion,
        justificacion,
      };
    } catch (err) {
      if (
        err instanceof APIUserAbortError ||
        (opts?.signal?.aborted && err instanceof Error && err.name === "AbortError")
      ) {
        throw new ProcesoCanceladoError("Proceso de matching cancelado");
      }

      if (err instanceof ProcesoCanceladoError) {
        throw err;
      }

      logger.error({ err }, "Error en llamada a TypeSafe AI");
      throw new TypeSafeApiError(
        `Fallo en la evaluación con TypeSafe AI: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
}
