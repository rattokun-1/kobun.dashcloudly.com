# ログイン方法の追加

この版ではログイン画面を以下の3択に変更しています。

- Googleログイン
- メール / パスワードログイン
- ログインせずに開始

## Firebase側で必要な設定

Firebase Console > Authentication > Sign-in method で次を有効化してください。

1. Google
2. Email/Password

メールログインが利用できない場合、アプリには一般的なログインエラーが表示されます。Authenticationの有効化状況は管理者がFirebase Consoleで確認してください。

## 管理者メール

管理者メールは `assets/js/app.js` の `ADMIN_EMAILS` に設定済みです。

```js
const ADMIN_EMAILS = [
  'yuki.1092.mkupo1216.m@gmail.com'
];
```
