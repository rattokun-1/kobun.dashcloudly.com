# update.html

PWA更新用ページです。

## 使い方

`/update.html` をユーザーに案内してください。

このページでは、可能な範囲で以下を自動実行します。

- Service Worker登録解除
- Cache Storage削除
- Cookie削除
- localStorage / sessionStorage削除

## 注意

ブラウザ仕様上、ホーム画面にインストール済みのPWA自体の削除・再インストールは完全自動化できません。
ページ内で削除後、ユーザーにPWAの削除と再インストールを案内します。
