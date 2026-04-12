/**
 * Branded type for authenticated user IDs. Can only be constructed via
 * `authedUserId()`, which should be called at auth boundaries (route
 * handlers, page components) after `auth()` confirms the session.
 *
 * This makes `getArticle(req.body.userId, id)` a type error — you'd need
 * `getArticle(authedUserId(req.body.userId), id)`, which is an obvious
 * red flag in code review.
 */
export type AuthedUserId = string & { readonly __brand: "AuthedUserId" };

/**
 * Construct an AuthedUserId from a verified Clerk user ID.
 * Only call this at auth boundaries — never on unvalidated user input.
 */
export function authedUserId(clerkUserId: string): AuthedUserId {
  return clerkUserId as AuthedUserId;
}
