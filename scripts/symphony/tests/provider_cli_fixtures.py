"""Offline installer/process fixtures; production has no qualification bypass."""
import json
from pathlib import Path
import sys


def install_fake_npm(root):
    fixture = root / "npm-fixture.json"
    fixture.write_text(json.dumps({"mode": "ok"}))
    directory = root / "npm-tools"
    directory.mkdir()
    npm = directory / "npm"
    native = '''#!PYTHON
import json, os, sys, time, signal
mode = MODE
version = VERSION
assert not any(k in os.environ for k in ['OPENAI_API_KEY', 'LINEAR_API_KEY', 'NPM_TOKEN', 'CODEX_ACCOUNTS_ROOT'])
if '--version' in sys.argv:
    print('codex-cli ' + ('wrong' if mode == 'version' else version))
elif 'app-server' in sys.argv:
    request = json.loads(sys.stdin.readline())
    assert request['method'] == 'initialize'
    assert request['params']['clientInfo']['name'] == 'symphony-cli-qualification'
    assert not os.path.exists(os.path.join(os.environ['HOME'], '.codex', 'auth.json'))
    assert os.path.isdir(os.environ['CODEX_HOME'])
    assert not os.path.exists(os.path.join(os.environ['CODEX_HOME'], 'auth.json'))
    if mode == 'ignoreterm': signal.signal(signal.SIGTERM, signal.SIG_IGN)
    if mode == 'exit': sys.exit(2)
    if mode == 'timeout': time.sleep(30)
    if mode == 'flood': print('x' * 70000, flush=True)
    if mode == 'malformed': print('not-json', flush=True)
    result = {'error': {'code': -1}} if mode == 'initialize' else {'result': {'userAgent': 'fixture-cli'}}
    print(json.dumps({'method': 'fixture-notification'}), flush=True)
    print(json.dumps({'id': 1, **result}), flush=True)
    time.sleep(30)
else:
    print('native-qualified ' + ' '.join(sys.argv[1:]))
'''.replace('PYTHON', sys.executable)
    npm.write_text(f'''#!{sys.executable}
import json, os, pathlib, sys
assert sys.argv[1:5] == ['ci', '--ignore-scripts', '--no-audit', '--no-fund']
user = pathlib.Path(next(arg.split('=', 1)[1] for arg in sys.argv if arg.startswith('--userconfig=')))
global_config = pathlib.Path(next(arg.split('=', 1)[1] for arg in sys.argv if arg.startswith('--globalconfig=')))
assert user != global_config and user.read_bytes() == global_config.read_bytes() == b''
assert '--fetch-retries=0' in sys.argv
assert not any(k in os.environ for k in ['OPENAI_API_KEY', 'LINEAR_API_KEY', 'NPM_TOKEN', 'NODE_OPTIONS'])
root = pathlib.Path.cwd()
assert os.environ['HOME'] == str(root)
mode = json.loads(pathlib.Path({str(fixture)!r}).read_text())['mode']
if mode == 'install': sys.exit(1)
lock = json.loads((root / 'package-lock.json').read_text())
version = lock['packages']['node_modules/@openai/codex']['version']
package = root / 'node_modules/@openai/codex-linux-x64'
package.mkdir(parents=True)
(package / 'package.json').write_text(json.dumps({{'version': version + '-linux-x64'}}))
binary = package / 'vendor/x86_64-unknown-linux-musl/bin/codex'
binary.parent.mkdir(parents=True)
binary.write_text({native!r}.replace('MODE', repr(mode)).replace('VERSION', repr(version)))
binary.chmod(0o755)
if mode == 'symlink':
    binary.rename(root / 'outside-binary')
    binary.symlink_to(root / 'outside-binary')
''')
    npm.chmod(0o755)
    return fixture, npm
