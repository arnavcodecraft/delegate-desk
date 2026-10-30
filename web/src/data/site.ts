/**
 * Content for the About, Team and Services pages. Edit this file to change what those pages say.
 * Team: add one entry per person; the Team page shows a friendly empty state until someone is listed.
 */
/** Where the Android and desktop apps are published (GitHub Releases, built by .github/workflows/apps.yml). */
export const DOWNLOADS_URL = 'https://github.com/arnavcodecraft/delegate-desk/releases/latest';

export interface TeamMember { name: string; role: string; bio?: string; photo?: string; linkedin?: string }

export const TEAM: TeamMember[] = [
  // { name: 'Your Name', role: 'Founder', bio: 'One or two lines about you.', photo: '/team/you.jpg', linkedin: 'https://www.linkedin.com/in/you' },
];

export const SERVICE_DETAILS: Record<string, { tagline: string; points: string[]; ask: ('role' | 'when' | 'size' | 'conference' | 'city' | 'level')[] }> = {
  mentorship: {
    tagline: 'A mentor who has chaired and won works with you, live, on your next conference.',
    points: ['Country and agenda research plan', 'Position paper and speech review', 'Mock moderated caucus and POI practice', 'Strategy for lobbying and resolutions'],
    ask: ['conference', 'when', 'level'],
  },
  recorded: {
    tagline: 'Watch at your own pace: rules of procedure, speeches, research, documentation and crisis.',
    points: ['Short video lessons with notes', 'Built around the free MUN Masterclass', 'Practice tasks after every module', 'Certificate on completion'],
    ask: ['level'],
  },
  batch: {
    tagline: 'Small live classes for a group of delegates or a whole school MUN club.',
    points: ['Weekly live sessions with a trainer', 'Mock committees with marking', 'Schedules that fit school timetables', 'Progress reports for teachers'],
    ask: ['size', 'when', 'city', 'level'],
  },
  logistics: {
    tagline: 'Venue, accommodation, transport, kits and on-ground volunteers, planned with you.',
    points: ['Venue and room planning by committee size', 'Delegate kits, placards and badges', 'Accommodation and transport coordination', 'On-day volunteer and help-desk planning'],
    ask: ['conference', 'size', 'city', 'when'],
  },
  eb: {
    tagline: 'Experienced chairs and Executive Board members for your committees.',
    points: ['Chairs matched to committee and level', 'Background guides written or reviewed', 'Fair marking with DelegateDesk EB marking', 'Training for your own EB'],
    ask: ['conference', 'size', 'when', 'level'],
  },
  consultancy: {
    tagline: 'Practical help with registrations, GST, contracts, sponsorships and accounts for conferences.',
    points: ['Setting up as a society, trust or company', 'GST, invoicing and TDS on payouts', 'Sponsor, venue and vendor agreements', 'Refund policy, privacy and consent for minors'],
    ask: ['conference', 'city'],
  },
};
