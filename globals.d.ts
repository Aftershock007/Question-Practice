declare const RBI_OFFICIAL_SCHEDULE_DATA: Array<{
  day: number;
  dayType: string;
  p2_subject: string;
  p2_topic: string;
  p1_subject: string;
  p1_topic: string;
  ca: string;
}>;

declare const AnswerMarks: Record<string, any>;

declare const AIEval: {
  init(): void;
  autoEvaluate(test: any): void;
  renderResultScreen(test: any): void;
  historyBlockHTML(test: any, q: any): string;
  deleteTestReports(testId: string): void;
  clearAllReports(): void;
  getReport(testId: string, qid: string): any;
  openSettings(testId?: string): void;
  _internal: Record<string, any>;
};

interface Window {
  AI_CONFIG: any;
  AIEval: typeof AIEval;
  RBI_OFFICIAL_SCHEDULE_DATA: typeof RBI_OFFICIAL_SCHEDULE_DATA;
  pdfjsLib: any;
}
