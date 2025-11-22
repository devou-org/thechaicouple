"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { LogOut, RotateCw } from "lucide-react";

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
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

const currency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 0,
});

export default function StatusPage() {
  const { id } = useParams();
  const router = useRouter();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pricing, setPricing] = useState({ chaiPrice: 0, bunPrice: 0, tiramisuPrice: 0 });
  const [streamSettings, setStreamSettings] = useState(null);
  const [ticketNotFound, setTicketNotFound] = useState(false);

  useEffect(() => {
    if (!id || typeof window === "undefined") return;
    const stored = window.localStorage.getItem("queueTicket");
    if (!stored) {
      window.localStorage.setItem(
        "queueTicket",
        JSON.stringify({ id, dateKey: getTodayKey() })
      );
    }
  }, [id]);

  useEffect(() => {
    if (!id) return;
    const dateKey = getTodayKey();
    const source = new EventSource(`/api/queue/stream?date=${dateKey}`);
    
    // Track if we've seen the ticket at least once
    let hasSeenTicket = false;
    
    source.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.settings) {
          setStreamSettings(payload.settings);
        }
        const tickets = Array.isArray(payload.tickets) ? payload.tickets : [];
        const ticket = tickets.find((t) => t.id === id);
        
        if (!ticket) {
          // Ticket not found - check if we've seen it before
          if (hasSeenTicket) {
            // Ticket was removed or doesn't exist anymore
            if (typeof window !== "undefined") {
              window.localStorage.removeItem("queueTicket");
            }
            setTicketNotFound(true);
            setError("You may have been removed from the queue.Please come to tomorrow to join the queue.");
            setLoading(false);
          } else {
            // First check - ticket might not exist yet, keep loading
            setLoading(true);
          }
          return;
        }
        
        // Ticket found
        hasSeenTicket = true;
        setTicketNotFound(false);
        const waitingTickets = tickets.filter((t) => t.status === "waiting");
        const waitingIndex = waitingTickets.findIndex((t) => t.id === id);
        setData({
          ...ticket,
          position: waitingIndex === -1 ? null : waitingIndex + 1,
          dateKey: payload.dateKey,
        });
        setLoading(false);
        setError("");
      } catch {
        setError("Failed to process live updates");
        setLoading(false);
      }
    };
    source.onerror = () => {
      setError("Live updates interrupted. Tap refresh to continue.");
      setLoading(false);
    };
    return () => {
      source.close();
    };
  }, [id]);

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

  const orderSummary = useMemo(() => {
    if (!data?.items) return [];
        return data.items
      .filter((item) => item.qty > 0)
      .map((item) => {
        let price = pricing.bunPrice;
        // Handle both "Special Chai" and legacy "Irani Chai"
        if (item.name === "Special Chai" || item.name === "Irani Chai") {
          price = pricing.chaiPrice;
        } else if (item.name === "Tiramisu") {
          price = pricing.tiramisuPrice;
        }
        const subtotal = (price || 0) * item.qty;
        return { name: item.name, qty: item.qty, price, subtotal };
      });
  }, [data, pricing]);

  const orderTotal = useMemo(
    () => orderSummary.reduce((sum, item) => sum + item.subtotal, 0),
    [orderSummary]
  );

  async function handleExitQueue() {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("queueTicket");
    }
    try {
      const dateKey = getTodayKey();
      await fetch(
        `/api/ticket?id=${encodeURIComponent(id)}&date=${encodeURIComponent(
          dateKey
        )}`,
        { method: "DELETE" }
      );
    } catch {
      // ignore
    } finally {
      router.replace("/queue");
    }
  }

  const status = data?.status || "waiting";
  const tokenNumber = data?.basePosition ?? null;

  const isSoldOut = useMemo(() => {
    if (!data?.items || !streamSettings?.availability) return false;
    const availability = streamSettings.availability;
    return data.items.some((item) => {
      if (item.qty <= 0) return false;
      if ((item.name === "Special Chai" || item.name === "Irani Chai") && !availability.chai) return true;
      if (item.name === "Bun" && !availability.bun) return true;
      return false;
    });
  }, [data, streamSettings]);

  useEffect(() => {
    if (status !== "ready") return;
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("queueTicket");
    }
    router.replace(`/served/${id}`);
  }, [status, router, id]);

  return (
    <main className="min-h-screen bg-muted/40 py-10">
      <div className="container max-w-xl">
        <Card className="border-none shadow-lg">
          <CardHeader className="space-y-4">
            <div className="flex items-center justify-between">
              {tokenNumber && (
                <Badge className="bg-amber-100 text-amber-900 text-base px-4 py-1">
                  Token #{tokenNumber}
                </Badge>
              )}
            </div>
            <div className="text-center space-y-4">
            <div className="mx-auto h-28 w-28 overflow-hidden rounded-full border-4 border-white shadow">
              <Image
                src="/thechaicouple.jpg"
                alt="Chai being served"
                width={160}
                height={160}
                className="h-full w-full object-cover"
                priority
              />
            </div>
            <CardTitle className="text-3xl">Your Token</CardTitle>
            <CardDescription>
              Keep this page open—your position updates every few seconds.
            </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {loading ? (
              <div className="space-y-3">
                <Skeleton className="h-6 w-24 mx-auto" />
                <Skeleton className="h-10 w-32 mx-auto" />
                <Skeleton className="h-24 rounded-2xl" />
              </div>
            ) : ticketNotFound ? (
              <Alert variant="destructive">
                <AlertDescription>
                  Your ticket was not found. You may have been removed from the queue.
                </AlertDescription>
              </Alert>
            ) : error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : (
              data && (
                <div className="space-y-5 text-center">
                  <div>
                    <p className="text-sm text-muted-foreground">Name</p>
                    <p className="text-2xl font-semibold">{data.name}</p>
                  </div>
                  {/* {tokenNumber && (
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">
                        Token number
                      </p>
                      <div className="inline-flex items-center justify-center rounded-full border border-primary/30 bg-primary/5 px-4 py-1 text-lg font-semibold text-primary">
                        #{tokenNumber}
                      </div>
                    </div>
                  )} */}
                  <div>
                    <p className="text-sm text-muted-foreground">
                      Current Queue Position
                    </p>
                    <p className="text-4xl font-bold">
                      {data.position === null ? "-" : data.position}
                    </p>
                  </div>
                  {isSoldOut ? (
                    <Alert variant="destructive" className="text-center">
                      <AlertDescription className="font-semibold">
                        One or more items in your order are now sold out. Please exit the queue and rejoin when items are available again.
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <Badge
                      variant={status === "ready" ? "secondary" : "outline"}
                      className={`px-5 py-1.5 text-base ${
                        status === "ready"
                          ? "bg-green-50 text-green-900 border-green-100"
                          : "border-yellow-300 text-yellow-700"
                      }`}
                    >
                      {status === "ready" ? "Ready for pickup" : "Waiting"}
                    </Badge>
                  )}

                  {orderSummary.length > 0 && (
                    <div className="rounded-2xl border bg-card p-4 text-left">
                      <p className="text-sm text-muted-foreground mb-2">
                        Order
                      </p>
                      <div className="space-y-2 text-sm">
                        {orderSummary.map((item) => {
                          const isItemSoldOut =
                            streamSettings?.availability &&
                            (((item.name === "Special Chai" || item.name === "Irani Chai") &&
                              !streamSettings.availability.chai) ||
                              (item.name === "Bun" &&
                                !streamSettings.availability.bun));
                          return (
                            <div
                              key={item.name}
                              className="flex items-center justify-between text-muted-foreground"
                            >
                              <span className="flex items-center gap-2">
                                {item.name} × {item.qty}
                                {isItemSoldOut && (
                                  <Badge
                                    variant="destructive"
                                    className="text-xs"
                                  >
                                    Sold out
                                  </Badge>
                                )}
                              </span>
                              <span>{currency.format(item.subtotal)}</span>
                            </div>
                          );
                        })}
                      </div>
                      <div className="mt-3 flex items-center justify-between font-semibold">
                        <span>Total</span>
                        <span>{currency.format(orderTotal)}</span>
                      </div>
                    </div>
                  )}
                </div>
              )
            )}
          </CardContent>
          <CardFooter className="flex flex-col gap-3">
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button
                className="flex-1"
                onClick={() => {
                  // Refresh by reloading the page - stream will reconnect automatically
                  if (typeof window !== "undefined") {
                    window.location.reload();
                  }
                }}
              >
                <RotateCw className="mr-2 h-4 w-4" />
                Refresh
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                onClick={handleExitQueue}
              >
                <LogOut className="mr-2 h-4 w-4" />
                Exit Queue
              </Button>
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Tokens reset nightly.</span>
              <span>Need help? Visit the counter.</span>
            </div>
          </CardFooter>
        </Card>
      </div>
    </main>
  );
}

