"""Deterministic compatibility and fail-closed tests; no OAuth or remote calls."""
import contextlib
import copy
import io
import json
import os
from pathlib import Path
import runpy
import subprocess
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "scripts/hyperagent"
CLI = SOURCE / "hyperagent.py"


class HyperagentCliTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.directory = Path(self.temp.name)
        self.path = self.directory / "models.json"
        self.document = json.loads((SOURCE / "models.json").read_text())
        self.path.write_text(json.dumps(self.document))
        self.environment = patch.dict(os.environ, {"HYPERAGENT_MODELS_FILE": str(self.path)})
        self.environment.start()
        self.addCleanup(self.environment.stop)
        self.api = runpy.run_path(str(CLI))
        self.globals = self.api["main"].__globals__

    def main(self, args):
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = self.api["main"](args)
        return code, out.getvalue(), err.getvalue()

    def write(self, document):
        self.path.write_text(json.dumps(document))

    def test_models_json_preserves_probe_shape_and_shipping_role(self):
        code, out, _ = self.main(["models", "--json"])
        self.assertEqual(code, 0)
        self.assertEqual(json.loads(out), {"models": {key: {} for key, value in self.document["models"].items()
                                                    if value["role"] == "coding"}})
        self.assertEqual(set(json.loads(out)["models"]),
                         {"z-ai/glm-5.3", "z-ai/glm-5.3-flash", "moonshotai/kimi-k3"})
        code, out, _ = self.main(["models", "--json", "--role", "research"])
        self.assertEqual(code, 0)
        self.assertEqual(set(json.loads(out)["models"]), set(self.document["models"]))
        code, out, _ = self.main(["models", "--role", "research"])
        self.assertEqual(json.loads(out)["models"]["fable-5.1"]["role"], "research")
        self.assertEqual(self.api["resolve_agent"]("z-ai/glm-5.3", None),
                         ("cmtj3n2q901i407adklzzq01t", "GLM 5.3 Developer"))

    def test_environment_mapping_replaces_bundled_mapping_without_fallback(self):
        self.document["models"]["z-ai/glm-5.3"]["agent_id"] = "c" * 25
        self.write(self.document)
        self.assertEqual(self.api["resolve_agent"]("z-ai/glm-5.3", None)[0], "c" * 25)
        self.document["models"].pop("z-ai/glm-5.3")
        self.write(self.document)
        with self.assertRaises(self.api["MappingError"]):
            self.api["resolve_agent"]("z-ai/glm-5.3", None)

    def test_bad_configuration_fails_before_network(self):
        invalid = [None, [], {}, {**self.document, "schema": "v0"},
                   {**self.document, "extra": True}, {**self.document, "models": {}},
                   {**self.document, "models": []}, {**self.document, "models": {"UPPER": {}}}]
        for field, values in {
            "agent_id": [None, "", "whitespace id", "c" * 26, 4],
            "agent_name": [None, "", " spaced ", "line\nbreak", "a" * 101],
            "role": [None, "ship", [], {"coding": True}],
        }.items():
            for value in values:
                document = copy.deepcopy(self.document)
                document["models"]["z-ai/glm-5.3"][field] = value
                invalid.append(document)
        for value in [None, [], {}, {"agent_id": "c" * 25},
                      {**self.document["models"]["z-ai/glm-5.3"], "model": "invented"}]:
            document = copy.deepcopy(self.document)
            document["models"]["z-ai/glm-5.3"] = value
            invalid.append(document)
        duplicate = copy.deepcopy(self.document)
        duplicate["models"]["z-ai/glm-5.3-flash"]["agent_id"] = duplicate["models"]["z-ai/glm-5.3"]["agent_id"]
        invalid.append(duplicate)
        with patch.dict(self.globals, mcp_call=unittest.mock.Mock(side_effect=AssertionError("network"))):
            for document in invalid:
                with self.subTest(document=document):
                    self.write(document)
                    self.assertEqual(self.main(["models", "--json"])[0], 78)
                    self.assertEqual(self.main(["--model", "z-ai/glm-5.3", "-p", "test"])[0], 78)
        for raw in ['{', '{"schema":"x","schema":"y"}',
                    '{"schema":"jovie-hyperagent-models/v1","models":{"x":{},"x":{}}}']:
            self.path.write_text(raw)
            self.assertEqual(self.main(["models", "--json"])[0], 78)
        self.path.unlink()
        self.assertEqual(self.main(["models", "--json"])[0], 78)
        with patch.dict(os.environ, HYPERAGENT_MODELS_FILE=""):
            self.assertEqual(self.main(["models", "--json"])[0], 78)

    def test_unsafe_resolution_and_overrides_fail_closed(self):
        with patch.dict(self.globals, mcp_call=unittest.mock.Mock(side_effect=AssertionError("network"))):
            for model, override, role in [
                ("unknown", None, "coding"), ("unknown", "cmtj3n2q901i407adklzzq01t", "coding"),
                ("z-ai/glm-5.3", "cmuk33ew70r2e06adfqx6gbpy", "coding"),
                ("fable-5.1", None, "coding"), ("astra", None, "coding"),
                ("grok-4.7", None, "coding"), ("fable-5.1", "cmtj3n2q901i407adklzzq01t", "research"),
                ("z-ai/glm-5.3", "", "coding"),
            ]:
                with self.subTest(model=model, override=override, role=role):
                    args = ["execute", "--model", model, "--role", role, "-p", "test"]
                    if override is not None:
                        args += ["--agent-id", override]
                    self.assertEqual(self.main(args)[0], 78)
            with self.assertRaises(self.api["MappingError"]):
                self.api["resolve_agent"]("z-ai/glm-5.3", None, "unknown")

    def test_every_mapping_executes_with_configured_agent_and_no_model_argument(self):
        for model, spec in self.document["models"].items():
            with self.subTest(model=model):
                call = unittest.mock.Mock(side_effect=[{"threadId": "existing-thread"},
                    {"isRunning": False, "messages": [{"role": "assistant", "content": "done"}]}])
                with patch.dict(self.globals, mcp_call=call):
                    code, out, _ = self.main(["execute", "--model", model, "--agent-id", spec["agent_id"],
                                             "--role", spec["role"], "--json", "-p", "test"])
                self.assertEqual(code, 0)
                self.assertEqual(json.loads(out)["agent_id"], spec["agent_id"])
                self.assertEqual(call.call_args_list[0].args, ("create_thread", {
                    "agentId": spec["agent_id"], "message": "test",
                    "namingHint": f'Gem {spec["agent_name"]} {model}'[:80]}))
                self.assertEqual(call.call_args_list[1].args, ("get_thread", {"threadId": "existing-thread", "messageLimit": 50}))

    def test_importable_mcp_transport_keeps_protocol_and_session(self):
        requests = []
        def http(url, payload, headers, timeout):
            requests.append((url, payload, headers, timeout))
            if payload["method"] == "initialize":
                return 200, {"Mcp-Session-Id": "session-1"}, {"result": {}}
            if payload["method"] == "notifications/initialized":
                return 202, {}, {}
            return 200, {}, {"result": {"content": [{"text": '{"agents": []}'}]}}
        # Configuration does not prevent the lane from importing transport.
        self.path.unlink()
        with patch.dict(self.globals, access_token=lambda: "fixture-token", http_json=http):
            self.assertEqual(self.api["mcp_call"]("list_agents", {}, timeout=17), {"agents": []})
        self.assertEqual([x[1]["method"] for x in requests],
                         ["initialize", "notifications/initialized", "tools/call"])
        self.assertEqual(requests[2][1]["params"], {"name": "list_agents", "arguments": {}})
        self.assertEqual(requests[2][2]["Mcp-Session-Id"], "session-1")
        self.assertEqual(requests[2][2]["MCP-Protocol-Version"], "2025-03-26")
        self.assertEqual(requests[2][3], 17)

    def test_existing_reason_commands_have_valid_models_overrides_and_roles(self):
        config = json.loads((ROOT / "scripts/lanes/reason.json").read_text())
        specs = [*config["reviewers"], config["research"], config["researchEscalation"]]
        for spec in specs:
            cmd = spec["cmd"]
            if cmd[0] != "hyperagent":
                continue
            model = cmd[cmd.index("--model") + 1]
            agent = cmd[cmd.index("--agent-id") + 1]
            role = cmd[cmd.index("--role") + 1]
            self.assertEqual(role, "research")
            self.assertEqual(self.api["resolve_agent"](model, agent, role)[0], agent)

    def test_execute_retains_approval_empty_timeout_and_error_outcomes(self):
        for payload, expected in [({"awaitingApproval": True}, 2),
                                  ({"isRunning": False}, 2),
                                  ({"messages": [{"role": "assistant", "content": "answer"}]}, 0)]:
            call = unittest.mock.Mock(side_effect=[{"threadId": "thread"}, payload])
            with patch.dict(self.globals, mcp_call=call):
                self.assertEqual(self.main(["--model", "z-ai/glm-5.3", "-p", "test"])[0], expected)
        with patch.dict(self.globals, mcp_call=lambda *a: {}):
            self.assertEqual(self.main(["--model", "z-ai/glm-5.3", "-p", "test"])[0], 2)
        with patch.dict(self.globals, mcp_call=lambda *a: {"threadId": "thread"}):
            self.assertEqual(self.main(["--model", "z-ai/glm-5.3", "-p", "test", "--timeout", "0"])[0], 2)
        with patch.dict(self.globals, mcp_call=unittest.mock.Mock(side_effect=RuntimeError("missing Hyperagent MCP token"))):
            self.assertEqual(self.main(["--model", "z-ai/glm-5.3", "-p", "test"])[0], 78)
        self.assertEqual(self.main(["execute"])[0], 2)
        self.assertEqual(self.main(["help"])[0], 0)
        self.assertEqual(self.main(["unknown"])[0], 2)
        self.assertIsNone(self.api["last_assistant_text"]({}))
        self.assertEqual(self.api["last_assistant_text"]({"messages": [None, {"role": "user"},
            {"role": "assistant", "content": None}, {"role": "assistant", "content": "[2 tool calls]"},
            {"role": "assistant", "content": "answer"}]}), "answer")

    def test_transport_rejects_bad_responses_and_preserves_text_envelopes(self):
        for body in [{"error": {"message": "denied"}}, [], {}, {"result": {"isError": True}}]:
            http = unittest.mock.Mock(side_effect=[(200, {}, {"result": {}}), (202, {}, {}), (200, {}, body)])
            with patch.dict(self.globals, access_token=lambda: "fixture", http_json=http):
                with self.assertRaises(RuntimeError):
                    self.api["mcp_call"]("list_agents")
        for result, expected in [({}, {}), ({"content": [{"text": "memo"}]}, {"text": "memo"}),
                                 ({"content": [{}]}, {"content": [{}]}),
                                 ({"content": [{"text": "[]"}]}, {"content": [{"text": "[]"}]})]:
            http = unittest.mock.Mock(side_effect=[(200, {}, {"result": {}}), RuntimeError("notify"), (200, {}, {"result": result})])
            with patch.dict(self.globals, access_token=lambda: "fixture", http_json=http):
                self.assertEqual(self.api["mcp_call"]("list_agents"), expected)
        with patch.dict(self.globals, access_token=lambda: "fixture", http_json=lambda *a, **kw: (500, {}, {})):
            with self.assertRaises(RuntimeError):
                self.api["mcp_call"]("list_agents")

    def test_token_storage_and_refresh_preserve_existing_scope(self):
        import urllib.request
        oauth = self.directory / "oauth"
        with patch.dict(os.environ, HYPERAGENT_CONFIG_DIR=str(oauth), HYPERAGENT_MCP_TOKEN=""):
            self.assertEqual(self.api["client_path"](), oauth / "mcp-oauth-client.json")
            token = self.api["token_path"]()
            self.assertEqual(token, oauth / "mcp-oauth.json")
            self.assertEqual(self.api["token_bundle"](), {})
            with self.assertRaises(RuntimeError):
                self.api["access_token"]()
            bundle = {"access_token": "fixture", "refresh_token": "refresh", "client_id": "client", "scope": "existing-scope"}
            self.api["save_json"](token, bundle)
            self.assertEqual(self.api["access_token"](), "fixture")
            self.assertFalse(self.api["token_expired"](bundle))
            self.assertTrue(self.api["token_expired"]({}))
            self.assertEqual(self.api["refresh_bundle"]({}), {})
            response = unittest.mock.MagicMock()
            response.__enter__.return_value.read.return_value = b'{"access_token":"new","expires_in":3600}'
            with patch.object(urllib.request, "urlopen", return_value=response) as request:
                refreshed = self.api["refresh_bundle"](bundle)
            self.assertEqual(refreshed["scope"], "existing-scope")
            self.assertEqual(self.api["load_json"](token), refreshed)
            self.assertNotIn(b"scope=", request.call_args.args[0].data)
            self.assertEqual(token.stat().st_mode & 0o777, 0o600)
            self.api["save_json"](token, {**bundle, "obtained_at": 1, "expires_in": 1})
            with patch.dict(self.globals, refresh_bundle=unittest.mock.Mock(side_effect=RuntimeError("offline"))):
                with self.assertRaisesRegex(RuntimeError, "refresh failed"):
                    self.api["access_token"]()
            token.write_text("[]")
            self.assertEqual(self.api["load_json"](token), {})
            token.write_text("{")
            self.assertEqual(self.api["load_json"](token), {})
        with patch.dict(os.environ, HYPERAGENT_MCP_TOKEN="fixture-env"):
            self.assertEqual(self.api["access_token"](), "fixture-env")

    def test_login_keeps_registration_scope_and_oauth_files(self):
        import http.server
        import threading
        import urllib.parse
        import urllib.request
        import webbrowser
        oauth = self.directory / "login"
        server = unittest.mock.Mock()
        browser_urls = []
        def make_server(address, handler):
            server.handler = handler
            return server
        def callback(**kwargs):
            query = urllib.parse.parse_qs(urllib.parse.urlparse(browser_urls[0]).query)
            handler = server.handler.__new__(server.handler)
            handler.path = "/?code=fixture&state=" + query["state"][0]
            handler.send_response = handler.send_header = handler.end_headers = unittest.mock.Mock()
            handler.wfile = io.BytesIO()
            handler.do_GET()
        thread = unittest.mock.Mock()
        thread.join.side_effect = callback
        response = unittest.mock.MagicMock()
        response.__enter__.return_value.read.return_value = b'{"access_token":"hat_fixture","scope":"existing-scope"}'
        with patch.dict(os.environ, HYPERAGENT_CONFIG_DIR=str(oauth)), \
                patch.dict(self.globals, http_json=lambda *a: (200, {}, {"client_id": "client"})), \
                patch.object(http.server, "HTTPServer", side_effect=make_server), \
                patch.object(threading, "Thread", return_value=thread), \
                patch.object(webbrowser, "open", side_effect=lambda url, **kw: browser_urls.append(url)), \
                patch.object(urllib.request, "urlopen", return_value=response):
            self.assertEqual(self.main(["login"])[0], 0)
        self.assertEqual(json.loads((oauth / "mcp-oauth-client.json").read_text())["scope"], self.api["SCOPE"])
        self.assertEqual(json.loads((oauth / "mcp-oauth.json").read_text())["scope"], "existing-scope")
        self.assertEqual(urllib.parse.parse_qs(urllib.parse.urlparse(browser_urls[0]).query)["scope"], [self.api["SCOPE"]])
        self.assertEqual((oauth / "mcp-oauth.json").stat().st_mode & 0o777, 0o600)

    def test_install_and_reinstall_preserve_oauth_files_modes_and_scopes(self):
        oauth = self.directory / "oauth"
        oauth.mkdir(mode=0o700)
        files = {}
        for name in ("mcp-oauth.json", "mcp-oauth-client.json"):
            path = oauth / name
            path.write_text(json.dumps({"scope": self.api["SCOPE"], "fixture": name}))
            path.chmod(0o600)
            files[path] = (path.read_bytes(), path.stat().st_mode)
        prefix = self.directory / "prefix"
        binary = prefix / "bin/hyperagent"
        binary.parent.mkdir(parents=True)
        binary.write_text("legacy CLI")
        installer = runpy.run_path(str(SOURCE / "install.py"))["install"]
        with patch.dict(os.environ, HYPERAGENT_CONFIG_DIR=str(oauth), HYPERAGENT_MCP_TOKEN_FILE=str(oauth / "mcp-oauth.json")):
            for _ in range(2):
                self.assertEqual(installer(prefix), binary)
                env = dict(os.environ)
                env.pop("HYPERAGENT_MODELS_FILE")
                result = subprocess.run([str(binary), "models", "--json"], env=env, capture_output=True, text=True, check=True)
                self.assertEqual(len(json.loads(result.stdout)["models"]), 3)
                imported = runpy.run_path(str(binary))
                self.assertTrue(callable(imported["mcp_call"]))
                self.assertEqual(imported["SCOPE"], "threads:read threads:write approvals:read approvals:write offline_access")
        for path, before in files.items():
            self.assertEqual((path.read_bytes(), path.stat().st_mode), before)
        self.assertEqual(oauth.stat().st_mode & 0o777, 0o700)


if __name__ == "__main__":
    unittest.main()
