const AureonOS = {
  version: '1.2 Alpha',
  deviceMode: localStorage.getItem('aureon_device_mode') || 'phone',
  theme: localStorage.getItem('aureon_theme') || 'dark',
  wallpaper: localStorage.getItem('aureon_wallpaper') || 'default',
  unlockMode: localStorage.getItem('aureon_unlock_mode') || 'swipe',
  unlockSecret: localStorage.getItem('aureon_unlock_secret') || '1234',
  soundProfile: localStorage.getItem('aureon_sound_profile') || 'normal',
  currentPinInput: '',
  audioCtx: null,

  wallpapers: {
    default: 'radial-gradient(circle at top right, #1e293b, #090d16 75%)',
    aurora: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #064e3b 100%)',
    sunset: 'linear-gradient(135deg, #1e1b4b 0%, #701a75 55%, #9a3412 100%)',
    cyber: 'radial-gradient(circle at bottom left, #083344, #020617 70%)'
  },

  init() {
    this.setDeviceMode(this.deviceMode, false);
    this.applyTheme(this.theme);
    this.applyWallpaper(this.wallpaper);
    this.startClock();
    this.monitorBattery();
    this.monitorNetwork();
    this.setupLockGesture();
    this.setupAuthEvents();
    this.bindEvents();
    this.bootSequence();
  },

  setDeviceMode(mode, playSfx = true) {
    this.deviceMode = mode;
    localStorage.setItem('aureon_device_mode', mode);

    const device = document.getElementById('aureon-device');
    const btnPhone = document.getElementById('btn-mode-phone');
    const btnTablet = document.getElementById('btn-mode-tablet');

    if (mode === 'tablet') {
      device.classList.remove('mode-phone');
      device.classList.add('mode-tablet');
      btnTablet.classList.add('active');
      btnPhone.classList.remove('active');
    } else {
      device.classList.remove('mode-tablet');
      device.classList.add('mode-phone');
      btnPhone.classList.add('active');
      btnTablet.classList.remove('active');
    }

    if (playSfx) this.playSound('notification');
  },

  toggleDeviceMode() {
    this.setDeviceMode(this.deviceMode === 'phone' ? 'tablet' : 'phone');
  },

  applyWallpaper(wpKey) {
    this.wallpaper = wpKey;
    localStorage.setItem('aureon_wallpaper', wpKey);
    const device = document.getElementById('aureon-device');
    if (this.theme === 'dark') {
      device.style.background = this.wallpapers[wpKey] || this.wallpapers.default;
    } else {
      device.style.background = '';
    }
  },

  getAudioContext() {
    if (!this.audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new AudioContextClass();
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
    return this.audioCtx;
  },

  bootSequence() {
    setTimeout(() => {
      this.switchScreen('lock-screen');
      this.playSound('boot');
    }, 2000);
  },

  switchScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
    if (screenId === 'lock-screen') {
      this.resetLockScreen();
    }
  },

  resetLockScreen() {
    const layer = document.getElementById('lock-drag-layer');
    const authOverlay = document.getElementById('auth-overlay');
    layer.classList.add('snapping');
    layer.style.transform = 'translateY(0px)';
    layer.style.opacity = '1';
    authOverlay.classList.add('hidden');
    this.currentPinInput = '';
    this.updatePinDots();
    document.getElementById('auth-error').textContent = '';
    document.getElementById('pass-input').value = '';
  },

  setupLockGesture() {
    const lockScreen = document.getElementById('lock-screen');
    const dragLayer = document.getElementById('lock-drag-layer');
    const authOverlay = document.getElementById('auth-overlay');

    let isDragging = false;
    let startY = 0;
    let currentDeltaY = 0;

    const onStart = (clientY) => {
      if (!authOverlay.classList.contains('hidden')) return;
      isDragging = true;
      startY = clientY;
      currentDeltaY = 0;
      dragLayer.classList.remove('snapping');
    };

    const onMove = (clientY) => {
      if (!isDragging) return;
      const delta = clientY - startY;
      if (delta < 0) {
        currentDeltaY = delta;
        const progress = Math.min(Math.abs(delta) / (lockScreen.offsetHeight * 0.45), 1);
        dragLayer.style.transform = `translateY(${delta}px)`;
        dragLayer.style.opacity = `${1 - progress * 0.75}`;
      }
    };

    const onEnd = () => {
      if (!isDragging) return;
      isDragging = false;
      dragLayer.classList.add('snapping');

      const threshold = lockScreen.offsetHeight * 0.28;

      if (Math.abs(currentDeltaY) >= threshold) {
        dragLayer.style.transform = `translateY(-100%)`;
        dragLayer.style.opacity = '0';
        this.playSound('unlock');

        setTimeout(() => {
          if (this.unlockMode === 'swipe') {
            this.switchScreen('home-screen');
          } else {
            this.showAuthPrompt();
          }
        }, 200);
      } else {
        dragLayer.style.transform = 'translateY(0px)';
        dragLayer.style.opacity = '1';
      }
    };

    lockScreen.addEventListener('mousedown', (e) => onStart(e.clientY));
    window.addEventListener('mousemove', (e) => onMove(e.clientY));
    window.addEventListener('mouseup', onEnd);

    lockScreen.addEventListener('touchstart', (e) => onStart(e.touches[0].clientY), { passive: true });
    window.addEventListener('touchmove', (e) => onMove(e.touches[0].clientY), { passive: true });
    window.addEventListener('touchend', onEnd);
  },

  playTone(freq, type, duration, delay = 0) {
    try {
      const ctx = this.getAudioContext();
      const startTime = ctx.currentTime + (delay / 1000);
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0.06, startTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + duration);
    } catch (e) {}
  },

  playSound(soundType) {
    if (soundType === 'boot') {
      this.playTone(440, 'sine', 0.15, 0);
      this.playTone(660, 'sine', 0.2, 80);
    } else if (soundType === 'unlock') {
      this.playTone(587.33, 'sine', 0.1, 0);
    } else if (soundType === 'notification') {
      this.playTone(600, 'sine', 0.08, 0);
    } else if (soundType === 'call') {
      this.playTone(520, 'sine', 0.2, 0);
      this.playTone(620, 'sine', 0.2, 120);
    }
  },

  showAuthPrompt() {
    const authOverlay = document.getElementById('auth-overlay');
    const title = document.getElementById('auth-title');
    const pinDots = document.getElementById('pin-dots');
    const pinPad = document.getElementById('pin-pad');
    const passPad = document.getElementById('pass-pad');

    authOverlay.classList.remove('hidden');

    if (this.unlockMode === 'pin') {
      title.textContent = 'PIN';
      pinDots.classList.remove('hidden');
      pinPad.classList.remove('hidden');
      passPad.classList.add('hidden');
    } else if (this.unlockMode === 'password') {
      title.textContent = 'Senha';
      pinDots.classList.add('hidden');
      pinPad.classList.add('hidden');
      passPad.classList.remove('hidden');
      setTimeout(() => document.getElementById('pass-input').focus(), 100);
    }
  },

  updatePinDots() {
    const dots = document.querySelectorAll('#pin-dots span');
    dots.forEach((dot, index) => {
      dot.classList.toggle('filled', index < this.currentPinInput.length);
    });
  },

  setupAuthEvents() {
    document.querySelectorAll('#pin-pad button[data-num]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (this.currentPinInput.length < 4) {
          this.currentPinInput += btn.dataset.num;
          this.updatePinDots();
          this.playSound('notification');

          if (this.currentPinInput.length === 4) {
            setTimeout(() => {
              if (this.currentPinInput === this.unlockSecret) {
                this.switchScreen('home-screen');
                this.playSound('unlock');
              } else {
                document.getElementById('auth-error').textContent = 'Incorreto';
                this.currentPinInput = '';
                this.updatePinDots();
              }
            }, 140);
          }
        }
      });
    });

    document.getElementById('pin-del').addEventListener('click', () => {
      this.currentPinInput = this.currentPinInput.slice(0, -1);
      this.updatePinDots();
      document.getElementById('auth-error').textContent = '';
    });

    document.getElementById('pin-cancel').addEventListener('click', () => this.resetLockScreen());
    document.getElementById('pass-cancel').addEventListener('click', () => this.resetLockScreen());

    const checkPassword = () => {
      const val = document.getElementById('pass-input').value;
      if (val === this.unlockSecret) {
        this.switchScreen('home-screen');
        this.playSound('unlock');
      } else {
        document.getElementById('auth-error').textContent = 'Incorreto';
        document.getElementById('pass-input').value = '';
      }
    };

    document.getElementById('pass-submit').addEventListener('click', checkPassword);
    document.getElementById('pass-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') checkPassword();
    });
  },

  showAureonPrompt(title, defaultValue, callback) {
    const modal = document.getElementById('aureon-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalInput = document.getElementById('modal-input');
    const btnOk = document.getElementById('modal-btn-ok');
    const btnCancel = document.getElementById('modal-btn-cancel');

    modalTitle.textContent = title;
    modalInput.value = defaultValue || '';
    modal.classList.add('active');
    setTimeout(() => modalInput.focus(), 100);

    const cleanAndClose = () => {
      modal.classList.remove('active');
      btnOk.replaceWith(btnOk.cloneNode(true));
      btnCancel.replaceWith(btnCancel.cloneNode(true));
    };

    document.getElementById('modal-btn-ok').addEventListener('click', () => {
      const val = modalInput.value;
      cleanAndClose();
      callback(val);
    });

    document.getElementById('modal-btn-cancel').addEventListener('click', () => {
      cleanAndClose();
      callback(null);
    });

    modalInput.onkeydown = (e) => {
      if (e.key === 'Enter') {
        const val = modalInput.value;
        cleanAndClose();
        callback(val);
      }
    };
  },

  setUnlockSecurity(mode) {
    if (mode === 'swipe') {
      this.unlockMode = 'swipe';
      localStorage.setItem('aureon_unlock_mode', 'swipe');
      this.openApp('settings');
      return;
    }

    if (mode === 'pin') {
      this.showAureonPrompt('PIN (4 digitos):', '1234', (newPin) => {
        if (newPin && /^\d{4}$/.test(newPin)) {
          this.unlockMode = 'pin';
          this.unlockSecret = newPin;
          localStorage.setItem('aureon_unlock_mode', 'pin');
          localStorage.setItem('aureon_unlock_secret', newPin);
        }
        this.openApp('settings');
      });
    }

    if (mode === 'password') {
      this.showAureonPrompt('Nova Senha:', 'aureon', (newPass) => {
        if (newPass && newPass.trim().length > 0) {
          this.unlockMode = 'password';
          this.unlockSecret = newPass.trim();
          localStorage.setItem('aureon_unlock_mode', 'password');
          localStorage.setItem('aureon_unlock_secret', newPass.trim());
        }
        this.openApp('settings');
      });
    }
  },

  startClock() {
    const update = () => {
      const now = new Date();
      const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      const dateStr = now.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
      const shortDate = now.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });

      document.getElementById('lock-time').textContent = timeStr;
      document.getElementById('status-time').textContent = timeStr;
      document.getElementById('lock-date').textContent = dateStr;
      document.getElementById('home-date-short').textContent = shortDate;

      const hr = now.getHours();
      const greet = hr < 12 ? 'Bom dia' : hr < 18 ? 'Boa tarde' : 'Boa noite';
      document.getElementById('home-greeting').textContent = greet;
    };
    update();
    setInterval(update, 1000);
  },

  async monitorBattery() {
    const batHome = document.getElementById('status-battery');
    const batLock = document.getElementById('lock-battery');
    if ('getBattery' in navigator) {
      try {
        const battery = await navigator.getBattery();
        const updateBat = () => {
          const level = Math.round(battery.level * 100);
          const text = `${level}%`;
          batHome.textContent = text;
          batLock.textContent = text;
        };
        updateBat();
        battery.addEventListener('levelchange', updateBat);
        battery.addEventListener('chargingchange', updateBat);
      } catch (e) {}
    }
  },

  monitorNetwork() {
    const netEl = document.getElementById('status-net');
    const updateNet = () => {
      netEl.textContent = navigator.onLine ? 'ON' : 'OFF';
    };
    updateNet();
    window.addEventListener('online', updateNet);
    window.addEventListener('offline', updateNet);
  },

  applyTheme(theme) {
    this.theme = theme;
    localStorage.setItem('aureon_theme', theme);
    document.body.classList.toggle('light-theme', theme === 'light');
    this.applyWallpaper(this.wallpaper);
  },

  toggleTheme() {
    this.applyTheme(this.theme === 'dark' ? 'light' : 'dark');
    this.playSound('notification');
  },

  openApp(appId) {
    const win = document.getElementById('app-window');
    const title = document.getElementById('app-title');
    const content = document.getElementById('app-content');

    const apps = {
      settings: {
        name: 'Ajustes',
        html: `
          <div class="settings-group">
            <h4>Proporcao</h4>
            <div class="settings-option ${this.deviceMode === 'phone' ? 'active' : ''}" onclick="AureonOS.setDeviceMode('phone'); AureonOS.openApp('settings');">
              <span>Celular (9:16)</span>
              <strong>${this.deviceMode === 'phone' ? 'Ativo' : ''}</strong>
            </div>
            <div class="settings-option ${this.deviceMode === 'tablet' ? 'active' : ''}" onclick="AureonOS.setDeviceMode('tablet'); AureonOS.openApp('settings');">
              <span>Tablet (16:24)</span>
              <strong>${this.deviceMode === 'tablet' ? 'Ativo' : ''}</strong>
            </div>
            <button onclick="AureonOS.toggleTheme()" style="padding:10px; border-radius:10px; border:none; background:var(--accent); color:#000; font-weight:bold;">Alternar Tema</button>
          </div>

          <div class="settings-group">
            <h4>Seguranca</h4>
            <div class="settings-option ${this.unlockMode === 'swipe' ? 'active' : ''}" onclick="AureonOS.setUnlockSecurity('swipe')">
              <span>Deslizar</span>
              <strong>${this.unlockMode === 'swipe' ? 'Ativo' : ''}</strong>
            </div>
            <div class="settings-option ${this.unlockMode === 'pin' ? 'active' : ''}" onclick="AureonOS.setUnlockSecurity('pin')">
              <span>PIN (4 digitos)</span>
              <strong>${this.unlockMode === 'pin' ? 'Ativo' : ''}</strong>
            </div>
            <div class="settings-option ${this.unlockMode === 'password' ? 'active' : ''}" onclick="AureonOS.setUnlockSecurity('password')">
              <span>Senha</span>
              <strong>${this.unlockMode === 'password' ? 'Ativo' : ''}</strong>
            </div>
          </div>
        `
      },
      wallpapers: {
        name: 'Papel de Parede',
        html: `
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
            <div onclick="AureonOS.applyWallpaper('default'); AureonOS.playSound('notification');" style="height:110px; border-radius:14px; background:${this.wallpapers.default}; border:1px solid var(--glass-border); display:flex; align-items:end; padding:10px; font-weight:600; font-size:0.8rem;">Padrao</div>
            <div onclick="AureonOS.applyWallpaper('aurora'); AureonOS.playSound('notification');" style="height:110px; border-radius:14px; background:${this.wallpapers.aurora}; border:1px solid var(--glass-border); display:flex; align-items:end; padding:10px; font-weight:600; font-size:0.8rem;">Aurora</div>
            <div onclick="AureonOS.applyWallpaper('sunset'); AureonOS.playSound('notification');" style="height:110px; border-radius:14px; background:${this.wallpapers.sunset}; border:1px solid var(--glass-border); display:flex; align-items:end; padding:10px; font-weight:600; font-size:0.8rem;">Sunset</div>
            <div onclick="AureonOS.applyWallpaper('cyber'); AureonOS.playSound('notification');" style="height:110px; border-radius:14px; background:${this.wallpapers.cyber}; border:1px solid var(--glass-border); display:flex; align-items:end; padding:10px; font-weight:600; font-size:0.8rem;">Cyber</div>
          </div>
        `
      },
      terminal: {
        name: 'Terminal',
        html: `
          <div style="display:flex; flex-direction:column; height:100%; background:#050811; color:#38bdf8; font-family:monospace; padding:12px; border-radius:12px; font-size:0.85rem;">
            <div id="term-output" style="flex:1; overflow-y:auto; display:flex; flex-direction:column; gap:4px; margin-bottom:8px;">
              <div>Aureon-OS Kernel 1.2 Alpha</div>
              <div style="color:#94a3b8;">Digite help para comandos.</div>
            </div>
            <div style="display:flex; gap:6px; align-items:center;">
              <span>$</span>
              <input id="term-input" type="text" style="flex:1; background:transparent; border:none; color:#fff; font-family:monospace; outline:none;" />
            </div>
          </div>
        `,
        init: () => {
          const input = document.getElementById('term-input');
          const out = document.getElementById('term-output');
          setTimeout(() => input.focus(), 100);

          input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
              const cmd = input.value.trim().toLowerCase();
              input.value = '';
              out.innerHTML += `<div>$ ${cmd}</div>`;

              if (cmd === 'help') {
                out.innerHTML += `<div style="color:#94a3b8;">Comandos: status, tablet, phone, theme, clear</div>`;
              } else if (cmd === 'status') {
                out.innerHTML += `<div>OS: Aureon-OS ${AureonOS.version}</div>`;
              } else if (cmd === 'tablet') {
                AureonOS.setDeviceMode('tablet');
                out.innerHTML += `<div>Modo Tablet ativado.</div>`;
              } else if (cmd === 'phone') {
                AureonOS.setDeviceMode('phone');
                out.innerHTML += `<div>Modo Celular ativado.</div>`;
              } else if (cmd === 'theme') {
                AureonOS.toggleTheme();
                out.innerHTML += `<div>Tema alternado.</div>`;
              } else if (cmd === 'clear') {
                out.innerHTML = '';
              } else if (cmd !== '') {
                out.innerHTML += `<div style="color:#ef4444;">Erro: ${cmd}</div>`;
              }
              out.scrollTop = out.scrollHeight;
            }
          });
        }
      },
      notes: {
        name: 'Notas',
        html: `
          <div style="display:flex; flex-direction:column; height:100%; gap:10px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span id="notes-count" style="font-size:0.75rem; color:var(--text-muted);">0 caracteres</span>
              <button id="notes-clear" style="background:rgba(239,68,68,0.2); border:none; color:#ef4444; padding:4px 10px; border-radius:6px; font-size:0.75rem;">Limpar</button>
            </div>
            <textarea id="notes-area" placeholder="Digite suas notas..." style="flex:1; width:100%; background:var(--glass); border:1px solid var(--glass-border); color:var(--text-main); padding:12px; border-radius:10px; resize:none; outline:none;"></textarea>
          </div>
        `,
        init: () => {
          const textarea = document.getElementById('notes-area');
          const count = document.getElementById('notes-count');
          textarea.value = localStorage.getItem('aureon_notes') || '';
          count.textContent = `${textarea.value.length} caracteres`;

          textarea.addEventListener('input', () => {
            localStorage.setItem('aureon_notes', textarea.value);
            count.textContent = `${textarea.value.length} caracteres`;
          });

          document.getElementById('notes-clear').addEventListener('click', () => {
            textarea.value = '';
            localStorage.setItem('aureon_notes', '');
            count.textContent = '0 caracteres';
            AureonOS.playSound('notification');
          });
        }
      },
      calculator: {
        name: 'Calculadora',
        html: `
          <div style="display:flex; flex-direction:column; height:100%; gap:10px;">
            <div style="background:var(--glass); border:1px solid var(--glass-border); padding:14px; border-radius:12px; text-align:right;">
              <div id="calc-history" style="font-size:0.8rem; color:var(--text-muted); min-height:16px;"></div>
              <div id="calc-display" style="font-size:1.8rem; font-weight:bold;">0</div>
            </div>
            <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:6px; flex:1;">
              <button onclick="AureonOS.calcClear()" style="background:rgba(239,68,68,0.2); border:none; border-radius:8px; color:#ef4444; font-weight:bold;">C</button>
              <button onclick="AureonOS.calcAppend('/')" style="background:var(--glass); border:none; border-radius:8px; color:var(--accent);">/</button>
              <button onclick="AureonOS.calcAppend('*')" style="background:var(--glass); border:none; border-radius:8px; color:var(--accent);">*</button>
              <button onclick="AureonOS.calcAppend('-')" style="background:var(--glass); border:none; border-radius:8px; color:var(--accent);">-</button>
              
              <button onclick="AureonOS.calcAppend('7')" style="background:var(--glass); border:none; border-radius:8px;">7</button>
              <button onclick="AureonOS.calcAppend('8')" style="background:var(--glass); border:none; border-radius:8px;">8</button>
              <button onclick="AureonOS.calcAppend('9')" style="background:var(--glass); border:none; border-radius:8px;">9</button>
              <button onclick="AureonOS.calcAppend('+')" style="background:var(--glass); border:none; border-radius:8px; color:var(--accent);">+</button>
              
              <button onclick="AureonOS.calcAppend('4')" style="background:var(--glass); border:none; border-radius:8px;">4</button>
              <button onclick="AureonOS.calcAppend('5')" style="background:var(--glass); border:none; border-radius:8px;">5</button>
              <button onclick="AureonOS.calcAppend('6')" style="background:var(--glass); border:none; border-radius:8px;">6</button>
              <button onclick="AureonOS.calcResult()" style="background:var(--accent); border:none; border-radius:8px; color:#000; font-weight:bold; grid-row:span 2;">=</button>
              
              <button onclick="AureonOS.calcAppend('1')" style="background:var(--glass); border:none; border-radius:8px;">1</button>
              <button onclick="AureonOS.calcAppend('2')" style="background:var(--glass); border:none; border-radius:8px;">2</button>
              <button onclick="AureonOS.calcAppend('3')" style="background:var(--glass); border:none; border-radius:8px;">3</button>
              
              <button onclick="AureonOS.calcAppend('0')" style="background:var(--glass); border:none; border-radius:8px; grid-column:span 2;">0</button>
              <button onclick="AureonOS.calcAppend('.')" style="background:var(--glass); border:none; border-radius:8px;">.</button>
            </div>
          </div>
        `
      },
      about: {
        name: 'Sobre',
        html: `
          <div style="display:flex; flex-direction:column; gap:10px;">
            <h3>Aureon-OS</h3>
            <p style="color:var(--text-muted);">Versao: ${this.version}</p>
            <p>Sistema modular limpo, sem emojis e com cursores personalizados.</p>
          </div>
        `
      }
    };

    const selected = apps[appId];
    if (!selected) return;

    title.textContent = selected.name;
    content.innerHTML = selected.html;
    win.classList.remove('hidden');
    this.playSound('notification');

    if (selected.init) selected.init();
  },

  closeApp() {
    document.getElementById('app-window').classList.add('hidden');
  },

  calcExpression: '',
  calcAppend(val) {
    this.playSound('notification');
    const disp = document.getElementById('calc-display');
    if (!disp) return;
    if (this.calcExpression === 'Erro') this.calcExpression = '';
    this.calcExpression += val;
    disp.textContent = this.calcExpression;
  },
  calcClear() {
    this.playSound('notification');
    const disp = document.getElementById('calc-display');
    const hist = document.getElementById('calc-history');
    if (!disp) return;
    this.calcExpression = '';
    disp.textContent = '0';
    if (hist) hist.textContent = '';
  },
  calcResult() {
    this.playSound('unlock');
    const disp = document.getElementById('calc-display');
    const hist = document.getElementById('calc-history');
    if (!disp) return;
    try {
      const res = eval(this.calcExpression);
      if (hist) hist.textContent = this.calcExpression + ' =';
      disp.textContent = res;
      this.calcExpression = String(res);
    } catch (e) {
      disp.textContent = 'Erro';
      this.calcExpression = '';
    }
  },

  bindEvents() {
    document.getElementById('btn-lock').addEventListener('click', () => {
      this.closeApp();
      this.switchScreen('lock-screen');
      this.playSound('notification');
    });

    document.getElementById('btn-home').addEventListener('click', () => {
      this.closeApp();
      document.getElementById('control-center').classList.add('hidden');
    });

    document.getElementById('close-app-btn').addEventListener('click', () => {
      this.closeApp();
      this.playSound('notification');
    });

    const cc = document.getElementById('control-center');
    document.getElementById('status-bar-trigger').addEventListener('click', () => {
      cc.classList.remove('hidden');
      this.playSound('notification');
    });
    document.getElementById('btn-cc-dock').addEventListener('click', () => {
      cc.classList.toggle('hidden');
      this.playSound('notification');
    });
    document.getElementById('cc-close').addEventListener('click', () => {
      cc.classList.add('hidden');
    });

    document.getElementById('brightness-slider').addEventListener('input', (e) => {
      const val = e.target.value;
      const overlay = document.getElementById('brightness-overlay');
      overlay.style.opacity = (100 - val) / 130;
    });

    document.querySelectorAll('.app-icon').forEach(btn => {
      btn.addEventListener('click', () => {
        this.openApp(btn.dataset.app);
      });
    });
  }
};

window.addEventListener('DOMContentLoaded', () => AureonOS.init());