-- Ensure no duplicates exist (safety)
DELETE FROM question_bank a
USING question_bank b
WHERE a.id > b.id
  AND a.institution_id = b.institution_id
  AND a.question_text = b.question_text
  AND a.question_type = b.question_type;

-- Add unique constraint
ALTER TABLE question_bank
ADD CONSTRAINT uq_question_per_institution
UNIQUE (institution_id, question_text, question_type);
