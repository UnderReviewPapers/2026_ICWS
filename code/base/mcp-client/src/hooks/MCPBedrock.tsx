import { useState, useCallback, useRef, useEffect } from 'react';
import { useMCPClient } from '../context/MCPClientProvider';
import {
  buildFindParamsPrompt,
  buildFindParamsPromptV2,
  buildPromptCompactResult,
  buildSystemPromptCompactToolResult,
  buildToolResultPrompt2,
  genericInfoPromptIntegration,
  systemPromptFinalResponse,
} from '../utils/prompts';
import type { MCPBedrockHook } from '../utils/interfaces/MCPBedrockHook';
import type { BedrockMessage } from '../utils/interfaces/BedrockMessage';
import type {
  ToolDefinition,
  ToolCall,
  ToolPlan,
  BedrockToolDefinition
} from '../utils/interfaces/toolData';
import {
  assignParametersValue,
  assignParametersValue2,
  executeToolCall,
  extractJSONList,
  extractLooseJSONString
} from '../utils/utils';
import {
  callBedrockAPIStream,
  callBedrockAPIFullResponse
} from '../utils/bedrock';
import type { MissingParameter } from '../utils/interfaces/parameters';
import { generateToolsPlan, partseToBedrock } from '../utils/toolplan';

const api_tags_to_use = ['stores', 'users', 'customers'];
const tools_to_avoid = ['getStoreByDescriptionOrCode', 'listStoresInternal',
  "storesControllerGetstorebydescriptionorcode", "stores.search",
  "storesControllerStores",
  "usersControllerGetusers"
];

let debugLog: any[] = [];

const logStep = (step: string, data: any) => {
  // if (import.meta.env.MODE === 'test') {
  debugLog.push({ step, data: JSON.parse(JSON.stringify(data)) });
  // }
};

export const useMCPBedrock = (bedrockApiEndpoint: string): MCPBedrockHook => {
  const [messages, setMessages] = useState<BedrockMessage[]>([]);
  const messagesRef = useRef<BedrockMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const toolIdCounter = useRef(1);
  const mcpClient = useMCPClient();
  const API_AUTH_TOKEN = import.meta.env.VITE_API_AUTH_TOKEN;
  const BEDROCK_AUTH_TOKEN = import.meta.env.VITE_BEDROCK_AUTH_TOKEN;

  const [modalVisible, setModalVisible] = useState(false);
  const [modalParams, setModalParams] = useState<MissingParameter[]>([]);
  const [modalInitialValues, setModalInitialValues] = useState<Record<string, any>>({});

  const [permissionModalVisible, setPermissionModalVisible] = useState(false);
  const [permissionModalData, setPermissionModalData] = useState<any>(null);

  const [instanceSelectionModalVisible, setInstanceSelectionModalVisible] = useState(false);
  const [instanceSelectionOptions, setInstanceSelectionOptions] = useState<any[]>([]);
  const selectedInstance = useRef<any>(null);


  const pendingPermissionRef = useRef<ToolCall | null>(null);
  const pendingToolRef = useRef<ToolCall | null>(null);

  const currentToolPlanRef = useRef<ToolPlan | null>(null);
  const currentToolResultsRef = useRef<Record<string, string>>({});
  const currentToolCompactResultsRef = useRef(new Map<string, string>());// resetta ad ogni nuova user query
  const executedCallIdsRef = useRef<Set<string>>(new Set());

  const userQueryRef = useRef<string>('');

  const [allTools, setAllTools] = useState<ToolDefinition[] | null>(null);

  const instanceSelectionResolveRef = useRef<((selected: any) => void) | null>(null);
  const waitForInstanceSelection = (options: any[]): Promise<any> => {
    return new Promise<any>((resolve) => {
      setInstanceSelectionOptions(options);
      setInstanceSelectionModalVisible(true);
      instanceSelectionResolveRef.current = (selected: any) => {
        setInstanceSelectionModalVisible(false);
        instanceSelectionResolveRef.current = null;
        resolve(selected);
      };
    });
  };

  const exportDebugLog = (fileName: string = "mcp-execution-log") => {
    if (fileName.trim() === "") {
      fileName = "mcp-execution-log";
    }
    const blob = new Blob([JSON.stringify(debugLog, null, 2)], {
      type: "application/json",
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName + ".json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const isCUDOperation = (toolName: string): boolean => {
    const cudKeywords = ['update', 'delete', 'create', 'edit', 'remove'];
    return cudKeywords.some(keyword => toolName.toLowerCase().includes(keyword));
  };

  const fetchAllToolsOnce = useCallback(async () => {
    if (!allTools) {
      const tools = await mcpClient.listTools();
      const processed = tools.map((tool: any): ToolDefinition => {

        const { inputSchema, functionalDescription, ...rest } = tool;

        return {
          ...rest,
          input_schema: tool.input_schema || tool.inputSchema || { type: 'object', properties: {} },
          ...(tool.output_schema ? { output_schema: tool.output_schema } : {}),

        }
      });
      const filteredTools = filterTools(processed);
      console.log("Filtered tools:", filteredTools);
      // console.log("All tools fetched:", processed);
      setAllTools(filteredTools);
      // console.log("Filtered tools:", filterTools(processed));
    }
  }, [mcpClient, allTools]);

  const reloadTools = useCallback(async () => {
    const tools = await mcpClient.listTools();
    const processed = tools.map((tool: any): ToolDefinition => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.input_schema || tool.inputSchema || { type: 'object', properties: {} },
      ...(tool.output_schema ? { output_schema: tool.output_schema } : {}),
      tag: tool.tag,
    }));
    const filteredTools = filterTools(processed);
    console.log("Filtered tools:", filteredTools);
    setAllTools(filteredTools);
  }, [mcpClient]);

  const filterTools = (tools: ToolDefinition[]): ToolDefinition[] =>
    tools.filter(tool =>
      api_tags_to_use.includes(tool.tag) &&
      !tools_to_avoid.includes(tool.name)
    );
  const compactResult = async (toolRes: string, tool_calls: any): Promise<string> => {

    const sessionId = mcpClient.sessionId!;
    // const prompt = buildPromptCompactResult(userQueryRef.current, toolRes); // vecchia versione
    // const fullAnswer = await callBedrockAPIFullResponse(prompt, "", sessionId, bedrockApiEndpoint, BEDROCK_AUTH_TOKEN);
    const prompt = buildSystemPromptCompactToolResult(tool_calls, userQueryRef.current);
    const fullAnswer = await callBedrockAPIFullResponse(toolRes, prompt, sessionId, bedrockApiEndpoint, BEDROCK_AUTH_TOKEN);

    return extractLooseJSONString(fullAnswer);
  }

  function addUserInstanceSelectionToToolCallMsg(toolCallId: string, selected: any) {
    // Update message in history with user selected instance
    const toolCallMsg = messagesRef.current.find(msg => msg.tool_call_id === toolCallId);
    if (toolCallMsg) {
      toolCallMsg['user_selected_instance'] = selected;
    }
  }
  const handlePermissionConfirm = async () => {
    setPermissionModalVisible(false);
    const call = pendingPermissionRef.current;
    if (!call) return;

    const result = await executeToolCall(
      { id: `auto-${call.name}`, name: call.name, arguments: call.arguments },
      mcpClient
    );
    currentToolResultsRef.current[call.id] = result.content;
    // currentToolCompactResultsRef.current[call.id] = await compactResult(result.content, currentToolPlanRef.current);
    currentToolCompactResultsRef.current.set(call.id, await compactResult(result.content, currentToolPlanRef.current));
    executedCallIdsRef.current.add(call.id);
    logStep('user_confirmed_permission', { duringExecOf: call.id, args: call.arguments });
    logStep('tool_call_result', { call: call, compactResult: currentToolCompactResultsRef.current.get(call.id) });


    // if (selectedInstance.current) {
    //   // addUserInstanceSelectionToToolCallMsg(selectedInstance.current.sourceToolCall, selectedInstance.current.instance);
    //   addUserInstanceSelectionToToolCallMsg(call.id, selectedInstance.current.instance);
    // }

    //update history
    const toolUsageMsg: BedrockMessage = {
      role: 'tool',
      tool_call_id: call.id,
      content: currentToolCompactResultsRef.current.get(call.id) || '',
      ...(selectedInstance.current ? { user_selected_instance: selectedInstance.current } : {})
    }
    // setMessages(prev => [...prev, toolUsageMsg]);
    messagesRef.current = [...messagesRef.current, toolUsageMsg];
    selectedInstance.current = null;

    await continueToolExecution();
  };

  const handlePermissionCancel = () => {
    setPermissionModalVisible(false);
    const msg: BedrockMessage = { role: 'assistant', content: 'Operation cancelled by user.' };
    setMessages(prev => [...prev, msg]);
    messagesRef.current = [...messagesRef.current, msg];
  };

  const handleModalCancel = () => {
    setModalVisible(false);
    const msg: BedrockMessage = { role: 'assistant', content: 'Operation cancelled by user.' };
    setMessages(prev => [...prev, msg]);
    messagesRef.current = [...messagesRef.current, msg];
  }

  const retrieveMissingInfo = (toolCall: ToolCall): ToolCall['missing_info'] => {


    const missingInfo: MissingParameter[] = toolCall.missing_info || [];
    const { authorization, id, ...argsMasked } = toolCall.arguments;

    const userInputParams: MissingParameter[] = Object.keys(argsMasked).map(key => {
      const found = missingInfo.find(m => m.param === key);

      if (found) {  //presente in missingInfo
        return {
          ...found,
          value: argsMasked[key]
        };
      } else {
        return {
          param: key,
          label: key,
          text: '',
          reason: 'user_input',
          type: typeof argsMasked[key],
          value: argsMasked[key]
        };
      }
    });


    // console.log("===========", userInputParams)
    if (userInputParams.length > 0) {// && isCUDOperation(toolCall.name)) {
      pendingToolRef.current = toolCall;
      setModalParams(userInputParams);
      const initialValues = userInputParams.reduce((acc, p) => {
        acc[p.param] = toolCall.arguments[p.param] ?? '';
        return acc;
      }, {} as Record<string, any>);
      setModalInitialValues(initialValues);
      setModalVisible(true);
    }
    return missingInfo;
  };


  const continueToolExecution = async () => {
    const sessionId = mcpClient.sessionId!;
    let toolPlan = currentToolPlanRef.current!;
    const toolResults = currentToolResultsRef.current;
    const toolCompactResults = currentToolCompactResultsRef.current;
    const executedIds = executedCallIdsRef.current;
    const userQuery = userQueryRef.current;

    for (let i = 0; i < toolPlan.tool_calls.length; i++) {
      let call: ToolCall = toolPlan.tool_calls[i];

      if (executedIds.has(call.id)) continue;

      let tmpCall = structuredClone(call);
      tmpCall.missing_info = tmpCall.missing_info?.filter(m => m.reason === 'derived') || [];

      if (tmpCall.missing_info && tmpCall.missing_info.length > 0) {

        const lastToolCall = Array.from(currentToolCompactResultsRef.current).at(-1); // [callId, compactResult]
        if (lastToolCall) {
          const [lastCallId, lastCallCompactResult] = lastToolCall;

          const lastCallDef = toolPlan.tool_calls.find(tc => tc.id === lastCallId);
          const parsedResult = extractJSONList(lastCallCompactResult);
          if (parsedResult.length !== 0) {

            const currDerivedParams = tmpCall.missing_info;

            const missingFromLastTool = currDerivedParams.filter(param => param.sourceTool == lastCallDef?.name);

            if (missingFromLastTool.length > 0) {
              console.log(`Deriving parameters for tool ${tmpCall.name} from previous tool ${lastCallDef?.name}`);

              let instance = null;
              if (parsedResult.length > 1) {// multiple instances
                instance = await waitForInstanceSelection(parsedResult);
                if (instance !== null) {
                  selectedInstance.current = { instance: instance, sourceToolCall: lastCallId };
                  console.log("Selected instance:", instance);
                  logStep('user_instance_selection', { duringExecOf: tmpCall.id, selectedInstance: instance, fromToolCall: lastCallId });
                  for (const param of missingFromLastTool) {
                    if (instance[param.param] !== undefined) {
                      tmpCall.arguments[param.param] = instance[param.param];
                      tmpCall.missing_info = tmpCall.missing_info?.filter(m => m.param !== param.param);
                    }
                  }
                }
              }
              else {
                instance = parsedResult[0];
                for (const param of missingFromLastTool) {

                  if (instance[param.param] !== undefined) {
                    tmpCall.arguments[param.param] = instance[param.param];
                    tmpCall.missing_info = tmpCall.missing_info?.filter(m => m.param !== param.param);
                    continue;
                  }

                }
              }

            }
          }
        }
        // merge call e tmpCall
        toolPlan.tool_calls[i].missing_info = toolPlan.tool_calls[i].missing_info?.filter(missing => {
          const value = tmpCall.arguments[missing.param as keyof typeof tmpCall.arguments];
          return value === null || value === undefined;
        });
        toolPlan.tool_calls[i].arguments = {
          ...toolPlan.tool_calls[i].arguments,
          ...tmpCall.arguments
        };

        if (tmpCall.missing_info && tmpCall.missing_info.length > 0) {
          let [hasAllParams, updatedCall] = await findConversationParameters(userQuery, tmpCall, toolCompactResults, toolPlan.tool_calls, executedIds);
          toolPlan.tool_calls[i].missing_info = toolPlan.tool_calls[i].missing_info?.filter(missing => {
            const value = updatedCall.arguments[missing.param as keyof typeof updatedCall.arguments];
            return value === null || value === undefined;
          });
          toolPlan.tool_calls[i].arguments = {
            ...toolPlan.tool_calls[i].arguments,
            ...updatedCall.arguments
          };
          logStep('call_after_llm_for_derived_params', { call: toolPlan.tool_calls[i] });
        }
        // toolPlan.tool_calls[i] = call;
      }


      if (call.missing_info && call.missing_info.length > 0) {

        const missingInfo = retrieveMissingInfo(call);//Form
        logStep('missing_info_for_user', { duringExecOf: call.id, missingInfo: missingInfo });
        if (missingInfo && missingInfo.length > 0) {
          currentToolPlanRef.current = toolPlan;
          alert(`returning after ${call.name}, with still missing ${JSON.stringify(missingInfo)} that cannot be derived.`)
          return;
        }
      }
      // if (!hasAllParams) {
      //   console.log(`Missing parameters for tool ${call.name}. Please provide them.`);
      // };

      if (isCUDOperation(call.name)) {
        pendingPermissionRef.current = call;
        setPermissionModalData(call.arguments);
        setPermissionModalVisible(true);
        return;
      }
      console.log(`Executing tool: ${call.name} with arguments:`, call.arguments);
      const result = await executeToolCall(call, mcpClient);
      executedIds.add(call.id);
      toolResults[call.id] = result.content;
      // toolCompactResults[call.name] = await compactResult(result.content);
      toolCompactResults.set(call.id, await compactResult(result.content, toolPlan.tool_calls, call));
      // console.log("ToolCompactResults:", toolCompactResults);
      logStep('tool_call_result', { call: call, compactResult: toolCompactResults.get(call.id), fullResult: result.content });

      // if (selectedInstance.current) {
      //   // addUserInstanceSelectionToToolCallMsg(selectedInstance.current.sourceToolCall, selectedInstance.current.instance);
      //   addUserInstanceSelectionToToolCallMsg(call.id, selectedInstance.current.instance);
      // }
      //update history
      const toolUsageMsg: BedrockMessage = {
        role: 'tool',
        tool_call_id: call.id,
        content: toolCompactResults.get(call.id) || '',
        ...(selectedInstance.current ? { user_selected_instance: selectedInstance.current } : {})
      }
      // setMessages(prev => [...prev, toolUsageMsg]);
      messagesRef.current = [...messagesRef.current, toolUsageMsg];
      selectedInstance.current = null;

    }

    setMessages(prev => [...prev, { role: 'assistant', content: 'Results:' }]);
    messagesRef.current = [...messagesRef.current, { role: 'assistant', content: 'Results:' }];
    await toolResultsResponse(sessionId, toolPlan.tool_calls);
  };

  useEffect(() => {
    if (mcpClient.isConnected) {
      fetchAllToolsOnce();
      const welcomeMsg: BedrockMessage = { role: 'assistant', content: 'Welcome! How can I assist you today?' };
      setMessages([welcomeMsg]);
      messagesRef.current = [welcomeMsg];
    }
  }, [mcpClient.isConnected, fetchAllToolsOnce]);

  const sendMessage = useCallback(async (message: string) => {
    if (!mcpClient.isConnected) throw new Error('MCP client not connected');
    const sessionId = mcpClient.sessionId;
    if (!sessionId) throw new Error('MCP client: sessionId not set');

    setIsLoading(true);
    try {
      userQueryRef.current = message;
      const newUserMessage: BedrockMessage = { role: 'user', content: message };
      setMessages(prev => [...prev, newUserMessage]);
      messagesRef.current = [...messagesRef.current, newUserMessage];

      logStep('user_query', message);

      if (!allTools || (Array.isArray(allTools) && allTools.length === 0)) throw new Error("Tool list not loaded");
      // const tools = filterTools(allTools);
      // console.log("Filtered tools:", tools);

      const toolPlan = await generateToolsPlan({
        messagesHistory: messagesRef.current, bedrockApiEndpoint, sessionId,
        tools: allTools,
        // generateToolId: () => toolIdCounter.current++// OK  lambda OpenAI
        generateToolId: () => {// others
          const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
          return Array.from({ length: 9 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
        }
      });
      logStep('initial_tool_plan', toolPlan);
      console.log(`[ ${toolPlan.tool_calls.map(t => t.name).join(', ')} ]`);
      // logStep('missing_info', toolPlan.missingInfo);

      //update history if there are tool calls (avoid llm errors)
      if (toolPlan.tool_calls.length > 0) {

        const toolPlanMsg: BedrockMessage = {
          role: 'assistant',
          content: "",
          tool_calls: toolPlan.tool_calls.map(tc => ({
            id: tc.id,
            type: 'function',
            function: {
              name: tc.name,
              arguments: JSON.stringify(tc.arguments)
            }
          }))
        }
        // setMessages(prev => [...prev, toolPlanMsg]);
        messagesRef.current = [...messagesRef.current, toolPlanMsg];
      }

      currentToolPlanRef.current = toolPlan;
      currentToolResultsRef.current = {};
      currentToolCompactResultsRef.current = new Map();
      executedCallIdsRef.current = new Set();
      await continueToolExecution();
    } catch (err: any) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${err.message}` }]);
    } finally {
      setIsLoading(false);
    }
  }, [mcpClient, bedrockApiEndpoint, allTools]);

  const handleModalSubmit = async (values: Record<string, any>) => {
    setModalVisible(false);

    const call = pendingToolRef.current;
    if (!call) return;

    const argumentsNoChange = Object.fromEntries(Object.entries(call.arguments).filter(([, v]) => v !== undefined && v !== null));

    const dataToUpdate = Object.fromEntries(
      Object.entries(values).filter(([k, v]) => {
        if (v === undefined || v === null) return false;

        const oldValue = argumentsNoChange[k];

        if (v === "" && (oldValue === undefined || oldValue === null)) return false;

        return v !== oldValue;
      })
    );

    call.arguments = { ...call.arguments, ...argumentsNoChange, ...dataToUpdate };
    call.missing_info = [];


    continueToolExecution();
  };

  const handleSelectionModalClose = () => {
    if (instanceSelectionResolveRef.current) {
      instanceSelectionResolveRef.current(null);
    }
    setInstanceSelectionModalVisible(false);
  };

  const handleSelectionSelect = (selected: any) => {
    if (instanceSelectionResolveRef.current) {
      instanceSelectionResolveRef.current(selected);
    } else {
      setInstanceSelectionModalVisible(false);
    }
  };

  const clearChat = useCallback(() => {
    setMessages([]);
    messagesRef.current = [];
    setIsLoading(false);
    toolIdCounter.current = 1;
    debugLog = [];
  }, []);


  const toolResultsResponse = async (sessionId: string, tool_calls: ToolCall[]) => {
    const systemPrompt = tool_calls && tool_calls.length > 0
      ? systemPromptFinalResponse : systemPromptFinalResponse + genericInfoPromptIntegration;

    const tempMessages: BedrockMessage[] = [
      ...messagesRef.current.slice(0, -1),
      { role: "system", content: systemPrompt },
      messagesRef.current[messagesRef.current.length - 1]
    ];
    let finalResponse = '';

    await callBedrockAPIStream(tempMessages, null, sessionId, bedrockApiEndpoint, BEDROCK_AUTH_TOKEN,
      (chunk: string) => {
        finalResponse += chunk;
        const assistantMsg: BedrockMessage = { role: 'assistant', content: finalResponse };
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = assistantMsg;
          return updated;
        });
        const updated = [...messagesRef.current];
        updated[updated.length - 1] = assistantMsg;
        messagesRef.current = updated;
      },

      partseToBedrock(allTools!)?.filter(tool =>
        currentToolPlanRef.current?.tool_calls.some(call => call.name === tool.function.name)
      )
    );
    logStep('final_response', finalResponse);
  };

  const findConversationParameters = async (
    userQuery: string,
    call: ToolCall,
    toolResults: Map<string, string>,
    tool_calls: ToolCall[],
    executedCallIds: Set<string>
  ): Promise<[boolean, ToolCall]> => {
    const sessionId = mcpClient.sessionId!;
    const executedCalls = tool_calls.filter(c => executedCallIds.has(c.id));
    //   const prompt = buildFindParamsPromptV2(userQuery, call, toolResults, tool_calls, executedCalls);
    const prompt = buildFindParamsPromptV2(userQuery, call, Array.from(toolResults), tool_calls, executedCalls);
    const systemPrompt = '';
    const fullAnswer = await callBedrockAPIFullResponse(prompt, systemPrompt, sessionId, bedrockApiEndpoint, BEDROCK_AUTH_TOKEN);
    const updatedCall = assignParametersValue2(fullAnswer, call);
    const isComplete = updatedCall.missing_info?.length === 0;
    return [isComplete, updatedCall]
  };

  return {
    messages,
    messagesRef: messagesRef.current,
    isLoading,
    sendMessage,
    clearChat,
    modalVisible,
    modalParams,
    modalInitialValues,
    handleModalSubmit,
    handleModalCancel,
    debugLog,
    permissionModalVisible,
    permissionModalData,
    handlePermissionConfirm,
    handlePermissionCancel,
    reloadTools,
    instanceSelectionModalVisible,
    instanceSelectionOptions,
    handleSelectionModalClose,
    handleSelectionSelect,
    exportDebugLog

  };
};
