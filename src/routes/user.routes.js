// routes/users.js
const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Teacher = require("../models/Teacher");
const Student = require("../models/Student");
const Parent = require("../models/Parent");
const Admin = require("../models/Admin");
const Course = require("../models/Course");
const Class = require("../models/Class");
const LessonFee = require("../models/LessonFee");
const Otp = require("../models/Otp");
const sendEmail = require("../services/mail.service");
const { generateToken } = require("../services/token.service");
const authMiddleware = require("../middlewares/auth.middleware");

// Email Templates
const getParentEmailTemplate = require("../templates/parentWelcomeEmail");
const getStudentEmailTemplate = require("../templates/studentWelcomeEmail");
const otpEmail = require("../templates/otpEmail");
const Subject = require("../models/Subject");


// Self, an admin, a parent (for their own ward) or the ward's teacher may touch a profile.
const canAccessProfile = async (req, res, next) => {
  try {
    const { userType, id } = req.params;
    const caller = req.user;
    if (caller.userType === "admin") return next();
    const target = userType === "superadmin" ? "admin" : userType;
    if (String(caller.id) === String(id) && caller.userType === target) return next();
    if (caller.userType === "parent" && target === "student") {
      const ward = await Student.findById(id).select("parentId");
      if (ward && String(ward.parentId) === String(caller.id)) return next();
    }
    if (caller.userType === "teacher" && ["student", "parent"].includes(target) && req.method === "GET") {
      return next();
    }
    return res.status(403).json({ success: false, message: "Not allowed" });
  } catch (e) {
    return res.status(500).json({ success: false, message: "Authorization check failed" });
  }
};

// Helper: Resolve Model by userType
const getModelByUserType = (userType) => {
  switch (userType.toLowerCase()) {
    case "teacher":
      return { model: Teacher, label: "Teacher" };
    case "student":
      return { model: Student, label: "Student" };
    case "parent":
      return { model: Parent, label: "Parent" };
    case "admin":
      return { model: Admin, label: "Admin" };
    case "course":
      return { model: Course, label: "Course" };
    default:
      return null;
  }
};

router.post("/register-parent", async (req, res) => {
  const { firstName, lastName, email, phoneNumber, password } = req.body;

  console.log("STEP 1: Register/Resend OTP Request:", { email });

  // === VALIDATE INPUT ===
  if (!email) {
    return res
      .status(400)
      .json({ success: false, message: "Email is required" });
  }

  // Only validate other fields if registering (not resending)
  const isRegistering = firstName || lastName || phoneNumber || password;

  if (isRegistering) {
    if (!firstName || !lastName || !phoneNumber || !password) {
      return res
        .status(400)
        .json({ success: false, message: "All fields required" });
    }
    if (password.length < 8) {
      return res
        .status(400)
        .json({ success: false, message: "Password must be 8+ characters" });
    }
  }

  try {
    let parent;
    let isNewParent = false;

    // === CHECK IF PARENT EXISTS ===
    const existing = await Parent.findOne({ email });

    if (existing) {
      parent = existing;
      console.log("Parent already exists. Resending OTP...");
    } else {
      if (!isRegistering) {
        return res.status(400).json({
          success: false,
          message: "Parent not found. Please register first.",
        });
      }

      // Hash password
      //const passwordHash = await bcrypt.hash(password, 12);

      // Create new parent
      parent = new Parent({
        firstName,
        lastName,
        email,
        phoneNumber,
        password,
      });
      await parent.save();
      isNewParent = true;
      console.log("New parent created:", parent._id);
    }

    // === GENERATE & SAVE OTP ===
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    await Otp.findOneAndUpdate(
      { email },
      { otp: otp, createdAt: new Date() },
      { upsert: true, new: true }
    );

    // === SEND OTP EMAIL ===
    const displayName = parent.firstName || "there";

    await sendEmail(
      email,
      "Your Yare OTP – Complete Registration",
      otpEmail({ displayName, isNewParent, otp }) // <-- FIX HERE
    );

    console.log(`OTP sent to: ${email} (${isNewParent ? "New" : "Existing"})`);

    return res.status(200).json({
      success: true,
      message: isNewParent
        ? "OTP sent to email. Check your inbox."
        : "OTP resent successfully. Check your email.",
      data: { parentId: parent._id },
    });
  } catch (err) {
    console.error("Register/Resend OTP Error:", err.message);
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

// === PUBLIC STUDENT SELF-SIGNUP (no parent required; a parent can be linked later) ===
router.post("/signup/student", async (req, res) => {
  try {
    const { firstName, lastName, email, password, gradeId } = req.body;
    if (!firstName || !lastName || !email || !password) {
      return res.status(400).json({ success: false, message: "firstName, lastName, email and password are required" });
    }
    if (String(password).length < 8) {
      return res.status(400).json({ success: false, message: "Password must be at least 8 characters" });
    }
    const normalized = String(email).toLowerCase().trim();
    if (await Student.findOne({ email: normalized })) {
      return res.status(409).json({ success: false, message: "An account with this email already exists" });
    }
    const student = await Student.create({
      firstName, lastName, email: normalized, password, gradeId: gradeId || null,
    });
    return res.status(201).json({
      success: true,
      message: "Account created",
      data: { _id: student._id, email: student.email, firstName, lastName },
      token: generateToken(student._id, "student"),
    });
  } catch (err) {
    console.error("student signup error:", err.message);
    return res.status(500).json({ success: false, message: "Signup failed" });
  }
});

router.post("/register-students", async (req, res) => {
  const { email, otp, students } = req.body;

  console.log("STEP 2: Verify OTP & Create Students:", {
    email,
    students: students?.length,
  });

  if (!email || !otp || !Array.isArray(students) || students.length === 0) {
    return res.status(400).json({ success: false, message: "Invalid request" });
  }

  try {
    // 1. Verify OTP
    const otpRecord = await Otp.findOne({ email });
    if (!otpRecord) {
      return res.status(400).json({ success: false, message: "OTP not found" });
    }

    // Direct comparison (no bcrypt)
    if (otp !== otpRecord.otp) {
      return res.status(400).json({ success: false, message: "Invalid OTP" });
    }

    const now = new Date();
    if (now.getTime() - otpRecord.createdAt.getTime() > 30 * 60 * 1000) {
      await Otp.deleteOne({ email });
      return res.status(400).json({ success: false, message: "OTP expired" });
    }

    // 2. Create or get Parent
    let parent = await Parent.findOne({ email });

    if (!parent) {
      // Extract name from first student or fallback
      const [firstStudent] = students;
      const [firstName, lastName] = firstStudent.parentName?.split(" ") || [
        "Parent",
        "",
      ];

      const parentPassword = Math.random().toString(36).slice(-8);

      parent = await Parent.create({
        firstName,
        lastName,
        email,
        phoneNumber: firstStudent.parentPhone || "",
        password: parentPassword, // will be hashed automatically by model pre-save
        children: [],
        userType: "parent",
      });
    }

    console.log("Parent ready:", parent._id);

    // 3. Create Students
    const createdStudents = [];
    const studentCredentials = [];

    for (let i = 0; i < students.length; i++) {
      const s = students[i];
      const studentPassword = Math.random().toString(36).slice(-8);

      const newStudent = await Student.create({
        firstName: s.firstName,
        lastName: s.lastName,
        email: s.email,
        password: studentPassword, // will be hashed automatically
        parentId: parent._id,
        userType: "student",
      });

      createdStudents.push(newStudent._id);
      studentCredentials.push({
        firstName: newStudent.firstName,
        email: newStudent.email,
        password: studentPassword,
      });
    }

    // 4. Link Students to Parent
    parent.children = createdStudents;
    await parent.save();

    // 5. Delete OTP
    await Otp.deleteOne({ email });

    // 6. Send Emails
    const parentPasswordToSend = "******"; // hide password in prod
    await sendEmail(
      parent.email,
      "Welcome to Yare – Your Family Account is Ready!",
      getParentEmailTemplate({
        parentName: parent.firstName,
        parentEmail: parent.email,
        parentPassword: parentPasswordToSend,
        children: studentCredentials,
      })
    );

    for (const cred of studentCredentials) {
      await sendEmail(
        cred.email,
        "Your Yare Student Account – Login Details",
        getStudentEmailTemplate(cred)
      );
    }

    console.log("Registration complete. Emails sent.");

    return res.status(201).json({
      success: true,
      message: "Registration complete",
      data: {
        parentId: parent._id,
        parentEmail: parent.email,
        students: createdStudents,
      },
    });
  } catch (err) {
    console.error("Register Students Error:", err.message);
    if (err.code === 11000) {
      return res
        .status(409)
        .json({ success: false, message: "Email already exists" });
    }
    return res.status(500).json({ success: false, message: "Server error" });
  }
});

router.post("/register-students-array", async (req, res) => {
  const { email, otp, students } = req.body;

  console.log("STEP 1: Request received", {
    email,
    newStudentsCount: students?.length || 0,
  });

  if (!email || !otp || !Array.isArray(students) || students.length === 0) {
    return res
      .status(400)
      .json({ success: false, message: "Invalid request payload" });
  }

  try {
    const otpRecord = await Otp.findOne({ email });
    if (!otpRecord)
      return res.status(400).json({ success: false, message: "OTP not found" });
    if (otp !== otpRecord.otp)
      return res.status(400).json({ success: false, message: "Invalid OTP" });

    const now = Date.now();
    if (now - otpRecord.createdAt.getTime() > 30 * 60 * 1000) {
      await Otp.deleteOne({ email });
      return res.status(400).json({ success: false, message: "OTP expired" });
    }

    // ------------------------
    // 3. Get or create Parent
    // ------------------------
    let parent = await Parent.findOne({ email });

    if (!parent) {
      const [first] = students;
      const [firstName = "Parent", lastName = ""] =
        first.parentName?.split(" ") || [];
      const parentPassword = Math.random().toString(36).slice(-8);

      parent = await Parent.create({
        firstName,
        lastName,
        email,
        phoneNumber: first.parentPhone || "",
        password: parentPassword,
        children: [],
        userType: "parent",
      });

      console.log("Created new parent", parent._id);
    } else {
      console.log("Found existing parent", parent._id);
    }

    // ------------------------
    // 4. Fetch existing students
    // ------------------------
    const existingStudents = await Student.find({
      parentId: parent._id,
    }).lean();
    const existingEmails = new Set(
      existingStudents.map((s) => s.email.toLowerCase())
    );

    // ------------------------
    // 5. Create only new students
    // ------------------------
    const newStudentCredentials = [];
    const createdStudentIds = [];

    for (const s of students) {
      const lowered = s.email.toLowerCase();
      if (existingEmails.has(lowered)) {
        console.log(`Skipping duplicate email ${s.email}`);
        continue;
      }

      const studentPassword = Math.random().toString(36).slice(-8);
      const newStudent = await Student.create({
        firstName: s.firstName,
        lastName: s.lastName || "",
        email: s.email,
        password: studentPassword,
        phone: s.phone || "",
        gradeId: s.class || "",
        subjects: s.subjects || [],
        parentId: parent._id,
        userType: "student",
      });

      createdStudentIds.push(newStudent._id.toString());
      newStudentCredentials.push({
        firstName: newStudent.firstName,
        email: newStudent.email,
        password: studentPassword,
      });
      existingEmails.add(lowered);
    }

    // ------------------------
    // 6. Update parent's children array
    // ------------------------
    parent.children = [
      ...existingStudents.map((s) => s._id),
      ...createdStudentIds,
    ];
    await parent.save();

    // ------------------------
    // 7. Clean OTP
    // ------------------------
    await Otp.deleteOne({ email });

    // ------------------------
    // 8. Send welcome emails
    // ------------------------
    const parentPasswordToSend = "******"; // hide real password
    await sendEmail(
      parent.email,
      "Welcome to Yare – Your Family Account is Ready!",
      getParentEmailTemplate({
        parentName: parent.firstName,
        parentEmail: parent.email,
        parentPassword: parentPasswordToSend,
        children: newStudentCredentials,
      })
    );

    for (const cred of newStudentCredentials) {
      await sendEmail(
        cred.email,
        "Your Yare Student Account – Login Details",
        getStudentEmailTemplate(cred)
      );
    }

    console.log(
      "Registration complete –",
      parent.children.length,
      "total students linked"
    );

    // ------------------------
    // 9. Response
    // ------------------------
    return res.status(201).json({
      success: true,
      message: "Students registered successfully",
      data: {
        parentId: parent._id,
        parentEmail: parent.email,
        students: parent.children, // full array of student IDs
        newlyCreated: createdStudentIds, // new students only
      },
    });
  } catch (err) {
    console.error("register-students-array error:", err);

    if (err.code === 11000) {
      return res
        .status(409)
        .json({ success: false, message: "Email already exists" });
    }

    return res.status(500).json({ success: false, message: "Server error" });
  }
});

router.post("/auth/signin", async (req, res) => {
  const { userType, email, password } = req.body;
  console.log("SIGNIN START:", { userType, email, password });

  if (!userType || !email || !password) {
    console.log("MISSING FIELDS:", { userType, email, password });
    return res
      .status(400)
      .json({ success: false, message: "Missing required fields" });
  }

  const resolved = getModelByUserType(userType);
  console.log("MODEL RESOLVED:", resolved?.label);

  if (!resolved) {
    console.log("INVALID USER TYPE:", userType);
    return res
      .status(400)
      .json({ success: false, message: "Invalid user type" });
  }

  try {
    // Find user using resolved.model
    const user = await resolved.model.findOne({ email });
    console.log("USER FETCHED:", user ? user._id : null);

    if (!user) {
      console.log("USER NOT FOUND FOR EMAIL:", email);
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    // Password check
    const match = await user.matchPassword(password);
    console.log("PASSWORD MATCH:", match);

    if (!match) {
      console.log("INVALID PASSWORD for user:", email);
      return res
        .status(401)
        .json({ success: false, message: "Invalid credentials" });
    }

    // Generate token
    const token = generateToken(user._id, userType);
    console.log("TOKEN GENERATED:", token);

    // Clean user object
    const clean = user.toObject();
    delete clean.password;
    delete clean.__v;

    // If parent, fetch children
    if (userType.toLowerCase() === "parent") {
      const children = await Student.find({ parentId: user._id }).lean();
      clean.children = children.map((c) => {
        delete c.password;
        delete c.__v;
        return c;
      });
      console.log("CHILDREN FETCHED:", clean.children.length);
    }

    return res
      .status(200)
      .json({ success: true, message: "Login successful", data: clean, token });
  } catch (err) {
    console.error("LOGIN ERROR:", err);
    return res
      .status(500)
      .json({ success: false, message: "Login failed", error: err.message });
  }
});

// === CREATE PARENT + MULTIPLE STUDENTS ===
router.post("/create", authMiddleware, async (req, res) => {
  const { userType, email, firstName, lastName, parentId } = req.body;
  const caller = req.user;

  const resolved = userType ? getModelByUserType(userType) : null;
  if (!resolved || resolved.label === "Course") {
    return res
      .status(400)
      .json({ success: false, message: "Invalid user type" });
  }

  // Provisioning rules:
  //  - Admin / Super Admin: only via the Super Admin (POST /api/super-admin/admins)
  //  - Teacher: Admin or Super Admin
  //  - Student: a Parent (for their own ward) or an Admin
  const isAdminCaller = caller.userType === "admin";
  if (resolved.label === "Admin") {
    return res.status(403).json({
      success: false,
      message: "Admins are created by the Super Admin via /api/super-admin/admins",
    });
  }
  if (resolved.label === "Teacher" && !isAdminCaller) {
    return res
      .status(403)
      .json({ success: false, message: "Only admins can create teachers" });
  }
  if (resolved.label === "Student") {
    const ownsWard = caller.userType === "parent" && String(caller.id) === String(parentId);
    if (!isAdminCaller && !ownsWard) {
      return res.status(403).json({
        success: false,
        message: "Only the parent or an admin can create a student",
      });
    }
  }
  if (resolved.label === "Parent" && !isAdminCaller) {
    return res
      .status(403)
      .json({ success: false, message: "Parents sign up via /api/users/register-parent" });
  }

  try {
    const generatedPassword = Math.random().toString(36).slice(-8);

    // The models hash the password in a pre-save hook, so pass it in plain.
    // (Hashing here as well double-hashed it and the emailed password never worked.)
    const userData = {
      ...req.body,
      email: String(email).toLowerCase().trim(),
      password: generatedPassword,
    };
    delete userData.role;
    delete userData.userType;
    if (resolved.label !== "Course") userData.userType = resolved.label.toLowerCase();

    if (resolved.label === "Student") userData.parentId = parentId;

    const newUser = await resolved.model.create(userData);
    if (resolved.label === "Student" && parentId) {
      await Parent.findByIdAndUpdate(parentId, { $addToSet: { children: newUser._id } });
    }

    // Send account details (including generated password) via email
    await sendEmail(
      email,
      "🎉 Welcome to Yare – Your Account Details Inside!",
      `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
        <h2 style="color: #2b2b2b;">Hello ${
          firstName ?? lastName ?? "there"
        },</h2>
    
        <p style="font-size: 16px;">
          🎉 <strong>Welcome to Yare!</strong> We're thrilled to have you with us.
        </p>
    
        <p style="font-size: 16px;">
          Your account has been successfully created and you're now onboard as a <strong>${
            resolved.label
          }</strong>.
        </p>
    
        <hr style="border: none; border-top: 1px solid #ccc; margin: 20px 0;" />
    
        <h3 style="color: #444;">🔐 Login Details:</h3>
        <ul style="font-size: 16px; padding-left: 20px;">
          <li><strong>Email:</strong> ${email}</li>
          <li><strong>Password:</strong> ${generatedPassword}</li>
        </ul>
    
        <p style="font-size: 15px; color: #b00020;">
          ⚠️ For your security, please change your password after logging in.
        </p>
    
        <hr style="border: none; border-top: 1px solid #ccc; margin: 20px 0;" />
    
        <p style="font-size: 16px;">
          If you need any assistance, feel free to reach out to our support team. We're here to help!
        </p>
    
        <p style="font-size: 16px; margin-top: 40px;">
          Warm regards,<br />
          <strong>The Yare Admin Team</strong>
        </p>
    
        <p style="font-size: 12px; color: #777; margin-top: 30px;">
          This is an automated message. Please do not reply directly to this email.
        </p>
      </div>
      `
    );
    console.log("8. Account details email sent to:", email);

    return res.status(201).json({
      success: true,
      message: `${resolved.label} created successfully`,
      data: { ...newUser.toObject(), password: undefined },
    });
  } catch (err) {
    console.error("❌ Error while creating user:", err.message);
    // Handle duplicate email error specifically
    if (err.code === 11000 && err.message.includes("email")) {
      return res.status(409).json({
        success: false,
        message: "Email already exists. Please use a different email address.",
        error: err.message,
      });
    }
    // Generic server error
    return res.status(500).json({
      success: false,
      message: "Failed to create user",
      error: err.message,
    });
  }
});

// === GET ALL USERS BY TYPE ===
router.get("/all/:userType", authMiddleware, async (req, res) => {
  const { userType } = req.params;
  const resolved = getModelByUserType(userType);

  if (!resolved)
    return res
      .status(400)
      .json({ success: false, message: "Invalid user type" });

  try {
    const users = await resolved.model.find();
    const sanitized = users.map((u) => {
      const name =
        userType === "course"
          ? u.title
          : `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim();
      return {
        _id: u._id,
        name,
        email: u.email || null,
        phoneNumber: u.phoneNumber || null,
        userType: u.userType || userType,
        createdAt: u.createdAt,
        isSuspended: u.isSuspended ?? false,
      };
    });

    return res.status(200).json({ success: true, data: sanitized });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch",
      error: error.message,
    });
  }
});

// === GET SINGLE USER WITH RELATIONS ===
// === GET SINGLE USER WITH RELATIONS ===
router.get(
  "/:userType/:id",
  authMiddleware,
  canAccessProfile,
  async (req, res) => {
    const { userType, id } = req.params;
    const actualType = userType === "superadmin" ? "admin" : userType;
    const resolved = getModelByUserType(actualType);

    if (!resolved) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid user type" });
    }

    try {
      const user = await resolved.model
        .findById(id)
        .select("-password -__v")
        .lean();
      if (!user) {
        return res
          .status(404)
          .json({ success: false, message: `${resolved.label} not found` });
      }

      let extra = {};

      if (actualType === "student") {
        const parent = user.parentId
          ? await Parent.findById(user.parentId).select("-password").lean()
          : null;

        const courses = user.courses?.length
          ? await Course.find({ _id: { $in: user.courses } }).lean()
          : [];

        const classes = await Class.find({ studentIds: id })
          .populate("teacherId")
          .lean();

        const fees = await LessonFee.find({ studentId: id }).lean();

        let subjects = [];
        if (user.isSubscribed && user.subjects?.length > 0) {
          subjects = await Subject.find({ _id: { $in: user.subjects } }).lean();
        }

        extra = {
          parentDetails: parent,
          courses,
          classes,
          lessonFee: fees,
          subjects,
        };
      }

      if (actualType === "parent") {
        const children = await Student.find({ parentId: id })
          .select("-password")
          .lean();

        for (let child of children) {
          if (child.isSubscribed && child.subjects?.length > 0) {
            const childSubjects = await Subject.find({
              _id: { $in: child.subjects },
            }).lean();
            child.subjectDetails = childSubjects;
          } else {
            child.subjectDetails = [];
          }
        }

        extra = { children };
      }

      if (actualType === "teacher") {
        const classes = await Class.find({ teacherId: id }).lean();

        const subjectQueries = [{ teachers: id }];
        if (Array.isArray(user.subjects) && user.subjects.length > 0) {
          subjectQueries.push({ _id: { $in: user.subjects } });
        }

        const subjects = await Subject.find({ $or: subjectQueries }).lean();

        extra = { classes, subjects };
      }

      if (actualType === "course") {
        const classes = await Class.find({ courseId: id })
          .populate("teacherId")
          .lean();

        const teachers = user.teacherIds?.length
          ? await Teacher.find({ _id: { $in: user.teacherIds } })
              .select("firstName lastName email")
              .lean()
          : [];

        const students = user.subscribedStudents?.length
          ? await Student.find({ _id: { $in: user.subscribedStudents } })
              .select("firstName lastName email subjects isSubscribed")
              .lean()
          : [];

        for (let s of students) {
          if (s.isSubscribed && s.subjects?.length > 0) {
            const studentSubjects = await Subject.find({
              _id: { $in: s.subjects },
            }).lean();
            s.subjectDetails = studentSubjects;
          } else {
            s.subjectDetails = [];
          }
        }

        const gradeIds = classes.map((c) => c.gradeId).filter(Boolean);
        const subjects = gradeIds.length
          ? await Subject.find({ gradeLevel: { $in: gradeIds } }).lean()
          : [];

        extra = {
          classes,
          teacherDetails: teachers,
          subscribedStudents: students,
          subjects,
        };
      }

      return res
        .status(200)
        .json({ success: true, data: { ...user, ...extra } });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: "Server error",
        error: error.message,
      });
    }
  },
);
// === UPDATE USER ===
router.put("/update/:userType/:id", authMiddleware, canAccessProfile, async (req, res) => {
  const { userType, id } = req.params;
  console.log("UPDATE START:", { userType, id, body: req.body });

  const actualType = userType === "superadmin" ? "admin" : userType;
  console.log("RESOLVED TYPE:", actualType);

  const resolved = getModelByUserType(actualType);
  console.log("MODEL RESOLVED:", resolved?.label);

  if (!resolved) {
    console.log("INVALID USER TYPE:", userType);
    return res
      .status(400)
      .json({ success: false, message: "Invalid user type" });
  }

  try {
    let update = { ...req.body };
    // Never let a profile update change credentials, role or ownership fields.
    const PROTECTED = ["password", "userType", "role", "superadmin", "email", "_id",
      "isSuspended", "isDeleted", "reports", "reported", "isVerified", "isPaid",
      "isPay", "isSubscribed", "lessonFeeId", "parentId", "children"];
    const callerIsAdmin = req.user.userType === "admin";
    PROTECTED.forEach((k) => {
      if (k === "isSuspended" && callerIsAdmin) return;
      delete update[k];
    });

    if (Array.isArray(req.body.skills)) {
      update.skills = req.body.skills;
      console.log("SKILLS UPDATED:", update.skills);
    }

    if (Array.isArray(req.body.languages)) {
      update.languages = req.body.languages;
      console.log("LANGUAGES UPDATED:", update.languages);
    }

    const updated = await resolved.model.findByIdAndUpdate(id, update, {
      new: true,
      runValidators: true,
    });

    if (!updated) {
      console.log(`${resolved.label} NOT FOUND WITH ID:`, id);
      return res
        .status(404)
        .json({ success: false, message: `${resolved.label} not found` });
    }

    console.log("UPDATE SUCCESSFUL FOR ID:", id);
    return res
      .status(200)
      .json({ success: true, message: "Updated", data: { ...updated.toObject(), password: undefined } });
  } catch (error) {
    console.error("UPDATE ERROR:", error);

    if (error.name === "ValidationError") {
      console.log("VALIDATION ERROR DETAILS:", error.errors);
      return res.status(400).json({
        success: false,
        message: "Validation error",
        details: error.errors,
      });
    }

    return res
      .status(500)
      .json({ success: false, message: "Update failed", error: error.message });
  }
});

router.post("/forgot-password", async (req, res) => {
  const { userType, email } = req.body;
  const resolved = getModelByUserType(userType);
  if (!resolved)
    return res
      .status(400)
      .json({ success: false, message: "Invalid user type" });

  try {
    const user = await resolved.model.findOne({ email });
    if (!user)
      return res
        .status(404)
        .json({ success: false, message: "User not found" });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    await Otp.findOneAndUpdate(
      { email },
      { otp, createdAt: new Date() },
      { upsert: true }
    );

    await sendEmail(
      email,
      "Yare OTP – Reset Password",
      otpEmail({
        displayName: user?.firstName || user?.name,
        isNewParent: false,
        otp,
      })
    );

    return res.status(200).json({ success: true, message: "OTP sent" });
  } catch (err) {
    return res
      .status(500)
      .json({ success: false, message: "Failed to send OTP" });
  }
});

// === RESEND OTP ===
router.post("/resend-otp", async (req, res) => {
  const { userType, email } = req.body;
  const resolved = getModelByUserType(userType);
  if (!resolved)
    return res
      .status(400)
      .json({ success: false, message: "Invalid user type" });

  try {
    const user = await resolved.model.findOne({ email });
    if (!user)
      return res
        .status(404)
        .json({ success: false, message: "User not found" });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    await Otp.findOneAndUpdate(
      { email },
      { otp, createdAt: new Date() },
      { upsert: true }
    );

    await sendEmail(
      email,
      "Yare OTP – Reset Password",
      otpEmail({
        displayName: user?.firstName || user?.name,
        isNewParent: false,
        otp,
      })
    );

    return res.status(200).json({ success: true, message: "OTP resent" });
  } catch (err) {
    return res
      .status(500)
      .json({ success: false, message: "Failed to resend" });
  }
});

router.post("/verify-forgot-password", async (req, res) => {
  const { email, otp } = req.body;
  try {
    const record = await Otp.findOne({ email, otp });
    if (!record)
      return res.status(400).json({ success: false, message: "Invalid OTP" });

    const expired = Date.now() - record.createdAt > 30 * 60 * 1000;
    if (expired) {
      await Otp.deleteOne({ email });
      return res.status(400).json({ success: false, message: "OTP expired" });
    }

    const token = generateToken(email, "15m");
    return res.status(200).json({ success: true, resetToken: token });
  } catch (err) {
    return res
      .status(500)
      .json({ success: false, message: "Verification failed" });
  }
});

router.post("/reset-password", async (req, res) => {
  const { userType, email, password } = req.body;

  if (!userType || !email || !password) {
    return res.status(400).json({
      success: false,
      message: "Missing required fields",
    });
  }

  const resolved = getModelByUserType(userType);
  if (!resolved) {
    return res.status(400).json({
      success: false,
      message: "Invalid user type",
    });
  }

  try {
    const user = await resolved.model.findOne({ email });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // ❗️ No hashing — save password directly
    user.password = password;

    await user.save();

    // Remove OTP after success
    await Otp.deleteOne({ email });

    return res.status(200).json({
      success: true,
      message: "Password reset successful",
    });
  } catch (err) {
    console.error("Reset password error:", err);
    return res.status(500).json({
      success: false,
      message: "Reset failed",
    });
  }
});


// === VERIFY TOKEN ROUTE ===
router.get("/verify-token", authMiddleware, async (req, res) => {
  try {
    // authMiddleware already validates the token and attaches req.user
    const resolved = getModelByUserType(req.user.userType);
    
    if (!resolved) {
      return res.status(400).json({ success: false, message: "Invalid user type in token" });
    }

    // Optional: Fetch the latest user details from the DB if you want fresh data on load
    const user = await resolved.model.findById(req.user.id).select("-password -__v").lean();
    
    if (!user) {
      return res.status(404).json({ success: false, message: "User no longer exists" });
    }

    return res.status(200).json({
      success: true,
      message: "Token is valid",
      data: {
        user,
        userType: req.user.userType,
      },
    });
  } catch (error) {
    console.error("Verify token error:", error);
    return res.status(500).json({ success: false, message: "Server error during token verification" });
  }
});


module.exports = router;
