# Acro Party: playable prototype

A party game where everyone makes up a phrase for random letters on their phone, votes for the funniest, and the top two face off in a lightning round. One TV or laptop is the host screen; phones are the controllers.

The prototype needs only **Node.js 18 or newer**. There is nothing to install with npm.

## Play it at home (same Wi-Fi)

1. Install Node.js from https://nodejs.org (the "LTS" version).
2. Unzip this folder somewhere, for example your Desktop.
3. Open a terminal in the folder:
   - **Mac:** open Terminal, type `cd ` (with a space), drag the folder into the window, press Enter.
   - **Windows:** open the folder, click the address bar, type `cmd`, press Enter.
4. Run:

   ```
   node server.js
   ```

5. On the laptop, open **http://localhost:3000/host**. Plug the laptop into the TV (HDMI) or cast the browser tab.
6. Pick **Kid-friendly** or **Adult**. Players scan the QR code, or type the address shown on screen into their phone's browser, then enter the room code.
7. Once 3 or more players are in, press **Start game**.

If your computer asks whether to allow incoming connections for Node, choose **Allow**. Phones must be on the same Wi-Fi as the laptop. Guest networks that isolate devices won't work.

To stop the server, press `Ctrl + C` in the terminal.

## Put it online (play from anywhere)

Any host that runs a Node web service works. For example, on Render:

1. Put this folder in a GitHub repository.
2. In Render, create a **Web Service** from that repository.
3. Set the build command to nothing (or `echo ok`) and the start command to `node server.js`.

Render sets the `PORT` variable automatically. On free plans, the server sleeps when idle, so the first visit can take about a minute to load.

## Turn on Ace's AI voice (ElevenLabs)

Ace can speak with a lifelike AI voice from ElevenLabs instead of the browser's built-in voice.

1. Sign up at https://elevenlabs.io, find **API Keys** in your account (under the developer settings), and create a key with Text to Speech access. Copy it.
2. In Render, open your service, go to **Environment**, click **Add Environment Variable**, and add:
   - Key: `ELEVENLABS_API_KEY`
   - Value: your key
3. Save. Render restarts the game. In the lobby, under **Sound and announcer**, the announcer is set to **🎙️ AI voice**.

Running on your laptop instead? Start it with the key in front: `ELEVENLABS_API_KEY=your-key node server.js` (Mac), or on Windows run `set ELEVENLABS_API_KEY=your-key` first and then `node server.js`.

Optional settings (also environment variables):

| Variable | Default | What it does |
| --- | --- | --- |
| `ELEVENLABS_VOICE_ID` | `nPczCjzI2devNBz1zQrb` (Brian, deep American narrator) | Any voice ID from your ElevenLabs voice library |
| `ELEVENLABS_MODEL` | `eleven_multilingual_v2` (most lifelike) | `eleven_flash_v2_5` is faster and cheaper |
| `ELEVENLABS_DAILY_CHAR_LIMIT` | `40000` | Safety cap on characters sent per day. A game uses about 3,000. |
| `ELEVENLABS_CONCURRENCY` | `2` | How many lines are generated at the same time. Raise it if your ElevenLabs plan allows more simultaneous requests. |

How it protects your credits: the key stays on the server, only the TV screen of a live room can request speech, every line is generated once and reused (repeated lines are free), and the daily cap stops runaway use. Requests wait in line (2 at a time by default) and are retried automatically if ElevenLabs is busy, so Ace stays in the AI voice. If a line still can't be generated (service down or cap reached), it appears as a caption only. Ace never switches to the robot voice mid-game.

## What's in the prototype

- Kid-friendly or Adult mode, chosen first. Kid mode turns on the naughty word filter for answers and nicknames, skips rude letter sets, and starts with +10 seconds of kids' extra time. Adult mode asks every player to confirm they're 18 or older.
- 5 to 8 rounds, set in the lobby. Letters go 3, 4, 5, 6, 7, then back to 3, 4, 5.
- **The clock waits for Ace.** Each round's letters are revealed while Ace announces them; the answer clock starts and entries open only after he finishes talking ("Go!"). The lightning-round intro and each lightning reveal wait for him too. If the TV disconnects, the game moves on after 25 seconds at most.
- Answer timers grow with the acronym: 20 s for 3 letters, plus 5 s per extra letter (20, 25, 30, 35, 40 s). Kids' extra time adds +10 or +20 s to every round. Live letter checking on the phone.
- 35-second break after every voting round: the results and scores stay up with a "Next round in" countdown (room for future ad placements).
- 30-second anonymous voting. Each phone gets its own shuffle, and you can't vote for yourself.
- Scoring: 1 point per vote, a round-winner bonus equal to the number of letters, 1 point for the fastest answer with a vote, and 1 point for picking the winner. Players who skip voting don't get points for votes they received.
- Lightning round for the top two: 3, 4 and 5 letters back to back, 15 seconds each (20 with kids' extra time on). Judges vote only after all 3 entries are in, with 30 seconds to pick A or B for each pair. Most votes wins each pair, speed breaks ties, and best of 3 is crowned champion. The champion is always ranked first in the final standings, even with fewer points; the other finalist is second and everyone else follows by points.
- **Ace, the game show announcer**, a cartoon host in a tux with a microphone, on the TV, with a deep announcer voice (he picks a male voice and lowers the pitch). He welcomes players by name, calls out the letters, warns at 10 seconds left, reads the answers during voting, announces winners and the leader, hosts the lightning round and crowns the champion. Kid-friendly and Adult modes have different lines. In the lobby, choose Voice, Captions only or Off, and pick a voice. With an ElevenLabs key he speaks in a lifelike AI voice (see above); otherwise he uses the voices built into the browser, which differ between computers (Edge's "Natural" voices sound best). Browsers only allow sound after a click on the page, so if you reload the TV screen, click the "turn on the announcer" button. His lines are in `public/announcer.js` if you want to write your own.
- **Acro Party theme music** (your track, in `public/music`): the full intro plays when a room opens, then its main section loops seamlessly in the lobby. Answer rounds loop a lighter 4-bar section from the opening of the theme. The lightning round uses a percussion-heavy remix of the theme made from your track: sped up to 145 bpm and raised a semitone, with the brass pulled back about 14 dB and a big drum layer (kick, claps, hi-hats, 16th-note shaker, deep tom hits on every bar and tom fills). Replace a file with your own (same name) to change it; loop points are set in `public/sound.js` (`FILES`).
- **Music and sound effects**, generated live in the browser for the other moments (voting, results, victory). Game-show style music played by a synthesized band (brass, organ, electric piano, vibraphone, strings, upright bass, jazz drums and timpani) with studio reverb: a swinging big-band theme in the lobby, soft vibraphone "thinking" music while answering, funky voting music, a brassy results tune, a tense strings-and-timpani lightning round and a victory fanfare. Effects include letter pops, whooshes, a ding when someone submits, a blip for each vote, a buzzer when time runs out, a fanfare for the round winner, a drumroll and a champion fanfare. Music dips automatically while Ace talks.
- **Soft timer ticker**: a gentle tick each second while the clock runs, a little brighter for the last 5 seconds.
- **Sound settings** under "Sound and announcer" in the lobby: music volume, effects volume and ticker on or off. The 🔊 button at the top of the TV mutes everything at once.
- **Phones** play a ding when you submit and a blip when you vote, and tick and buzz in your hand for the last 5 seconds if you haven't answered yet. Each phone has its own 🔊 mute button.
- **Trippy space background** on every screen: turning psychedelic color swirls, nebula glows and a starfield drifting toward you. It warps to light speed when new letters appear. In the lightning round it goes into hyperdrive with red urgency shading (red edges throbbing on the beat, red swirls and nebula): red-orange stars at about 6 times normal speed, shockwave rings, a throbbing nebula and shaking, red-glowing letter tiles, all pulsing in time with the music (about once a second, so it's intense without strobing). It stays still for anyone whose device is set to reduce motion.
- Host controls: pause (a big **▶ Resume game** button appears on the pause screen; the space bar also pauses and resumes), skip, remove a player, change settings, play again.
- Phones rejoin automatically if they lock or drop off; seats are held for 2 minutes.

## Files

| File | What it does |
| --- | --- |
| `server.js` | Web server, room codes, live updates (Server-Sent Events) |
| `lib/game.js` | Game rules, timers and scoring |
| `lib/letters.js` | Random letter sets |
| `lib/filter.js` | Naughty word filter. Add words to `EXTRA_WHOLE` or `EXTRA_STRONG`. |
| `public/host.html`, `public/host.js` | TV screen |
| `public/announcer.js` | Ace the announcer: his script, voice and captions |
| `public/background.js` | The animated starfield and color-swirl background |
| `public/music/` | theme.mp3 (intro + lobby loop), rounds.mp3 (answer-round loop), lightning.mp3 (lightning-round remix) |
| `public/sound.js` | Music player and synthesizer: theme files, synthesized tracks, sound effects and the ticker |
| `public/soundtrack.js` | Decides which music and effects play at each moment of the game |
| `public/play.html`, `public/play.js` | Phone screen |
| `public/shared/rules.js` | Answer checking, shared by phones and server |
| `CHANGELOG.md` | Revision history |
| `test/sim.js` | Automated test that plays full games with bots (`npm test`) |

The QR code and the rounded font load from the internet. Without internet access, the game still works: players type the address shown on the TV, and a standard font is used.
