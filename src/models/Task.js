const mongoose = require("mongoose");

const actorRef = {
  id: { type: mongoose.Schema.Types.ObjectId, required: true, refPath: "model" },
  model: { type: String, enum: ["Teacher", "Admin"], required: true },
};

const taskSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, trim: true },
    status: { type: String, enum: ["todo", "in_progress", "done"], default: "todo", index: true },
    priority: { type: String, enum: ["low", "medium", "high"], default: "medium" },
    dueDate: Date,
    labels: [String],
    assignedTo: actorRef,
    createdBy: actorRef,
    // true when an admin assigned it (teachers can update status but not delete it)
    assignedByAdmin: { type: Boolean, default: false },
    completedAt: Date,
  },
  { timestamps: true }
);

taskSchema.index({ "assignedTo.id": 1, status: 1 });

module.exports = mongoose.model("Task", taskSchema);
