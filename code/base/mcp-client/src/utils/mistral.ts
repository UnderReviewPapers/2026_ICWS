import { Mistral } from '@mistralai/mistralai';
import type { BedrockMessage } from './interfaces/BedrockMessage';
import pRetry, { AbortError } from 'p-retry';

const apiKey = import.meta.env.VITE_MISTRAL_KEY;

const client = new Mistral({ apiKey: apiKey });

export async function mistralMsg(
    promptMessages: string | BedrockMessage[],
    systemPrompt: string | null,
    tools?: any
) {
    // debugger;
    const messages = toMistralMessages(promptMessages, systemPrompt);

    if (systemPrompt && messages[0]?.role !== 'system') {
        messages.unshift({ role: 'system', content: systemPrompt });
    }

    const chatResponse = await pRetry(
        async () => {
            const result = await client.chat.complete({
                model: 'mistral-large-latest',
                temperature: 0,
                messages,
                ...(tools && { tools: toMistralTools(tools) }),
            })

            const raw = result as any;
            if (raw?.raw_status_code === 429 || raw?.object === 'error') {
                throw new Error(`Rate limit: ${raw?.message}`); // pRetry lo intercetta e riprova
            }

            return result
        },
        {
            retries: 5,
            onFailedAttempt: (err: any) => {
                const inner = err?.error ?? err;

                const status = inner?.status ?? inner?.statusCode ?? inner?.raw_status_code ?? inner?.response?.status;
                const isRateLimit = status === 429
                    || inner?.code === '1300'
                    || inner?.type === 'rate_limited'
                    || inner?.message?.toLowerCase().includes('rate limit');

                if (!isRateLimit) throw new AbortError(err);
                console.warn(`⚠️ Rate limit, retry ${err.attemptNumber}/5`);
            },
            minTimeout: 4000,
            factor: 2,
        }
    );
    const response = chatResponse.choices[0].message.content;
    // console.log(response)
    return response;
}

function toMistralTools(tools: any[]) {
    if (!tools?.length) return undefined;

    return tools.map(tool => ({
        type: 'function' as const,
        function: {
            name: tool.function.name,
            description: tool.function.description ?? '',
            parameters: tool.function.input_schema ?? { type: 'object', properties: {} },
        }
    }));
}

function toMistralMessages(promptMessages: string | BedrockMessage[], systemPrompt: string | null) {
    let messages: BedrockMessage[] = typeof promptMessages === 'string'
        ? [{ role: 'user', content: promptMessages }]
        : [...promptMessages];

    const systemFromHistory = messages.find(m => m.role === 'system')?.content ?? null;
    messages = messages.filter(m => m.role !== 'system');

    const finalSystemPrompt = systemPrompt ?? systemFromHistory;

    while (messages.length > 0 && messages[0].role === 'assistant') messages.shift();
    while (messages.length > 0 && messages[messages.length - 1].role === 'assistant') messages.pop();

    const mapped = messages.map((msg) => {
        if (msg.role === 'tool') {
            return { role: 'tool' as const, content: msg.content, toolCallId: msg.tool_call_id ?? '' };
        }
        if (msg.role === 'assistant') {
            return {
                role: 'assistant' as const,
                content: msg.content,
                ...(msg.tool_calls && {
                    toolCalls: msg.tool_calls.map(tc => ({
                        id: tc.id,
                        type: 'function' as const,
                        function: { name: tc.function.name, arguments: tc.function.arguments },
                    })),
                }),
            };
        }
        return { role: 'user' as const, content: msg.content };
    });

    if (finalSystemPrompt) {
        return [{ role: 'system' as const, content: finalSystemPrompt }, ...mapped];
    }

    return mapped;
}

function toMistralMessages_simple(promptMessages: string | BedrockMessage[]) {
    if (typeof promptMessages === 'string') {
        return [{ role: 'user' as const, content: promptMessages }];
    }

    return promptMessages.map((msg) => {
        // Tool result message
        if (msg.role === 'tool') {
            return {
                role: 'tool' as const,
                content: msg.content,
                toolCallId: msg.tool_call_id ?? '',
                name: undefined,
            };
        }

        // Assistant message (possibly with tool_calls)
        if (msg.role === 'assistant') {
            return {
                role: 'assistant' as const,
                content: msg.content,
                ...(msg.tool_calls && {
                    toolCalls: msg.tool_calls.map((tc) => ({
                        id: tc.id,
                        type: 'function' as const,
                        function: {
                            name: tc.function.name,
                            arguments: tc.function.arguments,
                        },
                    })),
                }),
            };
        }

        // System message
        if (msg.role === 'system') {
            return {
                role: 'system' as const,
                content: msg.content,
            };
        }

        // User message (default)
        return {
            role: 'user' as const,
            content: msg.content,
        };
    });
}