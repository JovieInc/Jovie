"""Public single resolve example. Python 3.9+, standard library only."""
import argparse
import json
import urllib.error
import urllib.request


def resolve_music(input_value, *, kind="artist", artist=None, territory=None,
                  base_url="https://jov.ie"):
    payload = {"input": input_value, "kind": kind}
    if artist is not None:
        payload["artist"] = artist
    if territory is not None:
        payload["territory"] = territory
    request = urllib.request.Request(
        base_url.rstrip("/") + "/api/v1/music/resolve",
        data=json.dumps(payload).encode("utf-8"), method="POST",
        headers={"Content-Type": "application/json", "Accept": "application/json"},
    )
    try:
        response = urllib.request.urlopen(request, timeout=55)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        result = json.load(response)
        if "error" in result:
            failure = result["error"]
            raise RuntimeError(
                f"{failure['code']} (HTTP {response.status}, "
                f"retryable={failure['retryable']}, "
                f"request={response.headers.get('X-Request-Id')}, "
                f"retryAfter={response.headers.get('Retry-After')})"
            )
        if response.status != 200:
            raise RuntimeError(f"Unexpected HTTP {response.status}")
        return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input")
    parser.add_argument("--kind", choices=("artist", "track", "album"), default="artist")
    parser.add_argument("--artist")
    parser.add_argument("--territory")
    parser.add_argument("--base-url", default="https://jov.ie")
    arguments = parser.parse_args()
    try:
        print(json.dumps(resolve_music(
            arguments.input, kind=arguments.kind, artist=arguments.artist,
            territory=arguments.territory,
            base_url=arguments.base_url,
        ), ensure_ascii=False))
    except (RuntimeError, ValueError, urllib.error.URLError) as error:
        parser.exit(1, f"{error}\n")
