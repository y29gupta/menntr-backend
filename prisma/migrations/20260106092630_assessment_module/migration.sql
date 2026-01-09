-- CreateEnum
CREATE TYPE "AssessmentStatus" AS ENUM ('draft', 'published', 'active', 'closed', 'archived');

-- CreateEnum
CREATE TYPE "QuestionDifficulty" AS ENUM ('easy', 'medium', 'hard', 'expert');

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('single_correct', 'multiple_correct', 'true_false');

-- CreateEnum
CREATE TYPE "AttemptStatus" AS ENUM ('not_started', 'in_progress', 'submitted', 'evaluated', 'expired');

-- CreateTable
CREATE TABLE "question_bank" (
    "id" BIGSERIAL NOT NULL,
    "institution_id" INTEGER NOT NULL,
    "created_by" BIGINT NOT NULL,
    "question_text" TEXT NOT NULL,
    "question_type" "QuestionType" NOT NULL DEFAULT 'single_correct',
    "difficulty_level" "QuestionDifficulty" NOT NULL DEFAULT 'medium',
    "default_points" INTEGER NOT NULL DEFAULT 1,
    "negative_points" INTEGER NOT NULL DEFAULT 0,
    "time_limit_seconds" INTEGER,
    "explanation" TEXT,
    "hints" TEXT,
    "media_url" TEXT,
    "reference_url" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "tags" TEXT[],
    "usage_count" INTEGER NOT NULL DEFAULT 0,
    "avg_accuracy" DECIMAL(5,2),
    "avg_time_taken" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "verified_by" BIGINT,
    "verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "question_bank_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_options" (
    "id" BIGSERIAL NOT NULL,
    "question_id" BIGINT NOT NULL,
    "option_text" TEXT NOT NULL,
    "option_label" TEXT NOT NULL,
    "is_correct" BOOLEAN NOT NULL DEFAULT false,
    "explanation" TEXT,
    "media_url" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "question_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessments" (
    "id" BIGSERIAL NOT NULL,
    "institution_id" INTEGER NOT NULL,
    "feature_id" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "created_by" BIGINT NOT NULL,
    "total_marks" INTEGER NOT NULL DEFAULT 0,
    "passing_marks" INTEGER,
    "duration_minutes" INTEGER NOT NULL,
    "instructions" TEXT,
    "status" "AssessmentStatus" NOT NULL DEFAULT 'draft',
    "start_time" TIMESTAMP(3),
    "end_time" TIMESTAMP(3),
    "auto_submit" BOOLEAN NOT NULL DEFAULT true,
    "shuffle_questions" BOOLEAN NOT NULL DEFAULT false,
    "shuffle_options" BOOLEAN NOT NULL DEFAULT false,
    "allow_question_skip" BOOLEAN NOT NULL DEFAULT true,
    "allow_backtrack" BOOLEAN NOT NULL DEFAULT true,
    "show_results_immediate" BOOLEAN NOT NULL DEFAULT false,
    "show_correct_answers" BOOLEAN NOT NULL DEFAULT false,
    "show_solutions" BOOLEAN NOT NULL DEFAULT false,
    "allow_review" BOOLEAN NOT NULL DEFAULT true,
    "max_attempts" INTEGER NOT NULL DEFAULT 1,
    "attempts_gap_hours" INTEGER,
    "proctoring_enabled" BOOLEAN NOT NULL DEFAULT false,
    "require_webcam" BOOLEAN NOT NULL DEFAULT false,
    "tab_switch_limit" INTEGER,
    "copy_paste_allowed" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "tags" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "published_at" TIMESTAMP(3),

    CONSTRAINT "assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_questions" (
    "id" BIGSERIAL NOT NULL,
    "assessment_id" BIGINT NOT NULL,
    "question_id" BIGINT NOT NULL,
    "points" INTEGER NOT NULL,
    "negative_points" INTEGER NOT NULL DEFAULT 0,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_mandatory" BOOLEAN NOT NULL DEFAULT true,
    "section_name" TEXT,
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assessment_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_batches" (
    "assessment_id" BIGINT NOT NULL,
    "batch_id" INTEGER NOT NULL,
    "assigned_by" BIGINT,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assessment_batches_pkey" PRIMARY KEY ("assessment_id","batch_id")
);

-- CreateTable
CREATE TABLE "assessment_students" (
    "assessment_id" BIGINT NOT NULL,
    "student_id" BIGINT NOT NULL,
    "assigned_by" BIGINT,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,

    CONSTRAINT "assessment_students_pkey" PRIMARY KEY ("assessment_id","student_id")
);

-- CreateTable
CREATE TABLE "assessment_attempts" (
    "id" BIGSERIAL NOT NULL,
    "assessment_id" BIGINT NOT NULL,
    "student_id" BIGINT NOT NULL,
    "attempt_number" INTEGER NOT NULL DEFAULT 1,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submitted_at" TIMESTAMP(3),
    "time_taken_seconds" INTEGER,
    "auto_submitted" BOOLEAN NOT NULL DEFAULT false,
    "status" "AttemptStatus" NOT NULL DEFAULT 'not_started',
    "total_questions" INTEGER NOT NULL DEFAULT 0,
    "answered_questions" INTEGER NOT NULL DEFAULT 0,
    "correct_answers" INTEGER NOT NULL DEFAULT 0,
    "wrong_answers" INTEGER NOT NULL DEFAULT 0,
    "skipped_questions" INTEGER NOT NULL DEFAULT 0,
    "score_obtained" DECIMAL(10,2) NOT NULL,
    "total_score" DECIMAL(10,2) NOT NULL,
    "percentage" DECIMAL(5,2),
    "rank" INTEGER,
    "percentile" DECIMAL(65,30),
    "tab_switches" INTEGER NOT NULL DEFAULT 0,
    "violations" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assessment_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attempt_answers" (
    "id" BIGSERIAL NOT NULL,
    "attempt_id" BIGINT NOT NULL,
    "assessment_question_id" BIGINT NOT NULL,
    "question_id" BIGINT NOT NULL,
    "selected_option_ids" BIGINT[],
    "is_correct" BOOLEAN,
    "points_earned" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "time_taken_seconds" INTEGER,
    "answered_at" TIMESTAMP(3),
    "is_flagged" BOOLEAN NOT NULL DEFAULT false,
    "visit_count" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "attempt_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "difficulty_scoring" (
    "id" SERIAL NOT NULL,
    "institution_id" INTEGER NOT NULL,
    "difficulty_level" "QuestionDifficulty" NOT NULL,
    "default_points" INTEGER NOT NULL,
    "negative_points" INTEGER NOT NULL DEFAULT 0,
    "time_weight" DECIMAL(3,2) NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "difficulty_scoring_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "assessment_questions_assessment_id_question_id_key" ON "assessment_questions"("assessment_id", "question_id");

-- CreateIndex
CREATE UNIQUE INDEX "attempt_answers_attempt_id_assessment_question_id_key" ON "attempt_answers"("attempt_id", "assessment_question_id");

-- CreateIndex
CREATE UNIQUE INDEX "difficulty_scoring_institution_id_difficulty_level_key" ON "difficulty_scoring"("institution_id", "difficulty_level");

-- AddForeignKey
ALTER TABLE "question_bank" ADD CONSTRAINT "question_bank_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_bank" ADD CONSTRAINT "question_bank_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_bank" ADD CONSTRAINT "question_bank_verified_by_fkey" FOREIGN KEY ("verified_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_options" ADD CONSTRAINT "question_options_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "question_bank"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_feature_id_fkey" FOREIGN KEY ("feature_id") REFERENCES "features"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_questions" ADD CONSTRAINT "assessment_questions_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_questions" ADD CONSTRAINT "assessment_questions_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "question_bank"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_batches" ADD CONSTRAINT "assessment_batches_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_batches" ADD CONSTRAINT "assessment_batches_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_batches" ADD CONSTRAINT "assessment_batches_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_students" ADD CONSTRAINT "assessment_students_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_students" ADD CONSTRAINT "assessment_students_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_students" ADD CONSTRAINT "assessment_students_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_attempts" ADD CONSTRAINT "assessment_attempts_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "assessments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_attempts" ADD CONSTRAINT "assessment_attempts_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt_answers" ADD CONSTRAINT "attempt_answers_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "assessment_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt_answers" ADD CONSTRAINT "attempt_answers_assessment_question_id_fkey" FOREIGN KEY ("assessment_question_id") REFERENCES "assessment_questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt_answers" ADD CONSTRAINT "attempt_answers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "question_bank"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "difficulty_scoring" ADD CONSTRAINT "difficulty_scoring_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
