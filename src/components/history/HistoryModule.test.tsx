import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "u1" } }),
}));

const mockEntries = [
  {
    id: "e1",
    station_id: "s1",
    entry_date: "2026-01-01",
    super1_index_depart: 0,
    super1_index_arrivee: 100,
    super1_jauge: 0,
    super2_index_depart: 0,
    super2_index_arrivee: 0,
    super2_jauge: 0,
    gasoil1_index_depart: 0,
    gasoil1_index_arrivee: 50,
    gasoil1_jauge: 0,
    gasoil2_index_depart: 0,
    gasoil2_index_arrivee: 0,
    gasoil2_jauge: 0,
    versement_momo: 0,
    versement_momo_ref: null,
    versement_banque: 0,
    versement_banque_ref: null,
    versement_liquidite: 0,
    versement_liquidite_note: null,
    bons_carburant_nombre: 0,
    bons_carburant_valeur: 0,
    bons_entreprise_nombre: 0,
    bons_entreprise_valeur: 0,
    total_super_liters: 0,
    total_gasoil_liters: 0,
    total_versements: 0,
    total_bons: 0,
    created_at: "",
    stations: { id: "s1", name: "Station Test", location: "" },
  },
];

vi.mock("@/hooks/useIndexEntries", () => ({
  useIndexEntries: () => ({ data: mockEntries, isLoading: false }),
  useStations: () => ({ data: [{ id: "s1", name: "Station Test" }] }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
    }),
  },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { HistoryModule } from "./HistoryModule";

const renderWithDeferredRefetch = () => {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  // Register a controllable query so refetchQueries awaits our deferred promise.
  let resolveRefetch!: () => void;
  const refetchPromise = new Promise<unknown>((res) => {
    resolveRefetch = () => res([]);
  });

  qc.setQueryDefaults(["indexEntries"], {
    queryFn: () => refetchPromise,
  });
  qc.setQueryData(["indexEntries"], []);

  const utils = render(
    <QueryClientProvider client={qc}>
      <HistoryModule />
    </QueryClientProvider>
  );

  return { ...utils, resolveRefetch };
};

describe("HistoryModule — skeletons during post-deletion refetch", () => {
  it("shows skeletons while refetching after deletion, then hides them", async () => {
    const { resolveRefetch } = renderWithDeferredRefetch();

    // Sanity: row is rendered, no skeletons initially.
    expect(await screen.findByText("Station Test")).toBeInTheDocument();
    expect(document.querySelectorAll(".animate-pulse").length).toBe(0);

    // Open delete confirmation.
    fireEvent.click(screen.getByTitle("Supprimer"));
    await screen.findByText("Supprimer cette saisie ?");

    // Confirm deletion → triggers refetchQueries (awaits our deferred promise).
    const confirmBtn = screen
      .getAllByRole("button")
      .find((b) => b.textContent?.trim() === "Supprimer");
    expect(confirmBtn).toBeTruthy();
    fireEvent.click(confirmBtn!);

    // Skeletons should appear during the refetch window (no page reload).
    await waitFor(() => {
      expect(
        document.querySelectorAll(".animate-pulse").length
      ).toBeGreaterThan(0);
    });

    // Resolve refetch → skeletons should disappear.
    resolveRefetch();

    await waitFor(() => {
      expect(document.querySelectorAll(".animate-pulse").length).toBe(0);
    });
  });
});
