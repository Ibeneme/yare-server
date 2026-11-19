const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema(
  {
    reference: { type: String, required: true, unique: true, index: true },
    parentId: { type: mongoose.Schema.Types.ObjectId, ref: "Parent", index: true },
    payerEmail: { type: String, required: true },
    studentIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Student" }],
    planName: String,
    durationDays: Number,
    items: [
      {
        kind: String,
        studentId: mongoose.Schema.Types.ObjectId,
        refId: mongoose.Schema.Types.ObjectId,
        name: String,
        amount: Number,
      },
    ],
    appliedPerks: [{ type: mongoose.Schema.Types.ObjectId, ref: "AwardGrant" }], // discounts used by this payment
    amount: { type: Number, required: true }, // major units (₦ / $)
    currency: { type: String, enum: ["NGN", "USD"], default: "NGN" },
    status: {
      type: String,
      enum: ["pending", "success", "failed", "abandoned"],
      default: "pending",
      index: true,
    },
    channel: String,
    paidAt: Date,
    verifiedBy: { type: String, enum: ["webhook", "callback"] },
    gateway: { type: String, default: "paystack" },
    gatewayResponse: Object,
  },
  { timestamps: true }
);

module.exports = mongoose.model("Transaction", transactionSchema);
