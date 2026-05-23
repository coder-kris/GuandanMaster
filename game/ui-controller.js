/**
 * 掼蛋高手练功房 - 界面控制器
 * 卡牌渲染、事件绑定、游戏流程控制
 */

class GameUI {
  constructor() {
    this.game = new GuandanGame();
    this.round = 1;
    this.isProcessing = false;
    this.selectedCards = [];
    this.aiTimeout = null;
    this.arrangedCombo = null; // { cards, combo, side: 'left'|'right' }
    this.focusPos = null; // { gi: groupIdx, ci: cardIdx }
    this.audioCtx = null;
    this.init();
  }

  getAudioContext() {
    if (!this.audioCtx) {
      this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return this.audioCtx;
  }

  playCardSound(comboType) {
    try {
      const ctx = this.getAudioContext();
      const isBomb = ['bomb', 'straightFlush', 'jokerBomb'].includes(comboType);
      const isPass = comboType === 'pass';
      
      if (isPass) {
        // 过牌：轻轻一叮
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.frequency.setValueAtTime(600, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.08);
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
        osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.1);
        return;
      }

      if (isBomb) {
        // 炸弹：低频重击 + 高频破碎
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();
        osc1.type = 'sawtooth'; osc2.type = 'square';
        osc1.connect(gain); osc2.connect(gain); gain.connect(ctx.destination);
        osc1.frequency.setValueAtTime(80, ctx.currentTime);
        osc1.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.3);
        osc2.frequency.setValueAtTime(120, ctx.currentTime);
        osc2.frequency.exponentialRampToValueAtTime(60, ctx.currentTime + 0.2);
        gain.gain.setValueAtTime(0.25, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
        osc1.start(ctx.currentTime); osc1.stop(ctx.currentTime + 0.35);
        osc2.start(ctx.currentTime); osc2.stop(ctx.currentTime + 0.35);
        // 加白噪声尾巴
        const bufferSize = ctx.sampleRate * 0.3;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 2);
        }
        const noise = ctx.createBufferSource();
        const noiseGain = ctx.createGain();
        noise.buffer = buffer;
        noise.connect(noiseGain); noiseGain.connect(ctx.destination);
        noiseGain.gain.setValueAtTime(0.12, ctx.currentTime);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
        noise.start(ctx.currentTime);
        return;
      }

      // 普通出牌：嗖 — 快速滑音
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(200, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.12);
      osc.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.25);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.3);
    } catch(e) {
      // 音频不可用时不报错
    }
  }

  init() {
    // DOM 引用
    this.handArea = document.getElementById('hand-area');
    this.turnIndicator = document.getElementById('turn-indicator');
    this.gameStatus = document.getElementById('game-status');
    this.levelDisplay = document.getElementById('level-display');
    this.team0Score = document.getElementById('team0-score');
    this.team1Score = document.getElementById('team1-score');
    this.roundDisplay = document.getElementById('round-display');
    this.logContent = document.getElementById('play-log-content');

    // 对手牌区
    this.player1Cards = document.getElementById('player1-cards');
    this.player2Cards = document.getElementById('player2-cards');
    this.player3Cards = document.getElementById('player3-cards');
    this.player1Count = document.getElementById('player1-count');
    this.player2Count = document.getElementById('player2-count');
    this.player3Count = document.getElementById('player3-count');

    // 各玩家出牌区（嵌入玩家容器）
    this.trickAreas = [
      document.getElementById('trick-player-0'),
      document.getElementById('trick-player-1'),
      document.getElementById('trick-player-2'),
      document.getElementById('trick-player-3')
    ];
    this.trickRows = this.trickAreas; // trick-row 就是容器本身

    // 按钮
    this.btnPlay = document.getElementById('btn-play');
    this.btnPass = document.getElementById('btn-pass');
    this.btnAdvisor = document.getElementById('btn-advisor');
    this.btnSort = document.getElementById('btn-sort');
    this.btnResetSort = document.getElementById('btn-reset-sort');
    this.btnNewGame = document.getElementById('btn-new-game');

    // Advisor 弹窗
    this.advisorOverlay = document.getElementById('advisor-overlay');
    this.advisorContent = document.getElementById('advisor-content');
    this.advisorClose = document.getElementById('advisor-close');

    // 游戏结束弹窗
    this.gameoverOverlay = document.getElementById('gameover-overlay');
    this.gameoverTitle = document.getElementById('gameover-title');
    this.gameoverWinner = document.getElementById('gameover-winner');
    this.gameoverDetail = document.getElementById('gameover-detail');
    this.btnRestart = document.getElementById('btn-restart');

    // 快捷键帮助
    this.shortcutsOverlay = document.getElementById('shortcuts-overlay');
    document.getElementById('shortcuts-close').addEventListener('click', () => {
      this.shortcutsOverlay.classList.remove('show');
    });
    this.shortcutsOverlay.addEventListener('click', (e) => {
      if (e.target === this.shortcutsOverlay) this.shortcutsOverlay.classList.remove('show');
    });

    // 事件绑定
    this.btnPlay.addEventListener('click', () => this.onPlayCards());
    this.btnPass.addEventListener('click', () => this.onPass());
    this.btnAdvisor.addEventListener('click', () => this.showAdvisor());
    this.btnSort.addEventListener('click', () => this.onSortCards());
    this.btnResetSort.addEventListener('click', () => this.onResetSort());
    this.btnNewGame.addEventListener('click', () => this.startNewGame());
    this.advisorClose.addEventListener('click', () => this.hideAdvisor());
    this.advisorOverlay.addEventListener('click', (e) => {
      if (e.target === this.advisorOverlay) this.hideAdvisor();
    });
    this.btnRestart.addEventListener('click', () => {
      this.gameoverOverlay.classList.remove('show');
      this.startNewGame();
    });

    // 键盘操作
    document.addEventListener('keydown', (e) => this.onKeyDown(e));

    // 开始第一局
    this.startNewGame();
  }

  startNewGame() {
    // 清空状态
    this.selectedCards = [];
    this.arrangedCombo = null;
    this._lastTrickLen = 0;
    if (this.autoPassTimeout) { clearTimeout(this.autoPassTimeout); this.autoPassTimeout = null; }
    this.hideAdvisor();
    this.gameoverOverlay.classList.remove('show');
    if (this.aiTimeout) {
      clearTimeout(this.aiTimeout);
      this.aiTimeout = null;
    }
    this.isProcessing = false;

    // 重新开始
    this.game.startGame();
    this.roundDisplay.textContent = this.round;
    this.updateUI();

    // 开始游戏循环
    this.gameLoop();
  }

  updatePlayLog() {
    const hist = this.game.playHistory;
    // 只保留最近 20 条
    const recent = hist.slice(-20);
    this.logContent.innerHTML = recent.map(h => {
      let text, cls;
      if (h.combo) {
        const typeName = this.getComboTypeName(h.combo.type);
        const rankName = RANK_NAMES[h.combo.mainRank] || '';
        const cnt = h.cardNames ? h.cardNames.length : (h.combo.length || 1);
        text = `${h.playerName} → ${typeName}[${rankName}] (${cnt}张)`;
      } else if (h.action === '过') {
        text = `${h.playerName} → 过`;
        cls = 'pass';
      } else {
        text = `${h.playerName} → ${h.action || ''}`;
      }
      if (!cls) {
        if (h.playerId === 0) cls = 'me';
        else if (h.playerId === 2) cls = 'partner';
        else cls = 'opponent';
      }
      return `<div class="log-line ${cls}">${text}</div>`;
    }).join('');
    this.logContent.parentElement.scrollTop = this.logContent.parentElement.scrollHeight;
  }

  gameLoop() {
    if (this.game.gameOver) {
      this.showGameOver();
      return;
    }

    this.updateUI();

    const currentPlayer = this.game.currentPlayer;
    // 防止已出完的玩家被轮到
    if (this.game.players[currentPlayer].isFinished) {
      this.game.advanceToNextPlayer();
      if (this.game.gameOver) {
        this.updateUI();
        this.showGameOver();
        return;
      }
    }

    const isHuman = this.game.players[this.game.currentPlayer].isHuman;

    if (isHuman) {
      this.enableControls(true);
    } else {
      this.enableControls(false);
      this.scheduleAIMove();
    }
  }

  scheduleAIMove() {
    if (this.aiTimeout) clearTimeout(this.aiTimeout);
    // 停顿3秒，让人眼看到每家出牌过程
    this.aiTimeout = setTimeout(() => this.doAIMove(), 2800 + Math.random() * 400);
  }

  async doAIMove() {
    if (this.game.gameOver || this.isProcessing) return;
    const playerId = this.game.currentPlayer;
    if (this.game.players[playerId].isHuman) {
      this.gameLoop();
      return;
    }

    // 防止同一个人连续出同样的牌（死循环检测）
    const prevKey = this._lastAIMoveKey;
    const curKey = playerId + '_' + this.game.hands[playerId].length;
    if (prevKey === curKey) {
      // 卡住了，强行过牌
      this.game.pass(playerId);
      this.gameLoop();
      return;
    }

    this.isProcessing = true;

    const state = this.game.getStateSummary();
    const difficulty = this.game.players[playerId].difficulty;
    const choice = aiChoosePlay(playerId, state, difficulty);

    let result;
    try {
      if (choice) {
        result = this.game.playCards(playerId, choice.cards);
        if (result && result.success) {
          this._lastAIMoveKey = curKey;
          this.playCardSound(choice.combo.type);
          this.showToast(`${this.game.players[playerId].name} 出了 ${this.describePlay(choice.cards, choice.combo)}`, 'info');
        } else {
          // 出牌失败→过牌
          result = this.game.pass(playerId);
        }
      } else {
        result = this.game.pass(playerId);
        this.playCardSound('pass');
        this.showToast(`${this.game.players[playerId].name} 过牌`, 'info');
      }
    } catch(e) {
      console.error('AI move error:', e);
      this.game.pass(playerId);
    }

    this.isProcessing = false;

    if (this.game.gameOver) {
      this.updateUI();
      this.showGameOver();
      return;
    }

    this.gameLoop();
  }

  // ====== 用户操作 ======

  onPlayCards() {
    if (this.isProcessing) return;
    if (this.selectedCards.length === 0) {
      this.showToast('请先选择要出的牌', 'error');
      return;
    }

    // 检测选择的牌是否构成有效牌型
    const combo = detectCombo(this.selectedCards, this.game.levelRankValue);
    if (!combo) {
      this.showToast('选择的牌不构成有效牌型', 'error');
      return;
    }

    // 检查是否能压过上家
    if (this.game.lastCombo && !canBeat(combo, this.game.lastCombo.combo)) {
      this.showToast('出牌不能压过上家，请重新选择', 'error');
      return;
    }

    this.isProcessing = true;
    const result = this.game.playCards(0, this.selectedCards);
    this.selectedCards = [];
    this.isProcessing = false;

    if (!result.success) {
      this.showToast(result.error, 'error');
      return;
    }

    this.playCardSound(result.combo.type);
    this.showToast(`你出了 ${this.describePlay(result.combo.cards, result.combo)}`, 'success');

    if (this.game.gameOver) {
      this.updateUI();
      this.showGameOver();
      return;
    }

    this.gameLoop();
  }

  onPass() {
    if (this.isProcessing) return;
    if (this.autoPassTimeout) { clearTimeout(this.autoPassTimeout); this.autoPassTimeout = null; }
    if (!this.game.lastCombo) {
      this.showToast('你是先手，必须出牌', 'error');
      return;
    }

    this.isProcessing = true;
    const result = this.game.pass(0);
    this.selectedCards = [];
    this.isProcessing = false;

    if (!result.success) {
      this.showToast(result.error, 'error');
      return;
    }

    this.playCardSound('pass');

    this.showToast('你选择过牌', 'info');

    if (result.trickWon) {
      this.updateUI();
    }

    this.gameLoop();
  }

  // ====== 理牌 ======

  onSortCards() {
    if (this.selectedCards.length === 0) {
      this.showToast('请先选择要理的牌', 'error');
      return;
    }

    const combo = detectCombo(this.selectedCards, this.game.levelRankValue);
    if (!combo) {
      this.showToast('选择的牌不构成有效牌型', 'error');
      return;
    }

    // 同花顺放左边，其他放右边
    const side = (combo.type === 'straightFlush') ? 'left' : 'right';
    this.arrangedCombo = { cards: this.selectedCards, combo, side };
    this.selectedCards = [];
    this.renderHand();
    this.btnSort.disabled = true;
    this.btnResetSort.style.display = 'inline-block';
    this.showToast(`已理牌：${this.getComboTypeName(combo.type)} 放到${side === 'left' ? '最左' : '最右'}侧`, 'success');
  }

  onResetSort() {
    this.arrangedCombo = null;
    this.selectedCards = [];
    this.renderHand();
    this.btnSort.disabled = false;
    this.btnResetSort.style.display = 'none';
    this.showToast('已恢复默认排序', 'info');
  }

  // ====== Advisor 显示 ======

  showAdvisor() {
    const state = this.game.getStateSummary();
    const hand = state.hands[0];
    const validPlays = getAllValidPlays(hand, state.lastCombo ? state.lastCombo.combo : null, state.levelRankValue);
    
    const suggestions = Advisor.getAdvice(0, state, validPlays);

    if (suggestions.length === 0) return;

    // 渲染建议
    this.advisorContent.innerHTML = suggestions.map((s, i) => `
      <div class="advisor-suggestion ${s.isBest ? 'best' : ''}" data-index="${i}">
        <div class="suggestion-header">
          <div class="suggestion-label">
            ${s.label}
            ${s.isBest ? '<span class="badge">推荐</span>' : ''}
          </div>
          <div class="suggestion-rating">${'★'.repeat(s.rating)}${'☆'.repeat(5 - s.rating)}</div>
        </div>
        ${s.combo ? `
          <div class="suggestion-type">牌型：${this.getComboTypeName(s.combo.type)} · 点数：${RANK_NAMES[s.combo.mainRank] || s.combo.mainRank} · 共${s.cards.length}张</div>
          <div class="suggestion-cards-preview">
            ${s.cards.map(c => this.createCardHTML(c, true)).join('')}
          </div>
        ` : ''}
        <ul class="suggestion-reasons">
          ${s.reasons.map(r => `<li>${r}</li>`).join('')}
        </ul>
      </div>
    `).join('');

    // 点击建议自动选牌
    this.advisorContent.querySelectorAll('.advisor-suggestion').forEach(el => {
      el.addEventListener('click', () => {
        const idx = parseInt(el.dataset.index);
        const sug = suggestions[idx];
        this.selectCardsForPlay(sug.cards);
        this.hideAdvisor();
      });
    });

    this.advisorOverlay.classList.add('show');
  }

  hideAdvisor() {
    this.advisorOverlay.classList.remove('show');
  }

  selectCardsForPlay(cards) {
    this.selectedCards = cards;
    this.renderHand();
    this.showToast(`已自动选择 ${cards.length} 张牌，点击"出牌"执行`, 'success');
  }

  // ====== 界面渲染 ======

  updateUI() {
    // 更新级牌和得分
    this.levelDisplay.textContent = RANK_NAMES[this.game.levelRankValue] || this.game.level;
    this.team0Score.textContent = this.game.teamScores[0];
    this.team1Score.textContent = this.game.teamScores[1];

    // 更新对手牌张数（仅≤10张时显示）
    for (let i = 1; i <= 3; i++) {
      const countEl = this['player' + i + 'Count'];
      const cnt = this.game.players[i].cardCount;
      countEl.textContent = cnt + '张';
      countEl.classList.toggle('hidden', cnt > 10);
    }

    // 更新对手牌的背面显示
    this.renderOpponentCards(1, this.player1Cards);
    this.renderOpponentCards(2, this.player2Cards);
    this.renderOpponentCards(3, this.player3Cards);

    // 渲染手牌（竖排堆叠）
    this.renderHand();

    // 渲染各玩家出牌（本轮）
    this.renderPlayerTricks();

    // 更新指示器
    const current = this.game.currentPlayer;

    // 高亮当前玩家
    for (let i = 0; i < 4; i++) {
      const el = document.getElementById('player-' + i);
      if (el) el.classList.toggle('active-turn', i === current && !this.game.gameOver);
    }
    if (this.game.gameOver) {
      this.turnIndicator.textContent = '🎯 游戏结束';
    } else if (this.game.players[current].isHuman) {
      this.turnIndicator.textContent = '👤 轮到你了';
      this.turnIndicator.style.color = '#ffd700';
    } else {
      this.turnIndicator.textContent = `🤖 ${this.game.players[current].name} 思考中...`;
      this.turnIndicator.style.color = '#4fc3f7';
    }

    this.gameStatus.textContent = `第 ${this.round} 局 · 级牌 ${RANK_NAMES[this.game.levelRankValue]}`;

    // 更新出牌记录
    this.updatePlayLog();
  }

  // ====== 键盘操作 ======

  onKeyDown(e) {
    if (this.game.gameOver || this.game.players[0].isFinished) {
      // 游戏结束后也能翻牌和开帮助
      if (e.key === '/') { e.preventDefault(); this.shortcutsOverlay.classList.toggle('show'); }
      if (e.key === 'q' || e.key === 'Q') { e.preventDefault(); this.toggleRevealCards(); }
      return;
    }

    const key = e.key;
    const isMyTurn = this.game.currentPlayer === 0;

    // 快捷键帮助（随时可用）
    if (key === '/') {
      e.preventDefault();
      this.shortcutsOverlay.classList.toggle('show');
      return;
    }

    // 调试和复盘（随时可用）
    if (key === 'd' || key === 'D') { this.debugDump(); return; }
    if (key === 'l' || key === 'L') { this.loadSavedGame(); return; }

    // Q → 翻看其他玩家未出的牌
    if (key === 'q' || key === 'Q') {
      e.preventDefault();
      this.toggleRevealCards();
      return;
    }

    // 选牌操作（任何时候都可选，方便提前准备）
    // 空格 → 切换选定焦点牌
    if (key === ' ') {
      e.preventDefault();
      const card = this.getFocusedCard();
      if (card) {
        const idx = this.selectedCards.findIndex(c => c.id === card.id);
        if (idx >= 0) this.selectedCards.splice(idx, 1);
        else this.selectedCards.push(card);
        this.renderHand();
      }
      return;
    }

    // ← → 首次按定位最右下/左下，之后左移/右移
    if (key === 'ArrowLeft' || key === 'ArrowRight') {
      e.preventDefault();
      if (!this.focusPos) {
        this.focusPos = key === 'ArrowLeft' ? this.findBottomRight() : this.findBottomLeft();
      } else {
        this.focusPos = this.moveFocus(key === 'ArrowLeft' ? -1 : 1, 0);
      }
      this.renderHand();
      return;
    }

    // ↑ ↓ 同组上下移动
    if (key === 'ArrowUp' || key === 'ArrowDown') {
      e.preventDefault();
      if (!this.focusPos) this.focusPos = this.findBottomRight();
      else this.focusPos = this.moveFocus(0, key === 'ArrowUp' ? -1 : 1);
      this.renderHand();
      return;
    }

    // 以下操作仅用户回合可用
    if (!isMyTurn) return;

    // 回车 → 出牌

    // P → 过牌
    if (key === 'p' || key === 'P') {
      if (!this.btnPass.disabled) this.onPass();
      return;
    }

    // H → 切换 Advisor
    if (key === 'h' || key === 'H') {
      if (this.advisorOverlay.classList.contains('show')) {
        this.hideAdvisor();
      } else if (!this.btnAdvisor.disabled) {
        this.showAdvisor();
      }
      return;
    }

    // S → 切换 理牌/恢复
    if (key === 's' || key === 'S') {
      if (this.arrangedCombo) {
        this.onResetSort();
      } else if (!this.btnSort.disabled) {
        this.onSortCards();
      }
      return;
    }

    // / → 快捷键帮助
    if (key === '/') {
      e.preventDefault();
      this.shortcutsOverlay.classList.toggle('show');
      return;
    }

    // 以下操作仅用户回合可用
    if (!isMyTurn) return;

    // 回车 → 出牌
    if (key === 'Enter') {
      e.preventDefault();
      this.onPlayCards();
      return;
    }

    // P → 过牌
    if (key === 'p' || key === 'P') {
      if (!this.btnPass.disabled) this.onPass();
      return;
    }

    // H → 切换 Advisor
    if (key === 'h' || key === 'H') {
      if (this.advisorOverlay.classList.contains('show')) {
        this.hideAdvisor();
      } else if (!this.btnAdvisor.disabled) {
        this.showAdvisor();
      }
      return;
    }

    // S → 切换 理牌/恢复
    if (key === 's' || key === 'S') {
      if (this.arrangedCombo) {
        this.onResetSort();
      } else if (!this.btnSort.disabled) {
        this.onSortCards();
      }
      return;
    }
  }

  debugDump() {
    const state = this.game.getStateSummary();
    localStorage.setItem('guandan_debug', JSON.stringify(state));
    const lines = [];
    lines.push('=== 手牌 ===');
    lines.push('你: ' + state.hands[0].map(c => c.rankName + c.suit).join(' '));
    lines.push('电脑A: ' + state.players[1].cardCount + '张');
    lines.push('队友: ' + state.players[2].cardCount + '张');
    lines.push('电脑B: ' + state.players[3].cardCount + '张');
    lines.push('');
    lines.push('=== 当前回合 ===');
    lines.push('当前玩家: ' + state.players[state.currentPlayer].name);
    lines.push('');
    lines.push('=== 本轮出牌 ===');
    for (const t of state.currentTrick) {
      lines.push(state.players[t.playerId].name + ': ' + t.cards.map(c => c.rankName + c.suit).join(','));
    }
    lines.push('');
    lines.push('=== 出牌历史 ===');
    for (const h of state.playHistory) {
      if (h.combo) {
        const tn = this.getComboTypeName(h.combo.type);
        lines.push(h.playerName + ' → ' + tn + ' [' + (RANK_NAMES[h.combo.mainRank]||'') + '] ' + (h.cardNames||[]).join(' '));
      } else if (h.action === '过') {
        lines.push(h.playerName + ' → 过');
      }
    }
    lines.push('');
    lines.push('=== 级牌 ===');
    lines.push('级牌: ' + RANK_NAMES[state.levelRankValue] + ' (逢人配: ' + state.hands[0].filter(c=>c.isWild).map(c=>c.rankName+c.suit).join(',') + ')');
    lines.push('得分: 你' + state.teamScores[0] + ' / 对方' + state.teamScores[1]);
    lines.push('');
    lines.push('=== Advisor 评分明细 ===');
    const hand = state.hands[0];
    const lastC = state.lastCombo ? state.lastCombo.combo : null;
    const validPlays = typeof getAllValidPlays !== 'undefined' ? getAllValidPlays(hand, lastC, state.levelRankValue) : [];
    if (validPlays.length > 0) {
      const analysis = typeof Advisor !== 'undefined' ? Advisor.analyzeHand(hand, state.levelRankValue) : null;
      const situation = typeof Advisor !== 'undefined' ? Advisor.analyzeSituation(state, 0, hand) : null;
      const scored = validPlays.map(p => ({
        score: typeof Advisor !== 'undefined' ? Advisor.scorePlay(p, analysis, situation, hand, state, validPlays) : 0,
        cards: p.cards.map(c => c.rankName + c.suit).join(','),
        type: p.combo.type,
        mainRank: p.combo.mainRank
      })).sort((a,b) => b.score - a.score);
      for (const s of scored.slice(0, 5)) {
        const tn = typeof this !== 'undefined' ? this.getComboTypeName(s.type) : s.type;
        lines.push(s.score.toFixed(1) + ' ' + tn + ' [' + (RANK_NAMES[s.mainRank]||'') + '] ' + s.cards);
      }
    }
    const text = lines.join('\n');
    navigator.clipboard.writeText(text).then(() => {
      this.showToast('已保存并复制调试信息', 'success');
    }).catch(() => {
      this.showToast('已保存到 localStorage，复制失败', 'error');
    });
  }

  toggleRevealCards() {
    let el = document.getElementById('reveal-overlay');
    if (el) {
      el.remove();
      return;
    }
    const lines = [];
    for (let i = 0; i < 4; i++) {
      if (i === 0 || !this.game.hands[i]) continue;
      const hand = this.game.hands[i];
      if (hand.length === 0) continue;
      const sorted = sortCards(hand);
      const cards = sorted.map(c => {
        const isJoker = c.suit === 'joker';
        const suitType = isJoker ? 'joker' : (c.suit === '♥' || c.suit === '♦' ? 'red' : 'black');
        const jokerClass = isJoker ? (c.rankName === '大王' ? 'big-joker' : 'small-joker') : '';
        const wildClass = c.isWild ? 'wild' : '';
        return `<div class="mini-card ${suitType} ${jokerClass} ${wildClass}" 
          style="position:relative;display:inline-block;width:36px;height:50px;font-size:10px;margin:1px">
          <div class="card-corner" style="top:2px;left:2px">
            <span class="card-rank" style="font-size:11px">${isJoker ? 'J' : c.rankName}</span>
            <span class="card-suit" style="font-size:9px">${isJoker ? '' : c.suit}</span>
          </div>
        </div>`;
      }).join('');
      const color = i === 2 ? '#4fc3f7' : '#ef5350';
      lines.push(`<div style="margin:4px 0"><span style="color:${color};font-weight:bold;font-size:13px">${this.game.players[i].name}</span> (${hand.length}张)</div>
        <div style="margin-bottom:8px">${cards}</div>`);
    }
    if (lines.length === 0) { this.showToast('没有其他玩家的牌可查看', 'info'); return; }

    el = document.createElement('div');
    el.id = 'reveal-overlay';
    el.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(15,23,42,0.93);border:1px solid #475569;border-radius:12px;padding:16px 20px;z-index:60;color:#e0e0e0;font-size:13px;min-width:280px;max-height:80vh;overflow-y:auto;';
    el.innerHTML = `<div style="text-align:center;margin-bottom:10px;font-size:15px;color:#ffd700;font-weight:bold">📖 底牌查看</div>
      ${lines.join('')}
      <div style="text-align:center;margin-top:10px;font-size:11px;color:#888">按 Q 关闭</div>`;
    el.addEventListener('click', () => el.remove());
    document.body.appendChild(el);
  }

  loadSavedGame() {
    const saved = localStorage.getItem('guandan_debug');
    if (!saved) {
      this.showToast('没有已保存的牌局，请先按 D 保存', 'error');
      return;
    }
    try {
      if (this.aiTimeout) { clearTimeout(this.aiTimeout); this.aiTimeout = null; }
      if (this.autoPassTimeout) { clearTimeout(this.autoPassTimeout); this.autoPassTimeout = null; }
      const state = JSON.parse(saved);
      this.game.loadState(state);
      this.selectedCards = [];
      this.arrangedCombo = null;
      this.focusPos = null;
      this._lastTrickLen = 0;
      this.hideAdvisor();
      this.isProcessing = false;
      this.updateUI();
      // 如果轮到AI，启动游戏循环
      this.gameLoop();
      this.showToast('已加载保存的牌局，按 H 查看 Advisor', 'success');
    } catch(e) {
      this.showToast('加载失败: ' + e.message, 'error');
    }
  }

  /**
   * 获取焦点指向的卡牌
   */
  getFocusedCard() {
    if (!this.focusPos) return null;
    const layout = this.getLayout();
    const group = layout[this.focusPos.gi];
    if (!group || !group.cards[this.focusPos.ci]) return null;
    return group.cards[this.focusPos.ci];
  }

  /**
   * 获取手牌布局（排除理牌组）
   */
  getLayout() {
    const hand = this.game.hands[0];
    if (!hand) return [];

    let cards = hand;
    if (this.arrangedCombo) {
      const ids = new Set(this.arrangedCombo.cards.map(c => c.id));
      cards = hand.filter(c => !ids.has(c.id));
    }
    const sorted = sortCardsDisplay(cards);

    const layout = [];
    const groups = {};
    for (const c of sorted) {
      const key = c.rankName;
      if (!groups[key]) groups[key] = [];
      groups[key].push(c);
    }
    const keys = Object.keys(groups).sort((a, b) => groups[b][0].rankValue - groups[a][0].rankValue);
    for (const key of keys) {
      layout.push({ rankKey: key, cards: groups[key] });
    }
    return layout;
  }

  /**
   * 定位到最右下（最右侧组的最后一张牌）
   */
  findBottomRight() {
    const layout = this.getLayout();
    if (layout.length === 0) return null;
    const lastGroup = layout[layout.length - 1];
    return { gi: layout.length - 1, ci: lastGroup.cards.length - 1 };
  }

  /**
   * 定位到最左下（最左侧组的第一张牌）
   */
  findBottomLeft() {
    const layout = this.getLayout();
    if (layout.length === 0) return null;
    const firstGroup = layout[0];
    return { gi: 0, ci: firstGroup.cards.length - 1 };
  }

  /**
   * 在布局中移动焦点
   * @param {number} dGi 组偏移（正=右移）
   * @param {number} dCi 组内偏移（正=下移）
   */
  moveFocus(dGi, dCi) {
    if (!this.focusPos) return this.findBottomRight();
    const layout = this.getLayout();
    if (layout.length === 0) return null;

    let { gi, ci } = this.focusPos;
    // 校正：手牌变化后索引可能失效
    gi = Math.min(gi, layout.length - 1);
    const group = layout[gi];
    if (!group) return this.findBottomRight();
    ci = Math.min(ci, group.cards.length - 1);

    // 组内移动
    if (dCi !== 0) {
      const newCi = ci + dCi;
      if (newCi >= 0 && newCi < group.cards.length) {
        return { gi, ci: newCi };
      }
      return { gi, ci }; // 不动
    }

    // 组间移动
    if (dGi !== 0) {
      const newGi = gi + dGi;
      if (newGi >= 0 && newGi < layout.length) {
        const newGroup = layout[newGi];
        const newCi = Math.min(ci, newGroup.cards.length - 1);
        return { gi: newGi, ci: newCi };
      }
      return { gi, ci }; // 到头了
    }

    return { gi, ci };
  }

  getFocusedCardId() {
    const card = this.getFocusedCard();
    return card ? card.id : null;
  }

  renderHand() {
    const hand = this.game.hands[0];
    if (!hand || hand.length === 0) {
      const finishIdx = this.game.finishOrder.indexOf(0);
      const medals = ['🏆', '🥈', '🥉'];
      const medalColors = ['#ffd700', '#c0c0c0', '#cd7f32'];
      const rankText = ['头游', '二游', '三游'];
      if (finishIdx >= 0 && finishIdx < 3) {
        this.handArea.innerHTML = `<div style="font-size:48px;text-align:center;padding:20px">${medals[finishIdx]}
          <div style="font-size:16px;color:${medalColors[finishIdx]};margin-top:6px;font-weight:bold">${rankText[finishIdx]}</div>
        </div>`;
      } else {
        this.handArea.innerHTML = '<div style="color:#aaa;padding:20px;">你已出完所有牌</div>';
      }
      return;
    }

    const selectedIds = new Set(this.selectedCards.map(c => c.id));

    // 如果处于理牌状态，分离理牌组合
    let comboCardIds = new Set();
    let leftComboHTML = '';
    let rightComboHTML = '';

    if (this.arrangedCombo) {
      for (const c of this.arrangedCombo.cards) comboCardIds.add(c.id);
      const comboGroup = this.arrangedCombo.cards;

      const n = comboGroup.length;
      const stackHeight = 96 + (n - 1) * 28;
      const cardsHTML = comboGroup.map((c, idx) => {
        const isJoker = c.suit === 'joker';
        const suitType = isJoker ? 'joker' : (c.suit === '♥' || c.suit === '♦' ? 'red' : 'black');
        const jokerClass = isJoker ? (c.rankName === '大王' ? 'big-joker' : 'small-joker') : '';
        const wildClass = c.isWild ? 'wild' : '';
        return `<div class="card ${suitType} ${jokerClass} ${wildClass} combo-card${isSelected ? ' selected' : ''}" data-card-id="${c.id}" style="top:${idx * 28}px;z-index:${idx + 1}">
          <div class="card-corner">
            <span class="card-rank ${isJoker ? 'joker-rank' : ''}">${isJoker ? 'JOKER' : c.rankName}</span><span class="card-suit">${isJoker ? '' : c.suit}</span>
          </div>
          <div class="card-center">${isJoker ? (c.rankName === '大王' ? '🎭' : '🃏') : c.suit}</div>
        </div>`;
      }).join('');

      const html = `<div class="card-stack" style="width:68px;height:${stackHeight}px">${cardsHTML}</div>`;

      if (this.arrangedCombo.side === 'left') {
        leftComboHTML = `<div class="combo-group">${html}</div>`;
      } else {
        rightComboHTML = `<div class="combo-group">${html}</div>`;
      }
    }

    // 剩余手牌按点数分组
    const remaining = hand.filter(c => !comboCardIds.has(c.id));
    const sorted = sortCardsDisplay(remaining);

    const groups = {};
    for (const c of sorted) {
      const key = c.rankName;
      if (!groups[key]) groups[key] = [];
      groups[key].push(c);
    }
    const groupKeys = Object.keys(groups).sort((a, b) => groups[b][0].rankValue - groups[a][0].rankValue);

    const CARD_HEIGHT = 96;
    const STACK_OVERLAP = 28;
    const GROUP_OVERLAP = Math.max(0, Math.min(30, (groupKeys.length - 6) * 3));

    let middleHTML = '';
    groupKeys.forEach((key, gi) => {
      const cards = groups[key];
      const n = cards.length;
      const stackHeight = CARD_HEIGHT + (n - 1) * STACK_OVERLAP;
      const ml = (gi > 0 && GROUP_OVERLAP > 0) ? `margin-left:-${GROUP_OVERLAP}px;` : '';
      middleHTML += `<div class="card-group" style="z-index:${gi * 3 + 10};${ml}">\n<div class="card-stack" style="width:68px;height:${stackHeight}px">\n`;

      cards.forEach((c, idx) => {
        const isSelected = selectedIds.has(c.id);
        const isFocused = this.focusPos && this.focusPos.gi === gi && this.focusPos.ci === idx;
        const isJoker = c.suit === 'joker';
        const suitType = isJoker ? 'joker' : (c.suit === '♥' || c.suit === '♦' ? 'red' : 'black');
        const jokerClass = isJoker ? (c.rankName === '大王' ? 'big-joker' : 'small-joker') : '';
        const wildClass = c.isWild ? 'wild' : '';
        const topOffset = idx * STACK_OVERLAP;

        middleHTML += `<div class="card ${suitType} ${jokerClass} ${wildClass}${isSelected ? ' selected' : ''}${isFocused ? ' focused' : ''}" 
          data-card-id="${c.id}"
          style="top:${topOffset}px;z-index:${idx + 1}">
          <div class="card-corner">
            <span class="card-rank ${isJoker ? 'joker-rank' : ''}">${isJoker ? 'JOKER' : c.rankName}</span><span class="card-suit">${isJoker ? '' : c.suit}</span>
          </div>
          <div class="card-center">
            ${isJoker ? (c.rankName === '大王' ? '🎭' : '🃏') : c.suit}
          </div>
        </div>\n`;
      });

      middleHTML += `</div>\n</div>\n`;
    });

    this.handArea.innerHTML = leftComboHTML + middleHTML + rightComboHTML;

    // 绑定点击事件（含理牌组合卡）
    this.handArea.querySelectorAll('.card-stack .card').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        this.onCardClick(el.dataset.cardId);
      });
    });

    // 校正焦点位置（手牌变化后可能失效）
    if (this.focusPos) {
      const layout = this.getLayout();
      if (layout.length === 0 || !layout[this.focusPos.gi] || !layout[this.focusPos.gi].cards[this.focusPos.ci]) {
        this.focusPos = this.findBottomRight();
      }
    }
  }

  onCardClick(cardId) {
    const hand = this.game.hands[0];
    const card = hand.find(c => c.id === cardId);
    if (!card) return;

    const idx = this.selectedCards.findIndex(c => c.id === cardId);
    if (idx >= 0) {
      this.selectedCards.splice(idx, 1);
    } else {
      this.selectedCards.push(card);
    }

    this.renderHand();
  }

  renderOpponentCards(playerId, container) {
    const count = this.game.players[playerId].cardCount;
    const isFinished = this.game.players[playerId].isFinished;

    if (isFinished || count === 0) {
      const finishIdx = this.game.finishOrder.indexOf(playerId);
      const medals = ['🏆', '🥈', '🥉'];
      const medalColors = ['#ffd700', '#c0c0c0', '#cd7f32'];
      const rankText = ['头游', '二游', '三游'];
      if (finishIdx >= 0 && finishIdx < 3) {
        container.innerHTML = `<div style="font-size:32px;text-align:center;padding:4px;line-height:1">${medals[finishIdx]}
          <div style="font-size:11px;color:${medalColors[finishIdx]};margin-top:2px">${rankText[finishIdx]}</div>
        </div>`;
      } else {
        container.innerHTML = '<div style="color:#4caf50;font-weight:bold;padding:6px;">✓</div>';
      }
      return;
    }

    // 只画一张示意
    container.innerHTML = '<div class="card-back"></div>';
  }

  renderPlayerTricks() {
    const trick = this.game.currentTrick || [];
    const prevLen = this._lastTrickLen || 0;
    this._lastTrickLen = trick.length;

    // 清理本轮没有出牌的玩家
    const activePlayers = new Set(trick.map(e => e.playerId));
    for (let i = 0; i < 4; i++) {
      if (!activePlayers.has(i)) {
        this.trickRows[i].classList.remove('visible', 'trick-vertical');
        this.trickRows[i].style.height = '';
        this.trickRows[i].innerHTML = '';
      }
    }

    if (trick.length === 0) return;

    const renderRow = (pid, row, cards) => {
      const isVertical = pid === 1 || pid === 3;
      const overlap = 28;
      const CARD_H = 96;
      if (isVertical) {
        row.classList.add('trick-vertical');
        row.style.height = (CARD_H + (cards.length - 1) * overlap) + 'px';
        row.innerHTML = cards.map((c, idx) => {
          const isJoker = c.suit === 'joker';
          const suitType = isJoker ? 'joker' : (c.suit === '♥' || c.suit === '♦' ? 'red' : 'black');
          const jokerClass = isJoker ? (c.rankName === '大王' ? 'big-joker' : 'small-joker') : '';
          const wildClass = c.isWild ? 'wild' : '';
          return `<div class="mini-card ${suitType} ${jokerClass} ${wildClass}" 
            style="position:absolute;top:${idx * overlap}px;left:0;z-index:${idx + 1}">
            <div class="card-corner">
              <span class="card-rank ${isJoker ? 'joker-rank' : ''}">${isJoker ? 'JOKER' : c.rankName}</span>
              <span class="card-suit">${isJoker ? '' : c.suit}</span>
            </div>
            <div class="center-icon">${isJoker ? (c.rankName === '大王' ? '🎭' : '🃏') : c.suit}</div>
          </div>`;
        }).join('');
      } else {
        row.innerHTML = cards.map((c, idx) => {
          const isJoker = c.suit === 'joker';
          const suitType = isJoker ? 'joker' : (c.suit === '♥' || c.suit === '♦' ? 'red' : 'black');
          const jokerClass = isJoker ? (c.rankName === '大王' ? 'big-joker' : 'small-joker') : '';
          const wildClass = c.isWild ? 'wild' : '';
          const ml = idx > 0 ? `margin-left:-${overlap}px` : '';
          return `<div class="mini-card ${suitType} ${jokerClass} ${wildClass}" style="${ml}">
            <div class="card-corner">
              <span class="card-rank ${isJoker ? 'joker-rank' : ''}">${isJoker ? 'JOKER' : c.rankName}</span>
              <span class="card-suit">${isJoker ? '' : c.suit}</span>
            </div>
            <div class="center-icon">${isJoker ? (c.rankName === '大王' ? '🎭' : '🃏') : c.suit}</div>
          </div>`;
        }).join('');
      }
      row.classList.add('visible');
    };

    // 首次渲染或增量渲染
    if (prevLen === 0) {
      for (const entry of trick) renderRow(entry.playerId, this.trickRows[entry.playerId], entry.cards);
    } else {
      for (let i = prevLen; i < trick.length; i++) {
        const entry = trick[i];
        renderRow(entry.playerId, this.trickRows[entry.playerId], entry.cards);
      }
    }
  }

  createCardHTML(card, small) {
    const isJoker = card.suit === 'joker';
    const suitType = isJoker ? 'joker' : (card.suit === '♥' || card.suit === '♦' ? 'red' : 'black');
    const jokerClass = isJoker ? (card.rankName === '大王' ? 'big-joker' : 'small-joker') : '';
    const wildClass = card.isWild ? 'wild' : '';
    return `
      <div class="mini-card ${suitType} ${jokerClass} ${wildClass}">
        <div class="card-corner">
          <span class="card-rank ${isJoker ? 'joker-rank' : ''}">${isJoker ? 'JOKER' : card.rankName}</span>
          <span class="card-suit">${isJoker ? '' : card.suit}</span>
        </div>
        <div class="center-icon">${isJoker ? (card.rankName === '大王' ? '🎭' : '🃏') : card.suit}</div>
      </div>
    `;
  }

  // ====== 游戏结束 ======

  showGameOver() {
    const result = this.game.endGame();
    
    const winner = result.winner === '你的队伍' ? '🎉 你赢了！' : '😢 你输了';
    this.gameoverTitle.textContent = result.winner === '你的队伍' ? '🎉 恭喜获胜！' : '😢 再接再厉！';
    this.gameoverWinner.textContent = `${result.winner} 赢得这一局`;
    
    const finishDesc = result.finishOrder.map((name, i) => {
      const medals = ['🥇', '🥈', '🥉', '🏅'];
      return `${medals[i] || (i+1)}. ${name}`;
    }).join('\n');
    
    // 未出完玩家的剩余手牌
    let remainingCards = '';
    for (let i = 0; i < 4; i++) {
      if (!this.game.players[i].isFinished && this.game.hands[i].length > 0) {
        const cards = this.game.hands[i].sort((a, b) => b.rankValue - a.rankValue);
        const cardText = cards.map(c => c.rankName + c.suit).join(' ');
        const color = i === 0 ? '#ffd700' : (i === 2 ? '#4fc3f7' : '#ef5350');
        remainingCards += `<div style="margin:4px 0;font-size:13px"><span style="color:${color}">${this.game.players[i].name}</span> 剩余 ${cards.length} 张：<br>
          <span style="font-size:13px;color:#e0e0e0;font-family:monospace">${cardText}</span></div>`;
      }
    }
    
    this.gameoverDetail.innerHTML = `<div style="margin-bottom:8px">排名：<br>${finishDesc}</div>
      <div style="margin:8px 0;color:#94a3b8">你的队伍得分：${result.team0Score} | 对方得分：${result.team1Score}</div>
      ${remainingCards ? `<hr style="border-color:#334155;margin:8px 0">${remainingCards}` : ''}`;
    
    this.gameoverOverlay.classList.add('show');
    
    // 更新轮次
    this.round++;
  }

  // ====== 控制按钮 ======

  enableControls(enabled) {
    const isMyTurn = enabled && !this.game.gameOver && !this.game.players[0].isFinished;
    const hasLastCombo = !!this.game.lastCombo;

    this.btnPlay.disabled = !isMyTurn;
    this.btnPass.disabled = !isMyTurn || !hasLastCombo;
    this.btnAdvisor.disabled = !isMyTurn;
    this.btnSort.disabled = !isMyTurn || !!this.arrangedCombo;
    // 拆开按钮：理牌后可随时恢复（不依赖回合）
    if (this.arrangedCombo) {
      this.btnResetSort.style.display = 'inline-block';
    } else {
      this.btnResetSort.style.display = 'none';
    }

    // 自动过牌：轮到用户但没有牌能压过上家
    if (this.autoPassTimeout) { clearTimeout(this.autoPassTimeout); this.autoPassTimeout = null; }
    if (isMyTurn && hasLastCombo) {
      const hand = this.game.hands[0];
      const validPlays = getAllValidPlays(hand, this.game.lastCombo.combo, this.game.levelRankValue);
      if (validPlays.length === 0) {
        this.autoPassTimeout = setTimeout(() => {
          if (!this.btnPass.disabled) this.onPass();
          this.autoPassTimeout = null;
        }, 3000);
      }
    }
  }

  // ====== 工具函数 ======

  getComboTypeName(type) {
    const names = {
      'single': '单张',
      'pair': '对子',
      'triplet': '三同张',
      'threeWithTwo': '三带二',
      'straight': '顺子',
      'straightFlush': '同花顺',
      'bomb': '炸弹',
      'pairStraight': '三连对',
      'tripletStraight': '钢板',
      'jokerBomb': '火箭'
    };
    return names[type] || type;
  }

  describePlay(cards, combo) {
    if (!combo) return '';
    const typeName = this.getComboTypeName(combo.type);
    const rankDisplay = RANK_NAMES[combo.mainRank] || combo.mainRank;
    return `${typeName}[${rankDisplay}] (${cards.length}张)`;
  }

  showToast(message, type = 'info') {
    const toast = document.getElementById('message-toast');
    toast.textContent = message;
    toast.className = `show ${type}`;
    
    clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => {
      toast.classList.remove('show');
    }, 2500);
  }
}

// ====== 启动游戏 ======
document.addEventListener('DOMContentLoaded', () => {
  window.gameUI = new GameUI();
});
