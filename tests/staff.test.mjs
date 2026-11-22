import test from "node:test";
import assert from "node:assert/strict";
import { createHarness, evaluate, flush } from "./chat-harness.mjs";

const input = (index) => ({
  name: `Maestro de prueba ${index}`,
  bio: "Biografía ficticia para comprobar el directorio local.",
  specialties: ["Tarot", "Astrología"],
  avatarUrl: "",
  experienceYears: 3,
  login: `prueba-${index}@demo.santuario.test`,
  password: "PruebaAstral2026!",
  isTestProfile: true,
});
const admin = (h) =>
  h.staff.signInStaff(h.staff.DEMO_ADMIN_LOGIN, h.staff.DEMO_ADMIN_PASSWORD);
const masterLogin = (h, index = 0) =>
  `${h.masters[index].id.replace(/^demo-/, "")}@demo.santuario.test`;

test("demo initializes twenty masters plus an administrator, hashes passwords and derives roles from accounts", async () => {
  const h = createHarness();
  await h.staff.initializeDemoStaff();
  const accounts = h.staff.readLocalStaffAccounts();
  assert.equal(
    accounts.filter((account) => account.role === "maestro").length,
    20,
  );
  assert.equal(
    accounts.filter((account) => account.role === "admin").length,
    1,
  );
  const serialized = h.window.localStorage.getItem(h.staff.STAFF_ACCOUNTS_KEY);
  assert.equal(serialized.includes(h.staff.DEMO_ADMIN_PASSWORD), false);
  assert.equal(serialized.includes(h.staff.DEMO_MASTER_PASSWORD), false);
  await assert.rejects(
    h.staff.signInStaff(masterLogin(h), "wrong-password"),
    /no son correctos/,
  );
  const session = await h.staff.signInStaff(
    masterLogin(h),
    h.staff.DEMO_MASTER_PASSWORD,
  );
  assert.equal(session.role, "maestro");
  assert.equal(session.masterId, h.masters[0].id);
  const key = "santuario-astral:staff-session:v1";
  h.window.sessionStorage.setItem(
    key,
    JSON.stringify({
      ...JSON.parse(h.window.sessionStorage.getItem(key)),
      role: "admin",
    }),
  );
  assert.equal(h.staff.getLocalStaffSession().role, "maestro");
  await assert.rejects(h.staffService.getMasterDirectory(), /no tiene permiso/);
});

test("the administrator can exceed twenty profiles, edit credentials, hide profiles and remove unused test accounts", async () => {
  const h = createHarness();
  await h.staff.initializeDemoStaff();
  await admin(h);
  await Promise.all(
    Array.from({ length: 5 }, (_, index) =>
      h.staffService.saveManagedMaster(input(index)),
    ),
  );
  let directory = await h.staffService.getMasterDirectory();
  assert.equal(directory.entries.length, 25);
  const created = directory.entries.find(
    (entry) => entry.login === input(0).login,
  );
  assert.ok(created);
  assert.equal(created.profile.rating, 0);
  assert.equal(created.profile.reviewsCount, 0);
  await h.staffService.saveManagedMaster(
    {
      ...input(0),
      name: "Nombre editado",
      login: "nuevo-acceso@demo.santuario.test",
      password: "NuevaClave2026!",
    },
    created.profile.id,
  );
  await h.staffService.setMasterVisibility(created.profile.id, false);
  assert.equal(
    h.localMasters
      .readLocalMasters()
      .find((profile) => profile.id === created.profile.id).isActive,
    false,
  );
  await h.staff.signOutStaff();
  await assert.rejects(
    h.staff.signInStaff(input(0).login, input(0).password),
    /no son correctos/,
  );
  const staff = await h.staff.signInStaff(
    "nuevo-acceso@demo.santuario.test",
    "NuevaClave2026!",
  );
  assert.equal(staff.masterId, created.profile.id);
  await h.staff.signOutStaff();
  await admin(h);
  await h.staffService.deleteTestMaster(created.profile.id);
  directory = await h.staffService.getMasterDirectory();
  assert.equal(directory.entries.length, 24);
  assert.equal(
    h.staff
      .readLocalStaffAccounts()
      .some((account) => account.masterId === created.profile.id),
    false,
  );
});

test("a master can only read and reply to their inbox, edit their own profile and update their own presence", async () => {
  const h = createHarness(),
    ownRoom = await h.createRoom(0),
    otherRoom = await h.createRoom(1);
  await h.staff.initializeDemoStaff();
  await h.staff.signInStaff(masterLogin(h), h.staff.DEMO_MASTER_PASSWORD);
  const snapshots = [],
    errors = [];
  const stop = h.staffService.subscribeMasterInbox(
    h.masters[0].id,
    (rooms) => snapshots.push(rooms),
    (cause) => errors.push(cause),
  );
  await flush();
  assert.deepEqual(
    Array.from(snapshots.at(-1), (room) => room.id),
    [ownRoom],
  );
  const blocked = [];
  const stopOther = h.staffService.subscribeMasterInbox(
    h.masters[1].id,
    () => assert.fail("Foreign inbox exposed"),
    (cause) => blocked.push(cause),
  );
  await flush();
  assert.equal(blocked.length, 1);
  await assert.rejects(h.service.openChatSession(otherRoom), /no pertenece/);
  await assert.rejects(
    h.staffService.setChatTag(otherRoom, "Pagado"),
    /no pertenece/,
  );
  await h.staffService.setChatTag(ownRoom, "Interesado");
  await h.service.sendChatMessage(ownRoom, {
    type: "text",
    text: "Respuesta de prueba desde la cuenta del maestro",
    messageId: "staff-reply",
  });
  const saved = h.consultations.readLocalConsultation(ownRoom);
  assert.equal(saved.room.statusTag, "Interesado");
  assert.equal(saved.room.unreadByClient, 1);
  assert.equal(saved.messages.at(-1).senderRole, "maestro");
  assert.equal(saved.messages.at(-1).senderId, h.masters[0].id);
  await h.staffService.setOwnAvailability(false);
  await h.staffService.saveOwnProfile({
    bio: "Biografía de prueba actualizada",
    specialties: ["Numerología"],
    avatarUrl: "",
  });
  const profile = h.localMasters
    .readLocalMasters()
    .find((profile) => profile.id === h.masters[0].id);
  assert.equal(profile.isOnline, false);
  assert.equal(profile.specialty, "Numerología");
  assert.equal(
    h.localMasters
      .readLocalMasters()
      .find((profile) => profile.id === h.masters[1].id).specialty,
    h.masters[1].specialty,
  );
  assert.equal(errors.length, 0);
  stop();
  stopOther();
  await h.staff.signOutStaff();
  assert.equal(
    h.window.localStorage.getItem("santuario-astral:guest-id"),
    h.guest,
  );
  assert.equal(
    (await h.service.openChatSession(ownRoom)).actor.role,
    "cliente",
  );
});

test("hiding all profiles does not resurrect the seed and deleting a profile with chats preserves history", async () => {
  const h = createHarness(),
    room = await h.createRoom();
  await h.staff.initializeDemoStaff();
  await admin(h);
  await assert.rejects(
    h.staffService.deleteTestMaster(h.masters[0].id),
    /conversaciones/,
  );
  assert.ok(h.consultations.readLocalConsultation(room));
  const seen = [];
  const stop = h.publicMasters.subscribeMasters((value) => seen.push(value));
  await flush();
  for (const profile of h.localMasters.readLocalMasters())
    await h.staffService.setMasterVisibility(profile.id, false);
  await flush();
  assert.equal(seen.at(-1).masters.length, 0);
  assert.equal(h.localMasters.readLocalMasters().length, 20);
  stop();
});

test("the real administration API rejects absent, invalid or non-administrator tokens", async () => {
  const app = { name: "santuario-admin" };
  const auth = {
    verifyIdToken: async (token, revoked) => {
      assert.equal(revoked, true);
      if (token === "invalid") throw new Error("invalid");
      return { uid: token };
    },
  };
  const db = {
    doc: (path) => ({
      get: async () => ({
        data: () => ({
          role: path === "users/admin-token" ? "admin" : "maestro",
        }),
      }),
    }),
  };
  const api = evaluate("src/lib/server/firebaseAdmin.ts", {
    process: { env: {} },
    require: (name) => {
      if (name === "server-only") return {};
      if (name === "firebase-admin/app") return { getApps: () => [app] };
      if (name === "firebase-admin/auth") return { getAuth: () => auth };
      if (name === "firebase-admin/firestore")
        return { getFirestore: () => db };
      if (name === "firebase-admin/storage") return { getStorage: () => ({}) };
      throw new Error(name);
    },
  });
  const request = (token) =>
    new Request("http://localhost/api/admin/masters", {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
  await assert.rejects(
    api.authorizeAdmin(request()),
    (error) => error.status === 401,
  );
  await assert.rejects(
    api.authorizeAdmin(request("invalid")),
    (error) => error.status === 401,
  );
  await assert.rejects(
    api.authorizeAdmin(request("master-token")),
    (error) => error.status === 403,
  );
  const authorized = await api.authorizeAdmin(request("admin-token"));
  assert.equal(authorized.auth, auth);
  await assert.rejects(
    api.authorizeAdmin(
      new Request("http://localhost/api/admin/masters", {
        headers: {
          authorization: "Bearer admin-token",
          origin: "https://another-site.test",
        },
      }),
    ),
    (error) => error.status === 403,
  );
});
