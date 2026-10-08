# 学校別通知の導入（v1.7）

通知一覧は下部バーの「通知」から開けます。学校・クラスのテスト範囲が変更されると通知が作られます。学校管理者はアカウント設定の学校・クラス欄で範囲を保存し、続けて曜日と日本時間の時刻を指定して毎週の通知を設定できます。テスト日を入れると前日の同時刻にも通知します。同日に毎週通知が重なる場合はテスト前日の通知だけを送ります。

## 配信に必要な設定

1. `firestore.rules` の全体を Firebase Firestore のルールへ反映します。`schoolNotices` はサーバーだけが作成し、`studySchedules` は管理者だけが編集します。学校通知の内容は学校IDを知る利用者が読めるものとして扱ってください。
2. `functions/index.js` と `functions/package.json` を既存のFirebase Functionsプロジェクトへ配置し、依存関係をインストールしてデプロイします。関数 `notifySchoolRangeChanged`、`notifyClassRangeChanged`、`sendScheduledStudyReminders`、`sendSchoolNotification` を使います。Firebase CLIで対象プロジェクトを確認してから `firebase deploy --only functions` を実行してください。
3. 定期通知にはCloud Schedulerを使用します。プロジェクトで関連APIと課金の設定を確認してください。通知スケジュールの時刻は日本時間（Asia/Tokyo）です。
4. 端末のプッシュ通知を使う場合は、Firebase Console → プロジェクト設定 → Cloud Messaging → Web Push certificates の公開鍵を `assets/js/app.js` の `FCM_VAPID_KEY` に設定して再配布します。ユーザーはPWAをインストールし、通知画面から通知を許可します。ブラウザーやOSがWeb Pushに対応しない場合はアプリ内の通知一覧を利用できます。

アプリ内通知一覧はプッシュ許可がなくても読めますが、範囲変更・定期通知の自動作成にはCloud Functionsのデプロイが必要です。学校IDを変更すると端末の通知対象も変更されます。通知一覧の既読状態は端末に保存されます。
