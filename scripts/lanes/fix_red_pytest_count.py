"""Fail-closed resolution of pytest registration count conflicts."""
import re

from fix_red_conflict_resolvers import merge_pytest_file_list

def resolve_pytest_count_conflict(text: str, ours_list: str, theirs_list: str) -> str | None:
    """Resolve a count/assertion hunk only when both counts match their path lists."""
    union = merge_pytest_file_list(ours_list, theirs_list)
    if union is None:
        return None
    hunk = re.compile(r"^<<<<<<<[^\n]*\n(?P<ours>.*?)^=======\n(?P<theirs>.*?)^>>>>>>>[^\n]*\n", re.M | re.S)
    matches = list(hunk.finditer(text))
    if len(matches) != 1 or text.count('<<<<<<<') != 1 or text.count('>>>>>>>') != 1:
        return None
    paths = lambda line: line.split("'", 2)[1].split(' ')
    ours_paths, theirs_paths, all_paths = map(paths, (ours_list, theirs_list, union))
    count = re.compile(r"^(?P<indent>[ \t]*)expect\(LANES_PYTEST_FILES\)\.toHaveLength\((?P<count>\d+)\);\n")
    assertion = re.compile(r"[ \t]*expect\(whole\)\.toContain\('(scripts/tests/test_[A-Za-z0-9_]+\.py)'\);\n")
    def parse(side, allowed):
        match = count.match(side)
        if not match or int(match['count']) != len(allowed):
            return None
        tail = side[match.end():]
        rows = list(assertion.finditer(tail))
        if ''.join(row[0] for row in rows) != tail or any(row[1] not in allowed for row in rows):
            return None
        return match['indent'], [row[0] for row in rows]
    ours, theirs = parse(matches[0]['ours'], ours_paths), parse(matches[0]['theirs'], theirs_paths)
    if ours is None or theirs is None or ours[0] != theirs[0]:
        return None
    block = f"{theirs[0]}expect(LANES_PYTEST_FILES).toHaveLength({len(all_paths)});\n"
    block += ''.join(dict.fromkeys([*theirs[1], *ours[1]]))
    return text[:matches[0].start()] + block + text[matches[0].end():]


def resolve_pytest_count_file(worktree, path, conflicted, sh):
    """Bind the count hunk to the two actual Git index versions of its list."""
    list_path = "scripts/lib/ci-structural-shards.mjs"
    if path != "scripts/lib/__tests__/ci-fast-workflow-contract.test.mjs" or list_path not in conflicted:
        return None
    stage_lists = []
    for stage in (2, 3):
        source = sh(["git", "show", f":{stage}:{list_path}"], cwd=worktree)
        lines = re.findall(r"(?m)^[ \t]*'scripts/tests/test_[^\n]+\.split\(\n", source.stdout or "")
        if source.returncode or len(lines) != 1:
            return None
        stage_lists.append(lines[0])
    return resolve_pytest_count_conflict((worktree / path).read_text(), *stage_lists)
