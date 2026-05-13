const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const prisma = require("../lib/prisma");
const { ConflictError, ValidationError, UnauthorizedError } = require("../lib/errors");


const SECRET = process.env.JWT_SECRET;
// Here we will add all routes related to authentication
router.post("/register", async (req, res) => {
  const { email, password, name } = req.body;

  if (!email || !password || !name) {
    throw new ValidationError("Email, password and name are required")
  }

  // Check if user already exists
  const existingUser = await prisma.user.findUnique({ where: { email },});

  if (existingUser) {
    throw new ConflictError("Email already registered")
  }

  // Hash the password
  const hashedPassword = await bcrypt.hash(password, 10);

  // Create the user
  const user = await prisma.user.create({
    data: { email, password: hashedPassword, name },
  });

  // Generate a token
  const token = jwt.sign({ userId: user.id }, SECRET, { expiresIn: "1h" });

  res.status(201).json({
    message: "User registered successfully",
    token,
  });
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw new ValidationError(" Email and password are required ")
  }

  // Find the user
  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    throw new UnauthorizedError(" Invalid credentials" )
  }

  // Verify the password
  const isValid = await bcrypt.compare(password, user.password);

  if (!isValid) {
    throw new UnauthorizedError(" Invalid credentials" )
  }

  // Generate a token
  const token = jwt.sign({ userId: user.id }, SECRET, { expiresIn: "1h" });

  res.json({ token });
});

module.exports = router; // This should be the last line
