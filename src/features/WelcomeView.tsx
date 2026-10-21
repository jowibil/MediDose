// src/features/WelcomeView.tsx
import {
  CalendarClock,
  PackageCheck,
  ShieldAlert,
  Plus,
  Sparkles,
} from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface WelcomeViewProps {
  onStartAdding: () => void;
  onLoadDemoData?: () => void;
}

export function WelcomeView({
  onStartAdding,
  onLoadDemoData,
}: WelcomeViewProps) {
  return (
    <div className="mx-auto max-w-4xl space-y-8 py-6">
      {/* Hero Banner */}
      <div className="flex flex-col items-center text-center space-y-4">
        <div className="inline-flex items-center gap-2 rounded-full border border-amber/30 bg-amber/10 px-3.5 py-1 text-xs font-semibold text-amber">
          <Sparkles className="size-3.5" /> Welcome to MediDose
        </div>

        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
          Your Personal Household Medication Tracker
        </h1>

        <p className="max-w-xl text-balance text-sm text-muted-foreground sm:text-base">
          Effortlessly manage schedules, stock counts, and expiration dates for
          your whole family—all saved securely right on your local device.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <Button size="lg" onClick={onStartAdding} className="gap-2">
            <Plus className="size-4" /> Add Your First Medicine
          </Button>
          {onLoadDemoData && (
            <Button size="lg" variant="outline" onClick={onLoadDemoData}>
              Try Demo Data
            </Button>
          )}
        </div>
      </div>

      {/* Feature Highlights Grid */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="border-border/60 shadow-sm transition-all hover:shadow-md">
          <CardHeader className="pb-2">
            <div className="mb-2 flex size-10 items-center justify-center rounded-xl bg-amber/10 text-amber">
              <CalendarClock className="size-5" />
            </div>
            <CardTitle className="text-base">Smart Waking Schedules</CardTitle>
          </CardHeader>
          <CardContent>
            <CardDescription className="text-xs">
              Automatically distributes daily intake slots evenly across your
              normal waking hours starting at your preferred first dose time.
            </CardDescription>
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-sm transition-all hover:shadow-md">
          <CardHeader className="pb-2">
            <div className="mb-2 flex size-10 items-center justify-center rounded-xl bg-sage-soft text-sage">
              <PackageCheck className="size-5" />
            </div>
            <CardTitle className="text-base">Stock-Aware Ledger</CardTitle>
          </CardHeader>
          <CardContent>
            <CardDescription className="text-xs">
              Tracks actual cabinet inventory in real time. Prevents scheduling
              phantom doses when stock runs out and alerts you when it's time to
              restock.
            </CardDescription>
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-sm transition-all hover:shadow-md">
          <CardHeader className="pb-2">
            <div className="mb-2 flex size-10 items-center justify-center rounded-xl bg-rose-500/10 text-rose-500">
              <ShieldAlert className="size-5" />
            </div>
            <CardTitle className="text-base">Expiration Warnings</CardTitle>
          </CardHeader>
          <CardContent>
            <CardDescription className="text-xs">
              Monitors expiration dates to ensure expired or unsafe medicines
              are safely flagged for disposal before use.
            </CardDescription>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
