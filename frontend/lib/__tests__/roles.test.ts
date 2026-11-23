import { describe, it, expect } from "vitest";
import { esEncargado, puedeAbrirRuta, puedeCargarDerivaciones, puedeCorregirDatos, puedeRevisarCarga } from "../roles";
import type { Rol } from "../types";

const kine = { rol: "KINE" as Rol, es_encargado: false };
const encargado = { rol: "KINE" as Rol, es_encargado: true };
const admin = { rol: "ADMIN" as Rol };
const medico = { rol: "MEDICO" as Rol };

describe("roles", () => {
  it("solo un KINE marcado es encargado", () => {
    expect(esEncargado(encargado)).toBe(true);
    expect(esEncargado(kine)).toBe(false);
    expect(esEncargado({ rol: "ADMIN", es_encargado: true })).toBe(false);
    expect(esEncargado(null)).toBe(false);
  });

  it("corregir datos y revisar carga: administrador y encargado", () => {
    for (const f of [puedeCorregirDatos, puedeRevisarCarga]) {
      expect([f(admin), f(encargado), f(kine), f(medico)]).toEqual([true, true, false, false]);
    }
  });

  it("cargar derivaciones: administrador, médico y encargado", () => {
    expect([puedeCargarDerivaciones(admin), puedeCargarDerivaciones(medico), puedeCargarDerivaciones(encargado), puedeCargarDerivaciones(kine)]).toEqual([true, true, true, false]);
  });

  it("el médico solo abre sus rutas", () => {
    expect(puedeAbrirRuta(medico, "/importar")).toBe(true);
    expect(puedeAbrirRuta(medico, "/lista-espera")).toBe(false);
    expect(puedeAbrirRuta(medico, "/importar/revision")).toBe(false);
  });

  it("el profesional común no abre la carga ni la revisión", () => {
    expect(puedeAbrirRuta(kine, "/importar")).toBe(false);
    expect(puedeAbrirRuta(kine, "/importar/revision")).toBe(false);
    expect(puedeAbrirRuta(kine, "/lista-espera")).toBe(true);
  });
});
