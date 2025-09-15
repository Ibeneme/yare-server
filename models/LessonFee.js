const mongoose = require("mongoose");

const LessonFeeSchema = new mongoose.Schema({
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Student",
    required: true,
  },
  payerId: { type: mongoose.Schema.Types.ObjectId },
  payerModel: { type: String, enum: ["Parent", "Student", "admin", "parent", 'student'] },
  duration: { type: String, required: true }, // e.g., "1 month"
  amount: { type: Number, required: true },
  currency: { type: String, default: "NGN" },
  expired: { type: Boolean, default: false },
  expiresAt: { type: Date }, // calculated from duration
  paid: {
    isPaid: { type: Boolean, default: false },
    timestamp: Date,
    paymentMethod: String,
    paymentService: String,
    details: Object,
  },
});

module.exports = mongoose.model("LessonFee", LessonFeeSchema);
