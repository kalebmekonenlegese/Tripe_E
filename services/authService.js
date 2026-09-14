const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const prisma = require('../utils/db');
const { validateEmail, validatePassword } = require('../utils/validation');
const jwtSecret = require('../utils/jwtSecret');

const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

const authError = (message, status) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

const registerUser = async ({ email, password, firstName, lastName }) => {
  if (!email || !password || !firstName || !lastName) {
    const error = new Error('Missing required fields: email, password, firstName, lastName');
    error.status = 400;
    throw error;
  }
  if (!validateEmail(email)) {
    throw authError('Invalid email format', 400);
  }
  if (!validatePassword(password)) {
    throw authError('Password must be at least 8 characters and include uppercase, lowercase, and a number', 400);
  }

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    const error = new Error('User already exists with this email');
    error.status = 409;
    throw error;
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { email, firstName, lastName, password: hashedPassword }
  });

  const token = jwt.sign(
    { id: user.id, email: user.email },
    jwtSecret,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );

  return {
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName
    },
    token
  };
};

const loginUser = async ({ email, password }) => {
  if (!email || !password) {
    throw authError('Email and password required', 400);
  }
  if (!validatePassword(password)) {
    throw authError('Password must be at least 8 characters and include uppercase, lowercase, and a number', 400);
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw authError('Invalid credentials', 401);
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw authError('Account temporarily locked. Try again later.', 423);
  }

  const passwordValid = await bcrypt.compare(password, user.password);
  if (!passwordValid) {
    const failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
    const isLockout = failedLoginAttempts >= MAX_FAILED_LOGIN_ATTEMPTS;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: isLockout ? 0 : failedLoginAttempts,
        lockedUntil: isLockout ? new Date(Date.now() + LOCKOUT_DURATION_MS) : null
      }
    });
    throw authError(isLockout ? 'Account temporarily locked. Try again later.' : 'Invalid credentials', isLockout ? 423 : 401);
  }

  if (user.failedLoginAttempts || user.lockedUntil) {
    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: null }
    });
  }

  const token = jwt.sign(
    { id: user.id, email: user.email },
    jwtSecret,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );

  return {
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName
    },
    token
  };
};

module.exports = {
  registerUser,
  loginUser
};
