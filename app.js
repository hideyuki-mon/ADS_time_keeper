// ---- HELPERS（buildAgendaより先に定義が必要）----
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

// ---- アジェンダ定義（秒単位）----
const BASE_AGENDA = [
  {
    id: 'role',
    name: '司会・タイムキープ決め',
    duration: 60,
    desc: '司会者・タイムキープ担当を決めて入力してください',
    icon: '🤝',
    hasPresenter: false,
    isRoleSetup: true,
  },
  {
    id: 'good_new',
    name: 'Good & New',
    duration: 300,
    desc: '24時間以内の良かったこと・新しい発見を1人1分で話す。最後は「以上です！」→拍手',
    icon: '👏',
    hasPresenter: true,
    presenterDuration: 60,
    isIntro: false,
  },
  {
    id: 'intro',
    name: '自己紹介図解の発表＋FB',
    duration: 2400,
    desc: '発表者ごとにフィードバックを行う（全体40分）',
    icon: '🗣️',
    hasPresenter: true,
    presenterDuration: null,
    presentDuration: 180,
    feedbackDuration: 300,
    isIntro: true,
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

function buildAgenda(mc) {
  return BASE_AGENDA.map(item => {
    if (item.id === 'intro') {
      const perPerson = item.presentDuration + item.feedbackDuration;
      return {
        ...item,
        presenterDuration: perPerson,
        duration: perPerson * mc,
        desc: `1人あたり約${formatMin(perPerson)}　🗣 発表 ${formatMin(item.presentDuration)} ＋ 💬 フィードバック ${formatMin(item.feedbackDuration)}`,
      };
    }
    return { ...item };
  });
}

// ---- STATE ----
let agenda = buildAgenda(5);
let memberCount = 5;
let facilitatorName = '未定';
let timekeeperName = '未定';
let teamName = '';

let currentAgendaIndex = 0;
let totalSecondsLeft = 0;
let totalSecondsOriginal = 0;
let mainTimerInterval = null;
let isRunning = false;

let presenterIndex = 0;
let presenterSecondsLeft = 0;
let presenterSecondsOriginal = 0;
let presenterTimerInterval = null;
let presenterNames = [];
let introPhase = 'present';

// ---- DOM ----
const displayFacilitator = document.getElementById('display-facilitator');
const displayTimekeeper = document.getElementById('display-timekeeper');
const displayTeam = document.getElementById('display-team');
const displayTeamBadge = document.getElementById('display-team-badge');
const agendaListEl = document.getElementById('agenda-list');

const currentAgendaTitle = document.getElementById('current-agenda-title');
const currentAgendaDesc = document.getElementById('current-agenda-desc');
const timerDisplay = document.getElementById('timer-display');
const timerMinutes = document.getElementById('timer-minutes');
const timerSeconds = document.getElementById('timer-seconds');
const timerProgressBar = document.getElementById('timer-progress-bar');
const timerProgress = document.getElementById('timer-progress');

const roleForm = document.getElementById('role-form');
const facilitatorInput = document.getElementById('facilitator-name');
const timekeeperInput = document.getElementById('timekeeper-name');
const teamNameInput = document.getElementById('team-name');
const memberCountInput = document.getElementById('member-count');
const applyRolesBtn = document.getElementById('apply-roles-btn');

const presenterTracker = document.getElementById('presenter-tracker');
const currentPresenterName = document.getElementById('current-presenter-name');
const presenterCount = document.getElementById('presenter-count');
const presenterTimerDisplay = document.getElementById('presenter-timer-display');
const presenterMinutesEl = document.getElementById('presenter-minutes');
const presenterSecsEl = document.getElementById('presenter-seconds');
const presenterPhaseLabel = document.getElementById('presenter-phase-label');

const introPhaseBar = document.getElementById('intro-phase-bar');
const phaseBtnPresent = document.getElementById('phase-btn-present');
const phaseBtnFeedback = document.getElementById('phase-btn-feedback');
const phasePresentTime = document.getElementById('phase-present-time');
const phaseFeedbackTime = document.getElementById('phase-feedback-time');

const introGuide = document.getElementById('intro-guide');
const guideSlackChannel = document.getElementById('guide-slack-channel');
const guideStepEls = document.querySelectorAll('.guide-step');

const nextPresenterBtn = document.getElementById('next-presenter-btn');
const goFeedbackBtn = document.getElementById('go-feedback-btn');

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

// ---- 残りHELPERS ----
function showAlert(icon, message) {
  alertIcon.textContent = icon;
  alertMessage.textContent = message;
  alertOverlay.classList.remove('hidden');
  playBeep();
}

function playBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    for (let i = 0; i < 3; i++) {
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
  } catch (e) { /* 無視 */ }
}

function updateRolesBar() {
  displayFacilitator.textContent = facilitatorName || '未定';
  displayTimekeeper.textContent = timekeeperName || '未定';
  if (teamName) {
    displayTeam.textContent = teamName;
    displayTeamBadge.style.display = '';
  } else {
    displayTeamBadge.style.display = 'none';
  }
}

// ---- RENDER AGENDA LIST ----
function renderAgendaList() {
  agendaListEl.innerHTML = '';
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
    agendaListEl.appendChild(el);
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

  // 役割設定アジェンダ：フォーム表示
  if (item.isRoleSetup) {
    roleForm.classList.remove('hidden');
    timerDisplay.classList.add('hidden');
    timerProgress.classList.add('hidden');
    timerStartBtn.disabled = true;
  } else {
    roleForm.classList.add('hidden');
    timerDisplay.classList.remove('hidden');
    timerProgress.classList.remove('hidden');
    timerStartBtn.disabled = false;
  }

  // 発表者トラッカー
  if (item.hasPresenter) {
    presenterTracker.classList.remove('hidden');
    presenterIndex = 0;
    presenterNames = buildPresenterNames();
    loadPresenter(item);

    if (item.isIntro) {
      introPhaseBar.classList.remove('hidden');
      introGuide.classList.remove('hidden');
      phasePresentTime.textContent = `(${formatMin(item.presentDuration)})`;
      phaseFeedbackTime.textContent = `(${formatMin(item.feedbackDuration)})`;
      const ch = teamName ? `${teamName}_ホーム` : '{チーム名}_ホーム';
      guideSlackChannel.textContent = `Slackの #${ch}`;
      setIntroPhase('present', item);
    } else {
      introPhaseBar.classList.add('hidden');
      introGuide.classList.add('hidden');
      goFeedbackBtn.classList.add('hidden');
      nextPresenterBtn.classList.remove('hidden');
      presenterPhaseLabel.textContent = '発表者タイマー';
    }
  } else {
    presenterTracker.classList.add('hidden');
  }

  renderAgendaList();
}

function buildPresenterNames() {
  return Array.from({ length: memberCount }, (_, i) => `参加者 ${i + 1}`);
}

function loadPresenter(item) {
  presenterIndex = 0;
  const duration = item.isIntro ? item.presentDuration : (item.presenterDuration || 60);
  presenterSecondsLeft = duration;
  presenterSecondsOriginal = duration;
  presenterTimerInterval = null;
  updatePresenterDisplay(item);
  updatePresenterTimerDisplay();
  if (item.isIntro) setIntroPhase('present', item);
}

function setIntroPhase(phase, item) {
  introPhase = phase;
  phaseBtnPresent.classList.toggle('active', phase === 'present');
  phaseBtnFeedback.classList.toggle('active', phase === 'feedback');

  if (phase === 'present') {
    presenterPhaseLabel.textContent = '🗣 発表タイマー';
    presenterSecondsLeft = item.presentDuration;
    presenterSecondsOriginal = item.presentDuration;
    presenterTimerInterval = null;
    goFeedbackBtn.classList.remove('hidden');
    nextPresenterBtn.classList.add('hidden');
    highlightGuideSteps([0, 1, 2]);
  } else {
    presenterPhaseLabel.textContent = '💬 フィードバックタイマー';
    presenterSecondsLeft = item.feedbackDuration;
    presenterSecondsOriginal = item.feedbackDuration;
    presenterTimerInterval = null;
    goFeedbackBtn.classList.add('hidden');
    nextPresenterBtn.classList.remove('hidden');
    highlightGuideSteps([3]);
  }
  updatePresenterTimerDisplay();
}

function highlightGuideSteps(activeIndices) {
  guideStepEls.forEach(step => {
    const idx = parseInt(step.dataset.step);
    step.classList.toggle('active', activeIndices.includes(idx));
    step.classList.toggle('dim', !activeIndices.includes(idx));
  });
}

function updatePresenterDisplay(item) {
  currentPresenterName.textContent = presenterNames[presenterIndex] || '-';
  presenterCount.textContent = `${presenterIndex + 1} / ${memberCount}人`;
}

function updatePresenterTimerDisplay() {
  const m = Math.floor(presenterSecondsLeft / 60);
  const s = presenterSecondsLeft % 60;
  presenterMinutesEl.textContent = String(m).padStart(2, '0');
  presenterSecsEl.textContent = String(s).padStart(2, '0');

  const ratio = presenterSecondsOriginal > 0 ? presenterSecondsLeft / presenterSecondsOriginal : 0;
  presenterTimerDisplay.classList.remove('warning', 'danger');
  if (ratio <= 0.15) presenterTimerDisplay.classList.add('danger');
  else if (ratio <= 0.3) presenterTimerDisplay.classList.add('warning');
}

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

      const item = agenda[currentAgendaIndex];
      if (item.hasPresenter) {
        if (presenterSecondsLeft > 0) {
          presenterSecondsLeft--;
          updatePresenterTimerDisplay();
        } else if (!presenterTimerInterval) {
          presenterTimerInterval = true;
          const name = presenterNames[presenterIndex];
          if (item.isIntro && introPhase === 'present') {
            showAlert('⏰', `${name}さんの発表時間です！\nフィードバックフェーズへ進んでください`);
          } else {
            showAlert('⏰', `${name}さんの時間です！\n次の発表者へ進んでください`);
          }
        }
      }

      if (totalSecondsLeft === 30) {
        showAlert('⚠️', `「${agenda[currentAgendaIndex].name}」残り30秒です！`);
      }
    } else {
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

  const ratio = totalSecondsOriginal > 0 ? totalSecondsLeft / totalSecondsOriginal : 0;
  timerDisplay.classList.remove('warning', 'danger', 'success');
  timerProgressBar.classList.remove('warning', 'danger');

  if (totalSecondsLeft === 0 || ratio <= 0.15) {
    timerDisplay.classList.add('danger');
    timerProgressBar.classList.add('danger');
  } else if (ratio <= 0.3) {
    timerDisplay.classList.add('warning');
    timerProgressBar.classList.add('warning');
  }
}

function updateProgressBar() {
  const ratio = totalSecondsOriginal > 0 ? (totalSecondsLeft / totalSecondsOriginal) * 100 : 0;
  timerProgressBar.style.width = `${ratio}%`;
}

// ---- APPLY ROLES ----
applyRolesBtn.addEventListener('click', () => {
  facilitatorName = facilitatorInput.value.trim() || '未定';
  timekeeperName = timekeeperInput.value.trim() || '未定';
  teamName = teamNameInput.value.trim();
  const newCount = parseInt(memberCountInput.value) || 5;
  memberCount = Math.min(10, Math.max(2, newCount));

  agenda = buildAgenda(memberCount);

  updateRolesBar();
  renderAgendaList();

  roleForm.classList.add('hidden');
  timerDisplay.classList.remove('hidden');
  timerProgress.classList.remove('hidden');
  timerStartBtn.disabled = false;
  startMainTimer();
});

// ---- PHASE / PRESENTER ----
function advancePhase() {
  const item = agenda[currentAgendaIndex];
  if (!item.isIntro || introPhase !== 'present') return;
  setIntroPhase('feedback', item);
}

function advancePresenter() {
  const item = agenda[currentAgendaIndex];
  if (!item.hasPresenter) return;
  presenterTimerInterval = null;

  if (presenterIndex < memberCount - 1) {
    presenterIndex++;
    updatePresenterDisplay(item);
    if (item.isIntro) {
      setIntroPhase('present', item);
    } else {
      presenterSecondsLeft = item.presenterDuration || 60;
      presenterSecondsOriginal = presenterSecondsLeft;
      updatePresenterTimerDisplay();
    }
  } else {
    showAlert('🎊', '全員の発表が終わりました！\n次のセッションへ進んでください');
  }
}

function advanceAgenda() {
  const next = currentAgendaIndex + 1;
  if (next >= agenda.length) {
    stopMainTimer();
    completionBanner.classList.remove('hidden');
    return;
  }
  loadAgenda(next);
}

// ---- EVENTS ----
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

  const item = agenda[currentAgendaIndex];
  if (item && item.hasPresenter) {
    presenterTimerInterval = null;
    if (item.isIntro) {
      setIntroPhase('present', item);
    } else {
      presenterSecondsLeft = presenterSecondsOriginal;
      updatePresenterTimerDisplay();
    }
  }
});

timerNextBtn.addEventListener('click', advanceAgenda);
goFeedbackBtn.addEventListener('click', advancePhase);
nextPresenterBtn.addEventListener('click', advancePresenter);

alertCloseBtn.addEventListener('click', () => {
  alertOverlay.classList.add('hidden');
});

restartBtn.addEventListener('click', () => {
  stopMainTimer();
  completionBanner.classList.add('hidden');
  facilitatorName = '未定';
  timekeeperName = '未定';
  teamName = '';
  memberCount = 5;
  agenda = buildAgenda(5);
  updateRolesBar();
  loadAgenda(0);
  timerStartBtn.innerHTML = '<span>▶</span> 開始';
});

document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  if (e.code === 'Space') {
    e.preventDefault();
    if (!alertOverlay.classList.contains('hidden')) {
      alertOverlay.classList.add('hidden');
      return;
    }
    if (isRunning) timerPauseBtn.click();
    else if (!timerStartBtn.disabled) timerStartBtn.click();
  }
  if (e.code === 'ArrowRight') {
    e.preventDefault();
    timerNextBtn.click();
  }
});

// ---- INIT ----
loadAgenda(0);
