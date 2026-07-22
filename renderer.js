const { ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');

// --- Global State ---
let userLevel = parseInt(localStorage.getItem('mascot_level')) || 1;
let userEnergy = parseInt(localStorage.getItem('mascot_energy')) || 0;
let lastLoginDate = localStorage.getItem('mascot_last_login') || '';
let cpuThreshold = parseInt(localStorage.getItem('mascot_cpu_threshold')) || 80;
let memThreshold = parseInt(localStorage.getItem('mascot_mem_threshold')) || 85;

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
    const states = ['idle', 'walk_left', 'walk_right', 'walk_up', 'walk_down', 'dragging', 'clicked', 'falling'];
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
      <div style="flex: 1; display: flex; flex-direction: column; gap: 2px; padding: 4px 0;">
        <div class="char-name">${char.name}</div>
        <div class="char-source">作品: ${char.source || '未分類'}</div>
      </div>
      <div class="char-status" style="font-size: 10px; color: #FFEAA7;">${currentCharacter === char.id ? '已啟用' : '點擊啟用'}</div>
    `;
    
    card.addEventListener('click', () => {
      currentCharacter = char.id;
      localStorage.setItem('mascot_current_character', char.id);
      renderCharactersList();
      
      const imgEl = document.getElementById('mascot-img');
      if (imgEl) imgEl.style.filter = 'none';
      
      document.getElementById('library-modal').classList.add('hidden');
      showDialogue(`✨ 切換角色為: ${char.name}！`);
      
      setMascotState(currentMascotState);
    });
    
    grid.appendChild(card);
  });
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

// Mascot Position & AI Variables
let windowX = 0;
let windowY = 0;
let screenWidth = 1920;
let screenHeight = 1080;
const windowWidth = 450;
const windowHeight = 350;

let isWalking = false;
let walkDirection = 'right'; // 'right', 'left', 'up', 'down'
let walkSpeed = 1.5;
let walkTargetX = 0;
let walkTargetY = 0;
let walkTimer = null;
let walkStepsCount = 0;

let isDragging = false;
let isFalling = false;
let fallSpeed = 0;
const gravity = 0.8;
let taskbarOffset = 50; // estimate taskbar height on Windows

let currentMascotState = 'idle'; // idle, walking, dragging, falling, clicked
let currentCharacter = localStorage.getItem('mascot_current_character') || 'cat';

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

// --- Audio Synthesizer (Chiptune 8-Bit) ---
let audioCtx = null;
let synthInterval = null;
let currentTrack = null;
let isPlaying = false;
let playTimeTimer = null;
let audioSourceNode = null;
let analyserNode = null;
let visualizerAnimationId = null;

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
    analyserNode.getByteFrequencyData(dataArray);
    
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
      canvasCtx.fillStyle = `hsla(${hue}, 85%, 65%, 0.85)`;
      
      // Glow effect
      canvasCtx.shadowBlur = 8;
      canvasCtx.shadowColor = `hsla(${hue}, 85%, 65%, 0.5)`;
      
      // Render visualizer bar
      canvasCtx.fillRect(x, canvas.height - barHeight, barWidth - 3, barHeight);
      
      x += barWidth;
    }
    canvasCtx.shadowBlur = 0; // reset shadow
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

function playTrack(trackId) {
  const playlist = getPlaylist();
  if (playlist.length === 0) {
    showDialogue("📭 播放清單目前是空的，請先點選「上傳影音」上傳您的影片或音樂檔案！");
    return;
  }
  
  const targetId = trackId || currentTrackId || playlist[0].id;
  const track = playlist.find(t => t.id === targetId) || playlist[0];
  if (!track) return;
  
  stopAllPlayback();
  
  currentTrackId = trackId;
  localStorage.setItem('mascot_current_track_id', trackId);
  isPlaying = true;
  
  document.getElementById('playing-title').innerText = track.name;
  document.getElementById('player-play').innerText = "⏸";
  
  renderPlaylistUI();
  
  if (track.type === 'synth') {
    document.getElementById('media-visualizer-placeholder').style.display = 'flex';
    document.getElementById('media-video-player').style.display = 'none';
    startChiptune(track.trackIdx);
    startVisualizerAnimation();
  } else {
    // Custom audio/video playing via HTML5 video element
    videoPlayer.src = track.path;
    videoPlayer.volume = mediaVolume;
    videoPlayer.load();
    
    if (track.type === 'video') {
      document.getElementById('media-visualizer-placeholder').style.display = 'none';
      document.getElementById('media-video-player').style.display = 'block';
    } else {
      document.getElementById('media-visualizer-placeholder').style.display = 'flex';
      document.getElementById('media-video-player').style.display = 'none';
      startVisualizerAnimation();
    }
    
    videoPlayer.play().catch(e => {
      console.error("Playback failed:", e);
    });
    
    startTaskTimer();
    showDialogue(`▶ 正在播放 ${track.name}`);
  }
}

function stopAllPlayback() {
  isPlaying = false;
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
  }
  
  if (playTimeTimer) clearInterval(playTimeTimer);
  
  document.getElementById('player-play').innerText = "▶";
  document.getElementById('playing-title').innerText = "無";
}

function startTaskTimer() {
  if (playTimeTimer) clearInterval(playTimeTimer);
  playTimeTimer = setInterval(() => {
    if (isPlaying) {
      dailyProgress.musicTime++;
      if (dailyProgress.musicTime >= 60 && !dailyProgress.musicClaimed) {
        const musicBtn = document.getElementById('btn-task-music');
        if (musicBtn) {
          musicBtn.classList.remove('disabled');
          musicBtn.removeAttribute('disabled');
        }
      }
      saveProgress();
      updateTasksUI();
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
function registerMouseIgnore() {
  // Elements that can be clicked on
  const interactiveElements = [
    mascotBody,
    speechBubble,
    contextMenu,
    tasksModal,
    libraryModal,
    document.getElementById('settings-modal'),
    document.getElementById('admin-modal'),
    document.getElementById('media-modal')
  ];

  window.addEventListener('mousemove', (e) => {
    // If context menu is open, capture all mouse events to allow clicking anywhere to dismiss it!
    if (!contextMenu.classList.contains('hidden')) {
      ipcRenderer.send('set-ignore-mouse', false, { forward: true });
      return;
    }

    let onInteractive = false;
    for (const el of interactiveElements) {
      if (el && !el.classList.contains('hidden')) {
        const rect = el.getBoundingClientRect();
        if (e.clientX >= rect.left && e.clientX <= rect.right &&
            e.clientY >= rect.top && e.clientY <= rect.bottom) {
          onInteractive = true;
          break;
        }
      }
    }
    
    // Send ignore mouse state to main process
    ipcRenderer.send('set-ignore-mouse', !onInteractive, { forward: true });
  });
}

// --- Character Dialogue Engine ---
function showDialogue(text, duration = 4000) {
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
  dragging: "放開我啦喵！><",
  falling: "哇啊啊！重力吸引中！💥",
  clicked: "嘻嘻，主人找我玩嗎？✨",
  exiting: "再見囉，主人！我們會再見的！👋"
};

function showDialogueForState(char, state) {
  const customKey = `${char}_${state}`;
  const text = customDialogues[customKey] !== undefined ? customDialogues[customKey] : defaultTexts[state];
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
    const customKey = `${currentCharacter}_${state}`;
    if (customImages[customKey]) {
      imgEl.src = customImages[customKey];
      imgEl.style.transform = 'none'; // Reset scale transform for custom uploads
    } else {
      // Fallback to static placeholder images we generated
      if (state === 'idle') {
        imgEl.src = 'assets/idle.webp';
        imgEl.style.transform = 'none';
      } else if (state === 'walk_left' || state === 'walk_right' || state === 'walk_up' || state === 'walk_down') {
        imgEl.src = 'assets/walk.webp';
        // Fallback direction flipping
        if (state === 'walk_left') {
          imgEl.style.transform = 'scaleX(-1)';
        } else {
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

  // Trigger dialogue for this state
  // Avoid showing idle dialogue if transitioning back from a short clicked/falling/exiting state
  if (state !== 'idle' || (prevState !== 'clicked' && prevState !== 'exiting' && prevState !== 'falling')) {
    showDialogueForState(currentCharacter, state);
  }
}

// Fetch position and set bounds on load
async function syncWindowPosition() {
  const bounds = await ipcRenderer.invoke('get-window-bounds');
  if (bounds) {
    windowX = bounds.x;
    windowY = bounds.y;
    screenWidth = bounds.screenWidth;
    screenHeight = bounds.screenHeight;
  }
}

// --- Drag & Drop with Gravity ---
function initDragAndDrop() {
  mascotBody.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return; // Only left click
    
    isDragging = true;
    isFalling = false;
    isWalking = false;
    if (walkTimer) clearTimeout(walkTimer);
    
    setMascotState('dragging');
    showDialogue("放開我啦喵！><");
    
    ipcRenderer.send('drag-start', e.clientX, e.clientY);
    
    let lastDragTime = 0;
    const onMouseMove = () => {
      if (!isDragging) return;
      const now = performance.now();
      if (now - lastDragTime >= 16) { // Limit drag updates to ~60 FPS
        ipcRenderer.send('drag-move');
        lastDragTime = now;
      }
    };
    
    const onMouseUp = async () => {
      isDragging = false;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      
      // Update local position
      await syncWindowPosition();
      
      // Start falling back to bottom of screen (gravity simulation!)
      isFalling = true;
      fallSpeed = 0;
      setMascotState('falling');
      requestAnimationFrame(gravityFallLoop);
      
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

  // Allow clicking and dragging anywhere on the dark modal background overlay to move the window
  let isOverlayDragging = false;
  document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return; // Only left click
      if (e.target === modal) { // Make sure click is on background overlay itself, not modal-content card
        isOverlayDragging = true;
        ipcRenderer.send('drag-start', e.clientX, e.clientY);
        
        let lastDragTime = 0;
        const onMouseMove = () => {
          if (!isOverlayDragging) return;
          const now = performance.now();
          if (now - lastDragTime >= 16) { // limit drag updates to ~60 FPS
            ipcRenderer.send('drag-move');
            lastDragTime = now;
          }
        };
        
        const onMouseUp = async () => {
          isOverlayDragging = false;
          window.removeEventListener('mousemove', onMouseMove);
          window.removeEventListener('mouseup', onMouseUp);
          await syncWindowPosition();
        };
        
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
      }
    });
  });
}

// Gravity Falling Loop
function gravityFallLoop() {
  if (!isFalling) return;
  
  const targetY = screenHeight - windowHeight - taskbarOffset;
  
  if (windowY < targetY) {
    fallSpeed += gravity;
    windowY += fallSpeed;
    if (windowY >= targetY) {
      windowY = targetY;
      isFalling = false;
      setMascotState('clicked'); // Landing happy state
      showDialogue("呼！安全降落！🌟");
      setTimeout(() => {
        if (currentMascotState === 'clicked') {
          setMascotState('idle');
          startWalkingAI(); // Resume AI
        }
      }, 1000);
    }
    ipcRenderer.send('set-window-position', windowX, windowY);
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
  if (isDragging || isFalling || isWalking) return;
  if (isAnyModalOpen()) return; // Stop walking AI if any setting modal is open
  
  // Decide walk frequency randomly
  const delay = 2000 + Math.random() * 3000; // 2~5 seconds (increased walking frequency!)
  walkTimer = setTimeout(async () => {
    await syncWindowPosition();
    
    // Choose random direction
    const directions = ['left', 'right', 'up', 'down'];
    const dir = directions[Math.floor(Math.random() * directions.length)];
    
    isWalking = true;
    
    const dist = 100 + Math.random() * 150; // Walk 100~250px
    
    walkTargetX = windowX;
    walkTargetY = windowY;
    
    let walkState = 'idle';
    
    if (dir === 'left') {
      walkTargetX = windowX - dist;
      walkState = 'walk_left';
    } else if (dir === 'right') {
      walkTargetX = windowX + dist;
      walkState = 'walk_right';
    } else if (dir === 'up') {
      walkTargetY = windowY - dist;
      walkState = 'walk_up';
    } else if (dir === 'down') {
      walkTargetY = windowY + dist;
      walkState = 'walk_down';
    }
    
    // Screen boundary check
    const maxY = screenHeight - windowHeight - taskbarOffset;
    const maxX = screenWidth - windowWidth;
    
    if (walkTargetX < 0) {
      walkTargetX = 10;
    }
    if (walkTargetX > maxX) {
      walkTargetX = maxX - 10;
    }
    if (walkTargetY < 0) {
      walkTargetY = 10;
    }
    if (walkTargetY > maxY) {
      walkTargetY = maxY - 10;
    }
    
    // Safety check: if target is too close to current position, pick again immediately
    const diffX = walkTargetX - windowX;
    const diffY = walkTargetY - windowY;
    if (Math.abs(diffX) < 5 && Math.abs(diffY) < 5) {
      isWalking = false;
      startWalkingAI();
      return;
    }
    
    walkDirection = dir;
    setMascotState(walkState);
    
    walkLoop();
  }, delay);
}

let lastWindowMoveTime = 0;
function walkLoop() {
  if (!isWalking || isDragging || isFalling) return;
  
  let arrived = false;
  const speed = 1.5;
  
  if (walkDirection === 'left') {
    windowX -= speed;
    if (windowX <= walkTargetX) {
      windowX = walkTargetX;
      arrived = true;
    }
  } else if (walkDirection === 'right') {
    windowX += speed;
    if (windowX >= walkTargetX) {
      windowX = walkTargetX;
      arrived = true;
    }
  } else if (walkDirection === 'up') {
    windowY -= speed;
    if (windowY <= walkTargetY) {
      windowY = walkTargetY;
      arrived = true;
    }
  } else if (walkDirection === 'down') {
    windowY += speed;
    if (windowY >= walkTargetY) {
      windowY = walkTargetY;
      arrived = true;
    }
  }
  
  walkStepsCount++;
  
  // Walk Task progress (update UI directly without heavy saveProgress/updateTasksUI redraws every step)
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
  
  // Throttle window position updates to ~30 FPS (every 33ms) to save CPU/GPU layout overhead
  const now = performance.now();
  if (now - lastWindowMoveTime >= 33) {
    ipcRenderer.send('set-window-position', windowX, windowY);
    lastWindowMoveTime = now;
  }
  
  if (arrived) {
    // Send final position to align perfectly
    ipcRenderer.send('set-window-position', walkTargetX, walkTargetY);
    isWalking = false;
    setMascotState('idle');
    saveProgress(); // Persist walk counts and state at the end of the walk path!
    startWalkingAI(); // loop next walk
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
  // Actions
  const spinAct = document.getElementById('act-spin');
  if (userLevel >= 2) {
    spinAct.classList.remove('locked-action');
    spinAct.innerText = "🌀 魔法轉圈圈 (已解鎖)";
  }
  const magicAct = document.getElementById('act-magic');
  if (userLevel >= 4) {
    magicAct.classList.remove('locked-action');
    magicAct.innerText = "✨ 釋放小魔法 (已解鎖)";
  }
}

// --- Menu & Modals Event listeners ---
function initUIEvents() {
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
    contextMenu.classList.remove('hidden');
    
    // Disable mouse ignore immediately when menu opens to capture click-away events!
    ipcRenderer.send('set-ignore-mouse', false, { forward: true });
    
    const menuWidth = contextMenu.offsetWidth || 160;
    const menuHeight = contextMenu.offsetHeight || 190;
    
    // Mascot center inside 450px width window is 225px
    // If clicked on left half, place menu on the right. If clicked on right half, place on left.
    let left = 0;
    if (e.clientX < 225) {
      left = 280; // Right of the mascot (spans 280 to 440)
    } else {
      left = 10; // Left of the mascot (spans 10 to 170)
    }
    
    // Vertical alignment near the cursor height but within window boundaries
    let top = e.clientY - 20;
    if (top + menuHeight > 350) {
      top = 350 - menuHeight - 10;
    }
    
    contextMenu.style.left = `${Math.max(5, left)}px`;
    contextMenu.style.top = `${Math.max(5, top)}px`;
  });

  window.addEventListener('click', (e) => {
    if (!contextMenu.contains(e.target)) {
      contextMenu.classList.add('hidden');
      
      // Re-evaluate mouse ignoring immediately based on click target
      let onInteractive = false;
      const interactiveElements = [
        mascotBody,
        speechBubble,
        contextMenu,
        tasksModal,
        libraryModal,
        document.getElementById('settings-modal'),
        document.getElementById('admin-modal'),
        document.getElementById('media-modal')
      ];
      for (const el of interactiveElements) {
        if (el && !el.classList.contains('hidden')) {
          const rect = el.getBoundingClientRect();
          if (e.clientX >= rect.left && e.clientX <= rect.right &&
              e.clientY >= rect.top && e.clientY <= rect.bottom) {
            onInteractive = true;
            break;
          }
        }
      }
      ipcRenderer.send('set-ignore-mouse', !onInteractive, { forward: true });
    }
  });

  // Also close context menu when window loses focus (clicked on desktop outside)
  window.addEventListener('blur', () => {
    contextMenu.classList.add('hidden');
    ipcRenderer.send('set-ignore-mouse', true, { forward: true });
  });

  // Quit with animation and goodbye speech
  document.getElementById('menu-quit').addEventListener('click', () => {
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


  // Tasks Panel trigger
  document.getElementById('menu-tasks').addEventListener('click', () => {
    tasksModal.classList.remove('hidden');
    contextMenu.classList.add('hidden');
    updateTasksUI();
    isWalking = false;
    if (walkTimer) clearTimeout(walkTimer);
    setMascotState('idle');
  });
  
  document.getElementById('close-tasks').addEventListener('click', () => {
    tasksModal.classList.add('hidden');
    setTimeout(() => { if (!isAnyModalOpen()) startWalkingAI(); }, 100);
  });

  // Library Panel trigger
  document.getElementById('menu-library').addEventListener('click', () => {
    libraryModal.classList.remove('hidden');
    contextMenu.classList.add('hidden');
    updateLocks();
    renderCharactersList(); // update dynamic character list!
    isWalking = false;
    if (walkTimer) clearTimeout(walkTimer);
    setMascotState('idle');
  });
  
  document.getElementById('close-library').addEventListener('click', () => {
    libraryModal.classList.add('hidden');
    setTimeout(() => { if (!isAnyModalOpen()) startWalkingAI(); }, 100);
  });

  // Settings Panel trigger
  const settingsModal = document.getElementById('settings-modal');
  const cpuSlider = document.getElementById('cpu-slider');
  const memSlider = document.getElementById('mem-slider');
  const cpuVal = document.getElementById('cpu-val');
  const memVal = document.getElementById('mem-val');

  document.getElementById('menu-settings').addEventListener('click', () => {
    settingsModal.classList.remove('hidden');
    contextMenu.classList.add('hidden');
    
    // Set initial values
    cpuSlider.value = cpuThreshold;
    memSlider.value = memThreshold;
    cpuVal.innerText = cpuThreshold;
    memVal.innerText = memThreshold;
    
    isWalking = false;
    if (walkTimer) clearTimeout(walkTimer);
    setMascotState('idle');
  });

  document.getElementById('close-settings').addEventListener('click', () => {
    settingsModal.classList.add('hidden');
    setTimeout(() => { if (!isAnyModalOpen()) startWalkingAI(); }, 100);
  });

  // Slider change listeners
  cpuSlider.addEventListener('input', () => {
    cpuVal.innerText = cpuSlider.value;
  });

  memSlider.addEventListener('input', () => {
    memVal.innerText = memSlider.value;
  });

  // Save Settings
  document.getElementById('save-settings-btn').addEventListener('click', () => {
    cpuThreshold = parseInt(cpuSlider.value);
    memThreshold = parseInt(memSlider.value);
    
    localStorage.setItem('mascot_cpu_threshold', cpuThreshold);
    localStorage.setItem('mascot_mem_threshold', memThreshold);
    
    settingsModal.classList.add('hidden');
    showDialogue(`⚙️ 設定已儲存！CPU閥值: ${cpuThreshold}%, 記憶體閥值: ${memThreshold}%`);
    setTimeout(() => { if (!isAnyModalOpen()) startWalkingAI(); }, 100);
  });

  // Show Media Player Modal
  document.getElementById('menu-media-player').addEventListener('click', () => {
    document.getElementById('media-modal').classList.remove('hidden');
    contextMenu.classList.add('hidden');
    renderPlaylistUI();
    
    // Resume visualizer if audio is playing in the background
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

  document.getElementById('close-media').addEventListener('click', () => {
    document.getElementById('media-modal').classList.add('hidden');
    setTimeout(() => { if (!isAnyModalOpen()) startWalkingAI(); }, 100);
  });

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

  // Action showcase list
  document.querySelectorAll('.action-btn-item').forEach(item => {
    item.addEventListener('click', () => {
      const action = item.dataset.action;
      if (action === 'spin' && userLevel < 2) return;
      if (action === 'cast' && userLevel < 4) return;
      
      libraryModal.classList.add('hidden');
      isWalking = false;
      if (walkTimer) clearTimeout(walkTimer);
      
      if (action === 'idle') {
        setMascotState('idle');
        startWalkingAI();
      } else if (action === 'walk') {
        isWalking = true;
        const dir = Math.random() > 0.5 ? 'right' : 'left';
        walkDirection = dir;
        setMascotState(dir === 'right' ? 'walk_right' : 'walk_left');
        walkTargetX = dir === 'right' ? windowX + 100 : windowX - 100;
        walkTargetY = windowY;
        
        // Boundaries clamp
        const maxX = screenWidth - windowWidth;
        if (walkTargetX < 0) walkTargetX = 10;
        if (walkTargetX > maxX) walkTargetX = maxX - 10;
        
        walkLoop();
      } else if (action === 'spin') {
        setMascotState('clicked');
        showDialogue("🌀 轉圈圈魔法~ 嘿！");
        setTimeout(() => { setMascotState('idle'); startWalkingAI(); }, 3000);
      } else if (action === 'cast') {
        setMascotState('clicked');
        showDialogue("✨ 星光閃耀！轟！");
        setTimeout(() => {
          setMascotState('idle');
          startWalkingAI();
        }, 3000);
      }
    });
  });

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
      const states = ['idle', 'walk_left', 'walk_right', 'walk_up', 'walk_down', 'dragging', 'clicked', 'falling'];
      states.forEach(state => {
        delete customImages[`${charId}_${state}`];
        delete customDialogues[`${charId}_${state}`];
      });
      saveDb('images');
      saveDb('dialogues');
      
      // If it was the active character, reset to 'cat'
      if (currentCharacter === charId) {
        currentCharacter = 'cat';
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
      currentCharacter = selChar;
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
    
    // Apply dialogue immediately if current state matches
    if (currentCharacter === selChar && currentMascotState === selAction) {
      showDialogueForState(selChar, selAction);
    }
  });

  // Helper to update dialogue settings values
  function updateDialogueUI(char, action) {
    const key = `${char}_${action}`;
    const defaultText = defaultTexts[action] || "";
    adminDialogueDefaultHint.innerText = `預設: ${defaultText}`;
    adminDialogueDefaultHint.title = `預設: ${defaultText}`;
    
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
      titleSpan.style.maxWidth = '140px';
      titleSpan.style.overflow = 'hidden';
      titleSpan.style.textOverflow = 'ellipsis';
      titleSpan.style.whiteSpace = 'nowrap';
      
      row.appendChild(titleSpan);
      
      if (customImages[key] === filePath) {
        const activeBadge = document.createElement('span');
        activeBadge.innerText = "使用中";
        activeBadge.style.color = '#FFEAA7';
        activeBadge.style.fontWeight = 'bold';
        row.appendChild(activeBadge);
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
        row.appendChild(useBtn);
      }
      
      historyList.appendChild(row);
    });
  }
}

// --- Initialize App ---
window.addEventListener('DOMContentLoaded', async () => {
  // Sync screen metrics
  await syncWindowPosition();
  
  // Set default initial state
  setMascotState('idle');
  
  // Register click pass-through
  registerMouseIgnore();
  
  // Init Drag and Drop
  initDragAndDrop();
  
  // Initialize AI Walk
  startWalkingAI();
  
  // UI setup
  initUIEvents();
  checkDailyReset();
  updateLocks();
  renderCharactersList(); // Init dynamic character list rendering!
  updateTasksUI();

  // Initialize Media Video Player element and listeners
  videoPlayer = document.getElementById('media-video-player');
  if (videoPlayer) {
    videoPlayer.addEventListener('ended', () => {
      onTrackEnded();
    });
  }
  updateLoopModeUI();
  renderPlaylistUI();

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
  
  showDialogue("✨ 召喚完成！魔法小貓與您同在！");
});
