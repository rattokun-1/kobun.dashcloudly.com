# メンテナンスモード ワンタップ切り替え

## 使い方

1. Firebase Authenticationで管理者メール `yuki.1092.mkupo1216.m@gmail.com` でログインします。
2. アプリ内の「設定」→「管理者ダッシュボード」を開きます。
3. 「メンテナンスモード」の ON / OFF ボタンを押します。

ONにすると、一般ユーザーは `update.html` に自動遷移します。
管理者はログイン済みなら通常画面を開けるため、そのままOFFへ戻せます。

## 管理者が未ログインでメンテナンス中に入る方法

メンテナンス中に管理者ログインしたい場合は、次のようにアクセスしてください。

```
/index.html?admin=1
```

ログイン後、設定画面からOFFにできます。

## Firestore

`appSettings/global` の `maintenanceMode` を `true / false` で切り替えています。
ルールは `firestore.rules` をFirebase Consoleへ貼り付けてください。
