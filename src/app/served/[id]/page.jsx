"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Coffee, CheckCircle2 } from "lucide-react";

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
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

const currency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 0,
});

export default function ServedPage() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pricing, setPricing] = useState({ chaiPrice: 0, bunPrice: 0, tiramisuPrice: 0 });

  useEffect(() => {
    if (!id) return;

    // Play sound effect once when page loads
    const audio = new Audio("/Order-up-bell-sound-effect.mp3");
    audio.play().catch((err) => {
      // Ignore autoplay errors (browser may block autoplay)
      console.log("Audio play failed:", err);
    });

    // Fetch ticket data
    async function loadTicket() {
      try {
        const dateKey = getTodayKey();
        const res = await fetch(`/api/position?id=${encodeURIComponent(id)}&date=${encodeURIComponent(dateKey)}`);
        if (!res.ok) {
          const json = await res.json();
          setError(json.error || "Failed to load order");
          setLoading(false);
          return;
        }
        const ticketData = await res.json();
        setData(ticketData);
        setLoading(false);
      } catch (err) {
        setError("Failed to load order");
        setLoading(false);
      }
    }

    loadTicket();
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

  if (loading) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-emerald-50 via-white to-amber-50 py-10">
        <div className="container max-w-3xl">
          <Card className="border-none shadow-2xl">
            <CardHeader className="space-y-4 text-center">
              <Skeleton className="mx-auto h-28 w-28 rounded-full" />
              <Skeleton className="h-8 w-64 mx-auto" />
              <Skeleton className="h-4 w-96 mx-auto" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-32 w-full" />
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-emerald-50 via-white to-amber-50 py-10">
        <div className="container max-w-3xl">
          <Card className="border-none shadow-2xl">
            <CardHeader className="space-y-4 text-center">
              <CardTitle className="text-2xl">Order Not Found</CardTitle>
              <CardDescription>{error || "Unable to load order details"}</CardDescription>
            </CardHeader>
            <CardFooter className="flex justify-center">
              <Button asChild variant="outline">
                <Link href="/queue">Back to Queue</Link>
              </Button>
            </CardFooter>
          </Card>
        </div>
      </main>
    );
  }

  const tokenNumber = data?.basePosition ?? null;

  return (
    <main className="min-h-screen bg-gradient-to-b from-emerald-50 via-white to-amber-50 py-10">
      <div className="container max-w-3xl">
        <Card className="border-none shadow-2xl">
          <CardHeader className="space-y-4 text-center">
            <div className="mx-auto h-28 w-28 overflow-hidden rounded-full border-4 border-white shadow">
              <Image
                src="/thechaicouple.jpg"
                alt="Happy chai lovers"
                width={160}
                height={160}
                className="h-full w-full object-cover"
                priority
              />
            </div>
            <div className="flex items-center justify-center gap-3">
              <Badge className="bg-emerald-100 text-emerald-900">
                <CheckCircle2 className="mr-1 h-3 w-3" />
                Order Complete
              </Badge>
              {tokenNumber && (
                <Badge variant="outline" className="bg-white/80">
                  Token #{tokenNumber}
                </Badge>
              )}
            </div>
            <CardTitle className="text-4xl font-semibold text-emerald-900">
              Thank you! Your food is ready.
            </CardTitle>
            <CardDescription className="text-base text-muted-foreground">
              Show this screen to the staff, collect your order, and enjoy.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {data.name && (
              <div className="text-center">
                <p className="text-sm text-muted-foreground">Order for</p>
                <p className="text-xl font-semibold">{data.name}</p>
              </div>
            )}

            {orderSummary.length > 0 && (
              <div className="rounded-2xl border bg-muted/40 p-4">
                <div className="flex items-center justify-between text-sm text-muted-foreground mb-3">
                  <span>Order Summary</span>
                  <Badge variant="secondary">{orderSummary.length} items</Badge>
                </div>
                <ul className="space-y-2">
                  {orderSummary.map((item, index) => (
                    <li
                      key={index}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="text-muted-foreground">
                        {item.name} × {item.qty}
                      </span>
                      <span className="font-medium">
                        {currency.format(item.subtotal)}
                      </span>
                    </li>
                  ))}
                </ul>
                {orderTotal > 0 && (
                  <div className="mt-4 pt-4 border-t flex items-center justify-between font-semibold">
                    <span>Total</span>
                    <span className="text-lg">{currency.format(orderTotal)}</span>
                  </div>
                )}
              </div>
            )}

            <div className="text-center text-muted-foreground text-sm">
              We&apos;ve cleared your token from the queue. If you&apos;d like another chai or bun,
              feel free to rejoin the queue at service hours.
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Button
              asChild
              size="lg"
              className="bg-emerald-500 text-white hover:bg-emerald-500/90"
            >
              <Link href="/queue">
                <Coffee className="mr-2 h-4 w-4" />
                Order another round
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/">Back to home</Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    </main>
  );
}

