import { isFirebaseConfigured } from "@/lib/firebaseEnvironment";

type EventParameters = Record<string, string | number | boolean | string[]>;
type EventOptions = { eventID: string };
type PixelCommand =
  | ["init", string]
  | ["set", "autoConfig", false, string]
  | [
      "trackSingle",
      string,
      "PageView" | "ViewContent" | "Lead" | "Contact",
      EventParameters,
      EventOptions,
    ]
  | [
      "trackSingleCustom",
      string,
      "StartConsultation" | "FirstMessageSent",
      EventParameters,
      EventOptions,
    ];

export interface MetaPixelFunction {
  (...args: PixelCommand): void;
  callMethod?: (...args: PixelCommand) => void;
  queue: PixelCommand[];
  loaded: boolean;
  version: string;
  push?: MetaPixelFunction;
  disablePushState?: boolean;
}
declare global {
  interface Window {
    fbq?: MetaPixelFunction;
    _fbq?: MetaPixelFunction;
  }
}

let initializedId: string | null = null;
let blocked = false;
let currentRoute = "";
const routeEvents = new Set<string>();
const firstMessages = new Set<string>();
const conversationRefs = new Map<string, string>();
const consultations = new Set<string>();

export function getMetaPixelId(): string | null {
  const id = process.env.NEXT_PUBLIC_META_PIXEL_ID?.trim();
  return id && /^\d{1,30}$/.test(id) ? id : null;
}

/** A blocked or absent advertising SDK must never interrupt a consultation. */
export function initializeMetaPixel(): boolean {
  if (typeof window === "undefined" || blocked) return false;
  const id = getMetaPixelId();
  if (!id) return false;
  try {
    if (!window.fbq) {
      const pixel: MetaPixelFunction = (...args) => {
        if (pixel.callMethod) pixel.callMethod(...args);
        else if (pixel.queue.length < 100) pixel.queue.push(args);
      };
      pixel.queue = [];
      pixel.loaded = true;
      pixel.version = "2.0";
      pixel.push = pixel;
      window.fbq = pixel;
      window._fbq ??= pixel;
    }
    // Next.js owns SPA page views. Prevent Meta's automatic history tracking
    // from sending a second PageView for the same navigation.
    window.fbq.disablePushState = true;
    if (initializedId !== id) {
      // Explicit events only; do not enable automatic form scraping or advanced matching.
      window.fbq("set", "autoConfig", false, id);
      window.fbq("init", id);
      initializedId = id;
    }
    return true;
  } catch {
    blocked = true;
    return false;
  }
}

export function disableMetaPixel(): void {
  blocked = true;
  if (typeof window !== "undefined" && window.fbq?.queue)
    window.fbq.queue.length = 0;
}

function publicRoute(): boolean {
  if (typeof window === "undefined") return false;
  return !/^\/(?:admin(?:\/|$)|maestro\/(?:login|panel)(?:\/|$))/.test(
    window.location.pathname,
  );
}

function eventId(): string {
  return window.crypto.randomUUID();
}

function send(
  name: "PageView" | "ViewContent" | "Lead" | "Contact" | "StartConsultation" | "FirstMessageSent",
  parameters: EventParameters,
  id?: string,
): boolean {
  if (!publicRoute() || !initializeMetaPixel()) return false;
  try {
    const pixelId = getMetaPixelId()!;
    const options = { eventID: id ?? eventId() };
    if (name === "PageView" || name === "ViewContent" || name === "Lead" || name === "Contact")
      window.fbq!("trackSingle", pixelId, name, parameters, options);
    else window.fbq!("trackSingleCustom", pixelId, name, parameters, options);
    return true;
  } catch {
    return false;
  }
}

function oncePerRoute(key: string, sendEvent: () => boolean): void {
  if (typeof window === "undefined") return;
  const route = window.location.pathname + window.location.search;
  if (route !== currentRoute) {
    currentRoute = route;
    routeEvents.clear();
  }
  if (!routeEvents.has(key) && sendEvent()) routeEvents.add(key);
}

function demoMode(masterId: string): boolean {
  return !isFirebaseConfigured() || /^(?:demo-|local-)/.test(masterId);
}

/** Raw room/guest IDs are never added to our custom event parameters. */
function conversationRef(roomId: string): string {
  const key = `santuario-astral:pixel:conversation:${roomId}`;
  let reference = conversationRefs.get(roomId);
  if (!reference) {
    try {
      reference = window.localStorage.getItem(key) ?? undefined;
    } catch {}
    if (!reference || !/^[0-9a-f-]{36}$/i.test(reference))
      reference = eventId();
    conversationRefs.set(roomId, reference);
    try {
      window.localStorage.setItem(key, reference);
    } catch {}
  }
  return reference;
}

export function trackPageView(): void {
  oncePerRoute("PageView", () => send("PageView", {}));
}

export function trackViewMaster(
  masterId: string,
  masterName: string,
  specialty: string,
): void {
  oncePerRoute(`ViewContent:${masterId}`, () =>
    send("ViewContent", {
      content_ids: [masterId],
      content_name: masterName.slice(0, 100),
      content_category: specialty.slice(0, 80),
      content_type: "product",
      demo_mode: demoMode(masterId),
    }),
  );
}

/** An intentional reveal, never a restored card or an inferred personal belief. */
export function trackRevealDailyCard(): void {
  oncePerRoute("ViewContent:daily-card", () => send("ViewContent", {
    content_ids: ["daily-card"],
    content_name: "Carta del día",
    content_category: "daily_card",
  }));
}

/** Invoke after chat authorization succeeds, only for the client actor. */
export function trackOpenChat(roomId: string, masterId: string): void {
  oncePerRoute(`Contact:${roomId}`, () => send("Contact", {
    master_id: masterId,
    demo_mode: demoMode(masterId),
  }));
}

export function trackStartConsultation(
  masterId: string,
  masterName: string,
  roomId: string,
  requestId?: string,
): void {
  if (!publicRoute() || !getMetaPixelId()) return;
  try {
    if (requestId && consultations.has(requestId)) return;
    const parameters = {
      master_id: masterId,
      demo_mode: demoMode(masterId),
    };
    const sent = send("Lead", parameters, requestId ? `lead-${requestId}` : undefined);
    send("StartConsultation", {
      ...parameters,
      master_name: masterName.slice(0, 100),
      conversation_ref: conversationRef(roomId),
    }, requestId ? `start-consultation-${requestId}` : undefined);
    if (sent && requestId) consultations.add(requestId);
  } catch {
    /* Analytics must not affect successful form submission. */
  }
}

/** Call only after the first successful client send inside the chat (not the intake). */
export function trackFirstMessageSent(roomId: string, masterId: string): void {
  if (!publicRoute() || !getMetaPixelId()) return;
  try {
    const key = `santuario-astral:pixel:first-message:${roomId}`;
    if (firstMessages.has(roomId)) return;
    try {
      if (window.localStorage.getItem(key) === "1") return;
    } catch {}
    const reference = conversationRef(roomId);
    if (
      send(
        "FirstMessageSent",
        {
          master_id: masterId,
          conversation_ref: reference,
          demo_mode: demoMode(masterId),
        },
        `first-message-${reference}`,
      )
    ) {
      firstMessages.add(roomId);
      try {
        window.localStorage.setItem(key, "1");
      } catch {}
    }
  } catch {
    /* Blocked storage or advertising must never block messaging. */
  }
}
