import nacl from "tweetnacl";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { requireOptionalNativeModule } from "expo-modules-core";

// ---------------------------------------------------------------------------
// End-to-end encryption for chat messages (1:1 and groups).
//
// Each user has an identity box keypair (Curve25519). The private key never
// leaves the device; the public key is uploaded to the server. A message is
// encrypted once with a random per-message key (secretbox), and that key is
// then wrapped (box) for every conversation member, including the sender, so
// each member can open it. The server only ever stores the opaque envelope.
//
// The envelope is self-contained — it carries the sender's public key and the
// per-member wrapped keys — so DECRYPTION only needs the reader's own keys.
// Only ENCRYPTION needs the members' public keys.
// ---------------------------------------------------------------------------

const SK_KEY = "zapp.e2ee.secretKey";
const PK_KEY = "zapp.e2ee.publicKey";
const PREFIX = "E2EE:1:";

type KeyPair = { publicKey: Uint8Array; secretKey: Uint8Array };
let keys: KeyPair | null = null;
let prngReady = false;

// --- secure randomness (tweetnacl needs a CSPRNG) ---
(function initPRNG() {
  try {
    if (requireOptionalNativeModule("ExpoCrypto")) {
      const Crypto = require("expo-crypto");
      nacl.setPRNG((x, n) => {
        const b = Crypto.getRandomBytes(n);
        for (let i = 0; i < n; i++) x[i] = b[i];
      });
      prngReady = true;
      return;
    }
  } catch {
    /* fall through */
  }
  try {
    const g: any = globalThis;
    if (g?.crypto?.getRandomValues) {
      nacl.setPRNG((x, n) => g.crypto.getRandomValues(x.subarray(0, n)));
      prngReady = true;
    }
  } catch {
    /* no CSPRNG available */
  }
})();

export function cryptoAvailable(): boolean {
  return prngReady;
}

// --- base64 (RN-safe, no Buffer/atob dependency) ---
const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function toB64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i], b1 = bytes[i + 1], b2 = bytes[i + 2];
    out += A[b0 >> 2];
    out += A[((b0 & 3) << 4) | ((b1 ?? 0) >> 4)];
    out += i + 1 < bytes.length ? A[((b1 & 15) << 2) | ((b2 ?? 0) >> 6)] : "=";
    out += i + 2 < bytes.length ? A[b2 & 63] : "=";
  }
  return out;
}
function fromB64(b64: string): Uint8Array {
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, "");
  const len = Math.floor((clean.length * 3) / 4);
  const out = new Uint8Array(len);
  let p = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const c0 = A.indexOf(clean[i]), c1 = A.indexOf(clean[i + 1]);
    const c2 = A.indexOf(clean[i + 2]), c3 = A.indexOf(clean[i + 3]);
    out[p++] = (c0 << 2) | (c1 >> 4);
    if (c2 >= 0) out[p++] = ((c1 & 15) << 4) | (c2 >> 2);
    if (c3 >= 0) out[p++] = ((c2 & 3) << 6) | c3;
  }
  return out.subarray(0, p);
}

// --- utf8 ---
function toUtf8(str: string): Uint8Array {
  const u = unescape(encodeURIComponent(str));
  const out = new Uint8Array(u.length);
  for (let i = 0; i < u.length; i++) out[i] = u.charCodeAt(i);
  return out;
}
function fromUtf8(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return decodeURIComponent(escape(s));
}

// --- key management ---
export async function ensureKeys(): Promise<string | null> {
  if (!prngReady) return null;
  if (keys) return toB64(keys.publicKey);
  try {
    const [sk, pk] = await Promise.all([
      AsyncStorage.getItem(SK_KEY),
      AsyncStorage.getItem(PK_KEY),
    ]);
    if (sk && pk) {
      keys = { secretKey: fromB64(sk), publicKey: fromB64(pk) };
    } else {
      const kp = nacl.box.keyPair();
      keys = { publicKey: kp.publicKey, secretKey: kp.secretKey };
      await AsyncStorage.multiSet([
        [SK_KEY, toB64(kp.secretKey)],
        [PK_KEY, toB64(kp.publicKey)],
      ]);
    }
    return toB64(keys.publicKey);
  } catch {
    return null;
  }
}

export function myPublicKeyB64(): string | null {
  return keys ? toB64(keys.publicKey) : null;
}

export function isEncrypted(body: string): boolean {
  return typeof body === "string" && body.startsWith(PREFIX);
}

type Member = { id: number; publicKey?: string | null };

// Encrypt `plaintext` for every member (incl. me). Returns an envelope string,
// or null if we can't (no crypto / no keys) so the caller can fall back.
export function encryptMessage(plaintext: string, members: Member[], myId: number): string | null {
  if (!prngReady || !keys) return null;
  const withKeys = members.filter((m) => m.publicKey);
  // Always include myself so I can read my own message.
  if (!withKeys.some((m) => m.id === myId)) {
    withKeys.push({ id: myId, publicKey: toB64(keys.publicKey) });
  }
  if (withKeys.length === 0) return null;

  try {
    const mk = nacl.randomBytes(nacl.secretbox.keyLength);
    const msgNonce = nacl.randomBytes(nacl.secretbox.nonceLength);
    const cipher = nacl.secretbox(toUtf8(plaintext), msgNonce, mk);

    const k: Record<string, { n: string; k: string }> = {};
    for (const m of withKeys) {
      const wrapNonce = nacl.randomBytes(nacl.box.nonceLength);
      const wrapped = nacl.box(mk, wrapNonce, fromB64(m.publicKey as string), keys.secretKey);
      k[String(m.id)] = { n: toB64(wrapNonce), k: toB64(wrapped) };
    }

    const env = { v: 1, s: toB64(keys.publicKey), n: toB64(msgNonce), c: toB64(cipher), k };
    return PREFIX + toB64(toUtf8(JSON.stringify(env)));
  } catch {
    return null;
  }
}

// Decrypt an envelope using only my own keys. Returns plaintext, or null if it
// isn't an envelope / can't be opened.
export function decryptMessage(body: string, myId: number): string | null {
  if (!isEncrypted(body) || !keys) return null;
  try {
    const env = JSON.parse(fromUtf8(fromB64(body.slice(PREFIX.length))));
    const mine = env.k?.[String(myId)];
    if (!mine) return null;
    const mk = nacl.box.open(
      fromB64(mine.k),
      fromB64(mine.n),
      fromB64(env.s),
      keys.secretKey
    );
    if (!mk) return null;
    const plain = nacl.secretbox.open(fromB64(env.c), fromB64(env.n), mk);
    if (!plain) return null;
    return fromUtf8(plain);
  } catch {
    return null;
  }
}
