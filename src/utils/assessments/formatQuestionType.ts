export function formatQuestionType(type: string) {
  switch (type) {
    case 'single_correct':
      return 'MCQ - Single correct answer';
    case 'multiple_correct':
      return 'MCQ - Multiple correct answers';
    case 'true_false':
      return 'True / False';
    default:
      return type;
  }
}

export function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}