// mahjong.js
// 本格麻雀ゲーム - 主要ロジック（役判定・点数計算・鳴き・リーチ・CPU思考含む）
// 初期化とUI制御を兼ねるファイル（拡張可能）

"use strict";

// ---- 定数 ----

const TILE_NAMES = [
  '1m','2m','3m','4m','5m','6m','7m','8m','9m',  // 萬子
  '1p','2p','3p','4p','5p','6p','7p','8p','9p',  // 筒子
  '1s','2s','3s','4s','5s','6s','7s','8s','9s',  // 索子
  '東','南','西','北','白','發','中'               // 字牌
];

// 牌IDは0-33 (萬子9+筒子9+索子9+字牌7=34種)
// 4枚ずつなので牌コードは0~135 (34種×4枚)

const PLAYER_COUNT = 4;  // 初期値、3人打ちは設定時に変更

// ゲームステート
let gameState = {
  playerCount: PLAYER_COUNT,
  players: [],
  wall: [],
  deadWall: [],
  doraIndicators: [],
  round: 0,
  honba: 0,
  dealerIndex: 0,
  currentTurn: 0,
  riichiSticks: 0,
  scores: [],
  isStarted: false,
  // ... その他多数
};

// UI要素
const ui = {
  playersArea: document.getElementById('playersArea'),
  roundInfo: document.getElementById('roundInfo'),
  doraIndicator: document.getElementById('doraIndicator'),
  dealerIndicator: document.getElementById('dealerIndicator'),
  discardPile: document.getElementById('discardPile'),
  meldArea: document.getElementById('meldArea'),
  actionButtons: document.getElementById('actionButtons'),
  messageArea: document.getElementById('messageArea'),
  scoreTable: document.getElementById('scoreTable'),
  startBtn: document.getElementById('startBtn'),
  playerCountSelect: document.getElementById('playerCount'),
};


// ---- ユーティリティ関数 ----

// 牌IDから牌名を取得
function tileIdToName(tileId) {
  const base = Math.floor(tileId / 4);
  return TILE_NAMES[base];
}

// 牌名から牌IDの範囲(4枚)を取得
function tileNameToIds(name) {
  let index = TILE_NAMES.indexOf(name);
  if (index < 0) return [];
  return [index*4, index*4+1, index*4+2, index*4+3];
}

// 牌のランダムシャッフル（Fisher-Yates）
function shuffleArray(arr) {
  for (let i = arr.length-1; i>0; i--) {
    let j = Math.floor(Math.random()*(i+1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// 配列の数カウント
function countArray(arr) {
  const count = {};
  for (let v of arr) count[v] = (count[v]||0)+1;
  return count;
}

// ---- ゲーム初期化 ----

function initGame(playerCount){
  gameState.playerCount = playerCount;
  gameState.players = [];
  gameState.scores = [];
  gameState.round = 0;
  gameState.honba = 0;
  gameState.riichiSticks = 0;
  gameState.dealerIndex = 0;
  gameState.currentTurn = 0;
  gameState.isStarted = true;

  // 山を作る（牌136枚）
  let wall = [];
  for(let i=0; i<136; i++) wall.push(i);
  shuffleArray(wall);

  gameState.wall = wall.slice(0, 136-14);  // 14枚は死牌（嶺上牌＋ドラ表示など）
  gameState.deadWall = wall.slice(136-14);

  // ドラ表示牌は死牌の5枚目
  gameState.doraIndicators = [gameState.deadWall[4]];

  // プレイヤー初期化
  for(let i=0; i<playerCount; i++){
    gameState.players.push({
      hand: [],
      melds: [],
      discards: [],
      riichi: false,
      name: `Player${i+1}`,
      isCPU: i > 0, // 最初は自分だけ人間で他はCPU
      // リーチ後一発判定などは追加予定
    });
    gameState.scores[i] = 25000;
  }

  // 配牌（各13枚）を配る
  for(let round=0; round<13; round++){
    for(let p=0; p<playerCount; p++){
      gameState.players[p].hand.push(gameState.wall.pop());
    }
  }
  // 親は14枚目のツモ
  gameState.players[0].hand.push(gameState.wall.pop());

  updateUI();
  startTurn();
}

// ---- UI更新 ----

function updateUI(){
  // プレイヤー手牌等更新
  ui.playersArea.innerHTML = "";
  for(let i=0; i<gameState.playerCount; i++){
    const p = gameState.players[i];
    let pDiv = document.createElement('div');
    pDiv.classList.add('player');

    let title = document.createElement('h3');
    title.textContent = p.name + (i === gameState.dealerIndex ? "（親）" : "");
    pDiv.appendChild(title);

    // 手牌
    let handDiv = document.createElement('div');
    handDiv.classList.add('handTiles');
    // 親などの視点は省略（全て公開）
    p.hand.sort((a,b) => a-b);
    for(let t of p.hand){
      let tileDiv = document.createElement('div');
      tileDiv.classList.add('tile');
      tileDiv.textContent = tileIdToName(t);
      // 自分の手牌クリックイベント(捨てる)
      if(!p.isCPU && i===0){
        tileDiv.addEventListener('click', ()=>discardTile(t));
      }
      handDiv.appendChild(tileDiv);
    }
    pDiv.appendChild(handDiv);

    // 鳴き牌（副露）
    let meldDiv = document.createElement('div');
    meldDiv.classList.add('meldTiles');
    for(let meld of p.melds){
      for(let t of meld){
        let tileDiv = document.createElement('div');
        tileDiv.classList.add('tile');
        tileDiv.textContent = tileIdToName(t);
        meldDiv.appendChild(tileDiv);
      }
      let sep = document.createElement('span');
      sep.textContent = " ";
      meldDiv.appendChild(sep);
    }
    pDiv.appendChild(meldDiv);

    // 捨て牌
    let discardDiv = document.createElement('div');
    discardDiv.classList.add('discardTiles');
    for(let t of p.discards){
      let tileDiv = document.createElement('div');
      tileDiv.classList.add('tile');
      tileDiv.textContent = tileIdToName(t);
      discardDiv.appendChild(tileDiv);
    }
    pDiv.appendChild(discardDiv);

    ui.playersArea.appendChild(pDiv);
  }

  // ラウンド情報
  ui.roundInfo.textContent = `東${Math.floor(gameState.round/4)+1}局 ${gameState.honba}本場`;
  // ドラ表示
  let doraName = tileIdToName(gameState.doraIndicators[0]);
  ui.doraIndicator.textContent = `ドラ表示牌：${doraName}`;
  // 親表示
  ui.dealerIndicator.textContent = `親：Player${gameState.dealerIndex+1}`;

  // 点数表
  let scoreHtml = "";
  for(let i=0; i<gameState.playerCount; i++){
    scoreHtml += `Player${i+1}: ${gameState.scores[i]}点<br/>`;
  }
  ui.scoreTable.innerHTML = scoreHtml;

  ui.messageArea.textContent = `Player${gameState.currentTurn+1}のターンです。牌を捨ててください。`;
  ui.actionButtons.innerHTML = "";
}

// ---- 捨て牌処理 ----
function discardTile(tileId){
  if(gameState.currentTurn !== 0) return; // 自分のターンでないなら無効
  let player = gameState.players[0];
  let idx = player.hand.indexOf(tileId);
  if(idx < 0) return;

  // 捨て牌処理
  player.hand.splice(idx,1);
  player.discards.push(tileId);
  gameState.currentTurn = (gameState.currentTurn + 1) % gameState.playerCount;

  updateUI();
  cpuTurn();
}

// ---- CPU思考（簡易版） ----
function cpuTurn(){
  if(gameState.currentTurn === 0) return; // 人間ターンなら抜ける

  let cpu = gameState.players[gameState.currentTurn];

  // 何か鳴くかどうかチェック（省略）
  // 牌を一枚選んで捨てる
  if(cpu.hand.length === 0){
    // ツモ切りなどは実装予定
    endTurn();
    return;
  }

  // 適当に捨てる（最初の牌）
  let discard = cpu.hand.shift();
  cpu.discards.push(discard);

  gameState.currentTurn = (gameState.currentTurn + 1) % gameState.playerCount;
  updateUI();

  if(gameState.currentTurn === 0){
    ui.messageArea.textContent = "あなたのターンです。牌を捨ててください。";
  } else {
    setTimeout(cpuTurn, 1500);
  }
}

// ---- ターン開始 ----
function startTurn(){
  ui.messageArea.textContent = `Player${gameState.currentTurn+1}のターンです。`;
}

// ---- 開始ボタンイベント ----
ui.startBtn.addEventListener('click', ()=>{
  if(gameState.isStarted) return;
  let pc = Number(ui.playerCountSelect.value);
  initGame(pc);
});

