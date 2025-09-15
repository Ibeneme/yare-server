const express = require("express");
const Parent = require("../models/Parent");
const Student = require("../models/Student");
const sendEmail = require("../utils/mailer");
const generatePassword = require("../utils/generatePassword");

const router = express.Router();

router.post("/", async (req, res) => {
  const { firstName, lastName, email, phoneNumber, children = [] } = req.body;

  try {
    const existing = await Parent.findOne({ email });
    if (existing)
      return res.status(400).json({ message: "Parent already exists." });

    const password = generatePassword();
    const newParent = new Parent({
      firstName,
      lastName,
      email,
      phoneNumber,
      password,
    });

    let childDocs = [];

    if (Array.isArray(children) && children.length > 0) {
      childDocs = await Promise.all(
        children.map(async (child) => {
          const studentPassword = generatePassword();
          const student = new Student({
            ...child,
            password: studentPassword,
          });

          await student.save();
          await sendEmail(
            child.email,
            "Student Account Created",
            `Your login credentials:\nUsername: ${child.username}\nPassword: ${studentPassword}`
          );

          return student._id;
        })
      );
    }

    newParent.children = childDocs;
    await newParent.save();
    await sendEmail(
      email,
      "Parent Account Created",
      `Your login credentials:\nEmail: ${email}\nPassword: ${password}`
    );

    res.status(201).json({
      message:
        children.length > 0
          ? "Parent and children created successfully."
          : "Parent created successfully.",
    });
  } catch (err) {
    console.error("Error creating parent:", err);
    res.status(500).json({ message: err.message });
  }
});

router.get("/", async (req, res) => {
  try {
    const parents = await Parent.find().populate("children");
    res.json(parents);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const parent = await Parent.findById(req.params.id).populate("children");
    if (!parent) return res.status(404).json({ message: "Parent not found" });
    res.json(parent);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put("/:id", async (req, res) => {
  const { firstName, lastName, phoneNumber } = req.body;
  try {
    const parent = await Parent.findByIdAndUpdate(
      req.params.id,
      { firstName, lastName, phoneNumber },
      { new: true }
    ).populate("children");

    if (!parent) return res.status(404).json({ message: "Parent not found" });
    res.json(parent);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE parent
router.delete("/:id", async (req, res) => {
  try {
    const parent = await Parent.findById(req.params.id);
    if (!parent) return res.status(404).json({ message: "Parent not found" });

    // Delete children
    await Student.deleteMany({ _id: { $in: parent.children } });

    await parent.remove();
    res.json({ message: "Parent and children deleted successfully." });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
