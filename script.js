/* =========================================================
   Shalvia & Aman — invitation interactions
   - Opening doors + wax seal
   - Theme-reactive generative music (Web Audio, no files needed)
   - Theme-reactive particles (petals / glitter / stars / notes)
   - Countdown, reveal-on-scroll, save-the-date link
   ========================================================= */

/* ---------------------------------------------------------
   OPTIONAL: use your own songs.
   Put audio files in a "music" folder and set paths below,
   e.g. haldi: "music/haldi.mp3". Any theme left empty ("")
   uses the built-in generated music instead.
   --------------------------------------------------------- */
const CUSTOM_AUDIO = {
  intro: "",
  haldi: "",
  sangeet: "",
  pheras: "",
  reception: "",
};

const TRACK_TITLES = {
  intro: "Overture · Shalvia & Aman",
  haldi: "01 · Haldi — Royal Rajasthani Hues",
  sangeet: "02 · Tilak & Sangeet — Glitz & Glam",
  pheras: "03 · Baraat & Pheras — Crimson Romance",
  reception: "04 · Reception — Night of Grandeur",
};

const EVENT_START = new Date("2027-01-25T11:00:00+05:30");

/* =========================================================
   MUSIC ENGINE
   ========================================================= */
const Music = (() => {
  // semitone helpers
  const hz = (root, semi) => root * Math.pow(2, semi / 12);

  // Each function has its own musical "mood"
  const MOODS = {
    intro: {
      root: 146.83, // D
      scale: [0, 2, 4, 7, 9, 12, 14, 16, 19],
      bpm: 72, lead: "bell", drums: null, every: 4, density: 0.7, pad: true, drone: true,
    },
    haldi: { // folk, bright, dholak — Raag Bhupali feel
      root: 146.83,
      scale: [0, 2, 4, 7, 9, 12, 14, 16, 19, 21],
      bpm: 104, lead: "santoor", drums: "dholak", every: 2, density: 0.75, pad: false, drone: true,
    },
    sangeet: { // glitzy dance-floor
      root: 110, // A minor
      scale: [0, 3, 5, 7, 10, 12, 15, 17, 19, 22],
      bpm: 120, lead: "synth", drums: "disco", every: 2, density: 0.6, pad: true, bass: true, drone: false,
    },
    pheras: { // devotional, romantic — Raag Yaman feel
      root: 130.81, // C
      scale: [0, 2, 4, 6, 7, 9, 11, 12, 14, 16],
      bpm: 66, lead: "flute", drums: "tabla", every: 4, density: 0.8, pad: false, drone: true,
    },
    reception: { // lush, after-dark
      root: 116.54, // Bb
      scale: [0, 2, 3, 7, 8, 12, 14, 15, 19],
      bpm: 60, lead: "bell", drums: "brush", every: 4, density: 0.7, pad: true, bass: true, drone: false,
    },
  };

  let ctx, master, comp, reverb, revSend, analyser, noiseBuf;
  let droneNodes = null;
  let mood = MOODS.intro, moodName = "intro", pending = null;
  let step = 0, bar = 0, nextTime = 0, timer = null;
  let motif = [];
  let playing = false;
  let customEl = null;

  function init() {
    if (ctx) return;
    try { if (navigator.audioSession) navigator.audioSession.type = "playback"; } catch (e) {}
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = 0;
    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.ratio.value = 4;
    analyser = ctx.createAnalyser(); analyser.fftSize = 64;
    master.connect(comp); comp.connect(analyser); analyser.connect(ctx.destination);

    // simple generated reverb
    reverb = ctx.createConvolver();
    const len = ctx.sampleRate * 2.8;
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    reverb.buffer = ir;
    revSend = ctx.createGain(); revSend.gain.value = 0.35;
    revSend.connect(reverb); reverb.connect(master);

    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const nd = noiseBuf.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

    makeMotif();
  }

  /* ---------- routing helper ---------- */
  function out(node, wet = 0.3, vol = 1) {
    const g = ctx.createGain(); g.gain.value = vol;
    node.connect(g); g.connect(master);
    if (wet > 0) { const s = ctx.createGain(); s.gain.value = wet; g.connect(s); s.connect(revSend); }
    return g;
  }
  function env(g, t, a, peak, d) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  /* ---------- instruments ---------- */
  function santoor(f, t, v = 0.18) {
    [0, 0.07].forEach((off, i) => {
      const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain();
      o.type = "triangle"; o2.type = "sine";
      o.frequency.value = f; o2.frequency.value = f * 2.005;
      o.connect(g); o2.connect(g); out(g, 0.35);
      env(g, t + off, 0.004, v * (i ? 0.45 : 1), 0.9);
      o.start(t + off); o2.start(t + off); o.stop(t + off + 1); o2.stop(t + off + 1);
    });
  }
  function bell(f, t, v = 0.14) {
    [[1, 1], [2.76, 0.35], [5.4, 0.12]].forEach(([m, a]) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "sine"; o.frequency.value = f * m;
      o.connect(g); out(g, 0.55);
      env(g, t, 0.006, v * a, 2.6 / m + 0.4);
      o.start(t); o.stop(t + 3.2);
    });
  }
  function flute(f, t, dur, v = 0.12) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    const lfo = ctx.createOscillator(), lg = ctx.createGain();
    o.type = "sine"; o.frequency.value = f;
    lfo.frequency.value = 5.2; lg.gain.value = f * 0.008;
    lfo.connect(lg); lg.connect(o.frequency);
    // little glide (meend) into the note
    o.frequency.setValueAtTime(f * 0.97, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.12);
    o.connect(g); out(g, 0.5);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.12);
    g.gain.setValueAtTime(v, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.4);
    // breath
    const n = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), ng = ctx.createGain();
    n.buffer = noiseBuf; bp.type = "bandpass"; bp.frequency.value = f * 2; bp.Q.value = 6;
    n.connect(bp); bp.connect(ng); out(ng, 0.4);
    env(ng, t, 0.05, v * 0.25, dur);
    o.start(t); lfo.start(t); n.start(t);
    o.stop(t + dur + 0.5); lfo.stop(t + dur + 0.5); n.stop(t + dur + 0.5);
  }
  function synth(f, t, v = 0.09) {
    const o = ctx.createOscillator(), o2 = ctx.createOscillator(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = "sawtooth"; o2.type = "square";
    o.frequency.value = f; o2.frequency.value = f * 1.004;
    lp.type = "lowpass"; lp.Q.value = 6;
    lp.frequency.setValueAtTime(3200, t); lp.frequency.exponentialRampToValueAtTime(500, t + 0.3);
    o.connect(lp); o2.connect(lp); lp.connect(g); out(g, 0.3);
    env(g, t, 0.005, v, 0.35);
    o.start(t); o2.start(t); o.stop(t + 0.5); o2.stop(t + 0.5);
    // sparkle an octave up
    bell(f * 4, t, 0.025);
  }
  function pad(freqs, t, dur, v = 0.035) {
    freqs.forEach((f) => {
      [-6, 6].forEach((cents) => {
        const o = ctx.createOscillator(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
        o.type = "sawtooth"; o.frequency.value = f; o.detune.value = cents;
        lp.type = "lowpass"; lp.frequency.value = 900;
        o.connect(lp); lp.connect(g); out(g, 0.6);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(v, t + dur * 0.35);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.start(t); o.stop(t + dur + 0.1);
      });
    });
  }
  function bass(f, t, dur, v = 0.22) {
    const o = ctx.createOscillator(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = "triangle"; o.frequency.value = f;
    lp.type = "lowpass"; lp.frequency.value = 400;
    o.connect(lp); lp.connect(g); out(g, 0.05);
    env(g, t, 0.01, v, dur);
    o.start(t); o.stop(t + dur + 0.1);
  }

  /* ---------- percussion ---------- */
  function thump(t, f0, f1, d, v) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + d);
    o.connect(g); out(g, 0.1);
    env(g, t, 0.003, v, d);
    o.start(t); o.stop(t + d + 0.05);
  }
  function noise(t, type, freq, d, v, q = 1) {
    const n = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    n.buffer = noiseBuf; f.type = type; f.frequency.value = freq; f.Q.value = q;
    n.connect(f); f.connect(g); out(g, 0.15);
    env(g, t, 0.002, v, d);
    n.start(t, Math.random() * 0.5); n.stop(t + d + 0.05);
  }
  const KITS = {
    dholak(s, t) {
      if ([0, 6, 8, 11].includes(s)) thump(t, 180, 70, 0.28, 0.55);      // dha (bass head)
      if ([3, 4, 10, 12, 14].includes(s)) noise(t, "bandpass", 2600, 0.07, 0.3, 3); // ta
      if ([2, 7, 15].includes(s)) thump(t, 520, 380, 0.08, 0.12);         // ghe tap
      if (s % 2 === 1 && Math.random() < 0.3) noise(t, "highpass", 7000, 0.03, 0.06); // manjira
    },
    disco(s, t) {
      if (s % 4 === 0) thump(t, 150, 45, 0.3, 0.8);                     // kick
      if (s % 4 === 2) noise(t, "highpass", 8000, 0.12, 0.18);          // open hat
      if (s % 2 === 1) noise(t, "highpass", 9000, 0.03, 0.06);          // closed hat
      if (s === 4 || s === 12) { [0, 0.012, 0.024].forEach((o) => noise(t + o, "bandpass", 1500, 0.1, 0.25, 1.2)); } // clap
    },
    tabla(s, t) {
      if (s === 0 || s === 8) thump(t, 140, 60, 0.6, 0.35);
      if ([3, 6, 11, 14].includes(s)) thump(t, 620, 560, 0.12, 0.09);
      if (s === 12) noise(t, "bandpass", 3000, 0.05, 0.1, 4);
    },
    brush(s, t) {
      if (s % 4 === 0) thump(t, 90, 50, 0.4, 0.25);
      if (s % 2 === 0) noise(t, "bandpass", 5000, 0.18, 0.04, 0.7);
      if (s === 4 || s === 12) noise(t, "bandpass", 2200, 0.22, 0.08, 0.8);
    },
  };

  /* ---------- tanpura-style drone ---------- */
  function startDrone(root) {
    if (droneNodes) return retuneDrone(root);
    const g = ctx.createGain(); g.gain.value = 0;
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 700; lp.Q.value = 2;
    const lfo = ctx.createOscillator(), lg = ctx.createGain();
    lfo.frequency.value = 0.15; lg.gain.value = 350; lfo.connect(lg); lg.connect(lp.frequency); lfo.start();
    const oscs = [0.5, 0.75, 1].map((m) => {
      const o = ctx.createOscillator(); o.type = "sawtooth"; o.frequency.value = root * m; o.connect(lp); o.start(); return [o, m];
    });
    lp.connect(g); out(g, 0.5);
    droneNodes = { g, oscs };
    g.gain.setTargetAtTime(0.035, ctx.currentTime, 1.5);
  }
  function retuneDrone(root) { droneNodes.oscs.forEach(([o, m]) => o.frequency.setTargetAtTime(root * m, ctx.currentTime, 0.6)); }
  function setDrone(on, root) {
    if (on) { startDrone(root); droneNodes.g.gain.setTargetAtTime(0.035, ctx.currentTime, 1); }
    else if (droneNodes) droneNodes.g.gain.setTargetAtTime(0, ctx.currentTime, 0.8);
  }

  /* ---------- composition ---------- */
  function makeMotif() {
    // 16-step phrase: random walk over the scale, landing on the tonic
    motif = [];
    let idx = 2 + Math.floor(Math.random() * 3);
    for (let s = 0; s < 16; s++) {
      if (s % mood.every !== 0 || Math.random() > mood.density) { motif.push(null); continue; }
      idx += [-2, -1, -1, 0, 1, 1, 2][Math.floor(Math.random() * 7)];
      idx = Math.max(0, Math.min(mood.scale.length - 1, idx));
      motif.push(idx);
    }
    motif[0] = motif[0] ?? 0;
    motif[12] = mood.every <= 4 ? 0 : motif[12];
  }

  function schedule(s, t) {
    const sd = 60 / mood.bpm / 4; // one 16th note
    if (s === 0) {
      if (pending) applyMood(pending);
      if (bar % 4 === 3) makeMotif(); // fresh variation every 4 bars
      // chords / pads
      if (mood.pad && bar % 2 === 0) {
        const prog = [[0, 7, 12], [5, 9, 12], [3, 7, 10], [7, 11, 14]];
        const ch = prog[(bar / 2) % prog.length].map((x) => hz(mood.root, x));
        pad(ch, t, sd * 32);
      }
    }
    // bass line
    if (mood.bass && s % 4 === 0) {
      const roots = [0, 0, 5, 7];
      bass(hz(mood.root / 2, roots[bar % 4] + (s === 8 ? 12 : 0)), t, sd * 3);
    }
    // melody
    const deg = motif[s];
    if (deg !== null && deg !== undefined) {
      const f = hz(mood.root * 2, mood.scale[deg]);
      if (mood.lead === "santoor") santoor(f, t);
      else if (mood.lead === "bell") bell(f, t);
      else if (mood.lead === "flute") flute(f, t, sd * mood.every * 0.95);
      else if (mood.lead === "synth") synth(f, t);
    }
    // drums
    if (mood.drums) KITS[mood.drums](s, t);
  }

  function applyMood(name) {
    pending = null;
    moodName = name; mood = MOODS[name];
    makeMotif();
    setDrone(mood.drone, mood.root);
  }

  function tick() {
    while (nextTime < ctx.currentTime + 0.15) {
      schedule(step, nextTime);
      nextTime += 60 / mood.bpm / 4;
      step = (step + 1) % 16;
      if (step === 0) bar++;
    }
  }

  /* ---------- custom audio files (optional) ---------- */
  function playCustom(name) {
    const src = CUSTOM_AUDIO[name];
    if (customEl && customEl.dataset.name === name) return !!src;
    if (customEl) { const old = customEl; fadeEl(old, 0, () => old.pause()); customEl = null; }
    if (!src) return false;
    const a = new Audio(src); a.loop = true; a.volume = 0; a.dataset.name = name;
    a.play().catch(() => {});
    fadeEl(a, 0.85); customEl = a;
    return true;
  }
  function fadeEl(a, to, done) {
    const from = a.volume, t0 = performance.now();
    const f = (now) => { const k = Math.min(1, (now - t0) / 1200); a.volume = from + (to - from) * k; k < 1 ? requestAnimationFrame(f) : done && done(); };
    requestAnimationFrame(f);
  }

  /* ---------- public API ---------- */
  return {
    start() {
      init();
      ctx.resume();
      playing = true;
      const usingCustom = playCustom(moodName);
      master.gain.setTargetAtTime(usingCustom ? 0 : 0.85, ctx.currentTime, 0.6);
      if (!timer) {
        nextTime = ctx.currentTime + 0.1;
        if (mood.drone) startDrone(mood.root);
        timer = setInterval(tick, 25);
      }
    },
    stop() {
      if (!ctx) return;
      playing = false;
      master.gain.setTargetAtTime(0, ctx.currentTime, 0.25);
      if (customEl) customEl.pause();
      setTimeout(() => { if (!playing) { clearInterval(timer); timer = null; ctx.suspend(); } }, 900);
    },
    setMood(name) {
      if (!MOODS[name] || name === (pending || moodName)) return;
      if (!ctx || !playing) { moodName = name; mood = MOODS[name]; return; }
      const usingCustom = playCustom(name);
      master.gain.setTargetAtTime(usingCustom ? 0 : 0.85, ctx.currentTime, 0.6);
      pending = name; // switch on the next bar line so it stays in time
    },
    levels(n) {
      if (!analyser || !playing) return new Array(n).fill(0);
      const d = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(d);
      const out = [];
      for (let i = 0; i < n; i++) out.push(d[1 + i * 3] / 255);
      if (customEl && !customEl.paused) return out.map(() => 0.3 + Math.random() * 0.6);
      return out;
    },
    get playing() { return playing; },
  };
})();

/* =========================================================
   PARTICLES
   ========================================================= */
const Particles = (() => {
  const cv = document.getElementById("particles");
  const c = cv.getContext("2d");
  let W, H, dpr, items = [], theme = "intro";
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const lite = matchMedia("(pointer: coarse)").matches; // touch devices: skip costly glow
  const MAX = () => (innerWidth < 700 ? 26 : 46);

  const STYLES = {
    intro:     { kinds: ["dust", "dust", "note"], colors: ["#f1d98a", "#d4af37", "#fff3c4"] },
    haldi:     { kinds: ["petal", "petal", "petal", "note"], colors: ["#f2a900", "#ff8c1a", "#ffd23f", "#e94e1b", "#d6246e"] },
    sangeet:   { kinds: ["sparkle", "sparkle", "sparkle", "note"], colors: ["#fff3c4", "#e9c46a", "#e8e8e8", "#d7c3ff"] },
    pheras:    { kinds: ["petal", "petal", "heart", "note"], colors: ["#b3122e", "#e0446a", "#f3a6b8", "#7a0f1f"] },
    reception: { kinds: ["star", "star", "dust", "note"], colors: ["#fff3c4", "#d4af37", "#8fb5ff", "#3fbf95"] },
  };

  function resize() {
    dpr = Math.min(devicePixelRatio || 1, 2);
    W = cv.width = innerWidth * dpr; H = cv.height = innerHeight * dpr;
  }
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  function spawn(initial) {
    const st = STYLES[theme];
    const kind = pick(st.kinds);
    const rising = kind === "note" || kind === "dust";
    return {
      kind, color: pick(st.colors),
      x: rnd(0, W),
      y: initial ? rnd(0, H) : rising ? H + 20 * dpr : -20 * dpr,
      s: rnd(kind === "petal" ? 6 : 2, kind === "petal" ? 12 : kind === "note" ? 16 : 5) * dpr,
      vx: rnd(-0.3, 0.3) * dpr,
      vy: (rising ? -rnd(0.25, 0.7) : kind === "star" ? 0.04 : rnd(0.5, 1.3)) * dpr,
      r: rnd(0, Math.PI * 2), vr: rnd(-0.03, 0.03),
      tw: rnd(0, Math.PI * 2), life: 1, fading: false,
      sym: pick(["♪", "♫", "♩", "♬"]),
    };
  }

  function draw(p) {
    c.save(); c.translate(p.x, p.y); c.rotate(p.r);
    const tw = 0.55 + 0.45 * Math.sin(p.tw);
    c.globalAlpha = p.life * (p.kind === "sparkle" || p.kind === "star" ? tw : 0.85);
    c.fillStyle = p.color;
    switch (p.kind) {
      case "petal":
        c.beginPath(); c.ellipse(0, 0, p.s, p.s * 0.5, 0, 0, Math.PI * 2); c.fill();
        c.globalAlpha *= 0.4; c.fillStyle = "#fff"; c.beginPath(); c.ellipse(-p.s * 0.2, -p.s * 0.1, p.s * 0.4, p.s * 0.15, 0, 0, Math.PI * 2); c.fill();
        break;
      case "heart": {
        const s = p.s * 0.7; c.beginPath();
        c.moveTo(0, s * 0.4);
        c.bezierCurveTo(-s, -s * 0.4, -s * 0.4, -s * 1.2, 0, -s * 0.5);
        c.bezierCurveTo(s * 0.4, -s * 1.2, s, -s * 0.4, 0, s * 0.4); c.fill(); break;
      }
      case "sparkle": case "star": {
        const s = p.s * (p.kind === "sparkle" ? 1.6 : 1.1);
        c.beginPath();
        for (let i = 0; i < 4; i++) { c.rotate(Math.PI / 2); c.moveTo(0, 0); c.quadraticCurveTo(s * 0.15, s * 0.15, 0, s); c.quadraticCurveTo(-s * 0.15, s * 0.15, 0, 0); }
        c.fill(); if (!lite) { c.shadowColor = p.color; c.shadowBlur = 8 * dpr; c.fill(); } break;
      }
      case "note":
        c.rotate(-p.r * 0.8); c.font = `${p.s * 1.6}px serif`; c.globalAlpha *= 0.55; c.fillText(p.sym, 0, 0); break;
      default:
        c.beginPath(); c.arc(0, 0, p.s * 0.5, 0, Math.PI * 2); if (!lite) { c.shadowColor = p.color; c.shadowBlur = 6 * dpr; } c.fill();
    }
    c.restore();
  }

  function frame(t) {
    c.clearRect(0, 0, W, H);
    const boost = Music.playing ? 1.35 : 1;
    while (items.filter((p) => !p.fading).length < MAX()) items.push(spawn(false));
    items.forEach((p) => {
      p.x += p.vx * boost + Math.sin(t / 1400 + p.tw) * 0.25 * dpr;
      p.y += p.vy * boost; p.r += p.vr; p.tw += 0.05;
      if (p.fading) p.life -= 0.035;
      if (p.y > H + 30 * dpr || p.y < -40 * dpr || p.x < -40 * dpr || p.x > W + 40 * dpr) p.life = 0;
      draw(p);
    });
    items = items.filter((p) => p.life > 0);
    requestAnimationFrame(frame);
  }

  return {
    start() {
      if (reduce) return;
      resize(); addEventListener("resize", resize); addEventListener("orientationchange", () => setTimeout(resize, 250));
      for (let i = 0; i < MAX(); i++) items.push(spawn(true));
      requestAnimationFrame(frame);
    },
    setTheme(name) {
      if (!STYLES[name] || name === theme) return;
      theme = name;
      items.forEach((p) => (p.fading = true));
      for (let i = 0; i < MAX() * 0.6; i++) items.push(spawn(true));
    },
  };
})();

/* =========================================================
   PAGE WIRING
   ========================================================= */
document.addEventListener("DOMContentLoaded", () => {
  const body = document.body;
  const opening = document.getElementById("opening");
  const player = document.getElementById("player");
  const nowPlaying = document.getElementById("nowPlaying");
  const eqBars = [...document.querySelectorAll(".eq i")];

  body.classList.add("locked");
  Particles.start();

  /* ----- Opening ----- */
  document.getElementById("openBtn").addEventListener("click", () => {
    if (navigator.vibrate) navigator.vibrate([18, 40, 18]);
    Music.start();
    setPlayingUI(true);
    opening.classList.add("open");
    opening.setAttribute("aria-hidden", "true");
    setTimeout(() => {
      opening.classList.add("gone");
      body.classList.remove("locked");
      player.classList.add("show");
    }, 1700);
  });

  /* ----- Player ----- */
  function setPlayingUI(on) {
    player.classList.toggle("playing", on);
    body.classList.toggle("music-on", on);
  }
  document.getElementById("playBtn").addEventListener("click", () => {
    if (Music.playing) { Music.stop(); setPlayingUI(false); }
    else { Music.start(); setPlayingUI(true); }
  });
  (function eqLoop() {
    const lv = Music.levels(eqBars.length);
    eqBars.forEach((b, i) => (b.style.height = 4 + lv[i] * 18 + "px"));
    requestAnimationFrame(eqLoop);
  })();

  /* ----- Theme switching on scroll ----- */
  const zones = [...document.querySelectorAll("main [data-theme]")];
  const chapterLinks = [...document.querySelectorAll(".chapters a")];
  const THEME_COLORS = { intro: "#1a0f0a", haldi: "#f7b52c", sangeet: "#07070a", pheras: "#5c0a17", reception: "#0b1230" };
  let current = null;
  function updateTheme() {
    const mid = innerHeight * 0.5;
    const zone = zones.find((z) => { const r = z.getBoundingClientRect(); return r.top <= mid && r.bottom >= mid; });
    if (!zone) return;
    zones.forEach((z) => z.classList.toggle("active", z === zone));
    const theme = zone.dataset.theme;
    if (theme === current) return;
    current = theme;
    body.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]').content = THEME_COLORS[theme] || "#1a0f0a";
    chapterLinks.forEach((a) => a.classList.toggle("active", a.dataset.for === theme));
    Particles.setTheme(theme);
    Music.setMood(zone.dataset.track);
    nowPlaying.textContent = TRACK_TITLES[zone.dataset.track];
  }
  let ticking = false;
  addEventListener("scroll", () => {
    if (!ticking) { requestAnimationFrame(() => { updateTheme(); onScrollFx(); ticking = false; }); ticking = true; }
  }, { passive: true });
  updateTheme();


  /* ----- Progress bar, chapter nav, scroll-linked tilt (all devices) ----- */
  const progressBar = document.getElementById("progressBar");
  const chapters = document.getElementById("chapters");
  const hero = document.getElementById("hero");
  const sleeves = [...document.querySelectorAll(".sleeve")];
  function onScrollFx() {
    const max = document.documentElement.scrollHeight - innerHeight;
    progressBar.style.transform = `scaleX(${max > 0 ? scrollY / max : 0})`;
    chapters.classList.toggle("show", hero.getBoundingClientRect().bottom < innerHeight * 0.35);
    sleeves.forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.bottom < 0 || r.top > innerHeight) return;
      const k = ((r.top + r.height / 2) / innerHeight - 0.5) * 2; // -1 (top) .. 1 (bottom)
      el.style.setProperty("--ptilt", (k * 6).toFixed(2) + "deg");
    });
  }
  onScrollFx();
  addEventListener("resize", onScrollFx);

  /* Mouse: tilt the album sleeve toward the pointer */
  if (matchMedia("(hover: hover) and (pointer: fine)").matches) {
    sleeves.forEach((el) => {
      el.addEventListener("pointermove", (e) => {
        const r = el.getBoundingClientRect();
        el.style.setProperty("--tilt", (((e.clientX - r.left) / r.width - 0.5) * 10).toFixed(2) + "deg");
      });
      el.addEventListener("pointerleave", () => el.style.removeProperty("--tilt"));
    });
  }

  /* ----- Lightbox: tap any illustration to view it full screen ----- */
  const lb = document.getElementById("lightbox");
  const lbImg = lb.querySelector("img");
  const lbCap = lb.querySelector("figcaption");
  let lastFocus = null;
  function openLightbox(el) {
    const img = el.querySelector("img");
    const section = el.closest("section");
    const title = section.querySelector(".event-title, .hero-names");
    lbImg.src = img.src; lbImg.alt = img.alt;
    lbCap.textContent = title ? title.textContent.replace(/\s+/g, " ").trim() : "";
    lastFocus = document.activeElement;
    lb.hidden = false; body.classList.add("lb-open");
    requestAnimationFrame(() => lb.classList.add("open"));
    lb.querySelector(".lb-close").focus();
  }
  function closeLightbox() {
    if (lb.hidden) return;
    lb.classList.remove("open"); body.classList.remove("lb-open");
    setTimeout(() => { lb.hidden = true; lb.querySelector("figure").style.transform = ""; }, 350);
    if (lastFocus) lastFocus.focus({ preventScroll: true });
  }
  document.querySelectorAll(".sleeve, .portrait-arch").forEach((el) => {
    el.addEventListener("click", () => openLightbox(el));
    el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openLightbox(el); } });
  });
  lb.addEventListener("click", closeLightbox);
  addEventListener("keydown", (e) => { if (e.key === "Escape") closeLightbox(); });
  // swipe down to dismiss
  let y0 = null;
  const fig = lb.querySelector("figure");
  lb.addEventListener("touchstart", (e) => { if (e.touches.length === 1) y0 = e.touches[0].clientY; }, { passive: true });
  lb.addEventListener("touchmove", (e) => {
    if (y0 === null || e.touches.length !== 1) return;
    const dy = Math.max(0, e.touches[0].clientY - y0);
    fig.style.transform = `translateY(${dy}px) scale(${1 - dy / 2000})`;
    lb.style.opacity = String(Math.max(0.3, 1 - dy / 400));
  }, { passive: true });
  lb.addEventListener("touchend", (e) => {
    if (y0 === null) return;
    const dy = e.changedTouches[0].clientY - y0; y0 = null;
    lb.style.opacity = "";
    if (dy > 90) closeLightbox(); else fig.style.transform = "";
  });

  /* ----- Palette swatches: tap or hover to see the colour name ----- */
  document.querySelectorAll(".palette").forEach((pal) => {
    const label = pal.nextElementSibling;
    const swatches = [...pal.querySelectorAll("li")];
    swatches.forEach((li) => {
      li.tabIndex = 0;
      li.setAttribute("role", "button");
      li.setAttribute("aria-label", li.title);
      li.dataset.name = li.title; li.removeAttribute("title"); // avoid double tooltips
      const pick = () => {
        swatches.forEach((x) => x.classList.toggle("picked", x === li));
        label.textContent = li.dataset.name;
        if (navigator.vibrate) navigator.vibrate(8);
      };
      li.addEventListener("click", pick);
      li.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") pick(); });
      li.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } });
    });
  });

  /* ----- Reveal on scroll ----- */
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
  }, { threshold: 0.18, rootMargin: "0px 0px -40px 0px" });
  document.querySelectorAll(".reveal").forEach((el) => io.observe(el));

  /* ----- Countdown ----- */
  const cd = { d: cdEl("days"), h: cdEl("hours"), m: cdEl("mins"), s: cdEl("secs") };
  function cdEl(id) { return document.getElementById("cd-" + id); }
  function tickCountdown() {
    let diff = Math.max(0, EVENT_START - Date.now());
    if (diff === 0) {
      document.getElementById("countdown").innerHTML = '<p class="hero-lede">The celebrations have begun ✦</p>';
      return;
    }
    const pad = (n) => String(n).padStart(2, "0");
    cd.d.textContent = pad(Math.floor(diff / 864e5)); diff %= 864e5;
    cd.h.textContent = pad(Math.floor(diff / 36e5)); diff %= 36e5;
    cd.m.textContent = pad(Math.floor(diff / 6e4)); diff %= 6e4;
    cd.s.textContent = pad(Math.floor(diff / 1e3));
    setTimeout(tickCountdown, 1000);
  }
  tickCountdown();

  /* ----- Save the dates (Google Calendar, all-day 25–26 Jan 2027) ----- */
  const details = [
    "Haldi — 25 Jan, 11:00 AM · Royal Rajasthani Hues",
    "Tilak & Sangeet — 25 Jan, from 5 PM · Glitz & Glam",
    "Baraat & Pheras — 26 Jan, daytime · Crimson Romance",
    "Reception — 26 Jan, evening · Night of Grandeur",
  ].join("\n");
  document.getElementById("saveDate").href =
    "https://calendar.google.com/calendar/render?action=TEMPLATE" +
    "&text=" + encodeURIComponent("Shalvia & Aman — Wedding Celebrations") +
    "&dates=20270125/20270127" +
    "&details=" + encodeURIComponent(details);

  /* Pause music when the tab is hidden, resume when back */
  let wasPlaying = false;
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { wasPlaying = Music.playing; if (wasPlaying) { Music.stop(); setPlayingUI(false); } }
    else if (wasPlaying) { Music.start(); setPlayingUI(true); }
  });
});
