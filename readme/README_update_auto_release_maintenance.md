# メンテナンス自動解除機能

`update.html` で以下の処理が完了した端末は、現在のメンテナンス表示から自動的に解除されます。

- Service Worker解除
- キャッシュ削除
- Cookie削除
- localStorage / sessionStorage削除
- 完了端末として `systan_maintenance_cleanup_done_v1` を再保存

管理者がメンテナンスをONにするたびに `maintenanceReleaseId` が更新されるため、過去に更新済みだった端末まで常に通過することはありません。

Firestore: `appSettings/global`

```json
{
  "maintenanceMode": true,
  "maintenanceReleaseId": "maintenance-xxxxxxxxxxxxx"
}
```
