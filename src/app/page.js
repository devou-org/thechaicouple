import Image from "next/image";
import Link from "next/link";
import { ArrowRight, PartyPopper, Coffee, Sandwich } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function Home() {

  return (
    <main className="min-h-screen bg-muted/30 py-10">
      <div className="container max-w-4xl space-y-10 text-center">
        <div className="space-y-4">
          <div className="mx-auto h-32 w-32 overflow-hidden rounded-full border-4 border-white shadow">
            <Image
              src="/thechaicouple.jpg"
              alt="Chai Bun brand"
              width={200}
              height={200}
              className="h-full w-full object-cover"
              priority
            />
          </div>
          <div className="flex items-center justify-center gap-2">
            <Badge variant="secondary" className="text-sm">
              Chai Bun Queue
            </Badge>
          
          </div>
         
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg" className="px-8">
              
            </Button>
          </div>
          <p className="text-sm uppercase tracking-widest text-muted-foreground">
            Fresh Irani chai & toasted bun maska served all day
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card className="text-left">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-2xl font-semibold">Special Chai</CardTitle>
              <Coffee className="h-8 w-8 text-muted-foreground" />
            </CardHeader>
            <CardContent className="space-y-3">
              <CardDescription>Bold, creamy and lightly spiced—brewed in copper kettles.</CardDescription>
              <div className="flex items-center justify-between">
                <Badge variant="secondary">Available</Badge>
                <span className="text-lg font-semibold">₹10</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Sip it hot at the counter or carry it back to your table—your token tells you exactly when it
                is ready.
              </p>
            </CardContent>
          </Card>
          <Card className="text-left">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-2xl font-semibold">Bun Maska</CardTitle>
              <Sandwich className="h-8 w-8 text-muted-foreground" />
            </CardHeader>
            <CardContent className="space-y-3">
              <CardDescription>Soft pao toasted golden with butter—perfect with every sip.</CardDescription>
              <div className="flex items-center justify-between">
                <Badge variant="secondary">Available</Badge>
                <span className="text-lg font-semibold">₹10</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Add as many buns as you like from the queue form. We keep them warm until your status flips to
                ready.
              </p>
            </CardContent>
          </Card>
        </div>

        <Card className="text-left">
          <CardHeader>
            <CardTitle>Why queue with The Chai Couple?</CardTitle>
            <CardDescription>
              A simple ritual—scan, tap, sip. Less waiting at the counter, more time enjoying chai with friends.
            </CardDescription>
          </CardHeader>
     
        </Card>
      </div>
      <footer className="mt-12 text-center text-sm text-muted-foreground">
  Developed by{" "}
  <a href="https://devuo.in" target="_blank" rel="noreferrer" className="underline">
    devou
  </a>
</footer>
    </main>
  );
}
