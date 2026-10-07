// Gene Woolery, the game show host (named in homage to Gene Rayburn and Chuck Woolery). Runs on the TV screen only.
// Speaks with the browser's built-in voices (Web Speech API) and shows captions in a speech bubble.
// Settings (Voice / Captions only / Off, and which voice) are saved on this TV in localStorage.
(function () {
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const fill = (text, vars) => text.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? vars[k] : ''));
  const spell = (letters) => letters.join(', ');
  const listNames = (names) => (names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`);
  const NUM = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

  // ---------- the script ----------
  // Each entry: array of variants. "kid" and "adult" override "any" when present.
  const LINES = {
    welcome: {
      kid: ["Welcome to Acro Party! I'm Gene Woolery, your host. Here, everyday letters like the ones you see all the time turn into something totally silly, and the sillier they get, the more points you score! Grab your phones and join with the code on the screen!", "Hello, hello, hello! I'm Gene Woolery, and this is Acro Party, where ordinary acronyms turn into something completely different and score you points! Scan the code to join the fun!"],
      adult: ["Good evening, and welcome to Acro Party! I'm Gene Woolery, your host for tonight. Phones out, and join with the code on screen.", "Welcome, welcome! I'm Gene Woolery, and this is Acro Party, the game show where your everyday acronyms turn into something completely different, and the funnier they get, the more points you score! Join with the code on screen."],
    },
    join: { any: ['Welcome, {name}!', 'Give it up for {name}!', '{name} has entered the building!', "Look who's here, it's {name}!", 'Say hello to {name}!', '{name} is in the house!'] },
    ready: { any: ["We've got enough players! Host, press start whenever you're ready.", 'That makes {count}! We can start whenever you like.'] },
    firstRound: {
      kid: ["Let's play! Make up a phrase where each word starts with the letters on screen. Then vote for your favorite. Round one: {count} letters. {spelled}!"],
      adult: ["Let's get this party started! Make up a phrase that fits the letters, then vote for the best one. Round one: {count} letters. {spelled}!"],
    },
    round: { any: ['Round {n}! {count} letters. {spelled}!', 'Here comes round {n}. Your letters are... {spelled}!', 'Round {n}, {count} letters: {spelled}. Make it count!'] },
    backToShort: { any: ['Round {n}! We go back to {count} letters. {spelled}!'] },
    lastRound: { any: ['Final round before the lightning round! {count} letters. {spelled}!', 'This is it, the last regular round! {spelled}!'] },
    go: { any: ['Go!', 'And... go!', 'Clock is running. Go!', "Let's go!"] },
    timeLimit: { any: ["You've got {secs} seconds.", '{secs} seconds on the clock.', 'You have {secs} seconds.'] },
    tenLeft: { any: ['Ten seconds!', 'Ten seconds left!', 'Hurry, ten seconds!', 'Tick tock, ten seconds!'] },
    vote: {
      kid: ["Pencils down! Time to vote. Pick your favorite, but not your own!", "Let's see what you came up with! Vote for the best one."],
      adult: ["Pencils down! Time to vote, and no, you can't vote for yourself.", "Let's see what your twisted minds came up with. Vote for your favorite!"],
    },
    readOption: { any: ['Number {n}: {text}.'] },
    winner: { any: ['And the winner of this round is... {name}! "{text}"', 'Taking the round... {name}! "{text}"', 'The crowd has spoken! {name} wins with "{text}"'] },
    tie: { any: ["It's a tie! {names} split the round!", 'We have a tie between {names}!'] },
    noVotes: { any: ['Nobody voted? Tough crowd!'] },
    noVote: { any: ['Not enough answers to vote on that one. Come on, people!'] },
    nobody: { any: ['Nobody answered! Is this thing on?'] },
    fastest: { any: ['{name} was fastest on the buzzer.', 'Speed bonus goes to {name}!'] },
    leader: { any: ['{name} leads with {score} points.', '{name} is out in front with {score}!', 'At the top of the board: {name}, with {score}.'] },
    lightningIntro: {
      kid: ["It's time for... the lightning round! {a} versus {b}! Three acronyms, {secs} seconds each. Everyone else, you're the judges!"],
      adult: ["Ladies and gentlemen, it's time for the lightning round! {a} versus {b}! Three acronyms, {secs} seconds each. Everyone else, you're the judges."],
    },
    lightning: { any: ['Lightning {n}: {spelled}!', 'Lightning round {n}. Your letters: {spelled}!'] },
    fiveLeft: { any: ['Five seconds!', 'Five!'] },
    lightningVote: { any: ['Judges, it\'s in your hands. Pick A or B for all three!', 'All entries are in. Judges, vote now!'] },
    pairWin: { any: ['Round {n} goes to {name}!', '{name} takes round {n}!'] },
    pairSpeed: { any: ['Round {n}: a tie, but {name} was faster!'] },
    pairOnly: { any: ['Round {n} goes to {name}, the only one to beat the clock!'] },
    champion: { any: ['Your Acro Party champion is... {name}!', 'And the champion of Acro Party is... {name}! Take a bow!'] },
    forfeit: { any: ['{name} wins by forfeit! Champion!'] },
    thanks: { any: ['Thanks for playing Acro Party! Want to go again?', "That's our show! Hit play again for another round."] },
    pause: { any: ["We'll be right back after these messages!", 'Time out!'] },
    resume: { any: ["And we're back!", "Let's pick up where we left off!"] },
  };

  function line(key, mode, vars = {}) {
    const set = LINES[key];
    const variants = set[mode] || set.any;
    return fill(pick(variants), vars);
  }

  // ---------- settings ----------
  const KEY = 'acro-announcer';
  const settings = Object.assign({ mode: 'voice', voice: '' }, Acro.store.get(KEY) || {});
  const save = () => Acro.store.set(KEY, settings);
  const synth = 'speechSynthesis' in window ? window.speechSynthesis : null;

  function voices() {
    return synth ? synth.getVoices().filter((v) => /^en/i.test(v.lang)) : [];
  }
  // Gene has a deep game-show voice: prefer male voices, then lower the pitch.
  const MALE = [
    /Microsoft (Guy|Davis|Andrew|Christopher|Eric|Brian|Roger|Steffan|Tony|Jason|Ryan|Thomas|George|William)/i,
    /Google UK English Male/i,
    /\b(Daniel|Aaron|Arthur|Fred|Alex|Ralph|Albert|Reed|Eddy|Oliver|Thomas|Gordon|Lee|Rishi|Junior|Grandpa|Rocko)\b/i,
    /\bmale\b/i,
  ];
  const FEMALE = /female|Samantha|Zira|Aria|Jenny|Susan|Hazel|Karen|Moira|Tessa|Victoria|Allison|Ava|Kate|Serena|Fiona|Emma|Michelle|Sonia|Libby|Martha|Nicky|Catherine|Google US English$/i;
  const isMale = (v) => !FEMALE.test(v.name) && MALE.some((p) => p.test(v.name));
  // One-time reset so earlier saved voice choices don't override the new deep voice.
  if (!settings.deepVoice) {
    settings.voice = '';
    settings.deepVoice = true;
    try { Acro.store.set(KEY, settings); } catch {}
  }
  function chooseVoice() {
    const list = voices();
    if (settings.voice) {
      const v = list.find((x) => x.name === settings.voice);
      if (v) return v;
    }
    for (const p of MALE) {
      const v = list.find((x) => !FEMALE.test(x.name) && p.test(x.name));
      if (v) return v;
    }
    return list.find((x) => !FEMALE.test(x.name)) || list[0] || null;
  }

  // ---------- UI: mascot + speech bubble ----------
  // Gene Woolery: an original cartoon 1970s game-show host (feathered hair, wide-lapel burgundy tux,
  // gold bow tie, long skinny microphone). The mouth has six shapes that change with the sound of his voice.
  const MASCOT = `<svg viewBox="0 0 160 200" width="150" height="188" aria-hidden="true" class="gw">
    <defs>
      <radialGradient id="gwSkin" cx="45%" cy="40%" r="70%"><stop offset="0" stop-color="#fbd9b6"/><stop offset=".7" stop-color="#f0bf93"/><stop offset="1" stop-color="#dfa47a"/></radialGradient>
      <linearGradient id="gwHair" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8a5634"/><stop offset=".55" stop-color="#5e3820"/><stop offset="1" stop-color="#3d2314"/></linearGradient>
      <linearGradient id="gwJacket" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9c2a4c"/><stop offset=".6" stop-color="#7a1c3a"/><stop offset="1" stop-color="#4d0f24"/></linearGradient>
      <linearGradient id="gwLapel" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#2a1a26"/><stop offset=".5" stop-color="#45303f"/><stop offset="1" stop-color="#22141e"/></linearGradient>
      <linearGradient id="gwGold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe08a"/><stop offset=".5" stop-color="#f0b93e"/><stop offset="1" stop-color="#b9861f"/></linearGradient>
      <linearGradient id="gwMetal" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f1f3f6"/><stop offset=".5" stop-color="#9aa1ab"/><stop offset="1" stop-color="#5d636c"/></linearGradient>
      <linearGradient id="gwMouth" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2c0a0e"/><stop offset="1" stop-color="#5e1a20"/></linearGradient>
      <linearGradient id="gwTeeth" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f1e8d6"/><stop offset=".75" stop-color="#e3d5b8"/><stop offset="1" stop-color="#c9b590"/></linearGradient>
      <radialGradient id="gwIris" cx="40%" cy="40%" r="60%"><stop offset="0" stop-color="#9a6a3c"/><stop offset="1" stop-color="#4a2c16"/></radialGradient>
    </defs>
    <!-- jacket, shirt, lapels -->
    <path d="M6 200 Q8 168 50 159 L80 170 L110 159 Q152 168 154 200 Z" fill="url(#gwJacket)"/>
    <path d="M62 158 L80 197 L98 158 Z" fill="#f6f1e7"/>
    <path d="M70 172 L80 197 L90 172" stroke="#ddd5c6" stroke-width="1" fill="none"/>
    <path d="M51 159 L65 161 L80 200 L64 200 L40 172 Z" fill="url(#gwLapel)"/>
    <path d="M109 159 L95 161 L80 200 L96 200 L120 172 Z" fill="url(#gwLapel)"/>
    <path d="M52 161 L45 171 L64 199" stroke="#6a4d61" stroke-width="1" fill="none" opacity=".7"/>
    <path d="M108 161 L115 171 L96 199" stroke="#6a4d61" stroke-width="1" fill="none" opacity=".7"/>
    <path d="M22 182 L34 179 L31 187 Z" fill="url(#gwGold)"/><path d="M21 187 L37 183" stroke="#4d0f24" stroke-width="1.2"/>
    <!-- neck and collar -->
    <path d="M66 138 L94 138 L93 163 Q80 168 67 163 Z" fill="#e3a97f"/>
    <path d="M67 150 Q80 158 93 150 L93 156 Q80 162 67 156 Z" fill="#cf9469" opacity=".6"/>
    <path d="M63 157 L80 170 L71 175 L60 162 Z" fill="#fbf8f2"/><path d="M97 157 L80 170 L89 175 L100 162 Z" fill="#fbf8f2"/>
    <!-- gold bow tie -->
    <path d="M80 170 L62 161 Q57 170 62 179 Z" fill="url(#gwGold)"/><path d="M80 170 L98 161 Q103 170 98 179 Z" fill="url(#gwGold)"/>
    <path d="M64 165 L74 169 M64 175 L74 171 M96 165 L86 169 M96 175 L86 171" stroke="#b9861f" stroke-width=".9"/>
    <rect x="75.5" y="165.5" width="9" height="9" rx="3" fill="#d79e2a"/>
    <!-- head (tilts while talking) -->
    <g class="gw-head">
      <path d="M42 96 Q34 52 60 34 Q80 22 102 31 Q126 44 118 96 Z" fill="url(#gwHair)"/>
      <ellipse cx="45" cy="98" rx="7.5" ry="12" fill="#eab489"/><ellipse cx="115" cy="98" rx="7.5" ry="12" fill="#eab489"/>
      <path d="M44 92 Q41 99 45 106" stroke="#c98a62" stroke-width="1.6" fill="none"/><path d="M116 92 Q119 99 115 106" stroke="#c98a62" stroke-width="1.6" fill="none"/>
      <path d="M48 78 Q48 38 80 36 Q112 38 112 78 L112 104 Q110 138 80 148 Q50 138 48 104 Z" fill="url(#gwSkin)"/>
      <path d="M52 114 Q58 136 80 146 Q66 134 60 116 Z" fill="#d9976b" opacity=".22"/><path d="M108 114 Q102 136 80 146 Q94 134 100 116 Z" fill="#d9976b" opacity=".22"/>
      <!-- feathered 70s hair with a side part -->
      <path d="M47 82 Q42 42 74 32 Q106 26 116 56 Q117 70 113 82 Q110 62 98 54 Q88 50 76 54 Q64 52 56 60 Q50 68 49 82 Z" fill="url(#gwHair)"/>
      <path d="M58 52 Q64 30 92 28 Q114 32 116 56 Q106 40 90 40 Q74 38 64 48 Z" fill="#9a6440"/>
      <path d="M62 46 Q70 36 82 33 M70 50 Q82 40 98 38 M94 44 Q106 46 112 56" stroke="#b37a50" stroke-width="1.5" fill="none" stroke-linecap="round" opacity=".8"/>
      <path d="M58 54 Q63 44 70 38" stroke="#3d2314" stroke-width="1.3" fill="none" opacity=".7"/>
      <path d="M47.5 78 Q52.5 80 53.5 90 L52.6 103 Q50.6 104.5 49.4 102.5 Q48 92 47.5 78 Z" fill="#5e3820"/><path d="M112.5 78 Q107.5 80 106.5 90 L107.4 103 Q109.4 104.5 110.6 102.5 Q112 92 112.5 78 Z" fill="#5e3820"/>
      <!-- eyebrows (lift on big moments) -->
      <g class="gw-brows">
        <path d="M57 69 Q65 63.5 74 68" stroke="#4a2a18" stroke-width="3.8" fill="none" stroke-linecap="round"/>
        <path d="M86 68 Q95 63.5 103 69" stroke="#4a2a18" stroke-width="3.8" fill="none" stroke-linecap="round"/>
      </g>
      <!-- eyes -->
      <g class="gw-eye">
        <ellipse cx="66" cy="80" rx="7" ry="5.6" fill="#fffdf8"/>
        <circle cx="67" cy="80.4" r="3.9" fill="url(#gwIris)"/><circle cx="67" cy="80.4" r="1.9" fill="#140c06"/><circle cx="68.4" cy="79" r="1.2" fill="#fff"/>
        <path d="M58.6 79 Q66 73.2 73.6 78.6" stroke="#6b3e26" stroke-width="1.6" fill="none" stroke-linecap="round"/>
      </g>
      <g class="gw-eye">
        <ellipse cx="94" cy="80" rx="7" ry="5.6" fill="#fffdf8"/>
        <circle cx="95" cy="80.4" r="3.9" fill="url(#gwIris)"/><circle cx="95" cy="80.4" r="1.9" fill="#140c06"/><circle cx="96.4" cy="79" r="1.2" fill="#fff"/>
        <path d="M86.4 78.6 Q94 73.2 101.4 79" stroke="#6b3e26" stroke-width="1.6" fill="none" stroke-linecap="round"/>
      </g>
      <path d="M60 86.5 Q66 89 72 86.5 M88 86.5 Q94 89 100 86.5" stroke="#d79b72" stroke-width="1" fill="none" opacity=".8"/>
      <path d="M55 82 Q53.5 84 55 86 M105 82 Q106.5 84 105 86" stroke="#d79b72" stroke-width="1" fill="none" opacity=".7"/>
      <!-- nose -->
      <path d="M81.5 82 Q80 94 76 101" stroke="#d3946a" stroke-width="1.6" fill="none" stroke-linecap="round"/>
      <path d="M73.5 101.5 Q76 105.5 80 104.5 Q84 105.5 86.5 101.5" stroke="#bf8059" stroke-width="2" fill="none" stroke-linecap="round"/>
      <ellipse cx="80.5" cy="99" rx="3.2" ry="2.2" fill="#fff" opacity=".28"/>
      <!-- cheeks, smile lines, chin -->
      <ellipse cx="59" cy="108" rx="7" ry="4" fill="#ff8f7a" opacity=".22"/><ellipse cx="101" cy="108" rx="7" ry="4" fill="#ff8f7a" opacity=".22"/>
      <path d="M64 106 Q60 116 64 124 M96 106 Q100 116 96 124" stroke="#d3946a" stroke-width="1.1" fill="none" stroke-linecap="round" opacity=".5"/>
      <path d="M75 140 Q80 142.5 85 140" stroke="#d3946a" stroke-width="1.2" fill="none" opacity=".6"/>
      <!-- mouth: 0 smile, 1 slightly open, 2 open, 3 wide "ah", 4 round "oo", 5 wide "ee" -->
      <g class="gw-mouth">
        <g class="gw-m" data-m="0">
          <path d="M67 118.5 Q74 123 80 122.4 Q86 123 93 118.5" stroke="#8e3b33" stroke-width="2.2" fill="none" stroke-linecap="round"/>
          <path d="M70 122 Q80 129 90 122 Q80 126.4 70 122 Z" fill="#c4675b" opacity=".85"/>
          <path d="M65 116.6 Q66 119 68 119.6 M95 116.6 Q94 119 92 119.6" stroke="#b5654f" stroke-width="1.4" fill="none" stroke-linecap="round"/>
        </g>
        <g class="gw-m" data-m="1" style="display:none">
          <path d="M67 119 Q80 122 93 119 Q88 126.5 80 127 Q72 126.5 67 119 Z" fill="url(#gwMouth)"/>
          <path d="M71 120.4 Q80 122.5 89 120.4 L88.2 122.4 Q80 124 71.8 122.4 Z" fill="url(#gwTeeth)"/>
          <path d="M66 118.6 Q73 116.4 80 117.6 Q87 116.4 94 118.6 Q87 120.6 80 121 Q73 120.6 66 118.6 Z" fill="#b5584f"/>
          <path d="M69 125 Q80 131.5 91 125 Q80 128.8 69 125 Z" fill="#c4675b"/>
        </g>
        <g class="gw-m" data-m="2" style="display:none">
          <path d="M66.5 119 Q80 122 93.5 119 Q90 131 80 133 Q70 131 66.5 119 Z" fill="url(#gwMouth)"/>
          <path d="M70.5 120.4 Q80 122.8 89.5 120.4 L88.6 123.6 Q80 125.4 71.4 123.6 Z" fill="url(#gwTeeth)"/>
          <path d="M75.5 121.6 V124.4 M80 122.2 V125 M84.5 121.6 V124.4" stroke="#cbb994" stroke-width=".5"/>
          <ellipse cx="80" cy="130" rx="7.5" ry="3" fill="#a9474e"/>
          <path d="M65.5 118.6 Q73 116 80 117.4 Q87 116 94.5 118.6 Q87 120.8 80 121.2 Q73 120.8 65.5 118.6 Z" fill="#b5584f"/>
          <path d="M68.5 131 Q80 138 91.5 131 Q80 135 68.5 131 Z" fill="#c4675b"/>
        </g>
        <g class="gw-m" data-m="3" style="display:none">
          <path d="M66 119 Q80 122 94 119 Q92 136 80 139 Q68 136 66 119 Z" fill="url(#gwMouth)"/>
          <path d="M70 120.4 Q80 122.8 90 120.4 L89 123.8 Q80 125.6 71 123.8 Z" fill="url(#gwTeeth)"/>
          <path d="M75.3 121.6 V124.6 M80 122.2 V125.2 M84.7 121.6 V124.6" stroke="#cbb994" stroke-width=".5"/>
          <ellipse cx="80" cy="135" rx="8.5" ry="3.4" fill="#a9474e"/>
          <path d="M65 118.6 Q73 115.8 80 117.2 Q87 115.8 95 118.6 Q87 120.8 80 121.2 Q73 120.8 65 118.6 Z" fill="#b5584f"/>
          <path d="M68.5 137 Q80 144 91.5 137 Q80 141 68.5 137 Z" fill="#c4675b"/>
        </g>
        <g class="gw-m" data-m="4" style="display:none">
          <ellipse cx="80" cy="125" rx="5.6" ry="6.4" fill="url(#gwMouth)"/>
          <path d="M76 120.4 Q80 119.4 84 120.4 L83.4 122 Q80 121.3 76.6 122 Z" fill="url(#gwTeeth)"/>
          <ellipse cx="80" cy="125" rx="7.8" ry="8.6" fill="none" stroke="#b5584f" stroke-width="3.4"/>
          <path d="M74 131.5 Q80 134.5 86 131.5" stroke="#d07a6c" stroke-width="1.2" fill="none" opacity=".8"/>
        </g>
        <g class="gw-m" data-m="5" style="display:none">
          <path d="M64.5 119.5 Q80 122.5 95.5 119.5 Q90 127.6 80 128 Q70 127.6 64.5 119.5 Z" fill="url(#gwMouth)"/>
          <path d="M68 120.6 Q80 123.3 92 120.6 L91 123.4 Q80 125.4 69 123.4 Z" fill="url(#gwTeeth)"/>
          <path d="M71 126.4 Q80 127.6 89 126.4 L88 125.2 Q80 126.4 72 125.2 Z" fill="#dccdae"/>
          <path d="M63.5 119 Q72 116.6 80 117.8 Q88 116.6 96.5 119 Q88 121 80 121.4 Q72 121 63.5 119 Z" fill="#b5584f"/>
          <path d="M67.5 126.5 Q80 133 92.5 126.5 Q80 130.2 67.5 126.5 Z" fill="#c4675b"/>
        </g>
      </g>
    </g>
    <!-- hand with a long, skinny microphone -->
    <line x1="126" y1="196" x2="108" y2="140" stroke="#24242b" stroke-width="3.4" stroke-linecap="round"/>
    <line x1="125" y1="193" x2="109" y2="143" stroke="#55555f" stroke-width="1" stroke-linecap="round"/>
    <rect x="104.6" y="134" width="6" height="7" rx="1.5" fill="url(#gwGold)" transform="rotate(-18 107.6 137.5)"/>
    <circle cx="106" cy="131" r="5.2" fill="url(#gwMetal)"/>
    <path d="M102 129 H110 M101.4 131.6 H110.6 M106 126 V136" stroke="#6e747e" stroke-width=".6"/>
    <path d="M108 200 Q112 186 121 182 Q133 183 137 200 Z" fill="#6a1732"/>
    <path d="M113 186 Q121 180 131 184 L130 188 Q121 185 114 190 Z" fill="#f6f1e7"/>
    <path d="M115 184 Q114 176 120 174 Q127 172 132 176 Q134 182 130 186 Q122 189 115 184 Z" fill="#eab489"/>
    <path d="M119 175.5 Q124 174 129 176.5 M118 179 Q123 177.6 130 180" stroke="#c98a62" stroke-width="1" fill="none"/>
  </svg>`;

  const css = document.createElement('style');
  css.textContent = `
    #ace { position: fixed; left: 24px; bottom: 18px; display: flex; align-items: flex-end; gap: 12px; z-index: 40; pointer-events: none; max-width: min(660px, 42vw); }
    #ace .bubble { background: #fff; color: #1b1530; border-radius: 22px 22px 22px 6px; padding: 12px 18px; font-size: 21px; font-weight: 600; line-height: 1.3;
      box-shadow: 0 10px 30px rgba(0,0,0,.35); opacity: 0; transform: translateY(8px) scale(.97); transition: opacity .12s, transform .12s; margin-bottom: 80px; }
    #ace .bubble b.gw-name { display: block; font-size: 13px; letter-spacing: .08em; text-transform: uppercase; color: #9c2a4c; margin-bottom: 2px; }
    #ace.show .bubble { opacity: 1; transform: none; }
    #ace .mascot { flex: none; filter: drop-shadow(0 8px 14px rgba(0,0,0,.35)); }
    #ace .gw-head { transform-origin: 80px 140px; transform-box: view-box; transition: transform .35s ease; }
    #ace.talking .gw-head { animation: gw-nod 2.6s ease-in-out infinite; }
    @keyframes gw-nod { 0%,100% { transform: rotate(-1.6deg); } 30% { transform: rotate(1.2deg) translateY(-.6px); } 60% { transform: rotate(-.4deg) translateY(.4px); } }
    #ace.talking .mascot { animation: gw-sway 3.2s ease-in-out infinite; }
    @keyframes gw-sway { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
    #ace .gw-eye { transform-box: fill-box; transform-origin: center; animation: gw-blink 5.2s infinite; }
    #ace .gw-eye + .gw-eye { animation-delay: .02s; }
    @keyframes gw-blink { 0%, 93%, 100% { transform: scaleY(1); } 95.5% { transform: scaleY(.08); } }
    #ace .gw-brows { transition: transform .18s ease; }
    #ace.brows .gw-brows { transform: translateY(-3.5px); }
    #ace.off { display: none; }
    #aceUnlock { position: fixed; left: 50%; top: 84px; transform: translateX(-50%); z-index: 60; }
    @media (max-width: 900px) { #ace .bubble { font-size: 18px; margin-bottom: 56px; } #ace svg { width: 100px; height: 125px; } }
    @media (prefers-reduced-motion: reduce) { #ace.talking .gw-head, #ace.talking .mascot { animation: none; } }
  `;
  document.head.appendChild(css);
  const root = document.createElement('div');
  root.id = 'ace';
  root.innerHTML = `<div class="mascot">${MASCOT}</div><div class="bubble" id="aceBubble"></div>`;
  document.body.appendChild(root);
  const bubble = root.querySelector('#aceBubble');

  // ---------- lip sync ----------
  // With the AI voice, the mouth follows the loudness of the actual audio. With the browser voice or
  // captions, it runs a natural-looking syllable pattern (and closes briefly between words when the
  // browser reports word boundaries).
  const mouths = [...root.querySelectorAll('.gw-m')];
  let mouthNow = 0;
  function setMouth(i) {
    if (i === mouthNow) return;
    mouths[mouthNow].style.display = 'none';
    mouths[i].style.display = '';
    mouthNow = i;
  }
  let lipCtx = null;
  let analyser = null; // set while an AI clip is playing
  const lipBuf = new Float32Array(1024);
  function attachAnalyser(el) {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!lipCtx) lipCtx = new AC();
      if (lipCtx.state !== 'running') lipCtx.resume();
      if (lipCtx.state !== 'running') return; // never route audio into a silent context
      const src = lipCtx.createMediaElementSource(el);
      const an = lipCtx.createAnalyser();
      an.fftSize = 1024;
      an.smoothingTimeConstant = 0.3;
      src.connect(an);
      an.connect(lipCtx.destination);
      analyser = an;
      el.addEventListener('ended', () => { if (analyser === an) analyser = null; }, { once: true });
    } catch {}
  }
  let lastWordAt = 0;
  let nextFlip = 0;
  let level = 0;
  const SYLLABLE = [1, 2, 3, 2, 5, 4, 2, 1, 3, 5];
  function lipFrame(now) {
    if (!root.classList.contains('talking')) {
      setMouth(0);
    } else if (analyser) {
      analyser.getFloatTimeDomainData(lipBuf);
      let sum = 0;
      for (let i = 0; i < lipBuf.length; i++) sum += lipBuf[i] * lipBuf[i];
      const rms = Math.sqrt(sum / lipBuf.length);
      level = level * 0.4 + rms * 0.6;
      if (now >= nextFlip) {
        let m;
        if (level < 0.015) m = 0;
        else if (level < 0.045) m = Math.random() < 0.7 ? 1 : 4;
        else if (level < 0.09) m = Math.random() < 0.65 ? 2 : 5;
        else m = Math.random() < 0.7 ? 3 : 2;
        setMouth(m);
        nextFlip = now + 70;
      }
    } else if (now >= nextFlip) {
      if (now - lastWordAt < 70) setMouth(0);
      else setMouth(SYLLABLE[Math.floor(Math.random() * SYLLABLE.length)]);
      nextFlip = now + 85 + Math.random() * 75;
    }
    requestAnimationFrame(lipFrame);
  }
  requestAnimationFrame(lipFrame);
  // Eyebrows lift for exciting lines.
  function browsFor(text) {
    root.classList.toggle('brows', /!|\.\.\./.test(text));
  }

  // ---------- speech queue ----------
  let queue = [];
  let speaking = false;
  let hideTimer = null;
  let captionTimer = null;

  // ---------- AI voice (ElevenLabs, through our own server so the key stays secret) ----------
  let aiAvailable = false;
  fetch('/api/tts/status').then((r) => r.json()).then((j) => {
    aiAvailable = !!j.enabled;
    // First time the AI voice is available, switch to it (the host can still change it).
    if (aiAvailable && !settings.aiOffered) {
      settings.aiOffered = true;
      if (settings.mode === 'voice') settings.mode = 'ai';
      save();
    }
    const seg = document.getElementById('segAce');
    if (seg) wireSettings();
  }).catch(() => {});
  const useAI = () => settings.mode === 'ai' && aiAvailable;

  // Ask our server for this line in the AI voice. Returns { promise, abort }.
  function fetchTTS(text) {
    const session = Acro.store.get('acro-host') || {};
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 25000);
    const promise = fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: session.code, hostToken: session.hostToken, text }),
      signal: ctrl.signal,
    })
      .then(async (r) => {
        if (r.ok) return r.blob();
        const j = await r.json().catch(() => ({}));
        console.warn('[Gene] AI voice unavailable for a line:', r.status, j.error || '');
        return null;
      })
      .catch(() => null)
      .finally(() => clearTimeout(timer));
    return { promise, abort: () => ctrl.abort() };
  }
  let currentAudio = null;
  function stopAudio() {
    if (currentAudio) {
      currentAudio.onended = currentAudio.onerror = null;
      currentAudio.pause();
      currentAudio = null;
    }
  }

  function applyMode() {
    root.classList.toggle('off', settings.mode === 'off');
    if (settings.mode !== 'voice' && synth) synth.cancel();
    if (settings.mode !== 'ai') stopAudio();
  }

  let token = 0;

  // interrupt: a new moment in the game. Lines still waiting are dropped, and the line Gene is saying
  //   finishes its sentence first (he is never cut off mid-sentence) unless hard is set.
  // expiresIn: skip the line if it can't start within this many ms (for time-sensitive lines like "Five seconds!").
  function say(text, { interrupt = false, hard = false, expiresIn = 0 } = {}) {
    if (!text || settings.mode === 'off') return;
    // Start generating the AI audio right away so it's ready when it's this line's turn.
    const tts = useAI() ? fetchTTS(text) : null;
    // As soon as the clip arrives, load it into an audio player so it can start the instant its turn comes.
    const audio = tts
      ? tts.promise.then((blob) => {
          if (!blob) return null;
          const url = URL.createObjectURL(blob);
          const el = new Audio();
          el.preload = 'auto';
          el.src = url;
          el.load();
          return { el, url };
        })
      : null;
    const item = { text, audio, abort: tts ? tts.abort : null, expires: expiresIn ? Date.now() + expiresIn : 0 };
    if (interrupt) {
      queue.forEach((q) => q.abort && q.abort());
      queue = [item];
      // Cut the current line only if forced, or if it hasn't started sounding yet (nothing audible is lost).
      if (speaking && (hard || !lineStarted)) {
        console.debug('[Gene] (dropped a line that had not started yet)');
        token++;
        clearTimeout(captionTimer);
        if (synth) synth.cancel();
        stopAudio();
        speaking = false;
      }
    } else {
      if (queue.length >= 4) return; // don't let chatter pile up
      queue.push(item);
    }
    if (!speaking) next();
  }

  // Calls cb once Gene has nothing left to say (right away if he's quiet or turned off).
  let quietCbs = [];
  function whenQuiet(cb) {
    if (settings.mode === 'off' || (!speaking && !queue.length)) return cb();
    quietCbs.push(cb);
  }

  let lineStarted = false;
  function next() {
    let item = queue.shift();
    while (item && item.expires && Date.now() > item.expires) {
      console.debug('[Gene] (skipped a line that came too late)', item.text);
      if (item.abort) item.abort();
      item = queue.shift();
    }
    lineStarted = false;
    const text = item && item.text;
    if (!item) {
      const cbs = quietCbs;
      quietCbs = [];
      setTimeout(() => cbs.forEach((f) => f()), 0);
      speaking = false;
      if (window.Sound) Sound.duck(false);
      root.classList.remove('talking');
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => root.classList.remove('show'), 2500);
      return;
    }
    speaking = true;
    if (window.Sound) Sound.duck(true);
    const my = ++token;
    clearTimeout(hideTimer);
    console.debug('[Gene]', text);
    // The bubble and the voice start together: the caption appears at the moment the sound begins,
    // never while the voice is still loading.
    let shown = false;
    const showLine = () => {
      if (shown || my !== token) return;
      shown = true;
      lineStarted = true;
      bubble.innerHTML = '<b class="gw-name">Gene Woolery</b>' + Acro.esc(text);
      browsFor(text);
      root.classList.add('show', 'talking');
    };
    // Between lines, hide the old caption so it never sits next to the wrong words.
    root.classList.remove('show', 'talking');
    // Fallback timing for captions-only mode, or when the browser has no voices.
    const readMs = Math.min(9000, 1200 + text.length * 55);
    const done = () => {
      if (my !== token) return; // this line was cut off
      clearTimeout(captionTimer);
      next();
    };
    const captionOnly = () => {
      clearTimeout(captionTimer);
      showLine();
      captionTimer = setTimeout(done, readMs);
    };
    if (item.audio) {
      // AI voice. If it fails, show the caption instead (never the robot voice mid-game).
      captionTimer = setTimeout(captionOnly, 30000);
      item.audio.then((clip) => {
        if (my !== token) {
          if (clip) URL.revokeObjectURL(clip.url);
          return;
        }
        if (!clip) return captionOnly();
        const a = clip.el;
        currentAudio = a;
        a.volume = 1;
        a.onplaying = showLine; // fires when sound actually comes out
        attachAnalyser(a); // lip sync follows the real audio
        a.onended = a.onerror = () => {
          URL.revokeObjectURL(clip.url);
          if (currentAudio === a) currentAudio = null;
          showLine();
          done();
        };
        clearTimeout(captionTimer);
        captionTimer = setTimeout(done, 30000); // safety net if 'ended' never fires
        a.play().catch(() => captionOnly());
      });
      return;
    }
    if (settings.mode === 'voice' && synth && voices().length) {
      const u = new SpeechSynthesisUtterance(text);
      const v = chooseVoice();
      if (v) u.voice = v;
      u.rate = 0.96; // unhurried, booming delivery
      u.pitch = 0.62; // deep
      u.onstart = showLine;
      u.onboundary = () => (lastWordAt = performance.now());
      u.onend = done;
      u.onerror = done;
      // Some browsers never fire onstart; show the caption anyway after a moment.
      setTimeout(showLine, 1500);
      // Some browsers never fire onend; never let the queue get stuck.
      captionTimer = setTimeout(done, readMs + 6000);
      synth.speak(u);
    } else {
      captionOnly();
    }
  }

  // Browsers only allow speech after someone has clicked the page.
  function needsUnlock() {
    return !!navigator.userActivation && !navigator.userActivation.hasBeenActive;
  }
  function showUnlock() {
    if (!needsUnlock() || document.getElementById('aceUnlock')) return;
    const b = document.createElement('button');
    b.id = 'aceUnlock';
    b.className = 'btn';
    b.textContent = '🔊 Click to turn on sound';
    b.onclick = () => {
      b.remove();
      if (synth) synth.speak(new SpeechSynthesisUtterance(''));
    };
    document.body.appendChild(b);
  }

  // ---------- reacting to the game ----------
  let prev = null;
  let lastJoinSet = null;
  let warned = '';
  let pairTimers = [];

  function onState(s) {
    const mode = s.mode;
    const p = prev;
    prev = s;
    const phaseChanged = !p || p.phase !== s.phase || p.roundIndex !== s.roundIndex || (p.bonus && s.bonus && p.bonus.index !== s.bonus.index);
    showUnlock();

    // pause / resume
    if (p && p.paused !== s.paused) say(line(s.paused ? 'pause' : 'resume', mode), { interrupt: true });

    if (s.phase === 'lobby') {
      const ids = s.joinOrder || [];
      if (!p || p.phase !== 'lobby') {
        if (!p) say(line('welcome', mode));
        lastJoinSet = new Set(ids);
        return;
      }
      const fresh = ids.filter((id) => !lastJoinSet.has(id));
      lastJoinSet = new Set(ids);
      fresh.forEach((id) => {
        const pl = s.players.find((x) => x.id === id);
        if (pl) say(line('join', mode, { name: pl.name }));
      });
      const ready = s.players.filter((x) => x.connected).length;
      const before = p.players.filter((x) => x.connected).length;
      if (before < s.minPlayers && ready >= s.minPlayers) say(line('ready', mode, { count: NUM[ready] || ready }));
      return;
    }
    if (!phaseChanged) return;
    pairTimers.forEach(clearTimeout);
    pairTimers = [];

    const n = s.roundIndex + 1;
    switch (s.phase) {
      case 'reveal': {
        const vars = { n, count: s.letters.length, spelled: spell(s.letters) };
        let key = 'round';
        if (s.roundIndex === 0) key = 'firstRound';
        else if (n === s.totalRounds) key = 'lastRound';
        else if (s.roundIndex === 5) key = 'backToShort';
        say(line(key, mode, vars) + ' ' + line('timeLimit', mode, { secs: s.answerSecs }), { interrupt: true });
        break;
      }
      case 'bonus_answer':
        say(line('go', mode), { expiresIn: 2500 });
        break;
      case 'answer':
        say(line('go', mode, { secs: s.answerSecs }), { expiresIn: 2500 });
        break;
      case 'vote': {
        say(line('vote', mode), { interrupt: true });
        if (s.options.length <= 6) s.options.forEach((o) => say(line('readOption', mode, { n: o.n, text: o.text })));
        break;
      }
      case 'results': {
        const r = s.results;
        const out = [];
        const winners = r.rows.filter((x) => x.winner);
        if (!r.rows.length) out.push(line('nobody', mode));
        else if (r.noVote) out.push(line('noVote', mode));
        else if (!winners.length) out.push(line('noVotes', mode));
        else if (winners.length === 1) out.push(line('winner', mode, { name: winners[0].name, text: winners[0].text }));
        else out.push(line('tie', mode, { names: listNames(winners.map((w) => w.name)) }));
        const fast = r.rows.find((x) => x.speed);
        if (fast && !(winners.length === 1 && winners[0] === fast)) out.push(line('fastest', mode, { name: fast.name }));
        const lead = s.players[0];
        if (lead && lead.score > 0) out.push(line('leader', mode, { name: lead.name, score: lead.score }));
        out.forEach((t, i) => say(t, { interrupt: i === 0 }));
        break;
      }
      case 'bonus_intro': {
        const [a, b] = s.bonus.finalists;
        say(line('lightningIntro', mode, { a: a.name, b: b.name, secs: s.lightningSecs }), { interrupt: true });
        break;
      }
      case 'bonus_reveal':
        say(line('lightning', mode, { n: s.bonus.index + 1, spelled: spell(s.letters) }) + ' ' + line('timeLimit', mode, { secs: s.lightningSecs }), { interrupt: true });
        break;
      case 'bonus_vote':
        say(line('lightningVote', mode), { interrupt: true });
        break;
      case 'bonus_results': {
        // Matches the TV's reveal: one pair every 3.5 s, champion at 11 s.
        const names = Object.fromEntries(s.bonus.finalists.map((f) => [f.id, f.name]));
        s.bonus.pairs.forEach((pair, i) => {
          const res = pair.result;
          if (!res.winner) return;
          const key = res.reason === 'speed' ? 'pairSpeed' : res.reason === 'only' ? 'pairOnly' : 'pairWin';
          pairTimers.push(setTimeout(() => say(line(key, mode, { n: i + 1, name: names[res.winner] }), { interrupt: true }), i * 3500 + 300));
        });
        pairTimers.push(setTimeout(() => say(line('champion', mode, { name: s.champion.name }), { interrupt: true }), 11000));
        break;
      }
      case 'gameover': {
        if (!p || p.phase !== 'bonus_results') {
          const c = s.champion;
          if (c) say(line(c.forfeit ? 'forfeit' : 'champion', mode, { name: c.name }), { interrupt: true });
        }
        say(line('thanks', mode));
        break;
      }
    }
  }

  // Countdown warnings
  setInterval(() => {
    const s = prev;
    if (!s || s.paused) return;
    const ms = Acro.remainingMs(s);
    if (ms == null) return;
    const key = `${s.phase}|${s.roundIndex}|${s.bonus ? s.bonus.index : ''}`;
    if (warned === key) return;
    if (s.phase === 'answer' && s.duration > 15000 && ms <= 10000 && ms > 8000) {
      warned = key;
      say(line('tenLeft', s.mode), { expiresIn: 3000 });
    } else if (s.phase === 'bonus_answer' && ms <= 5000 && ms > 3500) {
      warned = key;
      say(line('fiveLeft', s.mode), { expiresIn: 1500 });
    }
  }, 250);

  // ---------- lobby settings control ----------
  function settingsHtml() {
    return `<div class="setting"><span>Announcer</span><div class="seg" id="segAce">
        ${aiAvailable ? '<button data-v="ai">🎙️ AI voice</button>' : ''}<button data-v="voice">🔊 Browser voice</button><button data-v="captions">💬 Captions</button><button data-v="off">Off</button></div></div>
      <div class="setting" id="aceVoiceRow"><span>Voice</span><select id="aceVoice" class="field" style="min-height:44px;padding:6px 10px;font-size:17px;width:auto;max-width:320px"></select>
        <button class="btn ghost" id="aceTest">Test</button></div>`;
  }

  function wireSettings() {
    let seg = document.getElementById('segAce');
    if (!seg) return;
    // Re-draw the buttons (the AI option appears once the server says it's set up).
    const row = seg.closest('.setting');
    const holder = document.createElement('div');
    holder.innerHTML = settingsHtml();
    row.replaceWith(holder.firstElementChild);
    document.getElementById('aceVoiceRow').replaceWith(holder.lastElementChild);
    seg = document.getElementById('segAce');
    const sync = () => {
      seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === settings.mode));
      document.getElementById('aceVoiceRow').classList.toggle('hidden', !((settings.mode === 'voice' && voices().length) || settings.mode === 'ai'));
      document.getElementById('aceVoice').classList.toggle('hidden', settings.mode === 'ai');
    };
    seg.querySelectorAll('button').forEach((b) => (b.onclick = () => {
      settings.mode = b.dataset.v;
      save();
      applyMode();
      sync();
      if (settings.mode !== 'off') say("Hi, I'm Gene Woolery! I'll be your host tonight.", { interrupt: true, hard: true });
    }));
    const sel = document.getElementById('aceVoice');
    const fillVoices = () => {
      const current = chooseVoice();
      const sorted = voices().slice().sort((a, b) => isMale(b) - isMale(a));
      sel.innerHTML = sorted.map((v) => `<option value="${Acro.esc(v.name)}" ${current && v.name === current.name ? 'selected' : ''}>${Acro.esc(v.name)}${isMale(v) ? ' (deep)' : ''}</option>`).join('');
      sync();
    };
    sel.onchange = () => {
      settings.voice = sel.value;
      save();
    };
    document.getElementById('aceTest').onclick = () => say(line('welcome', 'kid'), { interrupt: true, hard: true });
    fillVoices();
    if (synth) synth.onvoiceschanged = fillVoices;
  }

  applyMode();
  window.Announcer = { onState, say, settingsHtml, wireSettings, whenQuiet };
})();
