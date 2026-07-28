const { ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');

// --- Global State ---
let userLevel = parseInt(localStorage.getItem('mascot_level')) || 1;
let userEnergy = parseInt(localStorage.getItem('mascot_energy')) || 0;
let lastLoginDate = localStorage.getItem('mascot_last_login') || '';
let cpuThreshold = parseInt(localStorage.getItem('mascot_cpu_threshold')) || 80;
let memThreshold = parseInt(localStorage.getItem('mascot_mem_threshold')) || 85;
let allowWalking = localStorage.getItem('mascot_allow_walking') !== 'false';

// Resolve project directory synchronously
let rawPath = window.location.pathname;
if (rawPath.startsWith('/') && rawPath.charAt(2) === ':') {
  rawPath = rawPath.substring(1);
}
const htmlPath = decodeURIComponent(rawPath);
const lastSlash = Math.max(htmlPath.lastIndexOf('/'), htmlPath.lastIndexOf('\\'));
const projectDir = htmlPath.substring(0, lastSlash);

// Database files paths
const charsFilePath = path.join(projectDir, 'assets', 'custom_characters.json');
const imagesFilePath = path.join(projectDir, 'assets', 'custom_images.json');
const dialoguesFilePath = path.join(projectDir, 'assets', 'custom_dialogues.json');
const historyFilePath = path.join(projectDir, 'assets', 'custom_history.json');
const mediaFilePath = path.join(projectDir, 'assets', 'custom_media.json');

// Read custom database files (falling back to LocalStorage or empty arrays, and seeding files)
let customCharacters = [];
try {
  if (fs.existsSync(charsFilePath)) {
    customCharacters = JSON.parse(fs.readFileSync(charsFilePath, 'utf8'));
  } else {
    customCharacters = JSON.parse(localStorage.getItem('mascot_custom_characters')) || [];
    fs.writeFileSync(charsFilePath, JSON.stringify(customCharacters, null, 2), 'utf8');
  }
} catch (e) { console.error(e); }

let customImages = {};
try {
  if (fs.existsSync(imagesFilePath)) {
    customImages = JSON.parse(fs.readFileSync(imagesFilePath, 'utf8'));
  } else {
    customImages = JSON.parse(localStorage.getItem('mascot_custom_images')) || {};
    fs.writeFileSync(imagesFilePath, JSON.stringify(customImages, null, 2), 'utf8');
  }
} catch (e) { console.error(e); }

let customDialogues = {};
try {
  if (fs.existsSync(dialoguesFilePath)) {
    customDialogues = JSON.parse(fs.readFileSync(dialoguesFilePath, 'utf8'));
  } else {
    customDialogues = JSON.parse(localStorage.getItem('mascot_custom_dialogues')) || {};
    fs.writeFileSync(dialoguesFilePath, JSON.stringify(customDialogues, null, 2), 'utf8');
  }
} catch (e) { console.error(e); }

let imageHistory = {};
try {
  if (fs.existsSync(historyFilePath)) {
    imageHistory = JSON.parse(fs.readFileSync(historyFilePath, 'utf8'));
  } else {
    imageHistory = JSON.parse(localStorage.getItem('mascot_image_history')) || {};
    fs.writeFileSync(historyFilePath, JSON.stringify(imageHistory, null, 2), 'utf8');
  }
} catch (e) { console.error(e); }

let customMedia = [];
try {
  if (fs.existsSync(mediaFilePath)) {
    customMedia = JSON.parse(fs.readFileSync(mediaFilePath, 'utf8'));
  } else {
    customMedia = JSON.parse(localStorage.getItem('mascot_custom_media')) || [];
    fs.writeFileSync(mediaFilePath, JSON.stringify(customMedia, null, 2), 'utf8');
  }
} catch (e) { console.error(e); }

let loopMode = localStorage.getItem('mascot_media_loop_mode') || 'list'; // 'list' or 'single'
let currentTrackId = localStorage.getItem('mascot_current_track_id') || '';
let videoPlayer = null;
let mediaVolume = parseFloat(localStorage.getItem('mascot_media_volume')) || 0.8;

// Helper to save databases to both files and localStorage
function saveDb(name) {
  try {
    if (name === 'characters') {
      localStorage.setItem('mascot_custom_characters', JSON.stringify(customCharacters));
      fs.writeFileSync(charsFilePath, JSON.stringify(customCharacters, null, 2), 'utf8');
    } else if (name === 'images') {
      localStorage.setItem('mascot_custom_images', JSON.stringify(customImages));
      fs.writeFileSync(imagesFilePath, JSON.stringify(customImages, null, 2), 'utf8');
    } else if (name === 'dialogues') {
      localStorage.setItem('mascot_custom_dialogues', JSON.stringify(customDialogues));
      fs.writeFileSync(dialoguesFilePath, JSON.stringify(customDialogues, null, 2), 'utf8');
    } else if (name === 'history') {
      localStorage.setItem('mascot_image_history', JSON.stringify(imageHistory));
      fs.writeFileSync(historyFilePath, JSON.stringify(imageHistory, null, 2), 'utf8');
    } else if (name === 'media') {
      localStorage.setItem('mascot_custom_media', JSON.stringify(customMedia));
      fs.writeFileSync(mediaFilePath, JSON.stringify(customMedia, null, 2), 'utf8');
    }
  } catch (e) {
    console.error(`Error saving db ${name}:`, e);
  }
}

function getAllCharacters() {
  return [
    { id: 'cat', name: '魔法小貓', emoji: '🐱', source: '預設角色' },
    ...customCharacters
  ];
}

// Auto-restore default character configurations on boot
(function() {
  try {
    // Restore cat defaults by cleaning custom cat entries in localStorage directly on global state variables
    const states = ['idle', 'walk_left', 'walk_right', 'walk_up', 'walk_down', 'walk_up_left', 'walk_up_right', 'walk_down_left', 'walk_down_right', 'dragging', 'clicked', 'falling'];
    states.forEach(state => {
      delete customImages[`cat_${state}`];
      delete customDialogues[`cat_${state}`];
      delete imageHistory[`cat_${state}`];
    });

    saveDb('images');
    saveDb('dialogues');
    saveDb('history');
  } catch (e) {
    console.error("Auto setup error:", e);
  }
})();

function renderCharactersList() {
  const grid = document.getElementById('chars-list-grid');
  if (!grid) return;
  grid.innerHTML = '';
  
  const chars = getAllCharacters();
  chars.forEach(char => {
    const card = document.createElement('div');
    card.className = 'char-card';
    if (currentCharacter === char.id) {
      card.classList.add('active-char');
    }
    
    card.innerHTML = `
      <div class="char-info-col">
        <div class="char-name">${char.name}</div>
        <div class="char-source">作品: ${char.source || '未分類'}</div>
      </div>
      <div class="char-status">${currentCharacter === char.id ? '已啟用' : '點擊啟用'}</div>
    `;
    
    card.addEventListener('click', () => {
      saveCurrentCharacter(char.id);
      renderCharactersList();
      
      const imgEl = document.getElementById('mascot-img');
      if (imgEl) imgEl.style.filter = 'none';
      
      document.getElementById('library-modal').classList.add('hidden');
      showDialogue(`✨ 切換角色為: ${char.name}！`);
      
      setMascotState(currentMascotState);
    });
    
    grid.appendChild(card);
  });
  renderActionsTab();
}

function renderAdminSelectChar() {
  const select = document.getElementById('admin-select-char');
  if (!select) return;
  const currentVal = select.value;
  select.innerHTML = '';
  
  const chars = getAllCharacters();
  chars.forEach(char => {
    const opt = document.createElement('option');
    opt.value = char.id;
    opt.innerText = char.name;
    select.appendChild(opt);
  });
  
  if (chars.some(c => c.id === currentVal)) {
    select.value = currentVal;
  } else {
    select.value = 'cat';
  }
  
  // Update delete button visibility
  const deleteBtn = document.getElementById('admin-delete-char-btn');
  if (deleteBtn) {
    if (select.value === 'cat') {
      deleteBtn.style.display = 'none';
    } else {
      deleteBtn.style.display = 'inline-block';
    }
  }
}

// Daily task counters
let dailyProgress = JSON.parse(localStorage.getItem('mascot_daily_progress')) || {
  date: '',
  loginClaimed: false,
  clickCount: 0,
  clickClaimed: false,
  walkCount: 0,
  walkClaimed: false,
  musicTime: 0, // in seconds
  musicClaimed: false
};

// Screen Index parsed from URL query parameters
const urlParams = new URLSearchParams(window.location.search);
const screenIndex = parseInt(urlParams.get('screenIndex')) || 0;

// Mascot Position & AI Variables
let windowX = parseInt(localStorage.getItem(`mascot_pos_x_${screenIndex}`)) || 500;
let windowY = parseInt(localStorage.getItem(`mascot_pos_y_${screenIndex}`)) || 500;
let dragStartHeight = windowY;
let allowDialogue = localStorage.getItem(`mascot_allow_dialogue_${screenIndex}`) !== 'false';
let mascotScale = parseFloat(localStorage.getItem(`mascot_scale_${screenIndex}`)) || 1.0;
let mascotFontSizeIdx = parseInt(localStorage.getItem(`mascot_fontsize_idx_${screenIndex}`)) || 1; // Default to index 1 (Medium)
const fontSizes = [13, 17, 21, 25];
const fontSizeNames = ['小', '中', '大', '特大'];

function applyFontSize() {
  const size = fontSizes[mascotFontSizeIdx];
  document.documentElement.style.setProperty('--mascot-font-size', `${size}px`);
  const btn = document.getElementById('menu-toggle-fontsize');
  if (btn) {
    btn.innerText = `字體大小: ${fontSizeNames[mascotFontSizeIdx]}`;
  }
}
function saveCurrentCharacter(charId) {
  currentCharacter = charId;
  localStorage.setItem(`mascot_current_character_${screenIndex}`, charId);
  updateMenuHeader();
}
function updateMenuHeader() {
  try {
    const menuHeader = document.querySelector('.menu-header');
    if (!menuHeader) return;
    const allChars = getAllCharacters();
    const charObj = allChars.find(c => c.id === currentCharacter);
    const charName = charObj ? charObj.name : '桌面寵物';
    menuHeader.innerText = `${charName}選單`;
  } catch (e) {
    console.error("updateMenuHeader error:", e);
  }
}
function logDebug(msg) {
  try {
    const logPath = path.join(__dirname, 'drag_debug.log');
    fs.appendFileSync(logPath, `${new Date().toISOString()} [Screen ${screenIndex}] ${msg}\n`, 'utf8');
  } catch (err) {
    console.error("logDebug failed:", err);
  }
}
let screenWidth = 1920;
let screenHeight = 1080;
const windowWidth = 450;
const windowHeight = 350;

let displayX = 0;
let displayY = 0;
let workWidth = 1920;
let workHeight = 1080;

let virtualDesktopMinX = 0;
let virtualDesktopMinY = 0;
let virtualWidth = 1920;
let virtualHeight = 1080;

function updateMascotDOMPosition() {
  const htmlX = windowX - virtualDesktopMinX;
  const htmlY = windowY - virtualDesktopMinY;
  mascotContainer.style.left = `${htmlX}px`;
  mascotContainer.style.top = `${htmlY}px`;
  
  localStorage.setItem(`mascot_pos_x_${screenIndex}`, windowX);
  localStorage.setItem(`mascot_pos_y_${screenIndex}`, windowY);
}

let isWalking = false;
let walkDirection = 'right'; // 'right', 'left', 'up', 'down'
let walkSpeed = 1.5;
let walkTimer = null;
let activeActionTimer = null;

function clearActiveActionTimer() {
  if (activeActionTimer) {
    clearTimeout(activeActionTimer);
    activeActionTimer = null;
  }
  if (walkTimer) {
    clearTimeout(walkTimer);
    walkTimer = null;
  }
}
let walkStepsCount = 0;
let walkSegmentsLeft = 0;
let walkStepsLeft = 0;

let isDragging = false;
let isFalling = false;
let fallSpeed = 0;
const gravity = 0.8;
let taskbarOffset = 50; // estimate taskbar height on Windows

let currentMascotState = 'idle'; // idle, walking, dragging, falling, clicked
let currentCharacter = localStorage.getItem(`mascot_current_character_${screenIndex}`);
if (!currentCharacter) {
  currentCharacter = 'cat';
  localStorage.setItem(`mascot_current_character_${screenIndex}`, 'cat');
}

// Dialog variables
let dialogueTimeout = null;
let typewriterInterval = null;

// --- Initialize DOM Elements ---
const mascotContainer = document.getElementById('mascot-container');
const mascotBody = document.getElementById('mascot-body');
const speechBubble = document.getElementById('speech-bubble');
const dialogueText = document.getElementById('dialogue-text');
const contextMenu = document.getElementById('context-menu');

// Modals
const tasksModal = document.getElementById('tasks-modal');
const libraryModal = document.getElementById('library-modal');
const quickLaunchModal = document.getElementById('quick-launch-modal');

// --- Audio Synthesizer (Chiptune 8-Bit) ---
let audioCtx = null;
let synthInterval = null;
let currentTrack = null;
let isPlaying = false;
let isAudioSilent = false;
let playTimeTimer = null;
let audioSourceNode = null;
let analyserNode = null;
let visualizerAnimationId = null;
let menuMemoryInterval = null;

const tracks = [
  {
    title: "奈何境迷宮之風 (OP Theme)",
    tempo: 120,
    notes: [
      { note: "C4", dur: 0.5 }, { note: "E4", dur: 0.5 }, { note: "G4", dur: 0.5 }, { note: "C5", dur: 0.5 },
      { note: "A4", dur: 0.5 }, { note: "F4", dur: 0.5 }, { note: "A4", dur: 0.5 }, { note: "G4", dur: 1.0 },
      { note: "F4", dur: 0.5 }, { note: "E4", dur: 0.5 }, { note: "D4", dur: 0.5 }, { note: "G4", dur: 0.5 },
      { note: "E4", dur: 1.0 }, { note: "C4", dur: 1.0 }
    ]
  },
  {
    title: "狂亂死神戰鬥曲 (ED Theme)",
    tempo: 140,
    notes: [
      { note: "A3", dur: 0.25 }, { note: "C4", dur: 0.25 }, { note: "E4", dur: 0.25 }, { note: "A4", dur: 0.25 },
      { note: "G#4", dur: 0.5 }, { note: "E4", dur: 0.5 }, { note: "A4", dur: 0.5 }, { note: "B4", dur: 0.5 },
      { note: "C5", dur: 0.25 }, { note: "B4", dur: 0.25 }, { note: "A4", dur: 0.25 }, { note: "G#4", dur: 0.25 },
      { note: "F4", dur: 0.5 }, { note: "D4", dur: 0.5 }, { note: "E4", dur: 1.0 }
    ]
  },
  {
    title: "酒館之歌 (Tavern Theme)",
    tempo: 100,
    notes: [
      { note: "G4", dur: 0.5 }, { note: "C4", dur: 0.5 }, { note: "D4", dur: 0.25 }, { note: "E4", dur: 0.25 }, { note: "F4", dur: 0.5 },
      { note: "E4", dur: 0.5 }, { note: "D4", dur: 0.5 }, { note: "C4", dur: 1.0 },
      { note: "E4", dur: 0.5 }, { note: "F4", dur: 0.5 }, { note: "G4", dur: 0.5 }, { note: "A4", dur: 0.5 },
      { note: "G4", dur: 0.5 }, { note: "F4", dur: 0.5 }, { note: "E4", dur: 1.0 }
    ]
  }
];

const noteFreqs = {
  "C4": 261.63, "C#4": 277.18, "D4": 293.66, "E4": 329.63, "F4": 349.23,
  "G4": 392.00, "G#4": 415.30, "A4": 440.00, "B4": 493.88,
  "C5": 523.25, "A3": 220.00, "G3": 196.00, "F3": 174.61, "E3": 164.81
};

function playNote(freq, duration) {
  if (!audioCtx) return;
  
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  
  osc.type = 'triangle'; // 8-bit style triangle wave for melody
  osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
  
  gain.gain.setValueAtTime(0.15 * mediaVolume, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration - 0.05);
  
  osc.connect(gain);
  if (analyserNode) {
    gain.connect(analyserNode);
  } else {
    gain.connect(audioCtx.destination);
  }
  
  osc.start();
  osc.stop(audioCtx.currentTime + duration);
  
  // Prevent Web Audio memory leak: disconnect nodes after note stops playing
  setTimeout(() => {
    try {
      osc.disconnect();
      gain.disconnect();
    } catch (e) {}
  }, (duration + 0.2) * 1000);
}

function initAudioAnalyser() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  if (!analyserNode) {
    analyserNode = audioCtx.createAnalyser();
    analyserNode.fftSize = 64; // 32 frequency bins
    
    // Connect video player
    if (videoPlayer && !audioSourceNode) {
      try {
        audioSourceNode = audioCtx.createMediaElementSource(videoPlayer);
        audioSourceNode.connect(analyserNode);
        analyserNode.connect(audioCtx.destination);
      } catch (e) {
        console.error("Failed to connect video source node:", e);
      }
    }
  }
}

function startVisualizerAnimation() {
  initAudioAnalyser();
  const canvas = document.getElementById('visualizer-canvas');
  if (!canvas) return;
  
  const canvasCtx = canvas.getContext('2d');
  const bufferLength = analyserNode.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);
  
  // Set explicit canvas resolution to avoid blur
  canvas.width = canvas.clientWidth || 300;
  canvas.height = canvas.clientHeight || 110;
  
  function draw() {
    if (!isPlaying) {
      canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    
    // Performance optimization: pause draw loop if player modal is closed
    const modal = document.getElementById('media-modal');
    if (modal && modal.classList.contains('hidden')) {
      visualizerAnimationId = null;
      return;
    }
    
    visualizerAnimationId = requestAnimationFrame(draw);
    if (isAudioSilent) {
      // Generate synthetic frequency data (dancing waves!) for the silent visualizer side
      const time = Date.now() / 200;
      for (let i = 0; i < bufferLength; i++) {
        const val = 40 + Math.sin(i * 0.1 + time) * 30 + Math.cos(i * 0.05 - time * 0.5) * 20 + Math.random() * 10;
        dataArray[i] = Math.max(0, Math.min(255, val));
      }
    } else {
      analyserNode.getByteFrequencyData(dataArray);
    }
    
    // Draw semi-transparent background for neon glow motion trails!
    canvasCtx.fillStyle = 'rgba(0, 0, 0, 0.25)';
    canvasCtx.fillRect(0, 0, canvas.width, canvas.height);
    
    const barWidth = (canvas.width / bufferLength) * 1.6;
    let barHeight;
    let x = 0;
    
    for (let i = 0; i < bufferLength; i++) {
      barHeight = dataArray[i] * 0.45; // Scale height
      
      // Dynamic HSL neon colors that change over time and frequency
      const hue = (i * 360 / bufferLength + Date.now() / 40) % 360;
      // Draw background glow bar (slightly wider and taller with lower opacity)
      canvasCtx.fillStyle = `hsla(${hue}, 85%, 65%, 0.15)`;
      canvasCtx.fillRect(x - 2, canvas.height - barHeight - 2, barWidth + 1, barHeight + 2);
      
      // Draw foreground solid bar
      canvasCtx.fillStyle = `hsla(${hue}, 85%, 65%, 0.85)`;
      canvasCtx.fillRect(x, canvas.height - barHeight, barWidth - 3, barHeight);
      
      x += barWidth;
    }
  }
  
  if (visualizerAnimationId) cancelAnimationFrame(visualizerAnimationId);
  draw();
}

function getPlaylist() {
  const list = [];
  
  customMedia.forEach(m => {
    list.push({
      id: m.id,
      name: (m.type === 'video' ? '🎬 ' : '🎵 ') + m.name,
      type: m.type,
      path: m.path,
      unlocked: true,
      isCustom: true
    });
  });
  
  return list;
}

function playTrack(trackId, isRemote = false) {
  const playlist = getPlaylist();
  if (playlist.length === 0) {
    showDialogue("📭 播放清單目前是空的，請先點選「上傳影音」上傳您的影片或音樂檔案！");
    return;
  }
  
  const targetId = trackId || currentTrackId || playlist[0].id;
  const track = playlist.find(t => t.id === targetId) || playlist[0];
  if (!track) return;
  
  stopAllPlayback(true);
  
  currentTrackId = targetId;
  localStorage.setItem('mascot_current_track_id', targetId);
  isPlaying = true;
  isAudioSilent = isRemote;
  
  document.getElementById('playing-title').innerText = track.name;
  document.getElementById('player-play').innerText = "⏸";
  
  renderPlaylistUI();
  
  if (track.type === 'synth') {
    document.getElementById('media-visualizer-placeholder').style.display = 'flex';
    document.getElementById('media-video-player').style.display = 'none';
    if (!isAudioSilent) {
      startChiptune(track.trackIdx);
    }
    startVisualizerAnimation();
  } else {
    // Custom audio/video playing via HTML5 video element
    if (track.type === 'video') {
      document.getElementById('media-visualizer-placeholder').style.display = 'none';
      document.getElementById('media-video-player').style.display = 'block';
    } else {
      document.getElementById('media-visualizer-placeholder').style.display = 'flex';
      document.getElementById('media-video-player').style.display = 'none';
      startVisualizerAnimation();
    }
    
    if (!isAudioSilent) {
      videoPlayer.src = track.path;
      videoPlayer.volume = mediaVolume;
      videoPlayer.load();
      videoPlayer.play().catch(e => {
        console.error("Playback failed:", e);
      });
      startTaskTimer();
      showDialogue(`▶ 正在播放 ${track.name}`);
    } else {
      showDialogue(`🎵 正在同步播放 ${track.name} (另一螢幕輸出音源)`);
    }
  }

  // Broadcast to other windows to play silently
  if (!isRemote) {
    ipcRenderer.send('broadcast-ipc', 'sync-audio-play', targetId);
  }
}

function stopAllPlayback(keepSilentFlag = false) {
  const wasPlaying = isPlaying;
  isPlaying = false;
  if (!keepSilentFlag) {
    isAudioSilent = false;
  }
  stopChiptune();
  
  if (visualizerAnimationId) {
    cancelAnimationFrame(visualizerAnimationId);
    visualizerAnimationId = null;
  }
  
  const canvas = document.getElementById('visualizer-canvas');
  if (canvas) {
    const canvasCtx = canvas.getContext('2d');
    canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
  }
  
  if (videoPlayer) {
    videoPlayer.pause();
    videoPlayer.src = '';
    try {
      videoPlayer.load(); // Force release media file buffers and decoder memory from RAM
    } catch (e) {}
  }
  
  if (playTimeTimer) clearInterval(playTimeTimer);
  
  document.getElementById('player-play').innerText = "▶";
  document.getElementById('playing-title').innerText = "無";

  // Broadcast stop to other windows if triggered locally
  if (wasPlaying && !keepSilentFlag && !isAudioSilent) {
    ipcRenderer.send('broadcast-ipc', 'sync-audio-stop');
  }
}

function startTaskTimer() {
  if (playTimeTimer) clearInterval(playTimeTimer);
  let tickCount = 0;
  playTimeTimer = setInterval(() => {
    if (isPlaying) {
      dailyProgress.musicTime++;
      tickCount++;
      
      let needSave = false;
      if (dailyProgress.musicTime >= 60 && !dailyProgress.musicClaimed) {
        const musicBtn = document.getElementById('btn-task-music');
        if (musicBtn) {
          musicBtn.classList.remove('disabled');
          musicBtn.removeAttribute('disabled');
        }
        needSave = true; // Save immediately on task unlock
      }
      
      // Throttle localStorage writing to every 10s of active playing
      if (tickCount % 10 === 0 || needSave) {
        saveProgress();
      }
      
      // Redraw tasks UI ONLY if tasks modal is currently open on screen
      if (tasksModal && !tasksModal.classList.contains('hidden')) {
        updateTasksUI();
      } else {
        const musicTimeText = document.getElementById('music-time');
        if (musicTimeText) {
          musicTimeText.innerText = Math.min(dailyProgress.musicTime, 60);
        }
      }
    }
  }, 1000);
}

function onTrackEnded() {
  if (loopMode === 'single') {
    playTrack(currentTrackId);
  } else {
    playNextTrack();
  }
}

function playNextTrack() {
  const playlist = getPlaylist();
  const currentIndex = playlist.findIndex(t => t.id === currentTrackId);
  let nextIndex = (currentIndex + 1) % playlist.length;
  
  let attempts = 0;
  while (!playlist[nextIndex].unlocked && attempts < playlist.length) {
    nextIndex = (nextIndex + 1) % playlist.length;
    attempts++;
  }
  
  playTrack(playlist[nextIndex].id);
}

function playPrevTrack() {
  const playlist = getPlaylist();
  const currentIndex = playlist.findIndex(t => t.id === currentTrackId);
  let prevIndex = currentIndex - 1;
  if (prevIndex < 0) prevIndex = playlist.length - 1;
  
  let attempts = 0;
  while (!playlist[prevIndex].unlocked && attempts < playlist.length) {
    prevIndex = prevIndex - 1;
    if (prevIndex < 0) prevIndex = playlist.length - 1;
    attempts++;
  }
  
  playTrack(playlist[prevIndex].id);
}

function updateLoopModeUI() {
  const btn = document.getElementById('player-loop-mode');
  if (!btn) return;
  if (loopMode === 'single') {
    btn.innerText = "單曲循環 🔂";
  } else {
    btn.innerText = "全曲循環 🔁";
  }
}

function renderPlaylistUI() {
  const container = document.getElementById('media-list-container');
  if (!container) return;
  container.innerHTML = '';
  
  const playlist = getPlaylist();
  playlist.forEach(track => {
    const item = document.createElement('div');
    item.className = 'music-track-item';
    if (track.id === currentTrackId) {
      item.classList.add('active-track');
    }
    
    let lockText = '已解鎖';
    if (!track.unlocked) {
      item.classList.add('locked-track');
      lockText = `Lv.${track.reqLevel} 解鎖`;
    }
    
    const infoDiv = document.createElement('div');
    infoDiv.style.flex = '1';
    infoDiv.style.display = 'flex';
    infoDiv.style.flexDirection = 'column';
    infoDiv.style.gap = '2px';
    
    const titleSpan = document.createElement('span');
    titleSpan.className = 'track-title';
    titleSpan.innerText = track.name;
    infoDiv.appendChild(titleSpan);
    
    const lockSpan = document.createElement('span');
    lockSpan.className = 'track-lock';
    lockSpan.innerText = lockText;
    infoDiv.appendChild(lockSpan);
    
    item.appendChild(infoDiv);
    
    item.addEventListener('click', (e) => {
      if (e.target.classList.contains('delete-media-btn')) return;
      if (!track.unlocked) return;
      playTrack(track.id);
    });
    
    if (track.isCustom) {
      const delBtn = document.createElement('button');
      delBtn.className = 'delete-media-btn';
      delBtn.innerText = '🗑️';
      delBtn.style.background = 'none';
      delBtn.style.border = 'none';
      delBtn.style.cursor = 'pointer';
      delBtn.style.color = '#ff7675';
      delBtn.style.fontSize = '12px';
      delBtn.style.padding = '4px';
      delBtn.title = '刪除此影音';
      
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm(`確定要刪除自訂影音「${track.name.substring(2)}」嗎？`)) {
          if (currentTrackId === track.id) {
            stopAllPlayback();
          }
          
          try {
            let rawPath = window.location.pathname;
            if (rawPath.startsWith('/') && rawPath.charAt(2) === ':') {
              rawPath = rawPath.substring(1);
            }
            const htmlPath = decodeURIComponent(rawPath);
            const lastSlash = Math.max(htmlPath.lastIndexOf('/'), htmlPath.lastIndexOf('\\'));
            const projectDir = htmlPath.substring(0, lastSlash);
            
            const absolutePath = path.join(projectDir, track.path);
            if (fs.existsSync(absolutePath)) {
              fs.unlinkSync(absolutePath);
            }
          } catch (err) {
            console.error("Failed to delete media file:", err);
          }
          
          customMedia = customMedia.filter(m => m.id !== track.id);
          saveDb('media');
          
          showDialogue(`🗑️ 已刪除影音：${track.name.substring(2)}`);
          renderPlaylistUI();
        }
      });
      item.appendChild(delBtn);
    }
    
    container.appendChild(item);
  });
}

function startChiptune(trackIndex) {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  
  const track = tracks[trackIndex];
  currentTrack = trackIndex;
  
  let noteIdx = 0;
  
  function scheduler() {
    if (!isPlaying) return;
    const currentNote = track.notes[noteIdx];
    const freq = noteFreqs[currentNote.note] || 261.63;
    const durSec = currentNote.dur * (60 / track.tempo) * 2;
    
    playNote(freq, durSec);
    
    noteIdx = (noteIdx + 1);
    if (noteIdx >= track.notes.length) {
      if (loopMode === 'single') {
        noteIdx = 0;
      } else {
        onTrackEnded();
        return;
      }
    }
    synthInterval = setTimeout(scheduler, durSec * 1000);
  }
  
  scheduler();
  startTaskTimer();
  showDialogue("🎵 喵嚕~ 音樂好聽！");
}

function stopChiptune() {
  if (synthInterval) clearTimeout(synthInterval);
}

// --- IPC Interface setup ---
// Register window mouse ignore logic
function checkMouseHover(clientX, clientY) {
  // 1. If currently dragging or holding the mascot, NEVER ignore mouse events!
  if (isDragging) {
    ipcRenderer.send('set-ignore-mouse', false, { forward: false });
    return;
  }

  // 2. If context menu is open, capture all mouse events to allow clicking anywhere to dismiss it!
  if (contextMenu && !contextMenu.classList.contains('hidden')) {
    ipcRenderer.send('set-ignore-mouse', false, { forward: false });
    return;
  }

  // 3. If any modal is open, capture all mouse events for full modal interaction!
  if (isAnyModalOpen()) {
    ipcRenderer.send('set-ignore-mouse', false, { forward: false });
    return;
  }

  const interactiveElements = [
    mascotBody,
    speechBubble,
    contextMenu,
    tasksModal,
    libraryModal,
    document.getElementById('settings-modal'),
    document.getElementById('admin-modal'),
    document.getElementById('media-modal'),
    document.getElementById('quick-launch-modal'),
    document.getElementById('category-editor-modal'),
    document.getElementById('item-editor-modal')
  ];

  let onInteractive = false;
  for (const el of interactiveElements) {
    if (el && !el.classList.contains('hidden')) {
      const rect = el.getBoundingClientRect();
      // Give 25px forgiving hit-test padding for mascotBody to make hovering & clicking 100% reliable
      const pad = (el === mascotBody) ? 25 : 0;
      if (clientX >= (rect.left - pad) && clientX <= (rect.right + pad) &&
          clientY >= (rect.top - pad) && clientY <= (rect.bottom + pad)) {
        onInteractive = true;
        break;
      }
    }
  }

  ipcRenderer.send('set-ignore-mouse', !onInteractive, { forward: true });
}

function registerMouseIgnore() {
  window.addEventListener('mousemove', (e) => {
    checkMouseHover(e.clientX, e.clientY);
  });

  // Listen to hardware cursor screen position from main process so transparent windows NEVER lose hover tracking!
  ipcRenderer.on('global-cursor-pos', (event, point) => {
    const clientX = point.x - virtualDesktopMinX;
    const clientY = point.y - virtualDesktopMinY;
    checkMouseHover(clientX, clientY);
  });
}

// --- Character Dialogue Engine ---
function showDialogue(text, duration = 4000) {
  if (!allowDialogue) return;
  if (dialogueTimeout) clearTimeout(dialogueTimeout);
  if (typewriterInterval) clearInterval(typewriterInterval);
  
  speechBubble.classList.remove('hidden');
  dialogueText.innerText = '';
  
  let i = 0;
  typewriterInterval = setInterval(() => {
    if (i < text.length) {
      dialogueText.innerText += text.charAt(i);
      i++;
    } else {
      clearInterval(typewriterInterval);
    }
  }, 40);

  dialogueTimeout = setTimeout(() => {
    speechBubble.classList.add('hidden');
  }, duration);
}

// Generate dialogue based on PC stats or character
function handlePCStatusAlert(status) {
  if (isDragging || isFalling || currentMascotState === 'exiting') return; // Don't interrupt dragging/falling/exiting

  const currentHour = new Date().getHours();
  
  // Custom dialog logic
  if (status.cpu > cpuThreshold) {
    showDialogue(`💦 主人！電腦好燙喔！目前 CPU 使用率高達 ${status.cpu}%！小貓快熱昏了喵！`);
  } else if (status.memory > memThreshold) {
    showDialogue(`💾 記憶體快被吃光光了！目前使用率 ${status.memory}% (剩餘 ${status.freeMemMB}MB)！快關掉一些沒用的分頁吧！`);
  } else if (currentHour >= 23 || currentHour < 5) {
    showDialogue("💤 已經是深夜了呢，主人該睡覺了，熬夜傷肝喔！");
  } else {
    // Normal random cute text
    const normalTexts = {
      cat: [
        "喵嗚~ 今天也要元氣滿滿喔！",
        "主人，有空多摸摸我嘛~",
        "（眨眼）你在看我嗎喵？",
        "聽一首輕鬆的音樂吧！",
        "主人工作辛苦了，喝杯熱茶休息一下吧！"
      ]
    };
    
    // 25% chance of random lines every 3 seconds status update
    if (Math.random() < 0.15 && speechBubble.classList.contains('hidden')) {
      const list = normalTexts[currentCharacter] || normalTexts.cat;
      const randomLine = list[Math.floor(Math.random() * list.length)];
      showDialogue(randomLine);
    }
  }
}

const defaultTexts = {
  idle: "哈囉，主人！🐱",
  walk_left: "向左走走🚶‍♂️",
  walk_right: "向右前進👉",
  walk_up: "向上爬爬攀升🧗‍♂️",
  walk_down: "向下走去👇",
  walk_up_left: "往左上角爬行🧗‍♂️",
  walk_up_right: "往右上角漫步↗️",
  walk_down_left: "往左下角溜達↙️",
  walk_down_right: "往右下角滑行↘️",
  dragging: "放開我啦喵！><",
  falling: "哇啊啊！重力吸引中！💥",
  clicked: [
    "嘻嘻，主人找我玩嗎？✨",
    "喵嗚～最喜歡主人了！❤️",
    "抓到我了嗎？好開心喔！🐾",
    "蹭蹭～要給奴才罐罐嗎？罐罐愛好者！🥫",
    "呼嚕呼嚕～伸個懶腰喵！⭐"
  ],
  exiting: "再見囉，主人！我們會再見的！👋"
};

function showDialogueForState(char, state) {
  const customKey = `${char}_${state}`;
  let rawText = customDialogues[customKey] !== undefined ? customDialogues[customKey] : defaultTexts[state];
  let text = "";
  
  if (Array.isArray(rawText)) {
    text = rawText[Math.floor(Math.random() * rawText.length)];
  } else if (typeof rawText === 'string') {
    let lines = [];
    if (rawText.includes('|')) {
      lines = rawText.split('|').map(s => s.trim()).filter(Boolean);
    } else if (rawText.includes('\n')) {
      lines = rawText.split('\n').map(s => s.trim()).filter(Boolean);
    }
    if (lines.length > 0) {
      text = lines[Math.floor(Math.random() * lines.length)];
    } else {
      text = rawText;
    }
  }
  
  if (text !== undefined && text !== "") {
    showDialogue(text);
  }
}

// --- Mascot State Machine ---
function setMascotState(state) {
  const prevState = currentMascotState;
  currentMascotState = state;
  mascotContainer.className = ''; // Reset classes
  mascotContainer.classList.add(state);
  
  // Update image source based on state for WebP/JPG rendering
  const imgEl = document.getElementById('mascot-img');
  if (imgEl) {
    let resolvedState = state;
    if (state === 'falling') {
      const fallingKey = `${currentCharacter}_falling`;
      const draggingKey = `${currentCharacter}_dragging`;
      if (!customImages[fallingKey] && customImages[draggingKey]) {
        resolvedState = 'dragging';
      }
    }
    
    // Multi-set random trigger support for 'clicked' state!
    if (state === 'clicked') {
      const clickedKey = `${currentCharacter}_clicked`;
      const historyList = imageHistory[clickedKey] || [];
      if (historyList.length > 0) {
        const randomImg = historyList[Math.floor(Math.random() * historyList.length)];
        imgEl.src = randomImg;
        imgEl.style.transform = 'none';
      } else if (customImages[clickedKey]) {
        imgEl.src = customImages[clickedKey];
        imgEl.style.transform = 'none';
      } else {
        imgEl.src = 'assets/clicked.webp';
        imgEl.style.transform = 'none';
      }
    } else {
      const customKey = `${currentCharacter}_${resolvedState}`;
      if (customImages[customKey]) {
        imgEl.src = customImages[customKey];
        imgEl.style.transform = 'none'; // Reset scale transform for custom uploads
      } else {
        // Fallback to static placeholder images we generated
        if (state === 'idle') {
          imgEl.src = 'assets/idle.webp';
          imgEl.style.transform = 'none';
        } else if (state === 'walk_left' || state === 'walk_right' || state === 'walk_up' || state === 'walk_down' ||
                   state === 'walk_up_left' || state === 'walk_up_right' || state === 'walk_down_left' || state === 'walk_down_right') {
          imgEl.src = 'assets/walk.webp';
          // Fallback direction flipping
          if (state === 'walk_left' || state === 'walk_up_left' || state === 'walk_down_left') {
            imgEl.style.transform = 'scaleX(-1)';
          } else if (state === 'walk_right' || state === 'walk_up_right' || state === 'walk_down_right') {
            imgEl.style.transform = 'none';
          }
        } else if (state === 'dragging' || state === 'falling') {
          imgEl.src = 'assets/drag.webp';
          imgEl.style.transform = 'none';
        } else if (state === 'clicked' || state === 'exiting') {
          imgEl.src = 'assets/clicked.webp';
          imgEl.style.transform = 'none';
        }
      }
    }
  }

  // Trigger dialogue for this state
  // Avoid showing idle dialogue if transitioning back from a short clicked/falling/exiting state
  if (state !== 'idle' || (prevState !== 'clicked' && prevState !== 'exiting' && prevState !== 'falling')) {
    showDialogueForState(currentCharacter, state);
  }
}

// Fetch position and set bounds on load
async function syncWindowPosition() {
  const bounds = await ipcRenderer.invoke('get-window-bounds', windowX, windowY);
  if (bounds) {
    virtualDesktopMinX = bounds.x !== undefined ? bounds.x : 0;
    virtualDesktopMinY = bounds.y !== undefined ? bounds.y : 0;
    virtualWidth = bounds.width !== undefined ? bounds.width : bounds.screenWidth;
    virtualHeight = bounds.height !== undefined ? bounds.height : bounds.screenHeight;
    screenWidth = bounds.screenWidth;
    screenHeight = bounds.screenHeight;
    displayX = bounds.displayX !== undefined ? bounds.displayX : 0;
    displayY = bounds.displayY !== undefined ? bounds.displayY : 0;
    workWidth = bounds.workWidth !== undefined ? bounds.workWidth : bounds.screenWidth;
    workHeight = bounds.workHeight !== undefined ? bounds.workHeight : bounds.screenHeight;
    
    // Clamp mascot coordinates to currently matched display
    const minMascotX = displayX + 10;
    const maxMascotX = displayX + workWidth - windowWidth - 10;
    const minMascotY = displayY + 10;
    const maxMascotY = displayY + workHeight - windowHeight - 10;
    
    // Offset windowX/windowY into display coordinate space if loaded with un-offset coordinates
    if (displayX > 0 && windowX < displayX) {
      windowX += displayX;
    }
    if (displayY > 0 && windowY < displayY) {
      windowY += displayY;
    }
    
    // Clamp smoothly without force-resetting to bottom-right corner
    windowX = Math.max(minMascotX, Math.min(windowX, maxMascotX));
    windowY = Math.max(minMascotY, Math.min(windowY, maxMascotY));
    
    updateMascotDOMPosition();
  }
}

// --- Drag & Drop with Gravity ---
function initDragAndDrop() {
  mascotBody.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return; // Only left click
    
    const pressStartTime = Date.now();
    let isHoldDrag = false;
    dragStartHeight = windowY; // Record the height before dragging
    logDebug(`[mousedown] dragStartHeight=${dragStartHeight}, windowY=${windowY}`);
    
    isDragging = true;
    isFalling = false;
    isWalking = false;
    clearActiveActionTimer();
    
    // Hold timer: only play dragging animation/dialogue if held for > 1s
    const dragTimer = setTimeout(() => {
      if (isDragging) {
        isHoldDrag = true;
        setMascotState('dragging');
        showDialogue("放開我啦喵！><");
      }
    }, 1000);
    
    // Calculate drag offset relative to the mascot container top-left inside virtual desktop space
    const dragOffsetX = e.clientX - (windowX - virtualDesktopMinX);
    const dragOffsetY = e.clientY - (windowY - virtualDesktopMinY);
    
    const onMouseMove = (moveEvent) => {
      if (!isDragging) return;
      
      // Calculate new virtual screen coordinates of the mascot
      windowX = moveEvent.clientX - dragOffsetX + virtualDesktopMinX;
      windowY = moveEvent.clientY - dragOffsetY + virtualDesktopMinY;
      
      // Keep within monitor display boundaries (using currently matched monitor)
      const minMascotX = displayX + 10;
      const maxMascotX = displayX + workWidth - windowWidth - 10;
      const minMascotY = displayY + 10;
      const maxMascotY = displayY + workHeight - windowHeight - 10;
      
      windowX = Math.max(minMascotX, Math.min(windowX, maxMascotX));
      windowY = Math.max(minMascotY, Math.min(windowY, maxMascotY));
      
      updateMascotDOMPosition();
    };
    
    const onMouseUp = async () => {
      isDragging = false;
      clearTimeout(dragTimer);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      
      // Update matched display boundary settings relative to cursor location
      await syncWindowPosition();
      
      const duration = Date.now() - pressStartTime;
      logDebug(`[onMouseUp] duration=${duration}, windowY=${windowY}, dragStartHeight=${dragStartHeight}`);
      if (duration < 1000) {
        // It's a CLICK!
        // Release mouse within 1s: do clicked action (play clicked WebP for 8 seconds, then idle)
        clearActiveActionTimer();
        setMascotState('clicked');
        showDialogue("嘻嘻，主人找我玩嗎？✨");
        activeActionTimer = setTimeout(() => {
          activeActionTimer = null;
          if (currentMascotState === 'clicked') {
            setMascotState('idle');
            startWalkingAI(); // Resume AI
          }
        }, 8000);
      } else {
        // It's a DRAG!
        // Released after holding for > 1s
        logDebug(`[onMouseUp Drag check] windowY=${windowY} < dragStartHeight=${dragStartHeight} is ${windowY < dragStartHeight}`);
        if (windowY < dragStartHeight) {
          // If the release height is higher than before dragging: fall down to dragStartHeight
          isFalling = true;
          fallSpeed = 0;
          setMascotState('falling');
          requestAnimationFrame(gravityFallLoop);
        } else {
          // If the release height is lower or equal: directly go to idle & random walking
          setMascotState('idle');
          startWalkingAI();
        }
      }
      
      // Trigger daily task count
      dailyProgress.clickCount++;
      document.getElementById('click-count').innerText = Math.min(dailyProgress.clickCount, 5);
      if (dailyProgress.clickCount >= 5 && !dailyProgress.clickClaimed) {
        document.getElementById('btn-task-click').classList.remove('disabled');
        document.getElementById('btn-task-click').removeAttribute('disabled');
      }
      saveProgress();
      updateTasksUI();
    };
    
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  });
}

// Gravity Falling Loop
function gravityFallLoop() {
  if (!isFalling) return;
  
  // Use dragStartHeight as the landing floor level!
  const targetY = dragStartHeight;
  
  if (windowY < targetY) {
    fallSpeed += gravity;
    windowY += fallSpeed;
    logDebug(`[gravityFallLoop step] windowY=${windowY}, targetY=${targetY}, fallSpeed=${fallSpeed}`);
    if (windowY >= targetY) {
      windowY = targetY;
      isFalling = false;
      // Landing from drag: NOT landing clicked action! Directly idle & walk!
      setMascotState('idle');
      startWalkingAI();
    }
    updateMascotDOMPosition();
    if (isFalling) {
      requestAnimationFrame(gravityFallLoop);
    }
  } else {
    isFalling = false;
    setMascotState('idle');
    startWalkingAI();
  }
}

// --- Mascot Walking AI ---
function isAnyModalOpen() {
  return document.querySelector('.modal:not(.hidden)') !== null;
}

async function startWalkingAI() {
  if (!allowWalking) return; // Stop walking if user disabled free-roaming
  if (isDragging || isFalling || isWalking || currentMascotState === 'clicked' || currentMascotState === 'exiting') return;
  if (isAnyModalOpen()) return; // Stop walking AI if any setting modal is open
  if (contextMenu && !contextMenu.classList.contains('hidden')) return; // Stop if menu is open
  
  // Decide walk frequency randomly
  const delay = 2500 + Math.random() * 3500; // 2.5~6 seconds
  walkTimer = setTimeout(async () => {
    await syncWindowPosition();
    
    // Decide number of segments for this walk session (e.g. 2 to 3 segments)
    walkSegmentsLeft = 2 + Math.floor(Math.random() * 2); 
    startNextWalkSegment();
  }, delay);
}

function startNextWalkSegment() {
  if (isDragging || isFalling || currentMascotState === 'clicked' || currentMascotState === 'exiting') {
    isWalking = false;
    return;
  }
  
  // Check if context menu or modals were opened during transition
  if (isAnyModalOpen() || (contextMenu && !contextMenu.classList.contains('hidden'))) {
    isWalking = false;
    setMascotState('idle');
    return;
  }
  
  walkSegmentsLeft--;
  
  // Boundary-aware direction picker: filter out directions that would instantly hit screen edges!
  const minX = displayX + 15;
  const maxX = displayX + workWidth - windowWidth - 15;
  const minY = displayY + 15;
  const maxY = displayY + workHeight - windowHeight - 15;
  
  const availableDirections = [];
  if (windowX > minX) availableDirections.push('left');
  if (windowX < maxX) availableDirections.push('right');
  if (windowY > minY) availableDirections.push('up');
  if (windowY < maxY) availableDirections.push('down');
  
  if (windowX > minX && windowY > minY) availableDirections.push('up_left');
  if (windowX < maxX && windowY > minY) availableDirections.push('up_right');
  if (windowX > minX && windowY < maxY) availableDirections.push('down_left');
  if (windowX < maxX && windowY < maxY) availableDirections.push('down_right');
  
  const directions = availableDirections.length > 0 ? availableDirections : ['left', 'right', 'up', 'down'];
  walkDirection = directions[Math.floor(Math.random() * directions.length)];
  
  // Walk duration: 45 to 90 updates (approx 1.5s to 3s per segment)
  walkStepsLeft = 45 + Math.floor(Math.random() * 45);
  
  isWalking = true;
  
  let walkState = 'idle';
  if (walkDirection === 'left') {
    walkState = 'walk_left';
  } else if (walkDirection === 'right') {
    walkState = 'walk_right';
  } else if (walkDirection === 'up') {
    walkState = 'walk_up';
  } else if (walkDirection === 'down') {
    walkState = 'walk_down';
  } else if (walkDirection === 'up_left') {
    walkState = 'walk_up_left';
  } else if (walkDirection === 'up_right') {
    walkState = 'walk_up_right';
  } else if (walkDirection === 'down_left') {
    walkState = 'walk_down_left';
  } else if (walkDirection === 'down_right') {
    walkState = 'walk_down_right';
  }
  
  setMascotState(walkState);
  walkLoop();
}

let lastWindowMoveTime = 0;
function walkLoop() {
  if (!isWalking || isDragging || isFalling) return;
  
  // Check if context menu or modal is open during walk
  if (isAnyModalOpen() || (contextMenu && !contextMenu.classList.contains('hidden'))) {
    isWalking = false;
    setMascotState('idle');
    return;
  }
  
  // Move window (including diagonal movement with normalized speed)
  const diagSpeed = walkSpeed * 0.707;
  if (walkDirection === 'left') {
    windowX -= walkSpeed;
  } else if (walkDirection === 'right') {
    windowX += walkSpeed;
  } else if (walkDirection === 'up') {
    windowY -= walkSpeed;
  } else if (walkDirection === 'down') {
    windowY += walkSpeed;
  } else if (walkDirection === 'up_left') {
    windowX -= diagSpeed;
    windowY -= diagSpeed;
  } else if (walkDirection === 'up_right') {
    windowX += diagSpeed;
    windowY -= diagSpeed;
  } else if (walkDirection === 'down_left') {
    windowX -= diagSpeed;
    windowY += diagSpeed;
  } else if (walkDirection === 'down_right') {
    windowX += diagSpeed;
    windowY += diagSpeed;
  }
  
  // Screen boundaries check (dynamically bounded inside the current monitor!)
  const minX = displayX + 10;
  const maxX = displayX + workWidth - windowWidth - 10;
  const minY = displayY + 10;
  const maxY = displayY + workHeight - windowHeight - 10;
  
  let hitBoundary = false;
  if (windowX < minX) {
    windowX = minX;
    hitBoundary = true;
  }
  if (windowX > maxX) {
    windowX = maxX;
    hitBoundary = true;
  }
  if (windowY < minY) {
    windowY = minY;
    hitBoundary = true;
  }
  if (windowY > maxY) {
    windowY = maxY;
    hitBoundary = true;
  }
  
  walkStepsLeft--;
  walkStepsCount++;
  
  // Walk Task progress
  if (walkStepsCount % 5 === 0) {
    dailyProgress.walkCount++;
    const walkText = document.getElementById('walk-count');
    if (walkText) {
      walkText.innerText = Math.min(dailyProgress.walkCount, 100);
    }
    if (dailyProgress.walkCount >= 100 && !dailyProgress.walkClaimed) {
      const btn = document.getElementById('btn-task-walk');
      if (btn && btn.disabled) {
        btn.classList.remove('disabled');
        btn.removeAttribute('disabled');
        saveProgress();
        updateTasksUI();
      }
    }
  }
  
  updateMascotDOMPosition();
  
  // Check segment completion
  if (walkStepsLeft <= 0 || hitBoundary) {
    
    if (walkSegmentsLeft > 0) {
      // Pause briefly (e.g. 300ms) to look around, then start next walk segment!
      setMascotState('idle');
      setTimeout(() => {
        startNextWalkSegment();
      }, 300);
    } else {
      // All segments finished
      isWalking = false;
      setMascotState('idle');
      saveProgress();
      startWalkingAI();
    }
  } else {
    requestAnimationFrame(walkLoop);
  }
}

// --- Progression & Tasks System ---
function saveProgress() {
  localStorage.setItem('mascot_level', userLevel);
  localStorage.setItem('mascot_energy', userEnergy);
  localStorage.setItem('mascot_daily_progress', JSON.stringify(dailyProgress));
}

function checkDailyReset() {
  const today = new Date().toLocaleDateString('zh-TW');
  if (lastLoginDate !== today) {
    // Reset daily tasks
    dailyProgress = {
      date: today,
      loginClaimed: false,
      clickCount: 0,
      clickClaimed: false,
      walkCount: 0,
      walkClaimed: false,
      musicTime: 0,
      musicClaimed: false
    };
    lastLoginDate = today;
    localStorage.setItem('mascot_last_login', today);
    saveProgress();
    
    showDialogue("✨ 早安！魔法能量已經刷新了喔！");
  }
}

function addEnergy(amount) {
  userEnergy += amount;
  const nextReq = userLevel * 100;
  
  showDialogue(`✨ 獲得了 ${amount} 點魔法能量！`);
  
  if (userEnergy >= nextReq) {
    userEnergy -= nextReq;
    userLevel++;
    showDialogue(`🎉 恭喜升級！當前等級: ${userLevel}！解鎖新要素！`);
    // Upgrade Decors
    updateLocks();
  }
  
  saveProgress();
  updateTasksUI();
}

function updateTasksUI() {
  document.getElementById('user-level').innerText = userLevel;
  document.getElementById('user-energy').innerText = userEnergy;
  const nextReq = userLevel * 100;
  document.getElementById('energy-next').innerText = nextReq;
  
  const barPercent = Math.min((userEnergy / nextReq) * 100, 100);
  document.getElementById('energy-bar').style.width = `${barPercent}%`;
  
  // Clicks task
  document.getElementById('click-count').innerText = Math.min(dailyProgress.clickCount, 5);
  const clickBtn = document.getElementById('btn-task-click');
  if (dailyProgress.clickClaimed) {
    clickBtn.innerText = "已領取";
    clickBtn.className = "task-btn disabled";
    clickBtn.disabled = true;
  } else if (dailyProgress.clickCount >= 5) {
    clickBtn.innerText = "領取";
    clickBtn.className = "task-btn";
    clickBtn.disabled = false;
  } else {
    clickBtn.innerText = "領取";
    clickBtn.className = "task-btn disabled";
    clickBtn.disabled = true;
  }
  
  // Walk task
  document.getElementById('walk-count').innerText = Math.min(dailyProgress.walkCount, 100);
  const walkBtn = document.getElementById('btn-task-walk');
  if (dailyProgress.walkClaimed) {
    walkBtn.innerText = "已領取";
    walkBtn.className = "task-btn disabled";
    walkBtn.disabled = true;
  } else if (dailyProgress.walkCount >= 100) {
    walkBtn.innerText = "領取";
    walkBtn.className = "task-btn";
    walkBtn.disabled = false;
  } else {
    walkBtn.innerText = "領取";
    walkBtn.className = "task-btn disabled";
    walkBtn.disabled = true;
  }
  
  // Music task
  document.getElementById('music-time').innerText = Math.min(dailyProgress.musicTime, 60);
  const musicBtn = document.getElementById('btn-task-music');
  if (dailyProgress.musicClaimed) {
    musicBtn.innerText = "已領取";
    musicBtn.className = "task-btn disabled";
    musicBtn.disabled = true;
  } else if (dailyProgress.musicTime >= 60) {
    musicBtn.innerText = "領取";
    musicBtn.className = "task-btn";
    musicBtn.disabled = false;
  } else {
    musicBtn.innerText = "領取";
    musicBtn.className = "task-btn disabled";
    musicBtn.disabled = true;
  }
  
  // Daily login task
  const loginBtn = document.getElementById('btn-task-login');
  if (dailyProgress.loginClaimed) {
    loginBtn.innerText = "已簽到";
    loginBtn.className = "task-btn disabled";
    loginBtn.disabled = true;
  } else {
    loginBtn.innerText = "簽到";
    loginBtn.className = "task-btn";
    loginBtn.disabled = false;
  }
}

// Unlock characters, tracks, actions based on level
function updateLocks() {
  // Actions are permanently unlocked
  const spinAct = document.getElementById('act-spin');
  if (spinAct) {
    spinAct.classList.remove('locked-action');
    spinAct.innerText = "🌀 魔法轉圈圈 (基礎)";
  }
  const magicAct = document.getElementById('act-magic');
  if (magicAct) {
    magicAct.classList.remove('locked-action');
    magicAct.innerText = "✨ 釋放小魔法 (基礎)";
  }
}

// Dynamic memory update helper
async function updateMenuMemory() {
  try {
    const memData = await ipcRenderer.invoke('get-app-memory');
    const cpuSpan = document.getElementById('menu-cpu-memory');
    const gpuSpan = document.getElementById('menu-gpu-memory');
    const oldMemSpan = document.getElementById('menu-memory-usage');
    
    if (memData && typeof memData === 'object') {
      if (cpuSpan) cpuSpan.innerText = memData.cpuMB;
      if (gpuSpan) gpuSpan.innerText = memData.gpuMB;
    } else if (oldMemSpan) {
      oldMemSpan.innerText = memData;
    }
  } catch (e) {
    console.error("Failed to fetch memory:", e);
  }
}

function hideContextMenu() {
  contextMenu.classList.add('hidden');
  const overlay = document.getElementById('menu-overlay');
  if (overlay) overlay.classList.add('hidden');
  if (menuMemoryInterval) {
    clearInterval(menuMemoryInterval);
    menuMemoryInterval = null;
  }
}

// --- Menu & Modals Event listeners ---
function initUIEvents() {
  // Dialogue Toggle Context Menu Option Listener
  const dialogueToggleBtn = document.getElementById('menu-toggle-dialogue');
  if (dialogueToggleBtn) {
    dialogueToggleBtn.innerText = allowDialogue ? "關閉對話框" : "開啟對話框";
    dialogueToggleBtn.addEventListener('click', () => {
      allowDialogue = !allowDialogue;
      localStorage.setItem(`mascot_allow_dialogue_${screenIndex}`, allowDialogue);
      dialogueToggleBtn.innerText = allowDialogue ? "關閉對話框" : "開啟對話框";
      contextMenu.classList.add('hidden');
      ipcRenderer.send('set-ignore-mouse', true, { forward: true });
      
      if (!allowDialogue) {
        speechBubble.classList.add('hidden');
      } else {
        speechBubble.classList.remove('hidden');
        showDialogue("✨ 對話框已開啟！");
      }
      
      // Resume walking AI after closing the context menu
      setTimeout(() => { if (!isAnyModalOpen()) startWalkingAI(); }, 100);
    });
  }

  // Initialize and apply font size setting on UI initialization
  applyFontSize();

  const fontToggleBtn = document.getElementById('menu-toggle-fontsize');
  if (fontToggleBtn) {
    fontToggleBtn.addEventListener('click', () => {
      mascotFontSizeIdx = (mascotFontSizeIdx + 1) % fontSizes.length;
      localStorage.setItem(`mascot_fontsize_idx_${screenIndex}`, mascotFontSizeIdx);
      applyFontSize();
      contextMenu.classList.add('hidden');
      ipcRenderer.send('set-ignore-mouse', true, { forward: true });
      
      // Resume walking AI after closing the context menu
      setTimeout(() => { if (!isAnyModalOpen()) startWalkingAI(); }, 100);
      
      showDialogue(`✨ 字體已調整為: ${fontSizeNames[mascotFontSizeIdx]}`);
    });
  }

  // Hide or show Developer Mode menu option dynamically based on env variable
  const adminMenuItem = document.getElementById('menu-admin');
  if (adminMenuItem) {
    if (process.env.ENABLE_DEVELOPER_MODE === 'true') {
      adminMenuItem.style.display = 'block';
    } else {
      adminMenuItem.style.display = 'none';
    }
  }

  // Right click context menu (position to the side of the mascot to avoid overlapping)
  window.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    updateMenuHeader();
    contextMenu.classList.remove('hidden');
    
    // Show transparent overlay to capture outside clicks
    const overlay = document.getElementById('menu-overlay');
    if (overlay) overlay.classList.remove('hidden');
    
    // Force mascot to stop walking immediately and stay still (idle) while menu is open!
    isWalking = false;
    if (walkTimer) clearTimeout(walkTimer);
    setMascotState('idle');
    
    // Disable mouse ignore immediately when menu opens to capture click-away events!
    ipcRenderer.send('set-ignore-mouse', false, { forward: false });
    
    // Query and update memory usage immediately, then poll every 1s while menu is open
    updateMenuMemory();
    if (menuMemoryInterval) clearInterval(menuMemoryInterval);
    menuMemoryInterval = setInterval(updateMenuMemory, 1000);
    
    const menuWidth = contextMenu.offsetWidth || 160;
    const menuHeight = contextMenu.offsetHeight || 220;
    
    // Position beside the cursor (5px gap) and keep within screen width bounds
    let left = e.clientX + 5;
    if (left + menuWidth > window.innerWidth - 10) {
      left = e.clientX - menuWidth - 5;
    }
    
    // Keep within screen height bounds
    let top = e.clientY;
    if (top + menuHeight > window.innerHeight - 10) {
      top = window.innerHeight - menuHeight - 10;
    }
    
    contextMenu.style.left = `${Math.max(5, left)}px`;
    contextMenu.style.top = `${Math.max(5, top)}px`;
  });

  // Clicking overlay backdrop (transparent empty space) hides the context menu
  const menuOverlay = document.getElementById('menu-overlay');
  if (menuOverlay) {
    menuOverlay.addEventListener('click', () => {
      const wasVisible = !contextMenu.classList.contains('hidden');
      hideContextMenu();
      ipcRenderer.send('set-ignore-mouse', true, { forward: true });
      if (wasVisible) {
        setTimeout(() => { if (!isAnyModalOpen()) startWalkingAI(); }, 100);
      }
    });
  }

  // Hide context menu and overlay when menu options are clicked
  contextMenu.addEventListener('click', () => {
    hideContextMenu();
  });

  // Also close context menu when window loses focus (clicked on desktop outside)
  window.addEventListener('blur', () => {
    const wasVisible = !contextMenu.classList.contains('hidden');
    hideContextMenu();
    ipcRenderer.send('set-ignore-mouse', true, { forward: true });
    
    if (wasVisible) {
      setTimeout(() => { if (!isAnyModalOpen()) startWalkingAI(); }, 100);
    }
  });

  // Relaunch application option to release memory
  const relaunchBtn = document.getElementById('menu-relaunch');
  if (relaunchBtn) {
    relaunchBtn.addEventListener('click', () => {
      contextMenu.classList.add('hidden');
      
      // Save state first to prevent progress loss
      saveProgress();
      stopAllPlayback();
      
      showDialogue("🔄 正在儲存進度並重啟釋放記憶體...", 3000);
      
      setTimeout(() => {
        ipcRenderer.send('relaunch-app');
      }, 800);
    });
  }

  // Quit with animation and goodbye speech
  const quitBtn = document.getElementById('menu-quit');
  if (quitBtn) {
    quitBtn.addEventListener('click', () => {
      contextMenu.classList.add('hidden');
      setMascotState('clicked'); // Jump happily to say goodbye
      
      // Choose goodbye dialogue based on character
      let goodbyeText = "嗚嗚……主人再見喵……下次還要召喚我喔！👋";
      
      showDialogue(goodbyeText, 3000);
      
      // Tell state machine we are exiting to prevent other timers/dialogues
      currentMascotState = 'exiting';
      isWalking = false;
      if (walkTimer) clearTimeout(walkTimer);
      
      setTimeout(() => {
        ipcRenderer.send('close-app');
      }, 2000);
    });
  }


  // Tasks Panel trigger
  const menuTasksBtn = document.getElementById('menu-tasks');
  if (menuTasksBtn) {
    menuTasksBtn.addEventListener('click', () => {
      if (tasksModal) tasksModal.classList.remove('hidden');
      contextMenu.classList.add('hidden');
      updateTasksUI();
      isWalking = false;
      if (walkTimer) clearTimeout(walkTimer);
      setMascotState('idle');
    });
  }
  
  const closeTasksBtn = document.getElementById('close-tasks');
  if (closeTasksBtn) {
    closeTasksBtn.addEventListener('click', () => {
      if (tasksModal) tasksModal.classList.add('hidden');
      setTimeout(() => { if (!isAnyModalOpen()) startWalkingAI(); }, 100);
    });
  }

  // Library Panel trigger
  const menuLibraryBtn = document.getElementById('menu-library');
  if (menuLibraryBtn) {
    menuLibraryBtn.addEventListener('click', () => {
      if (libraryModal) libraryModal.classList.remove('hidden');
      contextMenu.classList.add('hidden');
      
      // Always reset to 'tab-chars' (角色切換) as default tab on open
      if (libraryModal) {
        const tabLinks = libraryModal.querySelectorAll('.tab-link');
        const tabContents = libraryModal.querySelectorAll('.tab-content');
        tabLinks.forEach(btn => {
          if (btn.getAttribute('data-tab') === 'tab-chars') {
            btn.classList.add('active');
          } else {
            btn.classList.remove('active');
          }
        });
        tabContents.forEach(content => {
          if (content.id === 'tab-chars') {
            content.classList.add('active-content');
          } else {
            content.classList.remove('active-content');
          }
        });
      }

      updateLocks();
      renderCharactersList(); // update dynamic character list!
      isWalking = false;
      if (walkTimer) clearTimeout(walkTimer);
      setMascotState('idle');
    });
  }
  
  const closeLibraryBtn = document.getElementById('close-library');
  if (closeLibraryBtn) {
    closeLibraryBtn.addEventListener('click', () => {
      if (libraryModal) libraryModal.classList.add('hidden');
      setTimeout(() => { if (!isAnyModalOpen()) startWalkingAI(); }, 100);
    });
  }

  // Settings Panel trigger
  const settingsModal = document.getElementById('settings-modal');
  const cpuSlider = document.getElementById('cpu-slider');
  const memSlider = document.getElementById('mem-slider');
  const cpuVal = document.getElementById('cpu-val');
  const memVal = document.getElementById('mem-val');

  const menuSettingsBtn = document.getElementById('menu-settings');
  if (menuSettingsBtn) {
    menuSettingsBtn.addEventListener('click', () => {
      if (settingsModal) settingsModal.classList.remove('hidden');
      contextMenu.classList.add('hidden');
      
      // Set initial values
      if (cpuSlider) cpuSlider.value = cpuThreshold;
      if (memSlider) memSlider.value = memThreshold;
      if (cpuVal) cpuVal.innerText = cpuThreshold;
      if (memVal) memVal.innerText = memThreshold;
      const walkToggle = document.getElementById('walk-toggle');
      if (walkToggle) walkToggle.checked = allowWalking;
      
      isWalking = false;
      if (walkTimer) clearTimeout(walkTimer);
      setMascotState('idle');
    });
  }

  const closeSettingsBtn = document.getElementById('close-settings');
  if (closeSettingsBtn) {
    closeSettingsBtn.addEventListener('click', () => {
      if (settingsModal) settingsModal.classList.add('hidden');
      setTimeout(() => { if (!isAnyModalOpen()) startWalkingAI(); }, 100);
    });
  }

  // Slider change listeners
  if (cpuSlider && cpuVal) {
    cpuSlider.addEventListener('input', () => {
      cpuVal.innerText = cpuSlider.value;
    });
  }

  if (memSlider && memVal) {
    memSlider.addEventListener('input', () => {
      memVal.innerText = memSlider.value;
    });
  }

  // Save Settings
  const saveSettingsBtn = document.getElementById('save-settings-btn');
  if (saveSettingsBtn) {
    saveSettingsBtn.addEventListener('click', () => {
      if (cpuSlider) cpuThreshold = parseInt(cpuSlider.value);
      if (memSlider) memThreshold = parseInt(memSlider.value);
      const walkToggle = document.getElementById('walk-toggle');
      if (walkToggle) allowWalking = walkToggle.checked;
      
      localStorage.setItem('mascot_cpu_threshold', cpuThreshold);
      localStorage.setItem('mascot_mem_threshold', memThreshold);
      localStorage.setItem('mascot_allow_walking', allowWalking ? 'true' : 'false');
      
      if (settingsModal) settingsModal.classList.add('hidden');
      
      if (!allowWalking) {
        isWalking = false;
        if (walkTimer) clearTimeout(walkTimer);
        setMascotState('idle');
      }
      
      showDialogue(`⚙️ 設定已儲存！CPU閥值: ${cpuThreshold}%, 記憶體閥值: ${memThreshold}%, 自由走動: ${allowWalking ? '開啟' : '關閉'}`);
      setTimeout(() => { if (!isAnyModalOpen()) startWalkingAI(); }, 100);
    });
  }

  // Show Media Player Modal
  const menuMediaBtn = document.getElementById('menu-media-player');
  if (menuMediaBtn) {
    menuMediaBtn.addEventListener('click', () => {
      const mediaModal = document.getElementById('media-modal');
      if (mediaModal) mediaModal.classList.remove('hidden');
      contextMenu.classList.add('hidden');
      renderPlaylistUI();
      
      if (isPlaying) {
        const playlist = getPlaylist();
        const track = playlist.find(t => t.id === currentTrackId);
        if (track && track.type !== 'video') {
          startVisualizerAnimation();
        }
      }
      
      isWalking = false;
      if (walkTimer) clearTimeout(walkTimer);
      setMascotState('idle');
    });
  }

  const closeMediaBtn = document.getElementById('close-media');
  if (closeMediaBtn) {
    closeMediaBtn.addEventListener('click', () => {
      const mediaModal = document.getElementById('media-modal');
      if (mediaModal) mediaModal.classList.add('hidden');
      setTimeout(() => { if (!isAnyModalOpen()) startWalkingAI(); }, 100);
    });
  }

  // Show Quick Launchers Modal
  const menuQuickLaunchBtn = document.getElementById('menu-quick-launch');
  if (menuQuickLaunchBtn) {
    menuQuickLaunchBtn.addEventListener('click', (e) => {
      if (e) e.stopPropagation();
      hideContextMenu();
      
      const modal = document.getElementById('quick-launch-modal') || quickLaunchModal;
      if (modal) {
        modal.classList.remove('hidden');
      }
      
      ipcRenderer.send('set-ignore-mouse', false, { forward: false });
      
      isWalking = false;
      if (walkTimer) clearTimeout(walkTimer);
      setMascotState('idle');

      try {
        loadLaunchersData();
        renderQuickLaunchUI();
      } catch (err) {
        console.error("Failed to load launchers UI:", err);
      }
    });
  }

  const closeQuickLaunchBtn = document.getElementById('close-quick-launch');
  if (closeQuickLaunchBtn) {
    closeQuickLaunchBtn.addEventListener('click', (e) => {
      if (e) e.stopPropagation();
      const modal = document.getElementById('quick-launch-modal') || quickLaunchModal;
      if (modal) modal.classList.add('hidden');
      setTimeout(() => { if (!isAnyModalOpen()) startWalkingAI(); }, 100);
    });
  }

  // Quick Launcher Mode Buttons (Private vs Public)
  const btnLaunchPrivate = document.getElementById('btn-launch-mode-private');
  const btnLaunchPublic = document.getElementById('btn-launch-mode-public');

  if (btnLaunchPrivate && btnLaunchPublic) {
    btnLaunchPrivate.addEventListener('click', () => {
      currentLaunchMode = 'private';
      btnLaunchPrivate.classList.add('active');
      btnLaunchPublic.classList.remove('active');
      renderQuickLaunchUI();
    });

    btnLaunchPublic.addEventListener('click', () => {
      currentLaunchMode = 'public';
      btnLaunchPublic.classList.add('active');
      btnLaunchPrivate.classList.remove('active');
      renderQuickLaunchUI();
    });
  }

  // Add Category Trigger & Modals
  const btnAddCategory = document.getElementById('btn-add-category');
  if (btnAddCategory) {
    btnAddCategory.addEventListener('click', () => {
      openCategoryEditor(null);
    });
  }

  const closeCatEditorBtn = document.getElementById('close-cat-editor');
  if (closeCatEditorBtn) {
    closeCatEditorBtn.addEventListener('click', () => {
      const modal = document.getElementById('category-editor-modal');
      if (modal) modal.classList.add('hidden');
    });
  }

  const catSaveBtn = document.getElementById('cat-btn-save');
  if (catSaveBtn) {
    catSaveBtn.addEventListener('click', () => {
      const titleInput = document.getElementById('cat-input-title');
      const noteInput = document.getElementById('cat-input-note');
      const titleVal = titleInput ? titleInput.value.trim() : '';
      const noteVal = noteInput ? noteInput.value.trim() : '';

      if (!titleVal) {
        showDialogue("⚠️ 請輸入分類標題！");
        return;
      }

      const modeData = launcherData[currentLaunchMode];
      if (editingCatId) {
        const cat = modeData.categories.find(c => c.id === editingCatId);
        if (cat) {
          cat.title = titleVal;
          cat.note = noteVal;
        }
      } else {
        modeData.categories.push({
          id: `cat_${Date.now()}`,
          title: titleVal,
          note: noteVal,
          items: []
        });
      }

      saveLaunchersData(currentLaunchMode);
      const modal = document.getElementById('category-editor-modal');
      if (modal) modal.classList.add('hidden');
      renderQuickLaunchUI();
      showDialogue(`✅ 已儲存分類：${titleVal}`);
    });
  }

  // Item Editor Triggers
  const closeItemEditorBtn = document.getElementById('close-item-editor');
  if (closeItemEditorBtn) {
    closeItemEditorBtn.addEventListener('click', () => {
      const modal = document.getElementById('item-editor-modal');
      if (modal) modal.classList.add('hidden');
    });
  }

  const itemBrowseBtn = document.getElementById('item-btn-browse');
  if (itemBrowseBtn) {
    itemBrowseBtn.addEventListener('click', async () => {
      const filePath = await ipcRenderer.invoke('show-launch-file-dialog');
      if (filePath) {
        const pathInput = document.getElementById('item-input-path');
        if (pathInput) pathInput.value = filePath;
      }
    });
  }

  const itemSaveBtn = document.getElementById('item-btn-save');
  if (itemSaveBtn) {
    itemSaveBtn.addEventListener('click', () => {
      const titleInput = document.getElementById('item-input-title');
      const pathInput = document.getElementById('item-input-path');
      const noteInput = document.getElementById('item-input-note');

      const titleVal = titleInput ? titleInput.value.trim() : '';
      const pathVal = pathInput ? pathInput.value.trim() : '';
      const noteVal = noteInput ? noteInput.value.trim() : '';

      if (!titleVal) {
        showDialogue("⚠️ 請輸入項目名稱！");
        return;
      }
      if (!pathVal) {
        showDialogue("⚠️ 請輸入或瀏覽選擇檔案路徑！");
        return;
      }

      const modeData = launcherData[currentLaunchMode];
      const cat = modeData.categories.find(c => c.id === editingItemCatId);
      if (!cat) return;

      if (!cat.items) cat.items = [];

      if (editingItemId) {
        const item = cat.items.find(i => i.id === editingItemId);
        if (item) {
          item.title = titleVal;
          item.path = pathVal;
          item.note = noteVal;
        }
      } else {
        cat.items.push({
          id: `item_${Date.now()}`,
          title: titleVal,
          path: pathVal,
          note: noteVal
        });
      }

      saveLaunchersData(currentLaunchMode);
      const modal = document.getElementById('item-editor-modal');
      if (modal) modal.classList.add('hidden');
      renderQuickLaunchUI();
      showDialogue(`✅ 已儲存快捷項目：${titleVal}`);
    });
  }

  // Tab Link Switches
  document.querySelectorAll('.tab-link').forEach(button => {
    button.addEventListener('click', () => {
      document.querySelectorAll('.tab-link').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active-content'));
      
      button.classList.add('active');
      document.getElementById(button.dataset.tab).classList.add('active-content');
    });
  });

  // Claim Login Task
  document.getElementById('btn-task-login').addEventListener('click', () => {
    if (!dailyProgress.loginClaimed) {
      dailyProgress.loginClaimed = true;
      saveProgress();
      addEnergy(20);
      updateTasksUI();
    }
  });

  // Claim Clicks Task
  document.getElementById('btn-task-click').addEventListener('click', () => {
    if (dailyProgress.clickCount >= 5 && !dailyProgress.clickClaimed) {
      dailyProgress.clickClaimed = true;
      saveProgress();
      addEnergy(10);
      updateTasksUI();
    }
  });

  // Claim Walk Task
  document.getElementById('btn-task-walk').addEventListener('click', () => {
    if (dailyProgress.walkCount >= 100 && !dailyProgress.walkClaimed) {
      dailyProgress.walkClaimed = true;
      saveProgress();
      addEnergy(15);
      updateTasksUI();
    }
  });

  // Claim Music Task
  document.getElementById('btn-task-music').addEventListener('click', () => {
    if (dailyProgress.musicTime >= 60 && !dailyProgress.musicClaimed) {
      dailyProgress.musicClaimed = true;
      saveProgress();
      addEnergy(20);
      updateTasksUI();
    }
  });

  // Dynamic Actions Tab Renderer
  renderActionsTab();
}

function renderActionsTab() {
  const container = document.querySelector('#tab-actions .actions-list');
  if (!container) return;
  
  // Calculate how many clicked variants exist for the current character
  const clickedKey = `${currentCharacter}_clicked`;
  const clickedHistory = imageHistory[clickedKey] || [];
  let clickedCount = clickedHistory.length;
  if (clickedCount === 0) {
    clickedCount = customImages[clickedKey] ? 1 : 1; // Default is at least 1
  }

  const actionsList = [
    { action: 'idle', label: '🐾 發呆 (Idle)' },
    { action: 'walk_left', label: '👈 走路-左 (Walk Left)' },
    { action: 'walk_right', label: '👉 走路-右 (Walk Right)' },
    { action: 'walk_up', label: '👆 走路-上 (Walk Up)' },
    { action: 'walk_down', label: '👇 走路-下 (Walk Down)' },
    { action: 'walk_up_left', label: '↖️ 走路-左上 (Walk Up Left)' },
    { action: 'walk_up_right', label: '↗️ 走路-右上 (Walk Up Right)' },
    { action: 'walk_down_left', label: '↙️ 走路-左下 (Walk Down Left)' },
    { action: 'walk_down_right', label: '↘️ 走路-右下 (Walk Down Right)' },
    { action: 'dragging', label: '✊ 拖曳 (Drag)' },
    { action: 'falling', label: '🪂 下墜 (Falling)' },
    { action: 'clicked', label: `🎉 點擊 (${clickedCount}種)` }
  ];

  container.innerHTML = '';
  actionsList.forEach(item => {
    const btn = document.createElement('div');
    btn.className = 'action-btn-item';
    btn.setAttribute('data-action', item.action);
    btn.innerText = item.label;
    
    btn.addEventListener('click', () => {
      document.getElementById('library-modal').classList.add('hidden');
      triggerActionShowcase(item.action);
    });
    
    container.appendChild(btn);
  });
}

function triggerActionShowcase(action) {
  isWalking = false;
  if (walkTimer) clearTimeout(walkTimer);
  clearActiveActionTimer();
  
  if (action === 'idle') {
    setMascotState('idle');
    startWalkingAI();
  } else if (action.startsWith('walk')) {
    let dir = action.replace('walk_', '');
    if (action === 'walk') dir = 'right';
    walkDirection = dir;
    isWalking = true;
    setMascotState(action);
    walkStepsLeft = 60;
    walkLoop();
  } else if (action === 'dragging') {
    setMascotState('dragging');
    showDialogue("哎呀！被抓起來了！✊");
    activeActionTimer = setTimeout(() => {
      activeActionTimer = null;
      if (currentMascotState === 'dragging') {
        setMascotState('idle');
        startWalkingAI();
      }
    }, 8000);
  } else if (action === 'falling') {
    windowY = Math.max(displayY + 10, windowY - 300);
    updateMascotDOMPosition();
    isFalling = true;
    fallSpeed = 0;
    setMascotState('falling');
    showDialogue("哇啊啊～掉下去了！🪂");
    requestAnimationFrame(gravityFallLoop);
  } else if (action === 'clicked' || action === 'click' || action === 'spin' || action === 'cast') {
    setMascotState('clicked');
    showDialogue("喵嗚～太開心了！🎉");
    activeActionTimer = setTimeout(() => {
      activeActionTimer = null;
      if (currentMascotState === 'clicked') {
        setMascotState('idle');
        startWalkingAI();
      }
    }, 8000);
  }
}

  // Music (Media) Player Events
  document.getElementById('player-play').addEventListener('click', () => {
    if (isPlaying) {
      stopAllPlayback();
    } else {
      playTrack(currentTrackId || 'synth_0');
    }
  });

  document.getElementById('player-next').addEventListener('click', () => {
    playNextTrack();
  });

  document.getElementById('player-prev').addEventListener('click', () => {
    playPrevTrack();
  });

  document.getElementById('player-loop-mode').addEventListener('click', () => {
    loopMode = (loopMode === 'list') ? 'single' : 'list';
    localStorage.setItem('mascot_media_loop_mode', loopMode);
    updateLoopModeUI();
    showDialogue(`🔁 循環模式已切換為：${loopMode === 'single' ? '單曲循環' : '全曲循環'}`);
  });

  // Media Upload Event (Publicly accessible, not limited to Developer Mode!)
  document.getElementById('media-upload-btn').addEventListener('click', async () => {
    const filePaths = await ipcRenderer.invoke('show-media-dialog');
    if (!filePaths || !Array.isArray(filePaths) || filePaths.length === 0) return; // Cancelled
    
    // Resolve project directory safely once
    let rawPath = window.location.pathname;
    if (rawPath.startsWith('/') && rawPath.charAt(2) === ':') {
      rawPath = rawPath.substring(1);
    }
    const htmlPath = decodeURIComponent(rawPath);
    const lastSlash = Math.max(htmlPath.lastIndexOf('/'), htmlPath.lastIndexOf('\\'));
    const projectDir = htmlPath.substring(0, lastSlash);
    
    const targetDir = path.join(projectDir, 'assets', 'media');
    try {
      fs.mkdirSync(targetDir, { recursive: true });
    } catch (e) {
      console.error(e);
    }
    
    let successCount = 0;
    let failCount = 0;
    
    for (let i = 0; i < filePaths.length; i++) {
      const sourcePath = filePaths[i];
      const ext = path.extname(sourcePath).toLowerCase();
      const baseName = path.basename(sourcePath);
      const type = (ext === '.mp4' || ext === '.webm') ? 'video' : 'audio';
      
      // Use unique names based on timestamp and index to prevent collision!
      const destName = `custom_media_${Date.now()}_${i}${ext}`;
      const destPath = path.join(targetDir, destName);
      const relativePath = `assets/media/${destName}`;
      
      try {
        fs.copyFileSync(sourcePath, destPath);
        
        const newMedia = {
          id: 'custom_' + Date.now() + '_' + i,
          name: baseName,
          path: relativePath,
          type: type
        };
        customMedia.push(newMedia);
        successCount++;
      } catch (err) {
        console.error(`Failed to copy file ${sourcePath}:`, err);
        failCount++;
      }
    }
    
    if (successCount > 0) {
      saveDb('media');
      renderPlaylistUI();
    }
    
    if (failCount === 0) {
      showDialogue(`✅ 成功上傳 ${successCount} 個影音檔案！`);
    } else {
      showDialogue(`⚠️ 上傳結果：${successCount} 成功，${failCount} 失敗。`);
    }
  });

  // --- Admin Developer Panel Logics ---
  const adminModal = document.getElementById('admin-modal');
  const adminControl = document.getElementById('admin-control-section');
  const adminUploadBtn = document.getElementById('admin-upload-btn');
  const selectChar = document.getElementById('admin-select-char');
  const selectAction = document.getElementById('admin-select-action');
  const historyList = document.getElementById('admin-history-list');
  const adminDialogueInput = document.getElementById('admin-dialogue-input');
  const adminDialogueDefaultHint = document.getElementById('admin-dialogue-default-hint');
  const adminSaveDialogueBtn = document.getElementById('admin-save-dialogue-btn');

  // Show Admin Modal directly (passcode verification removed)
  document.getElementById('menu-admin').addEventListener('click', () => {
    adminModal.classList.remove('hidden');
    contextMenu.classList.add('hidden');
    
    // Dynamically render character selections dropdown
    renderAdminSelectChar();
    loadHistoryList(selectChar.value, selectAction.value);
    updateDialogueUI(selectChar.value, selectAction.value);
    
    isWalking = false;
    if (walkTimer) clearTimeout(walkTimer);
    setMascotState('idle');
  });

  document.getElementById('close-admin').addEventListener('click', () => {
    adminModal.classList.add('hidden');
    setTimeout(() => { if (!isAnyModalOpen()) startWalkingAI(); }, 100);
  });

  // Add Custom Character Listener
  document.getElementById('admin-add-char-btn').addEventListener('click', () => {
    const sourceInput = document.getElementById('admin-new-char-source');
    const nameInput = document.getElementById('admin-new-char-name');
    
    const source = sourceInput.value.trim();
    const name = nameInput.value.trim();
    
    if (!source || !name) {
      showDialogue("❌ 角色作品與角色名稱不可為空！");
      return;
    }
    
    // Autogenerate unique character ID based on timestamp
    const id = 'char_' + Date.now();
    
    customCharacters.push({ id, name, source });
    saveDb('characters');
    
    sourceInput.value = '';
    nameInput.value = '';
    
    showDialogue(`✅ 成功新增角色: ${name}！`);
    renderAdminSelectChar();
    renderCharactersList();
  });

  // Selectors changed
  selectChar.addEventListener('change', () => {
    const deleteBtn = document.getElementById('admin-delete-char-btn');
    if (deleteBtn) {
      if (selectChar.value === 'cat') {
        deleteBtn.style.display = 'none';
      } else {
        deleteBtn.style.display = 'inline-block';
      }
    }
    loadHistoryList(selectChar.value, selectAction.value);
    updateDialogueUI(selectChar.value, selectAction.value);
  });
  selectAction.addEventListener('change', () => {
    loadHistoryList(selectChar.value, selectAction.value);
    updateDialogueUI(selectChar.value, selectAction.value);
  });

  // Delete selected custom character
  document.getElementById('admin-delete-char-btn').addEventListener('click', () => {
    const charId = selectChar.value;
    if (charId === 'cat') return; // Cannot delete default character
    
    const charObj = customCharacters.find(c => c.id === charId);
    if (!charObj) return;
    
    if (confirm(`確定要刪除角色「${charObj.name}」嗎？\n這將會清除該角色的所有自訂動作動圖設定與對話！`)) {
      // Resolve project directory safely
      let rawPath = window.location.pathname;
      if (rawPath.startsWith('/') && rawPath.charAt(2) === ':') {
        rawPath = rawPath.substring(1);
      }
      const htmlPath = decodeURIComponent(rawPath);
      const lastSlash = Math.max(htmlPath.lastIndexOf('/'), htmlPath.lastIndexOf('\\'));
      const projectDir = htmlPath.substring(0, lastSlash);

      // 1. Physically delete character subfolder recursively
      try {
        const targetDir = path.join(projectDir, 'assets', charObj.source, charObj.name);
        if (fs.existsSync(targetDir)) {
          fs.rmSync(targetDir, { recursive: true, force: true });
          console.log(`Physically deleted custom character directory: ${targetDir}`);
        }
      } catch (err) {
        console.error(`Failed to delete directory:`, err);
      }

      // Clean up references in history
      Object.keys(imageHistory).forEach(key => {
        if (key.startsWith(`${charId}_`)) {
          delete imageHistory[key];
        }
      });
      saveDb('history');

      // 2. Remove from customCharacters array
      customCharacters = customCharacters.filter(c => c.id !== charId);
      saveDb('characters');
      
      // 3. Clean up customImages & dialogues
      const states = ['idle', 'walk_left', 'walk_right', 'walk_up', 'walk_down', 'walk_up_left', 'walk_up_right', 'walk_down_left', 'walk_down_right', 'dragging', 'clicked', 'falling'];
      states.forEach(state => {
        delete customImages[`${charId}_${state}`];
        delete customDialogues[`${charId}_${state}`];
      });
      saveDb('images');
      saveDb('dialogues');
      
      // If it was the active character, reset to 'cat'
      if (currentCharacter === charId) {
        saveCurrentCharacter('cat');
        const imgEl = document.getElementById('mascot-img');
        if (imgEl) imgEl.style.filter = 'none';
        setMascotState(currentMascotState);
      }
      
      showDialogue(`🗑️ 已成功刪除角色「${charObj.name}」！`);
      
      // Refresh UI
      renderAdminSelectChar();
      renderCharactersList();
      loadHistoryList(selectChar.value, selectAction.value);
      updateDialogueUI(selectChar.value, selectAction.value);
    }
  });

  // WebP File Upload & Local Copying using secure native dialog
  adminUploadBtn.addEventListener('click', async () => {
    const sourcePath = await ipcRenderer.invoke('show-open-dialog');
    if (!sourcePath) return; // Cancelled or closed
    
    const selChar = selectChar.value;
    const selAction = selectAction.value;
    
    const charObj = customCharacters.find(c => c.id === selChar);
    if (!charObj) {
      showDialogue("❌ 找不到選取的角色！");
      return;
    }
    
    // Resolve project root directory safely without __dirname (which is undefined in browser scripts)
    let rawPath = window.location.pathname;
    if (rawPath.startsWith('/') && rawPath.charAt(2) === ':') {
      rawPath = rawPath.substring(1); // Remove leading slash on Windows (e.g. /D:/path -> D:/path)
    }
    const htmlPath = decodeURIComponent(rawPath);
    const lastSlash = Math.max(htmlPath.lastIndexOf('/'), htmlPath.lastIndexOf('\\'));
    const projectDir = htmlPath.substring(0, lastSlash);
    
    try {
      // Create subfolder assets/[作品名]/[角色名稱]
      const targetDir = path.join(projectDir, 'assets', charObj.source, charObj.name);
      fs.mkdirSync(targetDir, { recursive: true });
      
      // Find the next available sequential index: e.g. idle1.webp, idle2.webp...
      let index = 1;
      let destName = `${selAction}${index}.webp`;
      let destPath = path.join(targetDir, destName);
      while (fs.existsSync(destPath)) {
        index++;
        destName = `${selAction}${index}.webp`;
        destPath = path.join(targetDir, destName);
      }
      
      // Copy selected file to local assets subfolder
      fs.copyFileSync(sourcePath, destPath);
      
      const customKey = `${selChar}_${selAction}`;
      // Use standard forward slashes for HTML/CSS url robustness
      const relativePath = `assets/${charObj.source}/${charObj.name}/${destName}`;
      
      customImages[customKey] = relativePath;
      
      if (!imageHistory[customKey]) imageHistory[customKey] = [];
      imageHistory[customKey].unshift(relativePath); // Add to history
      
      saveDb('images');
      saveDb('history');
      
      // Immediately switch the active desktop mascot to this character and action so they can see the result instantly!
      saveCurrentCharacter(selChar);
      const imgEl = document.getElementById('mascot-img');
      if (imgEl) imgEl.style.filter = 'none'; // Custom characters don't use filters
      setMascotState(selAction);
      
      showDialogue("✅ 成功上傳 WebP 並即時套用至桌面角色！");
      loadHistoryList(selChar, selAction);
    } catch (err) {
      console.error(err);
      showDialogue("❌ 複製檔案失敗，請再試一次。");
    }
  });

  // Save dialogue text
  adminSaveDialogueBtn.addEventListener('click', () => {
    const selChar = selectChar.value;
    const selAction = selectAction.value;
    const customKey = `${selChar}_${selAction}`;
    const textVal = adminDialogueInput.value.trim();
    
    if (textVal === "") {
      delete customDialogues[customKey];
      showDialogue("✨ 已重設回預設對話文字！");
    } else {
      customDialogues[customKey] = textVal;
      showDialogue("✅ 對話文字儲存成功！");
    }
    
    saveDb('dialogues');
    updateDialogueUI(selChar, selAction);
    
    // Apply dialogue immediately if current state matches
    if (currentCharacter === selChar && currentMascotState === selAction) {
      showDialogueForState(selChar, selAction);
    }
  });

  // Helper to update dialogue settings values
  function updateDialogueUI(char, action) {
    const key = `${char}_${action}`;
    const defaultText = defaultTexts[action] || "";
    const rawDefault = Array.isArray(defaultText) ? defaultText.join(' | ') : defaultText;
    const appliedText = customDialogues[key] !== undefined ? customDialogues[key] : rawDefault;
    
    adminDialogueDefaultHint.innerText = `目前套用: ${appliedText}`;
    adminDialogueDefaultHint.title = `目前套用: ${appliedText}`;
    
    const customText = customDialogues[key];
    adminDialogueInput.value = customText !== undefined ? customText : "";

    // Prevent default character 'cat' from being modified (dialogues & images)
    if (char === 'cat') {
      adminDialogueInput.disabled = true;
      adminDialogueInput.placeholder = "⚠️ 預設角色『魔法小貓』不開放修改對話";
      adminSaveDialogueBtn.disabled = true;
      adminSaveDialogueBtn.style.opacity = '0.5';
      adminUploadBtn.disabled = true;
      adminUploadBtn.style.opacity = '0.5';
      adminUploadBtn.innerText = "⚠️ 預設角色『魔法小貓』不開放上傳動圖";
    } else {
      adminDialogueInput.disabled = false;
      adminDialogueInput.placeholder = "輸入此動作觸發時的對話文字";
      adminSaveDialogueBtn.disabled = false;
      adminSaveDialogueBtn.style.opacity = '1';
      adminUploadBtn.disabled = false;
      adminUploadBtn.style.opacity = '1';
      adminUploadBtn.innerText = "選擇並上傳 WebP 檔案";
    }
  }

  // Populate history list dynamically
  function loadHistoryList(char, action) {
    historyList.innerHTML = '';
    const key = `${char}_${action}`;
    const list = imageHistory[key] || [];
    
    if (list.length === 0) {
      historyList.innerHTML = '<div style="color: #888; text-align: center; padding: 4px; font-size: 10px;">目前尚無此動作的歷史 WebP 動圖</div>';
      return;
    }
    
    if (action === 'clicked') {
      const tipBanner = document.createElement('div');
      tipBanner.style.color = '#FFEAA7';
      tipBanner.style.fontSize = '9px';
      tipBanner.style.marginBottom = '4px';
      tipBanner.style.textAlign = 'center';
      tipBanner.style.background = 'rgba(255, 234, 167, 0.1)';
      tipBanner.style.padding = '3px 6px';
      tipBanner.style.borderRadius = '4px';
      tipBanner.innerText = "🎲 點擊動作支援多組隨機觸發！歷史列表中的 WebP 皆會納入隨機輪播池。";
      historyList.appendChild(tipBanner);
    }
    
    list.forEach((filePath) => {
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.justify = 'space-between';
      row.style.alignItems = 'center';
      row.style.padding = '4px 6px';
      row.style.background = 'rgba(255,255,255,0.03)';
      row.style.border = '1px solid rgba(255,255,255,0.06)';
      row.style.borderRadius = '4px';
      row.style.fontSize = '9px';
      row.style.marginBottom = '2px';
      
      // Get base file name for display (robust for forward slash and Windows backslash)
      const baseName = filePath.substring(Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\')) + 1);
      
      const titleSpan = document.createElement('span');
      titleSpan.innerText = baseName;
      titleSpan.style.color = '#DFE6E9';
      titleSpan.style.maxWidth = '110px';
      titleSpan.style.overflow = 'hidden';
      titleSpan.style.textOverflow = 'ellipsis';
      titleSpan.style.whiteSpace = 'nowrap';
      
      row.appendChild(titleSpan);
      
      const btnGroup = document.createElement('div');
      btnGroup.style.display = 'flex';
      btnGroup.style.alignItems = 'center';
      btnGroup.style.gap = '4px';
      
      if (customImages[key] === filePath) {
        const activeBadge = document.createElement('span');
        activeBadge.innerText = "使用中";
        activeBadge.style.color = '#FFEAA7';
        activeBadge.style.fontWeight = 'bold';
        activeBadge.style.fontSize = '8px';
        btnGroup.appendChild(activeBadge);
      } else {
        const useBtn = document.createElement('button');
        useBtn.innerText = "啟用";
        useBtn.className = "task-btn";
        useBtn.style.padding = '2px 6px';
        useBtn.style.fontSize = '8px';
        useBtn.addEventListener('click', () => {
          customImages[key] = filePath;
          saveDb('images');
          
          if (currentCharacter === char && currentMascotState === action) {
            setMascotState(currentMascotState);
          }
          
          showDialogue("✨ 已切換至選取的 WebP 動圖！");
          loadHistoryList(char, action);
        });
        btnGroup.appendChild(useBtn);
      }
      
      // Delete history record button
      const delBtn = document.createElement('button');
      delBtn.innerText = "刪除";
      delBtn.className = "task-btn";
      delBtn.style.background = '#D63031';
      delBtn.style.padding = '2px 6px';
      delBtn.style.fontSize = '8px';
      delBtn.addEventListener('click', () => {
        imageHistory[key] = (imageHistory[key] || []).filter(p => p !== filePath);
        saveDb('history');
        
        if (customImages[key] === filePath) {
          delete customImages[key];
          saveDb('images');
          if (currentCharacter === char && currentMascotState === action) {
            setMascotState(currentMascotState);
          }
        }
        
        try {
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        } catch (err) {
          console.error("Failed to delete history file from disk:", err);
        }
        
        showDialogue("🗑️ 已刪除該歷史紀錄！");
        loadHistoryList(char, action);
      });
      btnGroup.appendChild(delBtn);
      
      row.appendChild(btnGroup);
      historyList.appendChild(row);
    });
    renderActionsTab();
  }

// --- Quick Launcher Module (快捷檔案開啟器) ---
let currentLaunchMode = 'private'; // 'private' or 'public'
let launcherData = {
  private: { categories: [] },
  public: { categories: [] }
};
let editingCatId = null;
let editingItemCatId = null;
let editingItemId = null;

let draggedCatIndex = null;
let draggedItemCatId = null;
let draggedItemIndex = null;

function getLaunchersFilePath(mode) {
  let projectDir = "";
  try {
    let rawPath = window.location.pathname;
    if (rawPath.startsWith('/') && rawPath.charAt(2) === ':') {
      rawPath = rawPath.substring(1);
    }
    const htmlPath = decodeURIComponent(rawPath);
    const lastSlash = Math.max(htmlPath.lastIndexOf('/'), htmlPath.lastIndexOf('\\'));
    projectDir = htmlPath.substring(0, lastSlash);
  } catch (e) {
    console.error("getLaunchersFilePath path error:", e);
  }
  const fileName = mode === 'private' ? 'private_launchers.json' : 'public_launchers.json';
  return path.join(projectDir || '.', 'assets', fileName);
}

function loadLaunchersData() {
  ['private', 'public'].forEach(mode => {
    const filePath = getLaunchersFilePath(mode);
    try {
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf8');
        launcherData[mode] = JSON.parse(raw);
      } else {
        launcherData[mode] = {
          categories: [
            {
              id: `cat_def_${mode}_1`,
              title: mode === 'private' ? '🔒 個人常用捷徑' : '🌐 公開團隊捷徑',
              note: mode === 'private' ? '個人開發工具或程式 (不推至 Git)' : '團隊共享檔案與開啟檔 (會提交至 Git)',
              items: [
                {
                  id: `item_def_${mode}_1`,
                  title: '開啟記事本 (Notepad)',
                  path: 'notepad.exe',
                  note: '點擊執行開啟 Windows 記事本'
                }
              ]
            }
          ]
        };
        saveLaunchersData(mode);
      }
    } catch (e) {
      console.error(`Failed to load ${mode} launchers data:`, e);
      launcherData[mode] = { categories: [] };
    }
  });
}

function saveLaunchersData(mode) {
  const filePath = getLaunchersFilePath(mode);
  try {
    const targetDir = path.dirname(filePath);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(launcherData[mode], null, 2), 'utf8');
  } catch (e) {
    console.error(`Failed to save ${mode} launchers data:`, e);
  }
}

function renderQuickLaunchUI() {
  const container = document.getElementById('launch-categories-container');
  if (!container) return;
  container.innerHTML = '';

  const modeData = launcherData[currentLaunchMode];
  if (!modeData || !modeData.categories || modeData.categories.length === 0) {
    container.innerHTML = `<div style="text-align: center; color: #888; padding: 20px; font-size: 11px;">目前尚無 ${currentLaunchMode === 'private' ? '🔒 私人' : '🌐 公開'} 分類，點擊右上角『➕ 新增分類』開始建立！</div>`;
    return;
  }

  modeData.categories.forEach((cat, catIdx) => {
    const catCard = document.createElement('div');
    catCard.className = 'launch-cat-card';
    catCard.draggable = true;
    catCard.title = "按住拖曳可調整分類順序；點擊標題可收合/展開";

    // Category Drag & Drop Events
    catCard.ondragstart = (e) => {
      e.stopPropagation();
      draggedCatIndex = catIdx;
      catCard.classList.add('dragging');
    };

    catCard.ondragover = (e) => {
      e.preventDefault();
      if (draggedItemCatId !== null) {
        catCard.classList.add('drag-over');
      } else if (draggedCatIndex !== null && draggedCatIndex !== catIdx) {
        catCard.classList.add('drag-over');
      }
    };

    catCard.ondragleave = () => {
      catCard.classList.remove('drag-over');
    };

    catCard.ondragend = () => {
      catCard.classList.remove('dragging');
      catCard.classList.remove('drag-over');
      draggedCatIndex = null;
      draggedItemCatId = null;
      draggedItemIndex = null;
    };

    catCard.ondrop = (e) => {
      e.preventDefault();
      catCard.classList.remove('drag-over');

      if (draggedItemCatId !== null && draggedItemIndex !== null) {
        // Cross-category item move to category card!
        const sourceCat = modeData.categories.find(c => c.id === draggedItemCatId);
        const targetCat = cat;
        if (sourceCat && targetCat && sourceCat.id !== targetCat.id) {
          const [moved] = sourceCat.items.splice(draggedItemIndex, 1);
          if (!targetCat.items) targetCat.items = [];
          targetCat.items.push(moved);
          targetCat.collapsed = false; // Auto expand target category
          saveLaunchersData(currentLaunchMode);
          renderQuickLaunchUI();
        }
        draggedItemCatId = null;
        draggedItemIndex = null;
      } else if (draggedCatIndex !== null && draggedCatIndex !== catIdx) {
        const [moved] = modeData.categories.splice(draggedCatIndex, 1);
        modeData.categories.splice(catIdx, 0, moved);
        saveLaunchersData(currentLaunchMode);
        renderQuickLaunchUI();
        draggedCatIndex = null;
      }
    };

    const header = document.createElement('div');
    header.className = 'launch-cat-header';
    header.style.cursor = 'pointer';
    header.onclick = () => {
      cat.collapsed = !cat.collapsed;
      saveLaunchersData(currentLaunchMode);
      renderQuickLaunchUI();
    };

    const titleGroup = document.createElement('div');
    titleGroup.style.flex = '1';
    titleGroup.style.minWidth = '0';

    const itemCount = cat.items ? cat.items.length : 0;
    const arrowIcon = cat.collapsed ? '▶' : '▼';

    const titleEl = document.createElement('div');
    titleEl.className = 'launch-cat-title';
    titleEl.innerHTML = `<span style="font-size: 10px; color: #888; margin-right: 4px;" title="按住拖曳排序">≡</span> <span style="font-size: 10px; color: #74b9ff; margin-right: 4px;">${arrowIcon}</span> ${currentLaunchMode === 'private' ? '🔒' : '🌐'} ${cat.title} <span style="font-size: 9px; color: #888; margin-left: 6px; font-weight: normal;">(${itemCount}個項目)</span>`;

    const noteEl = document.createElement('div');
    noteEl.className = 'launch-cat-note';
    noteEl.innerText = cat.note ? `備註: ${cat.note}` : '無備註';

    titleGroup.appendChild(titleEl);
    titleGroup.appendChild(noteEl);

    // Category Action Buttons
    const btnGroup = document.createElement('div');
    btnGroup.style.display = 'flex';
    btnGroup.style.gap = '4px';
    btnGroup.style.alignItems = 'center';

    const addItemBtn = document.createElement('button');
    addItemBtn.className = 'task-btn';
    addItemBtn.style.padding = '2px 6px';
    addItemBtn.style.fontSize = '9px';
    addItemBtn.innerText = '➕ 項目';
    addItemBtn.title = '新增快捷開啟檔';
    addItemBtn.onclick = (e) => {
      e.stopPropagation();
      openItemEditor(cat.id, null);
    };

    const editCatBtn = document.createElement('button');
    editCatBtn.className = 'task-btn';
    editCatBtn.style.padding = '2px 6px';
    editCatBtn.style.fontSize = '9px';
    editCatBtn.innerText = '✏️';
    editCatBtn.title = '編輯分類標題與備註';
    editCatBtn.onclick = (e) => {
      e.stopPropagation();
      openCategoryEditor(cat.id);
    };

    const delCatBtn = document.createElement('button');
    delCatBtn.className = 'task-btn';
    delCatBtn.style.padding = '2px 6px';
    delCatBtn.style.fontSize = '9px';
    delCatBtn.style.background = '#D63031';
    delCatBtn.innerText = '🗑️';
    delCatBtn.title = '刪除此分類';
    delCatBtn.onclick = (e) => {
      e.stopPropagation();
      if (confirm(`確定要刪除分類『${cat.title}』及其包含的所有項目嗎？`)) {
        modeData.categories = modeData.categories.filter(c => c.id !== cat.id);
        saveLaunchersData(currentLaunchMode);
        renderQuickLaunchUI();
      }
    };

    btnGroup.appendChild(addItemBtn);
    btnGroup.appendChild(editCatBtn);
    btnGroup.appendChild(delCatBtn);

    header.appendChild(titleGroup);
    header.appendChild(btnGroup);

    // Items list container
    const catBody = document.createElement('div');
    catBody.className = 'launch-cat-body';
    if (cat.collapsed) {
      catBody.style.display = 'none';
    }

    if (!cat.items || cat.items.length === 0) {
      catBody.innerHTML = '<div style="color: #666; font-size: 10px; text-align: center; padding: 4px;">點擊右上角『➕ 項目』新增此分類內的快捷開啟檔</div>';
    } else {
      cat.items.forEach((item, itemIdx) => {
        const itemRow = document.createElement('div');
        itemRow.className = 'launch-item-row';
        itemRow.draggable = true;
        itemRow.title = "按住拖曳可調整順序或跨分類移動項目";

        // Item Drag & Drop Events
        itemRow.ondragstart = (e) => {
          e.stopPropagation();
          draggedItemCatId = cat.id;
          draggedItemIndex = itemIdx;
          itemRow.classList.add('dragging');
        };

        itemRow.ondragover = (e) => {
          if (draggedItemCatId !== null) {
            e.preventDefault();
            e.stopPropagation();
            itemRow.classList.add('drag-over');
          }
        };

        itemRow.ondragleave = (e) => {
          e.stopPropagation();
          itemRow.classList.remove('drag-over');
        };

        itemRow.ondragend = (e) => {
          e.stopPropagation();
          itemRow.classList.remove('dragging');
          itemRow.classList.remove('drag-over');
          draggedItemCatId = null;
          draggedItemIndex = null;
        };

        itemRow.ondrop = (e) => {
          e.preventDefault();
          e.stopPropagation();
          itemRow.classList.remove('drag-over');

          if (draggedItemCatId !== null && draggedItemIndex !== null) {
            const sourceCat = modeData.categories.find(c => c.id === draggedItemCatId);
            const targetCat = cat;
            if (sourceCat && targetCat) {
              if (sourceCat.id === targetCat.id) {
                // Same category reorder
                if (draggedItemIndex !== itemIdx) {
                  const [moved] = sourceCat.items.splice(draggedItemIndex, 1);
                  sourceCat.items.splice(itemIdx, 0, moved);
                }
              } else {
                // Cross-category move to target item position!
                const [moved] = sourceCat.items.splice(draggedItemIndex, 1);
                if (!targetCat.items) targetCat.items = [];
                targetCat.items.splice(itemIdx, 0, moved);
                targetCat.collapsed = false; // Auto expand target category
              }
              saveLaunchersData(currentLaunchMode);
              renderQuickLaunchUI();
            }
          }
          draggedItemCatId = null;
          draggedItemIndex = null;
        };

        const itemInfo = document.createElement('div');
        itemInfo.className = 'launch-item-info';

        const itemName = document.createElement('div');
        itemName.className = 'launch-item-name';
        itemName.innerHTML = `<span style="font-size: 9px; color: #888; margin-right: 4px;" title="按住拖曳排序">≡</span> ${item.title}`;

        const itemPath = document.createElement('div');
        itemPath.className = 'launch-item-path';
        itemPath.innerText = item.path || '未指定路徑';

        const itemNote = document.createElement('div');
        itemNote.className = 'launch-item-note';
        itemNote.innerText = item.note ? `備註: ${item.note}` : '';

        itemInfo.appendChild(itemName);
        itemInfo.appendChild(itemPath);
        if (item.note) itemInfo.appendChild(itemNote);

        const itemBtnGroup = document.createElement('div');
        itemBtnGroup.style.display = 'flex';
        itemBtnGroup.style.gap = '4px';
        itemBtnGroup.style.alignItems = 'center';

        // EXECUTE BUTTON!
        const execBtn = document.createElement('button');
        execBtn.className = 'btn-exec-launch';
        execBtn.innerText = '▶ 執行';
        execBtn.onclick = async (e) => {
          e.stopPropagation();
          if (!item.path) {
            showDialogue("⚠️ 請先設定檔案或程式的路徑！");
            return;
          }
          showDialogue(`🚀 正在開啟：${item.title}...`, 2000);
          const res = await ipcRenderer.invoke('launch-file', item.path);
          if (res && res.success) {
            showDialogue(`✨ 成功啟動：${item.title}！`);
          } else {
            showDialogue(`⚠️ 無法開啟檔案: ${res ? res.error : '未知錯誤'}`);
          }
        };

        const editItemBtn = document.createElement('button');
        editItemBtn.className = 'task-btn';
        editItemBtn.style.padding = '2px 5px';
        editItemBtn.style.fontSize = '9px';
        editItemBtn.innerText = '✏️';
        editItemBtn.onclick = (e) => {
          e.stopPropagation();
          openItemEditor(cat.id, item.id);
        };

        const delItemBtn = document.createElement('button');
        delItemBtn.className = 'task-btn';
        delItemBtn.style.padding = '2px 5px';
        delItemBtn.style.fontSize = '9px';
        delItemBtn.style.background = '#D63031';
        delItemBtn.innerText = '🗑️';
        delItemBtn.onclick = (e) => {
          e.stopPropagation();
          cat.items = cat.items.filter(i => i.id !== item.id);
          saveLaunchersData(currentLaunchMode);
          renderQuickLaunchUI();
        };

        itemBtnGroup.appendChild(execBtn);
        itemBtnGroup.appendChild(editItemBtn);
        itemBtnGroup.appendChild(delItemBtn);

        itemRow.appendChild(itemInfo);
        itemRow.appendChild(itemBtnGroup);
        catBody.appendChild(itemRow);
      });
    }

    catCard.appendChild(header);
    catCard.appendChild(catBody);
    container.appendChild(catCard);
  });
}

function openCategoryEditor(catId = null) {
  editingCatId = catId;
  const modal = document.getElementById('category-editor-modal');
  const titleEl = document.getElementById('cat-editor-title');
  const titleInput = document.getElementById('cat-input-title');
  const noteInput = document.getElementById('cat-input-note');

  if (!modal) return;

  if (catId) {
    if (titleEl) titleEl.innerText = "✏️ 編輯分類";
    const modeData = launcherData[currentLaunchMode];
    const cat = modeData.categories.find(c => c.id === catId);
    if (cat) {
      if (titleInput) titleInput.value = cat.title || '';
      if (noteInput) noteInput.value = cat.note || '';
    }
  } else {
    if (titleEl) titleEl.innerText = "➕ 新增分類";
    if (titleInput) titleInput.value = '';
    if (noteInput) noteInput.value = '';
  }
  modal.classList.remove('hidden');
  ipcRenderer.send('set-ignore-mouse', false, { forward: false });
}

function openItemEditor(catId, itemId = null) {
  editingItemCatId = catId;
  editingItemId = itemId;
  const modal = document.getElementById('item-editor-modal');
  const titleEl = document.getElementById('item-editor-title');
  const titleInput = document.getElementById('item-input-title');
  const pathInput = document.getElementById('item-input-path');
  const noteInput = document.getElementById('item-input-note');

  if (!modal) return;

  if (itemId) {
    if (titleEl) titleEl.innerText = "✏️ 編輯捷徑項目";
    const modeData = launcherData[currentLaunchMode];
    const cat = modeData.categories.find(c => c.id === catId);
    if (cat) {
      const item = cat.items.find(i => i.id === itemId);
      if (item) {
        if (titleInput) titleInput.value = item.title || '';
        if (pathInput) pathInput.value = item.path || '';
        if (noteInput) noteInput.value = item.note || '';
      }
    }
  } else {
    if (titleEl) titleEl.innerText = "➕ 新增捷徑項目";
    if (titleInput) titleInput.value = '';
    if (pathInput) pathInput.value = '';
    if (noteInput) noteInput.value = '';
  }
  modal.classList.remove('hidden');
  ipcRenderer.send('set-ignore-mouse', false, { forward: false });
}

// --- Initialize App ---
window.addEventListener('DOMContentLoaded', async () => {
  console.log("DOMContentLoaded started");
  


  // Sync screen metrics
  await syncWindowPosition();
  console.log("syncWindowPosition completed, windowX:", windowX, "windowY:", windowY, "minX:", virtualDesktopMinX, "minY:", virtualDesktopMinY);
  
  // Set default initial state
  setMascotState('idle');
  console.log("setMascotState completed");
  
  // Register click pass-through
  registerMouseIgnore();
  console.log("registerMouseIgnore completed");
  
  // Init Drag and Drop
  initDragAndDrop();
  console.log("initDragAndDrop completed");
  
  // Initialize AI Walk
  startWalkingAI();
  console.log("startWalkingAI completed");
  
  // UI setup with fail-safe try-catch wrappers so core mascot AI & drag mechanics never freeze!
  try { initUIEvents(); } catch (e) { console.error("initUIEvents error:", e); }
  try { checkDailyReset(); } catch (e) { console.error("checkDailyReset error:", e); }
  try { updateLocks(); } catch (e) { console.error("updateLocks error:", e); }
  try { renderCharactersList(); } catch (e) { console.error("renderCharactersList error:", e); }
  try { updateTasksUI(); } catch (e) { console.error("updateTasksUI error:", e); }

  // Initialize Media Video Player element and listeners safely
  try {
    videoPlayer = document.getElementById('media-video-player') || document.getElementById('media-video-screen');
    if (videoPlayer) {
      videoPlayer.addEventListener('ended', () => {
        onTrackEnded();
      });
    }
    updateLoopModeUI();
    renderPlaylistUI();
  } catch (e) {
    console.error("Media player init error:", e);
  }

  // Volume Slider Initialization & Listener
  const volSlider = document.getElementById('player-volume');
  const volValText = document.getElementById('volume-value');
  if (volSlider && volValText) {
    volSlider.value = Math.round(mediaVolume * 100);
    volValText.innerText = `${volSlider.value}%`;
    if (videoPlayer) {
      videoPlayer.volume = mediaVolume;
    }
    volSlider.addEventListener('input', (e) => {
      const val = parseInt(e.target.value);
      mediaVolume = val / 100;
      localStorage.setItem('mascot_media_volume', mediaVolume);
      volValText.innerText = `${val}%`;
      if (videoPlayer) {
        videoPlayer.volume = mediaVolume;
      }
    });
  }

  // Listen to system updates
  ipcRenderer.on('system-status', (event, status) => {
    handlePCStatusAlert(status);
  });

  // Listen to audio sync events from other windows
  ipcRenderer.on('sync-audio-play', (event, trackId) => {
    playTrack(trackId, true); // play remotely (silently)
  });

  ipcRenderer.on('sync-audio-stop', () => {
    stopAllPlayback(false); // stop remotely
  });
  
  // Initialize Mouse Wheel Zoom listener on mascotContainer
  if (mascotContainer) {
    mascotContainer.style.transformOrigin = 'bottom center';
    mascotContainer.style.transform = `scale(${mascotScale})`;
    
    const mascotBody = document.getElementById('mascot-body');
    if (mascotBody) {
      mascotBody.addEventListener('wheel', (e) => {
        e.preventDefault();
        
        // Scroll up (deltaY < 0) -> Zoom In, Scroll down (deltaY > 0) -> Zoom Out
        if (e.deltaY < 0) {
          mascotScale = Math.min(2.0, mascotScale + 0.1);
        } else {
          mascotScale = Math.max(0.5, mascotScale - 0.1);
        }
        
        mascotContainer.style.transform = `scale(${mascotScale})`;
        localStorage.setItem(`mascot_scale_${screenIndex}`, mascotScale.toFixed(2));
        
        showDialogue(`🔍 體型已調整為 ${Math.round(mascotScale * 100)}%`);
      }, { passive: false });
    }
  }

  showDialogue("✨ 召喚完成！魔法小貓與您同在！");
});
