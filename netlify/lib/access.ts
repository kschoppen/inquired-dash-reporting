/**
 * Who may open the dash. Sign-in already limits it to inquired.com Google accounts (functions/auth.mts);
 * this list narrows it to named people. The edge gate checks it on every request, so removing someone
 * takes effect on the next deploy, even if they are still signed in.
 *
 * One lowercase inquired.com email per line. An EMPTY list means everyone at inquirED may open the dash.
 * To add or remove someone: edit the list, commit, push to main.
 */
export const ALLOWED: string[] = [
  'k.schoppen@inquired.com',   // Kelsey Schoppen (owner)
  'e.schimke@inquired.com',    // Elise Schimke
  'e.maki@inquired.com',       // Elizabeth Maki
  'm.andrews@inquired.com',    // Martin Andrews
  'j.baum@inquired.com',       // Jeanette Hardy Baum
  'm.lee@inquired.com',        // Meagan Lee
  'o.page@inquired.com',       // Olivia Page
  't.israel@inquired.com',     // Tim Israel
  's.elangovan@inquired.com',  // Shanti Elangovan
  'a.hanna@inquired.com',      // Allison Hanna
];

const list = new Set(ALLOWED.map((e) => e.trim().toLowerCase()).filter(Boolean));
export const mayOpen = (email: string) => list.size === 0 || list.has(email.trim().toLowerCase());
