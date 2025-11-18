"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getTodayKey, auth } from "@/lib/firebase";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

const currency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 0,
});

export default function AdminPage() {
  const [authed, setAuthed] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setAuthed(Boolean(user));
      setCheckingAuth(false);
    });
    return () => unsub();
  }, []);

  if (checkingAuth) {
    return null;
  }

  if (!authed) {
    return <AdminLogin onAuthed={() => setAuthed(true)} />;
  }

  return <AdminDashboard />;
}

function AdminLogin({ onAuthed }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      await signInWithEmailAndPassword(auth, email, password);
      onAuthed();
    } catch (err) {
      setError("Login failed. Check your credentials and try again.");
      setLoading(false);
      return;
    }
    setLoading(false);
  }

  return (
    <main className="min-h-screen bg-muted/40 flex items-center justify-center p-6">
      <Card className="w-full max-w-sm shadow-lg">
        <CardHeader className="space-y-4 text-center">
          <div className="mx-auto h-28 w-28 overflow-hidden rounded-full border-4 border-white shadow">
            <Image
              src="/thechaicouple.jpg"
              alt="Chai bun brand"
              width={160}
              height={160}
              className="h-full w-full object-cover"
              priority
            />
          </div>
          <CardTitle>Admin Sign In</CardTitle>
          <CardDescription>Only staff with registered Firebase accounts can access the dashboard.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@example.com"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Signing in..." : "Sign In"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}

function AdminDashboard() {
  const todayKey = getTodayKey();

  const [tab, setTab] = useState("queue");
  const [queueTickets, setQueueTickets] = useState([]);
  const [queueLoading, setQueueLoading] = useState(true);
  const [queueError, setQueueError] = useState("");

  const [dashboardDate, setDashboardDate] = useState(todayKey);
  const [dashboardTickets, setDashboardTickets] = useState([]);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState("");

  const [chaiPrice, setChaiPrice] = useState("");
  const [bunPrice, setBunPrice] = useState("");
  const [pricingError, setPricingError] = useState("");
  const [pricingSaving, setPricingSaving] = useState(false);

  const [serviceStart, setServiceStart] = useState("06:00");
  const [serviceEnd, setServiceEnd] = useState("23:00");
  const [closedMessage, setClosedMessage] = useState("");
  const [availability, setAvailability] = useState({ chai: true, bun: true });
  const [settingsError, setSettingsError] = useState("");
  const [settingsSaving, setSettingsSaving] = useState(false);

  const [clearing, setClearing] = useState(false);

  const loadQueueTickets = useCallback(
    async ({ silent } = {}) => {
      try {
        setQueueError("");
        if (!silent) setQueueLoading(true);
        const res = await fetch(`/api/queue?date=${todayKey}`);
        const json = await res.json();
        if (!res.ok) {
          setQueueError(json.error || "Failed to load queue");
          setQueueLoading(false);
          return;
        }
        setQueueTickets(json.tickets || []);
        setQueueLoading(false);
      } catch {
        setQueueError("Failed to load queue");
        setQueueLoading(false);
      }
    },
    [todayKey]
  );

  const loadDashboardTickets = useCallback(
    async (dateKey = dashboardDate, { silent } = {}) => {
      try {
        setDashboardError("");
        if (!silent) setDashboardLoading(true);
        const res = await fetch(`/api/queue?date=${dateKey}`);
        const json = await res.json();
        if (!res.ok) {
          setDashboardError(json.error || "Failed to load data");
          setDashboardLoading(false);
          return;
        }
        setDashboardTickets(json.tickets || []);
        setDashboardLoading(false);
      } catch {
        setDashboardError("Failed to load data");
        setDashboardLoading(false);
      }
    },
    [dashboardDate]
  );

  useEffect(() => {
    loadQueueTickets();
  }, [loadQueueTickets]);

  useEffect(() => {
    if (tab !== "queue") return;
    setQueueError("");
    setQueueLoading(true);
    const source = new EventSource(`/api/queue/stream?date=${todayKey}`);
    source.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        setQueueTickets(payload.tickets || []);
        setQueueLoading(false);
        setQueueError("");
      } catch {
        setQueueError("Failed to parse live updates");
        setQueueLoading(false);
      }
    };
    source.onerror = () => {
      setQueueError("Live updates interrupted. Refresh manually.");
    };
    return () => {
      source.close();
    };
  }, [tab, todayKey]);

  useEffect(() => {
    loadDashboardTickets(dashboardDate);
  }, [dashboardDate, loadDashboardTickets]);

  useEffect(() => {
    async function loadPricing() {
      try {
        const res = await fetch("/api/pricing");
        const json = await res.json();
        if (!res.ok) {
          setPricingError(json.error || "Failed to load pricing");
          return;
        }
        setChaiPrice(String(json.chaiPrice ?? ""));
        setBunPrice(String(json.bunPrice ?? ""));
      } catch {
        setPricingError("Failed to load pricing");
      }
    }
    loadPricing();
  }, []);

  useEffect(() => {
    async function loadSettings() {
      try {
        const res = await fetch("/api/settings");
        const json = await res.json();
        if (!res.ok) {
          setSettingsError(json.error || "Failed to load settings");
          return;
        }
        setServiceStart(json.serviceStart || "06:00");
        setServiceEnd(json.serviceEnd || "23:00");
        setClosedMessage(json.closedMessage || "");
        setAvailability({
          chai: json.availability?.chai ?? true,
          bun: json.availability?.bun ?? true,
        });
      } catch {
        setSettingsError("Failed to load settings");
      }
    }
    loadSettings();
  }, []);

  async function updateStatus(id, dateKey, status) {
    try {
      const res = await fetch("/api/ready", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, dateKey, status }),
      });
      if (!res.ok) return;
      await loadQueueTickets();
      if (dateKey === dashboardDate) {
        await loadDashboardTickets(dashboardDate, { silent: true });
      }
    } catch {
      // ignore
    }
  }

  async function clearToday() {
    setClearing(true);
    try {
      await fetch("/api/queue", { method: "DELETE" });
      await loadQueueTickets();
      await loadDashboardTickets(dashboardDate);
    } catch {
      // ignore
    } finally {
      setClearing(false);
    }
  }

  async function savePricing(event) {
    event.preventDefault();
    setPricingError("");
    setPricingSaving(true);
    try {
      const res = await fetch("/api/pricing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chaiPrice: Number(chaiPrice),
          bunPrice: Number(bunPrice),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setPricingError(json.error || "Failed to save pricing");
        setPricingSaving(false);
        return;
      }
      setChaiPrice(String(json.chaiPrice ?? ""));
      setBunPrice(String(json.bunPrice ?? ""));
      setPricingSaving(false);
    } catch {
      setPricingError("Failed to save pricing");
      setPricingSaving(false);
    }
  }

  async function saveSettings(event) {
    event.preventDefault();
    setSettingsError("");
    setSettingsSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceStart,
          serviceEnd,
          closedMessage,
          availability,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setSettingsError(json.error || "Failed to save settings");
        setSettingsSaving(false);
        return;
      }
      setServiceStart(json.serviceStart || "06:00");
      setServiceEnd(json.serviceEnd || "23:00");
      setClosedMessage(json.closedMessage || "");
      setAvailability({
        chai: json.availability?.chai ?? true,
        bun: json.availability?.bun ?? true,
      });
      setSettingsSaving(false);
    } catch {
      setSettingsError("Failed to save settings");
      setSettingsSaving(false);
    }
  }

  function toggleAvailability(item) {
    setAvailability((prev) => ({
      ...prev,
      [item]: !prev[item],
    }));
  }

  const queueTicketsWaiting = useMemo(
    () =>
      queueTickets
        .filter((ticket) => ticket.status === "waiting")
        .sort((a, b) => (a.basePosition || 0) - (b.basePosition || 0)),
    [queueTickets]
  );

  const readyTickets = useMemo(
    () =>
      dashboardTickets
        .filter((ticket) => ticket.status === "ready")
        .sort((a, b) => (a.updatedAt?.seconds || 0) - (b.updatedAt?.seconds || 0)),
    [dashboardTickets]
  );

  const readySummary = useMemo(() => {
    let chaiCount = 0;
    let bunCount = 0;
    let revenue = 0;
    readyTickets.forEach((ticket) => {
      ticket.items?.forEach((item) => {
        if (!item.qty) return;
        if (item.name === "Irani Chai") chaiCount += item.qty;
        if (item.name === "Bun") bunCount += item.qty;
      });
      // ticketTotal prioritizes stored total field, prices only used as fallback for old tickets
      revenue += ticketTotal(
        ticket,
        Number(chaiPrice) || 0,
        Number(bunPrice) || 0
      );
    });
    return { chaiCount, bunCount, revenue };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readyTickets]); // Prices removed from deps - revenue uses stored totals, not current prices

  return (
    <main className="min-h-screen bg-muted/40 py-10">
      <div className="container max-w-6xl space-y-6">
        <div className="flex flex-col items-center text-center gap-3">
          <div className="h-32 w-32 overflow-hidden rounded-full border-4 border-white shadow">
            <Image
              src="/thechaicouple.jpg"
              alt="Chai bun brand"
              width={200}
              height={200}
              className="h-full w-full object-cover"
              priority
            />
          </div>
          <h1 className="text-3xl font-semibold">Admin Dashboard</h1>
          <p className="text-muted-foreground text-sm">
            Manage today&apos;s queue and review completed orders.
          </p>
        </div>

        <Tabs value={tab} onValueChange={setTab} className="space-y-6">
          <TabsList className="w-full max-w-2xl">
            <TabsTrigger value="queue" className="w-full">
              Queue
            </TabsTrigger>
            <TabsTrigger value="dashboard" className="w-full">
              Served dashboard
            </TabsTrigger>
            <TabsTrigger value="settings" className="w-full">
              Settings
            </TabsTrigger>
          </TabsList>

          <TabsContent value="queue" className="space-y-6">
            <Card>
              <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle>Live Queue</CardTitle>
                  <CardDescription>
                    Waiting tickets for {todayKey}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant="secondary">
                    {queueTicketsWaiting.length} waiting
                  </Badge>
                  <Button variant="outline" onClick={clearToday} disabled={clearing}>
                    {clearing ? "Clearing..." : "Clear Today"}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {queueError && (
                  <Alert variant="destructive" className="mb-4">
                    <AlertDescription>{queueError}</AlertDescription>
                  </Alert>
                )}
                {queueLoading ? (
                  <LoaderCard />
                ) : queueTicketsWaiting.length === 0 ? (
                  <p className="py-12 text-center text-muted-foreground">
                    No one is waiting right now.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Queue #</TableHead>
                        <TableHead>Token</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Order</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {queueTicketsWaiting.map((ticket, index) => (
                        <TableRow key={ticket.id}>
                          <TableCell>{index + 1}</TableCell>
                          <TableCell className="font-medium">
                            {ticket.basePosition}
                          </TableCell>
                          <TableCell>{ticket.name}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {formatOrder(ticket.items)}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              onClick={() =>
                                updateStatus(ticket.id, ticket.dateKey, "ready")
                              }
                            >
                              Done
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="dashboard" className="space-y-6">
            <Card>
              <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <CardTitle>Serve dashboard</CardTitle>
                  <CardDescription>
                    Pick a date to inspect ready orders and revenue.
                  </CardDescription>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Label className="text-xs uppercase text-muted-foreground">
                    Date
                  </Label>
                  <Input
                    type="date"
                    max={todayKey}
                    value={dashboardDate}
                    onChange={(e) => setDashboardDate(e.target.value || todayKey)}
                    className="w-full sm:w-[220px]"
                  />
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 md:grid-cols-3">
                  <SummaryCard label="Served chai" value={readySummary.chaiCount} />
                  <SummaryCard label="Served buns" value={readySummary.bunCount} />
                  <SummaryCard
                    label="Revenue"
                    value={currency.format(readySummary.revenue || 0)}
                  />
                </div>

                {dashboardError && (
                  <Alert variant="destructive">
                    <AlertDescription>{dashboardError}</AlertDescription>
                  </Alert>
                )}

                {dashboardLoading ? (
                  <LoaderCard />
                ) : readyTickets.length === 0 ? (
                  <p className="py-12 text-center text-muted-foreground">
                    No ready tickets for {dashboardDate}.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Token</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Order</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {readyTickets.map((ticket) => (
                        <TableRow key={ticket.id}>
                          <TableCell className="font-medium">
                            {ticket.basePosition}
                          </TableCell>
                          <TableCell>{ticket.name}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {formatOrder(ticket.items)}
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            {currency.format(ticketTotal(ticket, Number(chaiPrice) || 0, Number(bunPrice) || 0))}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="settings" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Service window & availability</CardTitle>
                <CardDescription>
                  Control when the queue opens and what items are on the menu.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={saveSettings} className="grid gap-6 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="serviceStart">Service start</Label>
                    <Input
                      id="serviceStart"
                      type="time"
                      value={serviceStart}
                      onChange={(e) => setServiceStart(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="serviceEnd">Service end</Label>
                    <Input
                      id="serviceEnd"
                      type="time"
                      value={serviceEnd}
                      onChange={(e) => setServiceEnd(e.target.value)}
                      required
                    />
                  </div>
                  <div className="md:col-span-2 space-y-2">
                    <Label htmlFor="closedMessage">Closed caption</Label>
                    <Input
                      id="closedMessage"
                      value={closedMessage}
                      onChange={(e) => setClosedMessage(e.target.value)}
                      placeholder="We pour chai daily between 6am – 11pm."
                    />
                  </div>
                  <div className="md:col-span-2 space-y-3">
                    <Label>Availability</Label>
                    <div className="flex flex-wrap gap-3">
                      <Button
                        type="button"
                        variant={availability.chai ? "secondary" : "outline"}
                        className="flex-1 sm:flex-none"
                        onClick={() => toggleAvailability("chai")}
                      >
                        Irani Chai — {availability.chai ? "Available" : "Sold out"}
                      </Button>
                      <Button
                        type="button"
                        variant={availability.bun ? "secondary" : "outline"}
                        className="flex-1 sm:flex-none"
                        onClick={() => toggleAvailability("bun")}
                      >
                        Bun Maska — {availability.bun ? "Available" : "Sold out"}
                      </Button>
                    </div>
                  </div>
                  {settingsError && (
                    <div className="md:col-span-2">
                      <Alert variant="destructive">
                        <AlertDescription>{settingsError}</AlertDescription>
                      </Alert>
                    </div>
                  )}
                  <div className="md:col-span-2">
                    <Button type="submit" disabled={settingsSaving}>
                      {settingsSaving ? "Saving..." : "Save service settings"}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Pricing</CardTitle>
                <CardDescription>
                  Set the prices for Irani Chai and Bun Maska.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form
                  onSubmit={savePricing}
                  className="grid gap-4 md:grid-cols-3"
                >
                  <div className="space-y-2">
                    <Label htmlFor="chaiPrice">Irani Chai price</Label>
                    <Input
                      id="chaiPrice"
                      type="number"
                      min={0}
                      value={chaiPrice}
                      onChange={(e) => setChaiPrice(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="bunPrice">Bun price</Label>
                    <Input
                      id="bunPrice"
                      type="number"
                      min={0}
                      value={bunPrice}
                      onChange={(e) => setBunPrice(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col justify-end gap-2">
                    {pricingError && (
                      <Alert variant="destructive">
                        <AlertDescription>{pricingError}</AlertDescription>
                      </Alert>
                    )}
                    <Button type="submit" disabled={pricingSaving}>
                      {pricingSaving ? "Saving..." : "Save prices"}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}

function SummaryCard({ label, value }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-3xl font-semibold">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}

function LoaderCard() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
      <Skeleton className="h-4 w-2/3" />
    </div>
  );
}

function formatOrder(items) {
  if (!Array.isArray(items)) return "—";
  const filtered = items.filter((item) => item.qty > 0);
  if (filtered.length === 0) return "—";
  return filtered.map((item) => `${item.name} × ${item.qty}`).join(", ");
}

function ticketTotal(ticket, fallbackChai = 0, fallbackBun = 0) {
  if (typeof ticket.total === "number") {
    return ticket.total;
  }
  if (!Array.isArray(ticket.items)) return 0;
  return ticket.items.reduce((sum, item) => {
    const price = item.name === "Irani Chai" ? fallbackChai : fallbackBun;
    return sum + (price || 0) * (item.qty || 0);
  }, 0);
}

