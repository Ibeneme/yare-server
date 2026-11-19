const mongoose = require("mongoose");

/**
 * An award an admin issues to one student, optionally carrying a perk.
 * (The older "Award" model is the teacher/subject based one and is left alone.)
 */
const AwardGrantSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "", trim: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: "Student", required: true, index: true },
    issuedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", required: true },
    perk: {
      kind: { type: String, enum: ["none", "free_month", "discount", "custom"], default: "none" },
      discountPercent: { type: Number, min: 1, max: 100 }, // kind = discount
      note: { type: String, default: "" }, // kind = custom (or extra detail)
      expiresAt: { type: Date, default: null },
      redeemedAt: { type: Date, default: null },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("AwardGrant", AwardGrantSchema);
