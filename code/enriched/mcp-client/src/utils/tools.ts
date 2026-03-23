export const connectMCPServer = async (mcpServer: string, authCode: string) => {
  console.log('Connecting to MCP server at:', mcpServer);
  let sessionId: string | null = null;
  try {

    const res = await fetch(`${mcpServer}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authCode}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: '1',
        method: 'initialize',
        params: {
          authorization: authCode
        },
      }),
    });
    // 🟩 Read headers BEFORE parsing body
    sessionId = res.headers.get("MCP-Session-Id");

    const json = await res.json();
    if (!res.ok || json.error) {
      throw new Error(json?.error?.message || 'Connection failed');
    }
    return sessionId;
  } catch (err) {
    console.error('MCP connect failed:', err);
    throw new Error('MCP connect failed:' + err);

  }
}

const SEPARATOR = '__JSON_START__';

function parseTools(json: any) {
  if (json.result && Array.isArray(json.result.tools)) {
    // console.log("Raw tools from MCP server:", json.result.tools);
    json.result.tools = json.result.tools
      .map((tool: any) => {
        const desc = tool.description ?? "";
        const lines = desc.split("\n");

        const firstLine = lines[0] || "";
        const tagMatch = firstLine.match(/\[tag:\s*(.*?)\]/i);
        const tag = tagMatch ? tagMatch[1].trim() : null;

        const descWithoutFirstLine = tagMatch
          ? lines.slice(1).join("\n")
          : desc;

        let baseDescription = descWithoutFirstLine.trim();

        let jsonObj = {};
        if (baseDescription.includes(SEPARATOR)) {
          const parts = baseDescription.split(SEPARATOR);
          if (parts.length === 1) {
            jsonObj = JSON.parse(parts[0].trim());
          }
          else {
            baseDescription = (parts[0] ?? "").trim();
            jsonObj = JSON.parse(parts[1].trim());            
          }
        }

        return {
          ...tool,
          description: baseDescription,
          tag: tag,
          ...jsonObj
        };
      })
      .filter((tool: any) => tool !== null);
  }

  return (json.result && json.result.tools) || [];

}


export const getTools = async (
  sessionId: string | null,
  mcpServer: string,
  authCode: string
) => {
  console.log(sessionId, 'sessionId in listTools');
  if (!sessionId) {
    throw new Error('Not connected to MCP server');
  }

  const res = await fetch(mcpServer, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authCode}`,
      'mcp-session-id': sessionId,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: '1',
      method: 'tools/list',
      params: {}
    }),
  });

  const json = await res.json();
  if (!res.ok || json.error) {
    throw new Error(json?.error?.message || 'MCP listTools failed');
  }

  return parseTools(json);
}

export const executeTool = async (
  sessionId: string | null,
  mcpServer: string,
  authCode: string,
  toolName: string,
  args: Record<string, any> = {}
) => {
  if (!sessionId) {
    throw new Error('Not connected to MCP server');
  }

  const res = await fetch(mcpServer, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authCode}`,
      'mcp-session-id': sessionId,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: '1',
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: {
          ...args,
        }
      },
    }),
  });

  const json = await res.json();
  if (!res.ok || json.error) {
    throw new Error(json?.error?.message || 'Tool call failed');
  }

  return json.result;
}