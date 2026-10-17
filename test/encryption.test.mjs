import { test, after } from "node:test";
import assert from "node:assert/strict";
import { AsyncEntry } from "@napi-rs/keyring";
import { createKeyringEncryption } from "../lib/encryption.mjs";

// Uses a throwaway credential-store entry and removes it afterward.
const TEST_ID = `write-human-test-${process.pid}`;
after(async () => { await new AsyncEntry(TEST_ID, "credential-encryption-key").deletePassword().catch(() => {}); });

test("round-trips through the OS credential store", async () => {
  const enc = createKeyringEncryption(TEST_ID);
  assert.equal(await enc.isAvailable(), true);
  const secret = JSON.stringify({ accessToken: "synthetic-token", refreshToken: "synthetic-refresh" });
  const sealed = await enc.encrypt(secret);
  assert.ok(!Buffer.from(sealed).toString("utf8").includes("synthetic-token"));
  assert.equal(await enc.decrypt(sealed), secret);
  // A second instance reads the same saved key.
  assert.equal(await createKeyringEncryption(TEST_ID).decrypt(sealed), secret);
});

test("rejects tampered data", async () => {
  const enc = createKeyringEncryption(TEST_ID);
  const sealed = await enc.encrypt("hello");
  sealed[sealed.length - 1] ^= 1;
  await assert.rejects(enc.decrypt(sealed));
});
