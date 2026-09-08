"""Qualify the reviewed npm lock in an isolated home; never use account auth."""
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import selectors
import shutil
import subprocess
import tempfile
import time

NATIVE_PACKAGE = "node_modules/@openai/codex-linux-x64"
NATIVE_BINARY = "vendor/x86_64-unknown-linux-musl/bin/codex"
INIT_TIMEOUT = 15
INSTALL_TIMEOUT = 180


def sha256(path):
    with path.open("rb") as stream:
        digest = hashlib.sha256()
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
        return digest.hexdigest()


def read_pin(source):
    package = json.loads((source / "package.json").read_text())
    lock = json.loads((source / "package-lock.json").read_text())
    version = package["dependencies"]["@openai/codex"]
    if not re.fullmatch(r"\d+\.\d+\.\d+", version):
        raise ValueError("Codex requires an exact stable version")
    packages = lock["packages"]
    wrapper = packages["node_modules/@openai/codex"]
    native = packages[NATIVE_PACKAGE]
    if (lock["lockfileVersion"] != 3 or package.get("scripts")
            or package["dependencies"] != {"@openai/codex": version}
            or packages[""]["dependencies"] != package["dependencies"]
            or wrapper["version"] != version
            or native["version"] != version + "-linux-x64"
            or wrapper["optionalDependencies"]["@openai/codex-linux-x64"]
            != "npm:@openai/codex@" + native["version"]):
        raise ValueError("Codex package and lock disagree")
    for name, item in packages.items():
        if not name:
            continue
        if (not re.fullmatch(r"node_modules/@openai/codex(?:-(?:linux|darwin|win32)-(?:x64|arm64))?", name)
                or item.get("hasInstallScript") or item.get("dependencies")
                or item["resolved"] != "https://registry.npmjs.org/@openai/codex/-/codex-" + item["version"] + ".tgz"
                or not item["integrity"].startswith("sha512-")
                or len(base64.b64decode(item["integrity"][7:], validate=True)) != 64):
            raise ValueError("Codex lock contains an unqualified package")
    return {"version": version, "platform": "linux-x64", "resolved": native["resolved"],
            "integrity": native["integrity"], "lock_sha256": sha256(source / "package-lock.json"),
            "package_sha256": sha256(source / "package.json")}


def clean_env(home, npm):
    # Keep node available for npm's shebang, without copying any auth/config env.
    path = os.pathsep.join([str(Path(npm).parent), os.defpath])
    return {"PATH": path, "HOME": str(home), "CODEX_HOME": str(home / "codex-home"),
            "TMPDIR": str(home), "LANG": "C.UTF-8"}


def initialize(binary, env, cwd):
    request = {"id": 1, "method": "initialize", "params": {
        "clientInfo": {"name": "symphony-cli-qualification", "version": "1"},
        "capabilities": {"experimentalApi": True}}}
    with subprocess.Popen([str(binary), "app-server"], cwd=cwd, env=env,
                          stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                          stderr=subprocess.DEVNULL) as process:
        try:
            process.stdin.write((json.dumps(request) + "\n").encode())
            process.stdin.flush()
            buffer = b""
            deadline = time.monotonic() + INIT_TIMEOUT
            with selectors.DefaultSelector() as selector:
                selector.register(process.stdout, selectors.EVENT_READ)
                while time.monotonic() < deadline:
                    if not selector.select(max(0, deadline - time.monotonic())):
                        break
                    chunk = os.read(process.stdout.fileno(), 4096)
                    if not chunk:
                        raise ValueError("Codex initialize exited before response")
                    buffer += chunk
                    if len(buffer) > 65536:
                        raise ValueError("Codex initialize response exceeded limit")
                    while b"\n" in buffer:
                        line, buffer = buffer.split(b"\n", 1)
                        response = json.loads(line)
                        if response.get("id") == 1:
                            result = response.get("result")
                            if not isinstance(result, dict) or not result.get("userAgent") or "error" in response:
                                raise ValueError("Codex initialize compatibility failed")
                            return
            raise ValueError("Codex initialize timed out")
        finally:
            process.terminate()
            try:
                process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()


def qualify(source, destination, pin):
    """Use npm's maintained SRI installer, then retain only the native binary."""
    npm = shutil.which("npm")
    if not npm:
        raise ValueError("npm is required to qualify the pinned Codex artifact")
    with tempfile.TemporaryDirectory(prefix=".codex-qualify-", dir=destination.parent) as directory:
        scratch = Path(directory)
        env = clean_env(scratch, npm)
        Path(env["CODEX_HOME"]).mkdir(mode=0o700)
        for name in ["package.json", "package-lock.json"]:
            shutil.copyfile(source / name, scratch / name)
        # No lifecycle scripts, user/global npmrc, ambient credentials, floating
        # version lookup, audit requests or shared npm installation/cache writes.
        user_config, global_config = scratch / "user.npmrc", scratch / "global.npmrc"
        user_config.touch()
        global_config.touch()
        result = subprocess.run([npm, "ci", "--ignore-scripts", "--no-audit", "--no-fund",
                                 "--include=optional", "--userconfig=" + str(user_config), "--globalconfig=" + str(global_config),
                                 "--cache=" + str(scratch / "npm-cache"), "--fetch-retries=0"],
                                cwd=scratch, env=env, stdout=subprocess.DEVNULL,
                                stderr=subprocess.DEVNULL, timeout=INSTALL_TIMEOUT)
        if result.returncode:
            raise ValueError("Codex pinned npm installation failed")
        native = scratch / NATIVE_PACKAGE
        binary = native / NATIVE_BINARY
        if (json.loads((native / "package.json").read_text())["version"] != pin["version"] + "-linux-x64"
                or binary.is_symlink() or not binary.is_file()
                or not binary.resolve().is_relative_to(native.resolve())):
            raise ValueError("Codex native artifact missing or inconsistent (requires Linux x64)")
        version = subprocess.run([str(binary), "--version"], cwd=scratch, env=env,
                                 capture_output=True, text=True, timeout=INIT_TIMEOUT)
        if version.returncode or version.stdout.strip() != "codex-cli " + pin["version"]:
            raise ValueError("Codex native version mismatch")
        initialize(binary, env, scratch)
        shutil.copyfile(binary, destination)
        destination.chmod(0o755)
    return {"pin": pin, "binary_sha256": sha256(destination),
            "qualification": "version-and-empty-home-initialize/v1"}
