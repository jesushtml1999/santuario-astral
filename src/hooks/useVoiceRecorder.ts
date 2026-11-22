"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { EMPTY_RECORDING, VoiceRecorderController } from "@/lib/voiceRecorder";

export function useVoiceRecorder() {
  const [controller] = useState(() => new VoiceRecorderController());
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    () => EMPTY_RECORDING,
  );
  useEffect(() => () => controller.cancel(), [controller]);
  return {
    ...state,
    start: controller.start,
    stop: controller.stop,
    cancel: controller.cancel,
  };
}
