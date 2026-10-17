// Credential encryption for the Sign in with ChatGPT SDK.
// A random AES-256 key lives in the OS credential store (Windows Credential
// Manager, macOS Keychain, or Secret Service on Linux). Saved tokens are
// encrypted with it using AES-256-GCM. There is no plaintext fallback.
import { AsyncEntry } from "@napi-rs/keyring";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const IV_BYTES = 12;
const TAG_BYTES = 16;

export function createKeyringEncryption(appId) {
  const entry = new AsyncEntry(appId, "credential-encryption-key");
  let keyPromise;

  async function loadKey() {
    const saved = await entry.getPassword();
    if (saved) {
      const key = Buffer.from(saved, "base64");
      if (key.length !== 32) throw new Error("The saved encryption key is damaged.");
      return key;
    }
    const key = randomBytes(32);
    await entry.setPassword(key.toString("base64"));
    return key;
  }

  // Retry on the next call if the credential store was briefly unavailable.
  const getKey = () => (keyPromise ??= loadKey().catch((error) => { keyPromise = undefined; throw error; }));

  return {
    id: "os-keyring-aes-256-gcm-v1",
    async isAvailable() {
      try { await getKey(); return true; } catch { return false; }
    },
    async encrypt(plaintext) {
      const key = await getKey();
      const iv = randomBytes(IV_BYTES);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
      return new Uint8Array(Buffer.concat([iv, cipher.getAuthTag(), body]));
    },
    async decrypt(ciphertext) {
      const key = await getKey();
      const data = Buffer.from(ciphertext);
      if (data.length < IV_BYTES + TAG_BYTES) throw new Error("Saved credentials are damaged.");
      const decipher = createDecipheriv("aes-256-gcm", key, data.subarray(0, IV_BYTES));
      decipher.setAuthTag(data.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
      return Buffer.concat([decipher.update(data.subarray(IV_BYTES + TAG_BYTES)), decipher.final()]).toString("utf8");
    },
  };
}
