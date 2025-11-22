import { NextResponse } from "next/server";
import { db, firestoreHelpers } from "@/lib/firebase";
import { ITEM_NAMES, isChai, isBun, isTiramisu } from "@/lib/item-names";

const { doc, collection, deleteDoc, getDoc, setDoc, updateDoc, serverTimestamp } = firestoreHelpers;

export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const dateKey = searchParams.get("date");
    const id = searchParams.get("id");

    if (!dateKey || !id) {
      return NextResponse.json(
        { error: "date and id are required" },
        { status: 400 }
      );
    }

    const dayRef = doc(db, "queues", dateKey);
    const ticketRef = doc(collection(dayRef, "tickets"), id);
    
    // Get ticket data before deleting to restore inventory
    const ticketSnap = await getDoc(ticketRef);
    if (!ticketSnap.exists()) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }

    const ticketData = ticketSnap.data();
    const items = Array.isArray(ticketData.items) ? ticketData.items : [];
    
    // Only restore inventory if ticket status is "waiting" (not yet served)
    // If status is "ready", inventory was already consumed
    const shouldRestoreInventory = ticketData.status === "waiting";
    
    // Delete the ticket
    await deleteDoc(ticketRef);

    // Restore inventory if ticket was waiting
    if (shouldRestoreInventory) {
      const settingsRef = doc(db, "config", "app-settings");
      const settingsSnap = await getDoc(settingsRef);
      
      if (settingsSnap.exists()) {
        const currentSettings = settingsSnap.data();
        const currentInventory = currentSettings.inventory || { chai: 0, bun: 0, tiramisu: 0 };
        
        // Calculate inventory to restore
        let chaiRestore = 0;
        let bunRestore = 0;
        let tiramisuRestore = 0;
        
        items.forEach((item) => {
          const qty = Number(item.qty) || 0;
          if (isChai(item.name)) {
            chaiRestore += qty;
          } else if (isBun(item.name)) {
            bunRestore += qty;
          } else if (isTiramisu(item.name)) {
            tiramisuRestore += qty;
          }
        });

        // Restore inventory
        const newChaiInventory = (currentInventory.chai || 0) + chaiRestore;
        const newBunInventory = (currentInventory.bun || 0) + bunRestore;
        const newTiramisuInventory = (currentInventory.tiramisu || 0) + tiramisuRestore;

        // Update only inventory field (more efficient than updating entire settings doc)
        await updateDoc(settingsRef, {
          "inventory.chai": newChaiInventory,
          "inventory.bun": newBunInventory,
          "inventory.tiramisu": newTiramisuInventory,
          updatedAt: serverTimestamp(),
        });
      }
    }

    return NextResponse.json({ id, dateKey, deleted: true }, { status: 200 });
  } catch (err) {
    console.error("Error in /api/ticket DELETE:", err);
    return NextResponse.json(
      { error: "Failed to delete ticket" },
      { status: 500 }
    );
  }
}

export async function PATCH(request) {
  try {
    const body = await request.json();
    const id = body.id;
    const dateKey = body.dateKey;
    const items = body.items;

    if (!id || !dateKey || !Array.isArray(items)) {
      return NextResponse.json(
        { error: "id, dateKey and items array are required" },
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
    
    // Only allow editing waiting tickets
    if (ticketData.status !== "waiting") {
      return NextResponse.json(
        { error: "Can only edit waiting tickets" },
        { status: 400 }
      );
    }

    const oldItems = Array.isArray(ticketData.items) ? ticketData.items : [];
    
    // Get current inventory
    const settingsRef = doc(db, "config", "app-settings");
    const settingsSnap = await getDoc(settingsRef);
    
    if (!settingsSnap.exists()) {
      return NextResponse.json({ error: "Settings not found" }, { status: 404 });
    }

    const currentSettings = settingsSnap.data();
    const currentInventory = currentSettings.inventory || { chai: 0, bun: 0, tiramisu: 0 };
    
    // Calculate old quantities (to restore)
    let oldChaiQty = 0;
    let oldBunQty = 0;
    let oldTiramisuQty = 0;
    oldItems.forEach((item) => {
      const qty = Number(item.qty) || 0;
      if (isChai(item.name)) {
        oldChaiQty += qty;
      } else if (isBun(item.name)) {
        oldBunQty += qty;
      } else if (isTiramisu(item.name)) {
        oldTiramisuQty += qty;
      }
    });

    // Calculate new quantities (to decrement)
    let newChaiQty = 0;
    let newBunQty = 0;
    let newTiramisuQty = 0;
    items.forEach((item) => {
      const qty = Number(item.qty) || 0;
      if (isChai(item.name)) {
        newChaiQty += qty;
      } else if (isBun(item.name)) {
        newBunQty += qty;
      } else if (isTiramisu(item.name)) {
        newTiramisuQty += qty;
      }
    });

    // Calculate net change
    const chaiChange = newChaiQty - oldChaiQty;
    const bunChange = newBunQty - oldBunQty;
    const tiramisuChange = newTiramisuQty - oldTiramisuQty;

    // Check if new quantities exceed available inventory
    const availableChai = (currentInventory.chai || 0) - chaiChange;
    const availableBun = (currentInventory.bun || 0) - bunChange;
    const availableTiramisu = (currentInventory.tiramisu || 0) - tiramisuChange;

    if (availableChai < 0) {
      return NextResponse.json(
        { 
          error: "Stock exceeded", 
          message: `Insufficient Chai inventory. Available: ${currentInventory.chai}, Requested: ${newChaiQty}, Already reserved: ${oldChaiQty}` 
        },
        { status: 400 }
      );
    }

    if (availableBun < 0) {
      return NextResponse.json(
        { 
          error: "Stock exceeded", 
          message: `Insufficient Bun inventory. Available: ${currentInventory.bun}, Requested: ${newBunQty}, Already reserved: ${oldBunQty}` 
        },
        { status: 400 }
      );
    }

    if (availableTiramisu < 0) {
      return NextResponse.json(
        { 
          error: "Stock exceeded", 
          message: `Insufficient Tiramisu inventory. Available: ${currentInventory.tiramisu}, Requested: ${newTiramisuQty}, Already reserved: ${oldTiramisuQty}` 
        },
        { status: 400 }
      );
    }

    // Update ticket with new items
    await updateDoc(ticketRef, {
      items,
      updatedAt: serverTimestamp(),
    });

    // Update inventory (restore old, decrement new) - only update inventory field
    await updateDoc(settingsRef, {
      "inventory.chai": availableChai,
      "inventory.bun": availableBun,
      "inventory.tiramisu": availableTiramisu,
      updatedAt: serverTimestamp(),
    });

    return NextResponse.json({ id, dateKey, items }, { status: 200 });
  } catch (err) {
    console.error("Error in /api/ticket PATCH:", err);
    return NextResponse.json(
      { error: "Failed to update ticket" },
      { status: 500 }
    );
  }
}


