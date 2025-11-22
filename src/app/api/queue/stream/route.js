import { NextResponse } from "next/server";
import { db, getTodayKey, firestoreHelpers } from "@/lib/firebase";

const { doc, collection, query, orderBy, onSnapshot, getDoc } = firestoreHelpers;

const DEFAULT_SETTINGS = {
  serviceStart: "06:00",
  serviceEnd: "23:00",
  closedMessage: "Queue is currently closed. Please check back during service hours.",
  availability: {
    chai: true,
    bun: true,
  },
};

const SETTINGS_DOC = doc(db, "config", "app-settings");

// Singleton: One listener per date, shared across all clients
// Map<dateKey, { clients, unsubscribeTickets, unsubscribeSettings, currentTickets, settings }>
const listeners = new Map();

// Initialize listeners for a specific date
function initializeListeners(dateKey) {
  if (listeners.has(dateKey)) {
    return listeners.get(dateKey);
  }

  const ticketsQuery = query(
    collection(doc(db, "queues", dateKey), "tickets"),
    orderBy("basePosition", "asc")
  );

  let currentTickets = [];
  let settings = DEFAULT_SETTINGS;

  // Load initial settings
  getDoc(SETTINGS_DOC)
    .then((snap) => {
      if (snap.exists()) {
        settings = { ...DEFAULT_SETTINGS, ...snap.data() };
        const listenerState = listeners.get(dateKey);
        if (listenerState) {
          listenerState.settings = settings;
          broadcastToClients(dateKey, currentTickets, settings);
        }
      }
    })
    .catch(() => {
      // use defaults
    });

  const unsubscribeTickets = onSnapshot(
    ticketsQuery,
    (snapshot) => {
      currentTickets = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      const listenerState = listeners.get(dateKey);
      if (listenerState) {
        listenerState.currentTickets = currentTickets;
        broadcastToClients(dateKey, currentTickets, listenerState.settings);
      }
    },
    (error) => {
      broadcastErrorToClients(dateKey, error.message);
    }
  );

  const unsubscribeSettings = onSnapshot(
    SETTINGS_DOC,
    (snapshot) => {
      if (snapshot.exists()) {
        const listenerState = listeners.get(dateKey);
        if (listenerState) {
          settings = { ...DEFAULT_SETTINGS, ...snapshot.data() };
          listenerState.settings = settings;
          broadcastToClients(dateKey, listenerState.currentTickets, settings);
        }
      }
    },
    () => {
      // ignore settings errors
    }
  );

  const listenerState = {
    clients: new Set(),
    unsubscribeTickets,
    unsubscribeSettings,
    currentTickets,
    settings,
  };

  listeners.set(dateKey, listenerState);
  return listenerState;
}

// Broadcast updates to all clients for a date
function broadcastToClients(dateKey, tickets, settings) {
  const listenerState = listeners.get(dateKey);
  if (!listenerState) return;

  const message = JSON.stringify({
    dateKey,
    tickets,
    settings,
  });
  const encoded = `data: ${message}\n\n`;
  const encoder = new TextEncoder();

  // Send to all clients, remove dead connections
  const deadClients = [];
  listenerState.clients.forEach((controller) => {
    try {
      controller.enqueue(encoder.encode(encoded));
    } catch (err) {
      // Client connection is dead
      deadClients.push(controller);
    }
  });

  // Clean up dead clients
  deadClients.forEach((controller) => {
    listenerState.clients.delete(controller);
  });

  // If no clients left, clean up listeners for this date
  if (listenerState.clients.size === 0) {
    listenerState.unsubscribeTickets();
    listenerState.unsubscribeSettings();
    listeners.delete(dateKey);
  }
}

// Broadcast errors to all clients
function broadcastErrorToClients(dateKey, errorMessage) {
  const listenerState = listeners.get(dateKey);
  if (!listenerState) return;

  const message = JSON.stringify({ message: errorMessage });
  const encoded = `event: error\ndata: ${message}\n\n`;
  const encoder = new TextEncoder();

  const deadClients = [];
  listenerState.clients.forEach((controller) => {
    try {
      controller.enqueue(encoder.encode(encoded));
    } catch (err) {
      deadClients.push(controller);
    }
  });

  deadClients.forEach((controller) => {
    listenerState.clients.delete(controller);
  });

  if (listenerState.clients.size === 0) {
    listenerState.unsubscribeTickets();
    listenerState.unsubscribeSettings();
    listeners.delete(dateKey);
  }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const requestedDate = searchParams.get("date") || getTodayKey();

  // Get or create listeners for this date
  const listenerState = initializeListeners(requestedDate);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      // Register this client
      listenerState.clients.add(controller);

      // Send initial data immediately
      try {
        const initialMessage = JSON.stringify({
          dateKey: requestedDate,
          tickets: listenerState.currentTickets,
          settings: listenerState.settings,
        });
        controller.enqueue(
          encoder.encode(`data: ${initialMessage}\n\n`)
        );
      } catch (err) {
        // Client already closed
        listenerState.clients.delete(controller);
      }

      // Cleanup when client disconnects
      const cleanup = () => {
        listenerState.clients.delete(controller);
        
        // If no clients left, clean up listeners
        if (listenerState.clients.size === 0) {
          listenerState.unsubscribeTickets();
          listenerState.unsubscribeSettings();
          listeners.delete(requestedDate);
        }
        
        try {
          controller.close();
        } catch {
          // Already closed
        }
      };

      request.signal.addEventListener("abort", cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}


