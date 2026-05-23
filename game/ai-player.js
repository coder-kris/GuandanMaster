/**
 * 掼蛋高手练功房 - AI 对手逻辑
 * 3层难度：新手、进阶、高手
 */

/**
 * AI 选择出牌
 * @param {number} playerId - 玩家编号
 * @param {object} gameState - 游戏状态快照
 * @param {number} difficulty - 难度等级 1|2|3
 * @returns {object|null} { cards, combo } 或 null（过牌）
 */
function aiChoosePlay(playerId, gameState, difficulty) {
  const hand = gameState.hands[playerId];
  // 注意：gameState.lastCombo 是 { playerId, cards, combo }，需抽出 .combo
  const lastCombo = gameState.lastCombo ? gameState.lastCombo.combo : null;
  const level = gameState.levelRankValue;

  // 获取所有合法出牌
  const validPlays = getAllValidPlays(hand, lastCombo, level);

  // 没牌可出就过
  if (validPlays.length === 0) return null;

  // 根据难度选择策略
  switch (difficulty) {
    case 1: return aiLevel1(validPlays, hand, gameState, playerId, level);
    case 2: return aiLevel2(validPlays, hand, gameState, playerId, level);
    case 3: return aiLevel3(validPlays, hand, gameState, playerId, level);
    default: return aiLevel2(validPlays, hand, gameState, playerId, level);
  }
}

/**
 * 获取某个玩家的难度等级
 */
function getDifficultyForPlayer(playerId) {
  const difficulties = { 1: 2, 2: 1, 3: 3 }; // player1=A中级, player2=队友初级, player3=B高级
  return difficulties[playerId] || 2;
}

// ====== AI Level 1 - 新手 ======
// 策略：出最小可出的牌，不拆炸弹，不出大牌
function aiLevel1(validPlays, hand, gameState, playerId, level) {
  if (!gameState.lastCombo) {
    // 先手：残局时能一手出完则出
    if (hand.length <= 6) {
      const finisher = validPlays.find(p => {
        const remaining = hand.filter(c => !p.cards.some(pc => pc.id === c.id));
        return remaining.length === 0;
      });
      if (finisher) return finisher;
    }
    // 对手有牌少时，出大于对手牌数的组合
    const strategic = pickStrategicLead(validPlays, gameState, playerId);
    if (strategic) return strategic;
    // 出最小的单张
    return getSmallestPlay(validPlays, hand);
  }
  // 有上家：如果对手有人快出完（1-2张），优先封堵
  if (opponentCloseToFinish(gameState, playerId)) {
    const blocker = findBlocker(validPlays, gameState);
    if (blocker) return blocker;
  }
  // 出最小的能压过的牌
  return getSmallestWinningPlay(validPlays, hand);
}

// ====== AI Level 2 - 进阶 ======
// 策略：
// 1. 后手时尽量不拆炸弹压小牌
// 2. 队友出牌时尽量放行（出小牌或不压）
// 3. 对手出牌时尽量压住（但不是无脑压）
// 4. 先手时出中等大小的牌
function aiLevel2(validPlays, hand, gameState, playerId, level) {
  const lastCombo = gameState.lastCombo;
  const lastPlayer = gameState.lastComboPlayer;
  const myTeam = (playerId % 2);

  if (!lastCombo) {
    // 先手：残局时能一手出完则出
    if (hand.length <= 6) {
      const finisher = validPlays.find(p => {
        const remaining = hand.filter(c => !p.cards.some(pc => pc.id === c.id));
        return remaining.length === 0;
      });
      if (finisher) return finisher;
    }
    // 对手有牌少时，出大于对手牌数的组合
    const strategic = pickStrategicLead(validPlays, gameState, playerId);
    if (strategic) return strategic;
    // 有主动权，出中等牌型
    return aiChooseLeadingPlay(validPlays, hand, level, playerId);
  }

  // 后手情况
  const isPartnerLast = (lastPlayer >= 0) && ((lastPlayer % 2) === myTeam);

  if (isPartnerLast) {
    // 队友出的，尽量放行
    return null; // 或出小牌假装路过
  }

  // 对手出的：选择性地压
  // 优先用非炸弹的小牌压，控制成本
  const nonBombPlays = validPlays.filter(p => !isBombType(p.combo));

  // 如果对手有人快出完（≤2张），优先封堵
  if (opponentCloseToFinish(gameState, playerId)) {
    const blocker = findBlocker(validPlays, gameState);
    if (blocker) return blocker;
  }
  // 对手剩4-6张：残局防守，应该用炸弹拦截
  if (shouldBombOpponent(gameState, playerId) && validPlays.length > 0) {
    const bombs = validPlays.filter(p => isBombType(p.combo));
    if (bombs.length > 0) {
      // 用最小炸弹
      return bombs.sort((a, b) => a.cards.length - b.cards.length || a.combo.mainRank - b.combo.mainRank)[0];
    }
  }

  if (nonBombPlays.length > 0) {
    // 出最小的能压的非炸弹
    return getSmallestPlay(nonBombPlays, hand);
  }

  // 没有非炸弹可压：用小炸弹
  return getSmallestPlay(validPlays, hand);
}

// ====== AI Level 3 - 高手 ======
// 策略：
// 1. 记牌策略（统计已出张数）
// 2. 牌力评估和控牌权
// 3. 对手手牌推测
// 4. 节奏控制（快慢交替）
// 5. 牌型组合优化
// 6. 跟队友配合
function aiLevel3(validPlays, hand, gameState, playerId, level) {
  const lastCombo = gameState.lastCombo;
  const lastPlayer = gameState.lastComboPlayer;
  const myTeam = (playerId % 2);

  // 分析局面
  const analysis = analyzeGameState(gameState, playerId, hand);

  if (!lastCombo) {
    // 先手：残局能一手出完则出
    if (analysis.canFinishInOne) {
      const finisher = validPlays.find(p => {
        const remaining = hand.filter(c => !p.cards.some(pc => pc.id === c.id));
        return remaining.length === 0;
      });
      if (finisher) return finisher;
    }
    // 根据手牌结构选择最优开局
    return aiChooseLeadingPlayAdvanced(validPlays, hand, level, playerId, analysis, gameState);
  }

  const isPartnerLast = (lastPlayer >= 0) && ((lastPlayer % 2) === myTeam);

  // 分析每个出牌方案的评分
  let scoredPlays = validPlays.map(play => {
    const score = scorePlay(play, hand, gameState, playerId, analysis);
    return { ...play, score };
  });

  scoredPlays.sort((a, b) => b.score - a.score);

  if (isPartnerLast) {
    // 队友出牌：除非队友的牌没人管或者想加速，否则放行
    // 如果队友是末游/牌少，帮助接牌
    const partnerId = playerId === 0 ? 2 : (playerId === 2 ? 0 : (playerId === 1 ? 3 : 1));
    const partnerCards = gameState.hands[partnerId].length;

    if (partnerCards <= 3 && analysis.haveControl) {
      // 队友快出完了，帮忙接牌
      if (scoredPlays.length > 0 && scoredPlays[0].score > 3) {
        return scoredPlays[0];
      }
    }
    // 一般放行
    return null;
  }

  // 对手出牌：选择最优方案压
  if (scoredPlays.length > 0 && scoredPlays[0].score > 2) {
    return scoredPlays[0];
  }

  return null;
}

// ====== AI 辅助函数 ======

/**
 * 出牌方案评分（越小越好），浪费逢人配会重罚
 */
function playRankSum(play) {
  let s = play.cards.reduce((sum, c) => sum + c.rankValue, 0);
  if (play.cards.filter(c => c.isWild).length > 0 && !isBombType(play.combo)) {
    s += 50;
  }
  return s;
}

/**
 * 选出最小的出牌方案（用牌的点数之和衡量）
 */
function getSmallestPlay(plays, hand) {
  if (plays.length === 0) return null;

  // 先手时优先出对子/组合（比单张难接）
  const nonSingles = plays.filter(p => p.combo.type !== 'single');
  if (nonSingles.length > 0) {
    let best = nonSingles[0];
    let bestScore = playRankSum(best);
    for (const play of nonSingles) {
      const score = playRankSum(play);
      if (score < bestScore) { bestScore = score; best = play; }
    }
    return best;
  }

  let best = plays[0];
  let bestScore = playRankSum(best);

  for (const play of plays) {
    const score = playRankSum(play);
    if (score < bestScore) {
      bestScore = score;
      best = play;
    }
  }
  return best;
}

/**
 * 选出最小的能压过的方案
 */
function getSmallestWinningPlay(plays, hand) {
  return getSmallestPlay(plays, hand);
}

/**
 * 先手时选择出牌
 */
function aiChooseLeadingPlay(plays, hand, level, playerId) {
  // 优先出单张、对子中等的牌
  // 按类型分组
  const byType = {};
  for (const play of plays) {
    if (!byType[play.combo.type]) byType[play.combo.type] = [];
    byType[play.combo.type].push(play);
  }

  // 优先出对子或三同张（比单张难接，且清理手牌效率高）
  for (const type of ['pair', 'triplet', 'threeWithTwo', 'single']) {
    if (byType[type] && byType[type].length > 0) {
      const sorted = byType[type].sort((a, b) => a.combo.mainRank - b.combo.mainRank);
      const mid = Math.floor(sorted.length / 2);
      return sorted[mid];
    }
  }

  // 没有单张对子，出最小的组合
  return getSmallestPlay(plays, hand);
}

/**
 * 高手版先手选择
 */
function aiChooseLeadingPlayAdvanced(plays, hand, level, playerId, analysis, gameState) {
  const byType = {};
  for (const play of plays) {
    if (!byType[play.combo.type]) byType[play.combo.type] = [];
    byType[play.combo.type].push(play);
  }

  // 如果炸弹多，主动出小牌引诱对手出炸弹
  if (analysis.bombCount >= 2) {
    // 优先小对子（比单张更难压，而且对子更难接）
    if (byType.pair) {
      const smallPairs = byType.pair
        .filter(p => p.combo.mainRank < 10)
        .sort((a, b) => a.combo.mainRank - b.combo.mainRank);
      if (smallPairs.length > 0) return smallPairs[0];
    }
    if (byType.single) {
      const smallSingles = byType.single
        .filter(p => p.combo.mainRank < 10)
        .sort((a, b) => a.combo.mainRank - b.combo.mainRank);
      if (smallSingles.length > 0) return smallSingles[0];
    }
  }

  // 手牌结构好：出顺子/多张组合，快速走牌
  if (analysis.handQuality > 0.6) {
    for (const type of ['pairStraight', 'straight', 'straightFlush', 'triplet', 'pair']) {
      if (byType[type] && byType[type].length > 0) {
        return byType[type][0];
      }
    }
  }

  // 默认：优先出大于对手牌数的组合，让对手接不上
  if (gameState) {
    const strategic = pickStrategicLead(plays, gameState, playerId);
    if (strategic) return strategic;
  }
  // 再出对子/组合
  if (byType.pair) {
    const sorted = byType.pair.sort((a, b) => a.combo.mainRank - b.combo.mainRank);
    return sorted[0]; // 最小的对子
  }
  if (byType.triplet) {
    return byType.triplet[0];
  }
  if (byType.single) {
    const sorted = byType.single.sort((a, b) => a.combo.mainRank - b.combo.mainRank);
    const mid = Math.floor(sorted.length / 2);
    return sorted[mid];
  }

  return getSmallestPlay(plays, hand);
}

/**
 * 为高手的出牌方案评分
 */
function scorePlay(play, hand, gameState, playerId, analysis) {
  let score = 5;
  const combo = play.combo;
  const lastPlayer = gameState.lastComboPlayer;
  const myTeam = (playerId % 2);
  const isPartnerLast = (lastPlayer >= 0) && ((lastPlayer % 2) === myTeam);

  // 用炸弹压小牌：减分
  if (isBombType(combo) && gameState.lastCombo && !isBombType(gameState.lastCombo.combo)) {
    const playRank = combo.cards.reduce((s, c) => s + c.rankValue, 0);
    const lastRank = gameState.lastCombo.cards
      ? gameState.lastCombo.cards.reduce((s, c) => s + c.rankValue, 0)
      : 0;
    if (playRank > lastRank * 1.5) {
      score -= 3; // 用大炸弹压小牌，很浪费
    } else {
      score -= 1;
    }
  }

  // 出小牌：如果手牌质量好，加分
  if (combo.type === 'single' && combo.mainRank <= 8 && analysis.handQuality > 0.5) {
    score += 2;
  }

  // 出大牌但无后续：减分
  if (combo.type === 'single' && combo.mainRank >= 12) {
    const otherCards = hand.filter(c => !play.cards.some(pc => pc.id === c.id));
    const canLeadAfter = getAllValidPlays(otherCards, null, gameState.levelRankValue);
    if (canLeadAfter.length <= 5) {
      score -= 2; // 大牌打出后没牌跟了
    }
  }

  // 最后几手牌：尽快出完
  if (hand.length <= 6) {
    score += 3;
  }

  // === 残局优化 ===
  if (analysis.phase === 'late' || hand.length <= 4) {
    // 能一手出完 → 出它
    if (analysis.canFinishInOne) {
      score += 5;
      return score;
    }
    // 队友快出完 → 送队友
    if (analysis.partnerCount <= 3 && gameState.lastCombo && !isPartnerLast) {
      if (combo.mainRank <= 6) score += 2; // 出小牌放行让队友走
    }
  }

  // 封堵：残局防守
  if (gameState.lastCombo && !gameState.players[playerId].isFinished) {
    for (let i = 0; i < 4; i++) {
      if (i === playerId || i === (playerId + 2) % 4) continue;
      const opp = gameState.players[i];
      const oppHand = gameState.hands[i];
      const oppCount = opp.cardCount || (oppHand ? oppHand.length : 0);
      if (oppCount <= 0) continue;

      // 对手剩1-2张：同类型必压
      if (oppCount <= 2) {
        if (combo.type === gameState.lastCombo.combo.type) {
          score += 3;
        }
        if (isBombType(combo)) score += 1;
      }
      // 对手剩4-6张且牌权在手：残局该炸就炸
      if (oppCount >= 4 && oppCount <= 6 && isBombType(combo) && !isBombType(gameState.lastCombo.combo)) {
        score += 2;
      }
      break;
    }
  }

  // 出炸弹过多，后续乏力
  if (combo.type === 'bomb' && analysis.handQuality < 0.3) {
    score -= 2;
  }

  return score;
}

/**
 * 分析游戏局面
 */
function analyzeGameState(gameState, playerId, hand) {
  // 手牌质量评分
  let totalScore = 0;
  let bombCount = 0;
  let singleCount = 0;

  for (const card of hand) {
    totalScore += card.rankValue;
  }

  // 统计炸弹
  const allPlays = getAllValidPlays(hand, null, gameState.levelRankValue);
  bombCount = allPlays.filter(p => isBombType(p.combo)).length;

  // 统计单张数量
  for (let i = 0; i < hand.length; i++) {
    let hasPair = false;
    for (let j = 0; j < hand.length; j++) {
      if (i !== j && hand[i].rankValue === hand[j].rankValue && !hand[i].isWild) {
        hasPair = true;
        break;
      }
    }
    if (!hasPair) singleCount++;
  }

  // 已出牌数统计
  const totalPlayed = gameState.playHistory
    .filter(h => h.combo)
    .reduce((sum, h) => sum + (h.combo ? h.combo.cards ? h.combo.cards.length : (h.combo.length || 0) : 0), 0);

  // 还剩下的牌总数
  const remainingCards = 108 - totalPlayed;

  // 手牌质量（数值越低手牌越小，0-1，越大表示牌越好）
  const avgRank = totalScore / hand.length;
  const handQuality = Math.min(1, Math.max(0, (avgRank - 3) / 14));

  // 是否有控牌权（有炸弹或大牌）
  const haveControl = bombCount > 0;

  // 计算各玩家剩余手牌估计
  const playerCardCounts = {};
  for (let i = 0; i < 4; i++) {
    playerCardCounts[i] = gameState.hands[i] ? gameState.hands[i].length : gameState.players[i].cardCount;
  }

  // 游戏阶段：早/中/末
  let phase = 'early';
  const totalDealt = 108;
  const totalLeft = Object.values(playerCardCounts).reduce((a, b) => a + b, 0);
  const percentPlayed = (totalDealt - totalLeft) / totalDealt;
  if (percentPlayed > 0.6) phase = 'late';
  else if (percentPlayed > 0.3) phase = 'mid';

  // 残局检测
  const myCount = hand.length;
  const canFinishInOne = myCount <= 6 && getAllValidPlays(hand, null, gameState.levelRankValue).length > 0;
  const partnerId = (playerId + 2) % 4;
  const partnerCount = playerCardCounts[partnerId] || 0;
  let oppCloseCount = 0;
  for (let i = 0; i < 4; i++) {
    if (i === playerId || i === partnerId) continue;
    if (playerCardCounts[i] > 0 && playerCardCounts[i] <= 2) oppCloseCount++;
  }

  return {
    handQuality,
    bombCount,
    singleCount,
    avgRank,
    haveControl,
    phase,
    playerCardCounts,
    remainingCards,
    canFinishInOne,
    partnerCount,
    oppCloseCount
  };
}

// ====== 自动AI出牌调度 ======

/**
 * 让AI自动出牌并返回结果
 * @param {GuandanGame} game
 * @param {number} delay - 延迟毫秒
 * @returns {Promise}
 */
function aiAutoPlay(game, delay = 1000) {
  return new Promise((resolve) => {
    const playerId = game.currentPlayer;
    if (game.players[playerId].isHuman) {
      resolve(null);
      return;
    }

    const state = game.getStateSummary();
    const difficulty = game.players[playerId].difficulty;
    const choice = aiChoosePlay(playerId, state, difficulty);

    setTimeout(() => {
      if (choice) {
        const result = game.playCards(playerId, choice.cards);
        resolve(result);
      } else {
        const result = game.pass(playerId);
        resolve(result);
      }
    }, delay);
  });
}

// 导出

/**
 * 检查是否有对手接近出完（1-2张）
 */
function opponentCloseToFinish(gameState, playerId) {
  for (let i = 0; i < 4; i++) {
    if (i === playerId || i === (playerId + 2) % 4) continue;
    const opp = gameState.players[i];
    const count = opp.cardCount || (gameState.hands[i] ? gameState.hands[i].length : 0);
    if (count > 0 && count <= 2) return true;
  }
  return false;
}

/**
 * 获取最少对手剩余手牌数
 */
function minOpponentCount(gameState, playerId) {
  let min = 99;
  for (let i = 0; i < 4; i++) {
    if (i === playerId || i === (playerId + 2) % 4) continue;
    const opp = gameState.players[i];
    const cnt = opp.cardCount || (gameState.hands[i] ? gameState.hands[i].length : 0);
    if (cnt > 0 && cnt < min) min = cnt;
  }
  return min;
}

/**
 * 从plays中选出大于对手手牌数的组合
 * 对手剩2张，就出3+张的组合（三同张、顺子等），让对手接不上
 */
function pickStrategicLead(plays, gameState, playerId) {
  const oppMin = minOpponentCount(gameState, playerId);
  const sortByRank = arr => arr.sort((a, b) => playRankSum(a) - playRankSum(b));
  const bestPair = arr => {
    const p = arr.filter(p => p.combo.type === 'pair' && !isBombType(p.combo));
    return sortByRank(p)[0] || null;
  };

  if (oppMin >= 99) return bestPair(plays);

  const combos = plays.filter(p => !isBombType(p.combo));

  // 对手1-2张：用张数更大的组合封堵
  if (oppMin <= 2) {
    const blockers = sortByRank(combos.filter(p => p.cards.length > oppMin));
    if (blockers.length > 0) return blockers[0];
    return bestPair(combos) || null;
  }

  // 对手3-4张：三带二 > 三同张 > 对子（不出单张）
  if (oppMin <= 4) {
    const t3 = sortByRank(combos.filter(p => p.combo.type === 'threeWithTwo'));
    if (t3.length > 0) return t3[0];
    const trip = combos.filter(p => p.combo.type === 'triplet').sort((a,b) => a.combo.mainRank - b.combo.mainRank);
    if (trip.length > 0) return trip[0];
    return bestPair(combos) || null;
  }

  // 对手5+张：出多张组合清牌
  const multi = sortByRank(combos.filter(p => ['threeWithTwo', 'straight', 'pairStraight', 'tripletStraight'].includes(p.combo.type)));
  if (multi.length > 0) return multi[0];
  return bestPair(combos) || null;
}

/**
 * 判断是否应该用炸弹拦截对手（残局防守）
 * 对手剩4-6张且牌权在手 → 能炸则炸
 */
function shouldBombOpponent(gameState, playerId) {
  const oppMin = minOpponentCount(gameState, playerId);
  if (oppMin <= 0 || oppMin >= 99) return false;
  // 对手剩4-6张：一般能炸就炸
  if (oppMin >= 4 && oppMin <= 6) return true;
  // 对手剩1-3张：用牌堵，不一定要炸（已有封堵逻辑）
  return false;
}

/**
 * 检查是否有对手接近出完（1-2张）
 */
function opponentCloseToFinish(gameState, playerId) {
  for (let i = 0; i < 4; i++) {
    if (i === playerId || i === (playerId + 2) % 4) continue; // 排除自己和队友
    const opp = gameState.players[i];
    const count = opp.cardCount || (gameState.hands[i] ? gameState.hands[i].length : 0);
    if (count > 0 && count <= 2) return true;
  }
  return false;
}

/**
 * 找合适的封堵牌
 */
function findBlocker(validPlays, gameState) {
  if (!gameState.lastCombo || validPlays.length === 0) return null;
  const lastType = gameState.lastCombo.combo.type;
  // 优先用同类型的最小牌
  const sameType = validPlays.filter(p => p.combo.type === lastType && !isBombType(p.combo));
  if (sameType.length > 0) {
    let best = sameType[0];
    let bestScore = playRankSum(best);
    for (const p of sameType) {
      const score = playRankSum(p);
      if (score < bestScore) { bestScore = score; best = p; }
    }
    return best;
  }
  // 没有同类型，用最小的炸弹
  const bombs = validPlays.filter(p => isBombType(p.combo));
  if (bombs.length > 0) return bombs[0];
  return null;
}
window.aiChoosePlay = aiChoosePlay;
window.aiAutoPlay = aiAutoPlay;
window.getDifficultyForPlayer = getDifficultyForPlayer;
