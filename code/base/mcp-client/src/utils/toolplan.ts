import { callBedrockAPIFullResponse } from "./bedrock";
import type { BedrockMessage } from "./interfaces/BedrockMessage";
import type { MissingParameter } from "./interfaces/parameters";
import type { BedrockToolDefinition, ToolCall, ToolDefinition, ToolPlan } from "./interfaces/toolData";
import { systemPromptToolPlanGeneration } from "./prompts";
import { extractJSON } from "./utils";

const API_AUTH_TOKEN = import.meta.env.VITE_API_AUTH_TOKEN;
const BEDROCK_AUTH_TOKEN = import.meta.env.VITE_BEDROCK_AUTH_TOKEN;

export function partseToBedrock(tools: ToolDefinition[]): BedrockToolDefinition[] {

    return tools.map(t => ({
        type: 'function',
        function: t
    }));

}

const enrichMissingInfoWithTypes = (
    missing: MissingParameter[],
    schema: Record<string, any>
): MissingParameter[] => {
    return missing.map((m) => {
        const schemaProp = schema[m.param];
        let inferredType = schemaProp?.type ?? "string";
        if (!inferredType && schemaProp?.description?.includes("format HH:mm:ss")) {
            inferredType = "time";
        }
        return {
            ...m,
            type: inferredType,
            label: schemaProp?.description || m.param,
        };
    });
};

const extractToolsPlan = ({ fullResponse, tools, generateToolId }: {
    fullResponse: string, tools: ToolDefinition[],
    generateToolId: () => number | string;
}): ToolPlan => {
    const rawPlan = extractJSON(fullResponse) as ToolPlan;
    const updatedCalls = rawPlan.tool_calls.map((call): ToolCall => {
        const toolDef = tools.find(t => t.name === call.name);
        const schema = toolDef?.input_schema?.properties ?? {};
        const argumentsWithAuth = {
            ...call.arguments,
            ...(call.arguments.authorization !== undefined && API_AUTH_TOKEN
                ? { authorization: API_AUTH_TOKEN }
                : {})
        };
        const filteredMissing = (call.missing_info || []).filter(m => m.param !== 'authorization');
        const enrichedMissing = enrichMissingInfoWithTypes(filteredMissing, schema);
        return {
            ...call,
            id: `tool-${generateToolId()}`,//Ok lambda OpenAI
            // id: `${generateToolId()}`,//Ok others
            arguments: argumentsWithAuth,
            missing_info: enrichedMissing,
        };
    });
    return { tool_calls: updatedCalls };
};

export async function generateToolsPlan({
    messagesHistory,
    bedrockApiEndpoint,
    sessionId,
    tools,
    generateToolId
}: {
    messagesHistory: BedrockMessage[];
    bedrockApiEndpoint: string;
    sessionId: string;
    tools: ToolDefinition[];
    generateToolId: () => number | string;
}): Promise<ToolPlan> {

    const parsedTools: BedrockToolDefinition[] = partseToBedrock(tools)
    // const parsedTools = tools
    console.log("Parsed tools for Bedrock:", parsedTools);

    const promptToolList = `These are the available tools: ` + JSON.stringify(parsedTools, null, 2);
    const tempMessages: BedrockMessage[] = [
        ...messagesHistory.slice(0, -1),
        { role: "system", content: systemPromptToolPlanGeneration + promptToolList },
        messagesHistory[messagesHistory.length - 1]
    ];

    const fullResponse = await callBedrockAPIFullResponse(tempMessages, null,//systemPromptToolPlanGeneration,
        sessionId, bedrockApiEndpoint, BEDROCK_AUTH_TOKEN);

    // console.log("history for tool plan generation:", tempMessages);
    console.log("fullResponse for tool plan generation:", fullResponse);


    let toolPlan = extractToolsPlan({ fullResponse, tools, generateToolId });
    toolPlan.tool_calls = toolPlan.tool_calls.map(call => ({
        ...call,
        name: call.name.replace(/^functions\./, "")
    }));

    toolPlan.tool_calls = toolPlan.tool_calls.map(call => {
        const allowedArguments = tools.find(t => t.name === call.name)?.input_schema.properties || [];

        const filteredArgs = Object.fromEntries(
            Object.entries(call.arguments).filter(([key]) => key in allowedArguments)
        );

        return {
            ...call,
            arguments: filteredArgs,
        }
    });

    return toolPlan;
}