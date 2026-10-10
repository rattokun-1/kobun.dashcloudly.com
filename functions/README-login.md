# 無料プラン対応ログイン
lookupLoginEmail を削除しました。メール入力後は登録の有無を照会せずパスワード入力へ進みます。ログイン・新規登録の結果は Firebase Authentication で確認します。メールログインのために Cloud Functions を配置する必要はありません。
functions/index.js のその他の関数は学校通知等の既存機能であり、メールログインとは独立しています。
