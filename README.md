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

## Playing on your home Wi-Fi (any phone, tablet or laptop)

Any device on the **same Wi-Fi** as the computer running the game can join: iPhones, Android phones, tablets, laptops. They just need a web browser; nothing to install.

- **Join:** scan the QR code on the TV, or type the address shown (for example `192.168.1.23:3000/play`). The QR code fills in the room code.
- **TV screen on another device:** the host screen doesn't have to be on the computer running the game. A smart TV's browser, a tablet or another laptop can open `http://<that address>:3000/host` (for example `http://192.168.1.23:3000/host`).
- **Can't connect?**
  - All devices must be on the same Wi-Fi, not a guest network (guest networks usually keep devices apart). Phones on mobile data can't reach it.
  - Windows: the network must be set to **Private** (Settings > Network & internet > your network > Network profile type). The game checks this when it starts and prints a warning if it's set to Public.
  - Windows Firewall must allow Node.js (or AcroParty) on Private networks: Windows Security > Firewall & network protection > Allow an app through firewall.
  - If the computer has several network connections (VPN, Ethernet and Wi-Fi), the TV lists other addresses to try. Turning off a VPN often helps.

## Showing the game on a TV

The TV screen is the busiest part of the game (animated background, Gene, music). Smart-TV chips are much slower than a laptop, so there are three ways to put it on the TV, best first:

1. **Let the computer do the work (smoothest):** connect the computer to the TV with an HDMI cable, or mirror its screen wirelessly. LG TVs support Screen Share (Miracast): on Windows press **Windows + K** and pick the TV; on a Mac use AirPlay (2018 and newer LG TVs). The TV only displays the picture.
2. **The Acro Party LG TV app (no TV web browser):** see "LG TV app" below. It opens the TV screen straight from the app in TV mode.
3. **The TV's own web browser:** works, and now switches to TV mode automatically.

**TV mode** (lobby > Sound, announcer and display > Display) keeps the look but drops the effects that are heavy for a TV: no background blur, a still color backdrop instead of spinning swirls, fewer stars drawn 30 times a second, a simpler red lightning-round glow, and recorded music only (no live synthesizer). In a test with the processor slowed to TV speed, the screen went from about 6 to about 40 frames per second in the lobby, and from about 2 to about 20 in the lightning round. It turns on by itself on LG, Samsung, Android TV and Fire TV browsers; you can also add `?lite=1` (on) or `?lite=0` (off) to the address.

### LG TV app

A small webOS app, **com.acroparty.tv**, that opens Acro Party's TV screen without the TV's web browser. The game itself still runs on a computer on your Wi-Fi (or your online version); the app finds it and shows the TV screen. Phones join exactly as before.

Build it: `node tools/build-webos.js` (creates `dist/com.acroparty.tv_<version>_all.ipk`).

Install it on the TV (one-time setup, free):

1. Create an LG developer account at https://webostv.developer.lge.com (sign in with an LG account).
2. On the TV, install **Developer Mode** from the LG Content Store, sign in, turn on **Dev Mode Status** (the TV restarts), then turn on **Key Server**.
3. On your computer, install **webOS Dev Manager** (https://github.com/webosbrew/dev-manager-desktop), add the TV (same Wi-Fi), and install the `.ipk` file. LG's own command-line tool works too: `ares-install --device tv com.acroparty.tv_0.37.0_all.ipk`.
4. Open **Acro Party** from the TV's apps. Start the game on your computer, then choose **Find my game** (or type the address shown in the computer's window). The app remembers it for next time.

Good to know: Developer Mode has a time limit; reset it in the Developer Mode app before it runs out, or apps installed this way are removed. Only one TV can use a developer account at a time. Use the Magic Remote pointer to click, or the arrow keys and OK. To reach everyone with an LG TV without Developer Mode, the app would need to be submitted to the LG Content Store.

## Put it online (play from anywhere)

Any host that runs a Node web service works. For example, on Render:

1. Put this folder in a GitHub repository.
2. In Render, create a **Web Service** from that repository.
3. Set the build command to nothing (or `echo ok`) and the start command to `node server.js`.

Render sets the `PORT` variable automatically. On free plans, the server sleeps when idle, so the first visit can take about a minute to load.

## Windows app (no Node.js needed to play)

You can turn the game into a standalone Windows app, **AcroParty.exe**. Whoever plays doesn't need Node.js; they just double-click it.

**Build it once** (on any Windows computer that has Node.js; Node.js 25.5 or newer is simplest, older versions need internet the first time to download a helper called postject):

1. Unzip this folder.
2. Open the `windows` folder and double-click **Build Acro Party app (Windows).bat**.
3. When it says DONE, a folder opens: `dist\Acro Party`, containing `AcroParty.exe` and `How to play.txt`. Copy or zip that folder to share it.

**Play:**

1. Double-click **AcroParty.exe**.
   - The first time, Windows may say "Windows protected your PC" because the app isn't signed with a paid certificate yet. Click **More info**, then **Run anyway**.
   - If Windows Firewall asks, allow **Private networks** so phones can connect.
2. A black Acro Party window shows the address for phones, and the TV screen opens in its own Edge (or Chrome) window. Press F11 for full screen.
3. Keep the black window open while you play; close it to end the game.

**Gene's AI voice in the app:** the first run creates **Acro Party settings.txt** next to the app. Open it, remove the `#` in front of `ELEVENLABS_API_KEY=`, paste your key after the `=`, save and restart. Other settings (voice ID, daily cap, port) are in the same file. Tip: put your filled-in `Acro Party settings.txt` in the `windows` folder before building, and the builder copies it next to the app. Keep that file private (it is excluded from GitHub), and don't share the app folder with it inside unless you're happy for others to use your ElevenLabs credits.

Good to know: if port 3000 is busy the app uses the next free one; the app picks your real Wi-Fi address and skips VPN and virtual adapters (other addresses are listed in the black window if phones can't connect). The QR code is made on the computer itself, so joining works without internet. Work computers may block apps that aren't signed.

Shortcut if Node.js is already installed: double-click **Play Acro Party (with Node).bat** in the `windows` folder.

### If Windows says "Smart App Control blocked a file that may be unsafe"

Smart App Control (Windows 11) blocks script files downloaded from the internet, such as the `.bat` helpers, and apps that aren't signed with a code-signing certificate, which includes a self-built AcroParty.exe. There is no "Run anyway" button. What works with it switched on:

1. Open the `acro-party` folder in File Explorer, click the address bar, type `cmd` and press Enter.
2. Type `node desktop\launcher.js` and press Enter. (Node.js itself is signed, so Smart App Control allows it.) The TV screen opens and the black window shows the address for phones, exactly like the app. Put your `Acro Party settings.txt` in the `acro-party` folder for Gene's AI voice.
3. Optional double-click shortcut: right-click the desktop, choose New > Shortcut, and paste
   `"C:\Program Files\nodejs\node.exe" "<full path to>\acro-party\desktop\launcher.js"`
   (replace the second part with where your folder is; Shift + right-click launcher.js > Copy as path gives it to you). Name it Acro Party.

To ship a real double-click app to computers with Smart App Control, the .exe has to be code-signed (for example with Microsoft's Azure Artifact Signing, formerly Trusted Signing).


## Turn on Gene's AI voice (ElevenLabs)

Gene can speak with a lifelike AI voice from ElevenLabs instead of the browser's built-in voice.

1. Sign up at https://elevenlabs.io, find **API Keys** in your account (under the developer settings), and create a key with Text to Speech access. Copy it.
2. In Render, open your service, go to **Environment**, click **Add Environment Variable**, and add:
   - Key: `ELEVENLABS_API_KEY`
   - Value: your key
3. Save. Render restarts the game. In the lobby, under **Sound, announcer and display**, the announcer is set to **🎙️ AI voice**.

Running on your laptop instead? Start it with the key in front: `ELEVENLABS_API_KEY=your-key node server.js` (Mac), or on Windows run `set ELEVENLABS_API_KEY=your-key` first and then `node server.js`.

Optional settings (also environment variables):

| Variable | Default | What it does |
| --- | --- | --- |
| `ELEVENLABS_VOICE_ID` | `nPczCjzI2devNBz1zQrb` (Brian, deep American narrator) | Any voice ID from your ElevenLabs voice library |
| `ELEVENLABS_MODEL` | `eleven_multilingual_v2` (most lifelike) | `eleven_flash_v2_5` is faster and cheaper |
| `ELEVENLABS_DAILY_CHAR_LIMIT` | `40000` | Safety cap on characters sent per day. A game uses about 3,000. |
| `ELEVENLABS_CONCURRENCY` | `2` | How many lines are generated at the same time. Raise it if your ElevenLabs plan allows more simultaneous requests. |

How it protects your credits: the key stays on the server, only the TV screen of a live room can request speech, every line is generated once and reused (repeated lines are free), and the daily cap stops runaway use. Requests wait in line (2 at a time by default) and are retried automatically if ElevenLabs is busy, so Gene stays in the AI voice. If a line still can't be generated (service down or cap reached), it appears as a caption only. Gene never switches to the robot voice mid-game.

## What's in the prototype

- **Fits any screen:** the TV screen scales with the display (small laptop window, 1080p TV or 4K), so it looks the same everywhere instead of getting cramped. Gene stands in his own strip along the bottom and shrinks on busy screens (voting, results, final standings), so he never covers the game. If a screen still has more than fits (say ten long answers on a small display), the game area shrinks a little more until every answer is visible. With lots of answers, results show in two columns.

- **How to Play page** at `/how-to-play`, opened from the 📖 How to play button on the game-mode screen: a step-by-step tutorial with real screenshots of the TV and phones (joining, random letters, voting, scoring and bonus points, the Lightning Round and the champion). It's a normal page in the game, not a pop-up; Back to the game returns to the start screen.

- Kid-friendly or Adult mode, chosen first. Kid mode turns on the naughty word filter for answers and nicknames (a naughty answer flashes "Naughty!" on the phone, then just that word is deleted so the player can type a new one), skips rude letter sets, and starts with +10 seconds of kids' extra time. Adult mode asks every player to confirm they're 18 or older.
- 5 to 8 rounds, set in the lobby (Kid-friendly games also show the Kids' extra time setting). Letters go 3, 4, 5, 6, 7, then back to 3, 4, 5.
- **The clock waits for Gene.** Each round's letters are revealed while Gene announces them; the answer clock starts and entries open only after he finishes talking ("Go!"). The lightning-round intro and each lightning reveal wait for him too. If the TV disconnects, the game moves on after 25 seconds at most.
- Answer timers grow with the acronym: 20 s for 3 letters, plus 5 s per extra letter (20, 25, 30, 35, 40 s). Kids' extra time adds +10 or +20 s to every round. Live letter checking on the phone.
- 25-second break after every voting round: the results and scores stay up with a "Next round in" countdown (room for future ad placements).
- 30-second anonymous voting. Each phone gets its own shuffle, and you can't vote for yourself.
- Scoring: 1 point per vote, a round-winner bonus equal to the number of letters, 1 point for the fastest answer with a vote, and 1 point for picking the winner. Players who skip voting don't get points for votes they received. If only one player answers, there's nothing to vote on, so that answer wins the round outright: the round-winner bonus plus the speed point.
- Lightning round for the top two: 3, 4 and 5 letters back to back, 15 seconds each (20 with kids' extra time on). Judges vote only after all 3 entries are in, with 30 seconds to pick A or B for each pair. Most votes wins each pair, speed breaks ties, and best of 3 is crowned champion. The champion is always ranked first in the final standings, even with fewer points; the other finalist is second and everyone else follows by points.
- **Gene Woolery, the game show host** (named in homage to Gene Rayburn and Chuck Woolery), an original cartoon 1970s host with feathered hair, a burgundy tux with wide lapels, a gold bow tie and a long skinny microphone. His mouth has six shapes (smile, slightly open, open, wide "ah", round "oo", wide "ee") that follow the loudness of the AI voice; with the browser voice or captions they follow a natural syllable rhythm. He also blinks, nods while he talks and raises his eyebrows on big moments. Each caption is labeled with his name. He appears on the TV, with a deep announcer voice (he picks a male voice and lowers the pitch). He always finishes his sentence: when the game moves on, lines he hasn't started yet are dropped, and late timing lines (like "Five seconds!") are skipped. He welcomes players by name, calls out the letters, warns at 10 seconds left, reads the answers during voting, announces winners and the leader, hosts the lightning round and crowns the champion. Kid-friendly and Adult modes have different lines. In the lobby, choose Voice, Captions only or Off, and pick a voice. With an ElevenLabs key he speaks in a lifelike AI voice (see above); otherwise he uses the voices built into the browser, which differ between computers (Edge's "Natural" voices sound best). Browsers only allow sound after a click on the page, so if you reload the TV screen, click the "turn on the announcer" button. His lines are in `public/announcer.js` if you want to write your own.
- **Acro Party theme music** (your track, in `public/music`): the full intro plays when a room opens, then its main section loops seamlessly in the lobby. The final standings bring the theme back from the top, so the show opens and closes with it. Answer rounds loop a lighter 4-bar section from the opening of the theme. The lightning round uses a percussion-heavy remix of the theme made from your track: sped up to 145 bpm and raised a semitone, with the brass pulled back about 14 dB and a big drum layer (kick, claps, hi-hats, 16th-note shaker, deep tom hits on every bar and tom fills). Replace a file with your own (same name) to change it; loop points are set in `public/sound.js` (`FILES`).
- **Music and sound effects**, generated live in the browser for the other moments (voting and results). Game-show style music played by a synthesized band (brass, organ, electric piano, vibraphone, strings, upright bass, jazz drums and timpani) with studio reverb: a swinging big-band theme in the lobby, soft vibraphone "thinking" music while answering, funky voting music, a brassy results tune, a tense strings-and-timpani lightning round and a champion fanfare. Effects include letter pops, whooshes, a ding when someone submits, a blip for each vote, a buzzer when time runs out, a fanfare for the round winner, a drumroll and a champion fanfare. Music dips automatically while Gene talks.
- **Soft timer ticker**: a gentle tick each second while the clock runs, a little brighter for the last 5 seconds.
- **Sound settings** under "Sound, announcer and display" in the lobby: music volume, effects volume and ticker on or off. The 🔊 button at the top of the TV mutes everything at once.
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
| `public/announcer.js` | Gene Woolery, the host: his artwork, lip sync, script, voice and captions |
| `public/background.js` | The animated starfield and color-swirl background |
| `public/music/` | theme.mp3 (intro + lobby loop, and the final standings), rounds.mp3 (answer-round loop), lightning.mp3 (lightning-round remix) |
| `public/sound.js` | Music player and synthesizer: theme files, synthesized tracks, sound effects and the ticker |
| `public/soundtrack.js` | Decides which music and effects play at each moment of the game |
| `public/play.html`, `public/play.js` | Phone screen |
| `public/how.html`, `public/how/` | The How to Play page (`/how-to-play`) and its screenshots |
| `public/shared/rules.js` | Answer checking, shared by phones and server |
| `public/shared/qr.js` | Makes the join QR code on the computer (no internet needed) |
| `desktop/launcher.js` | Desktop app start-up: settings file, opens the TV screen, shows the phone address |
| `tools/bundle.js` | Packs the server and all game files into one file (dist/acro-party.js) |
| `tools/build-app.js` | Builds the standalone app (AcroParty.exe) from that file |
| `tv/webos/` | The LG TV app (launcher page, app info, icons) |
| `tools/build-webos.js` | Packs the LG TV app into an .ipk file |
| `windows/` | Double-click helpers: build the app, or play with Node.js installed |
| `CHANGELOG.md` | Revision history |
| `test/sim.js` | Automated test that plays full games with bots (`npm test`) |

Everything runs on your own network: the QR code is made on the computer, so phones can join without internet. Only the rounded font (and Gene's AI voice) need internet; without it a standard font is used.
