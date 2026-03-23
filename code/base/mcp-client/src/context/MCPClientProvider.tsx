import React, { createContext, useContext, useState, useCallback } from 'react';
import { connectMCPServer, executeTool, getTools } from '../utils/tools';
interface MCPClientContextType {
  sessionId: string | null;
  isConnected: boolean;
  connect: (url: string) => Promise<void>;
  disconnect: () => void;
  listTools: (all?: boolean) => Promise<any[]>;
  callTool: (toolName: string, args: Record<string, any>) => Promise<any>;
}

const MCPClientContext = createContext<MCPClientContextType | undefined>(undefined);

export const MCPClientProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isConnected, setIsConnected] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);

  const connect = useCallback(async (url: string) => {
    try {
      const sessionId = await connectMCPServer(url, import.meta.env.VITE_AUTH_TOKEN);
      // console.log("MCP connect session ID:", sessionId);
      if (sessionId && sessionId !== 'null') {
        setSessionId(sessionId);
      } else {
        console.warn("MCP connect session ID not found in headers");
      }
      setIsConnected(true);
    } catch (err) {
      console.error('MCP connect failed:', err);
      setIsConnected(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setIsConnected(false);
    setSessionId(null);
    console.log('Disconnected from MCP server');
  }, []);

  const listTools = useCallback(async () => {
    if (!isConnected || !sessionId) {
      throw new Error('Not connected to MCP server');
    }
    return await getTools(sessionId, import.meta.env.VITE_MCP_SERVER_URL!, import.meta.env.VITE_AUTH_TOKEN);
  }, [sessionId, isConnected]);


  const callTool = useCallback(async (toolName: string, args: Record<string, any> = {}) => {
    if (!isConnected || !sessionId) {
      throw new Error('Not connected to MCP server');
    }
    return await executeTool(sessionId, import.meta.env.VITE_MCP_SERVER_URL!, import.meta.env.VITE_API_AUTH_TOKEN, toolName, args);
  }, [sessionId, isConnected]);


  const value: MCPClientContextType = {
    sessionId,
    isConnected,
    connect,
    disconnect,
    listTools,
    callTool,
  };

  return (
    <MCPClientContext.Provider value={value}>
      {children}
    </MCPClientContext.Provider>
  );
};

export const useMCPClient = () => {
  const context = useContext(MCPClientContext);
  if (!context) throw new Error('useMCPClient must be used within an MCPClientProvider');
  return context;
};