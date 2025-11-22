import { NextResponse } from "next/server";
import { db, firestoreHelpers } from "@/lib/firebase";
import { ITEM_NAMES, isChai, isBun, isTiramisu } from "@/lib/item-names";

const { doc, collection, getDoc, setDoc, serverTimestamp } = firestoreHelpers;

export async function PATCH(request) {
  try {
    const body = await request.json();
    const id = body.id;
    const dateKey = body.dateKey;
    const status = body.status;

    if (!id || !dateKey || !status) {
      return NextResponse.json(
        { error: "id, dateKey and status are required" },
        { status: 400 }
      );
    }

    if (status !== "ready") {
      return NextResponse.json(
        { error: "Only ready status updates are supported" },
        { status: 400 }
      );
    }

    const dayRef = doc(db, "queues", dateKey);
    const ticketRef = doc(collection(dayRef, "tickets"), id);
    const ticketSnap = await getDoc(ticketRef);

    if (!ticketSnap.exists()) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }

    const ticketData = ticketSnap.data();
    const originalItems = Array.isArray(ticketData.items) ? ticketData.items : [];

    const pricingRef = doc(db, "config", "pricing");
    const pricingSnap = await getDoc(pricingRef);
    const pricingData = pricingSnap.exists()
      ? pricingSnap.data()
      : { chaiPrice: 0, bunPrice: 0, tiramisuPrice: 0 };
    const chaiPrice = Number(pricingData.chaiPrice) || 0;
    const bunPrice = Number(pricingData.bunPrice) || 0;
    const tiramisuPrice = Number(pricingData.tiramisuPrice) || 0;

    const total = originalItems.reduce((sum, item) => {
      const qty = Number(item.qty) || 0;
      let unitPrice = bunPrice;
      if (isChai(item.name)) {
        unitPrice = chaiPrice;
      } else if (isTiramisu(item.name)) {
        unitPrice = tiramisuPrice;
      }
      return sum + unitPrice * qty;
    }, 0);

    // Update ticket status
    // Note: Inventory is decremented when order is placed (in /api/join), not here
    await setDoc(
      ticketRef,
      {
        status,
        updatedAt: serverTimestamp(),
        total,
        paid: ticketData.paid ?? false,
      },
      { merge: true }
    );

    return NextResponse.json({ id, dateKey, status }, { status: 200 });
  } catch (err) {
    console.error("Error in /api/ready PATCH:", err);
    return NextResponse.json(
      { error: "Failed to update status" },
      { status: 500 }
    );
  }
}
