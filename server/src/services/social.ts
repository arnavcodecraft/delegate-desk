/**
 * The social media dashboard: tracked links for each platform and campaign, what each one brought in
 * (page visits, applications, paid delegates), a post planner, and captions written from the conference's details.
 */
import { all, one, run, insert } from '../db.ts';
import { eventSettings, getEvent } from '../settings.ts';
import { bad, notFound, now, uid, istDate } from '../util.ts';
import { publicLink, registrationLink } from './conference.ts';

export const PLATFORMS: Record<string, string> = { instagram: 'Instagram', whatsapp: 'WhatsApp', linkedin: 'LinkedIn', facebook: 'Facebook', x: 'X', youtube: 'YouTube', email: 'Email', school: 'Schools' };
const withSrc = (url: string, src: string) => `${url}${url.includes('?') ? '&' : '?'}src=${encodeURIComponent(src)}`;
const date = (d?: string | null) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : 'dates to be announced');

export function socialOverview(eventId: string) {
  const ev = getEvent(eventId);
  const s = eventSettings(eventId);
  const page = publicLink(ev.code), register = registrationLink(ev.code);
  const visits = all('SELECT channel, SUM(n) AS n FROM page_view WHERE event_id = ? GROUP BY channel', eventId);
  const regs = all(`SELECT COALESCE(channel, 'direct') AS channel, COUNT(*) AS applied, SUM(payment_status = 'paid') AS paid FROM registration WHERE event_id = ? AND cancelled_at IS NULL GROUP BY 1`, eventId);
  const since = new Date(Date.now() - 13 * 86400_000).toISOString().slice(0, 10);
  const daily = all('SELECT day, channel, SUM(n) AS n FROM page_view WHERE event_id = ? AND day >= ? GROUP BY day, channel ORDER BY day', eventId, since);
  const campaigns = [...new Set([...visits, ...regs].map((r) => r.channel).filter((c) => String(c).startsWith('c-')))];
  const keys = [...Object.keys(PLATFORMS), ...campaigns, 'explore', 'google', 'direct', 'other'];
  const rows = keys.map((k) => {
    const v = visits.find((x) => x.channel === k)?.n ?? 0, r = regs.find((x) => x.channel === k);
    return { channel: k, label: PLATFORMS[k] ?? (k.startsWith('c-') ? `Campaign: ${k.slice(2)}` : k[0].toUpperCase() + k.slice(1)), tracked: !!PLATFORMS[k] || k.startsWith('c-'),
      pageLink: PLATFORMS[k] || k.startsWith('c-') ? withSrc(page, k) : null, registerLink: PLATFORMS[k] || k.startsWith('c-') ? withSrc(register, k) : null,
      visits: v, applied: r?.applied ?? 0, paid: r?.paid ?? 0, conversion: v ? Math.round(((r?.applied ?? 0) / v) * 1000) / 10 : null };
  });
  const days = [...Array(14)].map((_, i) => new Date(Date.now() - (13 - i) * 86400_000).toISOString().slice(0, 10));
  const series = days.map((d) => ({ day: d, visits: daily.filter((x) => x.day === d).reduce((t, x) => t + x.n, 0) }));
  return {
    rows, series, socials: s.profile.socials, page, register,
    posts: all('SELECT * FROM social_post WHERE event_id = ? ORDER BY COALESCE(scheduled_for, created_at)', eventId),
    captions: captions(eventId), platforms: PLATFORMS, today: istDate(),
  };
}

/** Ready-to-post captions built from the conference's own details. */
export function captions(eventId: string) {
  const ev = getEvent(eventId);
  const s = eventSettings(eventId);
  const name = s.profile.acronym && s.profile.acronym !== ev.name ? `${ev.name} (${s.profile.acronym})` : ev.name;
  const committees = all('SELECT short FROM committee WHERE event_id = ? ORDER BY sort, name', eventId).map((c) => c.short);
  const fee = one('SELECT MIN(amount_paise) AS m FROM fee_tier WHERE event_id = ? AND active = 1 AND amount_paise > 0', eventId)?.m;
  const when = ev.start_date ? date(ev.start_date) : 'dates to be announced';
  const where = [ev.venue, ev.city].filter(Boolean).join(', ');
  const link = publicLink(ev.code);
  const tag = `#${(s.profile.acronym || ev.code).replace(/[^A-Za-z0-9]/g, '')} #ModelUN #MUN`;
  return [
    { key: 'open', title: 'Registrations open', text: `Registrations are open for ${name}!\n\n${when}${where ? ` · ${where}` : ''}\nCommittees: ${committees.join(', ') || 'to be announced'}${s.free ? '\nFree to attend.' : fee ? `\nFrom ₹${Math.round(fee / 100).toLocaleString('en-IN')}.` : ''}\n\nRegister in a minute: ${link}\n\n${tag}` },
    { key: 'committees', title: 'Committee reveal', text: `Meet the committees of ${name}:\n\n${committees.map((c) => `• ${c}`).join('\n') || '• to be announced'}\n\nPick up to three when you register and tell us the portfolio you want: ${link}\n\n${tag}` },
    { key: 'early', title: 'Early bird ending', text: `Last few days of early-bird registration for ${name}. Seats are allotted first come, first served, so register early to get your preferred committee and portfolio.\n\n${link}\n\n${tag}` },
    { key: 'eb', title: 'Executive Board reveal', text: `Introducing the Executive Board of ${name}. Experienced chairs, fair marking, and feedback for every delegate.\n\nSee the committees and register: ${link}\n\n${tag}` },
    { key: 'countdown', title: 'Countdown', text: `${ev.start_date ? `${Math.max(0, Math.ceil((new Date(ev.start_date).getTime() - Date.now()) / 86400_000))} days to go` : 'Coming soon'}: ${name}.\n\nResearch your portfolio, write your position paper, and get ready for committee. Free prep tools on DelegateDesk.\n\n${link}\n\n${tag}` },
    { key: 'thanks', title: 'Thank you', text: `Thank you to every delegate, chair and volunteer who made ${name} happen. Certificates and awards are on your delegate page.\n\nSee you next year!\n\n${tag}` },
  ];
}

const clean = (v: unknown, n: number) => String(v ?? '').trim().slice(0, n);
function postInput(b: Record<string, any>) {
  const platform = PLATFORMS[String(b.platform)] ? String(b.platform) : null;
  if (!platform) throw bad('Choose a platform');
  const caption = clean(b.caption, 2200);
  if (!caption) throw bad('Write the caption');
  const status = ['draft', 'scheduled', 'posted'].includes(String(b.status)) ? String(b.status) : 'draft';
  const when = clean(b.scheduled_for, 25) || null;
  if (when && Number.isNaN(new Date(when).getTime())) throw bad('Pick a valid date');
  const link = clean(b.link, 400) || null;
  if (link && !/^https?:\/\//i.test(link)) throw bad('Links start with https://');
  return { platform, caption, status, scheduled_for: when, link, campaign: clean(b.campaign, 40) || null };
}
export function addPost(eventId: string, b: Record<string, any>) {
  const id = uid();
  insert('social_post', { id, event_id: eventId, ...postInput(b), created_at: now(), updated_at: now() });
  return { id };
}
export function updatePost(eventId: string, id: string, b: Record<string, any>) {
  if (!one('SELECT 1 FROM social_post WHERE id = ? AND event_id = ?', id, eventId)) throw notFound('Post');
  const p = postInput(b);
  run('UPDATE social_post SET platform = ?, caption = ?, status = ?, scheduled_for = ?, link = ?, campaign = ?, updated_at = ? WHERE id = ?', p.platform, p.caption, p.status, p.scheduled_for, p.link, p.campaign, now(), id);
}
export function removePost(eventId: string, id: string) { run('DELETE FROM social_post WHERE id = ? AND event_id = ?', id, eventId); }

/** A campaign tag for links, e.g. "Early bird" → c-early-bird. */
export function campaignTag(name: string) {
  const slug = String(name ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  if (!slug) throw bad('Name the campaign');
  return `c-${slug}`;
}
