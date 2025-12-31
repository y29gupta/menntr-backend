/*
  Warnings:

  - You are about to drop the column `code` on the `permissions` table. All the data in the column will be lost.
  - You are about to drop the column `feature_id` on the `permissions` table. All the data in the column will be lost.
  - You are about to drop the column `name` on the `permissions` table. All the data in the column will be lost.
  - Added the required column `feature_code` to the `permissions` table without a default value. This is not possible if the table is not empty.
  - Added the required column `permission_code` to the `permissions` table without a default value. This is not possible if the table is not empty.
  - Added the required column `permission_name` to the `permissions` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "permissions" DROP CONSTRAINT "permissions_feature_id_fkey";

-- DropIndex
DROP INDEX "permissions_code_key";

-- AlterTable
ALTER TABLE "permissions" DROP COLUMN "code",
DROP COLUMN "feature_id",
DROP COLUMN "name",
ADD COLUMN     "feature_code" TEXT NOT NULL,
ADD COLUMN     "permission_code" TEXT NOT NULL,
ADD COLUMN     "permission_name" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "roles" ADD COLUMN     "code" TEXT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AddForeignKey
ALTER TABLE "permissions" ADD CONSTRAINT "permissions_feature_code_fkey" FOREIGN KEY ("feature_code") REFERENCES "features"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
