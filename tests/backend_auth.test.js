jest.mock('../utils/db', () => ({
  user: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() }
}));

const prisma = require('../utils/db');
const bcrypt = require('bcrypt');
const { registerUser, loginUser } = require('../services/authService');

jest.mock('bcrypt');

describe('authService (unit)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('registerUser success', async () => {
    prisma.user.findUnique.mockResolvedValueOnce(null);
    bcrypt.hash.mockResolvedValueOnce('hashed');
    prisma.user.create.mockResolvedValueOnce({ id: 'u1', email: 'a@b.com', firstName: 'A', lastName: 'B' });

    const res = await registerUser({ email: 'a@b.com', password: 'Password1', firstName: 'A', lastName: 'B' });
    expect(res.user).toBeDefined();
    expect(res.token).toBeDefined();
  });

  test('registerUser existing user -> conflict', async () => {
    prisma.user.findUnique.mockResolvedValueOnce({ id: 'u1' });
    await expect(registerUser({ email: 'a@b.com', password: 'Password1', firstName: 'A', lastName: 'B' })).rejects.toThrow();
  });

  test('registerUser rejects weak passwords with the complete rule', async () => {
    await expect(registerUser({ email: 'a@b.com', password: 'password', firstName: 'A', lastName: 'B' }))
      .rejects.toThrow(/uppercase, lowercase, and a number/i);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  test('loginUser invalid credentials', async () => {
    prisma.user.findUnique.mockResolvedValueOnce(null);
    await expect(loginUser({ email: 'nope@b.com', password: 'Password1' })).rejects.toThrow();
  });

  test('loginUser locks an account after five wrong passwords', async () => {
    const user = { id: 'u1', email: 'a@b.com', password: 'hashed', failedLoginAttempts: 4, lockedUntil: null };
    prisma.user.findUnique.mockResolvedValue(user);
    bcrypt.compare.mockResolvedValue(false);

    await expect(loginUser({ email: 'a@b.com', password: 'Wrong123' })).rejects.toMatchObject({ status: 423 });
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'u1' },
      data: expect.objectContaining({ failedLoginAttempts: 0, lockedUntil: expect.any(Date) })
    }));
  });

  test('loginUser rejects locked accounts before comparing passwords', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'a@b.com',
      password: 'hashed',
      failedLoginAttempts: 0,
      lockedUntil: new Date(Date.now() + 60_000)
    });

    await expect(loginUser({ email: 'a@b.com', password: 'Wrong123' })).rejects.toMatchObject({ status: 423 });
    expect(bcrypt.compare).not.toHaveBeenCalled();
  });
});