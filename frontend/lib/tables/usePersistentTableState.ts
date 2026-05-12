import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  ColumnFiltersState,
  ColumnOrderState,
  ColumnSizingState,
  Updater,
  VisibilityState,
  SortingState,
} from '@tanstack/react-table'

type PersistedTableState = {
  globalSearch: string
  sorting: SortingState
  columnFilters: ColumnFiltersState
  columnSizing: ColumnSizingState
  columnOrder: ColumnOrderState
  columnVisibility: VisibilityState
}

type UsePersistentTableStateOptions = {
  storageKey: string
  initialState?: Partial<PersistedTableState>
}

type StoredPayload = {
  version: 1
  state: PersistedTableState
}

const DEFAULT_TABLE_STATE: PersistedTableState = {
  globalSearch: '',
  sorting: [],
  columnFilters: [],
  columnSizing: {},
  columnOrder: [],
  columnVisibility: {},
}

function resolveUpdater<T>(updater: Updater<T>, previousValue: T): T {
  return typeof updater === 'function' ? (updater as (old: T) => T)(previousValue) : updater
}

function sanitizeState(
  state: Partial<PersistedTableState> | null | undefined,
  fallback: PersistedTableState,
): PersistedTableState {
  // LocalStorage puede quedar obsoleto despues de cambios de columnas. Sanitizar
  // evita romper tablas cuando un usuario vuelve con preferencias antiguas.
  if (!state) return fallback

  return {
    globalSearch: typeof state.globalSearch === 'string' ? state.globalSearch : fallback.globalSearch,
    sorting: Array.isArray(state.sorting) ? state.sorting : fallback.sorting,
    columnFilters: Array.isArray(state.columnFilters) ? state.columnFilters : fallback.columnFilters,
    columnSizing:
      state.columnSizing && typeof state.columnSizing === 'object' ? state.columnSizing : fallback.columnSizing,
    columnOrder: Array.isArray(state.columnOrder) ? state.columnOrder : fallback.columnOrder,
    columnVisibility:
      state.columnVisibility && typeof state.columnVisibility === 'object'
        ? state.columnVisibility
        : fallback.columnVisibility,
  }
}

export function usePersistentTableState({
  storageKey,
  initialState,
}: UsePersistentTableStateOptions) {
  const mergedInitialState = useMemo(
    () => sanitizeState(initialState, DEFAULT_TABLE_STATE),
    [initialState],
  )

  const [state, setState] = useState<PersistedTableState>(mergedInitialState)
  const [hasHydrated, setHasHydrated] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return

    try {
      const raw = window.localStorage.getItem(storageKey)
      if (!raw) {
        setState(mergedInitialState)
        setHasHydrated(true)
        return
      }

      const parsed = JSON.parse(raw) as StoredPayload
      // Versionado simple para poder invalidar preferencias cuando cambie la
      // forma de la tabla sin migraciones complejas en cliente.
      const persistedState = parsed?.version === 1 ? parsed.state : undefined
      setState(sanitizeState(persistedState, mergedInitialState))
    } catch {
      setState(mergedInitialState)
    } finally {
      setHasHydrated(true)
    }
  }, [storageKey, mergedInitialState])

  useEffect(() => {
    if (!hasHydrated || typeof window === 'undefined') return

    const payload: StoredPayload = {
      version: 1,
      state,
    }

    window.localStorage.setItem(storageKey, JSON.stringify(payload))
  }, [storageKey, state, hasHydrated])

  const setGlobalSearch = useCallback((updater: Updater<string>) => {
    setState((previousState) => ({
      ...previousState,
      globalSearch: resolveUpdater(updater, previousState.globalSearch),
    }))
  }, [])

  const setSorting = useCallback((updater: Updater<SortingState>) => {
    setState((previousState) => ({
      ...previousState,
      sorting: resolveUpdater(updater, previousState.sorting),
    }))
  }, [])

  const setColumnFilters = useCallback((updater: Updater<ColumnFiltersState>) => {
    setState((previousState) => ({
      ...previousState,
      columnFilters: resolveUpdater(updater, previousState.columnFilters),
    }))
  }, [])

  const setColumnSizing = useCallback((updater: Updater<ColumnSizingState>) => {
    setState((previousState) => ({
      ...previousState,
      columnSizing: resolveUpdater(updater, previousState.columnSizing),
    }))
  }, [])

  const setColumnOrder = useCallback((updater: Updater<ColumnOrderState>) => {
    setState((previousState) => ({
      ...previousState,
      columnOrder: resolveUpdater(updater, previousState.columnOrder),
    }))
  }, [])

  const setColumnVisibility = useCallback((updater: Updater<VisibilityState>) => {
    setState((previousState) => ({
      ...previousState,
      columnVisibility: resolveUpdater(updater, previousState.columnVisibility),
    }))
  }, [])

  const resetTableState = useCallback(() => {
    setState(mergedInitialState)
  }, [mergedInitialState])

  return {
    state,
    hasHydrated,
    setGlobalSearch,
    setSorting,
    setColumnFilters,
    setColumnSizing,
    setColumnOrder,
    setColumnVisibility,
    resetTableState,
  }
}

export type { PersistedTableState }
