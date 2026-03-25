# 2026_ICWS

This repository contains the code used for experimental evaluation.

- API documentation example: `/openAPI`  
- Source code: `/code`  

Configurations:
- **C1, C2** → `/code/base`  
- **C3** → `/code/enriched`  

---

## ⚙️ Installation

1. Choose the configuration (C1, C2, or C3) and move to the corresponding folder.

2. Create Python virtual environment and install backend:
    ```
    cd mcp-server
    python -m venv venv
    source venv/bin/activate
    pip install -r requirements.txt
    ```

3. Install frontend:
    ```
    cd mcp-client
    npm install
    ```
## 🔧 Configuration
1. In mcp-server, fill the .env file:
    -   Select configuration by setting API_VERSION in .env (e.g., API_VERSION=3 for C3).
2. In mcp-client, fill the .env file:
    - To use DeepSeek on Bedrock, set: VITE_AWS_BEARER_TOKEN_BEDROCK=<your_api_key>

3. Configure APIs:
    - Place your API JSON files in: mcp-server/API_DOCS
    - Naming format: api-v1.json

## 🚀 Run
1. Start backend:
    ```
    cd mcp-server
    source venv/bin/activate
    python lambda_local.py
    ```
2. Start frontend (new terminal):
    ```
    cd mcp-client
    npm run dev
    ```
3. Open browser: http://localhost:5173
