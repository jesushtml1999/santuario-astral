// Run after reviewing the private snapshot. No source data is deleted.
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { parseEnv, isDeepStrictEqual } from "node:util";
import { initializeApp, cert, deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const SOURCE = "santuario-astral",
  TARGET = "santuario-astral-v2";
const snapshotFile = ".env.migration-v2-source.json";
const snapshot = JSON.parse(fs.readFileSync(snapshotFile, "utf8"));
assert.equal(snapshot.source, SOURCE);
assert.equal(snapshot.target, TARGET);
const apply = process.argv.includes("--apply");
if (!apply) {
  console.log(
    JSON.stringify({
      source: SOURCE,
      target: TARGET,
      apply: false,
      documents: snapshot.docs.length,
      authUsers: snapshot.users.length,
      passwordUsers: snapshot.users.filter((u) => u.passwordHash).length,
      instructions:
        "Review the snapshot, then run this script manually with --apply.",
    }),
  );
  process.exit(0);
}

const cli = createRequire(
  path.resolve("node_modules/firebase-tools/package.json"),
);
const { logger } = cli("./lib/logger");
for (const name of ["debug", "info", "warn", "error"]) logger[name] = () => {};

function rewriteReferences(value) {
  if (Array.isArray(value)) return value.map(rewriteReferences);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        key === "referenceValue" && typeof item === "string"
          ? item.replace(
              `projects/${SOURCE}/databases/`,
              `projects/${TARGET}/databases/`,
            )
          : rewriteReferences(item),
      ]),
    );
  return value;
}

const key = JSON.parse(
  fs.readFileSync(".env.v2-admin-credential.json", "utf8"),
);
assert.equal(key.project_id, TARGET);
const app = initializeApp(
  { projectId: TARGET, credential: cert(key) },
  "v2-migration",
);
try {
  // Refresh the private snapshot immediately before importing; retain the earlier backup.
  const sourceEnvFile = fs
    .readdirSync(".")
    .find((file) => file.startsWith(".env.local.before-v2-"));
  assert.ok(sourceEnvFile, "Original server credential backup is required.");
  const sourceEnv = parseEnv(fs.readFileSync(sourceEnvFile, "utf8"));
  assert.equal(sourceEnv.FIREBASE_ADMIN_PROJECT_ID, SOURCE);
  const sourceApp = initializeApp(
    {
      projectId: SOURCE,
      credential: cert({
        projectId: SOURCE,
        clientEmail: sourceEnv.FIREBASE_ADMIN_CLIENT_EMAIL,
        privateKey: sourceEnv.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, "\n"),
      }),
    },
    "v2-migration-source-readonly",
  );
  try {
    const sourceAccess = (await sourceApp.options.credential.getAccessToken())
      .access_token;
    const sourceApi = async (name, method = "GET", body) => {
      const response = await fetch(
        `https://firestore.googleapis.com/v1/${name}`,
        {
          method,
          headers: {
            Authorization: `Bearer ${sourceAccess}`,
            "Content-Type": "application/json",
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        },
      );
      if (!response.ok)
        throw new Error(
          `Source read failed (${response.status}); no import started.`,
        );
      return response.json();
    };
    const documents = [];
    const walk = async (parent) => {
      let collectionPage;
      do {
        const listing = await sourceApi(parent + ":listCollectionIds", "POST", {
          pageSize: 1000,
          ...(collectionPage ? { pageToken: collectionPage } : {}),
        });
        for (const collectionId of listing.collectionIds || []) {
          let documentPage;
          do {
            const params = new URLSearchParams({
              pageSize: "1000",
              showMissing: "true",
            });
            if (documentPage) params.set("pageToken", documentPage);
            const page = await sourceApi(
              parent + "/" + encodeURIComponent(collectionId) + "?" + params,
            );
            for (const document of page.documents || []) {
              if (document.fields || document.createTime)
                documents.push(document);
              await walk(document.name);
            }
            documentPage = page.nextPageToken;
          } while (documentPage);
        }
        collectionPage = listing.nextPageToken;
      } while (collectionPage);
    };
    await walk(`projects/${SOURCE}/databases/(default)/documents`);
    const users = [];
    let userPage;
    do {
      const page = await getAuth(sourceApp).listUsers(1000, userPage);
      users.push(...page.users.map((user) => user.toJSON()));
      userPage = page.pageToken;
    } while (userPage);
    fs.copyFileSync(
      snapshotFile,
      snapshotFile + ".before-" + Date.now(),
      fs.constants.COPYFILE_EXCL,
    );
    snapshot.docs = documents;
    snapshot.users = users;
    snapshot.createdAt = new Date().toISOString();
    fs.writeFileSync(snapshotFile, JSON.stringify(snapshot, null, 2));
  } finally {
    await deleteApp(sourceApp);
  }
  // Password parameters remain in memory; credentials are never printed.
  const cliAuth = cli("./lib/auth");
  const sourceOwner = cliAuth
    .getAllAccounts()
    .find((a) => a.user.email === "edgarhtml321@gmail.com");
  assert.ok(
    sourceOwner,
    "Sign Firebase CLI in as the original project owner first.",
  );
  const options = { project: SOURCE };
  cliAuth.setActiveAccount(options, sourceOwner);
  await cli("./lib/requireAuth").requireAuth(options);
  const { Client } = cli("./lib/apiv2");
  const client = new Client({
    urlPrefix: "https://identitytoolkit.googleapis.com",
    auth: true,
  });
  const config = (
    await client.get(`/admin/v2/projects/${SOURCE}/config`, {
      skipLog: { resBody: true },
    })
  ).body;
  const hash = config.signIn?.hashConfig;
  assert.equal(hash?.algorithm, "SCRYPT");

  const access = (await app.options.credential.getAccessToken()).access_token;
  async function api(name, method = "GET", body) {
    const response = await fetch(
      `https://firestore.googleapis.com/v1/${name}`,
      {
        method,
        headers: {
          Authorization: `Bearer ${access}`,
          "Content-Type": "application/json",
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      },
    );
    if (response.status === 404 && method === "GET") return null;
    const result = await response.json();
    if (!response.ok)
      throw new Error(
        `Firestore returned ${response.status}; stop and review before retrying.`,
      );
    return result;
  }

  // Preflight every destination document before importing accounts or writing data.
  const writes = [];
  for (const document of snapshot.docs) {
    const relative = document.name.split("/documents/")[1];
    assert.ok(relative && !relative.includes(".."));
    const update = {
      name: `projects/${TARGET}/databases/(default)/documents/${relative}`,
      fields: rewriteReferences(document.fields || {}),
    };
    const existing = await api(update.name);
    if (existing)
      assert.ok(
        isDeepStrictEqual(existing.fields || {}, update.fields),
        `Destination differs at ${relative}; no overwrite is allowed.`,
      );
    else writes.push({ update, currentDocument: { exists: false } });
  }

  const auth = getAuth(app),
    existingUsers = [];
  let pageToken;
  do {
    const page = await auth.listUsers(1000, pageToken);
    existingUsers.push(...page.users);
    pageToken = page.pageToken;
  } while (pageToken);
  for (const user of existingUsers) {
    const source = snapshot.users.find((item) => item.uid === user.uid);
    assert.ok(
      source,
      "Unexpected destination account; review before importing.",
    );
    assert.ok(
      user.email === source.email && user.disabled === source.disabled,
      "Destination identity differs; stop for review.",
    );
  }
  const existingIds = new Set(existingUsers.map((user) => user.uid));
  const records = snapshot.users
    .filter((user) => !existingIds.has(user.uid))
    .map((user) => {
      assert.ok(
        !user.multiFactor?.enrolledFactors?.length,
        "MFA needs a separate reviewed import.",
      );
      const record = {};
      for (const field of [
        "uid",
        "email",
        "emailVerified",
        "displayName",
        "photoURL",
        "phoneNumber",
        "disabled",
        "customClaims",
        "metadata",
      ])
        if (user[field] !== undefined) record[field] = user[field];
      record.providerData = (user.providerData || []).filter(
        (provider) => provider.providerId !== "password",
      );
      if (user.passwordHash) {
        record.passwordHash = Buffer.from(user.passwordHash, "base64");
        record.passwordSalt = Buffer.from(user.passwordSalt || "", "base64");
      }
      return record;
    });
  for (let offset = 0; offset < records.length; offset += 1000) {
    const result = await auth.importUsers(
      records.slice(offset, offset + 1000),
      {
        hash: {
          algorithm: "SCRYPT",
          key: Buffer.from(hash.signerKey, "base64"),
          saltSeparator: Buffer.from(hash.saltSeparator, "base64"),
          rounds: hash.rounds,
          memoryCost: hash.memoryCost,
        },
      },
    );
    assert.equal(
      result.failureCount,
      0,
      "An Auth import failed; stop and review the destination before retrying.",
    );
  }
  for (let offset = 0; offset < writes.length; offset += 400)
    await api(
      `projects/${TARGET}/databases/(default)/documents:commit`,
      "POST",
      { writes: writes.slice(offset, offset + 400) },
    );

  for (const source of snapshot.docs) {
    const relative = source.name.split("/documents/")[1];
    const migrated = await api(
      `projects/${TARGET}/databases/(default)/documents/${relative}`,
    );
    assert.ok(
      isDeepStrictEqual(
        migrated?.fields || {},
        rewriteReferences(source.fields || {}),
      ),
      "Document verification failed: " + relative,
    );
  }
  const verifiedUsers = new Map();
  pageToken = undefined;
  do {
    const page = await auth.listUsers(1000, pageToken);
    for (const user of page.users) verifiedUsers.set(user.uid, user);
    pageToken = page.pageToken;
  } while (pageToken);
  for (const source of snapshot.users) {
    const migrated = verifiedUsers.get(source.uid);
    assert.ok(
      migrated &&
        migrated.email === source.email &&
        migrated.disabled === source.disabled,
      "Identity verification failed.",
    );
    assert.ok(
      isDeepStrictEqual(migrated.customClaims, source.customClaims),
      "Role claim verification failed.",
    );
    if (source.passwordHash)
      assert.ok(
        migrated.toJSON().passwordHash === source.passwordHash,
        "Password hash verification failed.",
      );
  }
  const report = {
    source: SOURCE,
    target: TARGET,
    authUsersVerified: snapshot.users.length,
    documentsVerified: snapshot.docs.length,
    sourceDeleted: false,
    verifiedAt: new Date().toISOString(),
  };
  fs.mkdirSync(".firebase", { recursive: true });
  fs.writeFileSync(
    ".firebase/migration-v2-report.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report));
} finally {
  await deleteApp(app);
}
