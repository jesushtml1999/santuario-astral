"use client";

import { useEffect, useState } from "react";
import {
  chatErrorMessage,
  markChatRead,
  subscribeToChat,
  type LiveChatState,
} from "@/lib/chatService";

export function useLiveChat(roomId: string) {
  const [result, setResult] = useState<{
    roomId: string;
    value: LiveChatState | null;
    error: string;
  } | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    let current: LiveChatState | null = null;
    let acknowledged = "";
    let acknowledging = false;
    const read = () => {
      if (
        !active ||
        !current ||
        acknowledging ||
        document.visibilityState !== "visible"
      )
        return;
      const unread =
        current.session.actor.role === "cliente"
          ? current.session.room.unreadByClient
          : current.session.room.unreadByMaster;
      const last = current.messages.at(-1);
      if (
        !unread ||
        !last ||
        last.pending ||
        (current.session.room.lastMessageId &&
          last.id !== current.session.room.lastMessageId)
      )
        return;
      const token = `${last.id}:${unread}:${current.session.room.lastMessageAt}`;
      if (acknowledged === token) return;
      acknowledged = token;
      acknowledging = true;
      const through = {
        messageId: last.id,
        lastMessageAt: current.session.room.lastMessageAt,
      };
      void markChatRead(roomId, through)
        .then(
          () => {
            acknowledged = token;
          },
          (error: unknown) => {
            if (active)
              setResult((previous) =>
                previous?.roomId === roomId
                  ? { ...previous, error: chatErrorMessage(error) }
                  : previous,
              );
          },
        )
        .finally(() => {
          acknowledging = false;
          if (active) queueMicrotask(read);
        });
    };
    const stop = subscribeToChat(
      roomId,
      (value) => {
        if (!active) return;
        current = value;
        setResult({ roomId, value, error: "" });
        read();
      },
      (error) => {
        current = null;
        if (active)
          setResult({ roomId, value: null, error: chatErrorMessage(error) });
      },
    );
    const focus = () => {
      acknowledged = "";
      read();
    };
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", read);
    return () => {
      active = false;
      stop();
      window.removeEventListener("focus", focus);
      document.removeEventListener("visibilitychange", read);
    };
  }, [roomId, attempt]);
  return {
    data: result?.roomId === roomId ? result.value : null,
    error: result?.roomId === roomId ? result.error : "",
    retry: () => setAttempt((value) => value + 1),
  };
}
