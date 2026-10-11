# 09 — Security plan (no code yet)

Status: **proposal for your review, 11.10.2026.** Nothing here is implemented.
Why now: the real Идадија invoices, contracts and amounts are already in the system. The open items in doc 01 (S-02, S-03) are no longer theoretical.

Priority: **P0** = data can leak today · **P1** = misuse is possible by a logged-in user or by guessing · **P2** = hardening.

---

## 1. Summary

| ID | Item | Prio | Size | Needs from you |
|---|---|---|---|---|
| SEC-1 | Private document bucket + short-lived signed links | P0 | M | Approve the approach; a Supabase setting change |
| SEC-2 | Close the Supabase Data API path to the database (RLS / disable API) | P0 *(if confirmed)* | S | Check in the Supabase dashboard, or give me access |
| SEC-9 | Backups for the production database (free plan + hibernation) | P0 operational | S | Decision: Pro plan or scheduled dump |
| SEC-3 | Roles: Admin / Project manager / Site-Viewer | P1 | M–L | Confirm the permission matrix (§3) |
| SEC-4 | Tokens that expire; sign-out everywhere; revoke on password change | P1 | S–M | Choose the session length |
| SEC-5 | Login rate limiting (brute force) | P1 | S | — |
| SEC-6 | HTTPS and browser security headers (backend + Vercel) | P2 | S | — |
| SEC-7 | Lock down `/admin/` | P2 | S | — |
| SEC-8 | Check upload *contents*, not only the file extension | P2 | S | — |
| SEC-10 | Audit trail for money: who approved and who paid | P1 (with SEC-3) | S–M | — |
| SEC-11 | Secrets hygiene and key rotation | P2 | S | Rotate keys in Supabase/Railway |
| SEC-12 | Dependency vulnerability checks | P2 | S | — |

Proposed PRs: `security/storage` (SEC-1, SEC-8) → `security/supabase` (SEC-2, SEC-9; mostly settings, little code) → `security/auth` (SEC-4, SEC-5, SEC-6, SEC-7) → `security/roles` (SEC-3, SEC-10).

---

## 2. Details

### SEC-1 Private bucket + signed links (S-02) — P0

**Today:** `core/storage.py` → `SupabasePublicStorage.url()` builds `…/storage/v1/object/public/<bucket>/<path>`. The bucket is public. Anyone who has a link (from a forwarded e-mail, browser history, a screenshot) can open the invoice, permanently, without logging in. File names are predictable (`f-ra_A01.pdf`).

**Plan:**
1. Make the bucket **private** in Supabase.
2. The backend creates a **signed link valid for ~60 minutes** each time it returns a document (`DocumentSerializer.get_file_url`, and the invoice `document` link at `serializers.py:214`). The frontend already uses `file_url` everywhere (`TaskDetailPanel`, `OverviewPage`, `OperationalPage`), so **the frontend barely changes**.
3. How to sign: **SigV4 presigned URLs on Supabase's S3 endpoint.** Supabase documents this, and it reuses the existing S3 keys, so no service-role key is needed. Implemented on `security/supabase` (`core/storage.py`); `SUPABASE_PUBLIC_URLS=1` switches back to public links if needed. Still to verify on the preview deploy: a signed link opens and a tampered one is rejected.
4. Prefix new object keys with a random part (`documents/<project>/<uuid>/f-ra_A01.pdf`) so names cannot be guessed even if a bucket setting is wrong later.
5. Old public links stop working the moment the bucket goes private. That is the intended effect. Files stay where they are; nothing is migrated.

**Trade-off:** a page left open for more than an hour has expired links. Clicking refreshes the list, which is enough for this team. The alternative, streaming every file through Django, is more secure but costs Railway bandwidth and time on 25 MB PDFs. Not recommended for now.

**Test:** an old public URL returns 400/404; a signed URL works and stops working after it expires; a logged-out user cannot get a link.

### SEC-2 Supabase Data API exposure — P0 if confirmed

**Risk:** Django creates its tables in Postgres `public`. Supabase also publishes `public` through its REST/GraphQL **Data API**. If Row Level Security (RLS) is off on those tables, anyone with the project URL and the **anon key** could read or change them directly, bypassing Django. That includes `auth_user` (password hashes), `authtoken_token` (live login tokens) and every invoice. The anon key is designed to be public, so it is not a secret.

**Confirmed on 11.10.2026:** 29 tables, RLS off, and `anon` has SELECT + INSERT on all of them. Someone with the anon key could have read password hashes and live tokens, or **inserted their own superuser**. The 24 h of logs available show no such calls, and `auth_user` holds only the 2 known accounts. **Fix:** migration `0011_lock_supabase_data_api` (branch `security/supabase`) does steps 1–2 in SQL; **applied to the live database on 11.10.2026** (verified: 29/29 tables RLS on, 0 tables accessible to `anon`/`authenticated`; the Advisor now shows only the expected INFO "RLS enabled, no policy"). **How it was checked:** Supabase dashboard → *Advisors → Security*, or *Table editor* → look for "RLS disabled" on `core_*`, `auth_*` and `authtoken_*`.

**Plan (both, belt and braces):**
1. **Turn off the Data API** for the project (*Settings → API*), or remove `public` from the exposed schemas. Django doesn't use it, and the frontend doesn't use a Supabase client.
2. **Enable RLS on every table in `public` with no policies.** The Django connection uses the `postgres` role, which bypasses RLS, so the app is unaffected. This would be a Django migration so new tables are covered too.
3. If any token could have been exposed: **delete all rows in `authtoken_token`** (everyone logs in again) and rotate the anon/service keys.

### SEC-9 Backups — P0 operational

The project is on the Supabase **free plan** (it hibernates when idle). As far as I know, the free plan has **no downloadable daily backups and no point-in-time recovery**. Check current terms on the Supabase pricing page. Real project data now lives only there.

**Options:**
- **A (recommended):** upgrade to Pro. You get daily backups, no hibernation, and a first request that isn't slow.
- **B:** stay free, plus a nightly `pg_dump` (a GitHub Action or a Railway cron) to private storage, kept 30 days. Test a restore once.

Either way: a *restore test* before go-live, written down in the README.

### SEC-3 Roles (S-03, D-09) — P1

**Model (proposed):** `ProjectMembership(user, project, role)` with role ∈ `admin | pm | site`, plus Django's `is_superuser` as the global admin.
- This allows "Site user sees only their sites" later, without changing the model again.
- **For now (per D-09 "everyone sees everything"):** a user's role on every project = their default role on the user profile. Per-project membership is enforced only once you switch it on.

**Permission matrix** (please confirm or change):

| Action | Admin | PM | Site/Viewer |
|---|:-:|:-:|:-:|
| View projects, schedule, budget, documents | ✔ | ✔ | ✔ |
| Report progress %, actual start/end, issues, photos/documents | ✔ | ✔ | ✔ |
| Create/edit positions, dates, links, constraints, baselines, reschedule | ✔ | ✔ | — |
| Enter invoices | ✔ | ✔ | — |
| **Approve invoice** / **record payment** | ✔ | ✔ | — |
| Verify completed work | ✔ | ✔ | — |
| Delete position (soft) / restore | ✔ | ✔ | — |
| Excel import | ✔ | ✔ | — |
| Working calendar, vendors | ✔ | ✔ | — |
| Create/delete project, users, roles | ✔ | — | — |
| Django `/admin/` | ✔ | — | — |

Open questions:
- **Should "budget amounts and invoices" be hidden from Site users?** Many contractors do not want site staff to see prices. This is a common setting in commercial tools.
- **Should the person who enters an invoice also be allowed to approve it?** Four-eyes principle: optional, off by default.

**Enforcement:** in the API, through DRF permission classes per viewset and action. The UI only hides buttons; it is never the security boundary. The frontend reads the role from `/api/auth/me/`.

**Tests:** one test per row of the matrix, run against the API (allowed → 2xx, not allowed → 403).

### SEC-4 Token lifetime — P1

**Today:**
- DRF `Token` never expires.
- It is stored in `localStorage` (`frontend/src/lib/api.js`).
- Logout deletes the single token, which signs the user out on **every** device.
- A password change does not invalidate it.

A stolen token (shared laptop, browser extension, an XSS bug) works for ever.

**Plan:** expiring per-device tokens (e.g. `django-rest-knox`, or a small custom model):
- 12-hour sliding expiry, 30-day absolute limit. **Your choice of numbers.**
- Logout removes only that device's token; "Sign out everywhere" is in the user menu.
- A password change removes all tokens.

The token stays in `localStorage` for now. Moving to httpOnly cookies is safer but a larger change, so it is deferred. SEC-6 (CSP) reduces the XSS risk in the meantime.

### SEC-5 Login rate limit — P1

`LoginView` (`core/auth_views.py`) has no throttle. **Plan:** DRF scoped throttle, e.g. 10 attempts/min per IP and 20/hour per username, plus a generic error message (already the case). Optional: e-mail the admin after N failures.

### SEC-6 HTTPS and headers — P2

- Backend: `SECURE_SSL_REDIRECT`, `SESSION_COOKIE_SECURE`, `CSRF_COOKIE_SECURE`, HSTS (start with 1 day, then 1 year), `X_FRAME_OPTIONS=DENY`, all when DEBUG is off. `SECURE_PROXY_SSL_HEADER` is already set.
- Frontend (Vercel `vercel.json` headers): a Content-Security-Policy that allows only the API, Supabase storage, map tiles and Cesium; `Referrer-Policy: strict-origin-when-cross-origin`, so signed links don't leak through the Referer header; `X-Content-Type-Options: nosniff`.
- Check: securityheaders.com and the Mozilla Observatory score before and after.

### SEC-7 `/admin/` — P2

It is reachable at `https://<railway>/admin/` with session login. **Plan:** staff accounts only, strong passwords, the same rate limit, and optionally move it to a non-obvious path. 2FA can come later (`django-otp`).

### SEC-8 Upload contents — P2

`serializers.py:35` checks the **extension** only. **Plan:**
- Check the first bytes ("magic number"), so a `.pdf` really is a PDF.
- Force `Content-Disposition: attachment` for anything that isn't PDF or an image.
- Never serve SVG/HTML inline.

### SEC-10 Money audit trail — P1

`TaskAuditLog` covers tasks. Invoice approval, payments, and document upload or delete have no "who/when". **Plan:** record user + timestamp + old/new values for approve, payment, edit and delete on `Expense` and `Document`, and show them in *History*. This fits naturally with the `Payment` table (doc 08, A.4).

### SEC-11 Secrets — P2

- Keep the service-role key **only on Railway**, never in Vercel or `VITE_*` variables (anything `VITE_*` is public in the browser bundle).
- Rotate the Supabase S3 keys and `DJANGO_SECRET_KEY` once, after SEC-1/SEC-2. Rotating the secret key invalidates sessions; tokens are unaffected.
- `.env` files are git-ignored (verified in doc 01). Keep it that way.

### SEC-12 Dependencies — P2

`pip-audit` and `npm audit` in a GitHub Action on every PR, plus Dependabot for security updates.

---

## 3. Rollout and deploy steps (when approved)

1. **First, without code:** you check SEC-2 in the dashboard and decide on SEC-9. If RLS is off → turn off the Data API immediately (a 1-minute setting change) and clear the tokens.
2. PR `security/storage` → preview deploy → bucket set to private **at the same moment** as the deploy (otherwise links break or stay public).
3. PR `security/auth` → after the deploy everyone logs in once.
4. PR `security/roles` → before the deploy, assign the roles of the existing users (I'll ask you for the list).

## 4. Decisions needed (SD = security decision)

| ID | Question | Recommendation |
|---|---|---|
| SD-1 | Signed links (60 min) vs. streaming through Django | Signed links |
| SD-2 | Supabase Pro vs. free + nightly dump | **Decided 11.10.2026: stay on free** → nightly dump (option B) |
| SD-3 | Permission matrix §SEC-3 OK? Hide prices from Site users? | Matrix as shown; prices visible for now |
| SD-4 | Four-eyes on invoice approval? | Off, available as a setting |
| SD-5 | Session length | 12 h sliding, 30 days max |
| SD-6 | Who are the users today and what role does each get? | — |

## 5. Out of scope here

- SSO / Google login, 2FA for all users: later, once there are external users (investors, subcontractors).
- GDPR formalities (privacy notice, data-processing agreement with Supabase/Railway): needed before buyers' personal data (CRM) is used in earnest. Flagged, not planned.

## 6. Licence check (not security, but a compliance risk)

D-08 kept Cesium "because it's not for commercial use". A construction company using the app to run its own projects is very likely **commercial use** under the free tiers of **Cesium ion** and **Esri World Imagery**.
**Action:** read both current terms, then choose: a paid plan, or an alternative. For satellite imagery: Mapbox, MapTiler, or the Macedonian cadastre (АКН) orthophoto if its terms allow. 3D could be dropped or replaced with a free 2.5D map (MapLibre + terrain).
