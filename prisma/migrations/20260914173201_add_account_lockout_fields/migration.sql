-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "chapaCheckoutUrl" TEXT,
ADD COLUMN     "chapaPaymentId" TEXT,
ADD COLUMN     "chapaStatus" TEXT,
ADD COLUMN     "chapaTxRef" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lockedUntil" TIMESTAMP(3);
