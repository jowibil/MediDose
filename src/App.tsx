import { lazy, Suspense, useEffect, useState } from "react";
import {
  CalendarClock,
  ClipboardList,
  PillBottle,
  TriangleAlert,
} from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AddMedicineForm, CabinetList } from "@/features/AddMedicineForm";
import type { Medicine, ScheduledDose } from "@/types/medicine";
import { generateScheduleForMedicine } from "@/lib/schedule";
import { WelcomeView } from "@/features/WelcomeView";

// Route-level code splitting: only the default "Add medicine" tab ships in the
// initial chunk. The other three views load on demand, avoiding an eager
// waterfall of unused feature code on first paint.
const ScheduleView = lazy(() =>
  import("@/features/ScheduleView").then((mod) => ({
    default: mod.ScheduleView,
  })),
);
const InventoryLedger = lazy(() =>
  import("@/features/InventoryLedger").then((mod) => ({
    default: mod.InventoryLedger,
  })),
);
const ExpirationBoard = lazy(() =>
  import("@/features/ExpirationBoard").then((mod) => ({
    default: mod.ExpirationBoard,
  })),
);

const MEDICINES_STORAGE_KEY = "medidose_medicines";
const DOSES_STORAGE_KEY = "medidose_doses";
const ACTIVE_TAB_STORAGE_KEY = "medidose_active_tab";

/** Safely reads and parses a JSON array from localStorage, falling back to [] on any problem. */
function loadFromStorage<T>(key: string): T[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

/** Lightweight placeholder shown while a lazily-loaded tab view streams in. */
function ViewSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-hidden="true">
      <div className="h-20 animate-pulse rounded-2xl border border-border/50 bg-card" />
      <div className="h-20 animate-pulse rounded-2xl border border-border/50 bg-card" />
      <div className="h-20 animate-pulse rounded-2xl border border-border/50 bg-card" />
    </div>
  );
}

function App() {
  // State is initialized from localStorage (if present) and persisted on every change.
  
  const [medicines, setMedicines] = useState<Medicine[]>(() =>
    loadFromStorage<Medicine>(MEDICINES_STORAGE_KEY),
  );
  const [doses, setDoses] = useState<ScheduledDose[]>(() =>
    loadFromStorage<ScheduledDose>(DOSES_STORAGE_KEY),
  );

  const [activeTab, setActiveTab] = useState<string>(() => {
    if (typeof window === "undefined") return "welcome";
    const savedTab = window.localStorage.getItem(ACTIVE_TAB_STORAGE_KEY);
    if (savedTab) return savedTab;
    return medicines.length === 0 ? "welcome" : "add";
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(ACTIVE_TAB_STORAGE_KEY, activeTab);
    } catch {
      // Storage unavailable fallback
    }
  }, [activeTab]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        MEDICINES_STORAGE_KEY,
        JSON.stringify(medicines),
      );
    } catch {
      // Storage may be unavailable (private browsing, quota exceeded, etc.) — fail silently.
    }
  }, [medicines]);

  useEffect(() => {
    try {
      window.localStorage.setItem(DOSES_STORAGE_KEY, JSON.stringify(doses));
    } catch {
      // Storage may be unavailable (private browsing, quota exceeded, etc.) — fail silently.
    }
  }, [doses]);

  function addMedicine(medicine: Medicine) {
    setMedicines((prev) => [...prev, medicine]);
    setDoses((prev) => [...prev, ...generateScheduleForMedicine(medicine)]);
  }

  /** Marks a scheduled dose taken/untaken, decrementing or restoring cabinet stock to match. */
  function toggleDose(doseId: string) {
    const dose = doses.find((d) => d.id === doseId);
    if (!dose) return;
    const medicine = medicines.find((m) => m.id === dose.medicineId);
    if (!medicine) return;

    // Block logging a dose when there's no stock left to log it against.
    if (!dose.taken && medicine.stock <= 0) return;

    setMedicines((prev) =>
      prev.map((m) =>
        m.id === medicine.id
          ? { ...m, stock: dose.taken ? m.stock + 1 : Math.max(0, m.stock - 1) }
          : m,
      ),
    );
    setDoses((prev) =>
      prev.map((d) => (d.id === doseId ? { ...d, taken: !d.taken } : d)),
    );
  }

  /** Adds stock to an existing medicine, e.g. after buying a refill. */
  function restockMedicine(medicineId: string, additionalStock: number) {
    if (!Number.isFinite(additionalStock) || additionalStock <= 0) return;
    setMedicines((prev) =>
      prev.map((m) =>
        m.id === medicineId ? { ...m, stock: m.stock + additionalStock } : m,
      ),
    );
  }

  /** Removes a medicine and its schedule entirely, e.g. to fix an accidental entry or typo. */
  function deleteMedicine(medicineId: string) {
    setMedicines((prev) => prev.filter((m) => m.id !== medicineId));
    setDoses((prev) => prev.filter((d) => d.medicineId !== medicineId));
  }

  return (
    <div className="min-h-[100dvh] bg-background font-['Geist',_ui-sans-serif,_system-ui,_sans-serif]">
      <header className="border-b border-border/60 bg-card">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-5 md:px-6">
          <div className="flex size-9 items-center justify-center rounded-2xl text-sage">
            <img src="/MediDoseLogosm.png" alt="MediDose Logo" />
          </div>
          <div>
            <h1 className="font-display text-xl font-medium leading-none tracking-tight">
              MediDose
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Precision Medicine, Trusted Care.
            </p>
          </div>
        </div>
      </header>

      <main className="container mx-auto max-w-4xl px-4 py-8 md:px-6">
        {activeTab === "welcome" && medicines.length === 0 ? (
          <WelcomeView onStartAdding={() => setActiveTab("add")} />
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="add">
                <PillBottle /> Add medicine
              </TabsTrigger>
              <TabsTrigger value="schedule">
                <CalendarClock /> Today's schedule
              </TabsTrigger>
              <TabsTrigger value="inventory">
                <ClipboardList /> Inventory ledger
              </TabsTrigger>
              <TabsTrigger value="alerts">
                <TriangleAlert /> Expiration alerts
              </TabsTrigger>
            </TabsList>

            <TabsContent value="add" className="flex flex-col gap-6">
              <AddMedicineForm onAdd={addMedicine} />
              <CabinetList medicines={medicines} onDelete={deleteMedicine} />
            </TabsContent>

            <TabsContent value="schedule">
              <Suspense fallback={<ViewSkeleton />}>
                <ScheduleView
                  medicines={medicines}
                  doses={doses}
                  onToggleDose={toggleDose}
                />
              </Suspense>
            </TabsContent>

            <TabsContent value="inventory">
              <Suspense fallback={<ViewSkeleton />}>
                <InventoryLedger
                  medicines={medicines}
                  onRestock={restockMedicine}
                  onDelete={deleteMedicine}
                />
              </Suspense>
            </TabsContent>

            <TabsContent value="alerts">
              <Suspense fallback={<ViewSkeleton />}>
                <ExpirationBoard
                  medicines={medicines}
                  onDispose={deleteMedicine}
                  onDelete={deleteMedicine}
                />
              </Suspense>
            </TabsContent>
          </Tabs>
        )}
      </main>
    </div>
  );
}

export default App;
