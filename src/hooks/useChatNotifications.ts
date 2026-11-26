"use client";
import { useSyncExternalStore } from "react";
import { getNotifications, getServerNotifications, subscribeNotifications } from "@/lib/chatNotifications";

export function useChatNotifications() {
  return useSyncExternalStore(subscribeNotifications, getNotifications, getServerNotifications);
}
