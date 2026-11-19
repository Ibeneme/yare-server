/**
 * Shared HTML email shell (table-based, inline CSS, 600px, stacks on phones).
 * Flat: no shadows, no italics. Colours match the web app (army green + yellow on cream).
 */
const C = { bg: "#faf8ef", card: "#ffffff", line: "#e7e4d2", ink: "#1d2414", muted: "#5f6853", green: "#4b5a2a", deep: "#2d3719", soft: "#e4e9d1", yellow: "#f6c915", yellowSoft: "#fdf0b4", red: "#b3261e", redSoft: "#fbe4e2" };
const FONT = "'Bricolage Grotesque',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
const APP_URL = process.env.FRONTEND_URL || "https://www.yareheightlearninghub.com";

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const money = (n, cur = "NGN") => `${cur === "USD" ? "$" : "₦"}${Number(n || 0).toLocaleString("en-US")}`;
const date = (d) => (d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "");
const time = (d) => (d ? new Date(d).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "");

/** A heading + paragraph block. `text` may contain trusted HTML; escape user data before passing it. */
const p = (text) => `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:${C.ink};">${text}</p>`;

/** Key/value table, e.g. receipts. rows: [[label, value], …] (values are escaped). */
const facts = (rows) => `
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 20px;border:1.5px solid ${C.line};border-radius:16px;border-collapse:separate;">
  ${rows.map(([k, v], i) => `<tr><td style="padding:12px 16px;font-size:14px;color:${C.muted};${i ? `border-top:1px solid ${C.line};` : ""}">${esc(k)}</td><td align="right" style="padding:12px 16px;font-size:14px;font-weight:700;color:${C.ink};${i ? `border-top:1px solid ${C.line};` : ""}">${esc(v)}</td></tr>`).join("")}
</table>`;

/** Coloured note. tone: info | warn | good | bad */
const note = (text, tone = "info") => {
  const t = { info: [C.soft, C.deep], warn: [C.yellowSoft, "#5a4500"], good: [C.soft, C.deep], bad: [C.redSoft, C.red] }[tone];
  return `<div style="margin:0 0 20px;padding:14px 18px;background:${t[0]};color:${t[1]};border-radius:16px;font-size:14px;line-height:1.55;">${text}</div>`;
};

const button = (label, href) => `
<table role="presentation" cellspacing="0" cellpadding="0" style="margin:8px 0 24px;"><tr><td style="background:${C.deep};border-radius:999px;">
  <a href="${esc(href)}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:999px;">${esc(label)}</a>
</td></tr></table>`;

/**
 * layout({ preheader, eyebrow, title, body, footerNote })
 * `body` is trusted HTML built from p(), facts(), note(), button().
 */
const layout = ({ preheader = "", eyebrow = "", title, body, footerNote = "" }) => `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="color-scheme" content="light">
<title>${esc(title)}</title>
<style>@media only screen and (max-width:620px){.wrap{width:100%!important}.pad{padding:24px 20px!important}.h1{font-size:26px!important}}</style>
</head>
<body style="margin:0;padding:0;background:${C.bg};font-family:${FONT};color:${C.ink};">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader)}</span>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${C.bg};"><tr><td align="center" style="padding:28px 12px;">
  <table role="presentation" class="wrap" width="600" cellspacing="0" cellpadding="0" style="width:600px;max-width:100%;">
    <tr><td style="padding:0 4px 16px;">
      <table role="presentation" cellspacing="0" cellpadding="0"><tr>
        <td style="width:36px;height:36px;background:${C.yellow};border-radius:12px;text-align:center;font-size:18px;font-weight:800;color:${C.deep};">Y</td>
        <td style="padding-left:10px;font-size:18px;font-weight:800;color:${C.deep};">Yare Height</td>
      </tr></table>
    </td></tr>
    <tr><td class="pad" style="background:${C.card};border:1.5px solid ${C.line};border-radius:28px;padding:36px 36px 28px;">
      ${eyebrow ? `<span style="display:inline-block;margin-bottom:14px;padding:4px 12px;background:${C.soft};color:${C.deep};border-radius:999px;font-size:12px;font-weight:700;">${esc(eyebrow)}</span>` : ""}
      <h1 class="h1" style="margin:0 0 18px;font-size:30px;line-height:1.15;letter-spacing:-0.02em;color:${C.deep};">${esc(title)}</h1>
      ${body}
    </td></tr>
    <tr><td align="center" style="padding:20px 12px 0;font-size:12px;line-height:1.6;color:${C.muted};">
      ${footerNote ? `${esc(footerNote)}<br>` : ""}Yare Height Learning Hub · <a href="${esc(APP_URL)}" style="color:${C.green};">${esc(APP_URL.replace(/^https?:\/\//, ""))}</a>
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;

module.exports = { layout, p, facts, note, button, esc, money, date, time, C, APP_URL };
