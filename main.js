// ========================================
// DOM要素の取得
// ========================================
const video = document.getElementById('mirrorVideo');  // ビデオ表示要素
const startBtn = document.getElementById('startBtn');  // 開始/停止ボタン
const audioToggle = document.getElementById('audioToggle');  // 音声ON/OFFボタン
const delayInput = document.getElementById('delayInput');  // 遅延時間スライダー
const delayValue = document.getElementById('delayValue');  // 遅延時間表示
const statusEl = document.getElementById('status');  // ステータス表示

// ========================================
// グローバル変数
// ========================================
let mediaRecorder;  // メディア録画用オブジェクト
let mediaSource;  // メディアソース（遅延再生用）
let sourceBuffer;  // ソースバッファ（データ格納用）
let isRecording = false;  // 録画中フラグ
let isPlaying = false;  // 再生中フラグ
let delaySeconds = 5;  // 遅延時間（秒）
let stream;  // カメラ/マイクのストリーム

// ========================================
// バッファ管理用変数
// ========================================
let bufferQueue = [];  // バッファ操作のキュー
let isBufferUpdating = false;  // バッファ更新中フラグ
const CHUNK_INTERVAL = 100;  // データチャンクの間隔（ミリ秒）

// ========================================
// デバッグ表示用オーバーレイの作成
// ========================================
const debugEl = document.createElement('div');
debugEl.style.position = 'absolute';  // 絶対位置指定
debugEl.style.top = '60px';  // 上から60px
debugEl.style.left = '20px';  // 左から20px
debugEl.style.color = 'yellow';  // 黄色の文字
debugEl.style.fontFamily = 'monospace';  // 等幅フォント
debugEl.style.fontSize = '12px';  // フォントサイズ
debugEl.style.pointerEvents = 'none';  // マウスイベントを無視
debugEl.style.zIndex = '1000';  // 最前面に表示
document.body.appendChild(debugEl);  // bodyに追加

// ========================================
// サポートされているMIMEタイプを取得
// ========================================
function getSupportedMimeType() {
    // 試行するMIMEタイプのリスト
    const types = [
        'video/webm; codecs="vp8, opus"',
        'video/webm; codecs="vp9, opus"',
        'video/webm; codecs="avc1.42E01E, mp4a.40.2"',
        'video/mp4; codecs="avc1.42E01E, mp4a.40.2"'
    ];
    // MediaRecorderとMediaSourceの両方でサポートされているタイプを探す
    for (const type of types) {
        if (MediaRecorder.isTypeSupported(type) && MediaSource.isTypeSupported(type)) {
            console.log('Using MIME type:', type);
            return type;
        }
    }
    // サポートされているタイプがない場合はデフォルト
    return 'video/webm';
}

let currentMimeType = getSupportedMimeType();  // 使用するMIMEタイプを決定

// ========================================
// イベントリスナー：スライダー操作時
// ========================================
delayInput.addEventListener('input', (e) => {
    delaySeconds = parseInt(e.target.value);  // スライダーの値を整数で取得
    delayValue.textContent = delaySeconds;  // 表示を更新
});

// ========================================
// イベントリスナー：スライダー変更完了時（指を離した時）
// ========================================
delayInput.addEventListener('change', async () => {
    if (isRecording) {  // 録画中の場合
        console.log('Delay changed, restarting...');
        stopMirror();  // 一度停止
        await startMirror();  // 新しい設定で再開
    }
});

// ========================================
// イベントリスナー：音声ON/OFFボタン
// ========================================
audioToggle.addEventListener('click', () => {
    video.muted = !video.muted;  // ミュート状態を反転
    if (video.muted) {
        // ミュート時の表示
        audioToggle.innerHTML = '<span class="icon">🔇</span> 音声OFF';
        audioToggle.style.background = '';
    } else {
        // 音声ON時の表示
        audioToggle.innerHTML = '<span class="icon">🔊</span> 音声ON';
        audioToggle.style.background = 'rgba(255, 50, 50, 0.4)';
    }
});

// ========================================
// イベントリスナー：開始/停止ボタン
// ========================================
startBtn.addEventListener('click', async () => {
    if (isRecording) {
        stopMirror();  // 録画中なら停止
    } else {
        stopMirror();  // 念のため停止してクリーンアップ
        await startMirror();  // 新規開始
    }
});

// ========================================
// ミラー開始処理
// ========================================
async function startMirror() {
    try {
        // スライダーの現在値を取得
        delaySeconds = parseInt(delayInput.value);
        console.log('Starting with delay:', delaySeconds);

        // カメラとマイクへのアクセスを要求
        statusEl.textContent = 'カメラへのアクセスを要求中...';
        stream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 1280 }, height: { ideal: 720 } },  // 理想的な解像度
            audio: true  // 音声も取得
        });

        // ボタンの表示を「停止」に変更
        startBtn.textContent = '停止';
        startBtn.classList.remove('primary');
        startBtn.style.background = '#ff4444';

        isRecording = true;  // 録画中フラグをON

        if (delaySeconds === 0) {
            // ========================================
            // 0秒設定時：リアルタイムモード
            // ========================================
            console.log('0s delay: Using direct stream');
            video.srcObject = stream;  // ストリームを直接ビデオ要素に設定
            video.play().catch(e => console.error('Play error:', e));  // 再生開始
            video.style.opacity = '1';  // ビデオを表示
            isPlaying = true;
            statusEl.textContent = '再生中 (リアルタイム)';
            debugEl.textContent = 'Mode: Real-time (Direct Stream)';
        } else {
            // ========================================
            // 1秒以上設定時：遅延モード
            // ========================================
            statusEl.textContent = '準備完了. バッファリング中...';
            mediaSource = new MediaSource();  // MediaSourceオブジェクト作成
            video.src = URL.createObjectURL(mediaSource);  // ビデオ要素に設定
            mediaSource.addEventListener('sourceopen', onSourceOpen);  // ソース準備完了時の処理
        }

    } catch (err) {
        // エラー処理
        console.error('Error accessing media devices:', err);
        statusEl.textContent = 'エラー: カメラ/マイクにアクセスできませんでした。';
        alert('カメラとマイクへのアクセスを許可してください。');
    }
}

// ========================================
// ミラー停止処理
// ========================================
function stopMirror() {
    isRecording = false;  // 録画中フラグをOFF
    isPlaying = false;  // 再生中フラグをOFF
    bufferQueue = [];  // バッファキューをクリア
    isBufferUpdating = false;  // バッファ更新中フラグをOFF

    // MediaRecorderが動作中なら停止
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
    }

    // ストリームのトラックを全て停止（カメラ/マイクを解放）
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
    }

    // リアルタイムモードの場合、srcObjectをクリア
    if (video.srcObject) {
        video.srcObject = null;
    }

    // MediaSourceが開いている場合、終了処理
    if (mediaSource && mediaSource.readyState === 'open') {
        try { mediaSource.endOfStream(); } catch (e) { }
    }

    // ビデオのソースをクリア
    if (video.src) {
        URL.revokeObjectURL(video.src);  // オブジェクトURLを解放
        video.removeAttribute('src');
        video.load();  // ビデオ要素をリセット
    }
    stream = null;  // ストリーム参照をクリア

    // UIを初期状態に戻す
    startBtn.textContent = '開始';
    startBtn.classList.add('primary');
    startBtn.style.background = '';
    statusEl.textContent = '待機中';
    debugEl.textContent = '';
    video.style.opacity = '1';
}

// ========================================
// MediaSourceが開いた時の処理
// ========================================
function onSourceOpen() {
    try {
        // SourceBufferを作成（録画データを格納する場所）
        sourceBuffer = mediaSource.addSourceBuffer(currentMimeType);
        sourceBuffer.mode = 'segments';  // セグメントモード（タイムスタンプを使用）

        // バッファ更新完了時の処理
        sourceBuffer.addEventListener('updateend', () => {
            isBufferUpdating = false;  // 更新中フラグをOFF
            processQueue();  // 次のキュー処理を実行
        });

        // バッファエラー時の処理
        sourceBuffer.addEventListener('error', (e) => {
            console.error('SourceBuffer error:', e);
            isBufferUpdating = false;
        });

        // MediaRecorderを作成（ストリームを録画）
        mediaRecorder = new MediaRecorder(stream, { mimeType: currentMimeType });

        // データが利用可能になった時の処理
        mediaRecorder.ondataavailable = async (e) => {
            if (e.data && e.data.size > 0) {
                const buffer = await e.data.arrayBuffer();  // ArrayBufferに変換
                addToQueue({ type: 'append', data: buffer });  // キューに追加
            }
        };

        // 録画開始（CHUNK_INTERVAL間隔でデータを取得）
        mediaRecorder.start(CHUNK_INTERVAL);
        statusEl.textContent = `録画中... ${delaySeconds}秒後に再生開始`;

        // 再生開始チェックを開始
        checkPlaybackStart();

    } catch (e) {
        console.error('Exception:', e);
        statusEl.textContent = 'エラー: 初期化失敗。';
        stopMirror();
    }
}

// ========================================
// バッファ操作をキューに追加
// ========================================
function addToQueue(operation) {
    bufferQueue.push(operation);  // キューに追加
    processQueue();  // キュー処理を実行
}

// ========================================
// バッファ操作キューの処理
// ========================================
function processQueue() {
    // 更新中、キューが空、またはバッファがない場合は何もしない
    if (isBufferUpdating || bufferQueue.length === 0 || !sourceBuffer) return;

    const op = bufferQueue.shift();  // キューから1つ取り出す
    isBufferUpdating = true;  // 更新中フラグをON

    try {
        if (op.type === 'append') {
            // データを追加
            sourceBuffer.appendBuffer(op.data);
        } else if (op.type === 'remove') {
            // データを削除（メモリ管理）
            sourceBuffer.remove(op.start, op.end);
        }
    } catch (e) {
        console.error('SourceBuffer Error:', e);
        isBufferUpdating = false;
        if (e.name === 'QuotaExceededError') {
            // バッファが満杯の場合、操作を戻してクリーンアップ
            bufferQueue.unshift(op);
            performCleanup(true);
        }
    }
}

// ========================================
// 再生開始チェック
// ========================================
function checkPlaybackStart() {
    if (!isRecording) return;  // 録画中でなければ何もしない

    if (!isPlaying) {  // まだ再生していない場合
        let bufferedEnd = 0;
        // バッファの最後の位置を取得
        if (sourceBuffer && sourceBuffer.buffered.length > 0) {
            bufferedEnd = sourceBuffer.buffered.end(sourceBuffer.buffered.length - 1);
        }

        if (bufferedEnd > delaySeconds) {
            // 十分なデータが溜まったら再生開始
            isPlaying = true;

            // 開始位置を計算（バッファの最後 - 遅延時間）
            const startTime = Math.max(0, bufferedEnd - delaySeconds);
            video.currentTime = startTime;

            // 再生開始
            video.play().catch(e => console.log('Autoplay prevented:', e));
            video.style.opacity = '1';  // ビデオを表示
            statusEl.textContent = '再生中 (遅延実行)';

            // クリーンアップを5秒ごとに実行
            setInterval(() => performCleanup(false), 5000);
            // 監視を500msごとに実行
            setInterval(checkStalledPlayback, 500);
        } else {
            // まだデータが足りない場合、進捗を表示
            const progress = Math.min(100, Math.round((bufferedEnd / delaySeconds) * 100));
            statusEl.textContent = `バッファリング中... ${progress}%`;
            video.style.opacity = '0';  // ビデオを非表示
            requestAnimationFrame(checkPlaybackStart);  // 次のフレームで再チェック
        }
    }
}

// ========================================
// 再生位置監視用変数
// ========================================
let lastCurrentTime = 0;  // 前回の再生位置
let stallCount = 0;  // 停止カウンター

// ========================================
// 再生停止チェックと遅延時間の維持
// ========================================
function checkStalledPlayback() {
    if (!isPlaying || !isRecording) return;  // 再生中かつ録画中でなければ何もしない

    let bufferedInfo = '';
    if (sourceBuffer && sourceBuffer.buffered.length > 0) {
        const start = sourceBuffer.buffered.start(0);  // バッファの開始位置
        const end = sourceBuffer.buffered.end(sourceBuffer.buffered.length - 1);  // バッファの終了位置
        bufferedInfo = `Buf: ${start.toFixed(1)}s - ${end.toFixed(1)}s`;

        // ========================================
        // 遅延時間を維持するための調整
        // ========================================
        const targetTime = end - delaySeconds;  // 目標再生位置（バッファの最後 - 遅延時間）
        const drift = video.currentTime - targetTime;  // 目標からのずれ

        // ずれが0.5秒以上ある場合、再生位置を調整
        if (Math.abs(drift) > 0.5) {
            console.log(`Adjusting playback: drift=${drift.toFixed(2)}s, setting to ${targetTime.toFixed(2)}s`);
            video.currentTime = targetTime;  // 再生位置を修正
            stallCount = 0;
        } else {
            // ========================================
            // 小さな停止の検出とギャップスキップ
            // ========================================
            // 再生位置がほとんど動いていない場合
            if (Math.abs(video.currentTime - lastCurrentTime) < 0.1) {
                stallCount++;  // 停止カウンターを増加
            } else {
                stallCount = 0;  // 動いていればリセット
            }

            // 1秒以上停止していて、バッファに余裕がある場合
            if (stallCount > 2 && end > video.currentTime + 1) {
                console.warn('Stall detected, jumping over gap...');
                video.currentTime += 0.5;  // 0.5秒スキップ
                stallCount = 0;
            }
        }

        lastCurrentTime = video.currentTime;  // 現在位置を記録

        // 実際の遅延時間を計算して表示
        const actualDelay = end - video.currentTime;
        statusEl.textContent = `再生中 (設定: ${delaySeconds}s, 実際: ${actualDelay.toFixed(1)}s)`;
    }

    // デバッグ情報を更新
    debugEl.textContent = `Delay: ${delaySeconds}s | Time: ${video.currentTime.toFixed(1)}s | ${bufferedInfo}`;
}

// ========================================
// バッファのクリーンアップ（メモリ管理）
// ========================================
function performCleanup(force = false) {
    if (!isPlaying || !sourceBuffer || isBufferUpdating) return;  // 条件を満たさなければ何もしない

    // 再生位置が40秒を超えた場合、または強制実行の場合
    if (video.currentTime > 40 || force) {
        const removeEnd = video.currentTime - 30;  // 現在位置の30秒前まで削除
        if (removeEnd > 0) {
            // 既に削除操作がキューにない場合のみ追加
            const hasRemove = bufferQueue.some(op => op.type === 'remove');
            if (!hasRemove) {
                const op = { type: 'remove', start: 0, end: removeEnd };
                if (force) {
                    bufferQueue.unshift(op);  // 強制の場合は先頭に追加
                    processQueue();
                } else {
                    addToQueue(op);  // 通常は末尾に追加
                }
            }
        }
    }
}

// ========================================
// ページ読み込み時の初期化
// ========================================
window.addEventListener('load', () => {
    stopMirror();  // 念のため停止状態にする
});
