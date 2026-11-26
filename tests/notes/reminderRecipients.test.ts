import test from 'node:test';import assert from 'node:assert/strict';
import {matchingReminderUsers} from '../../src/components/Notes/reminderRecipients';
import {reminderServiceError} from '../../src/components/Notes/reminderDeliveryStatusModel';
const users=[{user_id:'1',full_name:'علي كريمي'},{user_id:'2',full_name:'محمد\u200cرضا محمدی'},{user_id:'3',full_name:null}];
test('recipient search handles Persian/Arabic characters, diacritics, spacing and multiple terms',()=>{
 assert.equal(matchingReminderUsers(users,[],'علی کریمی')[0].user_id,'1');
 assert.equal(matchingReminderUsers(users,[],'  محمد رضا  ')[0].user_id,'2');
 assert.equal(matchingReminderUsers(users,[],'كَرِيمي علي')[0].user_id,'1');
 assert.equal(matchingReminderUsers(users,['1'],'علی').length,0);
 assert.equal(matchingReminderUsers(users,[],'نام ناموجود').length,0);
});
test('worker readiness failures have distinct useful messages without exposing arbitrary error strings',()=>{
 assert.match(reminderServiceError('WORKER_HTTP_404'),/پیدا نشد/);
 assert.match(reminderServiceError('WORKER_NOT_CONFIGURED'),/تنظیم نشده/);
 assert.equal(reminderServiceError('SECRET'),reminderServiceError(null));
});
