import { describe, it, expect } from "vitest";
import { ORDEN_SECCIONES, menuParaUsuario } from "../menu";
import { puedeAbrirRuta } from "../roles";
import type { Rol } from "../types";

const hrefs = (rol: Rol, encargado = false) => menuParaUsuario(rol, encargado).map((i) => i.href);

describe("menú lateral", () => {
  it("el profesional sigue el flujo: espera, llamados, agenda, ingresados, seguimiento", () => {
    expect(hrefs("KINE")).toEqual([
      "/inicio",
      "/lista-espera",
      "/llamados",
      "/calendario",
      "/mis-pacientes",
      "/grupos",
      "/inasistencias",
      "/riesgo-abandono",
      "/egresos",
      "/linea-tiempo",
      "/analisis/estadisticas",
    ]);
  });

  it("el encargado agrega la carga de derivaciones justo después de Inicio", () => {
    expect(hrefs("KINE", true).slice(0, 5)).toEqual([
      "/inicio",
      "/importar",
      "/importar/revision",
      "/historial-mensual",
      "/lista-espera",
    ]);
  });

  it("el administrador ve la carga primero y Usuarios al final", () => {
    const lista = hrefs("ADMIN");
    expect(lista.slice(0, 4)).toEqual(["/inicio", "/importar", "/importar/revision", "/historial-mensual"]);
    expect(lista.at(-1)).toBe("/usuarios");
  });

  it("el médico solo ve Inicio, Importar e Historial de cortes", () => {
    expect(hrefs("MEDICO")).toEqual(["/inicio", "/importar", "/historial-mensual"]);
  });

  it("las secciones aparecen agrupadas y en el orden del flujo", () => {
    for (const [rol, encargado] of [["KINE", false], ["KINE", true], ["ADMIN", false], ["MEDICO", false]] as const) {
      const secciones = menuParaUsuario(rol, encargado).map((i) => i.section);
      const indices = secciones.map((s) => ORDEN_SECCIONES.indexOf(s));
      expect(indices.every((i) => i >= 0)).toBe(true);
      expect(indices).toEqual([...indices].sort((a, b) => a - b));
    }
  });

  it("no repite entradas", () => {
    for (const [rol, encargado] of [["KINE", true], ["ADMIN", false], ["MEDICO", false]] as const) {
      const lista = hrefs(rol, encargado);
      expect(new Set(lista).size).toBe(lista.length);
    }
  });

  it("todo lo que muestra el menú también lo permite la regla de acceso del rol", () => {
    const casos = [
      { rol: "KINE" as Rol, es_encargado: false },
      { rol: "KINE" as Rol, es_encargado: true },
      { rol: "ADMIN" as Rol, es_encargado: false },
      { rol: "MEDICO" as Rol, es_encargado: false },
    ];
    for (const usuario of casos) {
      for (const href of hrefs(usuario.rol, usuario.es_encargado)) {
        expect(puedeAbrirRuta(usuario, href), `${usuario.rol}${usuario.es_encargado ? "+encargado" : ""} ${href}`).toBe(true);
      }
    }
  });
});
