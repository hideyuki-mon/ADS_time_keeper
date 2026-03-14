// アジェンダ定義（秒単位）
const BASE_AGENDA = [
  {
    id: 'role',
    name: '司会・タイムキープ決め',
    duration: 60,
    desc: '司会1名、タイムキープ1名を決める',
    icon: '🤝',
    hasPresenter: false,
  },
  {
    id: 'good_new',
    name: 'Good & New',
    duration: 300,
    desc: '24時間以内の良かったこと・新しい発見を1人1分で話す。最後は「以上です！」→拍手',
    icon: '👏',
    hasPresenter: true,
    presenterDuration: 60,
  },
  {
    id: 'intro',
    name: '自己紹介図解の発表＋FB',
    duration: 2400,
    desc: '発表者ごとにフィードバックを行う（全体40分）',
    icon: '🗣️',
    hasPresenter: true,
    presenterDuration: null, // 人数に応じて計算
    presenterFeedbackDuration: null,
  },
  {
    id: 'discussion',
    name: '自由に意見交換',
    duration: 300,
    desc: '共通点やもっと聞きたいことを自由に話す',
    icon: '💬',
    hasPresenter: false,
  },
  {
    id: 'survey',
    name: 'アンケート回答',
    duration: 180,
    desc: 'Slackに送られているアンケートフォームのURLから回答する',
    icon: '📝',
    hasPresenter: false,
  },
  {
    id: 'closing',
    name: 'まとめ・終了',
    duration: 180,
    desc: '感謝を伝え合って退出する',
    icon: '🎉',
    hasPresenter: false,
  },
];

// 自己紹介アジェンダの1人あたり時間計算（40分 / 人数）
function buildAgenda(memberCount) {
  return BASE_AGENDA.map(item => {
    if (item.id === 'intro') {
      const perPerson = Math.floor(2400 / memberCount);
      return {
        ...item,
        presenterDuration: perPerson,
        presenterFeedbackDuration: Math.floor(perPerson * 0.4),
        desc: `1人あたり約${formatSeconds(perPerson)}（発表＋フィードバック）`,
      };
    }
    return { ...item };
  });
}

// ---- STATE ----
let agenda = [];
let memberCount = 5;
let facilitatorName = '';
let timekeeperName = '';

let currentAgendaIndex = 0;
let totalSecondsLeft = 0;
let totalSecondsOriginal = 0;
let mainTimerInterval = null;
let isRunning = false;

// 発表者トラッカー
let presenterIndex = 0;
let presenterSecondsLeft = 0;
let presenterSecondsOriginal = 0;
let presenterTimerInterval = null;
let presenterNames = [];

// ---- DOM ----
const setupScreen = document.getElementById('setup-screen');
const sessionScreen = document.getElementById('session-screen');
const facilitatorInput = document.getElementById('facilitator-name');
const timekeeperInput = document.getElementById('timekeeper-name');
const memberCountInput = document.getElementById('member-count');
const startBtn = document.getElementById('start-btn');

const displayFacilitator = document.getElementById('display-facilitator');
const displayTimekeeper = document.getElementById('display-timekeeper');
const agendaList = document.getElementById('agenda-list');

const currentAgendaTitle = document.getElementById('current-agenda-title');
const currentAgendaDesc = document.getElementById('current-agenda-desc');
const timerDisplay = document.getElementById('timer-display');
const timerMinutes = document.getElementById('timer-minutes');
const timerSeconds = document.getElementById('timer-seconds');
const timerProgressBar = document.getElementById('timer-progress-bar');

const presenterTracker = document.getElementById('presenter-tracker');
const currentPresenterName = document.getElementById('current-presenter-name');
const presenterCount = document.getElementById('presenter-count');
const presenterTimerDisplay = document.getElementById('presenter-timer-display');
const presenterMinutes = document.getElementById('presenter-minutes');
const presenterSecs = document.getElementById('presenter-seconds');
const nextPresenterBtn = document.getElementById('next-presenter-btn');

const timerStartBtn = document.getElementById('timer-start-btn');
const timerPauseBtn = document.getElementById('timer-pause-btn');
const timerResetBtn = document.getElementById('timer-reset-btn');
const timerNextBtn = document.getElementById('timer-next-btn');

const completionBanner = document.getElementById('completion-banner');
const restartBtn = document.getElementById('restart-btn');

const alertOverlay = document.getElementById('alert-overlay');
const alertMessage = document.getElementById('alert-message');
const alertIcon = document.getElementById('alert-icon');
const alertCloseBtn = document.getElementById('alert-close-btn');

// ---- HELPERS ----
function formatSeconds(s) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function formatMin(s) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  if (sec === 0) return `${m}分`;
  return `${m}分${sec}秒`;
}

function showAlert(icon, message) {
  alertIcon.textContent = icon;
  alertMessage.textContent = message;
  alertOverlay.classList.remove('hidden');
  // アラート音（Web Audio API）
  playBeep();
}

function playBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const beepCount = 3;
    for (let i = 0; i < beepCount; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0, ctx.currentTime + i * 0.35);
      gain.gain.linearRampToValueAtTime(0.4, ctx.currentTime + i * 0.35 + 0.05);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + i * 0.35 + 0.25);
      osc.start(ctx.currentTime + i * 0.35);
      osc.stop(ctx.currentTime + i * 0.35 + 0.3);
    }
  } catch (e) {
    // 無視
  }
}

// ---- RENDER AGENDA LIST ----
function renderAgendaList() {
  agendaList.innerHTML = '';
  agenda.forEach((item, idx) => {
    const el = document.createElement('div');
    el.className = 'agenda-item';
    if (idx === currentAgendaIndex) el.classList.add('active');
    if (idx < currentAgendaIndex) el.classList.add('completed');

    el.innerHTML = `
      <div class="agenda-item-num">${item.icon} ${idx + 1}</div>
      <div class="agenda-item-name">${item.name}</div>
      <div class="agenda-item-duration">⏱ ${formatMin(item.duration)}</div>
    `;
    el.addEventListener('click', () => jumpToAgenda(idx));
    agendaList.appendChild(el);
  });
}

// ---- LOAD AGENDA ----
function loadAgenda(idx) {
  stopMainTimer();
  stopPresenterTimer();

  currentAgendaIndex = idx;
  const item = agenda[idx];

  currentAgendaTitle.textContent = `${item.icon} ${item.name}`;
  currentAgendaDesc.textContent = item.desc;

  totalSecondsLeft = item.duration;
  totalSecondsOriginal = item.duration;

  updateMainTimerDisplay();
  updateProgressBar();

  timerStartBtn.disabled = false;
  timerPauseBtn.disabled = true;
  timerStartBtn.innerHTML = '<span>▶</span> 開始';
  isRunning = false;

  // 発表者トラッカー
  if (item.hasPresenter) {
    presenterTracker.classList.remove('hidden');
    presenterIndex = 0;
    presenterNames = buildPresenterNames(item);
    loadPresenter(item);
  } else {
    presenterTracker.classList.add('hidden');
  }

  renderAgendaList();
}

function buildPresenterNames(item) {
  const names = [];
  for (let i = 1; i <= memberCount; i++) {
    names.push(`参加者 ${i}`);
  }
  return names;
}

function loadPresenter(item) {
  const duration = item.presenterDuration || 60;
  presenterIndex = 0;
  presenterSecondsLeft = duration;
  presenterSecondsOriginal = duration;
  updatePresenterDisplay(item);
  updatePresenterTimerDisplay();
}

function updatePresenterDisplay(item) {
  const name = presenterNames[presenterIndex] || '-';
  currentPresenterName.textContent = name;
  presenterCount.textContent = `${presenterIndex + 1} / ${memberCount}人`;
}

function updatePresenterTimerDisplay() {
  const m = Math.floor(presenterSecondsLeft / 60);
  const s = presenterSecondsLeft % 60;
  presenterMinutes.textContent = String(m).padStart(2, '0');
  presenterSecs.textContent = String(s).padStart(2, '0');

  const ratio = presenterSecondsLeft / presenterSecondsOriginal;
  presenterTimerDisplay.classList.remove('warning', 'danger');
  if (ratio <= 0.15) presenterTimerDisplay.classList.add('danger');
  else if (ratio <= 0.3) presenterTimerDisplay.classList.add('warning');
}

// ---- JUMP TO AGENDA ----
function jumpToAgenda(idx) {
  if (idx >= agenda.length) return;
  loadAgenda(idx);
}

// ---- MAIN TIMER ----
function startMainTimer() {
  if (isRunning) return;
  isRunning = true;
  timerStartBtn.disabled = true;
  timerPauseBtn.disabled = false;

  mainTimerInterval = setInterval(() => {
    if (totalSecondsLeft > 0) {
      totalSecondsLeft--;
      updateMainTimerDisplay();
      updateProgressBar();

      // 自己紹介の場合は発表者タイマーも動かす
      const item = agenda[currentAgendaIndex];
      if (item.hasPresenter) {
        if (presenterSecondsLeft > 0) {
          presenterSecondsLeft--;
          updatePresenterTimerDisplay();
        } else if (presenterSecondsLeft === 0) {
          // 発表者時間終了通知（1回だけ）
          if (!presenterTimerInterval) {
            presenterTimerInterval = true; // フラグとして使用
            showAlert('⏰', `${presenterNames[presenterIndex]}さんの時間です！\n次の発表者へ進んでください`);
          }
        }
      }

      // 残り30秒警告
      if (totalSecondsLeft === 30) {
        showAlert('⚠️', `「${agenda[currentAgendaIndex].name}」残り30秒です！`);
      }
    } else {
      // タイマー終了
      stopMainTimer();
      showAlert('✅', `「${agenda[currentAgendaIndex].name}」終了！\n次のセッションへ進んでください`);
    }
  }, 1000);
}

function stopMainTimer() {
  clearInterval(mainTimerInterval);
  mainTimerInterval = null;
  isRunning = false;
  timerStartBtn.disabled = false;
  timerPauseBtn.disabled = true;
  timerStartBtn.innerHTML = '<span>▶</span> 再開';
}

function stopPresenterTimer() {
  presenterTimerInterval = null;
}

function updateMainTimerDisplay() {
  const m = Math.floor(totalSecondsLeft / 60);
  const s = totalSecondsLeft % 60;
  timerMinutes.textContent = String(m).padStart(2, '0');
  timerSeconds.textContent = String(s).padStart(2, '0');

  const ratio = totalSecondsLeft / totalSecondsOriginal;
  timerDisplay.classList.remove('warning', 'danger', 'success');
  timerProgressBar.classList.remove('warning', 'danger');

  if (totalSecondsLeft === 0) {
    timerDisplay.classList.add('danger');
    timerProgressBar.classList.add('danger');
  } else if (ratio <= 0.15) {
    timerDisplay.classList.add('danger');
    timerProgressBar.classList.add('danger');
  } else if (ratio <= 0.3) {
    timerDisplay.classList.add('warning');
    timerProgressBar.classList.add('warning');
  }
}

function updateProgressBar() {
  const ratio = totalSecondsOriginal > 0
    ? (totalSecondsLeft / totalSecondsOriginal) * 100
    : 0;
  timerProgressBar.style.width = `${ratio}%`;
}

// ---- NEXT PRESENTER ----
function advancePresenter() {
  const item = agenda[currentAgendaIndex];
  if (!item.hasPresenter) return;

  presenterTimerInterval = null; // フラグリセット

  if (presenterIndex < memberCount - 1) {
    presenterIndex++;
    presenterSecondsLeft = item.presenterDuration || 60;
    presenterSecondsOriginal = presenterSecondsLeft;
    updatePresenterDisplay(item);
    updatePresenterTimerDisplay();
  } else {
    showAlert('🎊', '全員の発表が終わりました！\n次のセッションへ進んでください');
  }
}

// ---- NEXT AGENDA ----
function advanceAgenda() {
  const next = currentAgendaIndex + 1;
  if (next >= agenda.length) {
    // セッション完了
    stopMainTimer();
    completionBanner.classList.remove('hidden');
    return;
  }
  loadAgenda(next);
}

// ---- EVENTS ----
startBtn.addEventListener('click', () => {
  facilitatorName = facilitatorInput.value.trim() || '未定';
  timekeeperName = timekeeperInput.value.trim() || '未定';
  memberCount = parseInt(memberCountInput.value) || 5;
  memberCount = Math.min(10, Math.max(2, memberCount));

  agenda = buildAgenda(memberCount);

  displayFacilitator.textContent = facilitatorName;
  displayTimekeeper.textContent = timekeeperName;

  setupScreen.classList.remove('active');
  sessionScreen.classList.add('active');

  loadAgenda(0);
});

timerStartBtn.addEventListener('click', startMainTimer);

timerPauseBtn.addEventListener('click', () => {
  if (isRunning) {
    stopMainTimer();
    timerStartBtn.innerHTML = '<span>▶</span> 再開';
  }
});

timerResetBtn.addEventListener('click', () => {
  stopMainTimer();
  totalSecondsLeft = totalSecondsOriginal;
  updateMainTimerDisplay();
  updateProgressBar();
  timerStartBtn.innerHTML = '<span>▶</span> 開始';

  // 発表者タイマーもリセット
  const item = agenda[currentAgendaIndex];
  if (item && item.hasPresenter) {
    presenterTimerInterval = null;
    presenterSecondsLeft = presenterSecondsOriginal;
    updatePresenterTimerDisplay();
  }
});

timerNextBtn.addEventListener('click', advanceAgenda);

nextPresenterBtn.addEventListener('click', advancePresenter);

alertCloseBtn.addEventListener('click', () => {
  alertOverlay.classList.add('hidden');
});

restartBtn.addEventListener('click', () => {
  stopMainTimer();
  completionBanner.classList.add('hidden');
  sessionScreen.classList.remove('active');
  setupScreen.classList.add('active');
  timerStartBtn.innerHTML = '<span>▶</span> 開始';
});

// スペースキーでタイマー操作
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  if (e.code === 'Space') {
    e.preventDefault();
    if (!alertOverlay.classList.contains('hidden')) {
      alertOverlay.classList.add('hidden');
      return;
    }
    if (isRunning) {
      timerPauseBtn.click();
    } else if (!timerStartBtn.disabled) {
      timerStartBtn.click();
    }
  }
  if (e.code === 'ArrowRight') {
    e.preventDefault();
    timerNextBtn.click();
  }
});
