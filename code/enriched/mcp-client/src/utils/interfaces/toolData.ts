/* eslint-disable @typescript-eslint/no-explicit-any */

import type { MissingParameter } from "./parameters";

export interface ToolInputSchema {
  type: string;
  properties: Record<string, any>;
  required: string[];
}

export interface ToolOutputSchema {
  type: string;
  properties: Record<string, any>;
}

// export interface ToolDefinition {
//   name: string;
//   description: string;
//   input_schema: ToolInputSchema;
//   tag: string;
// }

export interface ToolSemanticField {
  domainEntities?: string[];
  effect?: string;
  intents?: string[];
  postconditions?: string[];
  preconditions?: string[];
}
export interface ToolOrchestrationField {
  consumes?: string[];
  produces?: string[];
  dependsOn?: string[];
}
export interface ToolDefinition {
  // Da usare quando metti i tools nel system prompt
  name: string;
  description: string;
  input_schema: ToolInputSchema;
  output_schema?: ToolOutputSchema;
  tag: string;
  functionalDescription?: string;
  intents?: string[];
  preConditions?: string[];
  postConditions?: string[];
  semanticCategories?: string[];
  semantic?: ToolSemanticField;
  orchestration?: ToolOrchestrationField;
}
export interface ToolArgumentMap {
  [paramName: string]: any;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
  missing_info?: MissingParameter[];
  semantic?: ToolSemanticField;
  orchestration?: ToolOrchestrationField;
}

export interface ToolPlan {
  tool_calls: ToolCall[];
}

// export interface BedrockToolDefinition {
//   type: 'function';
//   function: {
//     name: string;
//     description: string;
//     parameters: {
//       type: string;
//       properties: Record<string, any>;
//       required: string[];
//     };
//   };
// };

export interface BedrockToolDefinition {
  type: 'function';
  function: ToolDefinition;
};