/**
 * Who may open the dash. Sign-in already limits it to inquired.com Google accounts (functions/auth.mts);
 * this list narrows it to named people. The edge gate checks it on every request, so removing someone
 * takes effect on the next deploy, even if they are still signed in.
 *
 * One lowercase inquired.com email per line. An EMPTY list means everyone at inquirED may open the dash.
 * To add or remove someone: edit the list, commit, push to main.
 */
export const ALLOWED: string[] = [
];

const list = new Set(ALLOWED.map((e) => e.trim().toLowerCase()).filter(Boolean));
export const mayOpen = (email: string) => list.size === 0 || list.has(email.trim().toLowerCase());
