import { NextResponse } from "next/server";
import { db, getTodayKey, firestoreHelpers } from "@/lib/firebase";
import { isChai, isBun, isTiramisu } from "@/lib/item-names";

const {
  doc,
  collection,
  runTransaction,
  setDoc,
  updateDoc,
  getDoc,
  serverTimestamp,
} = firestoreHelpers;

export async function POST(request) {
  try {
    const body = await request.json();
    const name = (body.name || "").trim();
    const items = Array.isArray(body.items) ? body.items : [];

    if (!name) {
      return NextResponse.json(
        { error: "Name is required" },
        { status: 400 }
      );
    }

    const hasQuantity = items.some((item) => item.qty && item.qty > 0);
    if (!hasQuantity) {
      return NextResponse.json(
        { error: "At least one item with quantity is required" },
        { status: 400 }
      );
    }

    const dateKey = getTodayKey();
    const dayRef = doc(db, "queues", dateKey);

    const result = await runTransaction(db, async (tx) => {
      const daySnap = await tx.get(dayRef);
      const current = daySnap.exists()
        ? daySnap.data().nextPosition || 0
        : 0;
      const nextPosition = current + 1;

      tx.set(
        dayRef,
        {
          nextPosition,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      const ticketsCol = collection(dayRef, "tickets");
      const ticketRef = doc(ticketsCol);

      const ticket = {
        name,
        items,
        status: "waiting",
        basePosition: nextPosition,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        dateKey,
      };

      tx.set(ticketRef, ticket);

      return { id: ticketRef.id, position: nextPosition, dateKey, items };
    });

    // Decrement inventory when order is placed
    const settingsRef = doc(db, "config", "app-settings");
    const settingsSnap = await getDoc(settingsRef);
    
    if (settingsSnap.exists()) {
      const currentSettings = settingsSnap.data();
      const currentInventory = currentSettings.inventory || { chai: 0, bun: 0, tiramisu: 0 };
      
      // Calculate inventory changes
      let chaiDecrement = 0;
      let bunDecrement = 0;
      let tiramisuDecrement = 0;
      
      items.forEach((item) => {
        const qty = Number(item.qty) || 0;
        if (isChai(item.name)) {
          chaiDecrement += qty;
        } else if (isBun(item.name)) {
          bunDecrement += qty;
        } else if (isTiramisu(item.name)) {
          tiramisuDecrement += qty;
        }
      });

      // Only decrement if we have enough inventory (prevent negative)
      const newChaiInventory = Math.max(0, (currentInventory.chai || 0) - chaiDecrement);
      const newBunInventory = Math.max(0, (currentInventory.bun || 0) - bunDecrement);
      const newTiramisuInventory = Math.max(0, (currentInventory.tiramisu || 0) - tiramisuDecrement);

      // Update only inventory field (more efficient than updating entire settings doc)
      await updateDoc(settingsRef, {
        "inventory.chai": newChaiInventory,
        "inventory.bun": newBunInventory,
        "inventory.tiramisu": newTiramisuInventory,
        updatedAt: serverTimestamp(),
      });
    }

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    console.error("Error in /api/join:", err);
    return NextResponse.json(
      { error: "Failed to join queue" },
      { status: 500 }
    );
  }
}




