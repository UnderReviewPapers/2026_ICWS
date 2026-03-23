from urllib import request
from fastapi import FastAPI, Request
from fastapi.responses import Response
from fastapi.middleware.cors import CORSMiddleware
import json
import logging
import os

from app import lambda_handler
from lambda_mcp import setup_logging, sanitize_headers
logger = logging.getLogger(__name__)
logger.info("Successfully imported lambda_mcp")

    # Fallback setup
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)
def sanitize_headers(headers):
    return {k: v for k, v in headers.items()}
def setup_logging():
    pass

# Configure logging using centralized setup if available
try:
    setup_logging()
except NameError:
    logging.basicConfig(level=logging.DEBUG)

# Set handler type (currently only supporting the main handler)
HANDLER = os.getenv("HANDLER", "main")

app = FastAPI()
# CORS settings
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],  # <-- Replace "*" with specific origins in production
    # allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],   
    expose_headers=["MCP-Session-Id"],  # 👈 This makes the header accessible in browser JS

)
@app.api_route("/mcp", methods=["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"])
async def mcp_endpoint(request: Request):
    """Mount lambda_handler function on /mcp endpoint"""
    logger.info(f"Received {request.method} request to {request.url.path}")
    
    # Convert FastAPI request to Lambda event format
    body = None
    if request.method in ["OPTIONS"]:
        return Response(status_code=200)
    if request.method in ["POST", "PUT", "PATCH"]:
        body_bytes = await request.body()
        logger.debug(f"Request body bytes length: {len(body_bytes) if body_bytes else 0}")
        if body_bytes:
            body = body_bytes.decode('utf-8')
            logger.debug(f"Request body: {body}")
    
    # Filter out problematic headers that can cause Content-Length issues
    filtered_headers = {}
    for key, value in request.headers.items():
        if key.lower() not in ['content-length', 'transfer-encoding', 'connection']:
            filtered_headers[key] = value
    
    # Create a safe version of headers for logging
    safe_headers = sanitize_headers(filtered_headers)
    logger.debug(f"Filtered headers: {safe_headers}")
    # print("LOG: Filtered headers:", safe_headers)
    
    event = {
        "httpMethod": request.method,
        "path": request.url.path,
        "queryStringParameters": dict(request.query_params) if request.query_params else None,
        "headers": filtered_headers,
        "body": body,
        "isBase64Encoded": False
    }
    
    logger.debug(f"Lambda event: {event}")
    print("LOG: Lambda event:", event)
    
    # Call lambda handler
    if lambda_handler is None:
        logger.error("Lambda handler not available")
        return Response(content='{"error": "Handler not available"}', status_code=500, media_type="application/json")
    
    result = lambda_handler(event, None)
    logger.debug(f"Lambda result: {result}")
    # print("LOG: Lambda result:", result)
    
    # Convert Lambda response to FastAPI response
    status_code = result.get("statusCode", 200)
    response_body = result.get("body", "")
    session_id = result.get("headers", {}).get("MCP-Session-Id", None)

    logger.debug(f"Response session ID: {session_id}")
    logger.debug(f"Response status: {status_code}")
    logger.debug(f"Response body: {response_body}")
    # Filter out problematic response headers
    response_headers = {}

    for key, value in result.get("headers", {}).items():
        if key.lower() not in ['content-length', 'transfer-encoding', 'connection']:
            response_headers[key] = value
    
    if session_id:
        response_headers["MCP-Session-Id"] = session_id
    logger.debug(f"Response headers: {response_headers}")
    
    # Handle 204 No Content responses - they should not have any body
    if status_code == 204:
        logger.debug("Returning 204 No Content response with no body")
        return Response(content="", status_code=status_code, headers=response_headers)
    
 
    # Handle empty response body for other status codes
    if not response_body:
        logger.debug("Returning empty JSON response")
        return Response(content="{}", status_code=status_code, headers=response_headers, media_type="application/json")
    
    # Try to parse JSON response to validate it
    try:
        json.loads(response_body)  # Just validate, don't store
        logger.debug("Returning valid JSON response")
        return Response(content=response_body, status_code=status_code, headers=response_headers, media_type="application/json")
    except json.JSONDecodeError:
        # If not valid JSON, wrap as JSON message
        wrapped_response = json.dumps({"message": response_body})
        logger.debug("Returning wrapped JSON response")
        return Response(content=wrapped_response, status_code=status_code, headers=response_headers, media_type="application/json")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)