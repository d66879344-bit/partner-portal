# Partner Portal

A standalone site, fully independent from the earlier document-intake project (different
GitHub repo, different Cloudflare Pages project, its own R2 bucket and its own database).

- `/` — landing page (links to Register / Sign in)
- `/register.html` — partner self-registration: account (email+password) + company +
  up to 2 vehicles + up to 2 drivers + documents. **No admin approval is needed to create
  the account** — the partner can sign in right away.
- `/login.html` — partner sign-in.
- `/partner-dashboard.html` — partner's own view:
  - **Orders** tab, split into **New** (awaiting Accept/Decline) and **Accepted** (history —
    accepted / declined / completed / cancelled, each showing its status). Click any order
    card to open its full details (flight number, passenger name/phone with call & SMS
    links, passengers/luggage, meet & greet, instructions) and optionally assign one of
    your own registered drivers/vehicles to it.
  - **Fleet & Documents** tab — vehicles, drivers, documents with approval status; can add
    more vehicles/drivers and documents any time
  - **Account** tab
- `/admin.html` — your admin view:
  - **Partners** tab — expand a partner to review each document (Approve/Reject), and
    **Activate account** / **Block account**. Approving documents does *not* by itself flip
    the account to active — you click **Activate account** once you're satisfied; this is
    what lets that partner start receiving orders. **Block account** prevents sign-in
    entirely (for abuse/fraud cases).
  - **Orders** tab — create an order with full trip details (flight number, passenger
    name/phone, passengers/luggage, vehicle type from a dropdown, meet & greet, instructions)
    and assign it to one specific partner (only active partners are selectable); you can
    optionally also pre-assign one of that partner's own registered drivers/vehicles. Click
    any order in **All orders** to see full details, reassign the driver/vehicle, or mark
    it **Completed** / **Cancel**.

Orders are never broadcast to a pool — each one is assigned to exactly one partner and only
they see it.

## 1. Create the R2 bucket

1. Cloudflare dashboard → **R2** → **Create bucket**.
2. Name it e.g. `partner-portal-documents`. Location: Automatic. Create.

## 2. Create the D1 database

1. Cloudflare dashboard → **Workers & Pages** → **D1 SQL Database** → **Create database**.
2. Name it e.g. `partner-portal-db`. Create.
3. Open it → **Console** tab. Open `schema.sql` from this project, copy its entire
   contents, paste into the console, run it. This creates the tables.

## 3. Create a new GitHub repository

1. [github.com/new](https://github.com/new) → name it e.g. `partner-portal` → Create.
2. Upload the contents of this project (everything inside the `partner-portal-site`
   folder you were sent — not the folder itself) via **Add file → Upload files** → drag
   in all files/folders → Commit changes. Same drag-and-drop approach as before.

## 4. Create the Pages project

1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
2. Pick the new `partner-portal` repository.
3. Framework preset: `None`. Build command: empty. Build output directory: `/`.
4. **Save and Deploy**. The pages will load but the API calls won't work yet — continue
   to step 5.

## 5. Bindings and secrets

In the new Pages project → **Settings** → **Functions** (or **Bindings**):

1. **R2 bucket bindings** → Add binding:
   - Variable name: `BUCKET` (exactly this)
   - R2 bucket: `partner-portal-documents`
2. **D1 database bindings** → Add binding:
   - Variable name: `DB` (exactly this)
   - D1 database: `partner-portal-db`
3. **Environment Variables** → add two **secrets**:
   - `ADMIN_SECRET` — your admin password for `/admin.html`
   - `SESSION_SECRET` — any long random string (30+ characters) that signs partner login
     sessions. Keep it secret.
4. Add all of the above to **both** Production and Preview environments.
5. **Deployments** tab → **Retry deployment** so everything takes effect.

## 6. (Optional) custom domain

Pages project → **Custom domains** → add e.g. `partners.uptowntaxis.com`, same as before.

## Using it

- Send partners `/register.html`. They create their login, fill in company/vehicles/
  drivers, upload documents, and can sign in immediately.
- Open `/admin.html`, enter `ADMIN_SECRET` → **Partners** tab → expand an application →
  review each document → **Activate account** once satisfied. Until then the partner can
  still sign in and manage their documents, they just won't receive orders.
- **Orders** tab → fill in the form, pick the (active) partner, **Create & assign**.
- The partner sees it under their dashboard's **Orders → New** tab and clicks **Accept**
  or **Decline**. Once they respond, it moves to their **Accepted** tab (showing its
  status). You can mark it **Completed** or **Cancel** it from the admin Orders tab any time.

## Notes and limits

- Files up to 20 MB each; PDF, JPG, PNG, WebP, GIF.
- No email notifications yet (new registration, new document, new order) — check
  `/admin.html` periodically, or ask to add email/Telegram notifications later.
- No "forgot password" flow yet for partners — ask and I'll add one (or a quick admin-side
  "set new password" control) when you need it.
- The admin password is a simple shared secret — don't share the admin link/password
  outside your team. Partner accounts use properly hashed passwords and signed sessions.
- This project is completely separate from the earlier document-intake site: separate
  repo, separate Pages project, separate R2 bucket, separate database. Nothing here
  touches that one.
- Any push to this GitHub repository redeploys the site automatically within a minute
  or two.
