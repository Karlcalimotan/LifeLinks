#!/usr/bin/env node
/*
 * Generate a VAPID keypair for browser push.
 *
 *   pnpm vapid
 *
 * The public key is the base64url of the uncompressed P-256 point (65 bytes
 * starting with 0x04). The private key is the base64url of the 32-byte scalar.
 * These are the formats `web-push` expects. The generator self-checks that the
 * private key reproduces the public key before printing anything.
 *
 * Keys are secrets. Keep them in the deployment environment (or an uncommitted
 * `.env`), never in git, a log, a screenshot or a chat.
 */

import { createECDH, generateKeyPairSync } from "node:crypto";

const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });

// JWK gives the affine coordinates and the scalar directly; DER slicing depends
// on the encoding details of the Node build.
const jwk = privateKey.export({ format: "jwk" });
const rawPublic = Buffer.concat([
	Buffer.from([0x04]),
	Buffer.from(jwk.x, "base64url"),
	Buffer.from(jwk.y, "base64url"),
]);
const rawPrivate = Buffer.from(jwk.d, "base64url");

if (rawPublic.length !== 65 || rawPublic[0] !== 0x04) {
	throw new Error("Unexpected P-256 public key encoding.");
}
if (rawPrivate.length !== 32) {
	throw new Error("Unexpected P-256 private key encoding.");
}

const ecdh = createECDH("prime256v1");
ecdh.setPrivateKey(rawPrivate);
if (!ecdh.getPublicKey().equals(rawPublic)) {
	throw new Error("VAPID keypair self-check failed.");
}

const publicKeyB64 = rawPublic.toString("base64url");
const privateKeyB64 = rawPrivate.toString("base64url");

console.log("# LifeLink Web Push (VAPID) keys");
console.log("# Add these to apps/web/.env (or the deployment environment).");
console.log("# Replace the subject with a contact a push service can reach.");
console.log("");
console.log(`NEXT_PUBLIC_VAPID_PUBLIC_KEY="${publicKeyB64}"`);
console.log(`VAPID_PRIVATE_KEY="${privateKeyB64}"`);
console.log('VAPID_SUBJECT="mailto:ops@example.com"');
console.log("");
console.log("# Rotating these keys invalidates every existing subscription.");
