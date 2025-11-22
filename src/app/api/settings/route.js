import { NextResponse } from "next/server";
import { db, firestoreHelpers } from "@/lib/firebase";

const { doc, getDoc, setDoc, serverTimestamp } = firestoreHelpers;

const SETTINGS_DOC = doc(db, "config", "app-settings");

const DEFAULT_SETTINGS = {
  serviceStart: "06:00",
  serviceEnd: "23:00",
  closedMessage: "Queue is currently closed. Please check back during service hours.",
  inventory: {
    chai: 0,
    bun: 0,
    tiramisu: 0,
  },
  buffer: {
    chai: 10,
    bun: 10,
    tiramisu: 10,
  },
};

export async function GET() {
  try {
    const snap = await getDoc(SETTINGS_DOC);
    if (!snap.exists()) {
      return NextResponse.json(DEFAULT_SETTINGS, { status: 200 });
    }
    const data = snap.data();
    // Properly merge nested objects (inventory and buffer) to ensure all fields are present
    const mergedData = {
      ...DEFAULT_SETTINGS,
      ...data,
      inventory: {
        ...DEFAULT_SETTINGS.inventory,
        ...(data.inventory || {}),
      },
      buffer: {
        ...DEFAULT_SETTINGS.buffer,
        ...(data.buffer || {}),
      },
    };
    return NextResponse.json(mergedData, { status: 200 });
  } catch (err) {
    console.error("Error in /api/settings GET:", err);
    return NextResponse.json({ error: "Failed to load settings" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const serviceStart = body.serviceStart || DEFAULT_SETTINGS.serviceStart;
    const serviceEnd = body.serviceEnd || DEFAULT_SETTINGS.serviceEnd;
    const closedMessage = body.closedMessage || DEFAULT_SETTINGS.closedMessage;
    const inventory = {
      chai: Number(body.inventory?.chai) ?? DEFAULT_SETTINGS.inventory.chai,
      bun: Number(body.inventory?.bun) ?? DEFAULT_SETTINGS.inventory.bun,
      tiramisu: Number(body.inventory?.tiramisu) ?? DEFAULT_SETTINGS.inventory.tiramisu,
    };
    const buffer = {
      chai: Number(body.buffer?.chai) ?? DEFAULT_SETTINGS.buffer.chai,
      bun: Number(body.buffer?.bun) ?? DEFAULT_SETTINGS.buffer.bun,
      tiramisu: Number(body.buffer?.tiramisu) ?? DEFAULT_SETTINGS.buffer.tiramisu,
    };

    await setDoc(
      SETTINGS_DOC,
      {
        serviceStart,
        serviceEnd,
        closedMessage,
        inventory,
        buffer,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    return NextResponse.json(
      { serviceStart, serviceEnd, closedMessage, inventory, buffer },
      { status: 200 }
    );
  } catch (err) {
    console.error("Error in /api/settings POST:", err);
    return NextResponse.json({ error: "Failed to save settings" }, { status: 500 });
  }
}


