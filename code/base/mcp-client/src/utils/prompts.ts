import type { MissingParameter } from './interfaces/parameters';
import type { ToolDefinition, ToolCall } from './interfaces/toolData';


export const systemPromptToolPlanGeneration = `
You are an AI assistant that orchestrates tool calls.

Your task is to:
1. Select the most relevant tools required to fulfill the user's request.
2. For each selected tool, construct the required arguments **based on the tool's input schema**.
3. Leave the value as \`null\` for any parameter whose value is unknown.

For each parameter with a \`null\` value, you must also include a \`missing_info\` entry that indicates:

- \`param\`: the name of the parameter
- \`label\`: a human-readable label for the parameter
- \`text\`: a description of the parameter or what is needed
- \`reason\`: must be one of:
  - \`"authorization"\` if it is for authorization purposes
  - \`"user_input"\` if the user must provide this value directly
  - \`"derived"\` if the value can be retrieved by calling another tool (e.g., often the id of an entity if not provided by the user)
- If \`reason\` is \`"derived"\`, also include \`sourceTool\`: the name of the tool that can be used to retrieve it
- If \`reason\` is \`"user_input"\`, also include:
  - \`type\`: the expected type of the parameter
  - \`constraints\`: constraints such as "must be a number", "must be a valid email address", etc.
  
Example1: if I need details of a store, I can use "getStoresList" to find a store ID and then use "getStoreDetail" to fetch its info.
Example2: if I want to update a store, I can use "getStoreDetail" to find the store data and then use "updateStoreDetail" to update the data.

Respond in the following JSON format:

{
  "tool_calls": [
    {
      "name": "<exact_tool_name_case_sensitive>",
      "arguments": {
        "<param1>": "<value or null if unknown>",
        "<param2>": "<value or null if unknown>"
      },
      "missing_info": [
        {
          "param": "<param_name>",
          "label": "Label for the parameter",
          "text": "A text to describe the parameter's meaning or requirement",
          "reason": "authorization | user_input | derived",
          "sourceTool": "<tool_name_if_reason_is_derived>",
          "type": "<parameter_type_if_reason_is_user_input>",
          "constraints": "<any_constraints_if_reason_is_user_input>"
        }
      ]
    }
  ]
}

Rules:
- Only include tools that are relevant to the task.
- Do not invent argument values. Use \`null\` and \`missing_info\` instead.
- If a tools requires another tool to be executed to retrieve derived parameters values ensure the source tool is executed before in the tools execution plan.
- Ensure that every sourceTool referenced in \`missing_info\` is included earlier in the \`tool_calls\` list.
- You MUST construct a sequential plan of tool invocations so that the requested task can be fully executed. Do not stop at the first step unless it is sufficient to complete the task; otherwise, include all necessary tools.
- Your output must be valid JSON.
- Tool names and parameters must match exactly (case-sensitive).
- If the user's request is about your capabilities, how you work, or how you can help (for example: "what can you do?", "how do you work?", "how can you help me"), OR if none of the available tools are relevant to the user's request, always return "tool_calls": [] (i.e., an empty list) as the response. For all other cases, follow the instructions as normal.
- Focus on the objective of the requested task and work through each tool call step by step, ensuring all dependencies are resolved.
`;

export const systemPromptFinalResponse = `
You are an AI assistant who has access to the outputs of tools that were used to fulfill the user's request.

Now, synthesize relevant information into a clear and helpful natural-language response to the user request.
You don't need to call any tool, just provide a final answer based on the information you have.
If user has explicitly selected instances during a tool's execution, refer only to selected instances.
Consider the meaning of the executed tool calls and their results when generating the final response.
Consider the order of tools used to understand the flow of information and instances selected by the user.
Do not ask information for tasks that have already been completed`

export const genericInfoPromptIntegration = `
This is an informative description of what you can do: you can manage stores, store groups, and users in a business system.
You can:
- List, create, update, and get stores and their information.
- Manage store groups.
- Manage users and their settings.
Overall, you can perform administrative operations for stores, groups, and users.`


export function buildSystemPromptCompactToolResult(toolPlan:any, userQuery: string): string {
  return `
You are a data compression and filtering system for external tool outputs.

Your task is to process tool outputs based on a user query and a tool plan, while preparing the data for potential future tool calls.

### Parameters:
- USER QUERY: ${userQuery}
- TOOL PLAN (instructions about what data may be needed in future tool executions): 
${JSON.stringify(toolPlan)}

### Instructions:
1. When processing tool output (provided in the user prompt), extract only the information relevant to the USER QUERY and the current tool execution.
2. For each retained instance, keep all fields exactly as they appear in the original output, including:
  - field names (case-sensitive)
  - values (case-sensitive, even null values)
  - duplicate fields or duplicate instances.
3. If no instance matches the USER QUERY, the final output MUST be exactly an empty JSON list: []
4. Identify and retain relevant instances and fields needed for future tool calls according to the TOOL PLAN and retain them. Do NOT retain instances whose only justification is feeding back the same tool that generated the current output.
5. Provide a concise summary for each instance without altering the original data.
6. If relevance is uncertain, DISCARD. Default is EXCLUDE.
7. If the tool output contains an error message, retain only the error message in the output.
8. Return a MAXIMUM of 30 instances. If truncated, append: {"truncated": true}

### Output format:
[
  {
    "field_1": "<exact value from tool output>",
    "field_2": "<exact value from tool output>",
    ...
    "summary": "Short description highlighting relevance to USER QUERY"
  },
  ...
]

Ensure the output is clean JSON, maintains all original field names and values, and is optimized for reuse in subsequent tool calls.
`;

}



export function buildUserPrompt(message: string): string {
  return `The user has sent the following request:\n"${message}"`;
}

export function buildToolResultPrompt2(message: string, toolResult: Record<string, any>): string {
  const toolOutputs = Object.entries(toolResult)
    .map(([toolName, result]) => `Tool "${toolName}" output:\n${JSON.stringify(result, null, 2)}`)
    .join('\n\n');

  return `
You are an AI assistant who has access to the outputs of tools that were used to fulfill the following user request:
"${message}"

Here are the results:
${toolOutputs}

Now, synthesize relevant information into a clear and helpful natural-language response to the user. Avoid repeating raw JSON. Summarize and explain as needed. Answer using italian language.
`;
}

export function buildToolResultPrompt(message: string, toolResult: Record<string, any>): string {
  const toolOutputs = Object.entries(toolResult)
    .map(([toolName, result]) => `Tool "${toolName}" output:\n${JSON.stringify(result, null, 2)}`)
    .join('\n\n');

  return `
You are an assistant who has access to tool results that were executed based on the user's message.
User message:
"${message}"
Tool results:
${toolOutputs}

Now generate a helpful, human-readable response for the user using the information above. Focus on clarity and avoid repeating the raw JSON unless needed. Answer using italian language.
`;
}

export function buildCheckParamsPrompt(
  lastAssistantMessage: string | null,
  lastUserMessage: string,
  paramList: { name: string; params: string[] }[]
): string {
  return `
The following parameter request was made:
${lastAssistantMessage}

The following response was provided:
${lastUserMessage}

Your task is to assign values to the requested parameters using the user's message.

Here is the list of missing parameters and their reasons:
${JSON.stringify(paramList, null, 2)}

Respond in this JSON format:
[
  {
    "parameter": "<parameter name>",
    "value": "<value or 'Not assigned'>"
  }
]

Return only the JSON. Make sure it is valid and well-formed.
`;
}

export function buildFindParamsPrompt(
  missing_info: MissingParameter[],
  toolResults: Record<string, any>,
  executedCalls: ToolCall[],
  conversationHistory: any[]
): string {
  return `
This is the conversation history:
${JSON.stringify(conversationHistory, null, 2)}

The following parameters are missing:
${JSON.stringify(missing_info, null, 2)}

The following tool calls were made:
${JSON.stringify(executedCalls, null, 2)}

The following tool results are available:
${JSON.stringify(toolResults, null, 2)}

Your task is to find the values for the missing parameters using the conversation history and the available tool results.
If a parameter can be found, assign its value. If not, indicate that it is still missing.

Respond in JSON format using the following structure:

[
  {
    "parameter": "<parameter name>",
    "value": "<value or 'Not assigned'>"
  }
]

Give me only the JSON response, do not add any other text.
Make sure the JSON is valid and well-formed.
`;
}

export function buildFindParamsPromptV2(
  userQuery: string,
  call: ToolCall,
  toolResults: Record<string, any>,
  toolCalls: ToolCall[],
  executedCalls: ToolCall[],
): string {
  return `
    To answer this query, the following plan of tools has been selected:
    Query: ${userQuery}

    Tool plan:
    ${JSON.stringify(toolCalls, null, 2)}

    The tool with id: '${call.id}' has the following missing parameters:
    ${JSON.stringify(call.missing_info, null, 2)}

    The following tool calls were made:
    ${JSON.stringify(executedCalls, null, 2)}

    The following tool results are available:
    ${JSON.stringify(toolResults, null, 2)}

    Your task is to find the values for the missing parameters using the available tool results.
    If a parameter can be found, assign its value. If not, assign null.

    Respond in JSON format using the following structure:

    [
      {
        "parameter": "<parameter name>",
        "value": "<value or 'null'>"
      }
    ]

    Give me only the JSON response, do not add any other text.
    Make sure the JSON is valid and well-formed.
  `;
}

export function buildPromptCompactResult(
  userQuery: string,
  toolResult: string
): string {
  return `
  You are a system designed to compress and filter the output of an external tool.

  Your task is to extract only the most relevant information from the raw tool output, based on the user's original query.

  ### Input:
  USER QUERY:
  ${userQuery}

  RAW TOOL OUTPUT:
  ${toolResult}

  ### Instructions:
  1. Identify which parts of the tool output are directly relevant to the user query.
  2. Also retain any data that could be necessary for future tool calls to complete the user request (e.g., identifiers, parameters, references, URLs).
  3. Discard any irrelevant, redundant, or empty fields.
  4. Format the output clearly, using JSON objects with only key fields and a short summary

  ### Output format examples:

  JSON format:
  [
    {
      "id": "...",
      "field_1": "...",
      "field_2": "...",
      "summary": "Short summary here"
    },
    ...
  ]
  Keep the output concise, structured, and optimized for reuse in subsequent tool calls if needed.
  """
    `

}