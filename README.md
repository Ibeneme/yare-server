# Yare server

Express 5 + Mongoose + Socket.io API for Yare Height Learning Hub.

## Run

```bash
cp .env.example .env     # fill in MONGO_URI, JWT_SECRET, EMAIL_*, PAYSTACK_SECRET_KEY
npm install
npm run dev              # or: npm start
npm run smoke            # boots the app without a database and checks guards, webhook, reminder maths, socket auth
```

## Structure

```
src/
  server.js          boot: env → DB → seed Super Admin → HTTP + sockets → cron jobs
  app.js             Express app, raw-body capture, Paystack webhook, routes, error handling
  config/            env, constants (roles, currencies), db
  models/            Mongoose models
  controllers/       request handlers for the new modules
  routes/            all URL mapping (legacy routers keep their handlers inline for now)
  services/          business logic: payments, pricing, schedule, class access, seeding, mail, tokens
  middlewares/       auth (JWT + requireRoles), admin auth, error handling
  sockets/           Socket.io classroom (state + handlers)
  jobs/              node-cron jobs: class reminders, subscription expiry
  templates/         email HTML
scripts/smoke.js
```

## Roles

| Role | How the account is created |
|---|---|
| Super Admin | Seeded on boot as `ikennaibenemee@gmail.com` (only if no Super Admin exists, so a transfer is never undone by a restart). Password from `SUPER_ADMIN_PASSWORD`, otherwise random and emailed to that address. |
| Admin | Super Admin only: `POST /api/super-admin/admins` |
| Teacher | Admin or Super Admin: `POST /api/users/create` with `userType: "teacher"` |
| Parent | Public signup: `/api/users/register-parent` (OTP) then `/api/users/register-students` |
| Student | Public signup: `POST /api/users/signup/student` (no parent needed), or added by a parent as a ward |

Super Admin tokens carry `userType: "admin"` plus `role: "superadmin"`, so every existing admin check still passes, and the Super-Admin-only routes check `role`.

Hand over the role: `GET /api/super-admin/transfer/candidates`, then `POST /api/super-admin/transfer { teacherId }`. The teacher becomes Super Admin (same email and password, on the admin sign-in page) and the previous Super Admin becomes an admin. The response includes a fresh token for the demoted account.

## New endpoints

| Area | Endpoints |
|---|---|
| Super Admin | `POST/GET /api/super-admin/admins`, `PATCH …/admins/:id/suspend`, `DELETE …/admins/:id`, `GET …/transfer/candidates`, `POST …/transfer` |
| Pricing (NGN + USD) | `GET /api/pricing` (any signed-in user, active rows), `POST /api/pricing` (upsert by kind+refId), `PUT/DELETE /api/pricing/:id`. `kind` is `grade`, `subject` or `perk`. |
| Payments | `POST /api/payment/yare/pay/pay-lesson-fee` (now takes `currency: "NGN" \| "USD"`), `GET …/verify-lesson-fee/:reference`, **`POST /api/payment/webhook/paystack`** |
| Transactions | `GET /api/transactions/mine` (parent), `GET /api/transactions` (admin, filters + revenue per currency), `GET /api/transactions/:id` |
| Wards (parent) | `GET /api/wards/catalogue`, `GET/POST /api/wards`, `PUT/DELETE /api/wards/:id` (grade + subject enrollment) |
| Groups (admin) | `GET/POST /api/groups`, `PUT/DELETE /api/groups/:id` |
| Classes | `POST /api/class/class` now accepts `gradeId`, `audience: "grade" \| "groups" \| "students"`, `groupIds`; schedules are the existing daily/weekly/monthly/specific-date slots |
| Classroom (REST) | `GET /api/classroom/my-classes`, `GET /:classId/access`, `GET/POST /:classId/assignments`, `GET /:classId/notes` |
| Tasks | `GET /api/tasks/mine` (board columns), `POST /api/tasks`, `PATCH/DELETE /api/tasks/:id`, admin: `POST /api/tasks/assign`, `GET /api/tasks` (tracker + per-person counts) |

### Paystack

Set the webhook URL in the Paystack dashboard to `https://<your-api>/api/payment/webhook/paystack`. The server checks the `x-paystack-signature` HMAC over the raw body, then re-verifies the transaction with Paystack before fulfilling. The browser callback and the webhook share one idempotent fulfilment path, and an amount or currency mismatch fails the transaction. Prices are computed server-side from the Pricing table (grade price + each enrolled subject price). Until pricing rows exist for a ward the old client-supplied `totalAmount` is accepted, with a log warning.

### Reminders

`jobs/classReminder.job.js` runs every minute and emails (plus an in-app notification) students, their parents and the teacher for sessions starting 29 to 30 minutes ahead. A unique `ClassReminderLog` row per class and start time prevents duplicates after restarts. Times use the server timezone (`TZ`, default `Africa/Lagos`).

### Classroom sockets

Room id = class id. Connect with the user's JWT: `io(url, { auth: { token } })`, then `socket.emit("join", classId, displayName)`.

- Access: admin → any class; teacher → own classes; parent → classes their wards are in; student → classes they are in.
- On join the client receives `existing-users`, then `room-state` (participants, current screen sharer, chat history, shared notes, raised hands, recent assignments). The sharer gets `prepare-late-joiner-screen` so a late joiner sees the live screen straight away.
- Existing events kept: `session-description`, `ice-candidate`, `media-toggle`, `raise-hand`, `lower-hand`, `start-screen-share`, `stop-screen-share`, `chat-message`, `reaction`, `mute-all`, `unmute-all`, `remove-all-users`, `leave-room`.
- New: `notes:update { content, baseVersion }` → `notes:updated`, `assignment:create { title, instructions, dueDate }` → `assignment:new` (teacher/admin only).
- Screen sharing and mute-all / unmute-all / end-room are now host-only (teacher or admin).
- `SOCKET_REQUIRE_AUTH=false` temporarily lets old token-less clients connect (no access control).

## Security fixes made while restructuring

- `POST /api/admin/register` was public and accepted any `role`; removed. `/api/admin/add-admin` was public; now Super Admin only and cannot create a second Super Admin.
- `POST /api/users/create` was public and double-hashed the emailed password (those users could not sign in). Now role-gated and fixed; the generated password is no longer returned in the response.
- Profile read/update routes now require a token and ownership (self, admin, a parent for their ward). Updates can no longer change password, role, email, subscription flags or ownership fields.
- Class create/update/delete require an admin; payment history requires being the payer or an admin.
- `adminAuth.protect` set `req.admin` while routes read `req.user` (so `/admin/verify-token` failed); both are set now.
- Removed secret-looking strings from comments in `admin.routes.js`, and `.env` / `.env.zip` are not in this package. **Rotate the keys that were in them** (Mongo, JWT, Gmail app password, Paystack).

## Removed

`idump.js` (old copy of index.js), `models/Classes.js` (fully commented out), `.env.zip`, `.git`, and the unused dependencies `backblaze-b2, bcrypt, body-parser, joi, mongodb, multer, mutter, otp-generator, twilio, uuid` (none were imported).

## Known limits

- The legacy routers (`user`, `class`, `adminClass`, `subject`, `resource`, …) were moved and renamed but their handlers still live inside the route files; only the new modules use controllers/services.
- `routes/adminClass.routes.js` (`/api/admin-classes`) still targets the old class shape (`course`, `date`, `time`). `/api/classroom/my-classes` and `/api/class/class` are the current class APIs.
- Wards created by a parent are unpaid by default; a self-registered student has no parent until one is linked (no linking endpoint yet).

## Expired subscriptions, grace and view-only mode

When a paid plan runs out the student is **not** locked out:

1. **Grace period:** full access continues. The parent gets a notification and email **every day for 14 days** (09:00 server time, once per day). Access stays full until the **end of the month the plan expired in, or 14 days after expiry, whichever is later**. Change this in `services/access.service.js` (`computeExpiryGraceEnd`).
2. **View-only:** after that the student can still read lessons and materials, but cannot join live classes (socket join is refused) or make writes (the API refuses student POST/PUT/PATCH/DELETE outside profile, notifications and accounts). The parent gets one notice saying the child is now view-only.
3. **Renewal:** a successful payment clears all of this immediately.

**The child is never told it is about fees.** The student-facing API (`GET /api/access/me`) and every refusal use neutral wording ("This action isn't available on your account right now"). Fee wording only appears in the parent's notifications and `GET /api/access/wards`.

**Admin grace (learn without paying):** `POST /api/access/students/:id/grace { "duration": "3d" | "1w" | "4w" | "3m", "note": "..." }` for any student, `DELETE` the same URL to switch it off, `GET /api/access/students?state=grace|expiry_grace|lapsed|paid` to review. While a grace is active the student has full access, parent fee reminders pause, and it overrides a lapse. When it ends the student returns to whatever their subscription says.

Jobs: lapse check 00:05, parent reminders 09:00, hourly sync of the legacy `isSubscribed` flag. Students who never subscribed are unchanged (not blocked).

## Free trial

New students (any signup path) get a free trial automatically. Admin controls, in `/api/platform-settings`:

- `GET /api/platform-settings`: current settings plus the preset lengths
- `PUT /api/platform-settings/trial` with `{ "enabled": true, "days": 7 }`. Presets are 7, 14, 28 and 42 days (1, 2, 4, 6 weeks); any whole number from 1 to 365 is accepted. Turning it off or changing it only affects students who sign up afterwards; students already on a trial keep the length they were given.

During the trial the student has full access. The parent gets one heads-up about 48 hours before it ends and one when it ends. A student whose trial ended without paying becomes view-only, with the same neutral wording as the expiry flow (nothing about fees shown to the child). Admins can extend any student with the grace toggle (`POST /api/access/students/:id/grace`). Existing students with no trial record are unchanged. Paying ends the trial immediately and gives full access.

## Announcements, maintenance and top banners

One model, three kinds (`kind`): `announcement` (shown in the announcements list/tab), `maintenance`, `banner` (top-of-app strip with `severity` info/success/warning/critical, optional link, `dismissible`).

Each item has an `audience` (empty = everyone, or any of admin/teacher/student/parent), an optional `startsAt`/`endsAt` window, `isActive`, and `pinned`.

| Who | Endpoint |
|---|---|
| Admin tab | `GET /api/announcements?kind=`, `POST`, `PUT /:id`, `PATCH /:id/toggle`, `DELETE /:id` (list includes a computed `status`: live / scheduled / ended / off) |
| Signed-in user | `GET /api/announcements/mine` returns `{ banners, maintenance, announcements }` for their role |
| Before login | `GET /api/announcements/public` returns banners and maintenance for everyone |

**Maintenance with `blocking: true`** closes the API to everyone except admins for the window: other requests get `503 { maintenance: true, title, message, endsAt }`. Health check, the announcements endpoints, admin sign-in and the Paystack webhook stay reachable. Without `blocking` it is only a notice.

Every create/edit/toggle/delete emits the socket event `announcements:changed`, so open clients can refetch and the banner appears or disappears live.
