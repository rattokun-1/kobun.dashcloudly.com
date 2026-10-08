# 管理者ダッシュボード版

## 管理者メール

`assets/js/app.js` の `ADMIN_EMAILS` に以下を設定済みです。

```js
const ADMIN_EMAILS = [
  'yuki.1092.mkupo1216.m@gmail.com'
];
```

## Firebaseルール

`firestore.rules` の内容を Firebase Console > Firestore Database > ルール に貼り付けて公開してください。

## 追加機能

- 管理者のみ学校コードを発行・停止・削除
- 管理者ダッシュボードで発行コード数、有効コード数、ランキング参加者数を確認
- 管理者のみ `appSettings/global` の設定変更が可能
- 一般ユーザーは発行済みコードへの参加のみ可能
