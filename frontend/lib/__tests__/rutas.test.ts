import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";
import { ITEM } from "../menu";

// Prueba de humo: cada entrada del menú debe tener su página en app/(dashboard).
describe("rutas del menú", () => {
  for (const item of Object.values(ITEM)) {
    it(`${item.href} tiene página`, () => {
      const pagina = path.resolve(__dirname, "../../app/(dashboard)", `.${item.href}`, "page.tsx");
      expect(existsSync(pagina)).toBe(true);
    });
  }
});
