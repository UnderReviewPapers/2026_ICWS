import { callBedrockAPIFullResponse } from "./bedrock";
import type { BedrockMessage } from "./interfaces/BedrockMessage";
import type { ToolCall } from "./interfaces/toolData";
import { buildCheckParamsPrompt } from "./prompts";

/**
 * Extracts the first JSON object from a string.
 */
export const extractJSON = (text: string): any => {
  const firstBrace = text.indexOf('{');
  if (firstBrace === -1) throw new Error("No JSON object found");

  let openBraces = 0;
  let endIndex = -1;

  for (let i = firstBrace; i < text.length; i++) {
    const char = text[i];
    if (char === '{') openBraces++;
    else if (char === '}') openBraces--;

    if (openBraces === 0) {
      endIndex = i + 1;
      break;
    }
  }

  if (endIndex === -1) throw new Error("Could not find end of JSON object");

  let jsonStr = text.slice(firstBrace, endIndex);
  jsonStr = jsonStr
    .replace(/\/\/.*(?=[\n\r])/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');

  // Remove ALL non-ASCII characters everywhere (inside and outside strings)
  const cleaned = jsonStr.replace(/[^\x00-\x7F]/g, '');
  if (cleaned.length !== jsonStr.length) {
    const garbage = jsonStr.match(/[^\x00-\x7F]+/g);
    console.warn('extractJSON: removed non-ASCII garbage:', garbage);
  }
  jsonStr = cleaned;

  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    throw new Error("Could not parse model's JSON response");
  }
};

// Extracts a loose JSON object in string format. JSON can be malformed.
export const extractLooseJSONString = (text: string): any => {
  const jsonStart = text.indexOf("[");
  const jsonEnd = text.lastIndexOf("]") + 1;

  if (jsonStart === -1 || jsonEnd === -1) {
    throw new Error("No JSON object found in the string.");
  }

  return text.slice(jsonStart, jsonEnd);

};

// Extracts a JSON array from a string.
export const extractJSONList = (text: string): any[] => {
  const jsonStart = text.indexOf("[");
  const jsonEnd = text.lastIndexOf("]") + 1;

  if (jsonStart === -1 || jsonEnd === -1) {
    throw new Error("No JSON array found in the string.");
  }

  const jsonString = text.slice(jsonStart, jsonEnd);

  try {
    const parsed = JSON.parse(jsonString);
    if (!Array.isArray(parsed)) {
      throw new Error("Parsed JSON is not an array.");
    }
    return parsed;
  } catch (err) {
    throw new Error("Failed to parse JSON: " + (err instanceof Error ? err.message : String(err)));
  }
};

export const getLastAssistantMessage = (messages: BedrockMessage[]): BedrockMessage | null => {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'assistant') {
      return messages[i];
    }
  }
  return null;
};

export interface ExtractedParam {
  parameter: string;
  value: any;
}

export const extractParamsJSON = (text: string): ExtractedParam[] => {
  const jsonStart = text.indexOf("[");
  const jsonEnd = text.lastIndexOf("]") + 1;

  if (jsonStart === -1 || jsonEnd === -1) {
    throw new Error("No JSON array found in the string.");
  }

  const jsonString = text.slice(jsonStart, jsonEnd);

  try {
    const data = JSON.parse(jsonString);
    if (!Array.isArray(data)) {
      throw new Error("Extracted part is not an array.");
    }

    return data.map((item) => ({
      parameter: item.parameter,
      value: item.value,
    }));
  } catch (error) {
    throw new Error("Error parsing JSON: " + error);
  }
};

/**
 * Returns a new ToolCall with assigned parameters, without mutating the original.
 */
export function assignParametersValue(fullAnsw: string, call: ToolCall): ToolCall {
  const params = extractParamsJSON(fullAnsw);
  const updatedArguments = { ...call.arguments };
  const updatedMissingInfo = (call.missing_info || []).filter((m) => {
    return !params.some((param) => param.parameter === m.param);
  });

  for (const param of params) {
    if (updatedArguments.hasOwnProperty(param.parameter) && updatedArguments[param.parameter] === null) {
      updatedArguments[param.parameter] =
        typeof param.value === 'string' && !isNaN(Number(param.value))
          ? Number(param.value)
          : param.value;
    }
  }

  return {
    ...call,
    arguments: updatedArguments,
    missing_info: updatedMissingInfo,
  };
}

export function assignParametersValue2(fullAnsw: string, call: ToolCall): ToolCall {
  const params = extractParamsJSON(fullAnsw);
  const updatedArguments = { ...call.arguments };
  let updatedMissingInfo = [...(call.missing_info || [])];

  for (const param of params) {
    const isMissing = updatedMissingInfo.some((m) => m.param === param.parameter);

    if (isMissing && param.value !== null && param.value !== undefined && param.value !== 'null') {
      updatedArguments[param.parameter] =
        typeof param.value === 'string' && !isNaN(Number(param.value))
          ? Number(param.value)
          : param.value;

      updatedMissingInfo = updatedMissingInfo.filter((m) => m.param !== param.parameter);
    }
  }

  return {
    ...call,
    arguments: updatedArguments,
    missing_info: updatedMissingInfo,
  };
}


/**
 * Updates the first tool call by assigning missing parameter values.
 * Returns the updated call without modifying the input array.
 */
export const identifyMissingAndSetParams = async (
  lastAssistantMessage: BedrockMessage,
  lastUserMessage: BedrockMessage,
  updatedCalls: ToolCall[],
  mcpClient: { sessionId: string },
  bedrockApiEndpoint: string,
  AUTH_TOKEN: string
): Promise<ToolCall> => {
  const sessionId = mcpClient.sessionId;

  const paramList = updatedCalls.map((call) => ({
    name: call.name,
    params: call.missing_info?.map((m) => m.param) || [],
  }));

  const checkParamsPrompt = buildCheckParamsPrompt(
    lastAssistantMessage.content,
    lastUserMessage.content,
    paramList
  );

  const fullAnsw = await callBedrockAPIFullResponse(
    checkParamsPrompt,
    sessionId,
    bedrockApiEndpoint,
    AUTH_TOKEN
  );

  return assignParametersValue(fullAnsw, updatedCalls[0]);
};

export const executeToolCall = async (
  toolCall: ToolCall,
  mcpClient: { callTool: (name: string, args: Record<string, any>) => Promise<any> }
): Promise<{ tool_call_id: string; content: string }> => {
  try {
    const result = await mcpClient.callTool(toolCall.name, toolCall.arguments);
    return {
      tool_call_id: toolCall.id,
      content: JSON.stringify(result, null, 2),
    };
  } catch (error: any) {
    return {
      tool_call_id: toolCall.id,
      content: `Error executing tool: ${error.message}`,
    };
  }
};