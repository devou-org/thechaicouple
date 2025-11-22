"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Minus, Plus } from "lucide-react";

import { getTodayKey } from "@/lib/firebase";
import { getCachedPricing, setCachedPricing } from "@/lib/pricing-cache";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

const MENU = [
  { key: "chai", label: "Special Chai" },
  { key: "bun", label: "Bun" },
  { key: "tiramisu", label: "Tiramisu" },
];

const currency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 0,
});

export default function QueuePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [quantities, setQuantities] = useState({ chai: 0, bun: 0, tiramisu: 0 });
  const [pricing, setPricing] = useState({ chaiPrice: 0, bunPrice: 0, tiramisuPrice: 0 });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [settings, setSettings] = useState(null);
  const [settingsError, setSettingsError] = useState("");
  const [settingsLoading, setSettingsLoading] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem("queueTicket");
      if (!stored) return;
      const parsed = JSON.parse(stored);
      if (parsed?.id && parsed.dateKey === getTodayKey()) {
        router.replace(`/status/${parsed.id}`);
      }
    } catch {
      // ignore
    }
  }, [router]);

  useEffect(() => {
    let ignore = false;
    const cached = getCachedPricing();
    if (cached?.data) {
      setPricing(cached.data);
      if (cached.fresh) {
        return;
      }
    }

    async function loadPricing() {
      try {
        const res = await fetch("/api/pricing");
        if (!res.ok) return;
        const data = await res.json();
        const next = {
          chaiPrice: Number(data.chaiPrice) || 0,
          bunPrice: Number(data.bunPrice) || 0,
          tiramisuPrice: Number(data.tiramisuPrice) || 0,
        };
        if (!ignore) {
          setPricing(next);
        }
        setCachedPricing(next);
      } catch {
        // ignore
      }
    }
    loadPricing();
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    
    const dateKey = getTodayKey();
    const source = new EventSource(`/api/queue/stream?date=${dateKey}`);
    
    source.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.settings) {
          setSettings(payload.settings);
          setSettingsLoading(false);
          setSettingsError("");
          
          // Auto-adjust quantities if inventory drops below selected quantities
          setQuantities((prev) => {
            const newInventory = payload.settings.inventory || { chai: 0, bun: 0, tiramisu: 0 };
            return {
              chai: Math.min(prev.chai || 0, newInventory.chai || 0),
              bun: Math.min(prev.bun || 0, newInventory.bun || 0),
              tiramisu: Math.min(prev.tiramisu || 0, newInventory.tiramisu || 0),
            };
          });
        }
      } catch {
        setSettingsError("Failed to process settings update");
        setSettingsLoading(false);
      }
    };
    
    source.onerror = () => {
      setSettingsError("Live updates interrupted. Settings may be outdated.");
      setSettingsLoading(false);
    };
    
    return () => {
      source.close();
    };
  }, []);

  const orderItems = useMemo(
    () =>
      MENU.map((item) => ({
        name: item.label,
        key: item.key,
        qty: quantities[item.key] || 0,
        price: item.key === "chai" ? pricing.chaiPrice : item.key === "bun" ? pricing.bunPrice : pricing.tiramisuPrice,
      })).filter((item) => item.qty > 0),
    [quantities, pricing]
  );

  const total = orderItems.reduce(
    (sum, item) => sum + (item.price || 0) * item.qty,
    0
  );

  const isWithinServiceWindow = useMemo(() => {
    if (!settings) return true;
    if (!settings.serviceStart || !settings.serviceEnd) return true;
    const toMinutes = (time) => {
      const [hours = "0", minutes = "0"] = String(time).split(":");
      return Number(hours) * 60 + Number(minutes);
    };
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const startMinutes = toMinutes(settings.serviceStart);
    const endMinutes = toMinutes(settings.serviceEnd);
    if (Number.isNaN(startMinutes) || Number.isNaN(endMinutes)) return true;
    if (startMinutes <= endMinutes) {
      return nowMinutes >= startMinutes && nowMinutes <= endMinutes;
    }
    return nowMinutes >= startMinutes || nowMinutes <= endMinutes;
  }, [settings]);

  // Calculate availability from inventory (inventory > 0 means available)
  const inventory = settings?.inventory || { chai: 0, bun: 0, tiramisu: 0 };
  const buffer = settings?.buffer || { chai: 10, bun: 10, tiramisu: 10 };
  const availability = {
    chai: (inventory.chai || 0) > 0,
    bun: (inventory.bun || 0) > 0,
    tiramisu: (inventory.tiramisu || 0) > 0,
  };
  const hasAnyAvailable = availability.chai || availability.bun || availability.tiramisu;
  const queueOpen = isWithinServiceWindow && hasAnyAvailable;

  const canSubmit =
    queueOpen && name.trim().length > 0 && orderItems.length > 0 && !submitting;

  function updateQuantity(key, delta) {
    const available =
      settings?.availability?.[key] ?? availability[key] ?? true;
    setQuantities((prev) => {
      if (delta > 0 && !available) {
        return prev;
      }
      const next = Math.max(0, (prev[key] || 0) + delta);
      return { ...prev, [key]: next };
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError("");
    try {
      const items = orderItems.map(({ name, qty }) => ({ name, qty }));
      const res = await fetch("/api/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), items }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to join queue");
        setSubmitting(false);
        return;
      }
      if (typeof window !== "undefined") {
        window.localStorage.setItem(
          "queueTicket",
          JSON.stringify({ id: data.id, dateKey: data.dateKey })
        );
      }
      router.push(`/status/${data.id}`);
    } catch (err) {
      console.error(err);
      setError("Something went wrong. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-muted/40 py-10">
      <div className="container max-w-2xl">
        <Card className="border-none shadow-lg">
          <CardHeader className="space-y-4 text-center">
            <div className="mx-auto h-28 w-28 overflow-hidden rounded-full border-4 border-white shadow">
              <Image
                src="/thechaicouple.jpg"
                alt="Fresh Irani chai and bun"
                width={160}
                height={160}
                className="h-full w-full object-cover"
                priority
              />
            </div>
            <CardTitle className="text-3xl">Join the Queue</CardTitle>
            <CardDescription>
              Tell us your name, choose your snacks, and get a live token instantly.
            </CardDescription>
            {settings && settings.serviceStart && settings.serviceEnd && (
              <Badge variant="outline" className="mt-2">
                Service hours: {(() => {
                  const formatTime = (timeStr) => {
                    if (!timeStr) return "";
                    const [hours, minutes] = String(timeStr).split(":");
                    const h = Number(hours) || 0;
                    const m = Number(minutes) || 0;
                    const period = h >= 12 ? "PM" : "AM";
                    const displayHour = h === 0 ? 12 : h > 12 ? h - 12 : h;
                    return `${displayHour}:${String(m).padStart(2, "0")} ${period}`;
                  };
                  return `${formatTime(settings.serviceStart)} – ${formatTime(settings.serviceEnd)}`;
                })()}
              </Badge>
            )}
          </CardHeader>
          <CardContent className="space-y-6">
            {!queueOpen && !settingsLoading && (
              <Alert variant="destructive">
                <AlertDescription>
                  {settings?.closedMessage ||
                    "Queue is currently closed. Please visit us during service hours."}
                </AlertDescription>
              </Alert>
            )}
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  placeholder="Your Full Name "
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={!queueOpen}
                  required
                />
              </div>

              <div className="space-y-3">
                {MENU.map((item) => {
                  const price =
                    item.key === "chai" ? pricing.chaiPrice : item.key === "bun" ? pricing.bunPrice : pricing.tiramisuPrice;
                  const qty = quantities[item.key] || 0;
                  const available = availability[item.key] ?? false;
                  const itemInventory = inventory[item.key] || 0;
                  const itemBuffer = buffer[item.key] || 10;
                  // Only show badges when settings are loaded
                  const isLowStock = !settingsLoading && itemInventory > 0 && itemInventory < itemBuffer;
                  const isOutOfStock = !settingsLoading && itemInventory <= 0;
                  
                  return (
                    <div
                      key={item.key}
                      className="flex items-center justify-between rounded-2xl border bg-card px-4 py-3"
                    >
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium">{item.label}</p>
                          {isOutOfStock && (
                            <Badge variant="destructive" className="text-xs">
                              Out of Stock
                            </Badge>
                          )}
                          {isLowStock && !isOutOfStock && (
                            <Badge variant="default" className="text-xs bg-amber-500 hover:bg-amber-600">
                              Low Stock ({itemInventory} left)
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {price ? currency.format(price) : "Pricing pending"}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={() => updateQuantity(item.key, -1)}
                          disabled={qty === 0}
                        >
                          <Minus className="h-4 w-4" />
                        </Button>
                        <span className="w-8 text-center text-lg font-semibold">
                          {qty}
                        </span>
                        <Button
                          type="button"
                          size="icon"
                          onClick={() => updateQuantity(item.key, 1)}
                          disabled={!available || !queueOpen || qty >= itemInventory}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {orderItems.length > 0 && (
                <div className="rounded-2xl border bg-muted/40 p-4">
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>Summary</span>
                    <Badge variant="secondary">{orderItems.length} items</Badge>
                  </div>
                  <ul className="mt-3 space-y-1 text-sm">
                    {orderItems.map((item) => (
                      <li
                        key={item.key}
                        className="flex items-center justify-between text-muted-foreground"
                      >
                        <span>
                          {item.name} × {item.qty}
                        </span>
                        <span>{currency.format((item.price || 0) * item.qty)}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-4 flex items-center justify-between font-semibold">
                    <span>Total</span>
                    <span>{currency.format(total)}</span>
                  </div>
                  {/* {total > 0 && (
                    <div className="mt-4 flex justify-center">
                      <a
                        href="https://www.upi.me/pay?pa=alanjohnchacko.live-1@okicici&am=20"
                        className="inline-block rounded-lg bg-black px-5 py-2.5 text-white no-underline transition-opacity hover:opacity-90"
                        style={{ padding: "10px 20px", background: "black", color: "white", borderRadius: "8px", textDecoration: "none" }}
                      >
                        Pay with GPay
                      </a>
                    </div>
                  )} */}
                </div>
              )}

              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <Button type="submit" className="w-full" disabled={!canSubmit}>
                {submitting ? "Adding you to the line..." : "Get My Token"}
              </Button>
            </form>

           
          </CardContent>
          <CardFooter className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
            <span>Need help? Ask a staff member to rescan the QR.</span>
           
          </CardFooter>
        </Card>
        {settingsError && (
          <Alert variant="destructive" className="mt-4">
            <AlertDescription>{settingsError}</AlertDescription>
          </Alert>
        )}
      </div>
    </main>
  );
}

