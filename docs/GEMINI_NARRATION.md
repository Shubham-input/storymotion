# Offline Gemini narration

StoryMotion generates narration during development and serves ordinary WAV files at
runtime. The deployed app does not call Gemini or expose an API key. If a generated
file is missing, stale, blocked or invalid, the player falls back to browser speech.

## Generate audio

1. Add the key to the ignored `.env.local` file:

   ```env
   GEMINI_API_KEY=your_key_here
   ```

2. Preview the jobs without using quota:

   ```bash
   npm run generate:narration:dry
   ```

3. Generate all stories:

   ```bash
   npm run generate:narration
   ```

The generator makes one request at a time, waits 12 seconds between requests, retries
temporary/rate-limit failures, writes each WAV atomically, and skips existing files.
It is safe to stop and rerun. Audio is written to `public/audio/narration/`, and the
caption-checked manifest is regenerated in
`src/data/stories/generatedNarrationManifest.ts`.

Useful options:

```bash
npm run generate:narration -- --story hare
npm run generate:narration -- --story pigs --limit 1
npm run generate:narration -- --story hare --force
npm run generate:narration -- --delay-ms 20000
```

`GEMINI_TTS_MODEL`, `GEMINI_TTS_VOICE`, and `GEMINI_TTS_DELAY_MS` can also be set in
`.env.local`. Generated files and the manifest should be committed for a reliable demo.
