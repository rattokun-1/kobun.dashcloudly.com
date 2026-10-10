# セキュリティ修正と検証

## 本番確認

2026-10-10 JST、認証済みFirebase Rules APIから現在配置されているルールを取得した。Googleのルール評価APIへ合成の認証・文書データを渡したところ、停止中プロフィール削除、停止中ランキング書込、別校ランキング書込が許可される判定を再現した。これに加えて一時的なメール認証テストアカウントで本番REST APIにアクセスし、両ランキングへの不正な所属校・負の点数の保存、停止中プロフィール更新・削除、停止フラグなし再作成がすべてHTTP 200になることを再現した。テスト用プロフィール・両ランキング・認証アカウントはすべて削除しHTTP 200を確認した。既存ユーザーのデータは変更していない。未認証の他人プロフィール読取は拒否された。

両公開ログインページでセキュリティヘッダー不足を確認した。Auth設定ではメール列挙防止が有効でMFAは無効だった。管理者のGoogleアカウント側の2段階認証は未確認。

## 実装

- usersの本人削除を禁止し、停止中の本人更新・ランキング操作を拒否。本人のプロフィール読取は停止状態の確認に必要なため残す。
- 両サイトに同じルールを収録し、両ランキングの所属校・UID・フィールド・型・範囲を検証。更新時は既存管理用フィールドの変更を拒否し、保存済みの管理用フィールドは保持できる。
- 停止状態を読めない場合はクラウド利用を継続せずサインアウトする。
- 利用停止とプロフィール・ロール変更を監査記録と同じバッチで保存。監査記録のクライアント更新・削除は禁止。
- 動的管理ボタンの引数をJavaScript文字列としてエンコード。Firebase CDNスクリプトへSRIを追加。
- Apache HTTPS VirtualHost用のヘッダー設定をdeploy/security-headers.confに収録。frame-ancestors等は強制、インラインスクリプト整理用のCSPはReport-Only。

## 検証コマンド

Node.jsと認証済みFirebase CLIがある環境で、プロジェクトを明示して実行する。security-rules-api.cjsはローカル候補ルールをGoogleの評価APIへ送るだけで、ルール配置・Firestore書込を行わない。文書参照は合成データのモック。

```powershell
$env:FIREBASE_PROJECT_ID = 'systan-app-v6'
node tests/security-rules-api.cjs
node tests/security-client.cjs
node tests/login-regression.cjs
node tests/sync-regression.cjs
```

23件のルール試験では不正操作の拒否に加えて正常なランキング作成・更新、プロフィール更新、管理者操作を確認する。

## 配置と残る制約

このPR作成時点では本番への配置はしていない。両サイトのルールは同一だがGitHubの別リポジトリなので、変更時に一致を確認し、同じデータベースには一方からだけ配置する。配置前に現行ルールを保存して差分を確認する。

```powershell
firebase deploy --only firestore:rules --project systan-app-v6
```

Apache設定はHTTPS VirtualHostからIncludeしてmod_headersを有効にし、apache2ctl configtestの成功後にreloadする。Cloudflare経由の実レスポンスとログインを再確認する。CSP Report-Onlyは遮断しない。インラインスクリプト全面外部化・レポート収集先・監視アラート・管理者MFA/App Check設定は別途必要。無料プランや認証方式に影響する設定は自動変更しない。

ランキング数値の型・範囲は検証するが、クライアントが計算する上限内の点数の真正性は保証しない。教師の進捗確認はこの限界を前提に扱う。

古文FunctionsはNode.js 22、firebase-admin 14.5.0、firebase-functions 7.4.0へ更新しロックファイルを追加。npm auditは脆弱性0件、Node.js 22でエントリーポイント読込を確認。全体通知はcreatedByUidから取得した実ユーザーの検証済み管理者メール・停止状態を確認する。既存のcreatedByEmailだけの通知文書は拒否されるため、通知を作成する運用はcreatedByUidへ移行する。
