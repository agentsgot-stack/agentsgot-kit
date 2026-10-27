import { createCipheriv, createDecipheriv, randomBytes, randomUUID, scryptSync } from "node:crypto";
import { bytesToHex, hexToBytes, keccak256 } from "viem";
import { privateKeyToAccount } from "viem/accounts";

/** Ethereum V3 keystore (scrypt + aes-128-ctr), compatible with geth / MetaMask / ethers. */
export interface KeystoreV3 {
  version: 3;
  id: string;
  address: string;
  crypto: {
    cipher: "aes-128-ctr";
    cipherparams: { iv: string };
    ciphertext: string;
    kdf: "scrypt";
    kdfparams: { dklen: number; salt: string; n: number; r: number; p: number };
    mac: string;
  };
}

const N = 1 << 17;
const R = 8;
const P = 1;
const DKLEN = 32;

function derive(password: string, salt: Buffer, n: number, r: number, p: number, dklen: number) {
  return scryptSync(password.normalize("NFKC"), salt, dklen, {
    N: n,
    r,
    p,
    maxmem: 256 * n * r + 1024 * 1024,
  });
}

function mac(derived: Buffer, ciphertext: Buffer): string {
  return keccak256(new Uint8Array(Buffer.concat([derived.subarray(16, 32), ciphertext]))).slice(2);
}

export function encryptKeystore(privateKey: `0x${string}`, password: string): KeystoreV3 {
  if (password.length < 8) throw new Error("Keystore password must have at least 8 characters.");
  const salt = randomBytes(32);
  const iv = randomBytes(16);
  const derived = derive(password, salt, N, R, P, DKLEN);
  const cipher = createCipheriv("aes-128-ctr", derived.subarray(0, 16), iv);
  const ciphertext = Buffer.concat([
    cipher.update(Buffer.from(hexToBytes(privateKey))),
    cipher.final(),
  ]);
  return {
    version: 3,
    id: randomUUID(),
    address: privateKeyToAccount(privateKey).address.slice(2).toLowerCase(),
    crypto: {
      cipher: "aes-128-ctr",
      cipherparams: { iv: iv.toString("hex") },
      ciphertext: ciphertext.toString("hex"),
      kdf: "scrypt",
      kdfparams: { dklen: DKLEN, salt: salt.toString("hex"), n: N, r: R, p: P },
      mac: mac(derived, ciphertext),
    },
  };
}

export function decryptKeystore(keystore: KeystoreV3, password: string): `0x${string}` {
  const { crypto } = keystore;
  if (crypto.kdf !== "scrypt" || crypto.cipher !== "aes-128-ctr")
    throw new Error("Unsupported keystore: only scrypt + aes-128-ctr V3 keystores are supported.");
  const { salt, n, r, p, dklen } = crypto.kdfparams;
  const derived = derive(password, Buffer.from(salt, "hex"), n, r, p, dklen);
  const ciphertext = Buffer.from(crypto.ciphertext, "hex");
  if (mac(derived, ciphertext) !== crypto.mac.toLowerCase())
    throw new Error("Wrong keystore password.");
  const decipher = createDecipheriv(
    "aes-128-ctr",
    derived.subarray(0, 16),
    Buffer.from(crypto.cipherparams.iv, "hex"),
  );
  const key = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return bytesToHex(new Uint8Array(key));
}
