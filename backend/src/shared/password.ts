import bcrypt from "bcryptjs";

const HASH_ROUNDS = 10;

/**
 * Password every account starts on — assigned to existing officers when
 * ID/password sign-in was introduced, and what an ADMIN's "reset password"
 * action restores an account to. Officers change it from Settings.
 */
export const DEFAULT_PASSWORD = "Alfa@1991";

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, HASH_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
