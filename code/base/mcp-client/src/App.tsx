import { useEffect, useState } from 'react'

import './App.css'
import MCPBedrockChat from './components/ui-chat/MCPBedrockChat';
import {  useMCPClient } from './context/MCPClientProvider';

function App() {
  const [count, setCount] = useState(0)
  const { connect } = useMCPClient();
 useEffect(() => {
    connect(import.meta.env.VITE_MCP_SERVER_URL!);
  }, [connect]);

  return (
    <div className="App">

          <MCPBedrockChat bedrockEndpoint={import.meta.env.VITE_BEDROCK_API_URL!} />


    </div>
  )
}

export default App
