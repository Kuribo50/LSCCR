import { describe, it, expect } from "vitest";
import { unwrapResults } from "../swr";

// ---------------------------------------------------------------------------
// unwrapResults() — the pure utility extracted from the SWR hooks module.
// The hooks themselves (useAPI, usePacientes, etc.) delegate to useSWR and are
// best tested via integration / component tests. This file covers the
// normaliser that unifies paginated vs plain array responses.
// ---------------------------------------------------------------------------

interface Item {
  id: number;
  nombre: string;
}

describe("unwrapResults", () => {
  it("returns empty array for undefined", () => {
    expect(unwrapResults<Item>(undefined)).toEqual([]);
  });

  it("returns the array as-is when data is already an array", () => {
    const items: Item[] = [
      { id: 1, nombre: "A" },
      { id: 2, nombre: "B" },
    ];
    expect(unwrapResults(items)).toBe(items);
  });

  it("extracts results from a paginated response", () => {
    const paginated = {
      count: 2,
      next: null,
      previous: null,
      results: [
        { id: 1, nombre: "A" },
        { id: 2, nombre: "B" },
      ],
    };
    expect(unwrapResults(paginated)).toEqual(paginated.results);
  });

  it("returns empty array for an empty paginated response", () => {
    const paginated = {
      count: 0,
      next: null,
      previous: null,
      results: [] as Item[],
    };
    expect(unwrapResults(paginated)).toEqual([]);
  });

  it("returns empty array for an empty plain array", () => {
    expect(unwrapResults<Item>([])).toEqual([]);
  });
});
