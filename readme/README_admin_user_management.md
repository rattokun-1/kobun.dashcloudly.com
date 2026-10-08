# 管理者ユーザー管理機能

## 追加内容

管理者ダッシュボードに「ユーザー管理」を追加しました。

管理者は以下を変更できます。

- 表示名
- 学校コード
- 学校名 / クラス名
- 権限メモ（一般 / 先生 / 管理者メモ）
- 管理メモ
- アプリ内利用停止 / 解除
- アプリ内プロフィール・ランキング情報の削除

## 注意

Firebase Authentication のメールアドレス・パスワード自体は、フロントエンドの管理画面からは変更できません。
メール・パスワード変更やアカウント削除を完全に行う場合は、Firebase Console または Cloud Functions Admin SDK が必要です。

## Firestoreルール

同梱の `firestore.rules` は、管理者メール `yuki.1092.mkupo1216.m@gmail.com` のみがユーザー情報・設定を変更できる設定です。
Firebase Console > Firestore Database > ルール に貼り付けて公開してください。
