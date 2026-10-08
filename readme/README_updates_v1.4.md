# 更新とオフライン利用（v1.4）

- HTML、JavaScript、CSSはオンライン時に新しいファイルを優先し、通信できない時だけ端末の保存版を使用します。
- 新しいService Workerが有効になったとき、開いているタブは1回だけ再読み込みします。Cookieや学習進捗の削除は不要です。
- 次の配布時には `sw.js` の `CACHE_VERSION`、`assets/js/app.js` の `APP_CACHE_VERSION`、`index.html` のCSS/JSの `?v=` を同じ新バージョンに更新してください。
- 配布先サーバーやCDNがHTMLを長期間キャッシュする設定の場合は、HTMLのキャッシュ設定も見直してください。旧HTMLが届く間はブラウザー側だけで更新を検知できません。
