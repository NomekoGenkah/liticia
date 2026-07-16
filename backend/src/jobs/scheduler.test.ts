import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const scheduleMock = vi.fn();
const validateMock = vi.fn().mockReturnValue(true);
const stopMock = vi.fn();

vi.mock("node-cron", () => ({
  default: {
    validate: (...args: unknown[]) => validateMock(...args),
    schedule: (...args: unknown[]) => {
      scheduleMock(...args);
      return { stop: stopMock };
    },
  },
}));

const ejecutarIngestaMock = vi.fn().mockResolvedValue({});
vi.mock("../services/ingestaRunner", () => ({
  ejecutarIngesta: (...args: unknown[]) => ejecutarIngestaMock(...args),
}));

vi.mock("../config/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const mockConfig = vi.hoisted(() => ({
  SCHEDULE_MODE: "cron" as "cron" | "interval",
  SCHEDULE_VALUE: "0 2 * * *",
}));
vi.mock("../config/env", () => ({ config: mockConfig }));

import { iniciarScheduler } from "./scheduler";

describe("scheduler", () => {
  beforeEach(() => {
    scheduleMock.mockClear();
    validateMock.mockClear().mockReturnValue(true);
    stopMock.mockClear();
    ejecutarIngestaMock.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("modo cron: valida y programa con node-cron usando SCHEDULE_VALUE", () => {
    mockConfig.SCHEDULE_MODE = "cron";
    mockConfig.SCHEDULE_VALUE = "*/5 * * * *";

    const handle = iniciarScheduler();

    expect(validateMock).toHaveBeenCalledWith("*/5 * * * *");
    expect(scheduleMock).toHaveBeenCalledWith("*/5 * * * *", expect.any(Function));

    handle.detener();
    expect(stopMock).toHaveBeenCalled();
  });

  it("modo cron: falla rápido si SCHEDULE_VALUE es inválido", () => {
    mockConfig.SCHEDULE_MODE = "cron";
    mockConfig.SCHEDULE_VALUE = "not-a-cron-expr";
    validateMock.mockReturnValue(false);

    expect(() => iniciarScheduler()).toThrow();
    expect(scheduleMock).not.toHaveBeenCalled();
  });

  it("modo interval: arma un setInterval con SCHEDULE_VALUE en ms y detener() lo limpia", () => {
    vi.useFakeTimers();
    mockConfig.SCHEDULE_MODE = "interval";
    mockConfig.SCHEDULE_VALUE = "1000";

    const handle = iniciarScheduler();

    vi.advanceTimersByTime(1000);
    expect(ejecutarIngestaMock).toHaveBeenCalledTimes(1);

    handle.detener();
    vi.advanceTimersByTime(5000);
    expect(ejecutarIngestaMock).toHaveBeenCalledTimes(1);
  });

  it("modo interval: falla rápido si SCHEDULE_VALUE no es un entero positivo", () => {
    mockConfig.SCHEDULE_MODE = "interval";
    mockConfig.SCHEDULE_VALUE = "not-a-number";

    expect(() => iniciarScheduler()).toThrow();
  });
});
