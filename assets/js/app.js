const WELCOME_ACCEPTED_KEY = 'systan_welcome_terms_accepted_v1';
const FEATURE_NOTICE_VERSION = '2026.05.09-design-offline-1';
const FEATURE_NOTICE_SEEN_KEY = 'systan_feature_notice_seen_' + FEATURE_NOTICE_VERSION;
const FEATURE_NOTICES = [
  {
    date: '2026/05/09',
    title: '単語テスト画面を見やすく改善しました',
    body: 'PCではスクロールなしで問題・選択肢・次へボタンが見えるようにし、スマホでは押しやすさを維持しました。'
  },
  {
    date: '2026/05/09',
    title: 'オフライン対応を強化しました',
    body: '一度読み込んだあと、通信が不安定でも基本画面と単語テストを開きやすくしました。'
  },
  {
    date: '2026/05/05',
    title: '学校別参加コードを追加しました',
    body: '管理者が発行した参加コードで学校・クラス別ランキングに参加できるようになりました。'
  },
  {
    date: '2026/05/04',
    title: '新機能のお知らせを追加しました',
    body: '今後、新しい機能や大きな変更が追加されたときに、アプリ内ポップアップとベルの未読表示でお知らせします。'
  },
  {
    date: '2026/05/04',
    title: 'ログインなしでも利用可能です',
    body: 'ランキングや同期を使う場合はログイン推奨ですが、単語テストなどの基本機能はログインなしでも使えます。'
  }
];

const SCHOOL_CODE_KEY = 'systan_school_code_v1';
const SCHOOL_CODE_NAME_KEY = 'systan_school_name_v1';
const PUSH_CLIENT_ID_KEY = 'systan_push_client_id_v1';
// Firebase Console > Cloud Messaging > Web Push certificates の公開鍵を設定してください。
const FCM_VAPID_KEY = 'BPdoAOwrH8d5aS3A1geBXcnVTdqWas71qio3zyPfx6l_r0mRvq3h2q9Z5tCxjYsvJx61oQczOLW8SAYHrItJkUw';
// 管理者のみ参加コードを発行できます。公開前に管理者のGoogleメールまたはUIDを設定してください。
const ADMIN_EMAILS = [
  'yuki.1092.mkupo1216.m@gmail.com'
];
const ADMIN_UIDS = [
  // 'FirebaseAuthUidHere'
];

const USER_SUSPENDED_MESSAGE = '現在、このアカウントは管理者によって、利用停止の状態にさせられています。管理者までお問い合わせください。';

const firebaseConfig = {
  apiKey: "AIzaSyDHKbY8W78Z02at8GZa2fLX65AWo0TsezI",
  authDomain: "systan-app-v6.firebaseapp.com",
  projectId: "systan-app-v6",
  storageBucket: "systan-app-v6.firebasestorage.app",
  messagingSenderId: "932991616778",
  appId: "1:932991616778:web:661dc2452baa2ea1305cf3",
  measurementId: "G-70CB2JGCRC"
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
let messaging = null;
try {
  if (firebase.messaging && firebase.messaging.isSupported && firebase.messaging.isSupported()) {
    messaging = firebase.messaging();
  }
} catch (e) {
  console.warn('Firebase Messaging is not available:', e);
}
if (messaging) messaging.onMessage(payload => {
  const title = payload.data?.title || payload.notification?.title || '学校からの通知';
  if (typeof showSyncStatus === 'function') showSyncStatus(title);
  if (typeof listenSchoolNotices === 'function') listenSchoolNotices();
});

const MAINTENANCE_SETTINGS_COLLECTION = 'appSettings';
const MAINTENANCE_SETTINGS_DOC = 'global';
const MAINTENANCE_ADMIN_BYPASS_PARAM = 'admin';
// update.htmlでアプリ更新・Cookie/キャッシュ削除が完了した端末だけ、
// 現在のメンテナンスを自動解除して通常画面へ戻します。
const MAINTENANCE_RELEASE_ID = '2026.05.09-update-cleanup-1';
const MAINTENANCE_CLEANUP_DONE_KEY = 'systan_maintenance_cleanup_done_v1';

function getMaintenanceReleaseId(settings) {
  return String((settings && settings.maintenanceReleaseId) || MAINTENANCE_RELEASE_ID);
}

function isMaintenanceCleanupDoneForDevice(settings) {
  try {
    const requiredId = getMaintenanceReleaseId(settings);
    return localStorage.getItem(MAINTENANCE_CLEANUP_DONE_KEY) === requiredId;
  } catch (e) {
    return false;
  }
}

function isMaintenanceAdminBypassUrl() {
  try {
    return new URLSearchParams(location.search).get(MAINTENANCE_ADMIN_BYPASS_PARAM) === '1';
  } catch (e) {
    return false;
  }
}

function waitForAuthReady(timeoutMs = 2500) {
  return new Promise(resolve => {
    let done = false;
    const finish = (user) => {
      if (done) return;
      done = true;
      if (unsubscribe) unsubscribe();
      resolve(user || null);
    };
    let unsubscribe = null;
    try {
      unsubscribe = auth.onAuthStateChanged(user => finish(user));
    } catch (e) {
      resolve(auth.currentUser || null);
      return;
    }
    setTimeout(() => finish(auth.currentUser || null), timeoutMs);
  });
}

async function getGlobalAppSettings() {
  try {
    const snap = await db.collection(MAINTENANCE_SETTINGS_COLLECTION).doc(MAINTENANCE_SETTINGS_DOC).get();
    return snap.exists ? (snap.data() || {}) : {};
  } catch (e) {
    console.warn('getGlobalAppSettings error:', e);
    return {};
  }
}

async function enforceMaintenanceMode() {
  const settings = await getGlobalAppSettings();
  const maintenanceOn = settings.maintenanceMode === true;
  if (!maintenanceOn) return false;

  // この端末で update.html の自動更新・Cookie削除が完了している場合は、
  // メンテナンス画面に戻さず通常利用を許可します。
  if (isMaintenanceCleanupDoneForDevice(settings)) {
    return false;
  }

  const user = await waitForAuthReady();
  const adminByEmail = user && ADMIN_EMAILS.map(v => String(v).toLowerCase()).includes(String(user.email || '').toLowerCase());
  const adminByUid = user && ADMIN_UIDS.includes(user.uid);
  const bypass = isMaintenanceAdminBypassUrl();

  if (adminByEmail || adminByUid || bypass) {
    if (bypass && !user) {
      setTimeout(() => showSyncStatus('管理者ログイン後、設定からメンテナンスをOFFにできます'), 800);
    }
    return false;
  }

  const target = './update.html?maintenance=1&v=' + Date.now();
  window.location.replace(target);
  return true;
}

async function setMaintenanceModeOneTap(enabled) {
  if (!auth.currentUser || !isSchoolAdmin()) {
    showSyncStatus('管理者のみ変更できます', true);
    return;
  }
  try {
    const payload = {
      maintenanceMode: !!enabled,
      updatedByUid: auth.currentUser.uid,
      updatedByEmail: auth.currentUser.email || '',
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    // ONにするたびにリリースIDを更新し、過去の完了済み端末まで無条件で通さないようにします。
    if (enabled) {
      payload.maintenanceReleaseId = 'maintenance-' + Date.now();
    }
    await db.collection(MAINTENANCE_SETTINGS_COLLECTION).doc(MAINTENANCE_SETTINGS_DOC).set(payload, { merge: true });
    showSyncStatus(enabled ? 'メンテナンスをONにしました' : 'メンテナンスをOFFにしました');
    await loadAdminDashboard();
  } catch (e) {
    console.warn('setMaintenanceModeOneTap error:', e);
    showSyncStatus('メンテナンス設定の変更に失敗しました', true);
  }
}

// =========================================================
// SOUND EFFECTS
// =========================================================
let audioCtx = null;
let soundUnlocked = false;

function ensureAudioContext() {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;
  if (!audioCtx) audioCtx = new AudioCtx();
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  soundUnlocked = true;
  return audioCtx;
}

function unlockSound() {
  ensureAudioContext();
}

document.addEventListener('pointerdown', unlockSound, { passive: true });
document.addEventListener('keydown', unlockSound);

function playTone(freq, startAt, duration, type = 'sine', volume = 0.05) {
  const ctx = ensureAudioContext();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, startAt);
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(volume, startAt + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startAt);
  osc.stop(startAt + duration + 0.02);
}

function playCorrectSound() {
  const ctx = ensureAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime + 0.01;
  playTone(880, now, 0.10, 'sine', 0.045);
  playTone(1174.66, now + 0.11, 0.16, 'sine', 0.05);
}

function playWrongSound() {
  const ctx = ensureAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime + 0.01;
  playTone(330, now, 0.12, 'square', 0.04);
  playTone(220, now + 0.10, 0.18, 'square', 0.04);
}

function playFinishSound() {
  const ctx = ensureAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime + 0.01;
  playTone(523.25, now, 0.12, 'triangle', 0.04);
  playTone(659.25, now + 0.13, 0.12, 'triangle', 0.04);
  playTone(783.99, now + 0.26, 0.14, 'triangle', 0.045);
  playTone(1046.50, now + 0.41, 0.28, 'triangle', 0.05);
}

// =========================================================
// OFFLINE CACHE / DATA SAVER
// =========================================================
const APP_CACHE_VERSION = '2026.09.25-onboarding-v2.0';

async function registerOfflineCache() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.register('./sw.js?v=' + encodeURIComponent(APP_CACHE_VERSION));
    // Reload once when the new worker takes control so an open tab picks up the new app shell.
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (sessionStorage.getItem('systan-sw-reloaded') === APP_CACHE_VERSION) return;
      sessionStorage.setItem('systan-sw-reloaded', APP_CACHE_VERSION);
      location.reload();
    });
    if (reg && reg.update && navigator.onLine) reg.update().catch(() => {});
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && navigator.onLine) reg.update().catch(() => {});
    });
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'OPEN_NOTIFICATIONS') showNotifications();
      if (event.data && event.data.type === 'CACHE_READY') {
        if (typeof showSyncStatus === 'function') showSyncStatus('オフライン用データを保存しました');
      }
    });
  } catch (err) {
    console.warn('Service Worker registration failed:', err);
  }
}

registerOfflineCache();

// =========================================================
// WORD DATA
// =========================================================
const WORDS_RAW = [
  [false,1,"見る","見る、会う、結婚する、世話をする"],
  [false,2,"見す","見せる、結婚させる"],
  [false,3,"見ゆ","見える、思われる、見せる、結婚する"],
  [false,4,"かいまみる","のぞき見る"],
  [false,5,"よばふ","求婚する、求愛する"],
  [false,6,"好く","風流・色道を好む"],
  [false,7,"わたる","行く・通る、〜し続ける、一面に〜する"],
  [false,8,"ありく","歩き回る、〜してまわる、〜し続ける"],
  [false,9,"おこなふ","仏道修行をする、勤行する"],
  [false,10,"なやむ","病気になる、苦しむ"],
  [false,11,"おこたる","病気が良くなる（快方に向かう）、怠ける"],
  [false,12,"おくる","先立たれる、遅れる、後になる"],
  [false,13,"ながむ","物思いに沈む、遠くを見やる、口ずさむ"],
  [false,14,"ときめく","寵愛を受ける、世にもてはやされる・栄える"],
  [false,15,"かしづく","大切に育てる、大切に世話をする"],
  [false,16,"めづ","心惹かれる、愛する、感心する"],
  [false,17,"おどろく","目を覚ます、ハッと気づく"],
  [false,18,"こうず","疲れる、困る"],
  [false,19,"おぼゆ","思われる、思い出される、似る"],
  [false,20,"聞こゆ","聞こえる、評判になる、（謙譲）申し上げる"],
  [false,21,"まもる・まぼる","じっと見つめる"],
  [false,22,"たのむ","【四段】当てにする／【下二段】当てにさせる"],
  [false,23,"かづく","【四段】被る、授かる／【下二段】被せる、授ける"],
  [false,24,"ののしる","大声で騒ぐ、評判になる、勢いが盛んだ"],
  [false,25,"やる","送る、遠のける、（動詞＋〜やる）〜しきれない"],
  [false,26,"いらふ","返事をする、答える"],
  [false,27,"あきらむ","明らかにする、心を晴らす"],
  [false,28,"にほふ","美しく映える、つややかに輝く"],
  [false,29,"ねんず","じっと我慢する、祈る"],
  [false,30,"まうく","準備する、用意する"],
  [false,31,"ゐる","座る、〜している、連れて行く"],
  [false,32,"具す","伴う、連れる、付き添う"],
  [false,33,"経（ふ）","（時間が）経つ、（場所を）通る"],
  [false,34,"さる","避ける、去る、（季節・時節が）来る"],
  [false,35,"ものす","（様々な動作の代わり）〜をする、いる、行く"],
  [false,36,"ならふ","慣れる、親しむ"],
  [false,37,"しのぶ","我慢する、人目を忍ぶ、懐かしむ"],
  [false,38,"わぶ","つらく思う・思い悩む、〜しかねる"],
  [false,39,"をかし","趣がある、興味深い、美しい、おかしい"],
  [false,40,"よろし","悪くない、まあまあだ"],
  [false,41,"ありがたし","めったにない、生きるのが難しい"],
  [false,42,"つきづきし","似つかわしい、相応しい"],
  [false,43,"なまめかし","優美だ、上品だ、艶やかだ"],
  [false,44,"めでたし","すばらしい、見事だ"],
  [false,45,"うるはし","きちんとしている、整っている、立派だ"],
  [false,46,"やむごとなし","高貴だ、格別だ、尊い"],
  [false,47,"おとなし","大人らしい、落ち着いている、思慮分別がある"],
  [false,48,"ゆかし","見たい・聞きたい・知りたい、心が惹かれる"],
  [false,49,"なつかし","心惹かれる、親しみが持てる"],
  [false,50,"はづかし","（こちらが恥ずかしくなるほど）立派だ"],
  [false,51,"こころにくし","奥ゆかしい、心が惹かれる"],
  [false,52,"うつくし","かわいらしい、いとしい、美しい"],
  [false,53,"かなし","愛しい、切ない、悲しい"],
  [false,54,"らうたし","かわいらしい、愛くるしい"],
  [false,55,"めやすし","感じが良い、見苦しくない"],
  [false,56,"あやし","不思議だ、身分が低い、見苦しい"],
  [false,57,"さうざうし","物足りない、寂しい"],
  [false,58,"つれなし","平気だ、冷淡だ、よそよそしい"],
  [false,59,"なめし","失礼だ、無礼だ"],
  [false,60,"おどろおどろし","大げさだ、気味が悪い"],
  [false,61,"うし","つらい、嫌だ"],
  [false,62,"むつかし","不快だ、気味が悪い、面倒だ"],
  [false,63,"すさまじ","興ざめだ、殺風景だ、寒々しい"],
  [false,64,"びんなし","不都合だ、具合が悪い"],
  [false,65,"いとほし","気の毒だ、かわいそうだ、愛しい"],
  [false,66,"いはけなし","幼い、子供っぽい"],
  [false,67,"つらし","薄情だ、つらい"],
  [false,68,"ところせし","狭い、身置きどころがない、気兼ねする"],
  [false,69,"うしろめた（な）し","気がかりだ、心配だ"],
  [false,70,"かたはらいたし","みっともない、気恥ずかしい、気の毒だ"],
  [false,71,"わりなし","理屈に合わない、どうしようもない、ひどい"],
  [false,72,"本意なし","残念だ、不本意だ"],
  [false,73,"あさまし","意外だ、あきれるほどだ、情けない"],
  [false,74,"めざまし","気にくわない、目障りだ／（プラス）素晴らしい"],
  [false,75,"いみじ","とても素晴らしい、とてもひどい、甚だしい"],
  [false,76,"ゆゆし","不吉だ、恐ろしい、素晴らしい"],
  [false,77,"やさし","身が縮む思いだ、恥ずかしい、優雅だ"],
  [false,78,"しるし","はっきりしている、その通りだ"],
  [false,79,"とし","早い、速い"],
  [false,80,"ゆくりなし","突然だ、思いがけない"],
  [false,81,"おぼつかなし","はっきりしない、気がかりだ、待ち遠しい"],
  [false,82,"こころもとなし","待ち遠しい、じれったい、気がかりだ"],
  [false,83,"あはれなり","しみじみとした趣がある、かわいい、気の毒だ"],
  [false,84,"つれづれなり","手持ちぶさただ、退屈だ"],
  [false,85,"すずろなり・そぞろなり","あてもない、思いがけない、むやみだ"],
  [false,86,"まめなり・まめやかなり","誠実だ、実用的だ"],
  [false,87,"あだなり","浮気だ、浮ついている、儚い"],
  [false,88,"いたづらなり","無駄だ、暇だ"],
  [false,89,"いうなり","優雅だ、上品だ"],
  [false,90,"あてなり","高貴だ、上品だ"],
  [false,91,"あからさまなり","ほんのちょっと、急に"],
  [false,92,"みそかなり","ひそかに、こっそり"],
  [false,93,"おろかなり","疎かだ、いい加減だ"],
  [false,94,"をこなり","愚かだ、馬鹿げている"],
  [false,95,"むげなり","ひどい、最悪だ、身分が低い"],
  [false,96,"なかなかなり","かえって〜だ、中途半端だ"],
  [false,97,"手","筆跡、文字、演奏の腕前"],
  [false,98,"文・書","手紙、漢詩文、学問"],
  [false,99,"消息","手紙、訪問の申し入れ、挨拶"],
  [false,100,"あそび","管弦の遊び、宴会"],
  [false,101,"うへ","天皇、お部屋、奥様"],
  [false,102,"おほやけ","朝廷、天皇、公的なこと"],
  [false,103,"うち","宮中、内裏、天皇"],
  [false,104,"御前","お側、お前"],
  [false,105,"みゆき","（天皇のお出かけ）御幸・行幸"],
  [false,106,"たより","頼り（つて）、機会、都合"],
  [false,107,"物語","世間話、物語"],
  [false,108,"ためし","先例、見せしめ"],
  [false,109,"いそぎ","準備、急ぐこと"],
  [false,110,"用意","気配り、心構え"],
  [false,111,"かたち","容姿、顔立ち"],
  [false,112,"かげ","光、姿、影"],
  [false,113,"けしき","様子、機嫌、意向"],
  [false,114,"こころざし","愛情、心のこもり、お礼の品"],
  [false,115,"ほい","本来の志、かねてからの願い"],
  [false,116,"こと","言葉、事柄、和歌"],
  [false,117,"わざ","儀式、法要、行為"],
  [false,118,"よろづ","さまざまなこと、すべて"],
  [false,119,"ことわり","道理、筋道"],
  [false,120,"ひがこと・ひがごと","間違い、誤り"],
  [false,121,"そらごと","嘘、偽り"],
  [false,122,"しるし","効き目、霊験、兆候"],
  [false,123,"料","用材、代金、〜するためのもの"],
  [false,124,"ろく","褒美の品、褒美"],
  [false,125,"としごろ","長年、ここ数年"],
  [false,126,"つとめて","早朝、翌朝"],
  [false,127,"世・世の中","男女の仲、世間、情け"],
  [false,128,"いかで・いかでか","どうして（〜か）、なんとかして（〜したい）"],
  [false,129,"いかが・いかに","どのように、どうして"],
  [false,130,"など・などか・などて","どうして"],
  [false,131,"いつしか","早く（〜したい）、いつの間にか"],
  [false,132,"おのづから","自然と、たまたま、万一"],
  [false,133,"なほ","やはり"],
  [false,134,"いとど","いっそう、ますます"],
  [false,135,"げに","なるほど、本当に"],
  [false,136,"かく","このように"],
  [false,137,"さ","そのように"],
  [false,138,"しか","そのように"],
  [false,139,"と","あのように"],
  [false,140,"やがて","そのまま、すぐに"],
  [false,141,"すなはち","すぐに、つまり"],
  [false,142,"やうやう・やうやく","だんだん、しだいに"],
  [false,143,"やをら・やはら","そっと、静かに"],
  [false,144,"なかなか（に）","かえって、むしろ"],
  [false,145,"さすがに","そうは言ってもやはり"],
  [false,146,"かたみに","互いに"],
  [false,147,"うたて","いやに、異様に、ますます"],
  [false,148,"なべて","一般に、総じて、普通"],
  [false,149,"わざと","わざわざ、特に、格別に"],
  [false,150,"あまた","たくさん"],
  [false,151,"ここら・そこら","たくさん、非常に"],
  [false,152,"え（〜打消）","〜できない"],
  [false,153,"な〜そ","〜するな、〜してくれるな"],
  [false,154,"おほかた（〜打消）","まったく〜ない"],
  [false,155,"さらに（〜打消）","まったく〜ない"],
  [false,156,"世に（〜打消）","まったく〜ない"],
  [false,157,"たえて（〜打消）","まったく〜ない"],
  [false,158,"つゆ（〜打消）","まったく〜ない、少しも〜ない"],
  [false,159,"ゆめ（〜打消・禁止）","決して〜ない、決して〜するな"],
  [false,160,"つやつや（〜打消）","まったく〜ない"],
  [false,161,"をさをさ（〜打消）","ほとんど〜ない"],
  [false,162,"よも（〜打消推量）","まさか〜ないだろう"],
  [false,163,"あなかしこ（〜禁止）","決して〜するな"],
  [false,164,"ためらふ","気持ちを落ち着かせる、ためらう"],
  [false,165,"やすらふ","立ち止まる、ためらう"],
  [false,166,"かたらふ","親しく交際する、語り合う"],
  [false,167,"住む","（男が女のもとに）通う、住む"],
  [false,168,"やむ","終わる、止まる"],
  [false,169,"うつろふ","色あせる、移り変わる"],
  [false,170,"みいだす","外を見る、見つけ出す"],
  [false,171,"もてなす","取り扱う、もてなす、振る舞う"],
  [false,172,"あつかふ","世話をする、看病する"],
  [false,173,"あくがる","浮かれ歩く、魂が抜け出る"],
  [false,174,"あふ","結婚する、巡り会う、耐える"],
  [false,175,"しほたる","涙で袖が濡れる"],
  [false,176,"かきくらす","心が暗くなる、空を暗くする"],
  [false,177,"まどふ","迷う、（動詞＋〜まどふ）ひどく〜する"],
  [false,178,"たばかる","策をめぐらす、だます"],
  [false,179,"すさぶ","興の向くままに〜する"],
  [false,180,"すまふ","抵抗する、辞退する"],
  [false,181,"まねぶ","真似をする、伝える"],
  [false,182,"ねぶ","大人びる、年をとる"],
  [false,183,"おきつ","決める、指示する"],
  [false,184,"うれふ","訴える、悲しみ嘆く"],
  [false,185,"むすぶ","手ですくう、結ぶ"],
  [false,186,"とぶらふ","訪れる、見舞う、供養する"],
  [false,187,"やつす","出家する、質素な格好にする"],
  [false,188,"さはる","差し支える、邪魔される"],
  [false,189,"かしこまる","恐縮する、謝罪する"],
  [false,190,"かこつ","ぐちを言う、〜のせいにする"],
  [false,191,"わく","理解する、区別する"],
  [false,192,"つつむ","気兼ねする、遠慮する"],
  [false,193,"あらまほし","理想的だ、望ましい"],
  [false,194,"らうらうじ","洗練されている、巧みだ"],
  [false,195,"うるせし","賢い、巧みだ"],
  [false,196,"はかばかし","テキパキしている、はっきりしている"],
  [false,197,"をさをさし","しっかりしている、大人びている"],
  [false,198,"さうなし","二つとない／躊躇しない"],
  [false,199,"くまなし","陰がない、何でも知っている"],
  [false,200,"ずちなし","どうしようもない、術がない"],
  [false,201,"まさなし","よくない、不都合だ"],
  [false,202,"あいなし","つまらない、やたらと"],
  [false,203,"はかなし","頼りない、ちょっとした"],
  [false,204,"こころづきなし","気にくわない、不快だ"],
  [false,205,"あへなし","あっけない、どうしようもない"],
  [false,206,"よしなし","理由がない、つまらない"],
  [false,207,"おほけなし","身の程知らずだ、恐れ多い"],
  [false,208,"さがなし","意地が悪い、いたずらだ"],
  [false,209,"はしたなし","中途半端だ、決まずい"],
  [false,210,"しどけなし","だらしない、くつろいでいる"],
  [false,211,"いぎたなし","寝坊だ、熟睡している"],
  [false,212,"ひとわろし","体裁が悪い、みっともない"],
  [false,213,"いぶせし","鬱陶しい、気がかりだ"],
  [false,214,"くちをし","残念だ、心残りだ"],
  [false,215,"あたらし","惜しい、もったいない"],
  [false,216,"ねたし","憎らしい、悔しい"],
  [false,217,"こちたし","大げさだ、仰々しい"],
  [false,218,"けし","異様だ、怪しい"],
  [false,219,"わびし","つらい、苦しい"],
  [false,220,"こころぐるし","気の毒だ、気掛かりだ"],
  [false,221,"まだし","まだ時期が早い、未熟だ"],
  [false,222,"さかし","賢い、こざかしい"],
  [false,223,"まばゆし","眩しい、恥ずかしい"],
  [false,224,"かたじけなし","恐れ多い、ありがたい"],
  [false,225,"かしこし","恐ろしい、素晴らしい"],
  [false,226,"しげし","数多い、重なっている"],
  [false,227,"すごし","気味が悪い、素晴らしい"],
  [false,228,"いたし","ひどい／（いたく〜打消）それほど〜ない"],
  [false,229,"おぼろけなり","格別だ、並一通りだ"],
  [false,230,"なのめなり","並一通りだ、いい加減だ"],
  [false,231,"清らなり・けうらなり","気品があって美しい、華麗だ"],
  [false,232,"まほなり","整っている、完全だ"],
  [false,233,"あらはなり","丸見えだ、露骨だ"],
  [false,234,"あながちなり","強引だ、一途だ"],
  [false,235,"せちなり","切実だ、ひたすらだ"],
  [false,236,"とみなり","急だ、突然だ"],
  [false,237,"うちつけなり","軽はずみだ、突然だ"],
  [false,238,"さらなり","言うまでもない"],
  [false,239,"ねんごろなり","親切だ、丁寧だ"],
  [false,240,"おいらかなり","おっとりしている、おだやかだ"],
  [false,241,"あやにくなり","意地が悪い、都合が悪い"],
  [false,242,"おぼえ","評判、寵愛"],
  [false,243,"ひま","隙間、合間"],
  [false,244,"いとま","暇、休むこと、お辞職"],
  [false,245,"才（ざえ）","教養、学問、才能"],
  [false,246,"よろこび","お祝い、昇進のお礼"],
  [false,247,"こころばへ","気配り、性質"],
  [false,248,"こころづくし","物思いをすること"],
  [false,249,"そこ","あなた、そこ"],
  [false,250,"ここ","私、ここ"],
  [false,251,"かれ","あれ、あの人"],
  [false,252,"それ","それ、その人"],
  [false,253,"これ","これ、この人"],
  [false,254,"あなた","向こう、あちら、以前"],
  [false,255,"そなた","そちら、あなた"],
  [false,256,"こなた","こちら、私"],
  [false,257,"そのかみ","その当時、昔"],
  [false,258,"せうと","兄（女性から見た男兄弟）"],
  [false,259,"おとうと・おとと","弟、妹"],
  [false,260,"いも","愛する女性、妹"],
  [false,261,"つま","夫、妻"],
  [false,262,"はらから","兄弟姉妹"],
  [false,263,"かたへ","片方、仲間、一部分"],
  [false,264,"ほど","時間、距離、身分"],
  [false,265,"かぎり","限界、最期"],
  [false,266,"きは","身分、端"],
  [false,267,"ついで","順序、機会"],
  [false,268,"沙汰","処置、裁判、評判"],
  [false,269,"とが","罪、欠点"],
  [false,270,"け","〜のせい（原因）、気配"],
  [false,271,"よし","理由、風情"],
  [false,272,"やう","様子、理由"],
  [false,273,"ちぎり","約束、前世からの因縁"],
  [false,274,"ほだし","束縛、足手まとい"],
  [false,275,"あやめ","文様、道理"],
  [false,276,"うつつ","現実、正気"],
  [false,277,"あるじ","主人、もてなし"],
  [false,278,"ふるさと","旧都、慣れ親しんだ場所"],
  [false,279,"さて","そのまま、ところで"],
  [false,280,"さながら","そのまま、すべて"],
  [false,281,"いま","もう、すぐ"],
  [false,282,"せめて","無理に、ひたすら"],
  [false,283,"むべ・うべ","なるほど、いかにも"],
  [false,284,"かつ","一方では、すぐに"],
  [false,285,"ひねもす","一日中"],
  [false,286,"かまへて（〜打消・禁止）","決して〜ない、必ず〜せよ"],
  [false,287,"あへて（〜打消）","まったく〜ない"],
  [false,288,"かけて（も）（〜打消）","決して〜ない"],
  [false,289,"さだめて（〜推量）","きっと〜だろう"],
  [false,290,"のたまふ・のたまはす","尊敬 | おっしゃる"],
  [false,291,"仰す","尊敬 | おっしゃる、命じる"],
  [false,292,"聞こゆ・聞こえさす","謙譲 | 申し上げる"],
  [false,293,"申す","謙譲 | 申し上げる"],
  [false,294,"奏す","謙譲（最高） | 天皇・上皇に申し上げる"],
  [false,295,"啓す","謙譲（最高） | 皇太子・皇后等に申し上げる"],
  [false,296,"承る","謙譲 | お受けする、いただく、お聞きする"],
  [false,297,"給ふ","尊敬／補助 | お与えになる、〜なさる／〜ております"],
  [false,298,"たまはす","尊敬（最高） | お与えになる"],
  [false,299,"たまはる","謙譲 | いただく"],
  [false,300,"召す","尊敬 | お呼びになる、召し上がる、お召しになる"],
  [false,301,"思す・思し召す","尊敬 | お思いになる"],
  [false,302,"おほとのごもる","尊敬 | お休みになる"],
  [false,303,"さぶらふ・さうらふ","謙譲／丁寧 | お給仕する／〜でございます"],
  [false,304,"はべり","謙譲／丁寧 | お給仕する／〜でございます"],
  [false,305,"奉る","謙譲／尊敬 | 差し上げる／お召しになる・召し上がる"],
  [false,306,"参らす","謙譲 | 差し上げる"],
  [false,307,"まゐる・まうづ","謙譲 | 参上する、参る"],
  [false,308,"まかる・まかづ","謙譲 | 退出する"],
  [false,309,"あそばす","尊敬（最高） | 〜なさる、お遊びになる"],
  [false,310,"つか（う）まつる","謙譲 | お仕えする、〜申し上げる"],
  [false,311,"聞こし召す","尊敬 | お聞きになる、召し上がる、お治めになる"],
  [false,312,"しろしめす","尊敬 | お治めになる、知っていらっしゃる"],
  [false,313,"おはす・おはします","尊敬 | いらっしゃる、〜なさる"],
  [false,314,"います・ます・まします","尊敬 | いらっしゃる"],
  [false,315,"御覧ず","尊敬 | ご覧になる"],
  [false,316,"ただならずなる","妊娠する"],
  [false,317,"力なし","どうしようもない、仕方がない"],
  [false,318,"ときしもあれ","折も折、よりによってこの時に"],
  [false,319,"ときにあふ","世にときめいている、時運に恵まれる"],
  [false,320,"ところう","威張る、顔役顔をする"],
  [false,321,"とばかり","しばらくの間、ちょっと"],
  [false,322,"なでふ・なんでふ","どうして（〜か）、なんという"],
  [false,323,"名に（し）負ふ","名高い、有名である"],
  [false,324,"何（に）か（は）せむ","どうしようか（いや、どうにもならない）"],
  [false,325,"音を泣く","声を上げて泣く"],
  [false,326,"〜のがり","〜のもとへ"],
  [false,327,"〜ばこそあらめ","〜ならばともかく（〜なら格別だが）"],
  [false,328,"人となる","一人前になる、成人する"],
  [false,329,"ひとやりならず","他人のせいではなく自分からだ"],
  [false,330,"またの","次の"],
  [false,331,"〜ままに","〜するやいなや、〜のままに、〜につれて"],
  [false,332,"昔の人","故人、かつて馴染みのあった人"],
  [false,333,"目もあやなり","まぶしいほど立派だ"],
  [false,334,"〜やおそきと","〜するとすぐに"],
  [false,335,"やらん","〜であろうか"],
  [false,336,"やるかたなし","心が晴れる方法がない、どうしようもない"],
  [false,337,"世にあり","世間に受け入れられている、無事で生きている"],
  [false,338,"例ならず","いつもと違っている、病気である"],
  [false,339,"例の","いつものように、いつもの"],
]
const WORDS = WORDS_RAW.map(([isNew, id, en, jp]) => ({ isNew, id, en, jp }));
const RANKINGS_COLLECTION = 'rankingsKobun';
const WORD_MAP = {};
WORDS.forEach(w => WORD_MAP[w.id] = w);

const SET_SIZE = 50;
const WRONG_THRESHOLD = 10;
const TOTAL_SETS = Math.ceil(WORDS.length / SET_SIZE);

// =========================================================
// STATE
// =========================================================
let progress = {}; // wordId → { q1, q2, q3 }
let bookmarks = new Set(); // bookmarked wordIds
let currentSetIdx = 0;
let selectedMode = 1;
let selectedRetest = 'all'; // 'all' | 'mix' | 'circle' | 'cross' | 'bookmark'
let selectedBmMode = 1;    // mode selector for bookmark screen
let selectedBmFilter = 'all'; // 'all' | 'bm' | 'wrong'
let normalQuizCount = 10;
let setQuizRanges = {}; // setIdx -> { startId, endId }
let bookmarkQuizCount = 10;
let quiz = null;

// =========================================================
// WORD VOICE / SPEECH SYNTHESIS
// =========================================================
const VOICE_AUTO_KEY = 'kobun_voice_auto_enabled';
function isVoiceSupported() { return typeof window !== 'undefined' && 'speechSynthesis' in window; }
function isAutoVoiceEnabled() { return localStorage.getItem(VOICE_AUTO_KEY) === '1'; }
function setAutoVoiceEnabled(enabled) {
  localStorage.setItem(VOICE_AUTO_KEY, enabled ? '1' : '0');
  renderAccountSettings && renderAccountSettings();
}
function speakWordText(text) {
  if (!text || !isVoiceSupported()) {
    alert('この端末では音声読み上げに対応していません。');
    return;
  }
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(String(text));
    u.lang = 'ja-JP';
    u.rate = 0.86;
    u.pitch = 1;
    u.volume = 1;
    const voices = window.speechSynthesis.getVoices ? window.speechSynthesis.getVoices() : [];
    const preferred = voices.find(v => /ja[-_]JP/i.test(v.lang) && /Google|Microsoft|Japanese|Kyoko/i.test(v.name)) || voices.find(v => /^ja/i.test(v.lang));
    if (preferred) u.voice = preferred;
    window.speechSynthesis.speak(u);
  } catch (e) { console.warn('speech failed', e); }
}
function speakWordById(wordId, event) {
  if (event) event.stopPropagation();
  const w = WORDS.find(x => Number(x.id) === Number(wordId));
  if (w) speakWordText(w.en);
}
function speakCurrentQuizWord() {
  if (!quiz || !quiz.words || !quiz.words[quiz.idx]) return;
  speakWordText(quiz.words[quiz.idx].en);
}
function toggleAutoVoiceFromSettings() {
  const input = document.getElementById('voice-auto-toggle');
  setAutoVoiceEnabled(!!(input && input.checked));
}
function renderVoiceSettingsCard() {
  const checked = isAutoVoiceEnabled() ? 'checked' : '';
  const disabled = isVoiceSupported() ? '' : 'disabled';
  const help = isVoiceSupported() ? 'クイズで古文単語が表示されたときに自動で読み上げます。' : 'このブラウザは音声読み上げに対応していません。';
  return `
    <div class="account-card voice-settings-card">
      <div class="ranking-meta-title">音声</div>
      <div class="voice-setting-row">
        <div>
          <div class="voice-setting-title">古文単語の自動読み上げ</div>
          <div class="account-help">${help}</div>
        </div>
        <label class="voice-switch">
          <input id="voice-auto-toggle" type="checkbox" ${checked} ${disabled} onchange="toggleAutoVoiceFromSettings()">
          <span></span>
        </label>
      </div>
      <button class="btn btn-secondary voice-test-btn" onclick="speakWordText('???')">音声テスト</button>
    </div>`;
}

let leaderboardStats = { totalAnswered: 0, totalCorrect: 0, totalWrong: 0, updatedAt: null };
let leaderboardCache = [];
let myLeaderboardRank = null;
let accountProfile = { nickname: '' };
const NICKNAME_KEY = 'systan_public_nickname_v1';

const STATUS_RANK = { '◎': 4, '○': 3, '×': 2, null: 0, '': 0 };

function getWordProgress(id) {
  return progress[id] || { q1: null, q2: null, q3: null };
}

function getStatus(id) {
  const wp = getWordProgress(id);
  // Historical records have no order information; retain their previous display
  // until this word receives a new answer.
  if (['◎', '○', '×'].includes(wp.latestStatus)) return wp.latestStatus;
  const vals = [wp.q1, wp.q2, wp.q3];
  let best = 0;
  vals.forEach(v => { const r = STATUS_RANK[v] || 0; if (r > best) best = r; });
  if (best === 4) return '◎';
  if (best === 3) return '○';
  if (best === 2) return '×';
  return '';
}

function setQResult(id, qn, result) {
  if (!progress[id]) progress[id] = { q1: null, q2: null, q3: null };
  progress[id][qn] = result;
  if (['◎', '○', '×'].includes(result)) {
    progress[id].latestStatus = result;
    progress[id].latestAnsweredAt = Date.now();
  }
}

function getQProgress(id) {
  const wp = getWordProgress(id);
  return { q1: wp.q1 || '', q2: wp.q2 || '', q3: wp.q3 || '' };
}

function getSetWords(setIdx) {
  const start = setIdx * SET_SIZE;
  return WORDS.slice(start, start + SET_SIZE);
}

function getSetIdBounds(setIdx) {
  const words = getSetWords(setIdx);
  return {
    minId: words[0].id,
    maxId: words[words.length - 1].id
  };
}

function sanitizeSetRange(setIdx, startValue, endValue) {
  // Unit内に限定せず、全単語から自由に範囲指定できるようにする
  const minId = WORDS[0].id;
  const maxId = WORDS[WORDS.length - 1].id;
  let startId = Number(startValue);
  let endId = Number(endValue);

  if (!Number.isFinite(startId)) startId = minId;
  if (!Number.isFinite(endId)) endId = maxId;

  startId = Math.max(minId, Math.min(maxId, Math.floor(startId)));
  endId = Math.max(minId, Math.min(maxId, Math.floor(endId)));

  if (startId > endId) {
    const temp = startId;
    startId = endId;
    endId = temp;
  }

  return { startId, endId, minId, maxId };
}

function ensureSetRange(setIdx) {
  const stored = setQuizRanges[setIdx] || {};
  const safe = sanitizeSetRange(setIdx, stored.startId, stored.endId);
  setQuizRanges[setIdx] = { startId: safe.startId, endId: safe.endId };
  return safe;
}

function getRangedSetWords(setIdx) {
  const { startId, endId } = ensureSetRange(setIdx);
  // Unitをまたいだ範囲指定に対応
  return WORDS.filter(w => w.id >= startId && w.id <= endId);
}

function getSetStats(setIdx) {
  const words = getSetWords(setIdx);
  const counts = { '': 0, '○': 0, '◎': 0, '×': 0 };
  words.forEach(w => { const s = getStatus(w.id); counts[s] = (counts[s] || 0) + 1; });
  return counts;
}

function isSetCompleted(setIdx) {
  const words = getSetWords(setIdx);
  return words.every(w => getStatus(w.id) === '◎');
}

function getWrongWords() {
  return WORDS.filter(w => getStatus(w.id) === '×');
}

// =========================================================
// BOOKMARK HELPERS
// =========================================================
function isBookmarked(id) {
  return bookmarks.has(id);
}

function toggleBookmark(id) {
  if (bookmarks.has(id)) {
    bookmarks.delete(id);
  } else {
    bookmarks.add(id);
  }
  saveProgress();
}

function getBookmarkedWords() {
  return WORDS.filter(w => bookmarks.has(w.id));
}

function selectRetest(mode) {
  selectedRetest = mode;
  const select = document.getElementById('retest-select');
  if (select && select.value !== mode) select.value = mode;
  ['all','mix','circle','cross','bookmark'].forEach(m => {
    const btn = document.getElementById('retest-btn-' + m);
    if (btn) btn.classList.toggle('active', m === mode);
  });
  renderSet();
}

function normalizeResultMark(value) {
  // 「○」と「〇」は見た目が近い別文字なので、判定前に統一する
  if (value === '〇') return '○';
  return value || null;
}

function getWordResultMarks(id) {
  const wp = getWordProgress(id);
  return [wp.q1, wp.q2, wp.q3].map(normalizeResultMark).filter(Boolean);
}

function hasAnyWordResult(id, targets) {
  const targetSet = new Set(targets.map(normalizeResultMark));
  return getWordResultMarks(id).some(result => targetSet.has(result));
}

function getActiveWords(setIdx) {
  const words = getRangedSetWords(setIdx);

  // 出題対象の仕様:
  // all      = すべて（未回答、○、×） ※◎は習得済みとして除外
  // mix      = ○、×
  // circle   = ○
  // cross    = ×
  // bookmark = 選択範囲内のブックマーク
  //
  // 判定は各問題形式(q1/q2/q3)の個別結果ではなく、画面に表示している
  // 総合ステータス(getStatus)に統一する。これによりプルダウン表示と
  // 実際の出題対象がズレない。
  if (selectedRetest === 'all') {
    return words.filter(w => {
      const status = getStatus(w.id);
      return status === '' || status === '○' || status === '×';
    });
  }

  if (selectedRetest === 'mix') {
    return words.filter(w => {
      const status = getStatus(w.id);
      return status === '○' || status === '×';
    });
  }

  if (selectedRetest === 'circle') {
    return words.filter(w => getStatus(w.id) === '○');
  }

  if (selectedRetest === 'cross') {
    return words.filter(w => getStatus(w.id) === '×');
  }

  if (selectedRetest === 'bookmark') {
    return words.filter(w => bookmarks.has(w.id));
  }

  return words;
}

function getTotalStats() {
  const counts = { '': 0, '○': 0, '◎': 0, '×': 0 };
  WORDS.forEach(w => { const s = getStatus(w.id); counts[s] = (counts[s] || 0) + 1; });
  return counts;
}

// =========================================================
// LEADERBOARD
// =========================================================

function showSyncStatus(message, isError = false) {
  const el = document.getElementById('sync-status');
  if (!el) return;
  el.textContent = message;
  el.classList.toggle('error', !!isError);
  el.classList.add('show');
  clearTimeout(showSyncStatus._timer);
  showSyncStatus._timer = setTimeout(() => el.classList.remove('show'), 1800);
}

function getInitials(name) {
  const txt = String(name || '').trim();
  if (!txt) return 'G';
  return txt.replace(/\s+/g, '').slice(0, 1).toUpperCase();
}

function getAnonymousName(uid) {
  const raw = String(uid || 'guest').replace(/[^a-zA-Z0-9]/g, '');
  const suffix = (raw.slice(-4) || '0000').toUpperCase();
  return `学習者-${suffix}`;
}

function getStoredNickname() {
  try { return (localStorage.getItem(NICKNAME_KEY) || '').trim(); } catch(e) { return ''; }
}

function setStoredNickname(name) {
  try {
    if (name) localStorage.setItem(NICKNAME_KEY, name);
    else localStorage.removeItem(NICKNAME_KEY);
  } catch(e) {}
}

function getPublicNickname(user = auth.currentUser) {
  const local = getStoredNickname();
  const remote = (accountProfile && accountProfile.nickname || '').trim();
  if (local) return local;
  if (remote) return remote;
  return user ? getAnonymousName(user.uid) : 'ゲスト';
}



function normalizeSchoolCode(code) {
  return String(code || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 20);
}

function getSchoolCode() {
  try { return normalizeSchoolCode(localStorage.getItem(SCHOOL_CODE_KEY) || ''); } catch (e) { return ''; }
}

function getSchoolName() {
  try { return String(localStorage.getItem(SCHOOL_CODE_NAME_KEY) || '').trim(); } catch (e) { return ''; }
}

function setLocalSchoolCode(code, name = '') {
  const normalized = normalizeSchoolCode(code);
  try {
    if (normalized) localStorage.setItem(SCHOOL_CODE_KEY, normalized);
    else localStorage.removeItem(SCHOOL_CODE_KEY);
    if (name) localStorage.setItem(SCHOOL_CODE_NAME_KEY, String(name).trim().slice(0, 40));
    else localStorage.removeItem(SCHOOL_CODE_NAME_KEY);
  } catch (e) {}
}

const CLASS_SESSION_KEY = 'systan_class_session_v1';
let activeClassAssignment = null;
function normalizeClassId(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 20);
}
function storeClassAssignment(assignment) {
  activeClassAssignment = assignment;
  try {
    if (assignment) localStorage.setItem(CLASS_SESSION_KEY, JSON.stringify(assignment));
    else localStorage.removeItem(CLASS_SESSION_KEY);
  } catch (e) {}
  renderClassStudyShortcut();
}
function restoreClassAssignment() {
  try {
    const saved = JSON.parse(localStorage.getItem(CLASS_SESSION_KEY) || 'null');
    if (saved && (saved.local === true || typeof saved.uid === 'string') && saved.schoolId === getSchoolCode() &&
      normalizeClassId(saved.classId) === saved.classId) {
      activeClassAssignment = saved;
    }
  } catch (e) {}
}
function renderClassStudyShortcut() {
  const slot = document.getElementById('home-class-study');
  if (!slot) return;
  const a = activeClassAssignment;
  const validSession = a && (a.local === true && !auth.currentUser || auth.currentUser && a.uid === auth.currentUser.uid);
  if (!a || !validSession || getSchoolCode() !== a.schoolId) {
    slot.innerHTML = '';
    return;
  }
  const hasRange = Number.isInteger(a.startId) && Number.isInteger(a.endId) && a.startId >= WORDS[0].id && a.endId <= WORDS[WORDS.length - 1].id && a.startId <= a.endId;
  slot.innerHTML = `<div class="class-study-card">
    <div class="class-study-kicker">今回の単語テスト範囲</div>
    <div class="class-study-heading">${escapeHtml(a.schoolName || a.schoolId)} · ${escapeHtml(a.className || a.classId)}</div>
    <div class="class-study-range">${hasRange ? `${a.startId}〜${a.endId}番 · ${a.endId - a.startId + 1}語` : 'テスト範囲はまだ設定されていません'}</div>
    ${hasRange ? '<button type="button" class="btn btn-primary class-study-button" onclick="startClassStudy()">この範囲で学習する →</button>' : ''}
  </div>`;
}
function startClassStudy() {
  const a = activeClassAssignment;
  if (!a || !(a.local === true && !auth.currentUser || auth.currentUser && a.uid === auth.currentUser.uid) ||
      !Number.isInteger(a.startId) || !Number.isInteger(a.endId)) return;
  currentSetIdx = 0;
  selectedRetest = 'all';
  setQuizRanges[0] = { startId: a.startId, endId: a.endId };
  showHome();
  const words = WORDS.filter(w => w.id >= a.startId && w.id <= a.endId);
  startQuizSession(shuffle(words), 'normal');
}

function showSchoolLoginMessage(message, error = false) {
  const el = document.getElementById('auth-school-message');
  if (el) { el.textContent = message; el.classList.toggle('error', error); }
  showSyncStatus(message, error);
}

function leaveLocalSchool() {
  if (!activeClassAssignment?.local) return;
  storeClassAssignment(null);
  setLocalSchoolCode('', '');
  syncPushAudience();
  showHome();
}

async function loginSchoolClass() {
  const schoolId = normalizeSchoolCode(document.getElementById('auth-school-id')?.value);
  const classId = normalizeClassId(document.getElementById('auth-class-id')?.value);
  if (!schoolId) { showSchoolLoginMessage('学校IDを入力してください', true); return; }
  const button = document.getElementById('auth-school-login');
  if (button) button.disabled = true;
  showSchoolLoginMessage('学校IDを確認しています…');
  try {
    const schoolSnap = await db.collection('schoolCodes').doc(schoolId).get();
    if (!schoolSnap.exists || schoolSnap.data()?.active === false) throw new Error('学校IDが見つからないか、停止中です');
    const schoolData = schoolSnap.data() || {};
    let classData = null;
    if (classId) {
      const classSnap = await db.collection('schoolCodes').doc(schoolId).collection('classes').doc(classId).get();
      if (!classSnap.exists || classSnap.data()?.active === false) {
        throw new Error('クラスIDを確認できません。学校IDのみでログインするか、管理者にクラス登録を依頼してください');
      }
      classData = classSnap.data();
    }
    const rangeData = classData || schoolData;
    const startId = Number(rangeData.startId), endId = Number(rangeData.endId);
    const validRange = Number.isInteger(startId) && Number.isInteger(endId) &&
      startId >= WORDS[0].id && endId <= WORDS[WORDS.length - 1].id && startId <= endId;
    let local = false;
    if (!auth.currentUser) {
      try { await auth.signInAnonymously(); }
      catch (error) {
        // A verified school may still use device-local learning when Anonymous Auth is disabled.
        console.warn('Anonymous Auth unavailable; using local school session:', error);
        local = true;
      }
    }
    const schoolName = String(schoolData.schoolName || '').slice(0,40);
    setLocalSchoolCode(schoolId, schoolName);
    storeClassAssignment({uid:auth.currentUser?.uid || null,local,schoolId,classId,
      startId:validRange ? startId : null,endId:validRange ? endId : null,
      schoolName,className:String(classData?.className || '').slice(0,40)});
    if (auth.currentUser) await saveSchoolCodeToProfile(schoolId, schoolName);
    syncPushAudience();
    closeAuthModal();
    markWelcomeAccepted();
    showHome();
    showSchoolLoginMessage(local ? '学校IDを確認しました。学習履歴はこの端末に保存されます' :
      (validRange ? '学校・クラスでログインしました' : '学校に参加しました。テスト範囲は未設定です'));
  } catch (e) {
    console.warn('loginSchoolClass error:', e);
    showSchoolLoginMessage(e.code === 'permission-denied' ? '学校・クラスの設定を取得できません。管理者にFirestoreルールを確認してもらってください' :
      (e.message || '学校IDを確認できませんでした'), true);
  } finally { if (button) button.disabled = false; }
}

async function refreshClassTestRange() {
  const a = activeClassAssignment;
  if (!a || !(a.local === true && !auth.currentUser || auth.currentUser && a.uid === auth.currentUser.uid) || !navigator.onLine) return;
  try {
    const schoolSnap = await db.collection('schoolCodes').doc(a.schoolId).get();
    if (!schoolSnap.exists || schoolSnap.data()?.active === false) { storeClassAssignment(null); return; }
    let data = schoolSnap.data();
    if (a.classId) {
      const snap = await db.collection('schoolCodes').doc(a.schoolId).collection('classes').doc(a.classId).get();
      if (!snap.exists || snap.data()?.active === false) { storeClassAssignment(null); return; }
      data = snap.data();
    }
    const startId = Number(data.startId), endId = Number(data.endId);
    const valid = Number.isInteger(startId) && Number.isInteger(endId) && startId >= WORDS[0].id &&
      endId <= WORDS[WORDS.length-1].id && startId <= endId;
    storeClassAssignment({ ...a, startId:valid ? startId : null, endId:valid ? endId : null,
      className:a.classId ? String(data.className || '').slice(0,40) : '' });
  } catch(e) { console.warn('refreshClassTestRange error:',e); }
}

async function saveClassTestRange() {
  if (!isSchoolAdmin()) { showSyncStatus('管理者のみ設定できます', true); return; }
  const schoolId = normalizeSchoolCode(document.getElementById('admin-class-school')?.value);
  const classId = normalizeClassId(document.getElementById('admin-class-id')?.value);
  const className = String(document.getElementById('admin-class-name')?.value || '').trim().slice(0,40);
  const startId = Number(document.getElementById('admin-class-start')?.value);
  const endId = Number(document.getElementById('admin-class-end')?.value);
  if (!schoolId || !Number.isInteger(startId) || !Number.isInteger(endId) ||
    startId < WORDS[0].id || endId > WORDS[WORDS.length - 1].id || startId > endId) {
    showSyncStatus('学校ID・クラスIDと正しい単語範囲を入力してください', true); return;
  }
  try {
    const school = await db.collection('schoolCodes').doc(schoolId).get();
    if (!school.exists || school.data()?.active === false) throw new Error('先に有効な学校IDを発行してください');
    if (classId) {
      await db.collection('schoolCodes').doc(schoolId).collection('classes').doc(classId).set({
        classId,className,startId,endId,active:true,
        updatedAt:firebase.firestore.FieldValue.serverTimestamp()
      },{merge:true});
    } else {
      await db.collection('schoolCodes').doc(schoolId).set({startId,endId,updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});
    }
    showSyncStatus(`${schoolId}${classId ? ' / ' + classId : ''}：${startId}〜${endId}番を保存しました`);
  } catch(e) { console.warn('saveClassTestRange error:',e); showSyncStatus(e.message || '範囲を保存できませんでした',true); }
}

function isSchoolAdmin(user = auth.currentUser) {
  if (!user) return false;
  const email = String(user.email || '').toLowerCase();
  const uid = String(user.uid || '');
  return ADMIN_UIDS.includes(uid) || ADMIN_EMAILS.map(v => String(v).toLowerCase()).includes(email);
}

async function getUserManagementProfile(user = auth.currentUser) {
  if (!user) return {};
  try {
    const snap = await db.collection('users').doc(user.uid).get();
    return snap.exists ? (snap.data() || {}) : {};
  } catch (e) {
    console.warn('getUserManagementProfile error:', e);
    return {};
  }
}

function getLocalUserRole(profile = null, user = auth.currentUser) {
  if (isSchoolAdmin(user)) return 'admin';
  return String((profile && profile.role) || 'user').trim() || 'user';
}

async function isTeacherUser(user = auth.currentUser) {
  if (!user) return false;
  if (isSchoolAdmin(user)) return true;
  const profile = await getUserManagementProfile(user);
  return String(profile.role || '').trim() === 'teacher';
}

function showSuspendedOverlay() {
  let el = document.getElementById('suspended-account-overlay');
  if (!el) {
    el = document.createElement('div');
    el.id = 'suspended-account-overlay';
    el.className = 'suspended-overlay';
    document.body.appendChild(el);
  }
  el.innerHTML = `
    <div class="suspended-card">
      <div class="suspended-icon">⛔</div>
      <h1>利用停止中</h1>
      <p>${escapeHtml(USER_SUSPENDED_MESSAGE)}</p>
      <button class="btn btn-secondary" onclick="location.reload()">再読み込み</button>
    </div>`;
  el.classList.add('show');
}

function hideSuspendedOverlay() {
  const el = document.getElementById('suspended-account-overlay');
  if (el) el.classList.remove('show');
}

function showRoleAccessMessage(title, message, showLogin = false) {
  const body = document.getElementById('role-page-body');
  if (!body) return;
  body.innerHTML = `
    <div class="role-access-card">
      <div class="role-access-icon">🔒</div>
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(message)}</p>
      <div class="role-access-actions">
        ${showLogin ? '<button class="btn btn-primary" onclick="showAuthModal()">ログインする</button>' : ''}
        <button class="btn btn-secondary" onclick="location.href='./index.html'">ホームへ戻る</button>
      </div>
    </div>`;
}

async function initRolePage(pageType) {
  const loading = document.getElementById('loading-screen');
  if (loading) loading.style.display = 'none';
  renderAuthFab();

  const user = await waitForAuthReady(3500);
  if (!user) {
    showRoleAccessMessage('ログインが必要です', 'このページはアクセス許可を持つユーザーのみ利用できます。', true);
    return;
  }

  const profile = await getUserManagementProfile(user);
  if (profile.disabledInApp === true && !isSchoolAdmin(user)) {
    showSuspendedOverlay();
    try { await auth.signOut(); } catch (e) {}
    showRoleAccessMessage('利用停止中', USER_SUSPENDED_MESSAGE, false);
    return;
  }

  if (pageType === 'admin') {
    if (!isSchoolAdmin(user)) {
      showRoleAccessMessage('管理者専用ページです', '管理者権限を持つアカウントのみアクセスできます。', false);
      return;
    }
    const body = document.getElementById('role-page-body');
    if (body) body.innerHTML = '<div id="admin-dashboard-body" class="admin-dashboard-body"></div>';
    await loadAdminDashboard();
    return;
  }

  if (pageType === 'teacher') {
    const role = getLocalUserRole(profile, user);
    if (role !== 'teacher' && role !== 'admin') {
      showRoleAccessMessage('先生専用ページです', '先生または管理者に設定されたアカウントのみアクセスできます。', false);
      return;
    }
    await loadTeacherDashboard(profile);
  }
}

async function loadTeacherDashboard(profile = {}) {
  const body = document.getElementById('role-page-body');
  if (!body) return;
  body.innerHTML = '<div class="school-muted">先生用データを読み込み中...</div>';
  try {
    const schoolCode = normalizeSchoolCode(profile.schoolCode || getSchoolCode() || '');
    const [rankingSnap, usersSnap, codesSnap] = await Promise.all([
      db.collection(RANKINGS_COLLECTION).limit(500).get().catch(() => null),
      db.collection('users').limit(500).get().catch(() => null),
      db.collection('schoolCodes').limit(200).get().catch(() => null)
    ]);
    let rankingRows = rankingSnap && rankingSnap.docs ? rankingSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })) : [];
    let userRows = usersSnap && usersSnap.docs ? usersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })) : [];
    if (schoolCode) {
      rankingRows = rankingRows.filter(row => normalizeSchoolCode(row.schoolCode) === schoolCode);
      userRows = userRows.filter(row => normalizeSchoolCode(row.schoolCode) === schoolCode);
    }
    rankingRows.sort((a,b) =>
      (Number(b.mastered || 0) - Number(a.mastered || 0)) ||
      (Number(b.totalCorrect || 0) - Number(a.totalCorrect || 0)) ||
      (Number(b.accuracy || 0) - Number(a.accuracy || 0))
    );
    const activeCodes = codesSnap && codesSnap.docs ? codesSnap.docs.filter(doc => (doc.data() || {}).active !== false).length : 0;
    body.innerHTML = `
      <div class="admin-hero teacher-hero">
        <div>
          <div class="admin-hero-kicker">TEACHER DASHBOARD</div>
          <div class="admin-hero-title">先生用ページ</div>
          <div class="admin-hero-sub">${schoolCode ? escapeHtml(schoolCode) + ' の' : ''}学習状況を確認できます。設定変更は管理者ページのみ可能です。</div>
        </div>
        <button class="admin-refresh-btn" onclick="loadTeacherDashboard()">↻ 更新</button>
      </div>
      <div class="admin-dashboard-grid admin-stat-grid-new">
        <div class="admin-stat"><div class="admin-stat-icon">👥</div><div class="admin-stat-value">${userRows.length}</div><div class="admin-stat-label">登録ユーザー</div></div>
        <div class="admin-stat"><div class="admin-stat-icon">🏆</div><div class="admin-stat-value">${rankingRows.length}</div><div class="admin-stat-label">ランキング参加者</div></div>
        <div class="admin-stat"><div class="admin-stat-icon">🔑</div><div class="admin-stat-value">${activeCodes}</div><div class="admin-stat-label">有効コード</div></div>
      </div>
      <section class="admin-panel">
        <div class="admin-panel-head"><div><div class="admin-section-title">学習ランキング</div><div class="admin-card-sub">先生権限では閲覧のみできます。</div></div></div>
        <div class="teacher-ranking-list">
          ${rankingRows.slice(0, 50).map((row, i) => `<div class="teacher-row"><strong>#${i + 1}</strong><span>${escapeHtml(getPublicRankingName(row))}</span><span>◎ ${Number(row.mastered || 0)}</span><span>正答率 ${Number(row.accuracy || 0).toFixed(1)}%</span></div>`).join('') || '<div class="school-muted">まだランキングデータがありません。</div>'}
        </div>
      </section>
      <section class="admin-panel">
        <div class="admin-panel-head"><div><div class="admin-section-title">ユーザー一覧</div><div class="admin-card-sub">利用停止やロール変更は管理者ページで行います。</div></div></div>
        <div class="teacher-user-list">
          ${userRows.slice(0, 100).map(row => `<div class="teacher-row"><span>${escapeHtml(row.profileNickname || row.publicName || row.nickname || '名前未設定')}</span><span>${escapeHtml(row.email || 'メール未取得')}</span><span>${escapeHtml(row.role || 'user')}</span><span>${row.disabledInApp ? '停止中' : '有効'}</span></div>`).join('') || '<div class="school-muted">ユーザー情報がありません。</div>'}
        </div>
      </section>`;
  } catch (e) {
    console.warn('loadTeacherDashboard error:', e);
    body.innerHTML = '<div class="role-access-card"><h1>読み込みに失敗しました</h1><p>Firestoreルールと権限設定を確認してください。</p></div>';
  }
}

async function saveSchoolCodeToProfile(code, name = '') {
  if (!auth.currentUser) return;
  try {
    await db.collection('users').doc(auth.currentUser.uid).set({
      schoolCode: normalizeSchoolCode(code) || null,
      schoolName: name || null,
      schoolCodeUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    await syncLeaderboardProfile();
  } catch (e) {
    console.warn('saveSchoolCodeToProfile error:', e);
  }
}

async function loadSchoolCodeFromProfile() {
  if (!auth.currentUser) return;
  try {
    const snap = await db.collection('users').doc(auth.currentUser.uid).get();
    const data = snap.exists ? (snap.data() || {}) : {};
    if (data.schoolCode) setLocalSchoolCode(data.schoolCode, data.schoolName || '');
  } catch (e) {
    console.warn('loadSchoolCodeFromProfile error:', e);
  }
}

async function joinSchoolCode() {
  const input = document.getElementById('school-code-input');
  const code = normalizeSchoolCode(input ? input.value : '');
  if (!code) {
    showSyncStatus('参加コードを入力してください', true);
    return;
  }
  let name = '';
  try {
    const snap = await db.collection('schoolCodes').doc(code).get();
    if (!snap.exists) {
      showSyncStatus('この参加コードはまだ発行されていません', true);
      return;
    }
    const data = snap.data() || {};
    if (data.active === false) {
      showSyncStatus('この参加コードは停止中です', true);
      return;
    }
    name = String(data.schoolName || data.name || '').trim();
  } catch (e) {
    console.warn('joinSchoolCode validation error:', e);
    showSyncStatus('参加コードを確認できませんでした', true);
    return;
  }
  setLocalSchoolCode(code, name);
  await saveSchoolCodeToProfile(code, name);
  syncPushAudience();
  listenSchoolNotices();
  await fetchLeaderboard();
  renderHomeRankingPanel();
  renderAccountSettings();
  if (document.getElementById('screen-ranking')?.classList.contains('active')) renderRanking();
  showSyncStatus(`${name ? name + 'に' : ''}参加しました`);
}

async function clearSchoolCode() {
  setLocalSchoolCode('', '');
  storeClassAssignment(null);
  syncPushAudience();
  listenSchoolNotices();
  await saveSchoolCodeToProfile('', '');
  await fetchLeaderboard();
  renderHomeRankingPanel();
  renderAccountSettings();
  if (document.getElementById('screen-ranking')?.classList.contains('active')) renderRanking();
  showSyncStatus('学校コードを解除しました');
}

function makeSchoolCodeSuggestion() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function fillSchoolCodeSuggestion() {
  const input = document.getElementById('admin-school-code-input');
  if (input) input.value = makeSchoolCodeSuggestion();
}

async function issueSchoolCode() {
  if (!auth.currentUser) {
    showSyncStatus('管理者ログインが必要です', true);
    return;
  }
  if (!isSchoolAdmin()) {
    showSyncStatus('参加コードを発行できるのは管理者のみです', true);
    return;
  }
  const nameEl = document.getElementById('admin-school-name-input');
  const codeEl = document.getElementById('admin-school-code-input');
  const schoolName = String(nameEl ? nameEl.value : '').trim().slice(0, 40);
  const code = normalizeSchoolCode(codeEl ? codeEl.value : '');
  if (!schoolName) {
    showSyncStatus('学校名を入力してください', true);
    return;
  }
  if (!code || code.length < 4) {
    showSyncStatus('参加コードは4文字以上で入力してください', true);
    return;
  }
  try {
    const ref = db.collection('schoolCodes').doc(code);
    const existing = await ref.get();
    if (existing.exists) {
      showSyncStatus('この参加コードはすでに使われています', true);
      return;
    }
    await ref.set({
      code,
      schoolName,
      active: true,
      createdByUid: auth.currentUser.uid,
      createdByEmail: auth.currentUser.email || '',
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    if (codeEl) codeEl.value = code;
    showSyncStatus(`参加コード「${code}」を発行しました`);
    await loadIssuedSchoolCodes();
  } catch (e) {
    console.warn('issueSchoolCode error:', e);
    showSyncStatus('発行に失敗しました。Firestoreルールと管理者設定を確認してください', true);
  }
}

async function loadIssuedSchoolCodes() {
  const list = document.getElementById('admin-school-code-list');
  if (!list) return;
  if (!auth.currentUser || !isSchoolAdmin()) {
    list.innerHTML = '<div class="school-muted">管理者ログイン時のみ発行済みコードを表示します。</div>';
    return;
  }
  try {
    const snap = await db.collection('schoolCodes').orderBy('createdAt', 'desc').limit(20).get();
    if (snap.empty) {
      list.innerHTML = '<div class="school-muted">まだ発行済みコードはありません。</div>';
      return;
    }
    list.innerHTML = snap.docs.map(doc => {
      const data = doc.data() || {};
      const active = data.active !== false;
      return `<div class="school-code-item">
        <div><div class="school-code-main">${escapeHtml(doc.id)}</div><div class="school-code-sub">${escapeHtml(data.schoolName || '学校名なし')} ／ ${active ? '有効' : '停止中'}</div></div>
        <button class="school-small-btn" onclick="toggleSchoolCodeActive('${escapeHtml(doc.id)}', ${active ? 'false' : 'true'})">${active ? '停止' : '有効化'}</button>
      </div>`;
    }).join('');
  } catch (e) {
    console.warn('loadIssuedSchoolCodes error:', e);
    list.innerHTML = '<div class="school-muted">発行済みコードを取得できませんでした。</div>';
  }
}

async function toggleSchoolCodeActive(code, active) {
  if (!auth.currentUser || !isSchoolAdmin()) {
    showSyncStatus('管理者のみ変更できます', true);
    return;
  }
  try {
    await db.collection('schoolCodes').doc(normalizeSchoolCode(code)).set({
      active: !!active,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    showSyncStatus(active ? '参加コードを有効化しました' : '参加コードを停止しました');
    await loadIssuedSchoolCodes();
  } catch (e) {
    console.warn('toggleSchoolCodeActive error:', e);
    showSyncStatus('変更に失敗しました', true);
  }
}


async function deleteSchoolCode(code) {
  if (!auth.currentUser || !isSchoolAdmin()) {
    showSyncStatus('管理者のみ削除できます', true);
    return;
  }
  const normalized = normalizeSchoolCode(code);
  if (!normalized) return;
  if (!confirm(`参加コード「${normalized}」を削除しますか？参加中ユーザーの表示には影響する場合があります。`)) return;
  try {
    await db.collection('schoolCodes').doc(normalized).delete();
    showSyncStatus('参加コードを削除しました');
    await loadAdminDashboard();
    await loadIssuedSchoolCodes();
  } catch (e) {
    console.warn('deleteSchoolCode error:', e);
    showSyncStatus('削除に失敗しました', true);
  }
}



// =========================================================
// INSTALLED APP PUSH NOTIFICATIONS
// =========================================================
function isInstalledPwa() {
  return !!(
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true ||
    document.referrer.startsWith('android-app://')
  );
}

function getPushClientId() {
  try {
    let id = localStorage.getItem(PUSH_CLIENT_ID_KEY);
    if (!id) {
      id = (crypto && crypto.randomUUID) ? crypto.randomUUID() : ('client_' + Date.now() + '_' + Math.random().toString(36).slice(2));
      localStorage.setItem(PUSH_CLIENT_ID_KEY, id);
    }
    return id;
  } catch (e) {
    return 'client_' + Date.now() + '_' + Math.random().toString(36).slice(2);
  }
}

function getPushStatusLabel() {
  if (!('Notification' in window)) return 'このブラウザは通知に対応していません';
  if (!isInstalledPwa()) return 'アプリをホーム画面に追加するとプッシュ通知を有効化できます';
  if (!FCM_VAPID_KEY || FCM_VAPID_KEY.includes('PASTE_YOUR')) return '管理者によるプッシュ通知の設定が必要です';
  if (Notification.permission === 'granted' && localStorage.getItem(PUSH_ENABLED_KEY) === '1') return 'プッシュ通知は有効です';
  if (Notification.permission === 'denied') return 'ブラウザ設定で通知がブロックされています';
  return 'プッシュ通知はまだ有効化されていません';
}

async function enableInstalledPushNotifications() {
  if (!isInstalledPwa()) {
    showSyncStatus('通知はインストール済みアプリでのみ有効化できます', true);
    return;
  }
  if (!messaging) {
    showSyncStatus('Firebase Messagingを利用できません', true);
    return;
  }
  if (!FCM_VAPID_KEY || FCM_VAPID_KEY.includes('PASTE_YOUR')) {
    showSyncStatus('FCM_VAPID_KEYを設定してください', true);
    return;
  }
  if (!('Notification' in window)) {
    showSyncStatus('このブラウザは通知に対応していません', true);
    return;
  }
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      showSyncStatus('通知が許可されませんでした', true);
      renderAuthFab();
      return;
    }
    const registration = await navigator.serviceWorker.ready;
    const token = await messaging.getToken({ vapidKey: FCM_VAPID_KEY, serviceWorkerRegistration: registration });
    if (!token) throw new Error('FCM token was empty');
    const clientId = getPushClientId();
    await db.collection('pushTokens').doc(clientId).set({
      token,
      clientId,
      active: true,
      installedOnly: true,
      userAgent: navigator.userAgent.slice(0, 240),
      uid: auth.currentUser ? auth.currentUser.uid : null,
      schoolId: getSchoolCode() || null,
      classId: activeClassAssignment?.classId || '',
      email: auth.currentUser ? (auth.currentUser.email || '') : '',
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    localStorage.setItem(PUSH_ENABLED_KEY,'1');
    showSyncStatus('インストール済みアプリへの通知を有効化しました');
    renderNoticeInbox();
    renderAuthFab();
  } catch (e) {
    console.warn('enableInstalledPushNotifications error:', e);
    showSyncStatus('通知の有効化に失敗しました', true);
  }
}

async function disableInstalledPushNotifications() {
  try {
    const clientId = getPushClientId();
    await db.collection('pushTokens').doc(clientId).set({
      active: false,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    localStorage.removeItem(PUSH_ENABLED_KEY);
    showSyncStatus('通知を停止しました');
    renderNoticeInbox();
    renderAuthFab();
  } catch (e) {
    console.warn('disableInstalledPushNotifications error:', e);
    showSyncStatus('通知停止に失敗しました', true);
  }
}

async function sendAdminPushNotification() {
  if (!auth.currentUser || !isSchoolAdmin()) {
    showSyncStatus('管理者のみ通知を送信できます', true);
    return;
  }
  const title = String(document.getElementById('admin-push-title')?.value || '').trim().slice(0, 60);
  const body = String(document.getElementById('admin-push-body')?.value || '').trim().slice(0, 180);
  if (!title || !body) {
    showSyncStatus('通知タイトルと本文を入力してください', true);
    return;
  }
  try {
    await db.collection('pushNotifications').add({
      title,
      body,
      target: 'installed',
      status: 'queued',
      createdByUid: auth.currentUser.uid,
      createdByEmail: auth.currentUser.email || '',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    document.getElementById('admin-push-title').value = '';
    document.getElementById('admin-push-body').value = '';
    showSyncStatus('通知送信リクエストを作成しました');
    await loadAdminDashboard();
  } catch (e) {
    console.warn('sendAdminPushNotification error:', e);
    showSyncStatus('通知送信に失敗しました。Firestoreルールを確認してください', true);
  }
}


function buildAdminUserRows(usersSnap, rankingSnap) {
  const map = new Map();
  try {
    if (rankingSnap && rankingSnap.docs) {
      rankingSnap.docs.forEach(doc => {
        const data = doc.data() || {};
        map.set(doc.id, {
          id: doc.id,
          uid: data.uid || doc.id,
          email: data.email || '',
          profileNickname: data.profileNickname || data.nickname || data.name || '',
          publicName: data.publicName || data.nickname || data.name || '',
          schoolCode: data.schoolCode || '',
          schoolName: data.schoolName || '',
          role: data.role || 'user',
          disabledInApp: data.disabledInApp === true,
          note: data.note || '',
          done: Number(data.done || 0),
          mastered: Number(data.mastered || 0),
          totalAnswered: Number(data.totalAnswered || 0),
          accuracy: Number(data.accuracy || 0),
          source: 'ranking'
        });
      });
    }
    if (usersSnap && usersSnap.docs) {
      usersSnap.docs.forEach(doc => {
        const data = doc.data() || {};
        const prev = map.get(doc.id) || { id: doc.id, uid: doc.id, source: 'user' };
        map.set(doc.id, {
          ...prev,
          id: doc.id,
          uid: data.uid || prev.uid || doc.id,
          email: data.email || prev.email || '',
          profileNickname: data.profileNickname || data.nickname || prev.profileNickname || prev.publicName || '',
          publicName: data.publicName || prev.publicName || data.profileNickname || data.nickname || '',
          schoolCode: data.schoolCode || prev.schoolCode || '',
          schoolName: data.schoolName || prev.schoolName || '',
          role: data.role || prev.role || 'user',
          disabledInApp: data.disabledInApp === true,
          note: data.note || prev.note || '',
          source: prev.source === 'ranking' ? 'user+ranking' : 'user'
        });
      });
    }
  } catch (e) {
    console.warn('buildAdminUserRows error:', e);
  }
  return Array.from(map.values()).sort((a, b) => {
    if ((b.totalAnswered || 0) !== (a.totalAnswered || 0)) return (b.totalAnswered || 0) - (a.totalAnswered || 0);
    return String(a.profileNickname || a.email || a.uid).localeCompare(String(b.profileNickname || b.email || b.uid), 'ja');
  });
}

function renderAdminUserRows(rows) {
  if (!rows || !rows.length) return '<div class="school-muted admin-empty">登録ユーザー情報はまだありません。</div>';
  return rows.map(row => {
    const uid = escapeHtml(row.id || row.uid || '');
    const nick = escapeHtml(row.profileNickname || row.publicName || '');
    const email = escapeHtml(row.email || 'メール未取得');
    const schoolCode = escapeHtml(normalizeSchoolCode(row.schoolCode || ''));
    const schoolName = escapeHtml(row.schoolName || '');
    const role = escapeHtml(row.role || 'user');
    const note = escapeHtml(row.note || '');
    const suspended = row.disabledInApp === true;
    const stats = `回答 ${Number(row.totalAnswered || 0)}問 ／ 習得 ${Number(row.mastered || 0)}語 ／ 正答率 ${Number(row.accuracy || 0)}%`;
    return `<div class="admin-user-row" data-admin-user-row data-search="${uid} ${email} ${nick} ${schoolCode} ${schoolName} ${role}">
      <div class="admin-user-summary">
        <div class="admin-user-avatar">${suspended ? '⛔' : '👤'}</div>
        <div>
          <div class="admin-user-name">${nick || '名前未設定'} <span class="admin-pill ${suspended ? 'off' : 'on'}">${suspended ? '停止中' : '有効'}</span></div>
          <div class="admin-user-sub">${email} ／ UID: <span class="admin-mono">${uid}</span></div>
          <div class="admin-user-sub">${escapeHtml(stats)}</div>
        </div>
      </div>
      <div class="admin-user-edit-grid">
        <label class="admin-field"><span>表示名</span><input id="admin-user-nick-${uid}" class="account-input" maxlength="24" value="${nick}" placeholder="表示名"></label>
        <label class="admin-field"><span>学校コード</span><input id="admin-user-school-code-${uid}" class="account-input" maxlength="20" value="${schoolCode}" placeholder="ABC123"></label>
        <label class="admin-field"><span>学校名</span><input id="admin-user-school-name-${uid}" class="account-input" maxlength="40" value="${schoolName}" placeholder="学校名・クラス名"></label>
        <label class="admin-field"><span>権限</span><select id="admin-user-role-${uid}" class="account-input"><option value="user" ${role === 'user' ? 'selected' : ''}>一般</option><option value="teacher" ${role === 'teacher' ? 'selected' : ''}>先生</option><option value="admin" ${role === 'admin' ? 'selected' : ''}>管理者メモ</option></select></label>
        <label class="admin-field admin-user-note-field"><span>管理メモ</span><input id="admin-user-note-${uid}" class="account-input" maxlength="80" value="${note}" placeholder="任意メモ"></label>
      </div>
      <div class="admin-user-actions">
        <button class="btn btn-primary" onclick="saveAdminUserProfile('${uid}')">変更を保存</button>
        <button class="btn btn-secondary" onclick="toggleAdminUserSuspended('${uid}', ${suspended ? 'false' : 'true'})">${suspended ? '利用停止を解除' : '利用停止にする'}</button>
        <button class="school-small-btn danger" onclick="deleteAdminUserAppData('${uid}')">アプリ情報を削除</button>
      </div>
    </div>`;
  }).join('');
}

function filterAdminUserRows() {
  const q = String(document.getElementById('admin-user-search')?.value || '').trim().toLowerCase();
  document.querySelectorAll('[data-admin-user-row]').forEach(row => {
    const hay = String(row.getAttribute('data-search') || '').toLowerCase();
    row.style.display = !q || hay.includes(q) ? '' : 'none';
  });
}

async function saveAdminUserProfile(uid) {
  if (!auth.currentUser || !isSchoolAdmin()) {
    showSyncStatus('管理者のみ変更できます', true);
    return;
  }
  const safeUid = String(uid || '').trim();
  if (!safeUid) return;
  const nickname = String(document.getElementById(`admin-user-nick-${safeUid}`)?.value || '').trim().slice(0, 24);
  const schoolCode = normalizeSchoolCode(document.getElementById(`admin-user-school-code-${safeUid}`)?.value || '');
  const schoolName = String(document.getElementById(`admin-user-school-name-${safeUid}`)?.value || '').trim().slice(0, 40);
  const role = String(document.getElementById(`admin-user-role-${safeUid}`)?.value || 'user').trim().slice(0, 20);
  const note = String(document.getElementById(`admin-user-note-${safeUid}`)?.value || '').trim().slice(0, 80);
  try {
    const payload = {
      uid: safeUid,
      profileNickname: nickname || null,
      publicName: nickname || null,
      schoolCode: schoolCode || null,
      schoolName: schoolName || null,
      role: role || 'user',
      note: note || null,
      updatedByUid: auth.currentUser.uid,
      updatedByEmail: auth.currentUser.email || '',
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    await db.collection('users').doc(safeUid).set(payload, { merge: true });
    await db.collection(RANKINGS_COLLECTION).doc(safeUid).set({
      nickname: nickname || null,
      name: nickname || null,
      schoolCode: schoolCode || null,
      schoolName: schoolName || null,
      updatedByUid: auth.currentUser.uid,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    showSyncStatus('ユーザー情報を保存しました');
    await loadAdminDashboard();
  } catch (e) {
    console.warn('saveAdminUserProfile error:', e);
    showSyncStatus('ユーザー情報の保存に失敗しました', true);
  }
}

async function toggleAdminUserSuspended(uid, disabled) {
  if (!auth.currentUser || !isSchoolAdmin()) {
    showSyncStatus('管理者のみ変更できます', true);
    return;
  }
  const safeUid = String(uid || '').trim();
  if (!safeUid) return;
  try {
    await db.collection('users').doc(safeUid).set({
      disabledInApp: !!disabled,
      disabledUpdatedByUid: auth.currentUser.uid,
      disabledUpdatedByEmail: auth.currentUser.email || '',
      disabledUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    await db.collection(RANKINGS_COLLECTION).doc(safeUid).set({ disabledInApp: !!disabled }, { merge: true });
    showSyncStatus(disabled ? 'ユーザーを利用停止にしました' : '利用停止を解除しました');
    await loadAdminDashboard();
  } catch (e) {
    console.warn('toggleAdminUserSuspended error:', e);
    showSyncStatus('利用停止状態の変更に失敗しました', true);
  }
}

async function deleteAdminUserAppData(uid) {
  if (!auth.currentUser || !isSchoolAdmin()) {
    showSyncStatus('管理者のみ変更できます', true);
    return;
  }
  const safeUid = String(uid || '').trim();
  if (!safeUid) return;
  if (!confirm('このユーザーのアプリ内プロフィールとランキング情報を削除します。Firebase Authenticationのログインアカウント自体は削除されません。よろしいですか？')) return;
  try {
    await Promise.all([
      db.collection('users').doc(safeUid).delete().catch(() => null),
      db.collection(RANKINGS_COLLECTION).doc(safeUid).delete().catch(() => null)
    ]);
    showSyncStatus('アプリ内ユーザー情報を削除しました');
    await loadAdminDashboard();
  } catch (e) {
    console.warn('deleteAdminUserAppData error:', e);
    showSyncStatus('削除に失敗しました', true);
  }
}

async function enforceUserSuspendedState(user) {
  if (!user || isSchoolAdmin(user)) return false;
  try {
    const snap = await db.collection('users').doc(user.uid).get();
    const data = snap.exists ? (snap.data() || {}) : {};
    if (data.disabledInApp === true) {
      showSuspendedOverlay();
      showSyncStatus(USER_SUSPENDED_MESSAGE, true);
      await auth.signOut();
      return true;
    }
    hideSuspendedOverlay();
  } catch (e) {
    console.warn('enforceUserSuspendedState error:', e);
  }
  return false;
}

async function loadAdminDashboard() {
  const wrap = document.getElementById('admin-dashboard-body');
  if (!wrap) return;
  if (!auth.currentUser || !isSchoolAdmin()) {
    wrap.innerHTML = '<div class="school-muted">管理者ログイン時のみダッシュボードを表示します。</div>';
    return;
  }
  wrap.innerHTML = '<div class="school-muted">管理者データを読み込み中...</div>';
  try {
    const [codesSnap, rankingSnap, settingsSnap, pushTokensSnap, pushNotificationsSnap, usersSnap] = await Promise.all([
      db.collection('schoolCodes').orderBy('createdAt', 'desc').limit(100).get(),
      db.collection(RANKINGS_COLLECTION).limit(500).get(),
      db.collection('appSettings').doc('global').get().catch(() => null),
      db.collection('pushTokens').where('active', '==', true).limit(1000).get().catch(() => null),
      db.collection('pushNotifications').orderBy('createdAt', 'desc').limit(5).get().catch(() => null),
      db.collection('users').limit(500).get().catch(() => null)
    ]);
    const rankingRows = rankingSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const codeRows = codesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const joinedCounts = {};
    rankingRows.forEach(row => {
      const c = normalizeSchoolCode(row.schoolCode);
      if (c) joinedCounts[c] = (joinedCounts[c] || 0) + 1;
    });
    const activeCount = codeRows.filter(row => row.active !== false).length;
    const schoolParticipants = Object.values(joinedCounts).reduce((a, b) => a + b, 0);
    const settings = settingsSnap && settingsSnap.exists ? (settingsSnap.data() || {}) : {};
    const pushTokenCount = pushTokensSnap ? pushTokensSnap.size : 0;
    const pushRows = pushNotificationsSnap ? pushNotificationsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })) : [];
    const userRows = buildAdminUserRows(usersSnap, rankingSnap);
    const suspendedUserCount = userRows.filter(row => row.disabledInApp === true).length;
    wrap.innerHTML = `
      <div class="admin-hero">
        <div>
          <div class="admin-hero-kicker">ADMIN DASHBOARD</div>
          <div class="admin-hero-title">管理者メニュー</div>
          <div class="admin-hero-sub">コード発行・通知・メンテナンスをここからまとめて管理できます。</div>
        </div>
        <button class="admin-refresh-btn" onclick="loadAdminDashboard()">↻ 更新</button>
      </div>

      <div class="admin-dashboard-grid admin-stat-grid-new">
        <div class="admin-stat"><div class="admin-stat-icon">🔑</div><div class="admin-stat-value">${codeRows.length}</div><div class="admin-stat-label">発行コード</div></div>
        <div class="admin-stat"><div class="admin-stat-icon">✅</div><div class="admin-stat-value">${activeCount}</div><div class="admin-stat-label">有効コード</div></div>
        <div class="admin-stat"><div class="admin-stat-icon">🏆</div><div class="admin-stat-value">${rankingRows.length}</div><div class="admin-stat-label">ランキング参加者</div></div>
        <div class="admin-stat"><div class="admin-stat-icon">🏫</div><div class="admin-stat-value">${schoolParticipants}</div><div class="admin-stat-label">学校コード参加者</div></div>
        <div class="admin-stat"><div class="admin-stat-icon">🔔</div><div class="admin-stat-value">${pushTokenCount}</div><div class="admin-stat-label">通知許可端末</div></div>
        <div class="admin-stat"><div class="admin-stat-icon">👥</div><div class="admin-stat-value">${userRows.length}</div><div class="admin-stat-label">登録ユーザー</div></div>
        <div class="admin-stat"><div class="admin-stat-icon">⛔</div><div class="admin-stat-value">${suspendedUserCount}</div><div class="admin-stat-label">停止中</div></div>
      </div>

      <div class="admin-panel-grid">
        <section class="admin-panel admin-panel-maintenance">
          <div class="admin-panel-head">
            <div>
              <div class="admin-section-title">公開状態</div>
              <h3>メンテナンス</h3>
            </div>
            <span class="admin-state-badge ${settings.maintenanceMode ? 'danger' : 'safe'}">${settings.maintenanceMode ? 'ON' : 'OFF'}</span>
          </div>
          <div class="admin-maintenance-panel ${settings.maintenanceMode ? 'is-on' : 'is-off'}">
            <div>
              <div class="admin-maintenance-title">現在：${settings.maintenanceMode ? 'メンテナンス中' : '通常公開中'}</div>
              <div class="school-muted">${settings.maintenanceMode ? '一般ユーザーはメンテナンス画面に移動します。' : '一般ユーザーは通常どおり利用できます。'}</div>
            </div>
            <div class="admin-maintenance-actions">
              <button class="btn btn-review" onclick="setMaintenanceModeOneTap(true)" ${settings.maintenanceMode ? 'disabled' : ''}>ONにする</button>
              <button class="btn btn-secondary" onclick="setMaintenanceModeOneTap(false)" ${settings.maintenanceMode ? '' : 'disabled'}>OFFにする</button>
            </div>
          </div>
        </section>

        <section class="admin-panel">
          <div class="admin-panel-head">
            <div>
              <div class="admin-section-title">お知らせ</div>
              <h3>新機能通知</h3>
            </div>
          </div>
          <div class="admin-settings-grid clean">
            <label class="admin-field"><span>タイトル</span><input id="admin-setting-notice-title" class="account-input" maxlength="60" value="${escapeHtml(settings.noticeTitle || '')}" placeholder="例：新しいテスト機能を追加しました"></label>
            <label class="admin-field"><span>本文</span><textarea id="admin-setting-notice-body" class="account-input admin-textarea" maxlength="240" placeholder="短い説明を入力">${escapeHtml(settings.noticeBody || '')}</textarea></label>
            <button class="btn btn-primary admin-wide-btn" onclick="saveAdminAppSettings()">保存する</button>
          </div>
        </section>

        <section class="admin-panel">
          <div class="admin-panel-head">
            <div>
              <div class="admin-section-title">PWA通知</div>
              <h3>インストール済みアプリへ送信</h3>
            </div>
          </div>
          <div class="admin-settings-grid clean">
            <label class="admin-field"><span>通知タイトル</span><input id="admin-push-title" class="account-input" maxlength="60" placeholder="例：新しい単語テストを追加しました"></label>
            <label class="admin-field"><span>通知本文</span><textarea id="admin-push-body" class="account-input admin-textarea" maxlength="180" placeholder="通知に表示する短い本文"></textarea></label>
            <button class="btn btn-primary admin-wide-btn" onclick="sendAdminPushNotification()">通知を送信</button>
          </div>
          <div class="admin-note">通知は、アプリをインストールして通知を許可した端末だけに送られます。</div>
        </section>
      </div>

      <section class="admin-panel admin-list-panel">
        <div class="admin-panel-head">
          <div>
            <div class="admin-section-title">送信履歴</div>
            <h3>直近の通知</h3>
          </div>
        </div>
        <div class="admin-code-dashboard-list">
          ${pushRows.length ? pushRows.map(row => `<div class="admin-code-row admin-list-row"><div><div class="school-code-main">${escapeHtml(row.title || '通知')}</div><div class="school-code-sub">${escapeHtml(row.status || 'queued')} ／ 成功 ${Number(row.successCount || 0)} 件 ／ 失敗 ${Number(row.failureCount || 0)} 件</div></div></div>`).join('') : '<div class="school-muted admin-empty">送信履歴はまだありません。</div>'}
        </div>
      </section>



      <section class="admin-panel admin-list-panel admin-user-panel">
        <div class="admin-panel-head">
          <div>
            <div class="admin-section-title">ユーザー管理</div>
            <h3>登録ユーザー情報</h3>
          </div>
        </div>
        <div class="admin-note">メールアドレス・パスワードそのものはFirebase Authentication側で管理されるため、この画面ではアプリ内プロフィール・学校コード・権限・利用停止状態を変更します。</div>
        <div class="admin-user-toolbar">
          <input id="admin-user-search" class="account-input" placeholder="名前・メール・UID・学校コードで検索" oninput="filterAdminUserRows()">
          <button class="btn btn-secondary" onclick="filterAdminUserRows()">検索</button>
        </div>
        <div class="admin-user-list" id="admin-user-list">
          ${renderAdminUserRows(userRows)}
        </div>
      </section>

      <section class="admin-panel admin-list-panel">
        <div class="admin-panel-head">
          <div>
            <div class="admin-section-title">学校コード</div>
            <h3>コード別参加状況</h3>
          </div>
        </div>
        <div class="admin-code-dashboard-list">
          ${codeRows.length ? codeRows.map(row => {
            const active = row.active !== false;
            const count = joinedCounts[row.id] || 0;
            return `<div class="admin-code-row admin-list-row">
              <div>
                <div class="school-code-main">${escapeHtml(row.id)} <span class="admin-pill ${active ? 'on' : 'off'}">${active ? '有効' : '停止中'}</span></div>
                <div class="school-code-sub">${escapeHtml(row.schoolName || '学校名なし')} ／ 参加者 ${count}人</div>
              </div>
              <div class="admin-code-actions">
                <button class="school-small-btn" onclick="toggleSchoolCodeActive('${escapeHtml(row.id)}', ${active ? 'false' : 'true'}).then(loadAdminDashboard)">${active ? '停止' : '有効化'}</button>
                <button class="school-small-btn danger" onclick="deleteSchoolCode('${escapeHtml(row.id)}')">削除</button>
              </div>
            </div>`;
          }).join('') : '<div class="school-muted admin-empty">まだ発行済みコードはありません。</div>'}
        </div>
      </section>
    `;
  } catch (e) {
    console.warn('loadAdminDashboard error:', e);
    wrap.innerHTML = '<div class="school-muted">管理者データを取得できませんでした。Firestoreルールを確認してください。</div>';
  }
}

async function saveAdminAppSettings() {
  if (!auth.currentUser || !isSchoolAdmin()) {
    showSyncStatus('管理者のみ設定変更できます', true);
    return;
  }
  const title = String(document.getElementById('admin-setting-notice-title')?.value || '').trim().slice(0, 60);
  const body = String(document.getElementById('admin-setting-notice-body')?.value || '').trim().slice(0, 240);
  try {
    await db.collection('appSettings').doc('global').set({
      noticeTitle: title,
      noticeBody: body,
      updatedByUid: auth.currentUser.uid,
      updatedByEmail: auth.currentUser.email || '',
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    showSyncStatus('管理者設定を保存しました');
  } catch (e) {
    console.warn('saveAdminAppSettings error:', e);
    showSyncStatus('設定保存に失敗しました', true);
  }
}

function renderSchoolCodeSettings() {
  const code = getSchoolCode();
  const name = getSchoolName();
  const admin = isSchoolAdmin();
  return `
    <div class="account-card school-code-card">
      <div class="ranking-meta-title">学校別参加コード</div>
      <div class="school-status-box ${code ? 'joined' : ''}">
        <div class="school-status-icon">${code ? '🏫' : '🔑'}</div>
        <div>
          <div class="school-status-title">${code ? `${escapeHtml(name || '学校グループ')}に参加中` : '学校グループ未参加'}</div>
          <div class="school-status-sub">${code ? `参加コード：${escapeHtml(code)}` : '発行済みコードを入力すると、同じ学校内ランキングに切り替わります。'}</div>
        </div>
      </div>
      <div class="school-join-row">
        <input id="school-code-input" class="account-input" value="${escapeHtml(code)}" placeholder="例：ABC123" maxlength="20">
        <button class="btn btn-primary" onclick="joinSchoolCode()">参加</button>
        <button class="btn btn-secondary" onclick="clearSchoolCode()">解除</button>
      </div>
      <div class="account-help">ログインなしでも端末に保存されます。ログイン中はアカウントにも保存されます。</div>
    </div>
    <div class="account-card push-settings-card">
      <div class="ranking-meta-title">インストール済みアプリ通知</div>
      <div class="school-status-box ${isInstalledPwa() ? 'joined' : ''}">
        <div class="school-status-icon">🔔</div>
        <div>
          <div class="school-status-title">${escapeHtml(getPushStatusLabel())}</div>
          <div class="school-status-sub">新機能や重要なお知らせを、アプリをインストールしている端末だけに通知します。</div>
        </div>
      </div>
      <div class="school-join-row">
        <button class="btn btn-primary" onclick="enableInstalledPushNotifications()">通知を有効化</button>
        <button class="btn btn-secondary" onclick="disableInstalledPushNotifications()">通知を停止</button>
      </div>
      <div class="account-help">ブラウザで開いているだけの場合は通知対象になりません。ホーム画面に追加・インストール後に有効化してください。</div>
    </div>
    <div class="account-card school-admin-card">
      <div class="admin-card-header"><div><div class="ranking-meta-title">管理者用コード発行</div><div class="admin-card-sub">学校・クラスごとの参加コードを作成できます。</div></div><span class="admin-card-mark">管理者</span></div>
      ${admin ? `
        <div class="school-admin-grid">
          <input id="admin-school-name-input" class="account-input" placeholder="学校名・クラス名 例：桜高校 2年A組" maxlength="40">
          <div class="school-admin-code-row">
            <input id="admin-school-code-input" class="account-input" placeholder="参加コード" maxlength="20">
            <button class="btn btn-secondary" onclick="fillSchoolCodeSuggestion()">自動生成</button>
          </div>
          <button class="btn btn-primary" onclick="issueSchoolCode()">コードを発行</button>
        </div>
        <div class="school-issued-head">発行済みコード</div>
        <div id="admin-school-code-list" class="school-code-list"></div>
        <div class="school-issued-head">クラス別・今回の単語テスト範囲</div>
        <div class="admin-class-range-form">
          <input id="admin-class-school" class="account-input" placeholder="発行済みの学校ID" maxlength="20">
          <input id="admin-class-id" class="account-input" placeholder="クラスID（学校共通なら空欄）" maxlength="20">
          <input id="admin-class-name" class="account-input" placeholder="クラス名 例：2年A組（任意）" maxlength="40">
          <input id="admin-class-start" class="account-input" type="number" min="1" max="339" placeholder="開始番号">
          <input id="admin-class-end" class="account-input" type="number" min="1" max="339" placeholder="終了番号">
          <button type="button" class="btn btn-primary" onclick="saveClassTestRange()">このクラスの範囲を保存</button>
        </div>
        <div class="school-issued-head">学習リマインドを設定</div>
        <p class="account-help">上の学校ID・クラスIDに対し、毎週の通知とテスト前日の通知を設定します。時刻は日本時間です。</p>
        <div class="admin-notice-schedule-form">
          <label>曜日 <select id="admin-notice-weekday" class="account-input"><option value="1">月曜</option><option value="2">火曜</option><option value="3">水曜</option><option value="4">木曜</option><option value="5">金曜</option><option value="6">土曜</option><option value="0">日曜</option></select></label>
          <label>時刻 <select id="admin-notice-hour" class="account-input">${Array.from({length:16},(_,i)=>`<option value="${i+7}" ${i===11?'selected':''}>${i+7}:00</option>`).join('')}</select></label>
          <label>テスト日（任意） <input id="admin-notice-test-date" type="date" class="account-input"></label>
          <button type="button" class="btn btn-primary" onclick="saveStudySchedule()">通知予定を保存</button>
          <button type="button" class="btn btn-secondary" onclick="disableStudySchedule()">定期通知を停止</button>
        </div>
        <div class="admin-dashboard-card">
          
          <div id="admin-dashboard-body" class="admin-dashboard-body"></div>
        </div>
      ` : `
        <div class="school-muted">参加コードの発行は管理者のみ可能です。管理者にするには、assets/js/app.js の ADMIN_EMAILS または ADMIN_UIDS に対象アカウントを追加してください。</div>
      `}
    </div>
  `;
}

function hasSeenFeatureNotice() {
  try { return localStorage.getItem(FEATURE_NOTICE_SEEN_KEY) === '1'; } catch (e) { return false; }
}

function markFeatureNoticeSeen() {
  try { localStorage.setItem(FEATURE_NOTICE_SEEN_KEY, '1'); } catch (e) {}
  updateFeatureNoticeBadge();
}

function updateFeatureNoticeBadge() {
  const dot = document.getElementById('feature-notice-dot');
  const fab = document.getElementById('feature-notice-fab');
  const unseen = !hasSeenFeatureNotice();
  if (dot) dot.classList.toggle('show', unseen);
  if (fab) fab.classList.toggle('has-unread', unseen);
}

function renderFeatureNoticeList() {
  const list = document.getElementById('feature-notice-list');
  if (!list) return;
  list.innerHTML = FEATURE_NOTICES.map(item => `
    <div class="feature-notice-item">
      <div class="feature-notice-date">${escapeHtml(item.date)}</div>
      <div class="feature-notice-item-title">${escapeHtml(item.title)}</div>
      <div class="feature-notice-item-body">${escapeHtml(item.body)}</div>
    </div>
  `).join('');
}

function showFeatureNotice(force = false) {
  const modal = document.getElementById('feature-notice-modal');
  if (!modal) return;
  const welcome = document.getElementById('welcome-modal');
  if (!force && welcome && welcome.classList.contains('show')) return;
  if (!force && hasSeenFeatureNotice()) return;
  renderFeatureNoticeList();
  modal.classList.add('show');
  modal.setAttribute('aria-hidden', 'false');
  markFeatureNoticeSeen();
}

function showFeatureNoticeIfNeeded() {
  updateFeatureNoticeBadge();
  showFeatureNotice(false);
}

function closeFeatureNotice() {
  const modal = document.getElementById('feature-notice-modal');
  if (!modal) return;
  modal.classList.remove('show');
  modal.setAttribute('aria-hidden', 'true');
  markFeatureNoticeSeen();
}

function hasAcceptedWelcome() {
  try { return localStorage.getItem(WELCOME_ACCEPTED_KEY) === '1'; } catch (e) { return false; }
}

function markWelcomeAccepted() {
  try { localStorage.setItem(WELCOME_ACCEPTED_KEY, '1'); } catch (e) {}
}

function showWelcomeModalIfNeeded() {
  if (hasAcceptedWelcome()) { startOnboardingIfNeeded(); return; }
  const modal = document.getElementById('welcome-modal');
  if (!modal) return;
  modal.classList.add('show');
  modal.setAttribute('aria-hidden', 'false');
}

function closeWelcomeModal() {
  const modal = document.getElementById('welcome-modal');
  if (!modal) return;
  modal.classList.remove('show');
  modal.setAttribute('aria-hidden', 'true');
}

function acceptWelcomeAsGuest() {
  markWelcomeAccepted();
  closeWelcomeModal();
  startOnboardingIfNeeded();
}

function acceptWelcomeAndOpenLogin() {
  markWelcomeAccepted();
  closeWelcomeModal();
  startOnboardingIfNeeded();
}

const ONBOARDING_COMPLETE_KEY = 'systan_onboarding_completed_v1';
let onboardingStep = 0;
let onboardingAuthOpen = false;
const onboardingTutorial = [
  ['単語範囲を選ぶ', '学習タブで出題項目と単語番号を選び、「クイズ開始」を押します。'],
  ['答えて、次へ進む', '選択問題は答えをタップ。記述問題は入力して採点します。わからないときはカード内の「わからない」で飛ばせます。'],
  ['間違いを復習する', '間違えた単語は復習タブに集まります。間違いが10語以上になると、学習タブにも復習の案内が表示されます。']
];
function startOnboardingIfNeeded() {
  try { if (localStorage.getItem(ONBOARDING_COMPLETE_KEY) === '1') return; } catch (e) {}
  onboardingStep = 0;
  renderOnboarding();
}
function renderOnboarding() {
  const modal = document.getElementById('onboarding-modal');
  if (!modal) return;
  modal.classList.add('show');
  modal.setAttribute('aria-hidden', 'false');
  document.getElementById('onboarding-progress').innerHTML = Array.from({length:5}, (_, i) => `<span class="${i <= onboardingStep ? 'current' : ''}"></span>`).join('');
  const title = document.getElementById('onboarding-title');
  const description = document.getElementById('onboarding-description');
  const extra = document.getElementById('onboarding-extra');
  const actions = document.getElementById('onboarding-actions');
  const label = document.getElementById('onboarding-step-label');
  if (onboardingStep === 0) {
    label.textContent = 'STEP 1 / アカウント';
    title.textContent = '学習データを保存する';
    description.textContent = 'メールで新規登録、Google、学校IDで利用できます。登録は後からでも可能です。';
    extra.textContent = 'メールで登録する場合は、次の画面でメールアドレスとパスワードを入力し「新規登録」を押してください。';
    actions.innerHTML = '<button type="button" class="welcome-login-btn" onclick="openOnboardingAuth()">アカウントを作成・ログイン</button><button type="button" class="onboarding-skip" onclick="advanceOnboarding()">後で設定する</button>';
  } else if (onboardingStep === 1) {
    label.textContent = 'STEP 2 / 通知';
    title.textContent = '学習のお知らせ';
    description.textContent = '学校のテスト範囲の変更や学習リマインドを通知できます。設定しなくても学習とアプリ内通知は利用できます。';
    extra.textContent = getPushStatusLabel();
    actions.innerHTML = '<button type="button" class="welcome-login-btn" onclick="enableOnboardingNotifications()">通知を有効にする</button><button type="button" class="onboarding-skip" onclick="advanceOnboarding()">後で設定する</button>';
  } else {
    const index = onboardingStep - 2;
    label.textContent = `STEP ${onboardingStep + 1} / 使い方`;
    title.textContent = onboardingTutorial[index][0];
    description.textContent = onboardingTutorial[index][1];
    extra.textContent = `${index + 1} / ${onboardingTutorial.length}`;
    actions.innerHTML = `<button type="button" class="welcome-login-btn" onclick="advanceOnboarding()">${onboardingStep === 4 ? '学習を始める' : '次へ'}</button>`;
  }
}
function openOnboardingAuth() {
  onboardingAuthOpen = true;
  const modal = document.getElementById('onboarding-modal');
  modal.classList.remove('show');
  modal.setAttribute('aria-hidden', 'true');
  showAuthModal();
}
async function enableOnboardingNotifications() {
  await enableInstalledPushNotifications();
  if (onboardingStep === 1) document.getElementById('onboarding-extra').textContent = getPushStatusLabel();
}
function advanceOnboarding() {
  if (onboardingStep < 4) { onboardingStep++; renderOnboarding(); return; }
  try { localStorage.setItem(ONBOARDING_COMPLETE_KEY, '1'); } catch (e) {}
  const modal = document.getElementById('onboarding-modal');
  modal.classList.remove('show');
  modal.setAttribute('aria-hidden', 'true');
  showHome();
  window.scrollTo({top:0,behavior:'instant'});
}

async function acceptWelcomeAndLogin() {
  acceptWelcomeAndOpenLogin();
}

function renderAuthFab() {
  const el = document.getElementById('auth-fab');
  if (!el) return;
  const user = auth.currentUser;
  if (!user) {
    el.innerHTML = `
      <button class="auth-pill auth-pill-login" onclick="login()" title="ログイン">
        <span class="auth-dot-avatar">↗</span>
        <span class="auth-pill-text">
          <span class="auth-pill-name">ログイン</span>
          <span class="auth-pill-sub">Google / メール</span>
        </span>
      </button>
    `;
    return;
  }
  const nick = getPublicNickname(user);
  el.innerHTML = `
    <button class="auth-pill" onclick="showAccountSettings()" title="アカウント設定">
      <span class="auth-dot-avatar">${escapeHtml(getInitials(nick))}</span>
      <span class="auth-pill-text">
        <span class="auth-pill-name">${escapeHtml(nick)}</span>
        <span class="auth-pill-sub">アカウント設定</span>
      </span>
    </button>
  `;
}


async function saveCloudProgress() {
  if (!auth.currentUser) return;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    await db.collection('users').doc(auth.currentUser.uid).set({
      kobunAppState: raw,
      kobunAppStateUpdatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      profileNickname: getPublicNickname(auth.currentUser)
    }, { merge: true });
  } catch (e) {
    console.warn('saveCloudProgress error:', e);
  }
}

function queueCloudProgressSave() {
  if (!auth.currentUser) return;
  clearTimeout(cloudSaveTimer);
  cloudSaveTimer = setTimeout(() => {
    saveCloudProgress();
  }, 500);
}

async function restoreCloudProgress() {
  if (!auth.currentUser) return false;
  try {
    const snap = await db.collection('users').doc(auth.currentUser.uid).get();
    if (!snap.exists) return false;
    const data = snap.data() || {};
    if (!data.kobunAppState) return false;
    const localRaw = localStorage.getItem(STORAGE_KEY);
    const localSavedAt = (() => { try { return JSON.parse(localRaw || '{}').savedAt || ''; } catch(e) { return ''; } })();
    const remoteSavedAt = (() => { try { return JSON.parse(data.kobunAppState || '{}').savedAt || ''; } catch(e) { return ''; } })();
    if (remoteSavedAt && (!localSavedAt || new Date(remoteSavedAt).getTime() > new Date(localSavedAt).getTime())) {
      localStorage.setItem(STORAGE_KEY, data.kobunAppState);
      loadProgress();
      showSyncStatus('クラウドの学習記録を読み込みました');
      return true;
    }
    return false;
  } catch (e) {
    console.warn('restoreCloudProgress error:', e);
    return false;
  }
}

function getLeaderboardPayload() {
  const stats = getTotalStats();
  const mastered = stats['◎'] || 0;
  const done = (stats['○'] || 0) + (stats['◎'] || 0) + (stats['×'] || 0);
  const accuracy = leaderboardStats.totalAnswered > 0
    ? Math.round((leaderboardStats.totalCorrect / leaderboardStats.totalAnswered) * 1000) / 10
    : 0;

  return {
    uid: auth.currentUser ? auth.currentUser.uid : null,
    nickname: getPublicNickname(auth.currentUser),
    name: getPublicNickname(auth.currentUser),
    photoURL: '',
    mastered,
    done,
    totalAnswered: leaderboardStats.totalAnswered || 0,
    totalCorrect: leaderboardStats.totalCorrect || 0,
    totalWrong: leaderboardStats.totalWrong || 0,
    accuracy,
    schoolCode: getSchoolCode() || null,
    schoolName: getSchoolName() || null,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  };
}

function getPublicRankingName(row) {
  const nick = String((row && (row.nickname || row.publicName)) || '').trim();
  if (nick) return nick;
  return getAnonymousName(row && (row.uid || row.id));
}

async function loadAccountProfile() {
  if (!auth.currentUser) {
    accountProfile = { nickname: '' };
    return accountProfile;
  }
  try {
    const snap = await db.collection('users').doc(auth.currentUser.uid).get();
    const data = snap.exists ? (snap.data() || {}) : {};
    const remoteNickname = String(data.profileNickname || data.nickname || '').trim();
    accountProfile = { nickname: remoteNickname };
    if (remoteNickname && !getStoredNickname()) setStoredNickname(remoteNickname);
    if (data.schoolCode) setLocalSchoolCode(data.schoolCode, data.schoolName || '');
  } catch (e) {
    console.warn('loadAccountProfile error:', e);
  }
  return accountProfile;
}

async function saveAccountNickname() {
  if (!auth.currentUser) {
    showSyncStatus('ログイン後に設定できます', true);
    return;
  }
  const input = document.getElementById('account-nickname-input');
  const raw = input ? input.value.trim() : '';
  const nickname = raw.slice(0, 16);
  if (!nickname) {
    showSyncStatus('ニックネームを入力してください', true);
    return;
  }
  try {
    setStoredNickname(nickname);
    accountProfile.nickname = nickname;
    await db.collection('users').doc(auth.currentUser.uid).set({
      profileNickname: nickname,
      nicknameUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    await syncLeaderboardProfile();
    await fetchLeaderboard();
    renderAuthFab();
    renderAccountSettings();
    renderHomeRankingPanel();
    if (document.getElementById('screen-ranking') && document.getElementById('screen-ranking').classList.contains('active')) {
      renderRanking();
    }
    showSyncStatus('ニックネームを保存しました');
  } catch (e) {
    console.warn('saveAccountNickname error:', e);
    showSyncStatus('保存に失敗しました', true);
  }
}

async function syncLeaderboardProfile() {
  if (!auth.currentUser) return;
  try {
    await db.collection(RANKINGS_COLLECTION).doc(auth.currentUser.uid).set(getLeaderboardPayload(), { merge: true });
  } catch (e) {
    console.warn('syncLeaderboardProfile error:', e);
  }
}

async function fetchLeaderboard() {
  if (!auth.currentUser) {
    leaderboardCache = [];
    myLeaderboardRank = null;
    return [];
  }
  try {
    const snap = await db.collection(RANKINGS_COLLECTION).limit(100).get();
    leaderboardCache = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const activeSchoolCode = getSchoolCode();
    if (activeSchoolCode) {
      leaderboardCache = leaderboardCache.filter(row => normalizeSchoolCode(row.schoolCode) === activeSchoolCode);
    }
    leaderboardCache.sort((a, b) =>
      (Number(b.mastered || 0) - Number(a.mastered || 0)) ||
      (Number(b.totalCorrect || 0) - Number(a.totalCorrect || 0)) ||
      (Number(b.accuracy || 0) - Number(a.accuracy || 0))
    );
    const uid = auth.currentUser && auth.currentUser.uid;
    myLeaderboardRank = uid ? leaderboardCache.findIndex(item => item.id === uid) + 1 || null : null;
    return leaderboardCache;
  } catch (e) {
    console.warn('fetchLeaderboard error:', e);
    leaderboardCache = [];
    myLeaderboardRank = null;
    showSyncStatus('ランキングの取得に失敗しました', true);
    return [];
  }
}


function renderHomeRankingPanel() {
  const el = document.getElementById('home-ranking-panel');
  if (!el) return;
  const stats = getTotalStats();
  const mastered = stats['◎'] || 0;
  const answered = leaderboardStats.totalAnswered || 0;
  const accuracy = answered > 0 ? Math.round((leaderboardStats.totalCorrect / answered) * 1000) / 10 : 0;
  const rankLabel = auth.currentUser
    ? (myLeaderboardRank ? `#${myLeaderboardRank}` : '—')
    : 'Login';
  const sub = auth.currentUser
    ? `習得 ${mastered}語 ・ 正答率 ${accuracy}% ・ タップでランキングを見る`
    : 'ログインすると、あなたの成績を全体ランキングに反映できます';

  el.innerHTML = `
    <div class="ranking-panel" onclick="showRanking()">
      <div class="ranking-panel-icon">🏆</div>
      <div class="ranking-panel-info">
        <div class="ranking-panel-title">${getSchoolCode() ? '学校別ランキング' : 'ランキング'}</div>
        <div class="ranking-panel-sub">${getSchoolCode() ? `${escapeHtml(getSchoolName() || getSchoolCode())}内の順位 ／ ` : ''}${sub}</div>
      </div>
      <div class="ranking-panel-rank">
        <div class="ranking-panel-rank-num">${rankLabel}</div>
        <div class="ranking-panel-rank-label">${auth.currentUser ? 'あなたの順位' : 'ログイン推奨'}</div>
      </div>
    </div>
  `;
}

async function renderRanking() {
  const listEl = document.getElementById('ranking-list');
  const myEl = document.getElementById('ranking-my-summary');
  if (!listEl || !myEl) return;

  if (!auth.currentUser) {
    listEl.innerHTML = `<div class="ranking-locked"><div class="ranking-locked-icon">🔒</div><div class="ranking-locked-title">ランキングはログイン中のみ閲覧できます</div><div class="ranking-locked-sub">プライバシー保護のため、ランキングの閲覧と参加にはログインが必要です。表示名はGoogleアカウント名ではなく、ニックネームのみ使用します。</div><button class="btn btn-primary" onclick="login()">Googleでログイン</button></div>`;
    myEl.innerHTML = '<div class="ranking-note">ログイン後、アカウント設定でニックネームを変更できます。本名・メールアドレス・Googleプロフィール写真はランキングに表示しません。</div>';
    renderHomeRankingPanel();
    return;
  }

  await syncLeaderboardProfile();
  const rows = await fetchLeaderboard();
  if (!rows.length) {
    listEl.innerHTML = '<div class="ranking-empty">まだランキングデータがありません。最初の1人目になれます。</div>';
  } else {
    listEl.innerHTML = rows.slice(0, 20).map((row, idx) => {
      const me = row.id === auth.currentUser.uid;
      return `
        <div class="ranking-item ${idx === 0 ? 'top1' : idx === 1 ? 'top2' : idx === 2 ? 'top3' : ''} ${me ? 'me' : ''}">
          <div class="ranking-rank-badge">${idx + 1}</div>
          <div class="ranking-user">
            <div class="ranking-name">${escapeHtml(getPublicRankingName(row))} ${me ? '<span class="ranking-you-tag">YOU</span>' : ''}</div>
            <div class="ranking-sub">習得 ${row.mastered || 0}語 ／ 正解 ${row.totalCorrect || 0}回 ／ 正答率 ${Number(row.accuracy || 0).toFixed(1)}%</div>
          </div>
          <div class="ranking-score">
            <div class="ranking-score-main">${row.mastered || 0}</div>
            <div class="ranking-score-label">◎ mastered</div>
          </div>
        </div>
      `;
    }).join('');
  }

  const answered = leaderboardStats.totalAnswered || 0;
  const accuracy = answered > 0 ? Math.round((leaderboardStats.totalCorrect / answered) * 1000) / 10 : 0;
  myEl.innerHTML = `
    <div class="ranking-stat-grid">
      <div class="ranking-stat-box">
        <div class="ranking-stat-value">${myLeaderboardRank ? '#' + myLeaderboardRank : '—'}</div>
        <div class="ranking-stat-label">現在順位</div>
      </div>
      <div class="ranking-stat-box">
        <div class="ranking-stat-value">${getTotalStats()['◎'] || 0}</div>
        <div class="ranking-stat-label">習得語数 ◎</div>
      </div>
      <div class="ranking-stat-box">
        <div class="ranking-stat-value">${leaderboardStats.totalCorrect || 0}</div>
        <div class="ranking-stat-label">累計正解数</div>
      </div>
      <div class="ranking-stat-box">
        <div class="ranking-stat-value">${accuracy}%</div>
        <div class="ranking-stat-label">正答率</div>
      </div>
    </div>
  `;
  renderHomeRankingPanel();
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}


function renderRoleAccessSettingsCard(user) {
  if (!user) return '';
  const isAdmin = isSchoolAdmin(user);
  const isTeacher = String(accountProfile.role || '').trim() === 'teacher';
  if (!isAdmin && !isTeacher) return '';
  return `
    <div class="account-card role-access-settings-card">
      <div class="ranking-meta-title">権限メニュー</div>
      <div class="account-help">先生・管理者向けページはこちらから開けます。アクセス権限がないページは表示されません。</div>
      <div class="role-access-actions-row">
        ${isTeacher || isAdmin ? '<button class="btn btn-secondary role-access-action teacher" onclick="location.href=&quot;./teacher.html&quot;"><span>🏫</span><strong>先生用ページ</strong></button>' : ''}
        ${isAdmin ? '<button class="btn btn-secondary role-access-action admin" onclick="location.href=&quot;./admin.html&quot;"><span>🛠</span><strong>管理者ページ</strong></button>' : ''}
      </div>
    </div>
  `;
}

function renderAccountSettings() {
  const el = document.getElementById('account-settings-body');
  if (!el) return;
  const user = auth.currentUser;
  if (!user) {
    el.innerHTML = `
      <div class="account-layout">
        <div class="account-card">
          <div class="account-hero">
            <div class="account-avatar-large">↗</div>
            <div>
              <div class="account-title-main">ログインして学習データを同期</div>
              <div class="account-sub-main">ランキングの閲覧・参加、クラウド保存、ニックネーム設定にはログインが必要です。</div>
            </div>
          </div>
          <div class="account-actions">
            ${activeClassAssignment?.local ? '<button class="btn btn-secondary" onclick="leaveLocalSchool()">学校からログアウト</button>' : ''}
            <button class="btn btn-primary" onclick="showAuthModal()">ログイン / 新規登録</button>
            <button class="btn btn-secondary" onclick="startWithoutLogin();showHome();">ログインせずに始める</button>
            <button class="btn btn-secondary" onclick="showHome()">ホームへ戻る</button>
          </div>
        </div>
        <details class="account-card account-details"><summary>プライバシーと詳細設定</summary>
          <div class="ranking-meta-title">プライバシー</div>
          <div class="account-privacy-list">
            <div class="account-privacy-item"><span class="account-privacy-icon">🔒</span><span>ランキングはログイン中のみ閲覧できます。</span></div>
            <div class="account-privacy-item"><span class="account-privacy-icon">🏷️</span><span>ランキングにはニックネームだけを表示します。</span></div>
            <div class="account-privacy-item"><span class="account-privacy-icon">🙈</span><span>本名・メール・Googleプロフィール写真は表示しません。</span></div>
          </div>
          ${renderVoiceSettingsCard()}
          ${renderSchoolCodeSettings()}
        </details>
      </div>`;
    setTimeout(() => { loadIssuedSchoolCodes(); loadAdminDashboard(); }, 0);
    return;
  }

  const nick = getPublicNickname(user);
  const stats = getTotalStats();
  const answered = leaderboardStats.totalAnswered || 0;
  const accuracy = answered > 0 ? Math.round((leaderboardStats.totalCorrect / answered) * 1000) / 10 : 0;
  el.innerHTML = `
    <div class="account-layout">
      <div class="account-card">
        <div class="account-hero">
          <div class="account-avatar-large">${escapeHtml(getInitials(nick))}</div>
          <div>
            <div class="account-title-main">${escapeHtml(nick)}</div>
            <div class="account-sub-main">ランキング表示名とログイン状態を管理できます。</div>
          </div>
        </div>
        <details class="account-details"><summary>プロフィールとアカウントを管理</summary><div class="account-field">
          <div class="account-label">ランキング用ニックネーム</div>
          <input id="account-nickname-input" class="account-input" maxlength="16" value="${escapeHtml(nick)}" placeholder="例：古文単語マスター">
          <div class="account-help">最大16文字。本名ではなく、公開してもよい名前をおすすめします。</div>
        </div>
        <div class="account-actions">
          <button class="btn btn-primary" onclick="saveAccountNickname()">保存する</button>
          <button class="btn btn-secondary" onclick="showRanking()">ランキングを見る</button>
          ${isSchoolAdmin(user) ? '<button class="btn btn-secondary" onclick="location.href=\'./admin.html\'">管理者ページ</button>' : ''}
          ${String(accountProfile.role || '').trim() === 'teacher' || isSchoolAdmin(user) ? '<button class="btn btn-secondary" onclick="location.href=\'./teacher.html\'">先生用ページ</button>' : ''}
          <button class="btn btn-secondary" onclick="logout()">ログアウト</button>
        </div></details>
      </div>
      <div class="account-card">
        <div class="ranking-meta-title">あなたの状態</div>
        <div class="account-mini-stat">
          <div class="account-mini-box"><div class="account-mini-value">${stats['◎'] || 0}</div><div class="account-mini-label">習得語数 ◎</div></div>
          <div class="account-mini-box"><div class="account-mini-value">${myLeaderboardRank ? '#' + myLeaderboardRank : '—'}</div><div class="account-mini-label">現在順位</div></div>
          <div class="account-mini-box"><div class="account-mini-value">${leaderboardStats.totalCorrect || 0}</div><div class="account-mini-label">累計正解数</div></div>
          <div class="account-mini-box"><div class="account-mini-value">${accuracy}%</div><div class="account-mini-label">正答率</div></div>
        </div>
        <div class="account-privacy-list">
          <div class="account-privacy-item"><span class="account-privacy-icon">🔒</span><span>本名・メールアドレス・Google写真はランキングに出しません。</span></div>
          <div class="account-privacy-item"><span class="account-privacy-icon">☁️</span><span>ログイン中は学習データをクラウドに保存します。</span></div>
        </div>
      </div>
      <details class="account-card account-details"><summary>学習・学校・権限の設定</summary>
        ${renderRoleAccessSettingsCard(user)}
        ${renderVoiceSettingsCard()}
        ${renderSchoolCodeSettings()}
      </details>
    </div>`;
  setTimeout(() => { loadIssuedSchoolCodes(); loadAdminDashboard(); }, 0);
}


// =========================================================
// STORAGE
// =========================================================
const STORAGE_KEY = 'kobun_progress_v1';
let cloudSaveTimer = null;

function loadProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      if (saved.progress) {
        Object.keys(saved.progress).forEach(id => {
          const val = saved.progress[id];
          if (typeof val === 'string') {
            progress[id] = { q1: val || null, q2: null, q3: null };
          } else if (val && typeof val === 'object') {
            progress[id] = {
              q1: val.q1 || null,
              q2: val.q2 || null,
              q3: val.q3 || null,
              latestStatus: ['◎', '○', '×'].includes(val.latestStatus) ? val.latestStatus : null,
              latestAnsweredAt: Number(val.latestAnsweredAt) || null
            };
          }
        });
      }
      if (saved.quizProgress) {
        Object.keys(saved.quizProgress).forEach(id => {
          const qp = saved.quizProgress[id];
          if (!progress[id]) progress[id] = { q1: null, q2: null, q3: null };
          if (qp.q1) progress[id].q1 = qp.q1;
          if (qp.q2) progress[id].q2 = qp.q2;
          if (qp.q3) progress[id].q3 = qp.q3;
        });
      }
      if (saved.bookmarks && Array.isArray(saved.bookmarks)) {
        bookmarks = new Set(saved.bookmarks);
      }
      if (Number.isInteger(saved.normalQuizCount) && saved.normalQuizCount > 0) {
        normalQuizCount = saved.normalQuizCount;
      }
      if (Number.isInteger(saved.bookmarkQuizCount) && saved.bookmarkQuizCount > 0) {
        bookmarkQuizCount = saved.bookmarkQuizCount;
      }
      if (saved.setQuizRanges && typeof saved.setQuizRanges === 'object') {
        setQuizRanges = saved.setQuizRanges;
      }
      if (saved.leaderboardStats && typeof saved.leaderboardStats === 'object') {
        leaderboardStats = {
          totalAnswered: Number(saved.leaderboardStats.totalAnswered) || 0,
          totalCorrect: Number(saved.leaderboardStats.totalCorrect) || 0,
          totalWrong: Number(saved.leaderboardStats.totalWrong) || 0,
          updatedAt: saved.leaderboardStats.updatedAt || null
        };
      }
      if (saved.schoolCode) setLocalSchoolCode(saved.schoolCode, saved.schoolName || '');
      if (saved.savedAt) {
        window.__lastSavedAt = saved.savedAt;
      }
    }
  } catch(e) {
    console.warn('loadProgress error:', e);
    progress = {};
    bookmarks = new Set();
  }
}

function saveProgress() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      progress,
      bookmarks: Array.from(bookmarks),
      normalQuizCount,
      bookmarkQuizCount,
      setQuizRanges,
      leaderboardStats,
      schoolCode: getSchoolCode(),
      schoolName: getSchoolName(),
      savedAt: new Date().toISOString()
    }));
    queueCloudProgressSave();
  } catch(e) {
    console.warn('saveProgress error:', e);
  }
}

// =========================================================
// NAVIGATION
// =========================================================
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('loading-screen').style.display = 'none';
  document.getElementById(id).classList.add('active');
  const studying = id === 'screen-quiz';
  document.body.classList.toggle('is-quiz-active', studying);
  document.getElementById('mobile-bottom-nav')?.classList.toggle('hidden', studying);
}

function scrollQuizToTop() {
  window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  requestAnimationFrame(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: 'instant' }));
  });
}

function relocateDashboardPanels() {
  const targets = [
    ['home-word-search-panel', 'search-panel-slot'],
    ['home-stats', 'results-stats-slot'],
    ['home-ranking-panel', 'results-ranking-panel-slot']
  ];
  targets.forEach(([source, destination]) => {
    const node = document.getElementById(source);
    const slot = document.getElementById(destination);
    if (node && slot && node.parentElement !== slot) slot.appendChild(node);
  });
}

function showSearch() {
  relocateDashboardPanels();
  showScreen('screen-search');
  document.getElementById('home-word-search-input')?.focus();
}

function showProgress() {
  showResultsDashboard();
}

async function showResultsDashboard() {
  relocateDashboardPanels();
  const rankingContent = document.querySelector('#screen-ranking > .content');
  const slot = document.getElementById('results-leaderboard-slot');
  if (rankingContent && slot) slot.appendChild(rankingContent);
  renderHome();
  showScreen('screen-results-dashboard');
  await renderRanking();
}

function showAccountTab() {
  if (auth.currentUser || activeClassAssignment?.local) showAccountSettings();
  else login();
}

function showSearchWord(id) {
  if (!WORD_MAP[id]) return;
  setQuizRanges[0] = { startId: id, endId: id };
  showHome();
  document.getElementById('sets-grid')?.scrollIntoView({ behavior:'smooth', block:'start' });
}

const NOTICE_READ_KEY = 'systan_notice_read_v1';
const NOTICE_CACHE_KEY = 'systan_notice_cache_v1';
const PUSH_ENABLED_KEY = 'systan_push_enabled_v1';
let schoolNotices = [];
let noticeUnsubscribe = null;
let noticeAudience = '';
let noticeError = '';
function getReadNoticeIds() {
  try { return new Set(JSON.parse(localStorage.getItem(NOTICE_READ_KEY + '_' + getSchoolCode()) || '[]')); }
  catch(e) { return new Set(); }
}
function saveReadNoticeIds(ids) {
  try { localStorage.setItem(NOTICE_READ_KEY + '_' + getSchoolCode(), JSON.stringify([...ids].slice(-300))); } catch(e) {}
}
function getCachedNotices() {
  try { return JSON.parse(localStorage.getItem(NOTICE_CACHE_KEY + '_' + getSchoolCode()) || '[]'); }
  catch(e) { return []; }
}
function noticeMatchesClass(item) {
  return !item.classId || item.classId === (activeClassAssignment?.classId || '');
}
function updateNoticeBadge() {
  const el = document.getElementById('notice-nav-badge');
  if (!el) return;
  const read = getReadNoticeIds();
  const count = schoolNotices.filter(n => noticeMatchesClass(n) && !read.has(n.id)).length;
  el.textContent = count > 9 ? '9+' : String(count);
  el.hidden = count === 0;
}
function renderNoticeInbox() {
  const list = document.getElementById('notice-inbox-list');
  const status = document.getElementById('notice-push-status');
  if (!list) return;
  if (status) status.textContent = getPushStatusLabel();
  if (!getSchoolCode()) {
    list.innerHTML = '<div class="notice-empty">学校IDで参加すると、その学校の通知をここで確認できます。</div>';
    updateNoticeBadge(); return;
  }
  const read = getReadNoticeIds();
  const items = schoolNotices.filter(noticeMatchesClass).slice().sort((a,b) => (b.createdAtMillis || 0) - (a.createdAtMillis || 0)).slice(0,60);
  list.innerHTML = `${noticeError ? `<div class="notice-error">${escapeHtml(noticeError)}</div>` : ''}${items.length ? items.map(n => `
    <button class="notice-item ${read.has(n.id) ? '' : 'unread'}" type="button" onclick="openSchoolNotice('${escapeHtml(n.id)}')">
      <span class="notice-item-top"><span>${n.type === 'range_changed' ? '範囲変更' : n.type === 'test_eve' ? 'テスト前日' : '学習リマインド'}</span><span>${n.createdAtMillis ? new Date(n.createdAtMillis).toLocaleDateString('ja-JP') : ''}</span></span>
      <strong>${escapeHtml(n.title)}</strong><span>${escapeHtml(n.body)}</span>
    </button>`).join('') : '<div class="notice-empty">届いている通知はまだありません。</div>'}`;
  updateNoticeBadge();
}
function listenSchoolNotices() {
  const schoolId = getSchoolCode();
  const audience = `${schoolId}|${activeClassAssignment?.classId || ''}`;
  if (noticeAudience === audience) { renderNoticeInbox(); return; }
  if (noticeUnsubscribe) { noticeUnsubscribe(); noticeUnsubscribe = null; }
  noticeAudience = audience;
  schoolNotices = schoolId ? getCachedNotices() : [];
  noticeError = '';
  renderNoticeInbox();
  if (!schoolId || !navigator.onLine) return;
  noticeUnsubscribe = db.collection('schoolNotices').where('schoolId','==',schoolId).limit(100).onSnapshot(snap => {
    schoolNotices = snap.docs.map(doc => ({id:doc.id,...doc.data(),createdAtMillis:doc.data().createdAt?.toMillis?.() || 0}));
    try { localStorage.setItem(NOTICE_CACHE_KEY + '_' + schoolId, JSON.stringify(schoolNotices.slice(0,80))); } catch(e) {}
    noticeError = '';
    renderNoticeInbox();
  },error => { console.warn('listenSchoolNotices error:',error);
    noticeError = '学校からの通知を取得できません。Firestoreルールと通信状態を確認してください。';renderNoticeInbox(); });
}
function showNotifications() {
  listenSchoolNotices();
  showScreen('screen-notifications');
  renderNoticeInbox();
}
function openSchoolNotice(id) {
  const read = getReadNoticeIds(); read.add(id); saveReadNoticeIds(read);
  const item = schoolNotices.find(n => n.id === id);
  if (item && Number.isInteger(item.startId) && Number.isInteger(item.endId) &&
      item.startId >= WORDS[0].id && item.endId <= WORDS[WORDS.length - 1].id && item.startId <= item.endId) {
    setQuizRanges[0] = {startId:item.startId,endId:item.endId};
    showHome();
    document.getElementById('sets-grid')?.scrollIntoView({behavior:'smooth',block:'start'});
  } else renderNoticeInbox();
  updateNoticeBadge();
}
function markAllSchoolNoticesRead() {
  const ids = getReadNoticeIds();
  schoolNotices.filter(noticeMatchesClass).forEach(item => ids.add(item.id));
  saveReadNoticeIds(ids); renderNoticeInbox();
}
async function syncPushAudience() {
  try {
    if (localStorage.getItem(PUSH_ENABLED_KEY) !== '1' || !messaging || !isInstalledPwa() ||
        Notification.permission !== 'granted' || !FCM_VAPID_KEY || FCM_VAPID_KEY.includes('PASTE_YOUR')) return;
    const registration = await navigator.serviceWorker.ready;
    const token = await messaging.getToken({vapidKey:FCM_VAPID_KEY,serviceWorkerRegistration:registration});
    if (!token) return;
    const clientId = getPushClientId();
    await db.collection('pushTokens').doc(clientId).set({
      clientId,token,installedOnly:true,active:true,
      schoolId:getSchoolCode() || null, classId:activeClassAssignment?.classId || '',
      updatedAt:firebase.firestore.FieldValue.serverTimestamp()
    },{merge:true});
  } catch(e) { console.warn('syncPushAudience error:',e); }
}

async function saveStudySchedule() {
  if (!isSchoolAdmin()) { showSyncStatus('管理者のみ設定できます',true); return; }
  const schoolId = normalizeSchoolCode(document.getElementById('admin-class-school')?.value);
  const classId = normalizeClassId(document.getElementById('admin-class-id')?.value);
  const weekday = Number(document.getElementById('admin-notice-weekday')?.value);
  const hour = Number(document.getElementById('admin-notice-hour')?.value);
  const testDate = String(document.getElementById('admin-notice-test-date')?.value || '');
  if (!schoolId || !Number.isInteger(weekday) || weekday < 0 || weekday > 6 ||
      !Number.isInteger(hour) || hour < 7 || hour > 22 ||
      testDate && !/^\d{4}-\d{2}-\d{2}$/.test(testDate)) {
    showSyncStatus('学校ID・曜日・時刻を確認してください',true);return;
  }
  try {
    const school = await db.collection('schoolCodes').doc(schoolId).get();
    if (!school.exists || school.data()?.active === false) throw new Error('有効な学校IDを入力してください');
    const target = classId ? await db.collection('schoolCodes').doc(schoolId).collection('classes').doc(classId).get() : school;
    if (!target.exists || target.data()?.active === false) throw new Error('クラスIDが未登録です');
    const {startId,endId} = target.data();
    if (!Number.isInteger(startId) || !Number.isInteger(endId) || startId < WORDS[0].id || endId > WORDS[WORDS.length-1].id || startId > endId) {
      throw new Error('先にテスト範囲を保存してください');
    }
    await db.collection('studySchedules').doc(`${schoolId}__${classId || 'ALL'}`).set({
      schoolId,classId,weekday,hour,startId,endId,testDate,
      testReminder:!!testDate,active:true,updatedAt:firebase.firestore.FieldValue.serverTimestamp()
    },{merge:true});
    showSyncStatus('毎週の通知予定を保存しました');
  } catch(e) { console.warn('saveStudySchedule error:',e);showSyncStatus(e.message || '通知予定を保存できませんでした',true); }
}
async function disableStudySchedule() {
  if (!isSchoolAdmin()) return;
  const schoolId = normalizeSchoolCode(document.getElementById('admin-class-school')?.value);
  const classId = normalizeClassId(document.getElementById('admin-class-id')?.value);
  if (!schoolId) { showSyncStatus('学校IDを入力してください',true);return; }
  try {
    await db.collection('studySchedules').doc(`${schoolId}__${classId || 'ALL'}`).set({active:false,updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});
    showSyncStatus('定期通知を停止しました');
  } catch(e) { console.warn('disableStudySchedule error:',e);showSyncStatus('通知予定を停止できませんでした',true); }
}

function showHome() {
  relocateDashboardPanels();
  renderHome();
  renderPwaInvite();
  listenSchoolNotices();
  const grid = document.getElementById('sets-grid');
  const picker = document.querySelector('#screen-set > .content');
  if (picker && grid) grid.replaceChildren(picker);
  currentSetIdx = 0;
  renderSet();
  showScreen('screen-home');
}

let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  deferredInstallPrompt = event;
  renderPwaInvite();
});
window.addEventListener('appinstalled', () => { deferredInstallPrompt = null; renderPwaInvite(); });
function renderPwaInvite() {
  const container = document.getElementById('home-pwa-invite');
  if (!container) return;
  if (isInstalledPwa() || localStorage.getItem('systan-pwa-invite-dismissed')) { container.replaceChildren(); return; }
  const isApple = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const note = isApple ? '共有ボタンから「ホーム画面に追加」を選択できます。' : 'ホーム画面に追加すると、すぐに学習を再開できます。';
  container.innerHTML = `<div class="pwa-invite"><div><strong>アプリとして使う</strong><p>${note}</p></div><div class="pwa-invite-actions"><button type="button" class="btn btn-primary" id="pwa-install-action">${deferredInstallPrompt ? 'インストール' : '追加方法を見る'}</button><button type="button" class="btn btn-secondary" id="pwa-dismiss-action" aria-label="案内を閉じる">閉じる</button></div></div>`;
  container.querySelector('#pwa-install-action').onclick = async () => {
    if (deferredInstallPrompt) {
      const promptEvent = deferredInstallPrompt;
      deferredInstallPrompt = null;
      await promptEvent.prompt();
      await promptEvent.userChoice;
      renderPwaInvite();
    } else alert(isApple ? 'Safari の共有ボタンから「ホーム画面に追加」を選択してください。' : 'ブラウザのメニューから「アプリをインストール」または「ホーム画面に追加」を選択してください。');
  };
  container.querySelector('#pwa-dismiss-action').onclick = () => { localStorage.setItem('systan-pwa-invite-dismissed', '1'); renderPwaInvite(); };
}

function showSet(setIdx) {
  showHome();
  document.getElementById('sets-grid')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function openSharedSelection() {
  const params = new URLSearchParams(location.search);
  if (params.get('view') !== 'words') return false;
  const validId = value => /^\d{1,5}$/.test(value || '') && Number(value) >= WORDS[0].id && Number(value) <= WORDS[WORDS.length - 1].id;
  if (!validId(params.get('start')) || !validId(params.get('end')) || Number(params.get('start')) > Number(params.get('end'))) {
    showHome();
    showRangeError(`共有URLの単語範囲が正しくありません。${WORDS[0].id}〜${WORDS[WORDS.length - 1].id}の番号を指定してください。`);
    return true;
  }
  currentSetIdx = 0;
  setQuizRanges[0] = { startId: Number(params.get('start')), endId: Number(params.get('end')) };
  const mode = Number(params.get('mode'));
  if ([1, 2, 3].includes(mode)) selectedMode = mode;
  if (['all', 'mix', 'circle', 'cross', 'bookmark'].includes(params.get('retest'))) selectedRetest = params.get('retest');
  showHome();
  return true;
}

async function shareWordSelection() {
  if (!commitSetRangeInput()) return;
  const range = ensureSetRange(currentSetIdx);
  const url = new URL(location.href);
  url.searchParams.set('view', 'words');
  url.searchParams.set('start', range.startId);
  url.searchParams.set('end', range.endId);
  url.searchParams.set('mode', selectedMode);
  url.searchParams.set('retest', selectedRetest);
  try {
    if (navigator.share) await navigator.share({ title: '古文単語マスター：単語選択', url: url.href });
    else if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(url.href); alert('共有URLをコピーしました'); }
    else prompt('共有URLをコピーしてください', url.href);
  } catch (error) { if (error.name !== 'AbortError') prompt('共有URLをコピーしてください', url.href); }
}

function showBookmarks() {
  renderBookmarks();
  showScreen('screen-bookmark');
}

async function showRanking() {
  await showResultsDashboard();
}

function chooseMobileMode(mode) { selectMode(mode); syncMobileStudyChoices(); }
function chooseMobileRetest(target) { selectRetest(target); syncMobileStudyChoices(); }
function syncMobileStudyChoices() {
  document.querySelectorAll('.mobile-study-choices [data-mode]').forEach(button => {
    const active = Number(button.dataset.mode) === selectedMode;
    button.classList.toggle('selected', active);
    button.setAttribute('aria-pressed', String(active));
  });
  document.querySelectorAll('.mobile-study-choices [data-retest]').forEach(button => {
    const active = button.dataset.retest === selectedRetest;
    button.classList.toggle('selected', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

async function showAccountSettings() {
  if (auth.currentUser) await loadAccountProfile();
  renderAccountSettings();
  showScreen('screen-account');
}

function selectMode(m) {
  selectedMode = m;
  const select = document.getElementById('mode-select');
  if (select && Number(select.value) !== m) select.value = String(m);
  [1,2,3].forEach(i => {
    const btn = document.getElementById('mode-btn-'+i);
    if (btn) btn.classList.toggle('active', i === m);
  });
  renderSet();
}

function selectBmMode(m) {
  selectedBmMode = m;
  const select = document.getElementById('bm-mode-select');
  if (select && Number(select.value) !== m) select.value = String(m);
  [1,2,3].forEach(i => {
    const btn = document.getElementById('bm-mode-btn-'+i);
    if (btn) btn.classList.toggle('active', i === m);
  });
}

function quitQuiz() {
  if (confirm('クイズを中断しますか？進捗は保存されます。')) {
    if (quiz && quiz.type === 'bookmark') {
      showBookmarks();
    } else {
      showSet(currentSetIdx);
    }
  }
}

// =========================================================
// QUIZ GENERATION
// =========================================================
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function commonPrefixLen(a, b) {
  let n = 0;
  const len = Math.min(a.length, b.length);
  while (n < len && a[n] === b[n]) n++;
  return n;
}

function commonSuffixLen(a, b) {
  let n = 0;
  const len = Math.min(a.length, b.length);
  while (n < len && a[a.length - 1 - n] === b[b.length - 1 - n]) n++;
  return n;
}

function levenshteinDistance(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

function normalizedEnglishForChoice(text) {
  return String(text || '').toLowerCase().replace(/[^a-z]/g, '');
}

function japaneseOverlapScore(a, b) {
  const ignore = new Set(['～','を','に','の','る','す','、','。','；','・','A','B','と','て','で','が','は',' ']);
  const setA = new Set(String(a || '').split('').filter(ch => !ignore.has(ch)));
  const setB = new Set(String(b || '').split('').filter(ch => !ignore.has(ch)));
  let score = 0;
  setA.forEach(ch => { if (setB.has(ch)) score++; });
  return score;
}

function scoreDistractor(target, cand, mode) {
  const a = normalizedEnglishForChoice(target.en);
  const b = normalizedEnglishForChoice(cand.en);
  const idDiff = Math.abs(target.id - cand.id);
  const dist = levenshteinDistance(a, b);
  const maxLen = Math.max(a.length, b.length, 1);

  let score = 0;
  score += Math.max(0, 70 - idDiff) * 1.8;
  score += Math.max(0, 20 - Math.abs(a.length - b.length)) * 2;
  score += Math.max(0, (1 - dist / maxLen)) * 45;
  score += commonPrefixLen(a, b) * 12;
  score += commonSuffixLen(a, b) * 7;
  if (a[0] && a[0] === b[0]) score += 16;
  if (a.slice(-1) && a.slice(-1) === b.slice(-1)) score += 8;
  if (mode === 1) score += japaneseOverlapScore(target.jp, cand.jp) * 7;
  score += Math.random() * 8;
  return score;
}

function getSmartDistractors(word, mode, count = 5) {
  const candidates = WORDS.filter(w => {
    if (w.id === word.id) return false;
    if (mode === 1 && w.jp === word.jp) return false;
    if (mode === 2 && w.en === word.en) return false;
    return true;
  });
  const scored = candidates
    .map(w => ({ word: w, score: scoreDistractor(word, w, mode) }))
    .sort((a, b) => b.score - a.score);
  const topPool = scored.slice(0, Math.min(24, scored.length)).map(x => x.word);
  return shuffle(topPool).slice(0, count);
}

function buildMode1Choices(word) {
  const correctJp = word.jp;
  const distractors = getSmartDistractors(word, 1, 5);
  const choices = shuffle([
    { text: correctJp, correct: true },
    ...distractors.map(d => ({ text: d.jp, correct: false, sourceId: d.id }))
  ]);
  return choices;
}

function buildMode2SingleChoices(word) {
  const correctEn = word.en;
  const distractors = getSmartDistractors(word, 2, 5);
  return shuffle([
    { text: correctEn, id: word.id, correct: true },
    ...distractors.map(d => ({ text: d.en, id: d.id, correct: false }))
  ]);
}

// =========================================================
// QUIZ FLOW
// =========================================================

function sanitizeQuizCount(value, maxCount) {
  if (maxCount <= 0) return 0;
  const num = Number(value);
  if (!Number.isFinite(num)) return Math.min(10, maxCount);
  return Math.max(1, Math.min(maxCount, Math.floor(num)));
}

function syncQuizCountUI(type, availableCount) {
  const isBookmark = type === 'bookmark';
  const input = document.getElementById(isBookmark ? 'bm-quiz-count-input' : 'quiz-count-input');
  const help = document.getElementById(isBookmark ? 'bm-quiz-count-help' : 'quiz-count-help');
  if (!input || !help) return 0;

  const currentValue = isBookmark ? bookmarkQuizCount : normalQuizCount;
  const safeCount = sanitizeQuizCount(currentValue, availableCount);

  input.min = availableCount > 0 ? '1' : '0';
  input.max = String(Math.max(availableCount, 0));
  input.disabled = availableCount === 0;
  input.value = availableCount > 0 ? safeCount : 0;

  if (isBookmark) bookmarkQuizCount = safeCount || bookmarkQuizCount;
  else normalQuizCount = safeCount || normalQuizCount;

  help.textContent = availableCount > 0
    ? `1〜${availableCount}問まで指定できます`
    : '出題できる単語がありません';

  return safeCount;
}

function handleQuizCountInput(type) {
  const isBookmark = type === 'bookmark';
  const input = document.getElementById(isBookmark ? 'bm-quiz-count-input' : 'quiz-count-input');
  const availableCount = isBookmark ? getBmFilteredWords().length : getActiveWords(currentSetIdx).length;
  if (!input) return;

  if (availableCount === 0) {
    input.value = 0;
    return;
  }

  const safeCount = sanitizeQuizCount(input.value, availableCount);
  input.value = safeCount;
  if (isBookmark) bookmarkQuizCount = safeCount;
  else normalQuizCount = safeCount;
  saveProgress();
  syncQuizCountUI(type, availableCount);
}

function isSameRange(aStart, aEnd, bStart, bEnd) {
  return Number(aStart) === Number(bStart) && Number(aEnd) === Number(bEnd);
}

function showRangeError(message) {
  const error = document.getElementById('quiz-range-error');
  if (error) { error.textContent = message; error.hidden = !message; }
  for (const id of ['quiz-range-start-input', 'quiz-range-end-input']) {
    const input = document.getElementById(id);
    if (input) input.setAttribute('aria-invalid', message ? 'true' : 'false');
  }
}

function applySetRange(startId, endId) {
  const min = WORDS[0].id, max = WORDS[WORDS.length - 1].id;
  const valid = value => /^\d+$/.test(String(value)) && Number(value) >= min && Number(value) <= max;
  if (!valid(startId) || !valid(endId) || Number(startId) > Number(endId)) {
    showRangeError(`開始・終了に${min}〜${max}の番号を入力し、開始番号を終了番号以下にしてください。`);
    return false;
  }
  showRangeError('');
  setQuizRanges[currentSetIdx] = { startId: Number(startId), endId: Number(endId) };
  saveProgress();
  renderSet();
  return true;
}

function commitSetRangeInput() {
  const start = document.getElementById('quiz-range-start-input');
  const end = document.getElementById('quiz-range-end-input');
  if (!start || !end) return false;
  return applySetRange(start.value, end.value);
}

function renderSetRangePresets() {
  const container = document.getElementById('quiz-range-presets');
  if (!container) return;

  const safe = ensureSetRange(currentSetIdx);
  const allMinId = WORDS[0].id;
  const allMaxId = WORDS[WORDS.length - 1].id;
  const presets = [{ label: '全単語', startId: allMinId, endId: allMaxId }];
  for (let start = allMinId; start <= allMaxId; start += 100) {
    presets.push({ label: `${start}〜${Math.min(start + 99, allMaxId)}`, startId: start, endId: Math.min(start + 99, allMaxId) });
  }

  container.innerHTML = presets.map(p => `
    <button
      type="button"
      class="range-preset-btn${isSameRange(safe.startId, safe.endId, p.startId, p.endId) ? ' active' : ''}"
      onclick="applySetRange(${p.startId}, ${p.endId})"
    >${p.label}</button>
  `).join('');
}

function updateSetRangeUI() {
  const startInput = document.getElementById('quiz-range-start-input');
  const endInput = document.getElementById('quiz-range-end-input');
  const help = document.getElementById('quiz-range-help');
  const summary = document.getElementById('quiz-range-summary');
  if (!startInput || !endInput || !help || !summary) return;

  const safe = ensureSetRange(currentSetIdx);
  startInput.min = String(safe.minId);
  startInput.max = String(safe.maxId);
  endInput.min = String(safe.minId);
  endInput.max = String(safe.maxId);
  startInput.value = safe.startId;
  endInput.value = safe.endId;

  const count = safe.endId - safe.startId + 1;
  summary.textContent = `${safe.startId}〜${safe.endId}番`;
  help.textContent = `${count}語を出題範囲に設定中です（全単語から選択できます）`;
  renderSetRangePresets();
}

function handleSetRangeInput() {
  // Keep the user's draft untouched while typing. Apply only on the button or action.
  showRangeError('');
}

function incrementSetRangeBound(bound, delta) {
  const safe = ensureSetRange(currentSetIdx);
  const nextStart = bound === 'start' ? safe.startId + delta : safe.startId;
  const nextEnd = bound === 'end' ? safe.endId + delta : safe.endId;
  applySetRange(nextStart, nextEnd);
  const input = document.getElementById(bound === 'start' ? 'quiz-range-start-input' : 'quiz-range-end-input');
  if (input) {
    input.classList.remove('stepper-pulse');
    void input.offsetWidth;
    input.classList.add('stepper-pulse');
  }
}

function incrementQuizCount(type, delta) {
  const isBookmark = type === 'bookmark';
  const input = document.getElementById(isBookmark ? 'bm-quiz-count-input' : 'quiz-count-input');
  if (!input || input.disabled) return;
  input.value = Number(input.value || 0) + delta;
  handleQuizCountInput(type);
  input.classList.remove('stepper-pulse');
  void input.offsetWidth;
  input.classList.add('stepper-pulse');
}

function getLimitedQuizWords(words, requestedCount) {
  const safeCount = sanitizeQuizCount(requestedCount, words.length);
  return shuffle(words).slice(0, safeCount);
}

function startNormalQuiz() {
  if (!commitSetRangeInput()) return;
  const activeWords = getActiveWords(currentSetIdx);
  if (activeWords.length === 0) {
    if (selectedRetest === 'bookmark') {
      alert('このセットにブックマーク済みの単語がありません。');
    } else {
      alert('このセットに学習中の単語がありません。');
    }
    return;
  }
  startQuizSession(shuffle(activeWords), 'normal');
}

function startReviewQuiz() {
  const wrongWords = getWrongWords();
  if (wrongWords.length === 0) { alert('復習対象の単語がありません。'); return; }
  startQuizSession(shuffle(wrongWords), 'review');
}

function startBookmarkQuiz() {
  const words = getBmFilteredWords();
  if (words.length === 0) { alert('表示中の単語がありません。'); return; }
  const selectedWords = getLimitedQuizWords(words, bookmarkQuizCount);
  quiz = {
    words: selectedWords,
    type: 'bookmark',
    idx: 0,
    mode: selectedBmMode,
    results: [],
    choices: null,
    answered: false,
  };
  updateQuizHeader();
  showScreen('screen-quiz');
  renderQuestion();
  scrollQuizToTop();
}

function startQuizSession(words, type) {
  quiz = {
    words, type,
    idx: 0,
    mode: selectedMode,
    results: [],
    choices: null,
    answered: false,
  };
  updateQuizHeader();
  showScreen('screen-quiz');
  renderQuestion();
  scrollQuizToTop();
}

function updateQuizHeader() {
  const modeLabels = { 1: '① 古文単語→現代語訳', 2: '② 現代語訳→古文単語', 3: '③ 現代語訳→古文単語（記述）' };
  const typeLabels = { normal: '通常クイズ', review: '復習テスト', bookmark: '★ブックマーク' };
  const typeClasses = { normal: 'type-normal', review: 'type-review', bookmark: 'type-bookmark' };
  document.getElementById('quiz-mode-tag').textContent = modeLabels[quiz.mode];
  const tt = document.getElementById('quiz-type-tag');
  tt.textContent = typeLabels[quiz.type] || quiz.type;
  tt.className = 'quiz-type-tag ' + (typeClasses[quiz.type] || 'type-normal');
}

function updateQuizProgress() {
  const total = quiz.words.length;
  const current = quiz.idx + 1;
  document.getElementById('quiz-progress-text').textContent = `${Math.min(current, total)} / ${total}`;
  document.getElementById('quiz-progress-fill').style.width = `${(quiz.idx / total) * 100}%`;
}

function renderQuestion() {
  if (quiz.idx >= quiz.words.length) { finishQuiz(); return; }
  const word = quiz.words[quiz.idx];
  quiz.answered = false;
  if (isAutoVoiceEnabled()) setTimeout(() => speakWordText(word.en), 180);
  updateQuizProgress();

  document.getElementById('answer-reveal-area').style.display = 'none';
  const answerUserBox = document.getElementById('answer-user-box');
  const autoJudgeBox = document.getElementById('answer-auto-judge');
  const manualJudgeButtons = document.getElementById('manual-judge-buttons');
  if (answerUserBox) answerUserBox.style.display = 'none';
  if (autoJudgeBox) autoJudgeBox.style.display = 'none';
  if (manualJudgeButtons) manualJudgeButtons.style.display = 'none';
  const nextBtn = document.getElementById('next-btn');
  nextBtn.style.display = 'none';
  nextBtn.className = 'next-btn';
  document.getElementById('btn-unknown').hidden = false;
  document.getElementById('btn-grade-mobile').hidden = quiz.mode !== 3;
  document.body.classList.remove('quiz-answer-shown');
  document.getElementById('correct-flash').classList.remove('show');
  document.getElementById('wrong-flash').classList.remove('show');

  const bmBtn = document.getElementById('quiz-bm-btn');
  if (bmBtn) {
    const bm = isBookmarked(word.id);
    bmBtn.textContent = bm ? '★' : '☆';
    bmBtn.classList.toggle('bookmarked', bm);
    bmBtn.title = bm ? 'ブックマーク解除' : 'ブックマークに追加';
  }

  const qWord = document.getElementById('q-word');
  const qMeaning = document.getElementById('q-meaning');
  const qPrompt = document.getElementById('q-prompt');
  const qSub = document.getElementById('q-sub');
  const qPhonetic = document.getElementById('q-phonetic');
  const container = document.getElementById('choices-container');
  if (qPhonetic) { qPhonetic.style.display = 'none'; qPhonetic.textContent = ''; }

  if (quiz.mode === 1) {
    qWord.style.display = 'block'; qMeaning.style.display = 'none';
    qWord.textContent = word.en;
    if (qPhonetic) {
      const phonetic = getWordPhonetic(word);
      qPhonetic.textContent = phonetic;
      qPhonetic.style.display = phonetic ? 'block' : 'none';
    }
    qPrompt.textContent = '次の古文単語の意味として正しいものを選んでください';
    qSub.textContent = '';
    const choices = buildMode1Choices(word);
    quiz.choices = choices;
    container.innerHTML = '';
    
    const grid = document.createElement('div');
    grid.className = 'choices';
    grid.id = 'mode1-choices-grid';
    choices.forEach((c, i) => {
      const btn = document.createElement('button');
      btn.className = 'choice-btn';
      btn.textContent = c.text;
      btn.dataset.idx = i;
      btn.onclick = () => handleMode1Choice(i);
      grid.appendChild(btn);
    });
    container.appendChild(grid);

  } else if (quiz.mode === 2) {
    qWord.style.display = 'none'; qMeaning.style.display = 'block';
    qMeaning.textContent = word.jp;
    qPrompt.textContent = '次の意味に対応する古文単語を1つ選んでください';
    qSub.textContent = '';
    const choices = buildMode2SingleChoices(word);
    quiz.choices = choices;
    quiz.mode2CorrectId = word.id;
    container.innerHTML = '';

    const grid = document.createElement('div');
    grid.className = 'choices';
    grid.id = 'mode2-choices-grid';
    choices.forEach((c, i) => {
      const btn = document.createElement('button');
      btn.className = 'choice-btn';
      btn.textContent = c.text;
      btn.dataset.idx = i;
      btn.onclick = () => handleMode2Choice(i);
      grid.appendChild(btn);
    });
    container.appendChild(grid);

  } else {
    qWord.style.display = 'none'; qMeaning.style.display = 'block';
    qMeaning.textContent = word.jp;
    qPrompt.textContent = 'この意味に対応する古文単語を書いてください（自動採点）';
    qSub.textContent = '';
    container.innerHTML = `
      <input type="text" class="answer-input" id="free-answer" placeholder="古文単語で入力..." 
        onkeydown="if(event.key==='Enter')gradeTypedAnswer()" autocomplete="off" autocapitalize="none" spellcheck="false">
      <button class="confirm-btn" onclick="gradeTypedAnswer()">採点する</button>
    `;
  }
}

function handleMode1Choice(idx) {
  if (quiz.answered) return;
  unlockSound();
  quiz.answered = true;
  const word = quiz.words[quiz.idx];
  const choice = quiz.choices[idx];
  const isCorrect = choice.correct;

  const buttons = document.querySelectorAll('#choices-container .choice-btn');
  buttons.forEach((btn, i) => {
    btn.disabled = true;
    if (quiz.choices[i].correct) btn.classList.add('correct');
    else if (i === idx && !isCorrect) btn.classList.add('wrong');
  });

  const resultStatus = isCorrect ? '○' : '×'; // 正解はデフォルトで「○」
  flashResult(isCorrect);
  advanceProgress(word.id, resultStatus, 'q1');
  showNextBtn(isCorrect);
  setTimeout(()=>{ const nb=document.getElementById('next-btn'); if(nb){ nb.style.display='block'; nb.classList.add('is-visible'); } },120);
}

function handleMode2Choice(idx) {
  if (quiz.answered) return;
  unlockSound();
  quiz.answered = true;
  const word = quiz.words[quiz.idx];
  const choice = quiz.choices[idx];
  const isCorrect = choice.correct;

  const buttons = document.querySelectorAll('#choices-container .choice-btn');
  buttons.forEach((btn, i) => {
    btn.disabled = true;
    if (quiz.choices[i].correct) btn.classList.add('correct');
    else if (i === idx && !isCorrect) btn.classList.add('wrong');
  });

  const resultStatus = isCorrect ? '○' : '×';
  flashResult(isCorrect);
  advanceProgress(word.id, resultStatus, 'q2');
  showNextBtn(isCorrect);
}

function normalizeTypedAnswer(text) {
  return String(text || '')
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/\s+/g, ' ');
}

function normalizeTypedAnswerStrict(text) {
  return normalizeTypedAnswer(text).replace(/[^a-z0-9]/g, '');
}

function isTypedAnswerCorrect(input, correct) {
  const a = normalizeTypedAnswer(input);
  const b = normalizeTypedAnswer(correct);
  if (!a) return false;
  if (a === b) return true;
  return normalizeTypedAnswerStrict(a) === normalizeTypedAnswerStrict(b);
}

function gradeTypedAnswer() {
  if (quiz.answered) return;
  unlockSound();
  quiz.answered = true;

  const word = quiz.words[quiz.idx];
  const inputEl = document.getElementById('free-answer');
  const typedRaw = inputEl ? inputEl.value : '';
  const typedDisplay = typedRaw.trim();
  const isCorrect = isTypedAnswerCorrect(typedRaw, word.en);
  const resultStatus = isCorrect ? '○' : '×';

  const userBox = document.getElementById('answer-user-box');
  const userText = document.getElementById('answer-user-text');
  const judgeBox = document.getElementById('answer-auto-judge');
  const manualJudgeButtons = document.getElementById('manual-judge-buttons');

  if (userBox && userText) {
    userBox.style.display = 'block';
    userText.textContent = typedDisplay || '（未入力）';
    userText.classList.toggle('empty', !typedDisplay);
  }

  document.getElementById('answer-reveal-text').textContent = word.en;
  document.getElementById('answer-reveal-area').style.display = 'block';

  if (judgeBox) {
    judgeBox.style.display = 'block';
    judgeBox.className = 'answer-auto-judge ' + (isCorrect ? 'correct' : 'wrong');
    judgeBox.textContent = isCorrect
      ? '自動採点：正解です。'
      : '自動採点：不正解です。スペルを確認しましょう。';
  }
  if (manualJudgeButtons) manualJudgeButtons.style.display = 'none';

  const container = document.getElementById('choices-container');
  const qPhonetic = document.getElementById('q-phonetic');
  if (qPhonetic) { qPhonetic.style.display = 'none'; qPhonetic.textContent = ''; }
  container.innerHTML = '';

  flashResult(isCorrect);
  advanceProgress(word.id, resultStatus, 'q3');
  showNextBtn(isCorrect);
}

function showAnswer() {
  gradeTypedAnswer();
}

function selfJudge(grade) {
  if (quiz.answered) return;
  unlockSound();
  quiz.answered = true;
  document.getElementById('answer-reveal-area').style.display = 'none';
  const word = quiz.words[quiz.idx];
  const isCorrect = grade !== 'cross';
  const statusMap = { dcircle: '◎', circle: '○', cross: '×' };
  const resultStatus = statusMap[grade];
  flashResult(isCorrect);
  advanceProgress(word.id, resultStatus, 'q3');
  showNextBtn(isCorrect);
}

function flashResult(isCorrect) {
  if (isCorrect) playCorrectSound();
  else playWrongSound();
  const el = document.getElementById(isCorrect ? 'correct-flash' : 'wrong-flash');
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 1150);
}

function showNextBtn(isCorrect) {
  const btn = document.getElementById('next-btn');
  document.getElementById('btn-unknown').hidden = true;
  document.getElementById('btn-grade-mobile').hidden = true;
  const word = quiz.words[quiz.idx];
  quiz.results.push({ wordId: word.id, correct: isCorrect });
  leaderboardStats.totalAnswered = (leaderboardStats.totalAnswered || 0) + 1;
  if (isCorrect) leaderboardStats.totalCorrect = (leaderboardStats.totalCorrect || 0) + 1;
  else leaderboardStats.totalWrong = (leaderboardStats.totalWrong || 0) + 1;
  leaderboardStats.updatedAt = new Date().toISOString();
  saveProgress();
  syncLeaderboardProfile();
  btn.style.display = 'block';
  btn.classList.add('is-visible');
  document.body.classList.add('quiz-answer-shown');
  if (quiz.idx + 1 >= quiz.words.length) {
    btn.textContent = '結果を見る →';
  } else {
    btn.textContent = isCorrect ? '✓ 次の問題へ →' : '✗ 次の問題へ →';
  }
  btn.className = 'next-btn is-visible ' + (isCorrect ? 'correct-next' : 'wrong-next'); btn.style.display='block';
}

function skipUnknownQuestion() {
  if (quiz.answered || !quiz.words[quiz.idx]) return;
  quiz.answered = true;
  const word = quiz.words[quiz.idx];
  document.activeElement?.blur();
  if (quiz.mode === 3) {
    document.getElementById('answer-reveal-text').textContent = word.en;
    document.getElementById('answer-reveal-area').style.display = 'block';
    document.getElementById('answer-user-box').style.display = 'none';
    document.getElementById('answer-auto-judge').style.display = 'none';
    document.getElementById('choices-container').replaceChildren();
  } else {
    document.querySelectorAll('#choices-container .choice-btn').forEach((button, i) => {
      button.disabled = true;
      if (quiz.choices[i]?.correct) button.classList.add('correct');
    });
    const info = document.createElement('div');
    info.className = 'skip-answer';
    info.textContent = `答え：${word.en} — ${word.jp}`;
    document.getElementById('choices-container').appendChild(info);
  }
  advanceProgress(word.id, '×', 'q' + quiz.mode);
  showNextBtn(false);
}

function advanceProgress(wordId, resultStatus, quizNum) {
  if (quizNum && resultStatus) {
    setQResult(wordId, quizNum, resultStatus);
  }
  saveProgress();
}

function nextQuestion() {
  quiz.idx++;
  renderQuestion();
  if (quiz.idx < quiz.words.length) scrollQuizToTop();
}

function finishQuiz() {
  const correct = quiz.results.filter(r => r.correct).length;
  const wrong = quiz.results.length - correct;
  
  const titleEl = document.getElementById('result-title');
  const subEl = document.getElementById('result-sub');
  const statsEl = document.getElementById('result-stats');
  const btnsEl = document.getElementById('result-btns');

  const typeLabel = { normal: '通常クイズ', review: '復習テスト', bookmark: '★ブックマーク' }[quiz.type];
  titleEl.textContent = `${typeLabel}完了！`;
  subEl.textContent = `全${quiz.results.length}問`;
  
  statsEl.innerHTML = `
    <div class="result-stat-item correct">
      <div class="result-stat-num">${correct}</div>
      <div class="result-stat-label">正解</div>
    </div>
    <div class="result-stat-item wrong">
      <div class="result-stat-num">${wrong}</div>
      <div class="result-stat-label">不正解</div>
    </div>
  `;
  renderHomeRankingPanel();

  const wrongWords = getWrongWords();
  let btnsHTML = '';
  if (quiz.type === 'normal') {
    btnsHTML += `<button class="btn btn-primary" onclick="showSet(${currentSetIdx})">セットに戻る</button>`;
  } else if (quiz.type === 'bookmark') {
    btnsHTML += `<button class="btn" style="background:var(--bookmark);color:#fff;" onclick="showBookmarks()">📋 マイリストに戻る</button>`;
  } else {
    btnsHTML += `<button class="btn btn-primary" onclick="showHome()">ホームへ</button>`;
  }
  if (wrongWords.length >= WRONG_THRESHOLD) {
    btnsHTML += `<button class="btn btn-review" onclick="startReviewQuiz()">⚠ 復習リスト（${wrongWords.length}問）</button>`;
  }
  btnsHTML += `<button class="btn btn-secondary" onclick="showHome()">ホームへ</button>`;
  btnsEl.innerHTML = btnsHTML;

  playFinishSound();
  showScreen('screen-result');
}

// =========================================================
// RENDER HOME
// =========================================================
function renderHome() {
  const stats = getTotalStats();
  const total = WORDS.length;
  const done = stats['○'] + stats['◎'] + stats['×'];
  document.getElementById('home-stats').innerHTML = `
    <div class="home-stat total"><div class="home-stat-num">${total}</div><div class="home-stat-label">総単語数</div></div>
    <div class="home-stat s-○"><div class="home-stat-num">${stats['○']}</div><div class="home-stat-label">○</div></div>
    <div class="home-stat s-◎"><div class="home-stat-num">${stats['◎']}</div><div class="home-stat-label">◎</div></div>
    <div class="home-stat s-×"><div class="home-stat-num">${stats['×']}</div><div class="home-stat-label">×</div></div>
    <div style="flex:1;margin-left:8px;">
      <div style="font-size:11px;color:var(--text2);margin-bottom:6px;font-weight:bold;">全体進捗 ${done}/${total}</div>
      <div class="progress-bar" style="height:10px;">
        <div class="progress-seg circle" style="width:${(stats['○']/total*100).toFixed(1)}%"></div>
        <div class="progress-seg dcircle" style="width:${(stats['◎']/total*100).toFixed(1)}%"></div>
        <div class="progress-seg cross" style="width:${(stats['×']/total*100).toFixed(1)}%"></div>
      </div>
    </div>
  `;
  renderHomeRankingPanel();

  const wrongWords = getWrongWords();
  const alertEl = document.getElementById('home-alert');

  const bmCount = bookmarks.size;
  const wrongCount = getWrongWords().length;
  const reviewEntry = document.querySelector('#screen-home .review-entry');
  if (reviewEntry) reviewEntry.hidden = wrongCount < WRONG_THRESHOLD;
  const myListCount = new Set([...Array.from(bookmarks), ...getWrongWords().map(w => w.id)]).size;
  const bmPanelEl = document.getElementById('home-bookmark-panel');
  if (bmPanelEl) {
    if (myListCount > 0 && wrongCount >= WRONG_THRESHOLD) {
      const parts = [];
      if (bmCount > 0) parts.push(`★ ${bmCount}語`);
      if (wrongCount > 0) parts.push(`× ${wrongCount}語`);
      bmPanelEl.innerHTML = `
        <div class="bookmark-panel" onclick="showBookmarks()">
          <div class="bookmark-panel-icon">📋</div>
          <div class="bookmark-panel-info">
            <div class="bookmark-panel-title">マイリスト</div>
            <div class="bookmark-panel-sub">${parts.join(' ／ ')} — まとめて復習できます</div>
          </div>
          <div class="bookmark-panel-count">${myListCount}<span style="font-size:14px;color:var(--text2);margin-left:4px;">語</span></div>
        </div>`;
    } else {
      bmPanelEl.innerHTML = '';
    }
  }

  if (wrongWords.length >= WRONG_THRESHOLD) {
    alertEl.innerHTML = `
      <div class="alert-banner" onclick="startReviewQuiz()">
        <div class="alert-icon">⚠</div>
        <div class="alert-text">
          <div class="alert-title">間違えた単語が${wrongWords.length}語あります</div>
          <div class="alert-sub">×になった単語が溜まっています。今すぐ復習しましょう。</div>
        </div>
        <button class="alert-btn">復習する</button>
      </div>
    `;
  } else {
    alertEl.innerHTML = '';
  }

  renderClassStudyShortcut();
  const grid = document.getElementById('sets-grid');
  if (grid.querySelector('.quiz-options')) return;
  grid.innerHTML = `<button type="button" class="set-card word-picker-card" onclick="showSet(0)">
    <div class="set-title">単語を選ぶ →</div>
    <div class="set-range">全${WORDS.length}語から番号範囲を選択</div>
    <div class="progress-bar"><div class="progress-seg circle" style="width:${(stats['○']/total*100).toFixed(1)}%"></div><div class="progress-seg dcircle" style="width:${(stats['◎']/total*100).toFixed(1)}%"></div><div class="progress-seg cross" style="width:${(stats['×']/total*100).toFixed(1)}%"></div></div>
    <div class="set-stats"><span class="stat-item stat-none">未 ${stats['']}</span><span class="stat-item stat-○">○ ${stats['○']}</span><span class="stat-item stat-◎">◎ ${stats['◎']}</span><span class="stat-item stat-×">× ${stats['×']}</span></div>
  </button>`;
}


// =========================================================
// WORD SEARCH
// =========================================================
let wordSearchQuery = '';

function normalizeWordSearchText(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function setWordSearchQuery(value) {
  wordSearchQuery = String(value || '');
  renderSet();
}

function clearWordSearch() {
  wordSearchQuery = '';
  const input = document.getElementById('word-search-input');
  if (input) input.value = '';
  renderSet();
}

function isWordSearchMatch(word, query) {
  const q = normalizeWordSearchText(query);
  if (!q) return true;
  const haystack = normalizeWordSearchText(`${word.id} ${word.en} ${word.jp}`);
  return haystack.includes(q);
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function highlightWordSearch(value) {
  const raw = String(value || '');
  const q = normalizeWordSearchText(wordSearchQuery);
  if (!q) return escapeHtml(raw);
  const escaped = escapeHtml(raw);
  const safeQ = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  try {
    return escaped.replace(new RegExp(`(${safeQ})`, 'ig'), '<mark class="word-search-mark">$1</mark>');
  } catch (e) {
    return escaped;
  }
}

// =========================================================
// RENDER SET
// =========================================================
function renderSet() {
  const range = ensureSetRange(currentSetIdx);
  const words = WORDS.filter(w => w.id >= range.startId && w.id <= range.endId).slice(0, 100);
  document.getElementById('set-screen-title').textContent = '単語を選ぶ';
  document.getElementById('set-screen-sub').textContent = `${range.startId}〜${range.endId}番 / ${range.endId-range.startId+1}語を選択中`;

  updateSetRangeUI();
  const modeSelect = document.getElementById('mode-select');
  if (modeSelect) modeSelect.value = String(selectedMode);
  const retestSelect = document.getElementById('retest-select');
  if (retestSelect) retestSelect.value = selectedRetest;
  syncMobileStudyChoices();

  const activeWords = getActiveWords(currentSetIdx);
  const startBtn = document.getElementById('btn-start-quiz');

  startBtn.disabled = activeWords.length === 0;
  startBtn.textContent = activeWords.length > 0
    ? `▶ ${range.startId}〜${range.endId}番でクイズ開始（${activeWords.length}語）`
    : `▶ ${range.startId}〜${range.endId}番は出題対象なし`;

  const body = document.getElementById('word-table-body');
  let html = '';
  words.forEach(w => {
    const inRange = w.id >= range.startId && w.id <= range.endId;
    const s = getStatus(w.id);
    const qp = getQProgress(w.id);
    const bm = isBookmarked(w.id);
    const newBadge = w.isNew ? '<span class="new-badge">新</span>' : '';
    const manualBtn = s === '○' ? `<button class="manual-up-btn" onclick="manualUpgrade(${w.id},event)" title="◎に昇格">▲◎</button>` : '';
    const q1b = qp.q1 ? `<span class="mini-badge mini-badge-q1">①${qp.q1}</span>` : '';
    const q2b = qp.q2 ? `<span class="mini-badge mini-badge-q2">②${qp.q2}</span>` : '';
    const q3b = qp.q3 ? `<span class="mini-badge mini-badge-q3">③${qp.q3}</span>` : '';
    html += `
      <div class="word-row" style="${inRange ? '' : 'opacity:0.45;'}">
        <span><button class="bookmark-btn${bm ? ' bookmarked' : ''}" onclick="toggleBookmarkRow(${w.id},event)" title="${bm ? 'ブックマーク解除' : 'ブックマーク追加'}">${bm ? '★' : '☆'}</button></span>
        <span class="word-num">${w.id}</span>
        <span class="word-en"><button class="word-voice-btn" onclick="speakWordById(${w.id},event)" title="発音を聞く">🔊</button>${highlightWordSearch(w.en)}${newBadge}</span>
        <span class="word-jp">${highlightWordSearch(w.jp)}${inRange ? '' : ' <span style="font-size:10px;color:var(--text2);">(範囲外)</span>'}</span>
        <span class="word-status">
          <span class="badge badge-${s || 'none'}">${s || '―'}</span>
          ${manualBtn}
          <span class="word-quiz-badges">${q1b}${q2b}${q3b}</span>
        </span>
      </div>
    `;
  });
  body.innerHTML = html + (range.endId - range.startId >= 100 ? '<div class="range-preview-note">プレビューは先頭100語を表示しています。クイズには選択した全単語が含まれます。</div>' : '');
}

function toggleBookmarkRow(wordId, event) {
  event.stopPropagation();
  toggleBookmark(wordId);
  renderSet();
}

function toggleQuizBookmark() {
  if (!quiz) return;
  const word = quiz.words[quiz.idx];
  toggleBookmark(word.id);
  const bmBtn = document.getElementById('quiz-bm-btn');
  const bm = isBookmarked(word.id);
  bmBtn.textContent = bm ? '★' : '☆';
  bmBtn.classList.toggle('bookmarked', bm);
  bmBtn.title = bm ? 'ブックマーク解除' : 'ブックマークに追加';
}

function manualUpgrade(wordId, event) {
  event.stopPropagation();
  if (getStatus(wordId) === '○') {
    const qn = 'q' + selectedMode;
    if (confirm(`「${WORD_MAP[wordId].en}」を○→◎に手動昇格しますか？`)) {
      setQResult(wordId, qn, '◎');
      saveProgress();
      syncLeaderboardProfile();
      renderSet();
    }
  }
}

// =========================================================
// RENDER BOOKMARKS
// =========================================================
function getBmFilteredWords() {
  if (selectedBmFilter === 'bm') return getBookmarkedWords();
  if (selectedBmFilter === 'wrong') return getWrongWords();
  const ids = new Set([
    ...Array.from(bookmarks),
    ...getWrongWords().map(w => w.id)
  ]);
  return WORDS.filter(w => ids.has(w.id));
}

function setBmFilter(filter) {
  selectedBmFilter = filter;
  renderBookmarks();
}

function renderBookmarks() {
  const bmWords    = getBookmarkedWords();
  const wrongWords = getWrongWords();
  const allWords   = (() => {
    const ids = new Set([...Array.from(bookmarks), ...wrongWords.map(w => w.id)]);
    return WORDS.filter(w => ids.has(w.id));
  })();

  document.getElementById('bm-cnt-all').textContent   = allWords.length;
  document.getElementById('bm-cnt-bm').textContent    = bmWords.length;
  document.getElementById('bm-cnt-wrong').textContent = wrongWords.length;

  ['all','bm','wrong'].forEach(f => {
    const btn = document.getElementById('bm-filter-' + f);
    if (!btn) return;
    btn.className = 'bm-filter-btn' + (selectedBmFilter === f ? ' active-' + f : '');
  });

  const displayWords = getBmFilteredWords();
  const titleMap = { all: 'マイリスト', bm: '★ ブックマーク', wrong: '× 間違い一覧' };
  const titleEl = document.getElementById('bm-screen-title');
  if (titleEl) titleEl.textContent = titleMap[selectedBmFilter];
  document.getElementById('bm-screen-sub').textContent = `${displayWords.length}語`;

  const quizBtn = document.getElementById('btn-bm-quiz');
  if (quizBtn) {
    quizBtn.disabled = displayWords.length === 0;
    const currentCount = syncQuizCountUI('bookmark', displayWords.length);
    const btnLabelMap = {
      all: '▶ マイリストクイズ',
      bm:  '★ ブックマーククイズ',
      wrong: '× 間違い語句クイズ'
    };
    const btnColorMap = {
      all:   'var(--gold)',
      bm:    'var(--bookmark)',
      wrong: 'var(--cross)'
    };
    quizBtn.textContent = displayWords.length > 0
      ? `${btnLabelMap[selectedBmFilter]} (${currentCount} / ${displayWords.length}語)`
      : btnLabelMap[selectedBmFilter];
    quizBtn.style.background = btnColorMap[selectedBmFilter];
    quizBtn.style.color = '#fff';
  }

  const listEl = document.getElementById('bm-word-list');

  if (displayWords.length === 0) {
    const emptyMsgMap = {
      all:   ['📋', 'マイリストが空です', 'ブックマーク（☆）を追加するか、クイズで×をつけると表示されます'],
      bm:    ['☆',  'ブックマークがありません', '単語リストの ☆ ボタン、またはクイズ中の ☆ でブックマークできます'],
      wrong: ['✗',  '×の単語がありません', 'クイズで間違えた単語がここに表示されます'],
    };
    const [icon, text, sub] = emptyMsgMap[selectedBmFilter];
    listEl.innerHTML = `
      <div class="bm-empty">
        <div class="bm-empty-icon">${icon}</div>
        <div class="bm-empty-text">${text}</div>
        <div class="bm-empty-sub">${sub}</div>
      </div>`;
    return;
  }

  let html = `
    <div class="word-table-wrap">
      <div class="word-table-header" style="grid-template-columns:28px 40px 120px 1fr 90px 32px;">
        <span></span><span>No.</span><span>古文単語</span><span>意味</span><span>進捗</span><span></span>
      </div>
      <div class="word-table-scroll">`;

  displayWords.forEach(w => {
    const s   = getStatus(w.id);
    const bm  = isBookmarked(w.id);
    const isWrong = s === '×';
    const newBadge = w.isNew ? '<span class="new-badge">新</span>' : '';
    const wrongTag = isWrong ? '<span class="cross-indicator">×</span>' : '';
    const bmStar = bm
      ? `<button class="bookmark-btn bookmarked" style="display:block;" onclick="toggleBookmarkBm(${w.id},event)" title="ブックマーク解除">★</button>`
      : `<button class="bookmark-btn" onclick="toggleBookmarkBm(${w.id},event)" title="ブックマーク追加">☆</button>`;

    html += `
      <div class="word-row" style="grid-template-columns:28px 40px 120px 1fr 90px 32px;">
        <span></span>
        <span class="word-num">${w.id}</span>
        <span class="word-en"><button class="word-voice-btn" onclick="speakWordById(${w.id},event)" title="発音を聞く">🔊</button>${w.en}${newBadge}${wrongTag}</span>
        <span class="word-jp">${w.jp}</span>
        <span class="word-status"><span class="badge badge-${s || 'none'}">${s || '―'}</span></span>
        <span>${bmStar}</span>
      </div>`;
  });

  html += `</div></div>`;
  listEl.innerHTML = html;
}

function toggleBookmarkBm(wordId, event) {
  event.stopPropagation();
  toggleBookmark(wordId);
  renderBookmarks();
}

// =========================================================
// INIT
// =========================================================
async function init() {
  if (document.body && document.body.dataset && document.body.dataset.rolePage) {
    await initRolePage(document.body.dataset.rolePage);
    return;
  }
  loadProgress();
  restoreClassAssignment();
  window.addEventListener('online', () => { noticeAudience = ''; listenSchoolNotices(); refreshClassTestRange(); });
  const redirected = await enforceMaintenanceMode();
  if (redirected) return;
  document.getElementById('loading-screen').style.display = 'none';
  renderAuthFab();
  if (new URLSearchParams(location.search).get('view') === 'notifications') showNotifications();
  else if (!openSharedSelection()) showHome();
  refreshClassTestRange();
  showWelcomeModalIfNeeded();
}

init().catch(e => {
  console.warn('init error:', e);
  document.getElementById('loading-screen').style.display = 'none';
  renderAuthFab();
  if (!openSharedSelection()) showHome();
});

function showAuthModal() {
  const modal = document.getElementById('auth-choice-modal');
  if (!modal) { loginGoogle(); return; }
  modal.classList.add('show');
  modal.setAttribute('aria-hidden', 'false');
  setTimeout(() => {
    const email = document.getElementById('auth-email-input');
    if (email && window.innerWidth > 700) email.focus();
  }, 120);
}

function closeAuthModal() {
  const modal = document.getElementById('auth-choice-modal');
  if (!modal) return;
  modal.classList.remove('show');
  modal.setAttribute('aria-hidden', 'true');
  if (onboardingAuthOpen) { onboardingAuthOpen = false; advanceOnboarding(); }
}

function login(){
  showAuthModal();
}

function getEmailAuthValues() {
  const email = (document.getElementById('auth-email-input')?.value || '').trim();
  const password = document.getElementById('auth-password-input')?.value || '';
  return { email, password };
}

function authErrorMessage(e) {
  const code = e && e.code;
  if (code === 'auth/invalid-email') return 'メールアドレスの形式を確認してください';
  if (code === 'auth/user-not-found') return 'このメールアドレスは登録されていません';
  if (code === 'auth/wrong-password') return 'パスワードが違います';
  if (code === 'auth/email-already-in-use') return 'このメールアドレスは登録済みです';
  if (code === 'auth/weak-password') return 'パスワードは6文字以上にしてください';
  if (code === 'auth/operation-not-allowed') return 'Firebaseでメール/パスワードログインを有効にしてください';
  if (code === 'auth/popup-closed-by-user') return 'ログイン画面が閉じられました';
  return (e && e.message) ? e.message : '認証に失敗しました';
}

async function loginGoogle(){
  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    await auth.signInWithPopup(provider);
    storeClassAssignment(null);
    closeAuthModal();
    markWelcomeAccepted();
    showSyncStatus('Googleでログインしました');
  } catch (e) {
    console.warn('loginGoogle error:', e);
    showSyncStatus(authErrorMessage(e), true);
  }
}

async function loginEmail(){
  const { email, password } = getEmailAuthValues();
  if (!email || !password) { showSyncStatus('メールアドレスとパスワードを入力してください', true); return; }
  try {
    await auth.signInWithEmailAndPassword(email, password);
    storeClassAssignment(null);
    closeAuthModal();
    markWelcomeAccepted();
    showSyncStatus('メールでログインしました');
  } catch (e) {
    console.warn('loginEmail error:', e);
    showSyncStatus(authErrorMessage(e), true);
  }
}

async function signupEmail(){
  const { email, password } = getEmailAuthValues();
  if (!email || !password) { showSyncStatus('メールアドレスとパスワードを入力してください', true); return; }
  try {
    await auth.createUserWithEmailAndPassword(email, password);
    storeClassAssignment(null);
    closeAuthModal();
    markWelcomeAccepted();
    showSyncStatus('新規登録してログインしました');
  } catch (e) {
    console.warn('signupEmail error:', e);
    showSyncStatus(authErrorMessage(e), true);
  }
}

async function resetPassword(){
  const { email } = getEmailAuthValues();
  if (!email) { showSyncStatus('リセット用のメールアドレスを入力してください', true); return; }
  try {
    await auth.sendPasswordResetEmail(email);
    showSyncStatus('パスワード再設定メールを送信しました');
  } catch (e) {
    console.warn('resetPassword error:', e);
    showSyncStatus(authErrorMessage(e), true);
  }
}

function startWithoutLogin(){
  storeClassAssignment(null);
  closeAuthModal();
  markWelcomeAccepted();
  showSyncStatus('ログインなしで開始しました');
}


document.addEventListener('keydown', (e) => {
  const modal = document.getElementById('auth-choice-modal');
  if (!modal || !modal.classList.contains('show')) return;
  if (e.key === 'Escape') closeAuthModal();
  if (e.key === 'Enter' && (document.activeElement?.id === 'auth-email-input' || document.activeElement?.id === 'auth-password-input')) {
    loginEmail();
  }
});

async function logout(){
  try {
    await auth.signOut();
    storeClassAssignment(null);
    showSyncStatus('ログアウトしました');
  } catch (e) {
    console.warn('logout error:', e);
    showSyncStatus('ログアウトに失敗しました', true);
  }
}

auth.onAuthStateChanged(async user => {
  if (user) {
    if (await enforceUserSuspendedState(user)) return;
    await loadAccountProfile();
    await loadSchoolCodeFromProfile();
    await refreshClassTestRange();
    syncPushAudience();
    listenSchoolNotices();
    renderClassStudyShortcut();
    renderAuthFab();
    console.log('ログイン:', user.uid);
    await restoreCloudProgress();
    await syncLeaderboardProfile();
    await fetchLeaderboard();
    renderHomeRankingPanel();
    if (document.getElementById('screen-ranking') && document.getElementById('screen-ranking').classList.contains('active')) {
      renderRanking();
    }
    if (document.getElementById('screen-account') && document.getElementById('screen-account').classList.contains('active')) {
      renderAccountSettings();
    }
  } else {
    accountProfile = { nickname: '' };
    renderClassStudyShortcut();
    renderAuthFab();
    leaderboardCache = [];
    myLeaderboardRank = null;
    renderHomeRankingPanel();
    if (document.getElementById('screen-ranking') && document.getElementById('screen-ranking').classList.contains('active')) {
      renderRanking();
    }
    if (document.getElementById('screen-account') && document.getElementById('screen-account').classList.contains('active')) {
      renderAccountSettings();
    }
  }
});

window.addEventListener('beforeunload', () => {
  if (auth.currentUser) {
    saveCloudProgress();
  }
});

// =========================================================
// UI POLISH HELPERS 2026
// =========================================================
(function(){
  function getActiveScreenId(){
    const active = document.querySelector('.screen.active');
    return active ? active.id : '';
  }

  async function updateRoleNavButtons(){
    // 先生・管理メニューは下部バーから独立させず、「設定」内に統合。
    // 下部バーは ホーム / 復習 / 順位 / 設定 の4項目に固定する。
  }

  function updateUiState(){
    const id = getActiveScreenId();
    document.body.classList.toggle('is-quiz-active', id === 'screen-quiz');
    const nav = document.getElementById('mobile-bottom-nav');
    if (!nav) return;
    nav.classList.toggle('hidden', id === 'screen-quiz');
    nav.querySelectorAll('button[data-target]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.target === id);
      if (btn.dataset.target === 'screen-account') btn.querySelector('span:last-child').textContent = auth.currentUser || activeClassAssignment?.local ? 'マイページ' : 'ログイン';
    });
    updateRoleNavButtons();
  }

  function buildBottomNav(){
    if (document.getElementById('mobile-bottom-nav')) return;
    const nav = document.createElement('nav');
    nav.id = 'mobile-bottom-nav';
    nav.className = 'mobile-bottom-nav';
    nav.setAttribute('aria-label', '主要ナビゲーション');
    const icon = (paths) => `<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
    nav.innerHTML = `
      <button type="button" data-target="screen-home" onclick="showHome()">${icon('<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>')}<span>学習</span></button>
      <button type="button" data-target="screen-bookmark" onclick="showBookmarks()">${icon('<path d="M5 3h14v18l-7-4-7 4z"/>')}<span>復習</span></button>
      <button type="button" data-target="screen-search" onclick="showSearch()">${icon('<circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/>')}<span>検索</span></button>
      <button type="button" data-target="screen-notifications" onclick="showNotifications()">${icon('<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>')}<span>通知</span><span class="notice-nav-badge" id="notice-nav-badge" hidden></span></button>
      <button type="button" data-target="screen-results-dashboard" onclick="showResultsDashboard()">${icon('<path d="M4 20V12m5 8V8m5 12v-5m5 5V4"/><path d="M3 4h5l4 4 4-4h5"/>')}<span>成績</span></button>
      <button type="button" data-target="screen-account" onclick="showAccountTab()">${icon('<circle cx="12" cy="8" r="3.5"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/>')}<span>ログイン</span></button>
    `;
    document.body.appendChild(nav);
  }

  function wrapScreenFunction(name){
    if (typeof window[name] !== 'function') return;
    const original = window[name];
    if (original.__uiPolished) return;
    const wrapped = function(){
      const result = original.apply(this, arguments);
      setTimeout(updateUiState, 0);
      return result;
    };
    wrapped.__uiPolished = true;
    window[name] = wrapped;
  }

  buildBottomNav();
  updateNoticeBadge();
  ['showHome','showSearch','showNotifications','showProgress','showResultsDashboard','showAccountTab','showBookmarks','showRanking','showAccountSettings','showSetScreen','showQuiz','showResult','quitQuiz','nextQuestion'].forEach(wrapScreenFunction);
  try {
    if (auth && typeof auth.onAuthStateChanged === 'function') {
      auth.onAuthStateChanged(() => setTimeout(updateUiState, 80));
    }
  } catch (e) {}

  const app = document.getElementById('app');
  if (app && 'MutationObserver' in window) {
    new MutationObserver(updateUiState).observe(app, { attributes: true, subtree: true, attributeFilter: ['class'] });
  }
  window.addEventListener('resize', updateUiState, { passive: true });
  setTimeout(updateUiState, 0);
})();

// =========================================================
// PWA INSTALL HELPER
// =========================================================
let deferredPwaPrompt = null;
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredPwaPrompt = event;
  window.dispatchEvent(new Event('pwa-install-ready'));
});
window.addEventListener('appinstalled', () => {
  deferredPwaPrompt = null;
  if (typeof showSyncStatus === 'function') showSyncStatus('アプリとしてインストールされました');
});
async function installPwaApp() {
  if (!deferredPwaPrompt) {
    if (typeof showSyncStatus === 'function') showSyncStatus('ブラウザの「ホーム画面に追加」からインストールできます');
    return;
  }
  deferredPwaPrompt.prompt();
  await deferredPwaPrompt.userChoice.catch(() => null);
  deferredPwaPrompt = null;
}
(function addPwaButtonToAccountScreen(){
  function ensureButton(){
    const screen = document.getElementById('screen-account');
    if (!screen || document.getElementById('btn-install-pwa')) return;
    const cards = screen.querySelectorAll('.account-card');
    const target = cards[cards.length - 1] || screen.querySelector('.content');
    if (!target) return;
    const box = document.createElement('div');
    box.className = 'account-privacy-item';
    box.style.marginTop = '12px';
    box.innerHTML = '<span class="account-privacy-icon">📱</span><span><strong>アプリとして使う</strong><br>ホーム画面に追加すると、次回から通信量を抑えてすばやく開けます。<br><button id="btn-install-pwa" class="btn btn-secondary" style="margin-top:10px" onclick="installPwaApp()">ホーム画面に追加</button></span>';
    target.appendChild(box);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ensureButton);
  else ensureButton();
  window.addEventListener('pwa-install-ready', ensureButton);
})();

// =========================================================
// FULL UI UPGRADE HELPERS 2026-04
// 既存ロジックを壊さず、導線・検索・キーボード操作・表示状態だけを追加
// =========================================================
(function(){
  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
  let setFilter = 'all';
  let setSearch = '';

  function toast(message) {
    let el = $('#ui-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'ui-toast';
      el.className = 'ui-toast';
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('show'), 1800);
  }
  window.uiToast = toast;

  function getStatsSafe(){
    try { return typeof getTotalStats === 'function' ? getTotalStats() : {'':0,'○':0,'◎':0,'×':0}; }
    catch(e){ return {'':0,'○':0,'◎':0,'×':0}; }
  }

  function nextRecommendedSet(){
    try {
      if (typeof TOTAL_SETS !== 'number' || typeof isSetCompleted !== 'function' || typeof getSetStats !== 'function') return 0;
      for (let i=0; i<TOTAL_SETS; i++) {
        if (!isSetCompleted(i)) {
          const s = getSetStats(i);
          if ((s['○'] || 0) + (s['×'] || 0) + (s['◎'] || 0) > 0) return i;
        }
      }
      for (let i=0; i<TOTAL_SETS; i++) if (!isSetCompleted(i)) return i;
    } catch(e) {}
    return 0;
  }

  function ensureHomeCommandCenter(){
    const content = $('#screen-home .content');
    const existing = $('#home-command-center');
    if ((getStatsSafe()['×'] || 0) < WRONG_THRESHOLD) { existing?.remove(); return; }
    const before = $('#home-bookmark-panel');
    if (!content || !before || before.parentElement !== content) return;
    let box = $('#home-command-center');
    const stats = getStatsSafe();
    const total = typeof WORDS !== 'undefined' ? WORDS.length : ((stats['']||0)+(stats['○']||0)+(stats['◎']||0)+(stats['×']||0));
    const done = (stats['○']||0) + (stats['◎']||0) + (stats['×']||0);
    const percent = total ? Math.round(done / total * 100) : 0;
    const wrong = stats['×'] || 0;
    if (wrong < WRONG_THRESHOLD) { box?.remove(); return; }
    const rec = nextRecommendedSet();
    if (!box) {
      box = document.createElement('div');
      box.id = 'home-command-center';
      box.className = 'home-command-center';
      content.insertBefore(box, before);
    }
    box.innerHTML = `
      <div>
        <div class="home-command-kicker">Today&apos;s study</div>
        <div class="home-command-title">全体進捗 ${percent}% — 次は Unit ${rec + 1} から</div>
        <div class="home-command-sub">迷ったら「続きから」。×が多い日は復習を先にすると定着しやすいです。</div>
      </div>
      <div class="home-command-actions">
        <button type="button" class="ui-chip-btn primary" onclick="showSet(${rec})">続きから</button>
        <button type="button" class="ui-chip-btn danger" ${wrong ? 'onclick="startReviewQuiz()"' : 'disabled'}>×復習 ${wrong}</button>
        <button type="button" class="ui-chip-btn" onclick="showBookmarks()">マイリスト</button>
      </div>`;
  }

  function ensureHomeTools(){
    const title = $$('#screen-home .section-title').find(el => /学習セット/.test(el.textContent || ''));
    const grid = $('#sets-grid');
    if (!title || !grid || grid.querySelector('.word-picker-card')) return;
    let tools = $('#home-tools');
    if (!tools) {
      tools = document.createElement('div');
      tools.id = 'home-tools';
      tools.className = 'home-tools';
      tools.innerHTML = `
        <input id="home-set-search" class="home-search" type="search" placeholder="Unit番号で検索（例: 12）" autocomplete="off">
        <div class="home-filter-pills" aria-label="セット表示フィルター">
          <button type="button" class="ui-chip-btn active" data-filter="all">すべて</button>
          <button type="button" class="ui-chip-btn" data-filter="active">学習中</button>
          <button type="button" class="ui-chip-btn" data-filter="done">完了</button>
        </div>`;
      title.insertAdjacentElement('afterend', tools);
      $('#home-set-search', tools).addEventListener('input', e => { setSearch = e.target.value.trim(); applySetFilters(); });
      $$('.home-filter-pills button', tools).forEach(btn => {
        btn.addEventListener('click', () => {
          setFilter = btn.dataset.filter || 'all';
          $$('.home-filter-pills button', tools).forEach(b => b.classList.toggle('active', b === btn));
          applySetFilters();
        });
      });
    }
    const input = $('#home-set-search', tools);
    if (input && input.value !== setSearch) input.value = setSearch;
    applySetFilters();
  }

  function applySetFilters(){
    const q = String(setSearch || '').replace(/[^0-9]/g, '');
    $$('#sets-grid .set-card').forEach((card, idx) => {
      const active = !!card.querySelector('.tag-active');
      const done = card.classList.contains('completed') || !!card.querySelector('.tag-done');
      let ok = true;
      if (setFilter === 'active') ok = active;
      if (setFilter === 'done') ok = done;
      if (q) ok = ok && String(idx + 1).includes(q);
      card.hidden = !ok;
      card.setAttribute('tabindex', ok ? '0' : '-1');
      card.setAttribute('role', 'button');
      card.setAttribute('aria-label', `Unit ${idx + 1} を開く`);
      if (!card.dataset.keyReady) {
        card.addEventListener('keydown', ev => {
          if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); card.click(); }
        });
        card.dataset.keyReady = '1';
      }
    });
  }

  function improveScreenState(){
    const active = $('.screen.active');
    const id = active ? active.id : '';
    document.body.classList.toggle('is-quiz-active', id === 'screen-quiz');
    $$('.screen').forEach(s => s.setAttribute('aria-hidden', s === active ? 'false' : 'true'));
    const map = { 'screen-home':'古文単語マスター', 'screen-set':'学習セット', 'screen-quiz':'クイズ中', 'screen-bookmark':'マイリスト', 'screen-ranking':'ランキング', 'screen-account':'アカウント設定', 'screen-result':'結果' };
    if (map[id]) document.title = `${map[id]} | 古文単語マスター`;
  }

  function installBackToTop(){
    if ($('#back-to-top')) return;
    const btn = document.createElement('button');
    btn.id = 'back-to-top';
    btn.className = 'back-to-top';
    btn.type = 'button';
    btn.textContent = '↑';
    btn.setAttribute('aria-label', 'ページ上部へ戻る');
    btn.addEventListener('click', () => window.scrollTo({top:0, behavior:'smooth'}));
    document.body.appendChild(btn);
    window.addEventListener('scroll', () => btn.classList.toggle('show', window.scrollY > 500), {passive:true});
  }

  function installKeyboardShortcuts(){
    if (window.__fullUiShortcutsReady) return;
    window.__fullUiShortcutsReady = true;
    document.addEventListener('keydown', ev => {
      const tag = (ev.target && ev.target.tagName || '').toLowerCase();
      const typing = tag === 'input' || tag === 'textarea' || ev.isComposing;
      const activeId = $('.screen.active')?.id || '';
      if (activeId === 'screen-quiz') {
        if (!typing && /^[1-6]$/.test(ev.key)) {
          const btn = $$('.choice-btn')[Number(ev.key)-1];
          if (btn && !btn.disabled) { ev.preventDefault(); btn.click(); }
        }
        if (!typing && ev.key.toLowerCase() === 'b') {
          const bm = $('#quiz-bm-btn');
          if (bm) { ev.preventDefault(); bm.click(); toast('ブックマークを切り替えました'); }
        }
        if (!typing && ev.key === 'Enter') {
          const next = $('.next-btn[style*="block"], .next-btn:not([style*="display: none"])');
          const confirm = $('.confirm-btn');
          if (next && getComputedStyle(next).display !== 'none') { ev.preventDefault(); next.click(); }
          else if (confirm && getComputedStyle(confirm).display !== 'none') { ev.preventDefault(); confirm.click(); }
        }
      }
      if (!typing && ev.key === '/' && activeId === 'screen-home') {
        const input = $('#home-set-search');
        if (input) { ev.preventDefault(); input.focus(); }
      }
    });
  }

  function wrap(name, after){
    if (typeof window[name] !== 'function') return;
    const original = window[name];
    if (original.__fullUiWrapped) return;
    const wrapped = function(){
      const result = original.apply(this, arguments);
      setTimeout(() => after(name), 0);
      return result;
    };
    wrapped.__fullUiWrapped = true;
    window[name] = wrapped;
  }

  function afterAnyRender(name){
    improveScreenState();
    if (name === 'renderHome' || name === 'showHome') {
      ensureHomeCommandCenter();
      ensureHomeTools();
    }
    if (name === 'renderSet' || name === 'showSet') {
      $$('#word-table-body .word-row').forEach(row => row.setAttribute('tabindex', '0'));
    }
  }

  function boot(){
    installBackToTop();
    installKeyboardShortcuts();
    ['showScreen','showHome','showSet','showBookmarks','showRanking','showAccountSettings','showQuiz','showResult','quitQuiz','nextQuestion','renderHome','renderSet','renderQuestion'].forEach(n => wrap(n, afterAnyRender));
    setTimeout(() => {
      improveScreenState();
      ensureHomeCommandCenter();
      ensureHomeTools();
    }, 0);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

document.addEventListener('DOMContentLoaded',()=>{
  const addBtn=()=>{
    const loginBtn=document.querySelector('.auth-btn.login, .auth-pill-login, .auth-btn.logout');
    if(!loginBtn || document.querySelector('.classi-login-btn')) return;
    const btn=document.createElement('button');
    btn.className='classi-login-btn';
    btn.textContent='📘 学習記録';
    btn.onclick=()=>window.open('https://id.classi.jp/login/identifier','_blank');
    const parent=loginBtn.parentElement;
    if(parent){
      if(getComputedStyle(parent).display!=='flex'){parent.style.display='flex';parent.style.gap='8px';parent.style.alignItems='center';}
      parent.insertBefore(btn, loginBtn.nextSibling);
    }
  };
  addBtn();
  setInterval(addBtn,1200);
});

/* Mobile visible login bar */
document.addEventListener('DOMContentLoaded', () => {
  const CLASSI_URL = 'https://id.classi.jp/login/identifier';

  function clickExistingLogin() {
    const selectors = [
      '.auth-btn.login',
      '.auth-pill-login',
      '.auth-pill',
      'button[onclick*="login"]',
      'button[onclick*="signIn"]'
    ];
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el && !el.classList.contains('mobile-login-main')) {
        el.click();
        return;
      }
    }
    if (typeof signInWithGoogle === 'function') {
      signInWithGoogle();
      return;
    }
    if (typeof login === 'function') {
      login();
      return;
    }
    const accountNav = document.querySelector('[data-target="screen-account"]');
    if (accountNav) accountNav.click();
  }

  function ensureMobileLoginBar() {
    if (document.querySelector('.mobile-login-bar')) return;

    const bar = document.createElement('div');
    bar.className = 'mobile-login-bar';
    bar.innerHTML = `
      <button type="button" class="mobile-login-main">🔐 ログイン</button>
      <button type="button" class="mobile-classi-main">📘 学習記録</button>
    `;

    bar.querySelector('.mobile-login-main').addEventListener('click', clickExistingLogin);
    bar.querySelector('.mobile-classi-main').addEventListener('click', () => {
      window.open(CLASSI_URL, '_blank');
    });

    document.body.appendChild(bar);
  }

  // The bottom navigation now owns login and account access.
});

document.addEventListener('DOMContentLoaded',()=>{
  const selectors=[
    '[id*="ad"]','.ad','.ads','.advertisement','.banner-ad',
    'iframe[src*="ad"]','iframe[id*="ad"]'
  ];
  function attachClose(){
    document.querySelectorAll(selectors.join(',')).forEach(el=>{
      if(el.dataset.closeReady) return;
      el.dataset.closeReady='1';
      const target = el.tagName==='IFRAME' ? el.parentElement || el : el;
      const cs=getComputedStyle(target);
      if(cs.position==='static') target.style.position='relative';
      const btn=document.createElement('button');
      btn.className='ad-close-btn';
      btn.type='button';
      btn.setAttribute('aria-label','広告を閉じる');
      btn.innerHTML='×';
      btn.onclick=(e)=>{
        e.stopPropagation();
        target.classList.add('ad-hidden');
      };
      target.appendChild(btn);
    });
  }
  attachClose();
  const mo=new MutationObserver(()=>attachClose());
  mo.observe(document.body,{childList:true,subtree:true});
});

(function(){
 function hideBottomAds(){
   if(window.innerWidth>700) return;
   const sels='iframe[src*="googlesyndication"],iframe[src*="doubleclick"],ins.adsbygoogle,.adsbygoogle,[id*="google_ads_iframe"],.sticky-ad,.bottom-ad,.footer-ad,[class*="bottom-ad"],[class*="sticky-ad"]';
   document.querySelectorAll(sels).forEach(el=>{
     const r=el.getBoundingClientRect();
     if(r.bottom > window.innerHeight-220 || el.matches(sels)){
       const t=el.parentElement && el.tagName==='IFRAME' ? el.parentElement : el;
       t.style.display='none';
       t.style.height='0';
       t.style.overflow='hidden';
     }
   });
 }
 ['load','resize','scroll'].forEach(ev=>window.addEventListener(ev,hideBottomAds,{passive:true}));
 document.addEventListener('DOMContentLoaded',hideBottomAds);
 setInterval(hideBottomAds,1500);
})();

/* Mobile hamburger menu removed: smartphone navigation is now handled by the bottom bar. */
(function(){
  function removeOldMobileMenu(){
    document.body.classList.remove('mobile-menu-open');
    document.querySelectorAll('.mobile-hamburger-btn,.mobile-menu-backdrop,.mobile-menu-drawer').forEach(el => el.remove());
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', removeOldMobileMenu);
  else removeOldMobileMenu();
})();


function updateOfflineToast() {
  const toast = document.getElementById('offline-toast');
  const text = document.getElementById('offline-toast-text');
  if (!toast) return;
  const offline = !navigator.onLine;
  if (text) text.textContent = offline ? 'オフラインで利用中です' : 'オンラインに戻りました';
  toast.classList.add('show');
  clearTimeout(window.__offlineToastTimer);
  window.__offlineToastTimer = setTimeout(() => {
    if (navigator.onLine) toast.classList.remove('show');
  }, offline ? 4000 : 1800);
}

function initOfflineSupportUI() {
  window.addEventListener('offline', updateOfflineToast);
  window.addEventListener('online', updateOfflineToast);
  if (!navigator.onLine) updateOfflineToast();
}


// =========================================================
// HOME GLOBAL WORD SEARCH 2026-05-16
// 全単語検索をホーム画面に統合。Unit画面内検索は使わない。
// =========================================================
(function(){
  let homeWordQuery = '';

  function normalizeSearch(value) {
    return String(value || '')
      .normalize('NFKC')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  function safeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function highlight(value, query) {
    const raw = String(value || '');
    const q = normalizeSearch(query);
    const escaped = safeHtml(raw);
    if (!q) return escaped;
    const safeQ = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    try { return escaped.replace(new RegExp(`(${safeQ})`, 'ig'), '<mark class="home-word-search-mark">$1</mark>'); }
    catch(e) { return escaped; }
  }

  function getUnitIndexByWordId(id) {
    try {
      if (typeof SET_SIZE === 'number') return Math.max(0, Math.floor((Number(id) - 1) / SET_SIZE));
    } catch(e) {}
    return 0;
  }

  function matchWord(word, query) {
    const q = normalizeSearch(query);
    if (!q) return false;
    const hay = normalizeSearch(`${word.id} ${word.en} ${word.jp}`);
    return hay.includes(q);
  }

  function statusLabel(id) {
    try { return (typeof getStatus === 'function' ? getStatus(id) : '') || '―'; }
    catch(e) { return '―'; }
  }

  function renderHomeWordSearch() {
    const input = document.getElementById('home-word-search-input');
    const count = document.getElementById('home-word-search-count');
    const results = document.getElementById('home-word-search-results');
    const panel = document.getElementById('home-word-search-panel');
    if (!input || !count || !results || typeof WORDS === 'undefined') return;

    if (input.value !== homeWordQuery) input.value = homeWordQuery;
    const q = normalizeSearch(homeWordQuery);
    panel.classList.toggle('is-searching', !!q);

    if (!q) {
      count.textContent = `${WORDS.length}語`;
      results.innerHTML = '<div class="home-word-search-guide">検索すると、全Unitの単語がここに表示されます。</div>';
      return;
    }

    const matched = WORDS.filter(w => matchWord(w, q));
    const shown = matched.slice(0, 80);
    count.textContent = matched.length > 80 ? `${matched.length}語中80件表示` : `${matched.length}語`;

    if (matched.length === 0) {
      results.innerHTML = `<div class="home-word-search-empty">「${safeHtml(homeWordQuery)}」に一致する単語がありません。</div>`;
      return;
    }

    results.innerHTML = shown.map(w => {
      const unitIdx = getUnitIndexByWordId(w.id);
      const unitLabel = unitIdx + 1;
      const bm = (typeof isBookmarked === 'function' && isBookmarked(w.id));
      const newBadge = w.isNew ? '<span class="home-word-new">新</span>' : '';
      return `<div class="home-word-result" data-word-id="${w.id}">
        <button class="home-word-result-main" type="button" onclick="showSearchWord(${w.id})" aria-label="${safeHtml(w.en)} を選択する">
          <span class="home-word-no">${w.id}</span>
          <span class="home-word-text">
            <span class="home-word-en">${highlight(w.en, homeWordQuery)}${newBadge}</span>
            <span class="home-word-jp">${highlight(w.jp, homeWordQuery)}</span>
          </span>
          <span class="home-word-meta"><span>Unit ${unitLabel}</span><span class="home-word-status">${statusLabel(w.id)}</span></span>
        </button>
        <div class="home-word-actions">
          <button type="button" class="home-word-action" onclick="speakWordById(${w.id}, event)" title="発音を聞く">🔊</button>
          <button type="button" class="home-word-action ${bm ? 'active' : ''}" onclick="toggleHomeWordBookmark(${w.id}, event)" title="ブックマーク">${bm ? '★' : '☆'}</button>
        </div>
      </div>`;
    }).join('');
  }

  window.toggleHomeWordBookmark = function(id, event) {
    if (event) event.stopPropagation();
    if (typeof toggleBookmark === 'function') toggleBookmark(id);
    renderHomeWordSearch();
  };

  function bindHomeWordSearch() {
    const input = document.getElementById('home-word-search-input');
    const clear = document.getElementById('home-word-search-clear');
    if (!input || input.dataset.homeWordBound === '1') return;
    input.dataset.homeWordBound = '1';
    input.addEventListener('input', () => {
      homeWordQuery = input.value || '';
      renderHomeWordSearch();
    });
    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') {
        homeWordQuery = '';
        input.value = '';
        renderHomeWordSearch();
      }
    });
    if (clear) clear.addEventListener('click', () => {
      homeWordQuery = '';
      input.value = '';
      input.focus();
      renderHomeWordSearch();
    });
  }

  function hideUnitSearchUi() {
    document.querySelectorAll('#screen-set .word-search-panel').forEach(el => el.remove());
    const unitSearch = document.getElementById('word-search-input');
    if (unitSearch) unitSearch.closest('.word-search-panel')?.remove();
  }

  function afterHomeRender() {
    bindHomeWordSearch();
    renderHomeWordSearch();
    hideUnitSearchUi();
  }

  function wrap(name) {
    if (typeof window[name] !== 'function') return;
    const original = window[name];
    if (original.__homeGlobalSearchWrapped) return;
    const wrapped = function(){
      const res = original.apply(this, arguments);
      setTimeout(afterHomeRender, 0);
      return res;
    };
    wrapped.__homeGlobalSearchWrapped = true;
    window[name] = wrapped;
  }

  function boot() {
    bindHomeWordSearch();
    renderHomeWordSearch();
    hideUnitSearchUi();
    ['renderHome','showHome','renderSet','showSet'].forEach(wrap);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();


/* Study Dashboard UI placeholder */
