# ログイン方法の追加

この版ではログイン画面を以下の3択に変更しています。

- Googleログイン
- メール / パスワードログイン
- ログインせずに開始

## Firebase側で必要な設定

Firebase Console > Authentication > Sign-in method で次を有効化してください。

1. Google
2. Email/Password

メールログインを有効にしていない場合、アプリ側では `Firebaseでメール/パスワードログインを有効にしてください` と表示されます。

## 管理者メール

管理者メールは `assets/js/app.js` の `ADMIN_EMAILS` に設定済みです。

```js
const ADMIN_EMAILS = [
  'yuki.1092.mkupo1216.m@gmail.com'
];
```
