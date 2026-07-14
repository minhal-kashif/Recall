# Recall — Security & Access Document

**Status:** Draft v1
**Last updated:** 14 July 2026
**Companion docs:** Recall_PRD.md, Recall_Technical_Architecture.md

---

## 1. Principle

No system is "unhackable" — any claim of that kind is a red flag, not a guarantee. What's achievable, and what this document defines, is **removing the common, exploitable weaknesses** that cause almost all real-world breaches: leaked keys, missing access control, weak auth, unencrypted secrets, and unvalidated input. Done properly, Recall becomes a genuinely low-value, high-effort target — which is the realistic bar to aim for.

---

## 2. Authentication

- Google Sign-In (OAuth via Supabase Auth) — no passwords stored or handled by Recall at all, which removes an entire category of risk (password leaks, weak passwords, credential stuffing)
- Every API request is authenticated via Supabase's JWT, verified server-side on every single request — never trusted from the client
- Sessions expire and refresh via Supabase's standard token rotation; no custom session logic to get wrong

---

## 3. Data Access Control (Row-Level Security)

- **Every table** (`contacts`, `buyer_details`, `seller_details`, `interactions`, `follow_ups`) has Postgres Row-Level Security enabled
- Every policy enforces `user_id = auth.uid()` — meaning even if there were a bug in the application code, the database itself refuses to return another user's data
- This is enforced at the database layer, not just the application layer — the strongest place to put this rule, since it holds even if a future screen or endpoint is coded carelessly

---

## 4. Secrets Management

- **No API keys or secrets ever committed to code or git.** All keys (Supabase service role key, future OpenAI/Claude keys) live in environment variables (`.env`), which is included in `.gitignore` from the very first commit
- The Supabase **service role key** (which bypasses RLS) is never used in any client-facing code — only in trusted server-side functions, and only where absolutely necessary
- The frontend only ever uses the public **anon key**, which is safe to expose and relies entirely on RLS for protection

---

## 5. Input Validation

- All API inputs (contact fields, notes, follow-up text) are validated and sanitized server-side before touching the database — never trust data coming from the client, even your own app's client
- Supabase's use of parameterized queries (via its client libraries) protects against SQL injection by default, as long as raw string-concatenated queries are never written by hand

---

## 6. Data in Transit & at Rest

- All traffic between the PWA, Express backend, and Supabase runs over HTTPS — no exceptions, enforced by default on Supabase and any standard hosting provider
- Supabase encrypts data at rest by default at the infrastructure level

---

## 7. Backups

- **Free tier does not include automatic backups** — this is a real gap while Recall is on the free plan
- Until upgraded, a lightweight periodic export (e.g. a scheduled script dumping the database to a private, encrypted storage location) should be set up manually — this is a near-term task, not something to defer indefinitely once real client data is in the app
- Once there's real production usage (your father's actual daily-use data), upgrading to Supabase Pro ($25/month) adds Point-in-Time Recovery and automatic daily backups — worth doing at that point, not before

---

## 8. Audio & File Storage (Stage 3+, deferred)

When voice notes are added later:
- Audio files stored in a **private** Supabase Storage bucket, never a public one
- Access only via short-lived signed URLs generated server-side, never permanent public links
- File access still governed by the same RLS-style ownership rules as everything else

---

## 9. Team-Tier Access (Stage 5, deferred)

When broker/team accounts are introduced:
- A manager can see their team's contacts; agents cannot see each other's contacts unless explicitly shared
- This requires extending RLS policies to check team membership, not just direct ownership — to be designed in detail closer to Stage 5

---

## 10. What This Does *Not* Cover (be aware, don't ignore)

- **Device-level security is outside the app's control** — if your father's phone itself is compromised (malware, unlocked/shared device, phishing), no app-level protection prevents data exposure. Worth a basic conversation with him about phone security (screen lock, not clicking unknown links) once the app holds real client data.
- **Social engineering** (e.g. someone tricking him into sharing his Google login) is not something code can fully prevent — good account hygiene matters alongside good code.
- Formal penetration testing / third-party security audits are not in scope for a solo-built MVP, but worth considering **before** any paid team-tier launch, once real money and multiple users' data are involved.

---

## 11. Practical Summary for Build Day

The single highest-leverage thing to get right in Stage 1, non-negotiably:
1. RLS enabled and tested on every table before any real data goes in
2. `.env` in `.gitignore` from the first commit — never once let a key touch git history
3. Every API route checks the authenticated user's identity server-side, no exceptions

Everything else in this document matters, but these three are the ones that would actually cause a real breach if skipped.
