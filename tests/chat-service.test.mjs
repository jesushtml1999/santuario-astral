import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createHarness, flush } from "./chat-harness.mjs";

test("local rooms never mix masters or guests and concurrent messages survive", async () => {
  const h = createHarness();
  const first = await h.createRoom(0),
    second = await h.createRoom(1);
  await Promise.all(
    Array.from({ length: 12 }, (_, index) =>
      h.service.sendChatMessage(first, {
        type: "text",
        text: " Prueba " + index + " ",
        messageId: "text-" + index,
      }),
    ),
  );
  const one = await h.consultations.getConsultation(first),
    two = await h.consultations.getConsultation(second);
  assert.equal(one.messages.length, 13);
  assert.equal(two.messages.length, 1);
  assert.equal(one.room.unreadByMaster, 13);
  assert.equal(two.room.unreadByMaster, 1);
  assert.equal(one.room.initialTopic, "Pregunta inicial de prueba");
  await h.service.sendChatMessage(first, {
    type: "text",
    text: "Prueba 0",
    messageId: "text-0",
  });
  assert.equal(
    (await h.consultations.getConsultation(first)).messages.length,
    13,
  );
  await assert.rejects(
    h.service.openChatSession(randomUUID() + "_" + h.masters[0].id),
    /no pertenece/,
  );
  const rooms = await h.service.listGuestChatRooms();
  assert.equal(rooms.length, 2);
});

test("local image and audio fixtures persist as DataURLs; invalid/quota writes preserve history", async () => {
  const h = createHarness(),
    room = await h.createRoom();
  await h.service.sendChatMessage(room, {
    type: "image",
    file: new Blob(
      [readFileSync(new URL("./fixtures/chat-photo.png", import.meta.url))],
      { type: "image/png" },
    ),
    messageId: "image-one",
  });
  await h.service.sendChatMessage(room, {
    type: "audio",
    file: new Blob(
      [readFileSync(new URL("./fixtures/chat-audio.wav", import.meta.url))],
      { type: "audio/wav" },
    ),
    messageId: "audio-one",
  });
  const stored = await h.consultations.getConsultation(room);
  assert.match(stored.messages[1].mediaUrl, /^data:image\/png;base64,/);
  assert.match(stored.messages[2].mediaUrl, /^data:audio\/wav;base64,/);
  assert.equal(stored.room.lastMessage, "🎙️ Nota de voz");
  await assert.rejects(
    h.service.sendChatMessage(room, {
      type: "image",
      file: new Blob(["<svg/>"], { type: "image/svg+xml" }),
      messageId: "unsafe",
    }),
    /JPG/,
  );
  await assert.rejects(
    h.service.sendChatMessage(room, {
      type: "audio",
      file: new Blob([new Uint8Array(2 * 1024 * 1024 + 1)], {
        type: "audio/webm",
      }),
      messageId: "oversize",
    }),
    /2 MB/,
  );
  h.setQuota(true);
  await assert.rejects(
    h.service.sendChatMessage(room, {
      type: "text",
      text: "No guardar",
      messageId: "quota",
    }),
    /No pudimos guardar/,
  );
  h.setQuota(false);
  assert.equal(
    (await h.consultations.getConsultation(room)).messages.length,
    3,
  );
});

test("a local subscription is scoped, reacts to room storage events and releases listeners", async () => {
  const h = createHarness(),
    room = await h.createRoom(),
    other = await h.createRoom(1);
  const seen = [],
    errors = [];
  const stop = h.service.subscribeToChat(
    room,
    (value) => seen.push(value),
    (error) => errors.push(error),
  );
  await flush();
  const initial = seen.length;
  await h.service.sendChatMessage(other, {
    type: "text",
    text: "Solo otro maestro",
    messageId: "other",
  });
  assert.equal(seen.length, initial);
  await h.service.sendChatMessage(room, {
    type: "text",
    text: "Sala propia",
    messageId: "own",
  });
  assert.equal(seen.at(-1).messages.length, 2);
  assert.equal(errors.length, 0);
  stop();
  const stopped = seen.length;
  await h.service.sendChatMessage(room, {
    type: "text",
    text: "Después de cerrar",
    messageId: "closed",
  });
  assert.equal(seen.length, stopped);
});

test("read receipts affect only the recipient counter and never acknowledge newer unseen messages", async () => {
  const h = createHarness(),
    roomId = await h.createRoom();
  const value = await h.consultations.getConsultation(roomId);
  value.room.unreadByClient = 2;
  h.consultations.writeLocalConsultation(value);
  await h.service.markChatRead(roomId, {
    messageId: "unseen-old-id",
    lastMessageAt: value.room.lastMessageAt,
  });
  assert.equal(
    (await h.consultations.getConsultation(roomId)).room.unreadByClient,
    2,
  );
  await h.service.markChatRead(roomId, {
    messageId: value.room.lastMessageId,
    lastMessageAt: value.room.lastMessageAt,
  });
  const after = await h.consultations.getConsultation(roomId);
  assert.equal(after.room.unreadByClient, 0);
  assert.equal(after.room.unreadByMaster, 1);
});

test("cloud sender identities and recipient counters are derived from authenticated membership", async () => {
  const h = createHarness(true),
    roomId = await h.createRoom();
  const roomPath = "chats/" + roomId;
  assert.equal(h.cloud.get(roomPath).clientAuthUid, "client-auth");
  await h.service.sendChatMessage(roomId, {
    type: "text",
    text: "Pregunta cliente",
    messageId: "client-message",
  });
  assert.equal(h.cloud.get(roomPath).unreadByMaster, 2);
  h.changeUser({ uid: "master-auth", isAnonymous: false });
  h.cloud.set("users/master-auth", { role: "maestro", masterId: "master-0" });
  await assert.rejects(h.service.openChatSession(roomId), /No tienes acceso/);
  h.changeUser({ uid: "master-0", isAnonymous: false });
  h.cloud.set("users/master-0", {
    role: "maestro",
    masterId: "master-0",
    disabled: true,
  });
  await assert.rejects(h.service.openChatSession(roomId), /No tienes acceso/);
  h.cloud.set("users/master-0", {
    role: "maestro",
    masterId: "master-0",
    disabled: false,
  });
  await h.service.markChatRead(roomId, {
    messageId: "client-message",
    lastMessageAt: null,
  });
  assert.equal(h.cloud.get(roomPath).unreadByMaster, 0);
  await h.service.sendChatMessage(roomId, {
    type: "text",
    text: "Respuesta simulada de prueba",
    messageId: "master-message",
  });
  const message = h.cloud.get(roomPath + "/messages/master-message");
  assert.equal(message.senderId, "master-0");
  assert.equal(message.senderRole, "maestro");
  assert.equal(h.cloud.get(roomPath).unreadByClient, 1);
  h.changeUser({ uid: "outsider", isAnonymous: false });
  await assert.rejects(h.service.openChatSession(roomId), /No tienes acceso/);
  await assert.rejects(
    h.service.sendChatMessage(roomId, {
      type: "text",
      text: "No autorizado",
      messageId: "intruder",
    }),
    /No tienes acceso/,
  );
  assert.equal(h.cloud.has(roomPath + "/messages/intruder"), false);
});

test("cloud snapshots clean up on auth changes and unsubscribe-before-initialization", async () => {
  const h = createHarness(true),
    room = await h.createRoom();
  const stopped = h.service.subscribeToChat(
    room,
    () => assert.fail("late callback"),
    assert.fail,
  );
  stopped();
  await flush();
  assert.equal(h.listeners.size, 0);
  const seen = [],
    errors = [];
  const stop = h.service.subscribeToChat(
    room,
    (value) => seen.push(value),
    (error) => errors.push(error),
  );
  await flush();
  await flush();
  assert.ok(seen.length > 0);
  assert.equal(h.listeners.size, 3);
  h.changeUser({ uid: "different-user", isAnonymous: false });
  const count = seen.length;
  h.notify();
  await flush();
  assert.equal(h.listeners.size, 0);
  assert.equal(h.authListeners.size, 0);
  assert.equal(seen.length, count);
  assert.equal(errors.length, 1);
  stop();
});

test("cloud uploads remain disabled without changing messages, counters or text retries", async () => {
  const h = createHarness(true),
    room = await h.createRoom();
  const previous = JSON.stringify([...h.cloud.entries()]);
  for (const type of ["image", "audio"]) {
    await assert.rejects(
      h.service.sendChatMessage(room, {
        type,
        file: new Blob(["fixture"], {
          type: type === "image" ? "image/png" : "audio/webm",
        }),
        messageId: "pending-" + type,
      }),
      /pendientes de habilitar Storage/,
    );
  }
  assert.equal(JSON.stringify([...h.cloud.entries()]), previous);
  assert.equal(h.uploads.size, 0);
  const input = {
    type: "text",
    text: "Texto sin Storage",
    messageId: "cloud-text",
  };
  await h.service.sendChatMessage(room, input);
  await h.service.sendChatMessage(room, input);
  assert.equal(h.cloud.get("chats/" + room).unreadByMaster, 2);
  assert.equal(
    h.cloud.get("chats/" + room + "/messages/cloud-text").text,
    input.text,
  );
});

test("existing attachment URLs remain scoped to their own room and reject unsafe sources", async () => {
  const h = createHarness(true),
    room = await h.createRoom();
  const storagePath = `chat_media/${room}/old-photo.jpg`;
  const mediaUrl = `https://firebasestorage.googleapis.com/v0/b/local-test/o/${encodeURIComponent(storagePath)}?alt=media&token=fixture`;
  assert.equal(
    h.service.safeChatMediaUrl(mediaUrl, "image", {
      roomId: room,
      storagePath,
      local: false,
    }),
    mediaUrl,
  );
  assert.equal(
    h.service.safeChatMediaUrl(mediaUrl, "image", {
      roomId: "other-room",
      storagePath,
      local: false,
    }),
    null,
  );
  assert.equal(
    h.service.safeChatMediaUrl("javascript:alert(1)", "image", {
      roomId: room,
      local: true,
    }),
    null,
  );
  assert.equal(
    h.service.safeChatMediaUrl("data:image/png;base64,YQ==", "image", {
      roomId: room,
      local: false,
    }),
    null,
  );
});

test("a mismatched sender is rejected before any conversation snapshot is displayed", async () => {
  const h = createHarness(true),
    room = await h.createRoom();
  h.cloud.set(`chats/${room}/messages/foreign`, {
    id: "foreign",
    senderId: "other-master",
    senderRole: "maestro",
    type: "text",
    text: "Wrong room fixture",
    createdAt: h.cloud.get(`chats/${room}`).lastMessageAt,
  });
  const seen = [],
    errors = [];
  h.service.subscribeToChat(
    room,
    (value) => seen.push(value),
    (error) => errors.push(error),
  );
  await flush();
  await flush();
  assert.equal(seen.length, 0);
  assert.equal(errors.length, 1);
  assert.equal(h.listeners.size, 0);
});

test("changing the guest identity closes a local subscription without delivering another guest's data", async () => {
  const h = createHarness(),
    room = await h.createRoom();
  const seen = [],
    errors = [];
  h.service.subscribeToChat(
    room,
    (value) => seen.push(value),
    (error) => errors.push(error),
  );
  await flush();
  const count = seen.length;
  h.window.localStorage.setItem("santuario-astral:guest-id", randomUUID());
  h.window.dispatchEvent(
    Object.assign(new Event("storage"), { key: "santuario-astral:guest-id" }),
  );
  await flush();
  assert.equal(seen.length, count);
  assert.equal(errors.length, 1);
});

test("messages sharing a millisecond retain their chronological insertion order", async () => {
  const h = createHarness(),
    room = await h.createRoom();
  await h.service.sendChatMessage(room, {
    type: "text",
    text: "Primero",
    messageId: "z-first",
  });
  await h.service.sendChatMessage(room, {
    type: "text",
    text: "Segundo",
    messageId: "a-second",
  });
  const stored = await h.consultations.getConsultation(room);
  const expected = Array.from(stored.messages, (message) => message.id);
  for (const message of stored.messages)
    message.createdAt = stored.messages[0].createdAt;
  h.consultations.writeLocalConsultation(stored);
  const seen = [];
  const stop = h.service.subscribeToChat(
    room,
    (value) => seen.push(value),
    assert.fail,
  );
  await flush();
  assert.deepEqual(
    Array.from(seen.at(-1).messages, (message) => message.id),
    expected,
  );
  stop();
});
