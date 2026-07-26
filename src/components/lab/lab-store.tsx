"use client";

import {
  cancelLabOrderAction,
  collectLabOrderSampleAction,
  createLabOrderAction,
  deleteFieldMasterAction,
  deleteReportCatalogAction,
  getLabOrderAction,
  getLabSnapshotAction,
  markLabOrderCompleteAction,
  markLabOrderItemCompleteAction,
  saveLabResultsAction,
  saveLabOrderMetadataAction,
  upsertFieldMasterAction,
  upsertReportCatalogAction,
} from "@/app/actions/lab-actions";
import type {
  LabFieldMaster,
  LabOrder,
  LabOrderInput,
  LabReportCatalog,
  LabResultInput,
} from "@/design-system/lab-data";
import { useSession } from "@/components/candela/session-provider";
import { isTransientSessionError, sleep } from "@/lib/session-retry";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type LabSnapshot = {
  fieldMasters: LabFieldMaster[];
  reportCatalogs: LabReportCatalog[];
  orders: LabOrder[];
};

type Store = LabSnapshot & {
  ready: boolean;
  error: string | null;
  refresh: (opts?: { silent?: boolean }) => Promise<void>;
  getFieldMaster: (id: string) => LabFieldMaster | undefined;
  getReportCatalog: (id: string) => LabReportCatalog | undefined;
  getOrder: (id: string) => LabOrder | undefined;
  saveFieldMaster: (input: Parameters<typeof upsertFieldMasterAction>[0]) => Promise<LabFieldMaster>;
  deleteFieldMaster: (id: string) => Promise<void>;
  saveReportCatalog: (input: Parameters<typeof upsertReportCatalogAction>[0]) => Promise<LabReportCatalog>;
  deleteReportCatalog: (id: string) => Promise<void>;
  createOrder: (input: LabOrderInput) => Promise<LabOrder>;
  collectSample: (orderId: string, itemIds?: string[]) => Promise<LabOrder>;
  saveResults: (orderId: string, results: LabResultInput[]) => Promise<LabOrder>;
  saveLabOrderMetadata: (orderId: string, input: Parameters<typeof saveLabOrderMetadataAction>[1]) => Promise<LabOrder>;
  markItemComplete: (itemId: string) => Promise<LabOrder>;
  markOrderComplete: (orderId: string) => Promise<LabOrder>;
  cancelOrder: (orderId: string, reason?: string) => Promise<LabOrder>;
  reloadOrder: (orderId: string) => Promise<LabOrder | null>;
};

const Ctx = createContext<Store | null>(null);

export function LabStoreProvider({ children }: { children: ReactNode }) {
  const { session, authReady } = useSession();
  const [state, setState] = useState<LabSnapshot>({ fieldMasters: [], reportCatalogs: [], orders: [] });
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setReady(false);
    try {
      const res = await getLabSnapshotAction();
      if (res.ok) {
        setState(res.data);
        setError(null);
      } else {
        setError(res.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load lab workspace");
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    if (!authReady || !session) return;

    let cancelled = false;
    const load = async (attempt = 0) => {
      try {
        const res = await Promise.race([
          getLabSnapshotAction(),
          new Promise<never>((_, reject) => {
            window.setTimeout(() => reject(new Error("Laboratory workspace request timed out. Please retry.")), 15000);
          }),
        ]);
        if (cancelled) return;
        if (res.ok) {
          setState(res.data);
          setError(null);
        } else {
          if (attempt < 2 && isTransientSessionError(res.error)) {
            await sleep(400 * (attempt + 1));
            return load(attempt + 1);
          }
          setError(res.error);
        }
        setReady(true);
      } catch (err) {
        if (cancelled) return;
        if (attempt < 2 && isTransientSessionError(err)) {
          await sleep(400 * (attempt + 1));
          return load(attempt + 1);
        }
        setError(err instanceof Error ? err.message : "Failed to load lab workspace");
        setReady(true);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [authReady, session]);

  const mutate = useCallback(
    async <T,>(fn: () => Promise<{ ok: boolean; data?: T; error?: string }>, message?: string): Promise<T> => {
      const res = await fn();
      if (!res.ok) throw new Error(res.error ?? message ?? "Action failed");
      void refresh({ silent: true });
      return res.data as T;
    },
    [refresh],
  );

  const value = useMemo<Store>(() => {
    return {
      ...state,
      ready,
      error,
      refresh,
      getFieldMaster: (id) => state.fieldMasters.find((f) => f.id === id),
      getReportCatalog: (id) => state.reportCatalogs.find((r) => r.id === id),
      getOrder: (id) => state.orders.find((o) => o.id === id),
      saveFieldMaster: (input) => mutate(() => upsertFieldMasterAction(input), "Failed to save field"),
      deleteFieldMaster: (id) => mutate(() => deleteFieldMasterAction(id), "Failed to delete field"),
      saveReportCatalog: (input) => mutate(() => upsertReportCatalogAction(input), "Failed to save report"),
      deleteReportCatalog: (id) => mutate(() => deleteReportCatalogAction(id), "Failed to delete report"),
      createOrder: (input) => mutate(() => createLabOrderAction(input), "Failed to create order"),
      collectSample: (orderId, itemIds) => mutate(() => collectLabOrderSampleAction(orderId, itemIds), "Failed to collect sample"),
      saveResults: (orderId, results) => mutate(() => saveLabResultsAction(orderId, results), "Failed to save results"),
      saveLabOrderMetadata: (orderId, input) => mutate(() => saveLabOrderMetadataAction(orderId, input), "Failed to save order metadata"),
      markItemComplete: (itemId) => mutate(() => markLabOrderItemCompleteAction(itemId), "Failed to complete item"),
      markOrderComplete: (orderId) => mutate(() => markLabOrderCompleteAction(orderId), "Failed to complete order"),
      cancelOrder: (orderId, reason) => mutate(() => cancelLabOrderAction(orderId, reason), "Failed to cancel order"),
      reloadOrder: async (orderId) => {
        const res = await getLabOrderAction(orderId);
        if (!res.ok) throw new Error(res.error ?? "Failed to reload order");
        return res.data;
      },
    };
  }, [state, ready, error, refresh, mutate]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLabStore() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useLabStore must be used within LabStoreProvider");
  return ctx;
}
