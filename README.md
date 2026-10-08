# 古文単語マスター

桐原書店『読んで見て覚える 重要古文単語315』の学習用PWAです。シス単マスターと同じUI・認証基盤を使い、古文単語のデータと学習進捗・ランキングは専用領域に分離しています。

- `index.html`: 学習アプリ
- `assets/js/app.js`: クイズ、進捗、認証、ランキング
- `word-data.js`: 提供された315語データ
- `functions/`: 共有Firebaseプロジェクト向けCloud Functions

ログインユーザー・学校コードはシス単マスターと共有します。古文版のクラウド進捗は `kobunAppState`、ランキングは `rankingsKobun` に保存します。