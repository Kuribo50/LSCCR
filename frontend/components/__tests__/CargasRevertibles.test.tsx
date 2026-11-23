import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import CargasRevertibles from "../CargasRevertibles";
import { avisarCargaImportada } from "@/lib/cargasEventos";
import type { CargaRevertible } from "@/lib/types";

const mutate = vi.fn();
let usuario: { rol: string; es_encargado?: boolean } | null = { rol: "MEDICO" };
let items: CargaRevertible[] = [];

vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: usuario }) }));
vi.mock("@/lib/swr", () => ({
  useAPI: (path: string | null) => ({ data: path ? { ahora: "", items } : undefined, mutate }),
}));
vi.mock("@/components/RevertirCarga", () => ({
  default: ({ corteId }: { corteId: number }) => <button>Revertir {corteId}</button>,
}));

function carga(lote: string, corteId: number, minutosRestantes: number): CargaRevertible {
  return {
    lote,
    corte_id: corteId,
    archivo_nombre: `${lote}.xlsx`,
    periodos: ["Julio 2025"],
    pacientes_creados: 2,
    usuario_nombre: "Médico CCR",
    fecha_subida: new Date().toISOString(),
    revertible_hasta: new Date(Date.now() + minutosRestantes * 60_000).toISOString(),
  };
}

describe("CargasRevertibles", () => {
  beforeEach(() => {
    mutate.mockClear();
    usuario = { rol: "MEDICO" };
    items = [];
  });

  it("no muestra nada si no hay cargas revertibles", () => {
    render(<CargasRevertibles />);
    expect(screen.queryByLabelText("Cargas que se pueden revertir")).not.toBeInTheDocument();
  });

  it("lista cada carga con su botón de revertir", () => {
    items = [carga("a", 1, 5), carga("b", 2, 3)];
    render(<CargasRevertibles />);
    expect(screen.getByText("Puedes revertir 2 cargas")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Revertir 1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Revertir 2" })).toBeInTheDocument();
  });

  it("usa singular con una sola carga", () => {
    items = [carga("a", 1, 5)];
    render(<CargasRevertibles />);
    expect(screen.getByText("Puedes revertir una carga")).toBeInTheDocument();
  });

  it("oculta las cargas cuyo plazo ya venció", () => {
    items = [carga("vencida", 1, -1), carga("vigente", 2, 4)];
    render(<CargasRevertibles />);
    expect(screen.queryByRole("button", { name: "Revertir 1" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Revertir 2" })).toBeInTheDocument();
  });

  it("no aparece para un profesional común", () => {
    usuario = { rol: "KINE", es_encargado: false };
    items = [carga("a", 1, 5)];
    render(<CargasRevertibles />);
    expect(screen.queryByLabelText("Cargas que se pueden revertir")).not.toBeInTheDocument();
  });

  it("se actualiza cuando se importa una carga en otra pantalla", () => {
    render(<CargasRevertibles />);
    act(() => avisarCargaImportada());
    expect(mutate).toHaveBeenCalled();
  });
});
