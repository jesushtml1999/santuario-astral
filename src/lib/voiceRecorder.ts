export const RECORDING_LIMIT_SECONDS = 120;
export interface VoiceRecordingState {
  status: "idle" | "requesting" | "recording" | "preview";
  seconds: number;
  blob: Blob | null;
  previewUrl: string | null;
  error: string;
}
export const EMPTY_RECORDING: VoiceRecordingState = {
  status: "idle",
  seconds: 0,
  blob: null,
  previewUrl: null,
  error: "",
};

/** Owns browser resources independently of React route caching and Strict Mode. */
export class VoiceRecorderController {
  private state = EMPTY_RECORDING;
  private listeners = new Set<() => void>();
  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private interval: ReturnType<typeof setInterval> | null = null;
  private generation = 0;

  getSnapshot = (): VoiceRecordingState => this.state;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private update(patch: Partial<VoiceRecordingState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }

  private release() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    if (this.recorder) {
      this.recorder.onstop = null;
      this.recorder.ondataavailable = null;
      this.recorder.onerror = null;
      try {
        if (this.recorder.state !== "inactive") this.recorder.stop();
      } catch {
        // A native stop race must never prevent releasing microphone tracks below.
      }
      this.recorder = null;
    }
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    if (this.state.previewUrl) URL.revokeObjectURL(this.state.previewUrl);
  }

  cancel = () => {
    this.generation++;
    this.release();
    this.update(EMPTY_RECORDING);
  };

  start = async () => {
    if (this.state.status !== "idle") return;
    const attempt = ++this.generation;
    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      this.update({
        error:
          "Este navegador no permite grabar audio. Puedes escribir tu mensaje o probar con un navegador compatible.",
      });
      return;
    }
    this.update({ status: "requesting", error: "" });
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (attempt !== this.generation) {
        media.getTracks().forEach((track) => track.stop());
        return;
      }
      this.stream = media;
      const mime = [
        "audio/webm;codecs=opus",
        "audio/ogg;codecs=opus",
        "audio/mp4",
      ].find((value) => MediaRecorder.isTypeSupported(value));
      const instance = mime
        ? new MediaRecorder(media, { mimeType: mime })
        : new MediaRecorder(media);
      this.recorder = instance;
      const chunks: Blob[] = [];
      let byteCount = 0;
      instance.ondataavailable = (event: BlobEvent) => {
        if (attempt !== this.generation || !event.data.size) return;
        chunks.push(event.data);
        byteCount += event.data.size;
        if (byteCount >= 2 * 1024 * 1024 && instance.state === "recording")
          instance.stop();
      };
      instance.onstop = () => {
        if (attempt !== this.generation) return;
        if (this.interval) {
          clearInterval(this.interval);
          this.interval = null;
        }
        media.getTracks().forEach((track) => track.stop());
        this.stream = null;
        this.recorder = null;
        const blob = new Blob(chunks, {
          type: instance.mimeType || chunks[0]?.type || "audio/webm",
        });
        if (!blob.size) {
          this.update({
            status: "idle",
            error: "La grabación no contiene audio. Inténtalo de nuevo.",
          });
          return;
        }
        this.update({
          blob,
          previewUrl: URL.createObjectURL(blob),
          status: "preview",
        });
      };
      instance.onerror = () => {
        if (attempt !== this.generation) return;
        this.cancel();
        this.update({
          error: "La grabación se interrumpió. Puedes intentarlo de nuevo.",
        });
      };
      instance.start(250);
      this.update({ status: "recording", seconds: 0 });
      const started = performance.now();
      this.interval = setInterval(() => {
        const elapsed = Math.min(
          Math.floor((performance.now() - started) / 1000),
          RECORDING_LIMIT_SECONDS,
        );
        if (elapsed !== this.state.seconds) this.update({ seconds: elapsed });
        if (
          elapsed >= RECORDING_LIMIT_SECONDS &&
          instance.state === "recording"
        )
          instance.stop();
      }, 250);
    } catch (cause: unknown) {
      if (attempt !== this.generation) return;
      this.release();
      const denied =
        cause instanceof DOMException &&
        (cause.name === "NotAllowedError" || cause.name === "SecurityError");
      this.update({
        status: "idle",
        error: denied
          ? "Permite el micrófono en tu navegador para grabar una nota de voz. También puedes continuar escribiendo."
          : "No pudimos acceder al micrófono. Comprueba que esté conectado y disponible.",
      });
    }
  };

  stop = () => {
    if (this.recorder?.state === "recording") this.recorder.stop();
  };
}
