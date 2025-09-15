// const mongoose = require("mongoose");

// const ClassSchema = new mongoose.Schema(
//   {
//     className: {
//       type: String,
//       required: true,
//     },
//     course: {
//       type: String,
//       required: true,
//     },
//     courseId: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: "Course",
//       required: true,
//     },
//     departmentId: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: "Department",
//       required: true,
//     },
//     teachers: [
//       {
//         type: mongoose.Schema.Types.ObjectId,
//         ref: "Teacher",
//       },
//     ],
//     parents: [
//       {
//         type: mongoose.Schema.Types.ObjectId,
//         ref: "Parent",
//       },
//     ],
//     students: [
//       {
//         type: mongoose.Schema.Types.ObjectId,
//         ref: "Student",
//       },
//     ],
//     assignedTo: [
//       {
//         type: mongoose.Schema.Types.ObjectId,
//         ref: "Teacher",
//       },
//     ],
//     level: [
//       {
//         type: String, // or Number, depending on how your levels are defined
//       },
//     ],
//   },
//   {
//     timestamps: true, // adds createdAt and updatedAt automatically
//   }
// );

// module.exports = mongoose.model("Class", ClassSchema);
