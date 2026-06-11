import requests

ELEVENLABS_URL = "https://api.elevenlabs.io/v1/text-to-speech/pNInz6obpgDQGcFmaJgB"


def synthesize(text: str) -> bytes:
    resp = requests.post(ELEVENLABS_URL, json={"text": text})
    resp.raise_for_status()
    return resp.content
