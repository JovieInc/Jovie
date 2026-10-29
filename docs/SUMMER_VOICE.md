# Summer voice (Ovie composer, web and Mac)

Status: client, routes and tests shipped; NOT yet verified live. Live use needs the ElevenLabs agent below (one-time, uses the existing `ELEVENLABS_API_KEY` in jovie-web prd) and `ELEVENLABS_SUMMER_AGENT_ID` set in the Ovie environment.

## Provider decision (2026-10-25)
- OpenAI Realtime: excluded. JOV-7119 bans per-token OpenAI/Anthropic API billing on any path, and no OpenAI key exists in Doppler.
- ElevenLabs Agents: chosen. `ELEVENLABS_API_KEY` already exists (jovie-web prd); $0.08/min list, LLM currently absorbed (`lib/voice-stack-bake-off/cost-model.ts`: ~$0.10/min fully loaded without telephony). Server tool or client tool, signed WebSocket URL minted server-side.
- xAI Voice Agent: cheaper on paper ($0.05/min, beta), key exists only in jovie-web dev; kept as the alternative behind `lib/voice-gateway` (`selectRealtimeProvider`). Re-evaluate with a live bake-off once both can be called with real audio.
- Latency and barge-in are vendor claims, not measured by us (no audio test harness with restricted keys). The client measures final-transcript to first-audio per turn (`VoiceLatencyTracker`) and shows the last turn in the composer.

## Architecture
mic -> ElevenLabs agent (STT, turn-taking, barge-in, TTS) -> client tool `ask_summer` -> browser POST `/api/ovie/summer-voice/ask` (founder session) -> Summer `/ovie/v1/summer-chat/stream` (mode voice; Kimi K3.1 Pro for planning) -> text back to the agent, spoken.
The agent knows no company facts; grounding stays in Summer. The provider API key never reaches the browser (`/api/ovie/summer-voice/session` returns a signed `wss://` URL).

## One-time agent setup (ElevenLabs dashboard or API)
1. Create an agent named "Summer". System prompt: `SUMMER_VOICE_PROMPT` and first message `SUMMER_VOICE_FIRST_MESSAGE` from `lib/ovie/summer-voice.ts`. Pick a fast low-latency LLM and a clear voice.
2. Add the client tool `SUMMER_VOICE_AGENT_TOOL` (name `ask_summer`, param `question`, waits for the response).
3. Turn on interruptions; allow signed-URL (private) connections.
4. Set `ELEVENLABS_SUMMER_AGENT_ID` for the Ovie project.

## Mac
The Mac app is the Electron shell loading Ovie; `apps/desktop/src/desktop-permissions.ts` already grants audio-only media permission to the trusted app origin, so the same web voice control runs there. Ovie's CSP allows `api.elevenlabs.io` (https and wss).
