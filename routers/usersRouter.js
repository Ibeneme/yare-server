const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt"); // Correctly using "bcrypt"
const jwt = require("jsonwebtoken"); // Import jsonwebtoken
const Teacher = require("../models/Teacher");
const Student = require("../models/Student");
const Parent = require("../models/Parent");
const Admin = require("../models/Admin");
const Course = require("../models/Course");
const Class = require("../models/Class");
const LessonFee = require("../models/LessonFee"); // Import LessonFee model
const Otp = require("../models/Otp"); // Import Otp model
const sendEmail = require("../utils/mailer"); // Assuming this utility exists
const { generateToken } = require("../utils/token");
const authMiddleware = require("../middlewares/authMiddleware");

// Helper function to get the Mongoose model based on userType
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
    case "course": // Although Course is not a 'user', it's handled similarly for CRUD
      return { model: Course, label: "Course" };
    default:
      return null;
  }
};

// --- ROUTES ---

// POST /api/users/create
// Creates a new user/entity (Teacher, Student, Parent, Admin, Course)
router.post("/create", async (req, res) => {
  const { userType, email, firstName, lastName, parentId } = req.body;

  console.log("1. Received /create request with body:", req.body);

  const resolved = getModelByUserType(userType);
  console.log(
    "2. Resolved model for userType:",
    userType,
    "=>",
    resolved?.label
  );

  if (!resolved) {
    console.log("3. Invalid user type:", userType);
    return res
      .status(400)
      .json({ success: false, message: "Invalid user type" });
  }

  try {
    // Generate a random 8-character password for new users
    const generatedPassword = Math.random().toString(36).slice(-8);
    console.log("4. Generated password (for email):", generatedPassword);

    // Hash the generated password using bcrypt with 10 salt rounds
    const salt = await bcrypt.genSalt(10); // Recommended number of salt rounds
    const hashedPassword = await bcrypt.hash(generatedPassword, salt);
    console.log("5. Password hashed successfully.");

    const userData = {
      ...req.body,
      password: hashedPassword,
    };

    // If creating a student, ensure parentId is assigned
    if (userType.toLowerCase() === "student") {
      userData.parentId = parentId;
      console.log("6. Assigned parentId to student:", parentId);
    }

    // Create the new user/entity in the database
    const newUser = await resolved.model.create(userData);
    console.log(`7. ${resolved.label} created in DB with ID: ${newUser._id}`);

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
      data: newUser,
      generatedPassword, // Return generated password for immediate use/display if needed (e.g., in admin UI)
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

// GET /api/users/all/:userType
// Retrieves all users/entities of a specific type
router.get("/all/:userType", authMiddleware, async (req, res) => {
  const { userType } = req.params;

  console.log(`1. reqReceived /all/${userType} request. ${req.user}`);
  console.log(req.user, 'req.user');

  const userTypeType = req.user.userType

  const resolved = getModelByUserType(userType);
  console.log("2. Resolved model for userType:", resolved?.label);

  if (!resolved) {
    console.log("3. Invalid user type detected.");
    return res.status(400).json({
      success: false,
      message: "Invalid user type",
    });
  }

  try {
    const users = await resolved.model.find();
    console.log(`4. Found ${users.length} ${resolved.label}(s).`);

    // Sanitize user data before sending (e.g., remove sensitive fields)
    const sanitizedUsers = users.map((user) => {
      let name = "";
      if (userType === "course") {
        name = user.title; // Courses have a 'title'
      } else {
        name = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim(); // Users have names
      }

      return {
        _id: user._id,
        name,
        email: user.email || null,
        phoneNumber: user.phoneNumber || null,
        userType: user.userType || userType, // Use user's own userType if available, else from param
        createdAt: user.createdAt,
        isSuspended: user.isSuspended ?? false, // Default to false if not present
      };
    });

    console.log("5. Users data sanitized and ready to send.");
    return res.status(200).json({
      success: true,
      data: sanitizedUsers,
    });
  } catch (error) {
    console.error("❌ Error fetching all users:", error.message);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch users",
      error: error.message,
    });
  }
});

// GET /api/users/:userType/:id
// Retrieves a single user/entity by ID, with associated details (e.g., student's parent, courses, classes)
router.get("/:userType/:id", async (req, res) => {
  const { userType, id } = req.params;
  console.log(`1. Received /${userType}/${id} request.`);

  const actualUserType = userType.toLowerCase() === "superadmin" ? "admin" : userType;
  const resolved = getModelByUserType(actualUserType);
  console.log("2. Resolved model for actual userType:", resolved?.label);

  if (!resolved) {
    return res.status(400).json({ success: false, message: "Invalid user type" });
  }

  try {
    const user = await resolved.model.findById(id).lean();
    if (!user) {
      return res.status(404).json({ success: false, message: `${resolved.label} not found` });
    }

    let parentDetails = null;
    let fullCourses = [];
    let children = [];
    let classes = [];
    let lessonFee = [];
    let teacherDetails = [];
    let subscribedStudents = [];

    if (actualUserType === "student") {
      if (user.parentId) {
        const ParentModel = getModelByUserType("parent")?.model;
        if (ParentModel) {
          parentDetails = await ParentModel.findById(user.parentId).select("-password -__v").lean();
        }
      }

      if (Array.isArray(user.courses) && user.courses.length > 0) {
        const CourseModel = getModelByUserType("course")?.model;
        if (CourseModel) {
          fullCourses = await CourseModel.find({ _id: { $in: user.courses } }).select("-__v").lean();
        }
      }

      lessonFee = await LessonFee.find({ studentId: user._id }).lean();
      classes = await Class.find({ studentIds: user._id.toString() })
        .populate("courseId", "title")
        .populate("teacherId", "firstName lastName")
        .lean();
    }

    if (actualUserType === "teacher") {
      classes = await Class.find({ teacherId: user._id })
        .populate("courseId", "title")
        .lean();
    }

    if (actualUserType === "course") {
      // Populate classes for this course
      classes = await Class.find({ courseId: user._id })
        .populate("teacherId", "firstName lastName email")
        .lean();

      // Populate teachers from course.teacherIds
      if (Array.isArray(user.teacherIds) && user.teacherIds.length > 0) {
        const TeacherModel = getModelByUserType("teacher")?.model;
        if (TeacherModel) {
          teacherDetails = await Promise.all(
            user.teacherIds.map(async (tid) => {
              const teacher = await TeacherModel.findById(tid)
                .select("firstName lastName email certifications")
                .lean();
              
              // Fetch classes taught by this teacher for this course
              const teacherClasses = await Class.find({ teacherId: tid, courseId: user._id })
                .populate("courseId", "title")
                .lean();

              return {
                ...teacher,
                classes: teacherClasses
              };
            })
          );
        }
      }

      // Populate subscribed students
      if (Array.isArray(user.subscribedStudents) && user.subscribedStudents.length > 0) {
        const StudentModel = getModelByUserType("student")?.model;
        if (StudentModel) {
          subscribedStudents = await StudentModel.find({ _id: { $in: user.subscribedStudents } })
            .select("firstName lastName email")
            .lean();
        }
      }
    }

    if (actualUserType === "parent") {
      const StudentModel = getModelByUserType("student")?.model;
      if (StudentModel) {
        children = await StudentModel.find({ parentId: id })
          .select("-password -__v -updatedAt")
          .lean();
      }
    }

    return res.status(200).json({
      success: true,
      data: Object.assign({}, user,
        actualUserType === "student" ? { parentDetails, courses: fullCourses, classes, lessonFee } : {},
        actualUserType === "teacher" ? { classes } : {},
        actualUserType === "course" ? { classes, teacherDetails, subscribedStudents } : {},
        actualUserType === "parent" ? { children } : {}
      )
    });
  } catch (error) {
    console.error("❌ Error fetching user data:", error.message);
    return res.status(500).json({ success: false, message: "Failed to fetch user", error: error.message });
  }
});

// PUT /api/users/update/:userType/:id
// Updates an existing user/entity by ID
router.put("/update/:userType/:id", async (req, res) => {
  console.log("1. PUT /update/:userType/:id route hit.");
  console.log("2. Request Params:", req.params);
  console.log("3. Request Body:", req.body);

  let { userType, id } = req.params;
  console.log(`4. Extracted userType: ${userType}, id: ${id}`);

  // Normalize superadmin to admin for model resolution
  if (userType === "superadmin") {
    console.log(
      "→ Detected superadmin, treating as admin for model resolution."
    );
    userType = "admin";
  }

  const resolved = getModelByUserType(userType);
  console.log("5. Resolved model from getModelByUserType:", resolved?.label);

  if (!resolved) {
    console.log("6. Invalid user type detected. Sending 400 response.");
    return res.status(400).json({
      success: false,
      message: "Invalid user type",
    });
  }

  try {
    let updatePayload = { ...req.body };

    // Handle specific array fields like skills and languages if they exist in the body
    if (Array.isArray(req.body.skills)) {
      updatePayload.skills = req.body.skills;
    }
    if (Array.isArray(req.body.languages)) {
      updatePayload.languages = req.body.languages;
    }
    // Note: Password updates should ideally go through a separate, secure route
    // that hashes the new password before updating. This route assumes password
    // is NOT being updated here, or if it is, it's already hashed (which is not ideal).

    console.log(
      `7. Attempting to find and update ${resolved.label} with ID: ${id}`
    );
    const updated = await resolved.model.findByIdAndUpdate(id, updatePayload, {
      new: true, // Return the modified document rather than the original
      runValidators: true, // Run Mongoose validators on the update operation
    });
    console.log("8. findByIdAndUpdate operation completed.");

    if (!updated) {
      console.log(
        `9. ${resolved.label} not found with ID: ${id}. Sending 404 response.`
      );
      return res.status(404).json({
        success: false,
        message: `${resolved.label} not found`,
      });
    }

    console.log(
      `10. ${resolved.label} with ID: ${updated._id} updated successfully. Sending 200 response.`
    );
    console.log("11. Updated data:", updated);
    return res.status(200).json({
      success: true,
      message: `${resolved.label} updated successfully`,
      data: updated,
    });
  } catch (error) {
    console.error(
      "❌ An error occurred during update operation:",
      error.message
    );
    if (error.name === "ValidationError") {
      // Handle Mongoose validation errors
      return res.status(400).json({
        success: false,
        message: "Validation Error",
        error: error.message,
        details: error.errors, // Provides more specific validation error details
      });
    }
    // Generic server error
    return res.status(500).json({
      success: false,
      message: "Failed to update user",
      error: error.message,
    });
  }
});

// POST /api/users/auth/signin
// Handles user authentication (login)
router.post("/auth/signin", async (req, res) => {
  const { userType, email, password } = req.body;

  console.log("🔐 Sign-in attempt received.", email, password, userType);

  if (!userType || !email || !password) {
    return res.status(400).json({
      success: false,
      message: "Missing required credentials.",
    });
  }

  const resolved = getModelByUserType(userType);
  const model = resolved?.model;

  if (!model) {
    console.warn("⚠️ Invalid user type:", userType);
    return res.status(400).json({
      success: false,
      message: "Invalid user type",
    });
  }

  try {
    const user = await model.findOne({ email }).select("+password");

    if (!user) {
      console.warn("❌ User not found:", email);
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (!user.password) {
      console.error("❌ Password missing in DB for:", email);
      return res.status(500).json({
        success: false,
        message: "Password not found. Contact support.",
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    console.warn("redentials:", password, user.password, email);

    if (!isMatch) {
      console.warn("❌ Invalid credentials:", password, user.password, email);
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    // Set userType if not set
    if (!user.userType) {
      user.userType = userType;
      await user.save();
      console.log("📝 userType was missing. Updated to:", userType);
    }

    const token = generateToken(user._id, userType, "400d");
    const userResponse = user.toObject();

    delete userResponse.password;
    delete userResponse.otp;
    delete userResponse.otpExpires;
    delete userResponse.__v;

    console.log("✅ Sign-in successful:", email);

    return res.status(200).json({
      success: true,
      message: "Sign-in successful",
      data: userResponse,
      token,
    });
  } catch (error) {
    console.error("🔥 Error during sign-in:", error.message);
    return res.status(500).json({
      success: false,
      message: "Server error during sign-in",
      error: error.message,
    });
  }
});

// POST /api/users/forgot-password
// Initiates the password reset process by sending an OTP to the user's email
router.post("/forgot-password", async (req, res) => {
  const { userType, email } = req.body;
  console.log("1. 📩 Forgot password requested for:", { userType, email });

  const resolved = getModelByUserType(userType);
  if (!resolved) {
    console.log("2. Invalid user type detected.");
    return res
      .status(400)
      .json({ success: false, message: "Invalid user type" });
  }

  try {
    const user = await resolved.model.findOne({ email });
    if (!user) {
      console.log(`3. ${resolved.label} not found for email: ${email}`);
      return res
        .status(404)
        .json({ success: false, message: `${resolved.label} not found` });
    }

    // Generate a 6-digit OTP
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    console.log("4. Generated OTP:", otpCode);

    // Save or update the OTP in the Otp model. createdAt will be used for expiration check.
    await Otp.findOneAndUpdate(
      { email },
      { otp: otpCode, createdAt: new Date() },
      { upsert: true, new: true, setDefaultsOnInsert: true } // upsert creates if not found, new returns updated doc
    );
    console.log("5. OTP saved/updated in DB for email:", email);

    // Send the OTP to the user's email
    await sendEmail(
      email,
      "Your OTP for Password Reset",
      `Your One-Time Password (OTP) for resetting your password is: ${otpCode}.\n\nThis OTP is valid for 30 minutes.`
    );
    console.log("6. OTP email sent to:", email);

    res.status(200).json({ success: true, message: "OTP sent to your email." });
  } catch (err) {
    console.error("❌ Forgot password error:", err.message);
    res.status(500).json({
      success: false,
      message: "Failed to send OTP. Please try again later.",
    });
  }
});

// POST /api/users/resend-otp
// Resends an OTP to the user's email for password reset
router.post("/resend-otp", async (req, res) => {
  const { userType, email } = req.body;
  console.log("1. 🔁 Resend OTP request for:", { userType, email });

  const resolved = getModelByUserType(userType);
  if (!resolved) {
    console.log("2. Invalid user type detected.");
    return res
      .status(400)
      .json({ success: false, message: "Invalid user type" });
  }

  try {
    const user = await resolved.model.findOne({ email });
    if (!user) {
      console.log(`3. ${resolved.label} not found for email: ${email}`);
      return res
        .status(404)
        .json({ success: false, message: `${resolved.label} not found` });
    }

    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    console.log("4. Generated new OTP for resend:", otpCode);

    await Otp.findOneAndUpdate(
      { email },
      { otp: otpCode, createdAt: new Date() },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    console.log("5. New OTP saved/updated in DB for email:", email);

    await sendEmail(
      email,
      "Resent OTP for Password Reset",
      `Your new One-Time Password (OTP) for resetting your password is: ${otpCode}.\n\nThis OTP is valid for 30 minutes.`
    );
    console.log("6. New OTP email sent to:", email);

    res
      .status(200)
      .json({ success: true, message: "New OTP resent to your email." });
  } catch (err) {
    console.error("❌ Resend OTP error:", err.message);
    res.status(500).json({
      success: false,
      message: "Failed to resend OTP. Please try again later.",
    });
  }
});

// POST /api/users/verify-forgot-password
// Verifies the OTP provided by the user for password reset
router.post("/verify-forgot-password", async (req, res) => {
  const { email, otp } = req.body;
  console.log("1. ✅ [Request Received] /verify-forgot-password");
  console.log("2. Request Body:", req.body);

  try {
    const record = await Otp.findOne({ email, otp });
    console.log(
      "3. DB Query Result for OTP verification:",
      record ? "Found" : "Not Found"
    );

    if (!record) {
      console.log("4. ❌ Invalid OTP for:", email);
      return res
        .status(400)
        .json({ success: false, message: "Invalid OTP or OTP expired." });
    }

    // Check if OTP has expired (e.g., 30 minutes)
    const otpExpirationTime = 30 * 60 * 1000; // 30 minutes in milliseconds
    const now = new Date();
    if (now.getTime() - record.createdAt.getTime() > otpExpirationTime) {
      // If OTP is expired, delete it and inform the user
      await Otp.deleteOne({ email });
      console.log("5. ❌ OTP expired for:", email);
      return res.status(400).json({
        success: false,
        message: "OTP expired. Please request a new one.",
      });
    }

    // Generate a temporary reset token (JWT) valid for a short period (e.g., 15 minutes)
    // This token allows the user to proceed to the password reset form.
    const resetToken = generateToken(email, "15m");

    console.log("6. ✅ OTP Verified. Generated reset token.");

    return res.status(200).json({ success: true, resetToken });
  } catch (err) {
    console.error("7. 🔥 OTP verification error:", err.message);
    return res
      .status(500)
      .json({ success: false, message: "Failed to verify OTP." });
  }
});

// POST /api/users/reset-password
// Resets the user's password after OTP verification
router.post("/reset-password", async (req, res) => {
  const { userType, email, password } = req.body;

  console.log("1. 🔒 Password reset attempt for:", { userType, email });

  const resolved = getModelByUserType(userType);
  if (!resolved) {
    console.log("2. Invalid user type detected.");
    return res
      .status(400)
      .json({ success: false, message: "Invalid user type" });
  }

  try {
    const user = await resolved.model.findOne({ email });
    console.log("3. Fetched user:", user ? user._id : "Not Found");

    if (!user) {
      console.log(`4. ❌ ${resolved.label} not found for email:`, email);
      return res
        .status(404)
        .json({ success: false, message: `${resolved.label} not found` });
    }

    user.password = password; 
    await user.save();
    console.log("5. ✅ Password updated for:", email);

    
    const deletedOtp = await Otp.deleteOne({ email });
    console.log("6. 🧹 OTP deletion result:", deletedOtp);

    res
      .status(200)
      .json({ success: true, message: "Password reset successful." });
  } catch (err) {
    console.error("7. ❌ Reset password error:", err.message);
    res
      .status(500)
      .json({ success: false, message: "Failed to reset password." });
  }
});

module.exports = router;
