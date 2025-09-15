const express = require("express");
const router = express.Router();
const { Assignment, Note, Announcement } = require("../models/Resource");
const Class = require("../models/Class"); // ✅ Import the Class model
const authMiddleware = require("../middlewares/authMiddleware");
const Student = require("../models/Student");

const models = {
  assignment: Assignment,
  note: Note,
  announcement: Announcement,
};

// ✅ Add new
router.post("/add", async (req, res) => {
  console.log("🔹 POST /add called");
  try {
    const { type, classId, title, description } = req.body;
    console.log("📥 Request Body:", { type, classId, title, description });

    if (!type || !models[type]) {
      console.warn("⚠️ Invalid type provided:", type);
      return res.status(400).json({ success: false, message: "Invalid type" });
    }

    const NewItem = new models[type]({ classId, title, description });
    console.log("📦 NewItem created:", NewItem);

    const savedItem = await NewItem.save();
    console.log("✅ Item saved:", savedItem);

    return res.status(201).json({ success: true, data: savedItem });
  } catch (error) {
    console.error("❌ Error creating item:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ✅ Get all by type and classId
router.post("/get", async (req, res) => {
  console.log("🔹 POST /get called");
  try {
    const { type, classId } = req.body;
    console.log("📥 Request Body:", { type, classId });

    if (!type || !models[type]) {
      console.warn("⚠️ Invalid type provided:", type);
      return res.status(400).json({ success: false, message: "Invalid type" });
    }

    const items = await models[type].find({ classId }).sort({ createdAt: -1 });
    console.log(`📄 Found ${items.length} items`);

    return res.status(200).json({ success: true, data: items });
  } catch (error) {
    console.error("❌ Error fetching items:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ✅ Update by _id
router.put("/update", async (req, res) => {
  console.log("🔹 PUT /update called");
  try {
    const { type, _id, title, description } = req.body;
    console.log("📥 Request Body:", { type, _id, title, description });

    if (!type || !models[type]) {
      console.warn("⚠️ Invalid type provided:", type);
      return res.status(400).json({ success: false, message: "Invalid type" });
    }

    const updated = await models[type].findByIdAndUpdate(
      _id,
      { title, description },
      { new: true }
    );

    if (!updated) {
      console.warn("⚠️ Item not found with _id:", _id);
      return res
        .status(404)
        .json({ success: false, message: "Item not found" });
    }

    console.log("🔄 Item updated:", updated);
    return res.status(200).json({ success: true, data: updated });
  } catch (error) {
    console.error("❌ Error updating item:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ✅ Delete by _id
router.delete("/delete", async (req, res) => {
  console.log("🔹 DELETE /delete called");
  try {
    const { type, _id } = req.body;
    console.log("📥 Request Body:", { type, _id });

    if (!type || !models[type]) {
      console.warn("⚠️ Invalid type provided:", type);
      return res.status(400).json({ success: false, message: "Invalid type" });
    }

    const deleted = await models[type].findByIdAndDelete(_id);
    if (!deleted) {
      console.warn("⚠️ Item not found with _id:", _id);
      return res
        .status(404)
        .json({ success: false, message: "Item not found" });
    }

    console.log("🗑️ Item deleted:", deleted);
    return res
      .status(200)
      .json({ success: true, message: "Deleted successfully" });
  } catch (error) {
    console.error("❌ Error deleting item:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 🆕 Get all resources grouped by class
router.get(
  "/getall-resources/getall-resources",
  authMiddleware,
  async (req, res) => {
    console.log("🔹 GET /getall-resources called");

    try {
      const { _id, id, userType } = req.user;
      const userId = _id ?? id; // Use _id if it exists, otherwise fall back to id
      console.log(`🔍 User ID: ${userId}, User Type: ${userType}`);

      let classes;
      let finalData = [];

      // ========== STUDENT ==========
      if (userType === "student") {
        console.log(`🎓 Fetching resources for student: ${userId}`);

        // Step 1: Fetch the student document to get enrolled course IDs
        const student = await Student.findById(userId).lean();
        if (!student) {
          return res
            .status(404)
            .json({ success: false, message: "Student not found" });
        }

        const courseIds = student.courses || [];
        console.log(
          `📘 Enrolled course IDs:`,
          courseIds.map((id) => id.toString())
        );

        // Step 2: Find classes associated with these course IDs
        const classes = await Class.find({
          courseId: { $in: courseIds },
        }).lean();
        const classIds = classes.map((cls) => cls._id);
        console.log(
          `📚 Found ${classes.length} class(es) for student via courses`
        );

        // Step 3: Fetch all related resources for those classes
        const [assignments, notes, announcements] = await Promise.all([
          Assignment.find({ classId: { $in: classIds } }).lean(),
          Note.find({ classId: { $in: classIds } }).lean(),
          Announcement.find({ classId: { $in: classIds } }).lean(),
        ]);

        console.log(
          `📌 Resources fetched -> Assignments: ${assignments.length}, Notes: ${notes.length}, Announcements: ${announcements.length}`
        );

        // Step 4: Group resources by classId
        const resourcesByClassId = [
          ...assignments,
          ...notes,
          ...announcements,
        ].reduce((acc, resource) => {
          const cid = resource.classId.toString();
          if (!acc[cid])
            acc[cid] = { assignments: [], notes: [], announcements: [] };

          if (assignments.some((a) => a._id.equals(resource._id))) {
            acc[cid].assignments.push(resource);
          } else if (notes.some((n) => n._id.equals(resource._id))) {
            acc[cid].notes.push(resource);
          } else if (announcements.some((a) => a._id.equals(resource._id))) {
            acc[cid].announcements.push(resource);
          }

          return acc;
        }, {});

        // Step 5: Merge classes with their resources
        const finalData = classes.map((cls) => {
          const cid = cls._id.toString();
          return {
            ...cls,
            resources: resourcesByClassId[cid] || {
              assignments: [],
              notes: [],
              announcements: [],
            },
          };
        });

        console.log(`✅ Final compiled data for ${finalData.length} class(es)`);

        // Return response
        return res.status(200).json({
          success: true,
          student: true,
          data: finalData,
        });
      }

      // ========== PARENT ==========
      // ... (student logic remains unchanged)

      // ========== PARENT ==========
      else if (userType === "parent") {
        console.log(`👨‍👩‍👧 Fetching resources for parent: ${userId}`);

        // Step 1: Find all children of the parent
        const children = await Student.find({ parentId: userId }).lean();

        if (!children || children.length === 0) {
          console.log(`⚠️ No children associated with parent ID: ${userId}`);
          return res
            .status(200)
            .json({ success: true, parent: true, data: [] });
        }

        console.log(
          `👶 Found ${children.length} child(ren):`,
          children.map((c) => c._id.toString())
        );

        // Step 2: Process each child to fetch their classes via courseIds
        const parentData = await Promise.all(
          children.map(async (child) => {
            const childId = child._id;
            console.log(`🔍 Processing child: ${childId}`);

            const courseIds = child.courses || [];
            if (courseIds.length === 0) {
              console.log(`⚠️ No courseIds found for child: ${childId}`);
              return { childId, classes: [] };
            }

            console.log(
              `📘 Course IDs for child ${childId}:`,
              courseIds.map((id) => id.toString())
            );

            // Step 3: Get classes for those courseIds
            const childClasses = await Class.find({
              courseId: { $in: courseIds },
            }).lean();
            const childClassIds = childClasses.map((cls) => cls._id);
            console.log(
              `📚 Found ${childClasses.length} class(es) for child ${childId}`
            );

            // Step 4: Fetch all resources for these classes
            const [assignments, notes, announcements] = await Promise.all([
              Assignment.find({ classId: { $in: childClassIds } }).lean(),
              Note.find({ classId: { $in: childClassIds } }).lean(),
              Announcement.find({ classId: { $in: childClassIds } }).lean(),
            ]);

            console.log(
              `📝 Resources for child ${childId} → Assignments: ${assignments.length}, Notes: ${notes.length}, Announcements: ${announcements.length}`
            );

            // Step 5: Group resources by classId
            const resourcesByClassId = [
              ...assignments,
              ...notes,
              ...announcements,
            ].reduce((acc, resource) => {
              const classId = resource.classId.toString();
              if (!acc[classId]) {
                acc[classId] = {
                  assignments: [],
                  notes: [],
                  announcements: [],
                };
              }

              if (assignments.some((a) => a._id.equals(resource._id))) {
                acc[classId].assignments.push(resource);
              } else if (notes.some((n) => n._id.equals(resource._id))) {
                acc[classId].notes.push(resource);
              } else if (
                announcements.some((a) => a._id.equals(resource._id))
              ) {
                acc[classId].announcements.push(resource);
              }

              return acc;
            }, {});

            // Step 6: Combine resources with classes
            const childClassesWithResources = childClasses.map((cls) => {
              const cid = cls._id.toString();
              return {
                ...cls,
                resources: resourcesByClassId[cid] || {
                  assignments: [],
                  notes: [],
                  announcements: [],
                },
              };
            });

            console.log(
              `✅ Child ${childId} has ${childClassesWithResources.length} class(es) with resources`
            );

            return {
              childId,
              classes: childClassesWithResources,
            };
          })
        );

        console.log(
          `🎯 Compiled parent data for ${parentData.length} child(ren)`
        );

        return res.status(200).json({
          success: true,
          parent: true,
          data: parentData,
        });
      }

      // ========== TEACHER ==========
      // ========== TEACHER ==========
      else if (userType === "teacher") {
        console.log(`👨‍🏫 Fetching resources for teacher: ${userId}`);

        // Step 1: Get classes taught by this teacher
        const teacherClasses = await Class.find({ teacherId: userId }).lean();
        const teacherClassIds = teacherClasses.map((cls) => cls._id);
        console.log(`📚 Found ${teacherClasses.length} class(es) for teacher`);

        // Step 2: Fetch all resources for these classes
        const [assignments, notes, announcements] = await Promise.all([
          Assignment.find({ classId: { $in: teacherClassIds } }).lean(),
          Note.find({ classId: { $in: teacherClassIds } }).lean(),
          Announcement.find({ classId: { $in: teacherClassIds } }).lean(),
        ]);

        // Step 3: Group resources by classId
        const resourcesByClassId = [
          ...assignments,
          ...notes,
          ...announcements,
        ].reduce((acc, resource) => {
          const classId = resource.classId.toString();
          if (!acc[classId]) {
            acc[classId] = {
              assignments: [],
              notes: [],
              announcements: [],
            };
          }

          if (assignments.some((a) => a._id.equals(resource._id))) {
            acc[classId].assignments.push(resource);
          } else if (notes.some((n) => n._id.equals(resource._id))) {
            acc[classId].notes.push(resource);
          } else if (announcements.some((a) => a._id.equals(resource._id))) {
            acc[classId].announcements.push(resource);
          }

          return acc;
        }, {});

        // Step 4: Combine classes with resources
        const teacherClassesWithResources = teacherClasses.map((cls) => {
          const cid = cls._id.toString();
          return {
            ...cls,
            resources: resourcesByClassId[cid] || {
              assignments: [],
              notes: [],
              announcements: [],
            },
          };
        });

        return res.status(200).json({
          success: true,
          teacher: true,
          data: teacherClassesWithResources,
        });
      }

      // ... (other user types and error handling remain unchanged)

      // ========== OTHER USER TYPES ==========
      else {
        console.log(
          `ℹ️ User type '${userType}' has no specific resource logic.`
        );
        return res.status(200).json({ success: true, data: [] });
      }
    } catch (error) {
      console.error(
        "❌ Error in /getall-resources:",
        error.message,
        error.stack
      );
      return res
        .status(500)
        .json({ success: false, message: "Internal server error" });
    }
  }
);
module.exports = router;
