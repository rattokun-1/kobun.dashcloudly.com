# 学校別参加コード（管理者発行）機能

## 追加内容

- アカウント設定画面に「学校別参加コード」を追加
- 一般ユーザーは発行済みコードを入力して学校グループに参加
- ランキングは参加中の学校コード内だけに絞り込み
- 管理者のみコード発行・停止・再有効化が可能

## 管理者の設定方法

`assets/js/app.js` の先頭付近にある以下を編集してください。

```js
const ADMIN_EMAILS = [
  'admin@example.com'
];
const ADMIN_UIDS = [
  // 'FirebaseAuthUidHere'
];
```

Googleログインで使う管理者メール、または Firebase Authentication の UID を入れると、アカウント設定画面に「管理者用コード発行」が表示されます。

## 重要

このZIPではフロント側で管理者判定を入れています。公開サービスで厳密に制限する場合は、Firestore Security Rules でも `schoolCodes` の作成・更新権限を管理者だけに絞ってください。

## 参加コード保存先

- `schoolCodes/{CODE}`: 発行済みコード
- `users/{uid}`: ユーザーの参加コード
- `rankings/{uid}`: ランキング用データに `schoolCode` を追加

