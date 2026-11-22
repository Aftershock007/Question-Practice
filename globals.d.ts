// Editor / language-server hints only. The browser never loads this file.
// The app's scripts are classic <script> tags that share one global scope;
// these are the globals that are attached to `window` instead of declared
// with a top-level const/function, so tooling can resolve them across files.

declare const RBI_OFFICIAL_SCHEDULE_DATA: Array<{
  day: number;
  dayType: string;
  p2_subject: string;
  p2_topic: string;
  p1_subject: string;
  p1_topic: string;
  ca: string;
}>;

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
