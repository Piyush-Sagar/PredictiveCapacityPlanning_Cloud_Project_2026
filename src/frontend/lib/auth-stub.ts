import type { CurrentUser } from "@/lib/types";

/**
 * Mock-mode user. In live mode (NEXT_PUBLIC_DATA_MODE=live) the signed-in
 * Cognito user comes from the ID token via `lib/session.tsx` instead.
 */
export const CURRENT_USER: CurrentUser = {
  name: "Ops Demo User",
  role: "operator",
  avatarInitials: "OD",
};

export function getCurrentUser(): CurrentUser {
  return CURRENT_USER;
}
