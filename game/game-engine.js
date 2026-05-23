/**
 * 掼蛋高手练功房 - 游戏引擎
 * 卡牌模型、牌型检测、回合管理、游戏状态机
 */

// ====== 常量定义 ======

const SUITS = ['♠', '♥', '♣', '♦'];
const SUIT_NAMES = { '♠': '黑桃', '♥': '红桃', '♣': '梅花', '♦': '方块' };

// 牌面值 → 内部数值映射（用于比较）
const RANK_VALUES = {
  '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
  'J': 11, 'Q': 12, 'K': 13, 'A': 14, '2': 15,
  '小王': 16, '大王': 17
};

const RANK_NAMES = {};
for (const [k, v] of Object.entries(RANK_VALUES)) RANK_NAMES[v] = k;

// 炸弹等级（由弱到强）
const BOMB_TIER = {
  'bomb4': 1,
  'bomb5': 2,
  'bomb6': 3,
  'bomb7': 4,
  'bomb8': 5,
  'straightFlush': 6,
  'jokerBomb': 7
};

function getBombTier(combo) {
  if (combo.type === 'jokerBomb') return BOMB_TIER.jokerBomb;
  if (combo.type === 'straightFlush') return BOMB_TIER.straightFlush;
  if (combo.type === 'bomb') {
    const len = combo.cards.length;
    if (len === 4) return BOMB_TIER.bomb4;
    if (len === 5) return BOMB_TIER.bomb5;
    if (len === 6) return BOMB_TIER.bomb6;
    if (len === 7) return BOMB_TIER.bomb7;
    if (len === 8) return BOMB_TIER.bomb8;
    return -1;
  }
  return -1;
}

// ====== 卡牌工具 ======

function createCard(suit, rankName, isWild) {
  return {
    id: suit + rankName + '_' + Math.random().toString(36).slice(2, 6),
    suit,
    rankName,
    rankValue: RANK_VALUES[rankName],
    isWild: !!isWild
  };
}

function cardDisplayName(card) {
  if (card.suit === 'joker') return card.rankName;
  return card.rankName + card.suit;
}

function sortCards(cards) {
  return [...cards].sort((a, b) => {
    if (a.rankValue !== b.rankValue) return a.rankValue - b.rankValue;
    return SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit);
  });
}

function sortCardsDisplay(cards) {
  // 按点数从大到小、花色排序，适合展示
  return [...cards].sort((a, b) => {
    if (a.rankValue !== b.rankValue) return b.rankValue - a.rankValue;
    return SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit);
  });
}

// ====== 牌桌 ======

function createDeck(levelRankValue) {
  const deck = [];
  const rankNames = Object.keys(RANK_VALUES).filter(k => k !== '小王' && k !== '大王');
  // 2副牌
  for (let copy = 0; copy < 2; copy++) {
    for (const suit of SUITS) {
      for (const rankName of rankNames) {
        const rv = RANK_VALUES[rankName];
        const isWild = (rv === levelRankValue && suit === '♥');
        deck.push(createCard(suit, rankName, isWild));
      }
    }
    // 2张王 per deck
    deck.push(createCard('joker', '小王', false));
    deck.push(createCard('joker', '大王', false));
  }
  return deck;
}

function shuffleDeck(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function dealCards(levelRankValue) {
  const deck = shuffleDeck(createDeck(levelRankValue));
  const hands = [[], [], [], []];
  for (let i = 0; i < 108; i++) {
    hands[i % 4].push(deck[i]);
  }
  // 对手牌排序
  for (let i = 0; i < 4; i++) {
    hands[i] = sortCards(hands[i]);
  }
  return hands;
}

// ====== 牌型检测 ======

/**
 * 检测一组卡牌形成什么牌型
 * @param {Array} cards - 卡牌数组
 * @param {number} levelRankValue - 当前级牌的数值
 * @returns {object|null} { type, mainRank, length, cards, subRank?, description? }
 */
function detectCombo(cards, levelRankValue) {
  if (!cards || cards.length === 0) return null;
  const n = cards.length;
  const sorted = sortCards(cards);
  const wilds = sorted.filter(c => c.isWild);
  const normals = sorted.filter(c => !c.isWild);
  const w = wilds.length;

  // --- 单张 ---
  if (n === 1) {
    const rv = sorted[0].rankValue;
    return { type: 'single', mainRank: rv, length: 1, cards: sorted, level: 1 };
  }

  // 统计非王牌的各点数数量
  const normalsNoJoker = normals.filter(c => c.rankValue < 16);
  const jokerCards = normals.filter(c => c.rankValue >= 16);

  // 统计点数频率（只算非王）
  const rankCount = {};
  for (const c of normalsNoJoker) {
    rankCount[c.rankValue] = (rankCount[c.rankValue] || 0) + 1;
  }
  const uniqueRanks = Object.keys(rankCount).map(Number).sort((a, b) => a - b);

  // --- 对子 ---
  if (n === 2) {
    // 纯对子
    if (w === 0 && normalsNoJoker.length === 2 && uniqueRanks.length === 1 && rankCount[uniqueRanks[0]] === 2) {
      return { type: 'pair', mainRank: uniqueRanks[0], length: 2, cards: sorted, level: 2 };
    }
    // 1个逢人配 + 1张普通牌 = 对子
    if (w === 1 && normalsNoJoker.length === 1) {
      return { type: 'pair', mainRank: normalsNoJoker[0].rankValue, length: 2, cards: sorted, level: 2 };
    }
    // 2个逢人配
    if (w === 2) {
      return { type: 'pair', mainRank: levelRankValue, length: 2, cards: sorted, level: 2 };
    }
    // 2个王
    if (normals.length === 2 && jokerCards.length === 2) {
      const jokerBig = jokerCards.some(c => c.rankName === '大王');
      const jokerSmall = jokerCards.some(c => c.rankName === '小王');
      if (jokerBig && jokerSmall) {
        // 大小王不能组成对子（火箭最小单位是4张）
        return null;
      }
      return { type: 'pair', mainRank: jokerCards[0].rankValue, length: 2, cards: sorted, level: 2 };
    }
  }

  // --- 三同张 ---
  if (n === 3) {
    // 3张相同
    if (w === 0 && uniqueRanks.length === 1 && rankCount[uniqueRanks[0]] === 3) {
      return { type: 'triplet', mainRank: uniqueRanks[0], length: 3, cards: sorted, level: 3 };
    }
    // 2张同点 + 1逢人配
    if (w === 1 && uniqueRanks.length === 1 && rankCount[uniqueRanks[0]] === 2) {
      return { type: 'triplet', mainRank: uniqueRanks[0], length: 3, cards: sorted, level: 3 };
    }
    // 1张 + 2逢人配
    if (w === 2 && uniqueRanks.length === 1 && rankCount[uniqueRanks[0]] === 1) {
      return { type: 'triplet', mainRank: uniqueRanks[0], length: 3, cards: sorted, level: 3 };
    }
    // 3逢人配
    if (w === 3) {
      return { type: 'triplet', mainRank: levelRankValue, length: 3, cards: sorted, level: 3 };
    }
  }

  // --- 三带二 ---
  if (n === 5) {
    // 需要：3张同点 + 2张同点
    if (w === 0 && uniqueRanks.length === 2) {
      const r1 = uniqueRanks[0], r2 = uniqueRanks[1];
      const c1 = rankCount[r1], c2 = rankCount[r2];
      if ((c1 === 3 && c2 === 2) || (c1 === 2 && c2 === 3)) {
        const mainRank = c1 === 3 ? r1 : r2;
        const subRank = c1 === 2 ? r1 : r2;
        return { type: 'threeWithTwo', mainRank, subRank, length: 5, cards: sorted, level: 5 };
      }
    }
    // 有逢人配的情况（多个组合需要尝试）
    // 简化处理：检查能否形成三带二
    const all = normalsNoJoker;
    const wRemaining = w;
    // 计算所有牌的点数（含逢人配可补成任意点数）
    // 核心：三张（可含逢人配）+ 一对（可含逢人配）
    if (wRemaining >= 0) {
      const combo = tryDetectThreeWithTwo(all, wRemaining, levelRankValue);
      if (combo) {
        combo.cards = sorted;
        combo.length = 5;
        combo.level = 5;
        return combo;
      }
    }
  }

  // --- 顺子（5张连续）---
  if (n === 5 && w + normalsNoJoker.length === 5 && jokerCards.length === 0) {
    const result = tryDetectStraight(normalsNoJoker, w, levelRankValue);
    if (result) return { ...result, cards: sorted, length: 5, level: 5 };
  }

  // --- 同花顺（5张同花色连续）---
  if (n === 5 && jokerCards.length === 0) {
    // 检查是否同花色
    const allSameSuit = (() => {
      // 逢人配可视为任意花色
      const nonWildSuits = normals.map(c => c.suit);
      if (nonWildSuits.length === 0) return true;
      return nonWildSuits.every(s => s === nonWildSuits[0]);
    })();
    if (allSameSuit) {
      const result = tryDetectStraight(normalsNoJoker, w, levelRankValue);
      if (result) {
        return { ...result, type: 'straightFlush', cards: sorted, length: 5, level: 5 };
      }
    }
  }

  // --- 炸弹（4张以上同点数）---
  if (n >= 4 && n <= 8 && jokerCards.length === 0) {
    const result = tryDetectBomb(normalsNoJoker, w, n, levelRankValue);
    if (result) return { ...result, cards: sorted, length: n, level: n };
  }

  // --- 三连对（3个连续对子，6张）---
  if (n === 6 && jokerCards.length === 0) {
    const result = tryDetectPairStraight(normalsNoJoker, w, levelRankValue);
    if (result) return { ...result, cards: sorted, length: 6, level: 6 };
  }

  // --- 钢板/三同连（2个连续三同张，6张）---
  if (n === 6 && jokerCards.length === 0) {
    const result = tryDetectTripletStraight(normalsNoJoker, w, levelRankValue);
    if (result) return { ...result, cards: sorted, length: 6, level: 6 };
  }

  // --- 火箭（4张王）---
  if (n === 4 && w === 0 && jokerCards.length === 4) {
    return { type: 'jokerBomb', mainRank: 20, subType: 'rocket', length: 4, cards: sorted, level: 99 };
  }

  return null;
}

// ====== 牌型检测辅助函数 ======

function tryDetectStraight(normals, wilds, levelRankValue) {
  // 顺子排除2和大小王
  const validRanks = [3,4,5,6,7,8,9,10,11,12,13,14]; // 3-A
  const normalRanks = normals.map(c => c.rankValue).filter(r => validRanks.includes(r));
  const uniqueNormalRanks = [...new Set(normalRanks)].sort((a,b) => a-b);
  const w = wilds;

  if (uniqueNormalRanks.length + w < 5) return null;
  if (uniqueNormalRanks.length === 0 && w >= 5) {
    // 纯逢人配顺子 → 取可能的最高顺子（10-J-Q-K-A）
    return { type: 'straight', mainRank: 14, subType: 'wild' };
  }

  // 尝试每个可能的起始点（3-10）
  for (let start = 3; start <= 10; start++) {
    let missing = 0;
    for (let r = start; r < start + 5; r++) {
      if (!uniqueNormalRanks.includes(r)) missing++;
    }
    if (missing <= w) {
      return { type: 'straight', mainRank: start + 4 };
    }
  }
  return null;
}

function tryDetectThreeWithTwo(normals, wilds, levelRankValue) {
  const rankCount = {};
  for (const c of normals) {
    rankCount[c.rankValue] = (rankCount[c.rankValue] || 0) + 1;
  }
  const ranks = Object.keys(rankCount).map(Number).sort((a,b) => a-b);
  let remainingWilds = wilds;

  // 找能形成三同的张数
  let threeRank = null;
  let pairRank = null;

  for (const r of ranks) {
    const need = 3 - rankCount[r];
    if (need <= 0) {
      threeRank = r;
      break;
    } else if (need <= remainingWilds) {
      // 可以用逢人配补齐
      if (threeRank === null) {
        threeRank = r;
        remainingWilds -= need;
      }
    }
  }

  if (threeRank === null) return null;

  // 找对子
  for (const r of ranks) {
    if (r === threeRank) continue;
    const need = 2 - rankCount[r];
    if (need <= 0) {
      pairRank = r;
      break;
    } else if (need <= remainingWilds) {
      pairRank = r;
      remainingWilds -= need;
      break;
    }
  }

  // 如果非王牌不够，用逢人配自己做
  if (pairRank === null && remainingWilds >= 2) {
    pairRank = levelRankValue;
  }

  if (threeRank !== null && pairRank !== null) {
    return { type: 'threeWithTwo', mainRank: threeRank, subRank: pairRank };
  }

  return null;
}

function tryDetectBomb(normals, wilds, totalLen, levelRankValue) {
  const rankCount = {};
  for (const c of normals) {
    rankCount[c.rankValue] = (rankCount[c.rankValue] || 0) + 1;
  }
  const ranks = Object.keys(rankCount).map(Number).sort((a,b) => b-a);
  const w = wilds;

  for (const r of ranks) {
    const count = rankCount[r];
    // 用逢人配补齐到totalLen张
    const need = totalLen - count;
    if (need >= 0 && need <= w) {
      return { type: 'bomb', mainRank: r };
    }
  }

  // 纯逢人配炸弹
  if (w >= totalLen) {
    return { type: 'bomb', mainRank: levelRankValue };
  }

  return null;
}

function tryDetectPairStraight(normals, wilds, levelRankValue) {
  // 三连对 = 3个连续对子，6张
  const rankCount = {};
  for (const c of normals) {
    rankCount[c.rankValue] = (rankCount[c.rankValue] || 0) + 1;
  }
  const validRanks = [3,4,5,6,7,8,9,10,11,12,13,14];
  const w = wilds;

  for (let start = 3; start <= 12; start++) {
    let neededWilds = 0;
    let valid = true;
    for (let r = start; r < start + 3; r++) {
      if (!validRanks.includes(r)) { valid = false; break; }
      const cnt = rankCount[r] || 0;
      const need = 2 - cnt;
      if (need > 0) neededWilds += need;
    }
    if (valid && neededWilds <= w) {
      return { type: 'pairStraight', mainRank: start + 2 };
    }
  }
  return null;
}

function tryDetectTripletStraight(normals, wilds, levelRankValue) {
  // 钢板 = 2个连续三同张，6张
  const rankCount = {};
  for (const c of normals) {
    rankCount[c.rankValue] = (rankCount[c.rankValue] || 0) + 1;
  }
  const validRanks = [3,4,5,6,7,8,9,10,11,12,13,14];
  const w = wilds;

  for (let start = 3; start <= 13; start++) {
    let neededWilds = 0;
    let valid = true;
    for (let r = start; r < start + 2; r++) {
      if (!validRanks.includes(r)) { valid = false; break; }
      const cnt = rankCount[r] || 0;
      const need = 3 - cnt;
      if (need > 0) neededWilds += need;
    }
    if (valid && neededWilds <= w) {
      return { type: 'tripletStraight', mainRank: start + 1 };
    }
  }
  return null;
}

// ====== 牌型比较 ======

/**
 * 判断 combo 能否压过 lastCombo
 */
function canBeat(combo, lastCombo) {
  if (!lastCombo) return true; // 先手可以随便出
  
  const comboIsBomb = isBombType(combo);
  const lastIsBomb = isBombType(lastCombo);

  // 炸弹压非炸弹
  if (comboIsBomb && !lastIsBomb) return true;
  // 非炸弹不能压炸弹
  if (!comboIsBomb && lastIsBomb) return false;

  // 两者都是炸弹
  if (comboIsBomb && lastIsBomb) {
    return compareBombs(combo, lastCombo);
  }

  // 两者都不是炸弹：必须同类型、同长度
  if (combo.type !== lastCombo.type) return false;
  if (combo.length !== lastCombo.length) return false;
  
  // 三带二需要额外比较主牌
  if (combo.type === 'threeWithTwo') {
    return combo.mainRank > lastCombo.mainRank;
  }

  return combo.mainRank > lastCombo.mainRank;
}

function isBombType(combo) {
  return ['bomb', 'straightFlush', 'jokerBomb'].includes(combo.type);
}

function compareBombs(a, b) {
  const ta = getBombTier(a);
  const tb = getBombTier(b);
  if (ta !== tb) return ta > tb;
  // 同等级炸弹比主牌大小
  if (a.type === 'bomb' && b.type === 'bomb' && a.cards.length === b.cards.length) {
    return a.mainRank > b.mainRank;
  }
  if (a.type === 'straightFlush' && b.type === 'straightFlush') {
    return a.mainRank > b.mainRank;
  }
  // 同等级的pairStraight/tripletStraight比主牌
  if (a.type === b.type && ['pairStraight', 'tripletStraight'].includes(a.type)) {
    return a.mainRank > b.mainRank;
  }
  return true; // 不同类型同等级，一般不出现
}

// ====== 枚举所有可行出牌（基于按点数分组的优化版本）=====

/**
 * 获取一名玩家当前的所有合法出牌方案
 * @param {Array} hand - 玩家手牌
 * @param {object|null} lastCombo - 上家的牌型
 * @param {number} levelRankValue - 当前级牌数值
 * @returns {Array} 所有合法出牌方案 [{ cards, combo }]
 */
function getAllValidPlays(hand, lastCombo, levelRankValue) {
  const allCombos = enumerateAllCombos(hand, levelRankValue);
  if (!lastCombo) return allCombos; // 先手返回所有

  // 后手：只能出能压过的
  const results = [];
  for (const play of allCombos) {
    if (canBeat(play.combo, lastCombo)) {
      results.push(play);
    }
  }
  return results;
}

/**
 * 基于点数分组的枚举（高效）
 */
function enumerateAllCombos(hand, levelRankValue) {
  const results = [];
  if (hand.length === 0) return results;

  // 按点数分组
  const rankGroups = {}; // rankValue -> [cards]
  const wilds = [];
  for (const c of hand) {
    if (c.isWild) wilds.push(c);
    else {
      if (!rankGroups[c.rankValue]) rankGroups[c.rankValue] = [];
      rankGroups[c.rankValue].push(c);
    }
  }
  const ranks = Object.keys(rankGroups).map(Number).sort((a,b) => a-b);
  const w = wilds.length;

  // ----- 单张 -----
  for (const c of hand) {
    results.push({ cards: [c], combo: { type: 'single', mainRank: c.rankValue, length: 1, cards: [c], level: 1 } });
  }

  // ----- 对子 -----
  // 同点数对子
  for (const r of ranks) {
    const cards = rankGroups[r];
    if (cards.length >= 2) {
      const pairCards = [cards[0], cards[1]];
      results.push({ cards: pairCards, combo: { type: 'pair', mainRank: r, length: 2, cards: pairCards, level: 2 } });
    }
    // 1张同点 + 逢人配
    if (cards.length >= 1 && w >= 1) {
      const pairCards = [cards[0], wilds[0]];
      results.push({ cards: pairCards, combo: { type: 'pair', mainRank: r, length: 2, cards: pairCards, level: 2 } });
    }
  }
  // 2个逢人配
  if (w >= 2) {
    results.push({ cards: [wilds[0], wilds[1]], combo: { type: 'pair', mainRank: levelRankValue, length: 2, cards: [wilds[0], wilds[1]], level: 2 } });
  }

  // ----- 三同张 -----
  for (const r of ranks) {
    const cards = rankGroups[r];
    if (cards.length >= 3) {
      const tripCards = [cards[0], cards[1], cards[2]];
      results.push({ cards: tripCards, combo: { type: 'triplet', mainRank: r, length: 3, cards: tripCards, level: 3 } });
    }
    if (cards.length >= 2 && w >= 1) {
      const tripCards = [cards[0], cards[1], wilds[0]];
      results.push({ cards: tripCards, combo: { type: 'triplet', mainRank: r, length: 3, cards: tripCards, level: 3 } });
    }
    if (cards.length >= 1 && w >= 2) {
      const tripCards = [cards[0], wilds[0], wilds[1]];
      results.push({ cards: tripCards, combo: { type: 'triplet', mainRank: r, length: 3, cards: tripCards, level: 3 } });
    }
  }
  if (w >= 3) {
    results.push({ cards: wilds.slice(0, 3), combo: { type: 'triplet', mainRank: levelRankValue, length: 3, cards: wilds.slice(0, 3), level: 3 } });
  }

  // ----- 三带二（5张）-----
  for (const threeR of ranks) {
    const threeCards = rankGroups[threeR];
    const threeNeed = 3 - threeCards.length;
    if (threeNeed > w) continue;
    const threeWildUsed = Math.max(0, threeNeed);
    const remainingWildsForPair = w - threeWildUsed;

    for (const pairR of ranks) {
      if (pairR === threeR) continue;
      const pairCards = rankGroups[pairR];
      const pairNeed = 2 - pairCards.length;
      if (pairNeed >= 0 && pairNeed <= remainingWildsForPair) {
        // Build the actual cards
        const used = [];
        const threeTake = threeCards.slice(0, 3);
        const pairTake = pairCards.slice(0, 2);
        used.push(...threeTake);
        used.push(...pairTake);
        
        let wildIdx = 0;
        while (used.length < 5 && wildIdx < w) {
          if (!used.includes(wilds[wildIdx])) used.push(wilds[wildIdx]);
          wildIdx++;
        }
        if (used.length === 5) {
          results.push({
            cards: used,
            combo: { type: 'threeWithTwo', mainRank: threeR, subRank: pairR, length: 5, cards: used, level: 5 }
          });
        }
      }
    }
    // 对子由逢人配组成
    if (remainingWildsForPair >= 2) {
      const threeTake = threeCards.slice(0, 3);
      const used = [...threeTake, wilds[0], wilds[1]];
      results.push({
        cards: used,
        combo: { type: 'threeWithTwo', mainRank: threeR, subRank: levelRankValue, length: 5, cards: used, level: 5 }
      });
    }
  }

  // ----- 顺子和同花顺（5张）-----
  addStraightCombos(results, rankGroups, wilds, w, ranks, levelRankValue);

  // ----- 炸弹（4-8张）-----
  for (const r of ranks) {
    const cards = rankGroups[r];
    const total = cards.length + w;
    for (let size = 4; size <= Math.min(8, total); size++) {
      const needWild = size - cards.length;
      if (needWild >= 0 && needWild <= w) {
        const take = cards.slice(0, Math.min(cards.length, size));
        const wildTake = wilds.slice(0, needWild);
        const bombCards = [...take, ...wildTake];
        results.push({
          cards: bombCards,
          combo: { type: 'bomb', mainRank: r, length: size, cards: bombCards, level: size }
        });
      }
    }
  }

  // ----- 三连对（6张）-----
  for (let start = 3; start <= 12; start++) {
    let neededWilds = 0;
    let segments = [];
    for (let r = start; r < start + 3; r++) {
      const rCards = rankGroups[r] || [];
      const have = rCards.length;
      const need = 2 - have;
      if (need > 0) neededWilds += need;
      segments.push({ rank: r, cards: rCards.slice(0, 2), need: Math.max(0, need) });
    }
    if (neededWilds <= w) {
      const usedCards = [];
      let wildIdx = 0;
      for (const seg of segments) {
        usedCards.push(...seg.cards);
        for (let i = 0; i < seg.need && wildIdx < w; i++) {
          usedCards.push(wilds[wildIdx++]);
        }
      }
      if (usedCards.length === 6) {
        results.push({
          cards: usedCards,
          combo: { type: 'pairStraight', mainRank: start + 2, length: 6, cards: usedCards, level: 6 }
        });
      }
    }
  }

  // ----- 钢板/三同连（6张）-----
  for (let start = 3; start <= 13; start++) {
    let neededWilds = 0;
    let segments = [];
    for (let r = start; r < start + 2; r++) {
      const rCards = rankGroups[r] || [];
      const have = rCards.length;
      const need = 3 - have;
      if (need > 0) neededWilds += need;
      segments.push({ rank: r, cards: rCards.slice(0, 3), need: Math.max(0, need) });
    }
    if (neededWilds <= w) {
      const usedCards = [];
      let wildIdx = 0;
      for (const seg of segments) {
        usedCards.push(...seg.cards);
        for (let i = 0; i < seg.need && wildIdx < w; i++) {
          usedCards.push(wilds[wildIdx++]);
        }
      }
      if (usedCards.length === 6) {
        results.push({
          cards: usedCards,
          combo: { type: 'tripletStraight', mainRank: start + 1, length: 6, cards: usedCards, level: 6 }
        });
      }
    }
  }

  // ----- 火箭（4张王）-----
  const jokers = hand.filter(c => c.suit === 'joker');
  if (jokers.length === 4) {
    results.push({
      cards: jokers.slice(0, 4),
      combo: { type: 'jokerBomb', mainRank: 20, subType: 'rocket', length: 4, cards: jokers.slice(0, 4), level: 99 }
    });
  }

  return results;
}

/**
 * 添加顺子和同花顺组合
 */
function addStraightCombos(results, rankGroups, wilds, w, ranks, levelRankValue) {
  const validRanksSet = new Set(ranks);
  
  for (let start = 3; start <= 10; start++) {
    let missing = 0;
    let maxRank = start;
    for (let r = start; r < start + 5; r++) {
      if (!validRanksSet.has(r)) missing++;
      else maxRank = r;
    }
    if (missing > w) continue;

    // 构建顺子卡牌
    const straightCards = [];
    let wildIdx = 0;
    for (let r = start; r < start + 5; r++) {
      if (rankGroups[r] && rankGroups[r].length > 0) {
        straightCards.push(rankGroups[r][0]);
      } else if (wildIdx < w) {
        straightCards.push(wilds[wildIdx++]);
      }
    }
    if (straightCards.length === 5) {
      results.push({
        cards: straightCards,
        combo: { type: 'straight', mainRank: maxRank, length: 5, cards: straightCards, level: 5 }
      });

      // 检查同花顺（所有牌同花色或逢人配）
      const nonWildInStraight = straightCards.filter(c => !c.isWild);
      if (nonWildInStraight.length > 0) {
        const firstSuit = nonWildInStraight[0].suit;
        const allSameSuit = nonWildInStraight.every(c => c.suit === firstSuit);
        if (allSameSuit) {
          results.push({
            cards: straightCards,
            combo: { type: 'straightFlush', mainRank: maxRank, length: 5, cards: straightCards, level: 5 }
          });
        }
      } else if (nonWildInStraight.length === 0 && wilds.length >= 5) {
        // 纯逢人配同花顺
        results.push({
          cards: straightCards,
          combo: { type: 'straightFlush', mainRank: maxRank, length: 5, cards: straightCards, level: 5 }
        });
      }
    }
  }
}

function hasDuplicateResult(results, combo, length) {
  // 粗略去重：检查是否有同类型、同rank、同长度的结果
  for (const r of results) {
    if (r.combo.type === combo.type && 
        r.combo.length === length &&
        r.combo.mainRank === combo.mainRank &&
        (!r.combo.subRank || r.combo.subRank === combo.subRank)) {
      // 进一步检查cards是否相同（避免同一组合的不同排列）
      if (r.cards.length === combo.cards.length) {
        const rIds = r.cards.map(c => c.id).sort().join(',');
        const cIds = combo.cards.map(c => c.id).sort().join(',');
        if (rIds === cIds) return true;
      }
    }
  }
  return false;
}

// ====== 游戏类 ======

class GuandanGame {
  constructor() {
    this.reset();
  }

  reset() {
    this.level = 2;
    this.levelRankValue = RANK_VALUES[this.level];
    this.hands = [[], [], [], []];
    this.teams = [[0, 2], [1, 3]];
    this.currentPlayer = 0;
    this.lastCombo = null;
    this.lastComboPlayer = -1;
    this.passCount = 0;
    this.trickHistory = [];
    this.gameOver = false;
    this.teamScores = [0, 0];
    this.finishOrder = [];
    this.phase = 'idle';
    this.playHistory = [];
    this.currentTrick = [];

    this.players = [
      { name: '你', isHuman: true, cardCount: 0, isFinished: false },
      { name: '电脑A', isHuman: false, cardCount: 0, isFinished: false, difficulty: 2 },
      { name: '队友', isHuman: false, cardCount: 0, isFinished: false, difficulty: 1 },
      { name: '电脑B', isHuman: false, cardCount: 0, isFinished: false, difficulty: 3 },
    ];
  }

  /**
   * 从保存的状态恢复游戏
   */
  loadState(state) {
    this.reset();
    this.level = state.level || 2;
    this.levelRankValue = state.levelRankValue || 15;
    this.hands = state.hands.map(h => [...h]);
    this.currentPlayer = state.currentPlayer;
    this.lastCombo = state.lastCombo ? JSON.parse(JSON.stringify(state.lastCombo)) : null;
    this.lastComboPlayer = state.lastComboPlayer;
    this.passCount = state.passCount || 0;
    this.gameOver = state.gameOver || false;
    this.teamScores = [...(state.teamScores || [0, 0])];
    this.finishOrder = [...(state.finishOrder || [])];
    this.playHistory = JSON.parse(JSON.stringify(state.playHistory || []));
    this.currentTrick = JSON.parse(JSON.stringify(state.currentTrick || []));
    if (state.players) {
      for (let i = 0; i < 4; i++) {
        if (state.players[i]) {
          this.players[i].cardCount = this.hands[i].length;
          this.players[i].isFinished = this.hands[i].length === 0 || !!(state.players[i].isFinished);
        }
      }
    }
    // 根据 finishOrder 检测游戏是否结束
    const team0Done = this.players[0].isFinished && this.players[2].isFinished;
    const team1Done = this.players[1].isFinished && this.players[3].isFinished;
    if (team0Done || team1Done || this.finishOrder.length >= 3) this.gameOver = true;
    this.phase = 'playing';
  }

  startGame(level = 2) {
    this.reset();
    this.level = level;
    this.levelRankValue = RANK_VALUES[level] || 15; // 默认从2开始
    
    // 重新发牌（级牌改变了逢人配）
    this.hands = dealCards(this.levelRankValue);
    
    for (let i = 0; i < 4; i++) {
      this.players[i].cardCount = 27;
      this.players[i].isFinished = false;
    }
    
    this.gameOver = false;
    this.phase = 'playing';
    
    // 先手：红桃级牌的持有者，或随机
    this.currentPlayer = this.findStarter();
    
    this.lastCombo = null;
    this.lastComboPlayer = -1;
    this.passCount = 0;
    this.trickHistory = [];
    this.finishOrder = [];
    this.playHistory = [];
    this.currentTrick = [];
  }

  findStarter() {
    // 找红桃级牌的持有者
    for (let i = 0; i < 4; i++) {
      for (const card of this.hands[i]) {
        if (card.suit === '♥' && card.isWild) {
          return i;
        }
      }
    }
    // 没找到就随机
    return Math.floor(Math.random() * 4);
  }

  /**
   * 玩家出牌
   * @param {number} playerId
   * @param {Array} cards
   * @returns {object} { success, error?, combo? }
   */
  playCards(playerId, cards) {
    if (this.gameOver || this.phase !== 'playing') {
      return { success: false, error: '游戏已结束' };
    }
    if (this.currentPlayer !== playerId) {
      return { success: false, error: '还没轮到你' };
    }
    if (this.players[playerId].isFinished) {
      return { success: false, error: '该玩家已出完' };
    }

    // 验证这些牌是否在手牌中
    for (const card of cards) {
      if (!this.hands[playerId].find(c => c.id === card.id)) {
        return { success: false, error: '无效的出牌' };
      }
    }

    // 检测牌型
    const combo = detectCombo(cards, this.levelRankValue);
    if (!combo) {
      return { success: false, error: '不构成有效牌型' };
    }

    // 如果能压过或先手
    if (this.lastCombo && !canBeat(combo, this.lastCombo.combo)) {
      return { success: false, error: '出牌不能压过上家' };
    }

    // 执行出牌
    for (const card of cards) {
      const idx = this.hands[playerId].findIndex(c => c.id === card.id);
      if (idx >= 0) this.hands[playerId].splice(idx, 1);
    }
    this.players[playerId].cardCount = this.hands[playerId].length;

    this.lastCombo = { playerId, cards, combo };
    this.lastComboPlayer = playerId;
    this.passCount = 0;

    // 记录本轮出牌
    this.currentTrick.push({ playerId, cards, combo });

    this.playHistory.push({
      playerId,
      playerName: this.players[playerId].name,
      combo,
      cardNames: cards.map(c => cardDisplayName(c))
    });

    // 检查是否出完
    if (this.hands[playerId].length === 0) {
      this.players[playerId].isFinished = true;
      this.finishOrder.push(playerId);
      
      // 一方两队都出完则游戏结束
      const team0Done = this.players[0].isFinished && this.players[2].isFinished;
      const team1Done = this.players[1].isFinished && this.players[3].isFinished;
      if (team0Done || team1Done) {
        this.endGame();
        return { success: true, combo, gameEnded: true };
      }
    }

    // 进入下家
    this.advanceToNextPlayer();
    return { success: true, combo, gameEnded: false };
  }

  /**
   * 过牌
   */
  pass(playerId) {
    if (this.gameOver) return { success: false, error: '游戏已结束' };
    if (this.currentPlayer !== playerId) return { success: false, error: '还没轮到你' };
    if (!this.lastCombo) return { success: false, error: '你是先手，必须出牌' };
    
    this.passCount++;
    this.playHistory.push({
      playerId,
      playerName: this.players[playerId].name,
      action: '过'
    });

    // 检查是否三家连过
    if (this.passCount >= 3) {
      // 上家赢得出牌权，如果上家已出完则队友接风
      this.currentPlayer = this.lastComboPlayer;
      if (this.players[this.currentPlayer].isFinished) {
        // 队友接风：同队玩家
        const partnerId = (this.currentPlayer + 2) % 4;
        this.currentPlayer = this.players[partnerId].isFinished ? 
          this.getNextActivePlayer(this.currentPlayer) : partnerId;
      }
      this.lastCombo = null;
      this.passCount = 0;
      this.currentTrick = [];
      return { success: true, passCount: this.passCount, trickWon: true, winnerId: this.lastComboPlayer };
    }

    this.advanceToNextPlayer();
    // 检查是否自动赢得了出牌权（所有其他人过牌或已完成）
    // 如果赢家已出完，队友接风
    const trickWon = this.isTrickWon();
    if (trickWon && this.players[this.currentPlayer] && this.players[this.currentPlayer].isFinished) {
      const partnerId = (this.currentPlayer + 2) % 4;
      this.currentPlayer = this.players[partnerId].isFinished ?
        this.getNextActivePlayer(this.lastComboPlayer) : partnerId;
    }
    return { success: true, passCount: this.passCount, trickWon };
  }

  getNextActivePlayer(fromPlayer) {
    for (let i = 1; i <= 3; i++) {
      const p = (fromPlayer + i) % 4;
      if (!this.players[p].isFinished) return p;
    }
    return fromPlayer;
  }

  advanceToNextPlayer() {
    let next = this.currentPlayer;
    let attempts = 0;
    do {
      next = (next + 1) % 4;
      attempts++;
    } while (this.players[next].isFinished && attempts < 4);
    
    // 如果都出完了，游戏结束
    if (this.players.every(p => p.isFinished) || 
        (this.players[0].isFinished && this.players[2].isFinished) ||
        (this.players[1].isFinished && this.players[3].isFinished)) {
      this.endGame();
      return;
    }
    
    this.currentPlayer = next;

    // 如果所有其他活跃玩家都已过牌，回到最后出牌者 → 自动赢得出牌权
    if (this.lastCombo && this.passCount >= 2 && next === this.lastComboPlayer) {
      this.lastCombo = null;
      this.passCount = 0;
      this.currentTrick = [];
      // 如果赢家已出完，队友接风
      if (this.players[next].isFinished) {
        const partnerId = (next + 2) % 4;
        this.currentPlayer = this.players[partnerId].isFinished ?
          this.getNextActivePlayer(next) : partnerId;
      }
    }
  }

  /**
   * 检查是否所有其他玩家都已过牌（用于 pass 后判断 trickWon）
   */
  isTrickWon() {
    return !this.lastCombo && this.passCount === 0;
  }

  endGame() {
    this.gameOver = true;
    this.phase = 'finished';
    
    // 计算得分
    // 未出完的玩家排名
    const remaining = [];
    for (let i = 0; i < 4; i++) {
      if (!this.players[i].isFinished) {
        this.finishOrder.push(i);
      }
    }

    // Team 0 = players 0, 2; Team 1 = players 1, 3
    const team0Rank = Math.min(
      this.finishOrder.indexOf(0),
      this.finishOrder.indexOf(2)
    );
    const team1Rank = Math.min(
      this.finishOrder.indexOf(1),
      this.finishOrder.indexOf(3)
    );
    
    // 简单计分：头游+3，二游+2，三游+1，末游+0
    let team0Score = 0, team1Score = 0;
    for (let i = 0; i < 4; i++) {
      const finishIdx = this.finishOrder[i];
      const points = Math.max(0, 3 - i);
      if (finishIdx === 0 || finishIdx === 2) team0Score += points;
      else team1Score += points;
    }

    this.teamScores[0] += team0Score;
    this.teamScores[1] += team1Score;
    
    // 计算下一局的级数
    // 级数顺序: 2,3,4,5,6,7,8,9,10,J,Q,K,A
    const LEVEL_ORDER = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
    const currentLevelIdx = LEVEL_ORDER.indexOf(String(this.level));
    if (team0Score >= team1Score) {
      // 升级
      const nextIdx = Math.min(currentLevelIdx + 1, LEVEL_ORDER.length - 1);
      this.level = LEVEL_ORDER[nextIdx];
    }
    
    return {
      finishOrder: this.finishOrder.map(i => this.players[i].name),
      winner: team0Score >= team1Score ? '你的队伍' : '对方队伍',
      team0Score,
      team1Score
    };
  }

  getPlayerName(playerId) {
    return this.players[playerId].name;
  }

  getTeam(playerId) {
    return playerId % 2;
  }

  isPartner(p1, p2) {
    return (p1 % 2) === (p2 % 2);
  }

  // 获取当前游戏状态的摘要（供AI/Advisor使用）
  getStateSummary() {
    return {
      level: this.level,
      levelRankValue: this.levelRankValue,
      hands: this.hands.map(h => [...h]),
      currentPlayer: this.currentPlayer,
      lastCombo: this.lastCombo ? { ...this.lastCombo } : null,
      lastComboPlayer: this.lastComboPlayer,
      passCount: this.passCount,
      players: this.players.map(p => ({ ...p })),
      finishOrder: [...this.finishOrder],
      gameOver: this.gameOver,
      teamScores: [...this.teamScores],
      playHistory: [...this.playHistory],
      currentTrick: this.currentTrick.map(t => ({ ...t }))
    };
  }
}

// ====== 导出 ======
// 所有函数和类全局可用
window.GuandanGame = GuandanGame;
window.detectCombo = detectCombo;
window.canBeat = canBeat;
window.getAllValidPlays = getAllValidPlays;
window.enumerateAllCombos = enumerateAllCombos;
window.sortCards = sortCards;
window.sortCardsDisplay = sortCardsDisplay;
window.cardDisplayName = cardDisplayName;
window.RANK_VALUES = RANK_VALUES;
window.RANK_NAMES = RANK_NAMES;
window.isBombType = isBombType;
window.dealCards = dealCards;
window.detectCombo = detectCombo;
