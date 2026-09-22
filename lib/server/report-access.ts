import { randomUUID } from 'node:crypto';
import { db, transaction } from './db.ts';
import { config } from './config.ts';
import { enqueueMail } from './mail.ts';
import type { Row, User } from './model.ts';

export function recordReportAccess(user: User, slug: string, report: { title?: unknown }, action: 'view' | 'download', reportPath = `/reports/${slug}`) {
  transaction(() => {
    const now = Date.now(); const timestamp = new Date(now).toISOString();
    const previous = db().prepare('SELECT last_notified_at FROM report_access WHERE user_id=? AND report_slug=? AND action=?').get(user.id, slug, action) as Row | undefined;
    const notify = !previous || previous.last_notified_at <= now - 86_400_000;
    if (previous) {
      db().prepare('UPDATE report_access SET access_count=access_count+1,last_access_at=?,last_notified_at=CASE WHEN ? THEN ? ELSE last_notified_at END,notification_count=notification_count+? WHERE user_id=? AND report_slug=? AND action=?').run(timestamp, notify ? 1 : 0, now, notify ? 1 : 0, user.id, slug, action);
    } else {
      db().prepare('INSERT INTO report_access (user_id,report_slug,action,access_count,first_access_at,last_access_at,last_notified_at,notification_count) VALUES (?,?,?,1,?,?,?,1)').run(user.id, slug, action, timestamp, timestamp, now);
    }
    if (notify) {
      const title = String(report.title).replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 240);
      const event = action === 'view' ? 'viewed' : 'downloaded';
      enqueueMail(`report-access:${user.id}:${slug}:${action}:${randomUUID()}`, config().adminEmail, `${title} | ${user.email}`, `A verified reader ${event} a detailed report.\n\nReport: ${title}\nViewer: ${user.name ? `${user.name} <${user.email}>` : user.email}\nAction: ${event}\nTime: ${timestamp}\n\n${config().appUrl}${reportPath}\n\nRepeated ${action === 'view' ? 'views' : 'downloads'} by this reader for this report are counted privately, with at most one notification per action in 24 hours. This is a transactional access notification, not marketing consent.`);
    }
  });
}
