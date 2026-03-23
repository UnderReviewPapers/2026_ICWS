import type { BedrockMessage } from "./interfaces/BedrockMessage";

const region = "eu-north-1";
const model_id = "deepseek.v3.2";
// const model_id = "deepseek.v3-v1:0";
const bedrock_api_key = import.meta.env.VITE_AWS_BEARER_TOKEN_BEDROCK;

function toDeepSeekMessages(
    promptMessages: string | BedrockMessage[],
    systemPrompt: string | null
): any[] {
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
            return {
                role: 'tool' as const,
                tool_call_id: msg.tool_call_id ?? `call_${Math.random().toString(36).slice(2, 10)}`,
                content: typeof msg.content === 'string'
                    ? msg.content
                    : (msg.content as any[]).map((c: any) => c.text ?? '').join(''),
            };
        }
        if (msg.role === 'assistant') {
            return {
                role: 'assistant' as const,
                content: typeof msg.content === 'string'
                    ? msg.content
                    : (msg.content as any[]).map((c: any) => c.text ?? '').join(''),
                ...(msg.tool_calls?.length ? { tool_calls: msg.tool_calls } : {}),
            };
        }
        return {
            role: msg.role as 'user',
            content: typeof msg.content === 'string'
                ? msg.content
                : (msg.content as any[]).map((c: any) => c.text ?? '').join(''),
        };
    });

    if (finalSystemPrompt) {
        return [{ role: 'system', content: finalSystemPrompt }, ...mapped];
    }

    return mapped;
}

export async function bedrockConverse(
    promptMessages: string | BedrockMessage[],
    systemPrompt: string | null,
    tools?: any
): Promise<string> {
    const url = `https://bedrock-runtime.${region}.amazonaws.com/model/${encodeURIComponent(model_id)}/invoke`;

    const messages = toDeepSeekMessages(promptMessages, systemPrompt);

    const body: any = { messages, max_tokens: 65536, temperature: 0  };
    if (tools) body.tools = tools;

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${bedrock_api_key}`,
        },
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        throw new Error(`Errore ${response.status}: ${await response.text()}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
}