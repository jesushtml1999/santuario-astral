"use client";
import CountryFlag from "@/components/CountryFlag";
import { trackFirstMessageSent } from "@/lib/metaPixel";

import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";
import {
  ArrowLeft,
  Camera,
  ChevronDown,
  LoaderCircle,
  MessageCircle,
  Mic,
  Moon,
  Send,
  Sparkles,
  Square,
  X,
} from "lucide-react";
import AstralModal from "@/components/AstralModal";
import { useLiveChat } from "@/hooks/useLiveChat";
import { useVoiceRecorder } from "@/hooks/useVoiceRecorder";
import {
  chatErrorMessage,
  safeChatMediaUrl,
  sendChatMessage,
  IMAGE_LIMIT,
  LOCAL_MEDIA_LIMIT,
  type LiveMessage,
  type OutgoingMessage,
} from "@/lib/chatService";
import { safeAvatarUrl } from "@/lib/masters";

const quickReplies = [
  {
    name: "Saludo",
    text: "Hola, gracias por compartir tu consulta. Cuéntame un poco más sobre lo que te gustaría explorar hoy.",
  },
  {
    name: "Profundizar",
    text: "¿Qué es lo que más te inquieta de esta situación y cómo te gustaría sentirte al respecto?",
  },
  {
    name: "Cierre",
    text: "Gracias por este espacio de conversación. Si lo deseas, puedes volver a escribir en esta misma sala.",
  },
];

function Clock({ value }: { value: string | null }) {
  return value ? (
    <time dateTime={value}>
      {new Date(value).toLocaleTimeString("es-CO", {
        hour: "2-digit",
        minute: "2-digit",
      })}
    </time>
  ) : null;
}

function MessageBubble({
  message,
  own,
  sender,
  expand,
  roomId,
  local,
}: {
  message: LiveMessage;
  own: boolean;
  sender: string;
  expand: (url: string) => void;
  roomId: string;
  local: boolean;
}) {
  const media =
    message.type !== "text"
      ? safeChatMediaUrl(message.mediaUrl, message.type, {
          roomId,
          local,
          storagePath: message.storagePath,
        })
      : null;
  return (
    <article
      className={`chat-bubble live-bubble ${own ? "from-client" : "from-master"}`}
      aria-label={`Mensaje de ${sender}`}
    >
      <span className="bubble-sender">{sender}</span>
      {message.type === "text" ? (
        <p>{message.text}</p>
      ) : !media ? (
        <p className="unavailable-media">Este archivo no está disponible.</p>
      ) : message.type === "image" ? (
        <button
          className="bubble-image-button"
          onClick={() => expand(media)}
          aria-label={`Ampliar foto de ${sender}`}
        >
          <Image
            src={media}
            alt={`Foto compartida por ${sender}`}
            width={640}
            height={480}
            unoptimized
            className="bubble-image"
          />
        </button>
      ) : (
        <audio
          controls
          preload="metadata"
          src={media}
          aria-label={`Nota de voz de ${sender}`}
        />
      )}
      <div className="bubble-meta">
        <Clock value={message.createdAt} />
        {message.pending && <span>Enviando…</span>}
      </div>
    </article>
  );
}

function ChatRoom({ roomId }: { roomId: string }) {
  const { data, error: connectionError, retry } = useLiveChat(roomId);
  const voice = useVoiceRecorder();
  const [draft, setDraft] = useState("");
  const [attachment, setAttachment] = useState<{
    file: File;
    url: string;
  } | null>(null);
  const [expandedImage, setExpandedImage] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [sendError, setSendError] = useState("");
  const [failedAvatar, setFailedAvatar] = useState("");
  const [newMessages, setNewMessages] = useState(false);
  const shell = useRef<HTMLDivElement>(null);
  const messageList = useRef<HTMLDivElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const operation = useRef<{ payload: string | Blob; id: string } | null>(null);
  const abort = useRef<AbortController | null>(null);
  const submitting = useRef(false);
  const alive = useRef(true);
  const stickToBottom = useRef(true);
  const imagePreview = useRef<string | null>(null);
  const lastMessageId = data?.messages.at(-1)?.id;

  useEffect(() => {
    alive.current = true;
    const viewport = window.visualViewport;
    const resize = () =>
      shell.current?.style.setProperty(
        "--chat-viewport-height",
        `${viewport?.height ?? window.innerHeight}px`,
      );
    resize();
    viewport?.addEventListener("resize", resize);
    return () => {
      alive.current = false;
      abort.current?.abort();
      if (imagePreview.current) URL.revokeObjectURL(imagePreview.current);
      viewport?.removeEventListener("resize", resize);
    };
  }, []);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (!messageList.current) return;
      if (stickToBottom.current)
        messageList.current.scrollTop = messageList.current.scrollHeight;
      else setNewMessages(true);
    });
    return () => cancelAnimationFrame(frame);
  }, [lastMessageId]);

  function clearAttachment() {
    if (imagePreview.current) URL.revokeObjectURL(imagePreview.current);
    imagePreview.current = null;
    setAttachment(null);
    if (picker.current) picker.current.value = "";
  }

  function chooseImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setSendError("");
    if (
      !["image/jpeg", "image/png", "image/webp", "image/gif"].includes(
        file.type,
      )
    ) {
      setSendError("Selecciona una imagen JPG, PNG, WebP o GIF.");
      event.target.value = "";
      return;
    }
    const limit =
      data?.session.mode === "local" ? LOCAL_MEDIA_LIMIT : IMAGE_LIMIT;
    if (!file.size || file.size > limit) {
      setSendError(
        `La imagen debe contener datos y pesar como máximo ${limit / 1024 / 1024} MB.`,
      );
      event.target.value = "";
      return;
    }
    if (imagePreview.current) URL.revokeObjectURL(imagePreview.current);
    imagePreview.current = URL.createObjectURL(file);
    setAttachment({ file, url: imagePreview.current });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !data ||
      connectionError ||
      submitting.current ||
      voice.status === "recording" ||
      voice.status === "requesting"
    )
      return;
    const audio = voice.status === "preview" ? voice.blob : null;
    const payload = audio ?? attachment?.file ?? draft.trim();
    if (!payload) return;
    if (!operation.current || operation.current.payload !== payload)
      operation.current = { payload, id: window.crypto.randomUUID() };
    const input: OutgoingMessage = audio
      ? { type: "audio", file: audio, messageId: operation.current.id }
      : attachment
        ? {
            type: "image",
            file: attachment.file,
            messageId: operation.current.id,
          }
        : {
            type: "text",
            text: String(payload),
            messageId: operation.current.id,
          };
    submitting.current = true;
    abort.current = new AbortController();
    setSending(true);
    setProgress(input.type === "text" ? null : 0);
    setSendError("");
    stickToBottom.current = true;
    try {
      await sendChatMessage(roomId, input, {
        signal: abort.current.signal,
        onProgress: (value) => {
          if (alive.current) setProgress(value);
        },
      });
      if (
        data.session.actor.role === "cliente" &&
        !data.messages.some(
          (message) =>
            message.senderRole === "cliente" &&
            !message.id.startsWith("intake_"),
        )
      )
        trackFirstMessageSent(roomId, data.session.room.masterId);
      if (!alive.current) return;
      operation.current = null;
      if (input.type === "text") setDraft("");
      if (input.type === "image") clearAttachment();
      if (input.type === "audio") voice.cancel();
    } catch (cause) {
      if (alive.current) setSendError(chatErrorMessage(cause));
    } finally {
      submitting.current = false;
      if (alive.current) {
        setSending(false);
        setProgress(null);
      }
    }
  }

  function enterToSend(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing &&
      window.matchMedia("(pointer: fine)").matches
    ) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  if (!data)
    return (
      <div className="astral-shell">
        <div className="page-container">
          <main id="contenido" className="consultation-chat">
            <Link className="back-link" href="/catalogo">
              <ArrowLeft size={16} aria-hidden="true" />
              Volver al catálogo
            </Link>
            {connectionError ? (
              <section className="empty-state">
                <MessageCircle size={32} aria-hidden="true" />
                <h1>Conversación no disponible</h1>
                <p role="alert">{connectionError}</p>
                <button className="gold-button" onClick={retry}>
                  Intentar de nuevo
                </button>
              </section>
            ) : (
              <p role="status" className="chat-loading">
                <LoaderCircle className="spin" size={20} aria-hidden="true" />
                Cargando la conversación…
              </p>
            )}
          </main>
        </div>
      </div>
    );

  const { session, messages } = data;
  const { room, actor } = session;
  const avatar = safeAvatarUrl(room.masterAvatar);
  const initialTopic =
    room.initialTopic ??
    messages.find(
      (message) => message.senderRole === "cliente" && message.type === "text",
    )?.text ??
    "";
  const recording =
    voice.status === "recording" || voice.status === "requesting";
  const blocked = sending || Boolean(connectionError);

  return (
    <div ref={shell} className="live-chat-shell">
      <div className="chat-brand-strip">
        <Link href="/catalogo">
          <Moon size={16} aria-hidden="true" />
          Santuario Astral
        </Link>
        <span>
          {actor.role === "maestro"
            ? "Panel del maestro"
            : "Consulta por chat"}
        </span>
      </div>
      <header className="live-chat-header">
        <Link
          href={
            actor.role === "maestro"
              ? "/maestro/panel"
              : "/catalogo?vista=chats"
          }
          className="chat-back-button"
          aria-label={
            actor.role === "maestro"
              ? "Volver a mi bandeja"
              : "Volver a Mis Chats"
          }
        >
          <ArrowLeft size={21} aria-hidden="true" />
        </Link>
        <Link
          href={
            actor.role === "maestro"
              ? "/maestro/panel"
              : `/maestro/${encodeURIComponent(room.masterId)}`
          }
          className="chat-master-identity"
        >
          <span className="chat-header-avatar">
            {actor.role === "cliente" && avatar && failedAvatar !== avatar ? (
              <Image
                src={avatar}
                alt={`Avatar de ${room.masterName}`}
                fill
                sizes="46px"
                unoptimized
                onError={() => setFailedAvatar(avatar)}
              />
            ) : (
              <span aria-hidden="true">
                {
                  (actor.role === "maestro"
                    ? room.clientName
                    : room.masterName)[0]
                }
              </span>
            )}
          </span>
          <span>
            <h1>
              {actor.role === "maestro" ? room.clientName : room.masterName}
              {actor.role === "cliente" && (
                <CountryFlag code={data.masterCountryCode} />
              )}
            </h1>
            <span
              className={`live-status ${data.isOnline === true ? "online" : ""}`}
            >
              <span aria-hidden="true" />
              {actor.role === "maestro"
                ? room.statusTag
                : data.isOnline === null
                  ? "Estado no disponible"
                  : data.isOnline
                    ? "En línea"
                    : "Ocupado"}
              {session.isDemo ? " · Demo" : ""}
            </span>
          </span>
        </Link>
        <Link href="/catalogo" className="chat-catalog-link">
          Catálogo
        </Link>
      </header>
      <main id="contenido" className="live-chat-main">
        <details className="consultation-context">
          <summary>
            <Moon size={15} aria-hidden="true" />
            <span>
              {actor.role === "maestro" ? "Datos de consulta" : "Tu consulta"}{" "}
              <span>· {room.clientName}</span>
            </span>
            <ChevronDown
              size={16}
              className="context-chevron"
              aria-hidden="true"
            />
          </summary>
          <dl>
            <div>
              <dt>Nombre o apodo</dt>
              <dd>{room.clientName}</dd>
            </div>
            {room.clientZodiac && (
              <div>
                <dt>Signo o fecha</dt>
                <dd>{room.clientZodiac}</dd>
              </div>
            )}
            <div>
              <dt>Motivo inicial</dt>
              <dd>{initialTopic || "No se indicó un motivo inicial."}</dd>
            </div>
          </dl>
        </details>
        {session.mode === "local" && (
          <div className="live-local-notice">
            <Sparkles size={14} aria-hidden="true" />
            <p>
              {session.isDemo
                ? "Demostración: los mensajes se guardan solo en este navegador y no se envían a un maestro real."
                : "Modo local: los mensajes se guardan solo en este navegador."}
            </p>
          </div>
        )}
        {session.mode === "firestore" && data.fromCache && (
          <p className="chat-connection-note" role="status">
            Mostrando mensajes guardados mientras se restablece la conexión.
          </p>
        )}
        {connectionError && (
          <div className="chat-error-banner" role="alert">
            <span>{connectionError}</span>
            <button onClick={retry}>Reconectar</button>
          </div>
        )}
        <div
          ref={messageList}
          className="live-message-list"
          role="log"
          aria-label="Mensajes de la conversación"
          aria-live="polite"
          aria-relevant="additions"
          onScroll={() => {
            const element = messageList.current;
            if (element) {
              stickToBottom.current =
                element.scrollHeight -
                  element.scrollTop -
                  element.clientHeight <
                110;
              if (stickToBottom.current) setNewMessages(false);
            }
          }}
        >
          <div className="chat-start-note">
            <Sparkles size={14} aria-hidden="true" />
            <span>Inicio de la conversación</span>
          </div>
          {messages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              own={
                message.senderId === actor.id &&
                message.senderRole === actor.role
              }
              sender={
                message.senderRole === actor.role
                  ? "Tú"
                  : message.senderRole === "maestro"
                    ? room.masterName
                    : room.clientName
              }
              expand={setExpandedImage}
              roomId={roomId}
              local={session.mode === "local"}
            />
          ))}
          {!messages.length && (
            <p className="chat-empty-note">
              Escribe tu primera pregunta para empezar.
            </p>
          )}
        </div>
        {newMessages && (
          <button
            className="new-messages-button"
            onClick={() => {
              if (messageList.current)
                messageList.current.scrollTop =
                  messageList.current.scrollHeight;
              stickToBottom.current = true;
              setNewMessages(false);
            }}
          >
            Ver mensajes recientes <ChevronDown size={14} aria-hidden="true" />
          </button>
        )}
      </main>
      <form
        className="live-chat-composer"
        onSubmit={submit}
        aria-label="Enviar un mensaje"
      >
        {(sendError || voice.error) && (
          <p className="composer-error" role="alert">
            {sendError || voice.error}
          </p>
        )}
        {actor.role === "maestro" && (
          <label className="quick-replies">
            <span>Respuestas rápidas</span>
            <select
              aria-label="Insertar una respuesta rápida"
              value=""
              disabled={blocked || voice.status !== "idle"}
              onChange={(event) => {
                const reply = quickReplies.find(
                  (item) => item.name === event.target.value,
                );
                if (!reply) return;
                const text = draft ? draft + "\n" + reply.text : reply.text;
                if (text.length > 4000)
                  setSendError(
                    "El texto supera los 4000 caracteres. Acórtalo antes de añadir la plantilla.",
                  );
                else setDraft(text);
              }}
            >
              <option value="">Seleccionar plantilla…</option>
              {quickReplies.map((reply) => (
                <option key={reply.name}>{reply.name}</option>
              ))}
            </select>
          </label>
        )}
        {attachment && !recording && voice.status !== "preview" && (
          <div className="attachment-preview">
            <Image
              src={attachment.url}
              alt="Imagen seleccionada para enviar"
              width={68}
              height={68}
              unoptimized
            />
            <span>
              Foto lista para enviar
              <small>
                {draft.trim()
                  ? "Tu texto quedará como un mensaje separado."
                  : "Revisa la imagen antes de compartirla."}
              </small>
            </span>
            <button
              type="button"
              disabled={sending}
              onClick={clearAttachment}
              aria-label="Cancelar imagen"
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>
        )}
        {recording ? (
          <div className="recording-toolbar">
            <button
              type="button"
              className="composer-icon"
              onClick={voice.cancel}
              aria-label="Cancelar grabación"
            >
              <X size={20} aria-hidden="true" />
            </button>
            <div className="recording-indicator" role="status">
              <span aria-hidden="true" />
              {voice.status === "requesting"
                ? "Esperando el micrófono…"
                : `Grabando ${Math.floor(voice.seconds / 60)}:${String(voice.seconds % 60).padStart(2, "0")}`}
            </div>
            {voice.status === "recording" && (
              <button
                type="button"
                className="gold-button stop-recording"
                onClick={voice.stop}
                aria-label="Detener grabación y escuchar"
              >
                <Square size={16} fill="currentColor" aria-hidden="true" />
                Escuchar
              </button>
            )}
          </div>
        ) : voice.status === "preview" ? (
          <div className="voice-preview">
            <button
              type="button"
              className="composer-icon"
              disabled={sending}
              onClick={voice.cancel}
              aria-label="Descartar nota de voz"
            >
              <X size={19} aria-hidden="true" />
            </button>
            {voice.previewUrl && (
              <audio
                controls
                src={voice.previewUrl}
                aria-label="Escuchar nota de voz antes de enviar"
              />
            )}
            <button
              className="composer-send"
              type="submit"
              disabled={blocked}
              aria-label="Enviar nota de voz"
            >
              {sending ? (
                <LoaderCircle className="spin" size={20} aria-hidden="true" />
              ) : (
                <Send size={20} aria-hidden="true" />
              )}
            </button>
          </div>
        ) : (
          <div className="composer-row">
            <input
              ref={picker}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={chooseImage}
              className="sr-only"
              tabIndex={-1}
              aria-label="Seleccionar una foto de cámara o galería"
              disabled={blocked}
            />
            <button
              type="button"
              className="composer-icon"
              disabled={blocked}
              onClick={() => picker.current?.click()}
              aria-label="Adjuntar foto de cámara o galería"
              title={
                session.mode === "local"
                  ? "Adjuntar foto local"
                  : "Adjuntar foto (máximo 5 MB)"
              }
            >
              <Camera size={22} strokeWidth={1.6} aria-hidden="true" />
            </button>
            <textarea
              rows={1}
              aria-label="Escribe tu mensaje"
              maxLength={4000}
              placeholder="Escribe un mensaje…"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={enterToSend}
              disabled={blocked}
            />
            <button
              type="button"
              className="composer-icon"
              disabled={blocked || Boolean(attachment)}
              onClick={() => {
                setSendError("");
                void voice.start();
              }}
              aria-label="Grabar nota de voz"
              title={
                session.mode === "local"
                  ? "Grabar nota local"
                  : "Grabar nota de voz (máximo 8 MB)"
              }
            >
              <Mic size={22} strokeWidth={1.6} aria-hidden="true" />
            </button>
            <button
              className="composer-send"
              type="submit"
              disabled={blocked || (!draft.trim() && !attachment)}
              aria-label={attachment ? "Enviar imagen" : "Enviar mensaje"}
            >
              {sending ? (
                <LoaderCircle className="spin" size={20} aria-hidden="true" />
              ) : (
                <Send size={20} aria-hidden="true" />
              )}
            </button>
          </div>
        )}
        <div className="composer-caption">
          <span>
            {recording
              ? "Hasta 2 minutos · Puedes cancelar antes de enviar"
              : sending
                ? progress === null
                  ? "Guardando tu mensaje…"
                  : `Preparando archivo · ${progress}%`
                : session.mode === "local"
                  ? "Adjuntos de hasta 2 MB · Guardado en este navegador"
                  : "Chat de texto · Fotos y audio pendientes de activar Storage"}
          </span>
          {sending && progress !== null && progress < 100 && (
            <button type="button" onClick={() => abort.current?.abort()}>
              Cancelar envío
            </button>
          )}
        </div>
      </form>
      {expandedImage && (
        <AstralModal
          title="Imagen compartida"
          onClose={() => setExpandedImage(null)}
        >
          <Image
            src={expandedImage}
            alt="Imagen compartida ampliada"
            width={1200}
            height={900}
            unoptimized
            className="expanded-chat-image"
          />
        </AstralModal>
      )}
    </div>
  );
}

export default function ChatRoomClient() {
  const { roomId } = useParams<{ roomId: string }>();
  return <ChatRoom key={roomId} roomId={roomId} />;
}
