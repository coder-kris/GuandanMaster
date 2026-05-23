/**
 * 掼蛋高手练功房 - Advisor 出牌建议引擎
 * 多维度分析 + 方案评分 + 自然语言理由
 */

class Advisor {
  /**
   * 获取出牌建议
   * @param {number} playerId - 玩家ID
   * @param {object} gameState - 游戏状态快照
   * @param {Array} validPlays - 所有合法出牌方案
   * @returns {Array} 建议列表 [{ label, rating, cards, combo, reasons }]
   */
  static getAdvice(playerId, gameState, validPlays) {
    const hand = gameState.hands[playerId];
    const lastCombo = gameState.lastCombo;
    const level = gameState.levelRankValue;

    if (validPlays.length === 0) {
      return [{
        label: '没有合适的牌可出',
        rating: 0,
        cards: [],
        combo: null,
        reasons: ['当前牌面没有能压过上家的牌型，建议过牌。']
      }];
    }

    // 分析手牌结构
    const analysis = Advisor.analyzeHand(hand, level);
    
    // 分析局面
    const situation = Advisor.analyzeSituation(gameState, playerId, hand);

    // 对所有方案评分
    const scoredPlays = validPlays.map(play => ({
      ...play,
      score: Advisor.scorePlay(play, analysis, situation, hand, gameState, validPlays)
    }));

    scoredPlays.sort((a, b) => b.score - a.score);

    // 检查过牌是否更优
    const topScore = scoredPlays.length > 0 ? scoredPlays[0].score : 0;
    const passScore = Advisor.scorePass(analysis, situation, gameState, hand, validPlays, topScore);

    // 选择 top 2 作为建议方案（如果过牌排名靠前则加入）
    let topPlays = scoredPlays.slice(0, 2);
    if (passScore > 0 && (topPlays.length === 0 || passScore > (scoredPlays.length >= 2 ? scoredPlays[1].score : 0))) {
      // 过牌优于至少一个默认方案
      topPlays.push({ isPass: true, score: passScore });
    }
    topPlays.sort((a, b) => b.score - a.score);
    topPlays = topPlays.slice(0, 2);

    // 生成带标签和理由的建议
    const suggestions = [];
    const usedLabels = new Set();

    for (let i = 0; i < topPlays.length; i++) {
      const play = topPlays[i];
      if (play.isPass) {
        suggestions.push({
          label: '🙌 过牌',
          rating: Math.min(5, Math.max(1, Math.round(play.score))),
          cards: [],
          combo: null,
          reasons: Advisor.generatePassReasons(analysis, situation, gameState, hand, validPlays),
          isBest: i === 0
        });
        continue;
      }
      const label = Advisor.getPlayLabel(play, i, analysis, situation);
      const rating = Math.min(5, Math.max(1, Math.round(play.score)));
      const reasons = Advisor.generateReasons(play, analysis, situation, playerId, gameState, i);

      suggestions.push({
        label,
        rating,
        cards: play.cards,
        combo: play.combo,
        reasons,
        isBest: i === 0
      });
    }

    return suggestions;
  }

  /**
   * 分析手牌结构
   */
  static analyzeHand(hand, level) {
    const cards = sortCards(hand);
    const wilds = cards.filter(c => c.isWild);
    const normals = cards.filter(c => !c.isWild);
    
    // 按点数分布
    const rankCount = {};
    for (const c of normals) {
      rankCount[c.rankValue] = (rankCount[c.rankValue] || 0) + 1;
    }

    // 统计各类牌型数量
    let singleCount = 0;  // 孤张
    let pairCount = 0;    // 对子数
    let tripletCount = 0; // 三同张数
    let bombCount = 0;    // 炸弹数
    const bombRanks = [];

    const ranks = Object.keys(rankCount).map(Number).sort((a, b) => a - b);

    for (const r of ranks) {
      const cnt = rankCount[r];
      if (cnt >= 4) {
        bombCount++;
        bombRanks.push(r);
      } else if (cnt === 3) {
        tripletCount++;
      } else if (cnt === 2) {
        pairCount++;
      } else if (cnt === 1) {
        singleCount++;
      }
    }

    // 检查顺子潜力
    const possibleStraights = Advisor.countPossibleStraights(ranks, normals);

    // 牌力指数 (0-1)
    const avgRank = cards.reduce((s, c) => s + c.rankValue, 0) / cards.length;
    const powerIndex = Math.min(1, (avgRank - 3) / 14 * 0.5 + bombCount * 0.1 + (wilds.length * 0.05));

    // 手牌健康度 (单张越少越健康)
    const healthRatio = hand.length > 0 ? 1 - singleCount / hand.length : 0;

    // 能否一手出完
    const canFinishInOne = (() => {
      if (hand.length > 6) return false;
      // 尝试所有牌型检测
      const allCombos = [];
      // 对所有可能的子集做牌型检测太贵，只检测明显的
      if (hand.length <= 6) {
        const det = detectCombo(cards, level);
        if (det) return true;
      }
      return false;
    })();

    return {
      totalCards: hand.length,
      wildCount: wilds.length,
      singleCount,
      pairCount,
      tripletCount,
      bombCount,
      bombRanks,
      ranks,
      rankCount,
      avgRank,
      powerIndex,
      healthRatio,
      possibleStraights,
      canFinishInOne
    };
  }

  /**
   * 分析局面
   */
  static analyzeSituation(gameState, playerId, hand) {
    const lastCombo = gameState.lastCombo;
    const isLead = !lastCombo;
    const lastPlayer = gameState.lastComboPlayer;
    const myTeam = playerId % 2;
    const isPartnerLast = lastPlayer >= 0 && (lastPlayer % 2) === myTeam;

    // 计算游戏阶段
    const totalPlayed = gameState.playHistory
      .filter(h => h.combo)
      .reduce((sum, h) => sum + (h.combo ? (h.combo.length || h.combo.cards ? h.combo.cards.length : 1) : 1), 0);
    
    const phase = Advisor.getGamePhase(totalPlayed, gameState);

    // 计算各玩家剩余牌数
    const cardCounts = {};
    for (let i = 0; i < 4; i++) {
      cardCounts[i] = gameState.hands[i] ? gameState.hands[i].length : gameState.players[i].cardCount;
    }

    // 队友和对手
    let actualPartnerId, actualOpp1, actualOpp2;
    if (playerId === 0) { actualPartnerId = 2; actualOpp1 = 1; actualOpp2 = 3; }
    else if (playerId === 1) { actualPartnerId = 3; actualOpp1 = 0; actualOpp2 = 2; }
    else if (playerId === 2) { actualPartnerId = 0; actualOpp1 = 1; actualOpp2 = 3; }
    else { actualPartnerId = 1; actualOpp1 = 0; actualOpp2 = 2; }

    // ===== 牌池记忆 =====
    const dealtByRank = {};  // 各点数已出了多少张
    const dealtBySuit = {}; // 各花色已出了多少张
    for (const r of [3,4,5,6,7,8,9,10,11,12,13,14,15]) dealtByRank[r] = 0;
    for (const s of ['♠','♥','♣','♦']) dealtBySuit[s] = 0;
    let jokersDealt = 0;
    let bigJokerDealt = 0;

    for (const h of gameState.playHistory) {
      if (h.cardNames) {
        for (const name of h.cardNames) {
          const rankStr = name.slice(0, -1);
          const suitStr = name.slice(-1);
          const rv = RANK_VALUES[rankStr];
          if (rv) {
            dealtByRank[rv] = (dealtByRank[rv] || 0) + 1;
            if (['♠','♥','♣','♦'].includes(suitStr)) dealtBySuit[suitStr] = (dealtBySuit[suitStr] || 0) + 1;
          } else if (rankStr === '小' || rankStr === '大') {
            jokersDealt++;
            if (rankStr === '大') bigJokerDealt++;
          }
        }
      }
    }

    // 死点（4张全出完的点数，不可能再有炸弹/对子/三同张）
    const deadRanks = [];
    for (const r of [3,4,5,6,7,8,9,10,11,12,13,14,15]) {
      if (dealtByRank[r] >= 8) deadRanks.push(r); // 2副牌，每点8张
    }

    // 花色剩余估算（2副牌共24张/花色 - 已出）
    const suitRemaining = {};
    for (const s of ['♠','♥','♣','♦']) {
      suitRemaining[s] = 24 - (dealtBySuit[s] || 0);
    }

    // ===== 位置意识 =====
    const nextPlayer = (playerId + 1) % 4;
    const isNextPartner = (nextPlayer % 2) === myTeam;
    const oppAvgRemaining = (cardCounts[actualOpp1] + cardCounts[actualOpp2]) / 2;
    const partnerRemaining = cardCounts[actualPartnerId];
    const partnerCloseToFinish = partnerRemaining <= 2;
    const oppCloseToFinish = oppAvgRemaining <= 2 || cardCounts[actualOpp1] <= 1 || cardCounts[actualOpp2] <= 1;
    const isLastTrick = cardCounts[playerId] <= 3;

    return {
      isLead,
      isPartnerLast,
      lastPlayer,
      phase,
      cardCounts,
      partnerId: actualPartnerId,
      opponent1: actualOpp1,
      opponent2: actualOpp2,
      partnerCards: partnerRemaining,
      opp1Cards: cardCounts[actualOpp1],
      opp2Cards: cardCounts[actualOpp2],
      isLastTrick,
      // 牌池
      deadRanks,
      suitRemaining,
      jokersDealt,
      bigJokerRemaining: 2 - bigJokerDealt, // 2副牌共2张大王
      // 位置
      nextPlayer,
      isNextPartner,
      partnerRemaining,
      oppAvgRemaining,
      partnerCloseToFinish,
      oppCloseToFinish
    };
  }

  /**
   * 判断游戏阶段
   */
  static getGamePhase(totalPlayed, gameState) {
    const totalDealt = 108;
    let remaining = 0;
    for (let i = 0; i < 4; i++) {
      remaining += gameState.hands[i] ? gameState.hands[i].length : gameState.players[i].cardCount;
    }
    const percentPlayed = (totalDealt - remaining) / totalDealt;
    if (percentPlayed >= 0.6) return 'late';
    if (percentPlayed >= 0.3) return 'mid';
    return 'early';
  }

  /**
   * 计算顺子潜力
   */
  static countPossibleStraights(ranks, normals) {
    let count = 0;
    for (let start = 3; start <= 10; start++) {
      let consecutive = 0;
      for (let r = start; r <= 14; r++) {
        if (ranks.includes(r)) consecutive++;
        else break;
      }
      if (consecutive >= 4) count++;
    }
    return count;
  }

  /**
   * 对出牌方案综合评分 (1-5)
   */
  static scorePlay(play, analysis, situation, hand, gameState, allPlays) {
    let score = 3; // 基础分
    const combo = play.combo;
    const isBomb = isBombType(combo);

    // === 残局：能一手出完 ===
    if (analysis.canFinishInOne) {
      score += 5; // 能一手出完，最高优先级
      return score;
    }

    // === 残局：送队友 / 压对手 ===
    if (situation.isLead && combo.type === 'single') {
      if (situation.partnerCloseToFinish && combo.mainRank <= 8) {
        score += 2; // 队友快出完了，出小牌送队友
      }
      if (!situation.isNextPartner && situation.oppCloseToFinish && combo.mainRank >= 10) {
        score -= 2; // 对手快出完了，不要出中牌送
      }
      if (!situation.isNextPartner && situation.oppCloseToFinish && combo.mainRank >= 14) {
        score += 1; // 对手快出完了，出大牌压制
      }
    }

    // === 牌型加分 ===
    if (situation.isLead) {
      if (['straight', 'pairStraight', 'tripletStraight'].includes(combo.type)) {
        score += 1;
        // 清理效率：顺子/连对/钢板包含的低点数牌越多越好
        if (combo.type === 'straight' && combo.mainRank <= 10) {
          score += 0.5; // 清理低位顺子更有价值
        }
      }
      if (['single', 'pair'].includes(combo.type) && analysis.healthRatio > 0.6) {
        score += 0.5;
      }
    }

    // === 牌力控制 ===
    if (combo.type === 'single') {
      if (combo.mainRank >= 8 && combo.mainRank <= 12 && situation.isLead) {
        score += 0.5;
      }
      if (combo.mainRank <= 6 && analysis.totalCards > 10) {
        score += 0.5;
      }
      // 有更小的单张时，应优先出最小的
      if (hand && situation.isLead && combo.mainRank >= 6) {
        const rankCounts = {};
        for (const c of hand) rankCounts[c.rankValue] = (rankCounts[c.rankValue] || 0) + 1;
        const realSmallerSingles = hand.filter(c => 
          c.rankValue < combo.mainRank && c.rankValue >= 3 && rankCounts[c.rankValue] === 1
        );
        if (realSmallerSingles.length > 0) {
          score -= 1; // 应该出最小的单张
        }
      }
    }

    // === 队友出的牌，尽量放行 ===
    if (situation.isPartnerLast && !isBomb) {
      score -= 2;
    }

    // === 位置意识：下家是对手且对手残局 ===
    if (!situation.isNextPartner && situation.oppCloseToFinish && situation.isLead) {
      if (combo.type === 'single' && combo.mainRank <= 6) {
        score -= 2; // 不要给小牌帮对手过
      }
    }

    // === 炸弹使用 ===
    if (isBomb) {
      if (!gameState.lastCombo) {
        // 先手出炸弹
        if (analysis.totalCards <= 15) score += 1;
        else score -= 1;
        if (situation.deadRanks.length >= 6) score += 0.5;
        // 先手炸弹后，检查有没有好的后续牌
        if (situation.isLead && analysis.totalCards > 10) {
          const usedIds = new Set(play.cards.map(c => c.id));
          const remaining = hand.filter(c => !usedIds.has(c.id));
          // 如果炸完只能出单张 → 不值得（一炸换一轮单张）
          const nonSinglePlays = allPlays.filter(p =>
            !isBombType(p.combo) && p.combo.type !== 'single' &&
            !p.cards.some(c => usedIds.has(c.id))
          );
          if (nonSinglePlays.length === 0) {
            score -= 2; // 炸完没好牌型可出，浪费炸弹
          }
        }
      } else {
        const lastStr = gameState.lastCombo.combo;
        if (!isBombType(lastStr)) {
          // 非炸弹用炸弹压（已有逻辑）
          const lastRank = lastStr.mainRank || 0;
          const lastLen = lastStr.length || 1;
          const hasNonBomb = allPlays && allPlays.some(p => !isBombType(p.combo) && p.combo.type === lastStr.type);
          if (hasNonBomb) { score -= 4; }
          else if (lastLen === 1 && lastRank <= 15) { score -= 3; }
          else if (lastRank >= 15 && lastLen >= 4) { score += 1; }
          else if (lastRank <= 6) { score -= 2; }
          else { score -= 1; }
          if (situation.deadRanks.includes(lastRank)) { score -= 1; }
        } else {
          // 炸弹对炸弹：是否要参与炸链
          const hasGoodHand = analysis.pairCount + analysis.tripletCount >= 3;
          const myBombsRemaining = analysis.bombCount;
          // 自己还有2+炸弹、手牌结构好、不是残局→没必要现在炸，让对方互炸消耗
          if (myBombsRemaining >= 2 && hasGoodHand && situation.phase !== 'late' && analysis.totalCards > 10) {
            score -= 2; // 不参与无意义的炸链消耗
          } else {
            score += 0.5;
          }
        }
      }
    }

    // === 非炸弹方案得分优化 ===
    if (!isBomb && gameState.lastCombo) {
      const lastStr = gameState.lastCombo.combo;
      const lastRank = lastStr.mainRank || 0;
      if (combo.type === 'single' && combo.mainRank - lastRank <= 2) {
        score += 1.5;
      }
      if (combo.type === 'single' && combo.mainRank === 15 && lastRank >= 9 && lastRank <= 13) {
        score += 1;
      }
    }

    // === 局面因素 ===
    if (situation.phase === 'late') score += 1;
    if (analysis.totalCards <= 6) {
      score += 1.5;
      if (['bomb', 'straightFlush'].includes(combo.type)) score += 1;
    }

    // === 多步规划：出牌后剩余牌的连续出手潜力 ===
    if (situation.isLead && !isBomb) {
      const usedIds = new Set(play.cards.map(c => c.id));
      const remaining = hand.filter(c => !usedIds.has(c.id));
      if (remaining.length > 0) {
        // 检查剩余牌能否组成一个顺子/连对/钢板等大牌型
        const remSorted = sortCards(remaining);
        const remDetect = detectCombo(remSorted, gameState.levelRankValue);
        if (remDetect && remDetect.cards) {
          if (['straight', 'pairStraight', 'tripletStraight', 'bomb', 'straightFlush'].includes(remDetect.type)) {
            score += 1;
          }
        }
        // 剩余牌中孤张数 → 后续好不好走
        const remRankCount = {};
        for (const c of remaining) remRankCount[c.rankValue] = (remRankCount[c.rankValue] || 0) + 1;
        let remSingles = 0;
        for (const r in remRankCount) { if (remRankCount[r] === 1) remSingles++; }
        if (remaining.length <= 4) {
          if (remSingles <= 1) score += 1; // 后续好走
          else score -= 1; // 后续难走
        } else if (remSingles > 2) {
          score -= 1; // 剩余孤张太多，拆不散
        }
      }
    }

    // === 不拆有用牌型 ===
    if (combo.type === 'single' && hand) {
      const cardRank = combo.mainRank;
      const rankCounts = {};
      for (const c of hand) if (!c.isWild) rankCounts[c.rankValue] = (rankCounts[c.rankValue] || 0) + 1;
      if ((rankCounts[cardRank] || 0) >= 2) score -= 1.5;
    }

    // === 不拆炸弹/三同张组成其他牌型 ===
    if (hand && hand.length > 0) {
      const rankCounts = {};
      for (const c of hand) if (!c.isWild) rankCounts[c.rankValue] = (rankCounts[c.rankValue] || 0) + 1;
      let breaksBomb = false;
      let breaksTriple = false;
      for (const c of play.cards) {
        if (c.isWild) continue; // 逢人配的正常使用不算拆牌
        const cnt = rankCounts[c.rankValue] || 0;
        if (cnt >= 4) breaksBomb = true;
        else if (cnt >= 3) breaksTriple = true;
      }
      if (breaksBomb) score -= 2;
      if (breaksTriple) score -= 1;
    }

    return score;
  }

  /**
   * 评估过牌的得分
   */
  static scorePass(analysis, situation, gameState, hand, validPlays, bestPlayScore) {
    if (!gameState.lastCombo) return -1; // 先手不能过牌
    if (situation.phase === 'late' && analysis.totalCards <= 6) return -1; // 残局应出不应过

    let score = 2.5; // 基础分

    // 剩余炸弹多且手牌结构好 → 应保存炸弹不硬拼
    if (analysis.bombCount >= 2 && analysis.pairCount + analysis.tripletCount >= 3) {
      score += 1.5;
    }

    // 对方炸链中，自己不参与消耗 → 加分
    if (gameState.lastCombo && isBombType(gameState.lastCombo.combo)) {
      score += 1;
    }

    // 队友出的牌，让队友继续
    if (situation.isPartnerLast) {
      score += 1.5;
    }

    // 手牌健康度好 → 不急于出牌
    if (analysis.healthRatio > 0.7) score += 0.5;

    // 如果最佳出牌方案得分极低 → 过牌更优
    if (bestPlayScore <= 2) score += 1;

    // 残局不推荐过牌
    if (situation.isLastTrick) score -= 2;

    return score;
  }

  /**
   * 过牌的理由
   */
  static generatePassReasons(analysis, situation, gameState, hand, validPlays) {
    const reasons = [];
    // 队友出的牌，让队友继续
    if (situation.isPartnerLast) {
      reasons.push('队友出了较大的牌型，你没必须压队友，放行让队友继续出牌更合理');
    }
    if (analysis.bombCount >= 2) {
      reasons.push(`你还有${analysis.bombCount}个炸弹可用，现在消耗掉不划算，建议保存实力到后期冲刺`);
    }
    if (analysis.pairCount + analysis.tripletCount >= 3) {
      reasons.push('你的手牌结构很好（对子、三同张数量充足），不需要用炸弹强行抢出牌权');
    }
    if (gameState.lastCombo && isBombType(gameState.lastCombo.combo) && !situation.isPartnerLast) {
      reasons.push('对方正在用炸弹争夺出牌权，让他们继续互相消耗，你坐收渔利');
    }
    if (reasons.length === 0) {
      reasons.push('当前没有特别好的出牌方案，过牌等待更好的时机');
    }
    return reasons;
  }

  /**
   * 获取方案标签
   */
  static getPlayLabel(play, rank, analysis, situation) {
    const combo = play.combo;
    const comboTypeNames = {
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

    const typeName = comboTypeNames[combo.type] || combo.type;
    const rankName = RANK_NAMES[combo.mainRank] || combo.mainRank;
    const desc = play.cards.map(c => cardDisplayName(c)).join(' ');

    if (rank === 0) {
      return `⭐ 最佳推荐：${typeName} [${rankName}]`;
    } else if (rank === 1) {
      return `🔄 备选方案：${typeName} [${rankName}]`;
    } else {
      return `📋 其它考虑：${typeName} [${rankName}]`;
    }
  }

  /**
   * 生成自然语言理由
   */
  static generateReasons(play, analysis, situation, playerId, gameState, rank) {
    const reasons = [];
    const combo = play.combo;
    const typeName = {
      'single': '单张', 'pair': '对子', 'triplet': '三同张',
      'threeWithTwo': '三带二', 'straight': '顺子', 'straightFlush': '同花顺',
      'bomb': '炸弹', 'pairStraight': '三连对', 'tripletStraight': '钢板',
      'jokerBomb': '火箭'
    }[combo.type] || combo.type;
    
    const rankName = RANK_NAMES[combo.mainRank] || combo.mainRank;
    const lastCombo = gameState.lastCombo;

    // === 理由1：牌型结构分析 ===
    if (analysis.singleCount <= 2) {
      reasons.push(`你的手牌结构很健康，只有${analysis.singleCount}个单张，出${typeName}可以继续保持牌型优势`);
    } else if (analysis.singleCount >= 5) {
      if (['single', 'pair'].includes(combo.type)) {
        reasons.push(`你的手牌中单张偏多（${analysis.singleCount}个），出${typeName}有利于慢慢减少散牌`);
      } else {
        reasons.push(`你的手牌单张较多（${analysis.singleCount}个），建议先处理散牌再出组合`);
      }
    }

    if (combo.type === 'single' && analysis.pairCount >= 3) {
      reasons.push(`你有${analysis.pairCount}个对子和${analysis.tripletCount}个三同张，牌型组合丰富，出小单张试探对手是合理选择`);
    }

    // === 理由2：炸弹和控牌 ===
    if (analysis.bombCount >= 2) {
      reasons.push(`你手握${analysis.bombCount}个炸弹，控牌能力很强，可以大胆出主动牌型，对手不敢轻易用炸弹压你`);
    } else if (analysis.bombCount === 1) {
      if (isBombType(combo)) {
        reasons.push(`你只有1个炸弹，现在用掉后后续可能失去控牌权，建议谨慎使用`);
      } else {
        reasons.push(`你还有1个炸弹作为后手，出${typeName}被压后还有机会用炸弹夺回牌权`);
      }
    } else if (analysis.bombCount === 0) {
      if (['bomb', 'straightFlush', 'jokerBomb'].includes(combo.type)) {
        reasons.push(`你没有炸弹，出常规牌型更稳妥`);
      } else {
        reasons.push(`你没有炸弹，控牌能力有限，建议不要在单张上浪费大牌`);
      }
    }

    // === 理由3：局面分析 ===
    if (situation.phase === 'early') {
      reasons.push(`游戏处于早期阶段（已出约${Math.round((108 - Object.values(situation.cardCounts).reduce((a,b) => a+b, 0)) / 108 * 100)}%），不宜过早暴露大牌`);
    } else if (situation.phase === 'late') {
      reasons.push(`已进入末盘阶段，需要加快出牌节奏，有机会就尽量走牌`);
    }

    // 队友情况
    if (situation.partnerCards <= 5 && !situation.isPartnerLast) {
      reasons.push(`你的队友只剩${situation.partnerCards}张牌，接近出完，主动出牌为你方创造优势`);
    } else if (situation.partnerCards >= 20) {
      reasons.push(`你的队友还有${situation.partnerCards}张牌，需要你多承担进攻任务`);
    }

    // 对手情况
    if (situation.opp1Cards <= 5) {
      reasons.push(`电脑A只剩${situation.opp1Cards}张牌，要注意他随时可能出完`);
    }
    if (situation.opp2Cards <= 5) {
      reasons.push(`电脑B只剩${situation.opp2Cards}张牌，要警惕他的冲刺`);
    }

    // === 理由4：具体出牌理由 ===
    if (combo.type === 'single') {
      if (combo.mainRank <= 6) {
        reasons.push(`出小牌${rankName}试探对手的牌力，为后续大牌铺路`);
      } else if (combo.mainRank >= 12) {
        reasons.push(`${rankName}是较大的单张，出这张牌可以试探对手是否有更大的牌`);
      }
    }

    if (combo.type === 'pair' && combo.mainRank <= 6) {
      reasons.push(`出小对子${rankName}是常见的开局方式，既不会暴露大牌，又能试探对手的对子分布`);
    }

    if (combo.type === 'straight' || combo.type === 'straightFlush') {
      reasons.push(`出${typeName}可以一次性走5张牌，大大加速出牌进度`);
    }

    if (combo.type === 'bomb') {
      reasons.push(`使用${combo.cards.length}张${rankName}炸弹，可以立即夺回出牌权`);
    }

    // === 理由5：出牌风险提示 ===
    if (combo.type === 'single' && combo.mainRank === 15) {
      reasons.push(`⚠️ 2是非常大的单张，只有大小王能压，出掉它意味着你失去了一个重要的控牌工具`);
    }

    if (combo.type === 'single' && combo.mainRank >= 16) {
      // 小王/大王 → 检查对方是否还有更大的王
      if (combo.mainRank === 16 && situation.bigJokerRemaining > 0) {
        reasons.push(`⚠️ 小王虽然很大，但对方还有${situation.bigJokerRemaining}张大王未出，出小王不一定能拿回出牌权`);
      } else {
        reasons.push(`⚠️ ${rankName}是全场最大的单张，出掉后对手如果不管，你后续很难再拿到出牌权`);
      }
    }

    if (analysis.wildCount > 0 && play.cards.some(c => c.isWild)) {
      reasons.push(`⚠️ 用逢人配（级牌）出${typeName}，虽然现在有用，但损失了万能配牌的灵活性`);
    }

    // 如果理由太少，补充
    if (reasons.length < 2) {
      if (isBombType(combo)) {
        reasons.push(`使用炸弹是在局面被动时夺权的最强手段`);
      } else if (situation.isLead) {
        reasons.push(`你现在是先手，出什么牌型都可以，选择最有利于后续出牌的组合`);
      } else if (lastCombo) {
        const lastType = {
          'single': '单张', 'pair': '对子', 'triplet': '三同张',
          'threeWithTwo': '三带二', 'straight': '顺子', 'bomb': '炸弹'
        }[lastCombo.combo.type] || lastCombo.combo.type;
        reasons.push(`上家出了${lastType}，你用同类型的${typeName}可以压住${lastType}`);
      }
    }

    // 去重
    return [...new Set(reasons)];
  }
}

// 导出
window.Advisor = Advisor;
