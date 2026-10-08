const admin = require('firebase-admin');
const crypto = require('node:crypto');
const { onDocumentCreated, onDocumentUpdated, onDocumentWritten } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');

admin.initializeApp();
const firestore = admin.firestore();
const ADMIN_EMAIL = 'yuki.1092.mkupo1216.m@gmail.com';
const stamp = () => admin.firestore.FieldValue.serverTimestamp();
const noticeId = value => crypto.createHash('sha256').update(value).digest('hex').slice(0, 32);
const range = data => {
  const start = Number(data?.startId), end = Number(data?.endId);
  return Number.isInteger(start) && Number.isInteger(end) && start >= 1 && end <= 339 && start <= end
    ? `${start}〜${end}番` : '';
};
const createNotice = async (key, values) => {
  try {
    await firestore.collection('schoolNotices').doc(noticeId(key)).create({
      ...values, createdAt: stamp(), sourceKey: key
    });
  } catch (error) {
    if (error.code !== 6 && error.code !== 'already-exists') throw error;
  }
};

// Automatic notice only when an existing school's range actually changes.
exports.notifySchoolRangeChanged = onDocumentUpdated('schoolCodes/{schoolId}', async event => {
  if (!event.data) return;
  const before = range(event.data.before.data()), after = range(event.data.after.data());
  if (!after || before === after || event.data.after.data()?.active === false) return;
  const schoolId = event.params.schoolId;
  await createNotice(`school-range:${event.id}`, {
    schoolId, classId: '', type: 'range_changed',
    title: '単語テスト範囲が更新されました', body: `今回の範囲は${after}です。`,
    startId: Number(event.data.after.data().startId), endId: Number(event.data.after.data().endId)
  });
});

exports.notifyClassRangeChanged = onDocumentWritten('schoolCodes/{schoolId}/classes/{classId}', async event => {
  const afterData = event.data?.after?.data(), beforeData = event.data?.before?.data();
  const after = range(afterData), before = range(beforeData);
  if (!after || before === after || afterData?.active === false) return;
  await createNotice(`class-range:${event.id}`, {
    schoolId: event.params.schoolId, classId: event.params.classId, type: 'range_changed',
    title: `${afterData.className || event.params.classId}のテスト範囲が更新されました`,
    body: `今回の範囲は${after}です。`, startId: Number(afterData.startId), endId: Number(afterData.endId)
  });
});

// Each saved schedule is sent once per local date, even after Cloud Scheduler retries.
exports.sendScheduledStudyReminders = onSchedule({
  schedule: '0 * * * *', timeZone: 'Asia/Tokyo', region: 'asia-northeast1'
}, async () => {
  const now = new Date();
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
    weekday: 'short', hour: '2-digit', hourCycle: 'h23'
  }).formatToParts(now).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  const weekday = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(parts.weekday);
  const today = `${parts.year}-${parts.month}-${parts.day}`;
  const tomorrowParts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'})
    .formatToParts(new Date(now.getTime() + 24 * 60 * 60 * 1000)).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
  const tomorrow = `${tomorrowParts.year}-${tomorrowParts.month}-${tomorrowParts.day}`;
  const hour = Number(parts.hour);
  const schedules = await firestore.collection('studySchedules').where('active', '==', true).limit(1000).get();
  for (const doc of schedules.docs) {
    const item = doc.data();
    if (!item.schoolId || item.hour !== hour) continue;
    if (item.weekday === weekday && !(item.testDate === tomorrow && item.testReminder !== false)) {
      await createNotice(`weekly:${doc.id}:${today}`, {
        schoolId:item.schoolId, classId:item.classId || '', type:'weekly',
        title:'今週の単語学習', body:`${item.startId}〜${item.endId}番を少しずつ進めましょう。`,
        startId:item.startId, endId:item.endId
      });
    }
    if (item.testDate === tomorrow && item.testReminder !== false) {
      await createNotice(`test-eve:${doc.id}:${tomorrow}`, {
        schoolId:item.schoolId, classId:item.classId || '', type:'test_eve',
        title:'明日は単語テストです', body:`${item.startId}〜${item.endId}番を確認しましょう。`,
        startId:item.startId, endId:item.endId
      });
    }
  }
});

async function deliverToTokens(noticeRef, data, scope) {
  const title = String(data.title || '').slice(0, 60);
  const body = String(data.body || '').slice(0, 180);
  if (!title || !body) {
    await noticeRef.set({status:'rejected',reason:'empty_notice',processedAt:stamp()},{merge:true});
    return;
  }
  const query = scope ? firestore.collection('pushTokens').where('schoolId','==',data.schoolId)
    : firestore.collection('pushTokens').where('active','==',true);
  let cursor, successCount = 0, failureCount = 0;
  do {
    let pageQuery = query.orderBy(admin.firestore.FieldPath.documentId()).limit(500);
    if (cursor) pageQuery = pageQuery.startAfter(cursor);
    const page = await pageQuery.get();
    if (page.empty) break;
    cursor = page.docs[page.docs.length - 1];
    const docs = page.docs.filter(doc => doc.get('active') === true && doc.get('installedOnly') === true &&
      (!scope || !data.classId || doc.get('classId') === data.classId) &&
      typeof doc.get('token') === 'string' && doc.get('token').length > 20);
    if (docs.length) {
      const response = await admin.messaging().sendEachForMulticast({
        tokens:docs.map(doc => doc.get('token')),
        data:{ title, body, type:String(data.type || 'admin_notice'), noticeId:noticeRef.id,
          schoolId:String(data.schoolId || ''), classId:String(data.classId || '') },
        webpush:{headers:{Urgency:'normal'}}
      });
      successCount += response.successCount;
      failureCount += response.failureCount;
      const batch = firestore.batch();
      response.responses.forEach((res,i) => {
        if (!res.success && ['messaging/registration-token-not-registered','messaging/invalid-registration-token'].includes(res.error?.code)) {
          batch.set(docs[i].ref,{active:false,disabledReason:res.error.code,updatedAt:stamp()},{merge:true});
        }
      });
      await batch.commit();
    }
    if (page.size < 500) break;
  } while (true);
  await noticeRef.set({status:'sent',successCount,failureCount,processedAt:stamp()},{merge:true});
}

exports.sendSchoolNotification = onDocumentCreated('schoolNotices/{noticeId}', async event => {
  const snap = event.data;
  if (!snap) return;
  const data = snap.data() || {};
  if (!data.schoolId) return;
  await deliverToTokens(snap.ref,data,true);
});

exports.sendInstalledAppNotification = onDocumentCreated('pushNotifications/{noticeId}', async event => {
  const snap = event.data;
  if (!snap) return;
  const data = snap.data() || {};
  if (data.createdByEmail !== ADMIN_EMAIL || data.target !== 'installed') {
    await snap.ref.set({status:'rejected',reason:'not_admin_or_invalid_target',processedAt:stamp()},{merge:true});
    return;
  }
  await deliverToTokens(snap.ref,data,false);
});
