from lambda_mcp import LambdaMCPServer, setup_logging, get, post
import os
from aws_pysdk import ssm_load_parameters
from datetime import datetime
import json
import re
import requests
import textwrap
from pathlib import Path

from dotenv import load_dotenv
load_dotenv()

# Setup logging at module load time
setup_logging()

instructions = """"The Assistant MCP server provides tools to interact with store data. 
Tools call include the authorization parameter which is present as Bearer token in the request header: it is already present, there is no need to ask for it to the user.
Do not repeat tools call if not necessary, use the data returned by the previous call, especially the full list of stores.
"""

cache_prefix = "mcp_test_admin"

# Load parameters from AWS SSM
env = os.getenv("env", "development")  # Default environment if not set
ssm_load_parameters([
    {'name': f"/{env}/db/redis/connection", 'env_var_name': 'MCP_REDIS_URL', 'decrypt': True},
    {'name': f"/{env}/url/admin-api", 'env_var_name': 'API_BASE_URL', 'decrypt': False}
])

api_base_url = os.environ['API_BASE_URL']


api_version = os.getenv("API_VERSION")

match api_version:
    case "1":
        api_doc_path = "API_DOCS/api-v1.json"
    case "2":
        api_doc_path = "API_DOCS/api-v2.json"
    case "3":
        api_doc_path = "API_DOCS/api-v3.json"
    case _:
        raise Exception("WRONG API VERSION SET IN ENV VARIABLE")

# Create the MCP server instance        
mcp_server = LambdaMCPServer(
    name="mcp-lambda-server", 
    version="0.0.1",
    instructions=instructions,
    redis_url=os.environ['MCP_REDIS_URL'], 
    cache_prefix=cache_prefix
)
#-------------- GENERATE TOOLS DINAMICALLY, BASED ON SWAGGER ---------------------------------------------------------------------------#
path_out_tools = "tools.txt"
if os.path.exists(path_out_tools):
    os.remove(path_out_tools)


skip_to = None
# skip_to = ["StoresController_updateStore", "CustomersController_getCustomer", "StoresController_getGroups"]#, "DevicesController_CreateDevice"] # Solo debug, lascia commentato


# Utility functions
def normalize_operation_id(operation_id: str) -> str:
    name = re.sub(r'^\\w+Controller_', '', operation_id)
    return name[0].lower() + name[1:] if name else operation_id

def resolve_ref(ref: str, swagger: dict):
    parts = ref.strip("#/" ).split("/")
    value = swagger
    for part in parts:
        value = value.get(part, {})
    return value

def swagger_type_to_python_type(prop_type):
    return {
        "number": "float",
        "integer": "int",
        "boolean": "bool",
        "array": "list",
        "object": "dict"
    }.get(prop_type, "str")

def extract_input_schema(parameters, request_body, swagger):
    schema = {"type": "object", "properties": {}, "required": []}
    for param in parameters:
        schema["properties"][param["name"]] = param.get("schema", {"type": "string"})
        if param.get("required", False):
            schema["required"].append(param["name"])
        if param.get("example", False):
            schema["properties"][param["name"]]["example"] = param["example"]
    if request_body:
        content = request_body.get("content", {}).get("application/json", {}).get("schema", {})
        if "$ref" in content:
            resolved = resolve_ref(content["$ref"], swagger)
            schema["properties"].update(resolved.get("properties", {}))
            schema["required"].extend(resolved.get("required", []))
        else:
            schema["properties"].update(content.get("properties", {}))
            schema["required"].extend(content.get("required", []))
    return schema
def extract_output_schema(details, swagger):
    schema = (details.get("responses", {}).get("200", {})
                            .get("content", {}).get("application/json", {})
                            .get("schema", {}))
    # schema -> ref
    # schema type: array -> items -> ref
    resolved = {}
    if "$ref" in schema:
        resolved = resolve_ref(schema["$ref"], swagger)
    elif schema.get("type") == "array" and "items" in schema and "$ref" in schema["items"]:
        resolved = resolve_ref(schema["items"]["$ref"], swagger)
        resolved["type"] = "array"
    return resolved



# Data validation helpers
def parse_datetime(value):
    return datetime.strptime(value, '%Y-%m-%dT%H:%M:%S.%fZ').isoformat() + 'Z'

def parse_float(value):
    return float(value)

def parse_int(value):
    return int(value)

def parse_str(value):
    return str(value)

def parse_bool(value):
    return value if isinstance(value, bool) else value.lower() in ("true", "1")

def parse_array(value):
    return value if isinstance(value, list) else json.loads(value)

def parse_object(value):
    return value if isinstance(value, dict) else json.loads(value)

parsers = {
    "date-time": parse_datetime,
    "number": parse_float,
    "integer": parse_int,
    "string": parse_str,
    "boolean": parse_bool,
    "array": parse_array,
    "object": parse_object
}
# Tool generation logic
def generate_tool_function(api_url, operation_id, path, method, parameters, request_body, requires_auth, details, swagger, tags, summary=None, input_example=None, output_example=None):
    
    clean_name = normalize_operation_id(operation_id)
    input_schema = extract_input_schema(parameters, request_body, swagger)
    output_schema = extract_output_schema(details, swagger)


    arg_list = ["authorization: str"] if requires_auth else []
    seen_args = set()
    for name, prop in input_schema["properties"].items():
        if name == "authorization" or name in seen_args:
            continue
        seen_args.add(name)
        prop_type = prop.get("type", "string")
        python_type = swagger_type_to_python_type(prop_type)
        arg_default = " = None" if name not in input_schema["required"] else ""
        arg_list.append(f"{name}: {python_type}{arg_default}")

    arg_str = ", ".join(arg_list)

    validation_logic = ""
    for prop_name, prop_info in input_schema["properties"].items():
        if prop_name == "authorization":
            continue
        fmt = prop_info.get("format")
        prop_type = prop_info.get("type")
        parser_key = fmt or prop_type
        if parser_key in parsers:
            validation_logic += f"    if {prop_name} is not None:\n"
            validation_logic += f"        {prop_name} = parsers['{parser_key}']({prop_name})\n"

    headers_code = "headers = {'Authorization': f'Bearer {authorization}'} if authorization else {}"
    data_code = f"data = {{k: v for k, v in locals().items() if k in {list(input_schema['properties'].keys())} and v is not None}}"


    description = details.get("description", "")

    x_ai = details.get("x-ai", [])
    if x_ai:
        functional_description = x_ai[0].get("functionalDescription")
        if functional_description:
            description = f"{functional_description}"

    if input_example:
        description += f"\nInput Example:\n{json.dumps(input_example, indent=2)}"
    if output_example:
        description += f"\nOutput Example:\n{json.dumps(output_example, indent=2)}"
    
    descr_payload = {}

    input_schema_has_example = input_schema!= {} and any(
        "example" in prop_data
        for prop_data in input_schema["properties"].values()
    )
    output_schema_has_example = output_schema!= {} and any(
        "example" in prop_data
        for prop_data in output_schema["properties"].values()
    )
    if input_schema_has_example:
        descr_payload["input_schema"] = input_schema
    
    if output_schema_has_example:
        descr_payload["output_schema"] = output_schema

    if descr_payload != {}:
        description += "\n__JSON_START__\n"
        description += textwrap.indent(json.dumps(descr_payload, indent=2), "    ")


    func_lines = [
        f"@mcp_server.tool()",
        f"def {clean_name}({arg_str}):",
        f'    """',
        f'    # title: {clean_name} [tag:{",".join(tags)}]',
        f"    {description}",
        f'    """'
    ]

    if validation_logic:
        func_lines.append(validation_logic.rstrip())

    func_lines += [
        f'    url = f"{api_url}{path}"',
        f'    {headers_code}'
    ]

    if method.lower() in ['post', 'patch', 'put']:
        func_lines.append(f'    {data_code}')
        func_lines.append(f"    response = requests.{method.lower()}(url, json=data, headers=headers)")
    else:
        func_lines.append(f"    response = requests.{method.lower()}(url, headers=headers)")

    func_lines += [
        f"    response.raise_for_status()",
        f"    return response.json()"
    ]

    func_code = "\n".join(func_lines)
    # print(func_code)
    
    with open(path_out_tools, "a") as f:
        f.write("\n".join(func_lines))
        f.write("\n")

    exec(func_code, globals())

    j = func_code.find('"""', func_code.find('"""') + 3)
    # print("\n==================\n",func_code[:j + 3])
    print(f"✅ Generated tool: {clean_name}")

def get_swagger_doc(swagger_oas_url):
    response = requests.get(swagger_oas_url)
    response.raise_for_status()
    return response.json()

def process_swagger(api_url, allowed_operation_ids=None, only_x_ai=True):
    """Process the Swagger document and generate tool functions. Filter by allowed_operation_ids if provided."""
    # swagger_url = f"{api_url}/swagger/json"

    print(f"==========================================================================================")
    print(f"Using API DOCS version: {api_version}")
    print(f"Loading Swagger from: {api_doc_path}")
    print(f"Skipping tools without x-ai metadata: {only_x_ai}")
    print(f"Only allowed subset of operations: {True if allowed_operation_ids else False}\n")
    # swagger = get_swagger_doc(swagger_url)
    # read json from file
    text = Path(api_doc_path).read_text(encoding="utf-8")
    swagger = json.loads(text)

    for path, methods in swagger.get("paths", {}).items():
        for method, details in methods.items():
            operation_id = details.get("operationId")

            if skip_to and operation_id not in skip_to :# Solo in debug
                continue


            # print(f"{method.upper()} {path} -> operationId: {operation_id}")

            if not operation_id:
                print(f"⚠️ Skipping {method} {path}: missing operation_id")
                continue

            if allowed_operation_ids and operation_id not in allowed_operation_ids:
                continue

            x_ai = details.get("x-ai", {})
            # if only_x_ai and not x_ai:
            #     print(f"⚠️ Skipping {operation_id}: missing x-ai metadata")
            #     continue

            generate_tool_function(
                api_url=api_url,
                operation_id=operation_id,
                path=path,
                method=method,
                parameters=details.get("parameters", []),
                request_body=details.get("requestBody", {}),
                requires_auth="security" in details,
                details=details,
                swagger=swagger,
                tags=details.get("tags", []),
                summary=details.get("summary"),
                input_example=details.get("requestBody", {}).get("content", {}).get("application/json", {}).get("example"),
                output_example=details.get("responses", {}).get("200", {}).get("schema", {}).get("example")
            )
# Swagger processing
try:
    if api_version == "1":  # API version 1 non ha i campi x-ai
        process_swagger(api_base_url, only_x_ai=False)
    else:
        process_swagger(api_base_url)
    pass
    

except Exception as e:
    print(f"❌ Failed to load or process Swagger: {e}")

def lambda_handler(event, context):
    return mcp_server.handle_request(event, context)