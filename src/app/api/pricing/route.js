import { NextResponse } from "next/server";
import { db, firestoreHelpers } from "@/lib/firebase";

const { doc, getDoc, setDoc } = firestoreHelpers;
const PRICING_DOC = doc(db, "config", "pricing");

export async function GET() {
  try {
    const snap = await getDoc(PRICING_DOC);
    if (!snap.exists()) {
      return NextResponse.json(
        { chaiPrice: 0, bunPrice: 0, tiramisuPrice: 0 },
        { status: 200 }
      );
    }
    return NextResponse.json(snap.data(), { status: 200 });
  } catch (err) {
    console.error("Error in /api/pricing GET:", err);
    return NextResponse.json(
      { error: "Failed to load pricing" },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const chaiPrice = Number(body.chaiPrice);
    const bunPrice = Number(body.bunPrice);
    const tiramisuPrice = Number(body.tiramisuPrice);

    if (Number.isNaN(chaiPrice) || Number.isNaN(bunPrice) || Number.isNaN(tiramisuPrice)) {
      return NextResponse.json(
        { error: "Prices must be numbers" },
        { status: 400 }
      );
    }

    await setDoc(PRICING_DOC, { chaiPrice, bunPrice, tiramisuPrice }, { merge: true });
    return NextResponse.json({ chaiPrice, bunPrice, tiramisuPrice }, { status: 200 });
  } catch (err) {
    console.error("Error in /api/pricing POST:", err);
    return NextResponse.json(
      { error: "Failed to save pricing" },
      { status: 500 }
    );
  }
}




