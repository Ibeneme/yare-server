const mongoose = require("mongoose");

// One row per product subscription plan, with prices in each supported currency.
const pricingSchema = new mongoose.Schema(
  {
    kind: {
      type: String,
      enum: ["subscription"],
      default: "subscription",
      required: true,
      index: true,
    },
    planKey: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: "" },
    prices: {
      NGN: { type: Number, min: 0, required: true },
      USD: { type: Number, min: 0, required: true },
    },
    // Billing period in days (e.g. 30, 90, 180).
    durationDays: { type: Number, default: 30, min: 1 },
    isActive: { type: Boolean, default: true },
    meta: {
      badge: { type: String, trim: true, default: null },
      billingLabel: { type: String, trim: true, default: "" },
      perUnitLabel: { type: String, trim: true, default: "per student" },
      compareAtNGN: { type: Number, min: 0, default: null },
      savingsNGN: { type: Number, min: 0, default: null },
      features: [{ type: String, trim: true }],
    },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
  },
  { timestamps: true }
);

pricingSchema.index({ kind: 1, planKey: 1 }, { unique: true });

module.exports = mongoose.model("Pricing", pricingSchema);