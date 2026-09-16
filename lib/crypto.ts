import crypto from "node:crypto";

/**
 * AES-256-GCM для пароля 1С (docs plan-v1.md §8/§14) — ключ поза базою,
 * у змінній середовища ONEC_PASSWORD_KEY (32 байти, base64). Формат
 * запису: base64(iv) + "." + base64(authTag) + "." + base64(ciphertext).
 */
function getKey(): Buffer {
  const raw = process.env.ONEC_PASSWORD_KEY;
  if (!raw) throw new Error("ONEC_PASSWORD_KEY не заданий у .env");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("ONEC_PASSWORD_KEY має бути 32 байти в base64");
  return key;
}

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${authTag.toString("base64")}.${ciphertext.toString("base64")}`;
}

export function decryptSecret(stored: string): string {
  const [ivB64, authTagB64, ciphertextB64] = stored.split(".");
  if (!ivB64 || !authTagB64 || !ciphertextB64) throw new Error("Невірний формат зашифрованого значення");

  const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(authTagB64, "base64"));
  const plain = Buffer.concat([decipher.update(Buffer.from(ciphertextB64, "base64")), decipher.final()]);
  return plain.toString("utf8");
}
