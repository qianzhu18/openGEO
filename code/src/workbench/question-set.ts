const GROUP_HEADING_PATTERN =
  /^(?:#{1,6}\s*)?\*{0,2}\s*(?:非点名题|点名题|unbranded questions?|branded questions?)\s*\*{0,2}$/i;

export interface QuestionSetOptions {
  min: number;
  max: number;
  maxLength: number;
}

export interface QuestionSetResult {
  questions: string[];
  ignoredHeadings: string[];
}

/**
 * Normalizes question lines entered in the workspace. Markdown group headings
 * are intentionally discarded so presentation labels cannot become prompts.
 */
export function parseQuestionSet(values: unknown, options: QuestionSetOptions): QuestionSetResult {
  if (!Array.isArray(values)) {
    throw new Error(`Question set must contain between ${options.min} and ${options.max} lines.`);
  }

  const questions: string[] = [];
  const ignoredHeadings: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    if (typeof value !== 'string') throw new Error('Each question must be text.');
    const text = value.trim();
    if (!text) continue;
    if (GROUP_HEADING_PATTERN.test(text)) {
      ignoredHeadings.push(text);
      continue;
    }
    if (text.length > options.maxLength) {
      throw new Error(`Each question must be at most ${options.maxLength} characters.`);
    }

    const key = text.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      questions.push(text);
    }
  }

  if (questions.length < options.min) {
    throw new Error(`Question set must contain at least ${options.min} actual question.`);
  }
  if (questions.length > options.max) {
    throw new Error(`Question set must contain at most ${options.max} actual questions.`);
  }

  return { questions, ignoredHeadings };
}
