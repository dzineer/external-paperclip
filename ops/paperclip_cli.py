#!/usr/bin/env python3
"""
Paperclip CLI — Full setup and migration tool for Vita AI on Paperclip.

Sets up RAG infrastructure (Neo4j + Graphiti), MCP servers (doctree, graphiti,
Google Workspace), document tree, skills, and imports agents into any existing
Paperclip instance.

Usage:
    # Full setup on a remote machine (does everything)
    python3 paperclip_cli.py setup-all \
        --api-url https://your-paperclip.com \
        --api-key YOUR_BOARD_API_KEY \
        --company-name "My Company" \
        --ssh-host root@remote-server.com \
        --repo-dir /path/to/vita-infrastructure

    # Individual commands
    python3 paperclip_cli.py setup-infra --ssh-host root@server --repo-dir /path/to/repo
    python3 paperclip_cli.py setup-mcp --ssh-host root@server --repo-dir /path/to/repo
    python3 paperclip_cli.py import-agents --api-url URL --api-key KEY --company-name "Name"
    python3 paperclip_cli.py setup-google --client-id ID --client-secret SECRET
    python3 paperclip_cli.py list-companies --api-url URL --api-key KEY
    python3 paperclip_cli.py list-agents --api-url URL --api-key KEY --company-name "Name"
"""

import argparse
import json
import os
import subprocess
import sys
import tempfile
import urllib.request
import urllib.error
import urllib.parse

# ── Agent rename map ──
RENAME_MAP = {
    "Marie": "Amy",
}

# ── Agent definitions ──
AGENTS = [
    {
        "name": "CEO",
        "role": "ceo",
        "title": "Chief Executive Officer",
        "icon": "crown",
        "adapter_type": "claude_local",
        "reports_to": None,
        "permissions": {"canCreateAgents": True, "canAssignTasks": True},
        "desired_skills": ["paperclip", "paperclip-create-agent", "document-tree", "graphiti-memory"],
        "workspace_dir": "CEO-635f3a34",
    },
    {
        "name": "Amy",
        "role": "general",
        "title": "Executive Assistant",
        "icon": "sparkles",
        "adapter_type": "claude_local",
        "reports_to": "CEO",
        "permissions": {"canCreateAgents": False, "canAssignTasks": True},
        "desired_skills": ["paperclip", "document-tree", "graphiti-memory"],
        "workspace_dir": "Marie-029b2109",
    },
    {
        "name": "Engineering Manager",
        "role": "pm",
        "title": "Engineering Manager",
        "icon": "cog",
        "adapter_type": "claude_local",
        "reports_to": "CEO",
        "permissions": {"canCreateAgents": True, "canAssignTasks": True},
        "desired_skills": ["paperclip", "paperclip-create-agent", "paperclip-fullstack-guide", "document-tree"],
        "workspace_dir": "Engineering-Manager-f17e51ca",
    },
    {
        "name": "Research Specialist",
        "role": "general",
        "title": "Research Specialist",
        "icon": "microscope",
        "adapter_type": "claude_local",
        "reports_to": "CEO",
        "permissions": {"canCreateAgents": False, "canAssignTasks": False},
        "desired_skills": ["paperclip", "document-tree", "graphiti-memory"],
        "workspace_dir": "Research-Specialist-161f306b",
    },
    {
        "name": "Frontend Engineer",
        "role": "engineer",
        "title": "Frontend Engineer",
        "icon": "code",
        "adapter_type": "claude_local",
        "reports_to": "Engineering Manager",
        "permissions": {"canCreateAgents": False, "canAssignTasks": False},
        "desired_skills": ["paperclip", "paperclip-fullstack-guide", "document-tree"],
        "workspace_dir": "Frontend-Engineer-3071507e",
    },
    {
        "name": "Backend Engineer",
        "role": "engineer",
        "title": "Backend Engineer",
        "icon": "terminal",
        "adapter_type": "claude_local",
        "reports_to": "Engineering Manager",
        "permissions": {"canCreateAgents": False, "canAssignTasks": False},
        "desired_skills": ["paperclip", "paperclip-fullstack-guide", "document-tree"],
        "workspace_dir": "Backend-Engineer-beb6459f",
    },
    {
        "name": "Paralegal",
        "role": "general",
        "title": "Paralegal",
        "icon": "shield",
        "adapter_type": "claude_local",
        "reports_to": "General Counsel",
        "permissions": {"canCreateAgents": False, "canAssignTasks": False},
        "desired_skills": ["paperclip", "document-tree"],
        "workspace_dir": "Paralegal-25b0ef20",
    },
    {
        "name": "General Counsel",
        "role": "general",
        "title": "General Counsel",
        "icon": "lock",
        "adapter_type": "claude_local",
        "reports_to": "CEO",
        "permissions": {"canCreateAgents": False, "canAssignTasks": True},
        "desired_skills": ["paperclip", "document-tree"],
        "workspace_dir": "General-Counsel-1a865d2d",
    },
]

# ── Files to deploy ──
# Source paths relative to repo root → target paths on the remote host
DEPLOY_FILES = {
    # MCP servers
    "rag/doctree-mcp/server.js": "/home/dev/doctree-mcp/server.js",
    "rag/graphiti-mcp/server.js": "/home/dev/graphiti-mcp/server.js",
    # Skills
    "paperclip/skills/document-tree/SKILL.md": "/tmp/external-paperclip/skills/document-tree/SKILL.md",
    "paperclip/skills/graphiti-memory/SKILL.md": "/tmp/external-paperclip/skills/graphiti-memory/SKILL.md",
    "paperclip/skills/paperclip-fullstack-guide/SKILL.md": "/tmp/external-paperclip/skills/paperclip-fullstack-guide/SKILL.md",
    # DB extensions
    "paperclip/db-extensions/schema/doc_folders.ts": "/tmp/external-paperclip/packages/db/src/schema/doc_folders.ts",
    "paperclip/db-extensions/schema/doc_folder_files.ts": "/tmp/external-paperclip/packages/db/src/schema/doc_folder_files.ts",
    "paperclip/db-extensions/migrations/0046_document_tree.sql": "/tmp/external-paperclip/packages/db/src/migrations/0046_document_tree.sql",
    "paperclip/db-extensions/migrations/0047_agent_doc_folders.sql": "/tmp/external-paperclip/packages/db/src/migrations/0047_agent_doc_folders.sql",
    # Server extensions
    "paperclip/server-extensions/services/doc-tree.ts": "/tmp/external-paperclip/server/src/services/doc-tree.ts",
    "paperclip/server-extensions/routes/doc-tree.ts": "/tmp/external-paperclip/server/src/routes/doc-tree.ts",
    # UI extensions
    "paperclip/ui-extensions/pages/Documents.tsx": "/tmp/external-paperclip/ui/src/pages/Documents.tsx",
    "paperclip/ui-extensions/components/AgentDocumentsTab.tsx": "/tmp/external-paperclip/ui/src/components/AgentDocumentsTab.tsx",
    "paperclip/ui-extensions/api/doc-tree.ts": "/tmp/external-paperclip/ui/src/api/doc-tree.ts",
    # Rebuild script
    "scripts/paperclip-rebuild.sh": "/home/dev/paperclip-rebuild.sh",
}

# Claude Code MCP server config to inject
MCP_SERVERS_CONFIG = {
    "doctree": {
        "type": "stdio",
        "command": "node",
        "args": ["/opt/doctree-mcp/server.js"],
        "env": {},
    },
    "graphiti": {
        "type": "stdio",
        "command": "node",
        "args": ["/opt/graphiti-mcp/server.js"],
        "env": {"GRAPHITI_URL": "http://graphiti:8000"},
    },
    "workspace-developer": {
        "type": "http",
        "url": "https://workspace-developer.goog/mcp",
    },
}

# Docker Compose additions for RAG services
DOCKER_COMPOSE_RAG = """
  neo4j:
    image: neo4j:5.26-community
    environment:
      NEO4J_AUTH: neo4j/graphiti-password
      NEO4J_PLUGINS: '["apoc"]'
    healthcheck:
      test: ["CMD-SHELL", "cypher-shell -u neo4j -p graphiti-password 'RETURN 1'"]
      interval: 5s
      timeout: 10s
      retries: 30
    ports:
      - "7474:7474"
      - "7687:7687"
    volumes:
      - neo4j-data:/data

  graphiti:
    image: zepai/graphiti:latest
    environment:
      NEO4J_URI: bolt://neo4j:7687
      NEO4J_USER: neo4j
      NEO4J_PASSWORD: graphiti-password
      OPENAI_API_KEY: "${OPENAI_API_KEY:?OPENAI_API_KEY must be set}"
      PORT: "8000"
    ports:
      - "8000:8000"
    depends_on:
      neo4j:
        condition: service_healthy
"""

DOCKER_VOLUMES_RAG = """  neo4j-data:"""

DOCKER_COMPOSE_VOLUME_MOUNTS = [
    "/home/dev/gws-config:/paperclip/.config/gws",
    "/home/dev/graphiti-mcp:/opt/graphiti-mcp:ro",
    "/home/dev/doctree-mcp:/opt/doctree-mcp:ro",
    "/tmp/external-paperclip/skills/graphiti-memory:/app/skills/graphiti-memory:ro",
    "/tmp/external-paperclip/skills/document-tree:/app/skills/document-tree:ro",
    "/tmp/external-paperclip/skills/paperclip-fullstack-guide:/app/skills/paperclip-fullstack-guide:ro",
]

DOCKER_COMPOSE_ENV_ADDITIONS = [
    'GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE: "/paperclip/.config/gws/tokens.json"',
]


class PaperclipClient:
    def __init__(self, api_url: str, api_key: str):
        self.api_url = api_url.rstrip("/")
        self.api_key = api_key

    def _request(self, method: str, path: str, body=None):
        url = f"{self.api_url}/api{path}"
        data = json.dumps(body).encode() if body else None
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}",
        }
        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req) as resp:
                return json.loads(resp.read().decode())
        except urllib.error.HTTPError as e:
            err_body = e.read().decode() if e.fp else ""
            print(f"  ERROR {e.code}: {err_body}", file=sys.stderr)
            raise

    def get(self, path):
        return self._request("GET", path)

    def post(self, path, body=None):
        return self._request("POST", path, body)

    def patch(self, path, body=None):
        return self._request("PATCH", path, body)

    def list_companies(self):
        return self.get("/companies")

    def find_company(self, name: str):
        for c in self.list_companies():
            if c["name"].lower() == name.lower():
                return c
        return None

    def list_agents(self, company_id: str):
        return self.get(f"/companies/{company_id}/agents")

    def create_agent(self, company_id: str, agent_data: dict):
        return self.post(f"/companies/{company_id}/agents", agent_data)

    def update_permissions(self, agent_id: str, permissions: dict):
        return self.patch(f"/agents/{agent_id}/permissions", permissions)

    def sync_skills(self, agent_id: str, skills: list):
        return self.post(f"/agents/{agent_id}/skills/sync", {"desiredSkills": skills})

    def scan_skills(self, company_id: str):
        return self.post(f"/companies/{company_id}/skills/scan-projects", {})

    def seed_doc_tree(self, company_id: str):
        return self.post(f"/companies/{company_id}/doc-tree/seed", {})

    def health(self):
        return self.get("/health")


def ssh_run(host: str, cmd: str, check=True):
    """Run a command on a remote host via SSH."""
    full = f"ssh -o StrictHostKeyChecking=no {host} {repr(cmd)}"
    result = subprocess.run(full, shell=True, capture_output=True, text=True)
    if check and result.returncode != 0:
        print(f"  SSH ERROR: {result.stderr.strip()}", file=sys.stderr)
    return result


def scp_to(host: str, local_path: str, remote_path: str):
    """Copy a file to a remote host via SCP."""
    subprocess.run(
        ["scp", "-o", "StrictHostKeyChecking=no", local_path, f"{host}:{remote_path}"],
        check=True, capture_output=True,
    )


def resolve_agent_order(agents):
    """Order agents so parents are created before children."""
    created = set()
    ordered = []
    remaining = list(agents)
    while remaining:
        progress = False
        for agent in list(remaining):
            if agent["reports_to"] is None or agent["reports_to"] in created:
                ordered.append(agent)
                created.add(agent["name"])
                remaining.remove(agent)
                progress = True
        if not progress:
            ordered.extend(remaining)
            break
    return ordered


# ─────────────────────────────────────────────
# Commands
# ─────────────────────────────────────────────

def cmd_setup_infra(args):
    """Deploy RAG infrastructure (Neo4j + Graphiti) alongside existing Paperclip."""
    host = args.ssh_host
    repo_dir = os.path.abspath(args.repo_dir)
    container = args.container_name

    print("\n=== Setting Up RAG Infrastructure ===\n")

    if host:
        print(f"  Target: {host}")
    else:
        print(f"  Target: localhost")

    # 1. Deploy MCP servers and skills
    print("\n  [1/4] Deploying MCP servers and skills...")
    for src_rel, dst in DEPLOY_FILES.items():
        src = os.path.join(repo_dir, src_rel)
        if not os.path.isfile(src):
            print(f"    SKIP {src_rel} (not found)")
            continue

        dst_dir = os.path.dirname(dst)
        if host:
            ssh_run(host, f"mkdir -p {dst_dir}", check=False)
            scp_to(host, src, dst)
        else:
            os.makedirs(dst_dir, exist_ok=True)
            subprocess.run(["cp", src, dst], check=True)
        print(f"    {src_rel} -> {dst}")

    # 2. Create directories
    print("\n  [2/4] Creating directories...")
    dirs = ["/home/dev/doctree-mcp", "/home/dev/graphiti-mcp", "/home/dev/gws-config"]
    for d in dirs:
        if host:
            ssh_run(host, f"mkdir -p {d}", check=False)
        else:
            os.makedirs(d, exist_ok=True)
        print(f"    {d}")

    # 3. Check if docker-compose.yml needs RAG services
    print("\n  [3/4] Checking docker-compose.yml for RAG services...")
    if host:
        result = ssh_run(host, "cat /tmp/external-paperclip/docker-compose.yml", check=False)
        compose_content = result.stdout
    else:
        compose_path = "/tmp/external-paperclip/docker-compose.yml"
        compose_content = open(compose_path).read() if os.path.exists(compose_path) else ""

    if "neo4j:" not in compose_content:
        print("    Neo4j + Graphiti not found — needs to be added to docker-compose.yml")
        print("    NOTE: Add the following services to your docker-compose.yml:")
        print(DOCKER_COMPOSE_RAG)
        print(f"    And add this volume:\n{DOCKER_VOLUMES_RAG}")
    else:
        print("    Neo4j + Graphiti already present")

    # Check volume mounts
    missing_mounts = []
    for mount in DOCKER_COMPOSE_VOLUME_MOUNTS:
        mount_src = mount.split(":")[0]
        if mount_src not in compose_content:
            missing_mounts.append(mount)

    if missing_mounts:
        print("\n    Missing volume mounts in server service:")
        for m in missing_mounts:
            print(f"      - {m}")

    # Check env additions
    missing_envs = []
    for env in DOCKER_COMPOSE_ENV_ADDITIONS:
        env_key = env.split(":")[0].strip()
        if env_key not in compose_content:
            missing_envs.append(env)

    if missing_envs:
        print("\n    Missing environment variables in server service:")
        for e in missing_envs:
            print(f"      {e}")

    # 4. Configure Claude Code MCP servers in .claude.json
    print("\n  [4/4] Configuring MCP servers in Claude Code...")
    if host:
        result = ssh_run(host, f"docker exec {container} cat /paperclip/.claude.json 2>/dev/null", check=False)
        claude_json = result.stdout.strip()
    else:
        result = subprocess.run(
            ["docker", "exec", container, "cat", "/paperclip/.claude.json"],
            capture_output=True, text=True,
        )
        claude_json = result.stdout.strip()

    if claude_json:
        try:
            config = json.loads(claude_json)
        except json.JSONDecodeError:
            config = {}
    else:
        config = {}

    existing_mcp = config.get("mcpServers", {})
    added = []
    for name, server_config in MCP_SERVERS_CONFIG.items():
        if name not in existing_mcp:
            existing_mcp[name] = server_config
            added.append(name)

    if added:
        config["mcpServers"] = existing_mcp
        json_str = json.dumps(config)

        if host:
            # Write via docker exec
            ssh_run(host, f"docker exec {container} sh -c 'cat > /tmp/mcp_patch.json << JSONEOF\n{json_str}\nJSONEOF'", check=False)
            ssh_run(host, f"docker exec {container} cp /tmp/mcp_patch.json /paperclip/.claude.json", check=False)
        else:
            with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
                json.dump(config, f)
                tmp = f.name
            subprocess.run(["docker", "cp", tmp, f"{container}:/paperclip/.claude.json"], check=True)
            os.unlink(tmp)

        for name in added:
            print(f"    Added MCP server: {name}")
    else:
        print("    All MCP servers already configured")

    print("\n  Infrastructure setup complete.")
    print("  Next: rebuild the Paperclip container to apply changes.")
    if host:
        print(f"    ssh {host} '/home/dev/paperclip-rebuild.sh'")
    else:
        print("    /home/dev/paperclip-rebuild.sh")


def cmd_setup_mcp(args):
    """Configure MCP servers on an existing Paperclip container."""
    container = args.container_name

    print("\n=== Configuring MCP Servers ===\n")

    for name, server_config in MCP_SERVERS_CONFIG.items():
        if server_config.get("type") == "stdio":
            env_args = []
            for k, v in server_config.get("env", {}).items():
                env_args.extend(["-e", f"{k}={v}"])

            cmd = ["docker", "exec", container, "claude", "mcp", "add", name, "-s", "user"]
            if env_args:
                cmd.extend(env_args)
            cmd.append("--")
            cmd.append(server_config["command"])
            cmd.extend(server_config["args"])
        elif server_config.get("type") == "http":
            cmd = ["docker", "exec", container, "claude", "mcp", "add",
                   "--transport", "http", "-s", "user", name, server_config["url"]]
        else:
            continue

        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode == 0:
            print(f"  Added: {name}")
        else:
            if "already exists" in result.stderr.lower():
                print(f"  Exists: {name}")
            else:
                print(f"  {name}: {result.stderr.strip()}")

    # Verify
    print("\n  Verifying...")
    result = subprocess.run(
        ["docker", "exec", container, "claude", "mcp", "list"],
        capture_output=True, text=True, timeout=30,
    )
    print(result.stdout)


def cmd_import_agents(client: PaperclipClient, args):
    """Import all agents into the specified company."""
    company_name = args.company_name
    data_dir = args.data_dir
    dry_run = args.dry_run

    print(f"\n{'[DRY RUN] ' if dry_run else ''}=== Importing Agents into: {company_name} ===\n")

    # 1. Find company
    company = client.find_company(company_name)
    if not company:
        print(f"  ERROR: Company '{company_name}' not found.\n", file=sys.stderr)
        print("  Available companies:", file=sys.stderr)
        for c in client.list_companies():
            print(f"    - {c['name']} (id: {c['id']})", file=sys.stderr)
        sys.exit(1)

    company_id = company["id"]
    print(f"  Company: {company['name']} ({company_id})")

    # 2. Check existing agents
    existing = client.list_agents(company_id)
    existing_names = {a["name"].lower() for a in existing}
    print(f"  Existing agents: {len(existing)}")

    # 3. Scan for skills
    print(f"  Scanning for skills...")
    if not dry_run:
        try:
            client.scan_skills(company_id)
            print("  Skills scanned")
        except Exception:
            print("  Warning: skill scan failed")

    # 4. Seed document tree
    print(f"  Seeding document tree...")
    if not dry_run:
        try:
            result = client.seed_doc_tree(company_id)
            print(f"  Doc tree: {'seeded' if result.get('seeded') else 'already exists'}")
        except Exception:
            print("  Warning: doc tree seed failed")

    # 5. Create agents in hierarchy order
    ordered = resolve_agent_order(AGENTS)
    agent_id_map = {}
    for a in existing:
        agent_id_map[a["name"]] = a["id"]

    print(f"\n  Creating {len(ordered)} agents...\n")

    for agent_def in ordered:
        name = agent_def["name"]
        display = f"{name} ({agent_def['role']})"

        if name.lower() in existing_names:
            print(f"  SKIP  {display} — already exists")
            continue

        reports_to_id = None
        if agent_def["reports_to"]:
            reports_to_id = agent_id_map.get(agent_def["reports_to"])

        create_body = {
            "name": name,
            "role": agent_def["role"],
            "title": agent_def.get("title"),
            "icon": agent_def.get("icon"),
            "reportsTo": reports_to_id,
            "adapterType": agent_def.get("adapter_type", "claude_local"),
            "desiredSkills": agent_def.get("desired_skills", []),
        }

        if dry_run:
            print(f"  CREATE {display}")
            print(f"         reports_to: {agent_def['reports_to'] or 'none'}")
            print(f"         skills: {', '.join(agent_def.get('desired_skills', []))}")
            agent_id_map[name] = f"dry-run-{name}"
            continue

        try:
            result = client.create_agent(company_id, create_body)
            agent_id = result["id"]
            agent_id_map[name] = agent_id
            print(f"  OK    {display} -> {agent_id}")

            if agent_def.get("permissions"):
                try:
                    client.update_permissions(agent_id, agent_def["permissions"])
                except Exception:
                    print(f"         WARN: permissions failed")

            if agent_def.get("desired_skills"):
                try:
                    client.sync_skills(agent_id, agent_def["desired_skills"])
                except Exception:
                    print(f"         WARN: skill sync failed")

        except Exception as e:
            print(f"  FAIL  {display}: {e}", file=sys.stderr)

    # 6. Summary
    print(f"\n{'[DRY RUN] ' if dry_run else ''}Import complete.")
    print(f"  Company: {company_name} ({company_id})")
    print(f"  Agent ID mapping:")
    for name, aid in agent_id_map.items():
        print(f"    {name}: {aid}")

    # 7. Workspace file instructions
    if data_dir:
        workspace_dir = os.path.join(data_dir, "agent-workspaces")
        if os.path.isdir(workspace_dir):
            has_files = []
            for d in os.listdir(workspace_dir):
                full = os.path.join(workspace_dir, d)
                if os.path.isdir(full):
                    files = [f for f in os.listdir(full) if f != ".gitkeep"]
                    if files or any(os.path.isdir(os.path.join(full, s)) for s in os.listdir(full)):
                        has_files.append(d)
            if has_files:
                print(f"\n  Agents with workspace files: {', '.join(has_files)}")
                print(f"  Copy them to the target server:")
                for d in has_files:
                    agent_name = d.split("-")[0]
                    aid = agent_id_map.get(agent_name, "<AGENT_ID>")
                    print(f"    scp -r {workspace_dir}/{d}/* target:/paperclip/instances/default/workspaces/{aid}/")


def cmd_setup_google(args):
    """Configure Google Workspace OAuth credentials."""
    container = args.container_name

    client_secret = {
        "installed": {
            "client_id": args.client_id,
            "project_id": args.project_id or "paperclip-workspace",
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
            "client_secret": args.client_secret,
            "redirect_uris": ["http://localhost"],
        }
    }

    print("\n=== Setting Up Google Workspace ===\n")

    json_str = json.dumps(client_secret)

    if args.ssh_host:
        print(f"  Target: {args.ssh_host} (container: {container})")
        ssh_run(args.ssh_host, f"mkdir -p /home/dev/gws-config")
        with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
            f.write(json_str)
            tmp = f.name
        scp_to(args.ssh_host, tmp, "/home/dev/gws-config/client_secret.json")
        os.unlink(tmp)
    else:
        print(f"  Target: localhost (container: {container})")
        os.makedirs("/home/dev/gws-config", exist_ok=True)
        with open("/home/dev/gws-config/client_secret.json", "w") as f:
            f.write(json_str)

    print("  client_secret.json written")

    # Generate OAuth URL
    scopes = " ".join([
        "https://www.googleapis.com/auth/drive",
        "https://www.googleapis.com/auth/spreadsheets",
        "https://www.googleapis.com/auth/gmail.modify",
        "https://www.googleapis.com/auth/calendar",
        "https://www.googleapis.com/auth/documents",
        "https://www.googleapis.com/auth/presentations",
        "https://www.googleapis.com/auth/tasks",
    ])
    oauth_url = (
        f"https://accounts.google.com/o/oauth2/auth"
        f"?client_id={args.client_id}"
        f"&redirect_uri=http://localhost"
        f"&response_type=code"
        f"&scope={urllib.parse.quote(scopes)}"
        f"&access_type=offline"
        f"&prompt=consent"
    )
    print(f"\n  Open this URL in your browser to authorize:\n")
    print(f"  {oauth_url}\n")
    print(f"  After authorizing, your browser redirects to http://localhost/?code=XXXX")
    print(f"  Copy the code value and run:\n")
    print(f"  python3 paperclip_cli.py --api-url <url> --api-key <key> exchange-google-token \\")
    print(f"    --client-id {args.client_id} \\")
    print(f"    --client-secret {args.client_secret} \\")
    print(f"    --code YOUR_CODE_HERE")
    if args.ssh_host:
        print(f"    --ssh-host {args.ssh_host}")


def cmd_exchange_google_token(args):
    """Exchange OAuth code for tokens and save to container."""
    container = args.container_name

    print("\n=== Exchanging Google OAuth Token ===\n")

    data = urllib.parse.urlencode({
        "code": args.code,
        "client_id": args.client_id,
        "client_secret": args.client_secret,
        "redirect_uri": "http://localhost",
        "grant_type": "authorization_code",
    }).encode()

    req = urllib.request.Request("https://oauth2.googleapis.com/token", data=data, method="POST")
    try:
        with urllib.request.urlopen(req) as resp:
            token_data = json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        print(f"  ERROR: Token exchange failed: {e.read().decode()}", file=sys.stderr)
        sys.exit(1)

    if "error" in token_data:
        print(f"  ERROR: {token_data['error']}: {token_data.get('error_description', '')}", file=sys.stderr)
        sys.exit(1)

    creds = {
        "type": "authorized_user",
        "client_id": args.client_id,
        "client_secret": args.client_secret,
        "refresh_token": token_data["refresh_token"],
    }

    json_str = json.dumps(creds)

    if args.ssh_host:
        with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
            f.write(json_str)
            tmp = f.name
        scp_to(args.ssh_host, tmp, "/home/dev/gws-config/tokens.json")
        os.unlink(tmp)
    else:
        os.makedirs("/home/dev/gws-config", exist_ok=True)
        with open("/home/dev/gws-config/tokens.json", "w") as f:
            f.write(json_str)

    print(f"  Google tokens saved.")
    print(f"  Scopes: Drive, Sheets, Gmail, Calendar, Docs, Slides, Tasks")
    print(f"  Refresh token persisted — access tokens auto-renew.")


def cmd_setup_all(client: PaperclipClient, args):
    """Run full setup: infrastructure + MCP + agents + doc tree."""
    print("\n" + "=" * 60)
    print("  Vita AI — Full Paperclip Setup")
    print("=" * 60)

    # Step 1: Infrastructure
    cmd_setup_infra(args)

    # Step 2: MCP servers
    print()
    cmd_setup_mcp(args)

    # Step 3: Import agents
    if args.company_name:
        print()
        cmd_import_agents(client, args)
    else:
        print("\n  Skipping agent import (no --company-name provided)")

    # Step 4: Google Workspace
    if args.google_client_id and args.google_client_secret:
        print()
        # Create a namespace for google args
        class GoogleArgs:
            client_id = args.google_client_id
            client_secret = args.google_client_secret
            project_id = ""
            ssh_host = args.ssh_host
            container_name = args.container_name
        cmd_setup_google(GoogleArgs())
    else:
        print("\n  Skipping Google Workspace setup (no --google-client-id provided)")

    print("\n" + "=" * 60)
    print("  Setup complete. Rebuild the container to apply changes:")
    if args.ssh_host:
        print(f"    ssh {args.ssh_host} '/home/dev/paperclip-rebuild.sh'")
    else:
        print("    /home/dev/paperclip-rebuild.sh")
    print("=" * 60)


def cmd_list_agents(client: PaperclipClient, company_name: str):
    company = client.find_company(company_name)
    if not company:
        print(f"ERROR: Company '{company_name}' not found.", file=sys.stderr)
        sys.exit(1)

    agents = client.list_agents(company["id"])
    print(f"\nAgents in '{company_name}' ({len(agents)}):\n")
    print(f"  {'Name':<25} {'Role':<12} {'Status':<15} {'ID'}")
    print(f"  {'─' * 25} {'─' * 12} {'─' * 15} {'─' * 36}")
    for a in agents:
        print(f"  {a['name']:<25} {a.get('role', ''):<12} {a.get('status', ''):<15} {a['id']}")


def cmd_list_companies(client: PaperclipClient):
    companies = client.list_companies()
    print(f"\nCompanies ({len(companies)}):\n")
    print(f"  {'Name':<30} {'Prefix':<10} {'ID'}")
    print(f"  {'─' * 30} {'─' * 10} {'─' * 36}")
    for c in companies:
        print(f"  {c['name']:<30} {c.get('issuePrefix', ''):<10} {c['id']}")


# ─────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Paperclip CLI — Full setup and migration for Vita AI",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("--api-url", default="http://localhost:3100", help="Paperclip API URL")
    parser.add_argument("--api-key", default="", help="Board API key")

    sub = parser.add_subparsers(dest="command", required=True)

    # setup-all
    sa = sub.add_parser("setup-all", help="Full setup: infra + MCP + agents + Google")
    sa.add_argument("--company-name", help="Target company name for agent import")
    sa.add_argument("--ssh-host", help="SSH host (user@host) for remote setup")
    sa.add_argument("--repo-dir", default=".", help="Path to vita-infrastructure repo")
    sa.add_argument("--container-name", default="external-paperclip_server_1")
    sa.add_argument("--data-dir", default="./paperclip/data-exports")
    sa.add_argument("--dry-run", action="store_true")
    sa.add_argument("--google-client-id", help="Google OAuth Client ID")
    sa.add_argument("--google-client-secret", help="Google OAuth Client Secret")

    # setup-infra
    si = sub.add_parser("setup-infra", help="Deploy RAG infrastructure (Neo4j + Graphiti)")
    si.add_argument("--ssh-host", help="SSH host for remote setup")
    si.add_argument("--repo-dir", default=".", help="Path to vita-infrastructure repo")
    si.add_argument("--container-name", default="external-paperclip_server_1")

    # setup-mcp
    sm = sub.add_parser("setup-mcp", help="Configure MCP servers in Claude Code")
    sm.add_argument("--container-name", default="external-paperclip_server_1")

    # import-agents
    ia = sub.add_parser("import-agents", help="Import agents into a company")
    ia.add_argument("--company-name", required=True)
    ia.add_argument("--data-dir", default="./paperclip/data-exports")
    ia.add_argument("--dry-run", action="store_true")

    # list-agents
    la = sub.add_parser("list-agents", help="List agents in a company")
    la.add_argument("--company-name", required=True)

    # list-companies
    sub.add_parser("list-companies", help="List all companies")

    # setup-google
    sg = sub.add_parser("setup-google", help="Configure Google Workspace OAuth")
    sg.add_argument("--client-id", required=True)
    sg.add_argument("--client-secret", required=True)
    sg.add_argument("--project-id", default="")
    sg.add_argument("--ssh-host")
    sg.add_argument("--container-name", default="external-paperclip_server_1")

    # exchange-google-token
    et = sub.add_parser("exchange-google-token", help="Exchange Google OAuth code for tokens")
    et.add_argument("--client-id", required=True)
    et.add_argument("--client-secret", required=True)
    et.add_argument("--code", required=True)
    et.add_argument("--ssh-host")
    et.add_argument("--container-name", default="external-paperclip_server_1")

    args = parser.parse_args()
    client = PaperclipClient(args.api_url, args.api_key)

    if args.command == "setup-all":
        cmd_setup_all(client, args)
    elif args.command == "setup-infra":
        cmd_setup_infra(args)
    elif args.command == "setup-mcp":
        cmd_setup_mcp(args)
    elif args.command == "import-agents":
        cmd_import_agents(client, args)
    elif args.command == "list-agents":
        cmd_list_agents(client, args.company_name)
    elif args.command == "list-companies":
        cmd_list_companies(client)
    elif args.command == "setup-google":
        cmd_setup_google(args)
    elif args.command == "exchange-google-token":
        cmd_exchange_google_token(args)


if __name__ == "__main__":
    main()
