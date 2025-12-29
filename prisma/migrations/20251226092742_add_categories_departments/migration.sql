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

-- CreateTable
CREATE TABLE "categories" (
    "id" SERIAL NOT NULL,
    "institution_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departments" (
    "id" SERIAL NOT NULL,
    "institution_id" INTEGER NOT NULL,
    "category_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "hod_user_id" BIGINT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "categories_institution_id_code_key" ON "categories"("institution_id", "code");

-- CreateIndex
CREATE INDEX "departments_institution_id_idx" ON "departments"("institution_id");

-- CreateIndex
CREATE UNIQUE INDEX "departments_institution_id_code_key" ON "departments"("institution_id", "code");

-- AddForeignKey
ALTER TABLE "permissions" ADD CONSTRAINT "permissions_feature_code_fkey" FOREIGN KEY ("feature_code") REFERENCES "features"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_hod_user_id_fkey" FOREIGN KEY ("hod_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
