import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

test("Firebase Admin loads and resolves signing keys in a CommonJS serverless runtime", () => {
  const result = spawnSync(
    process.execPath,
    [
      "--no-experimental-require-module",
      "-e",
      `
        const assert = require('node:assert/strict');
        const crypto = require('node:crypto');
        require('firebase-admin/auth');
        require('firebase-admin/firestore');
        const jwksClient = require('jwks-rsa');
        (async () => {
          const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
          const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'runtime-test', alg: 'RS256', use: 'sig' };
          const client = jwksClient({
            jwksUri: 'https://invalid.example/jwks',
            cache: false,
            fetcher: async () => ({ keys: [jwk] }),
          });
          const key = await client.getSigningKey('runtime-test');
          const payload = Buffer.from('Firebase Admin runtime compatibility');
          const signature = crypto.sign('RSA-SHA256', payload, privateKey);
          assert.equal(crypto.verify('RSA-SHA256', payload, key.getPublicKey(), signature), true);
          assert.equal(crypto.verify('RSA-SHA256', Buffer.from('tampered'), key.getPublicKey(), signature), false);
        })().catch(error => { console.error(error); process.exitCode = 1; });
      `,
    ],
    { cwd: new URL("..", import.meta.url), encoding: "utf8", timeout: 15_000 },
  );
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
