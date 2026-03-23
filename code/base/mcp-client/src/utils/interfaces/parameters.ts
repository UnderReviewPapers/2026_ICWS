

export interface MissingParameter {
  param: string;
  label?: string;
  text?: string;
  reason: 'user_input' | 'derived';
  sourceTool?: string;
  type?: string;
  constraints?: string;
}

export interface MissingParamsGroup {
  userInput: {
    toolCallId: string;
    name: string;
    parameters: MissingParameter[];
    prefill: Record<string, any>;
  }[];
  derived: MissingParameter[];
} 