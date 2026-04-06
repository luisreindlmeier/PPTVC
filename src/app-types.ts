export type ScopeTab = "history" | "diff" | "workflow";

export interface StatusMessage {
  text: string;
  isError: boolean;
  key: number;
}

export interface SlideInfo {
  num: number;
  name: string;
}
