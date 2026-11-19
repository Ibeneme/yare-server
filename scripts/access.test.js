const a = require("../src/services/access.service");
let fails = 0;
const t = (n, c) => { console.log(c ? "PASS" : "FAIL", n); if (!c) fails++; };
const D = (s) => new Date(s);

const early = { subscriptionExpiredAt: D("2026-11-05T10:00:00"), isSubscribed: true };
t("expired Nov 5: full on Nov 25 (expiry_grace)", a.getAccessState(early, D("2026-11-25T12:00:00")).reason === "expiry_grace");
t("expired Nov 5: still full on Nov 30 evening", a.getAccessState(early, D("2026-11-30T20:00:00")).mode === "full");
t("expired Nov 5: read-only on Dec 1", a.getAccessState(early, D("2026-12-01T00:30:00")).mode === "read_only");
const late = { subscriptionExpiredAt: D("2026-11-25T10:00:00") };
t("expired Nov 25: full on Dec 8 (14 days beats month end)", a.getAccessState(late, D("2026-12-08T12:00:00")).mode === "full");
t("expired Nov 25: read-only on Dec 10", a.getAccessState(late, D("2026-12-10T12:00:00")).mode === "read_only");
const lapsed = { subscriptionExpiredAt: D("2026-01-05T10:00:00") };
t("admin grace overrides a lapse", a.getAccessState({ ...lapsed, adminGraceUntil: D("2026-12-01") }, D("2026-11-18")).reason === "admin_grace");
t("expired admin grace falls back to lapse", a.getAccessState({ ...lapsed, adminGraceUntil: D("2026-11-01") }, D("2026-11-18")).mode === "read_only");
t("never-subscribed student not blocked", a.getAccessState({}, D("2026-11-18")).mode === "full");
t("renewed student is paid", a.getAccessState({ isSubscribed: true, isPaid: true }, D("2026-11-18")).reason === "paid");

const from = D("2026-11-18T09:00:00");
t("3d = +3 days", a.graceEndFrom("3d", from).getDate() === 21);
t("1w = +7 days", a.graceEndFrom("1w", from).getDate() === 25);
t("4w = +28 days", a.graceEndFrom("4w", from).getMonth() === 11 && a.graceEndFrom("4w", from).getDate() === 16);
t("3m = +3 months", a.graceEndFrom("3m", from).getMonth() === 1 && a.graceEndFrom("3m", from).getFullYear() === 2027);
t("bad option rejected", a.graceEndFrom("2d", from) === null);

const tr = { trialEndsAt: D("2026-11-25T00:00:00"), isSubscribed: true };
t("trial running -> full (trial)", a.getAccessState(tr, D("2026-11-20")).reason === "trial");
t("trial over, never paid -> read-only", a.getAccessState(tr, D("2026-11-26")).reason === "trial_ended" && a.getAccessState(tr, D("2026-11-26")).mode === "read_only");
t("trial over but paid -> full", a.getAccessState({ ...tr, isPaid: true }, D("2026-11-26")).reason === "paid");
t("trial over + admin grace -> full", a.getAccessState({ ...tr, adminGraceUntil: D("2026-12-30") }, D("2026-11-26")).reason === "admin_grace");
t("legacy student (no trial) unchanged", a.getAccessState({ isSubscribed: false }, D("2026-11-26")).mode === "full");

const view = JSON.stringify(a.publicAccessView({ mode: "read_only" }));
t("student view never mentions fees/payment/subscription", !/fee|pay|subscri|renew|expire|money/i.test(view));
console.log("FAILS:", fails);
process.exit(fails ? 1 : 0);
