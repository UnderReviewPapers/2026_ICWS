import { bedrockConverse } from "./awsBedrockLLM";
import type { BedrockMessage } from "./interfaces/BedrockMessage";
import { mistralMsg } from "./mistral";

// better get in input and object instead of list of parameters
export const callBedrockAPIStream = async (
    promptMessages: string | BedrockMessage[],
    systemPrompt: string | null,
    sessionId: string,
    bedrockApiEndpoint: string,
    AUTH_TOKEN: string,
    onDataChunk?: (chunk: string) => void,
    tools?: any
) => {
    // console.log(import.meta.env.VITE_LLM_CUSTOM)
    if (import.meta.env.VITE_LLM_CUSTOM === 'true') {
        return callCustomLLM(
            promptMessages,
            systemPrompt,
            sessionId,
            bedrockApiEndpoint,
            AUTH_TOKEN,
            onDataChunk,
            tools
        );
    }

    const response = await fetch(bedrockApiEndpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${AUTH_TOKEN}`,
        },
        body: JSON.stringify({
            prompt: promptMessages,
            ...(systemPrompt != null && { systemPrompt }),
            session_id: sessionId,
            stream: true,
            ...(tools ? { tools } : {})
        }),
    });

    if (!response.ok || !response.body) {
        throw new Error(`Bedrock API error: ${response.statusText}`);
    }

    const decoder = new TextDecoderStream('utf-8');

    const writable = new WritableStream({
        write(chunk) {
            onDataChunk?.(chunk);
        },
        close() {
            console.log('✅ Stream closed');
        },
        abort(err) {
            console.error('❌ Stream aborted:', err);
        },
    });

    try {
        await response.body.pipeThrough(decoder).pipeTo(writable);
    } catch (err) {
        console.error('Streaming pipeline error:', err);
    }
};

export const callBedrockAPIFullResponse = async (
    promptMessages: string | BedrockMessage[],
    systemPrompt: string | null,
    sessionId: string,
    bedrockApiEndpoint: string,
    AUTH_TOKEN: string,
    tools?: any,
) => {
// debugger;
    let fullAnsw = '';
    await callBedrockAPIStream(promptMessages, systemPrompt, sessionId, bedrockApiEndpoint, AUTH_TOKEN,
        (chunk: string) => {
            fullAnsw += chunk;
        },
        tools
    );
    return fullAnsw;
}


export const callBedrockAPIFullResponseWithRetry = async (
    promptMessage: string,
    systemPrompt: string,
    sessionId: string,
    bedrockApiEndpoint: string,
    AUTH_TOKEN: string,
) => {

    const maxRetries = 2;
    const waitTimeMs: number = 60000 // 1 min
    let attempt = 0;

    let fullAnsw = '';
    while (attempt <= maxRetries) {
        fullAnsw = '';
        await callBedrockAPIStream(promptMessage, systemPrompt, sessionId, bedrockApiEndpoint, AUTH_TOKEN,
            (chunk: string) => {
                fullAnsw += chunk;
            }
        );
        if (fullAnsw.includes('Too many tokens')) {
            console.log(fullAnsw)
            if (attempt < maxRetries) {
                console.warn(`Too many tokens error. Waiting ${waitTimeMs / 1000}s before retrying... (Attempt ${attempt + 1} of ${maxRetries})`);
                await new Promise(res => setTimeout(res, waitTimeMs));
                attempt++;
            } else {
                console.error(`Failed after ${maxRetries + 1} attempts:\n${fullAnsw}`);
            }
        }
    }
    return fullAnsw;
}


const callCustomLLM = async (
    promptMessages: string | BedrockMessage[],
    systemPrompt: string | null,
    sessionId: string,
    bedrockApiEndpoint: string,
    AUTH_TOKEN: string,
    onDataChunk?: (chunk: string) => void,
    tools?: any
) => {
    
    
    // Bedrock aws
    const response = await bedrockConverse(promptMessages, systemPrompt, tools)
    if (response) {
        const text = typeof response === 'string' ? response : JSON.stringify(response);
        onDataChunk?.(text); 
    }

    
}