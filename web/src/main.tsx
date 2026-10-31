import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import '@fontsource-variable/inter';
import '@fontsource-variable/plus-jakarta-sans';
import 'flag-icons/css/flag-icons.min.css';
import './styles.css';
import './platform.css';
import './room.css';
import './site.css';
import './premium.css';
import { applyTheme, savedTheme } from './ui';
import { ToastHost } from './ui';
import Register from './pages/Register';
import Portal, { SandboxPay, Consent, Privacy } from './pages/Portal';
import { DelegationRegister, DelegationPortal, ReferrerStatement, SharedList } from './pages/Other';
import { StaffGate, Account, Home } from './staff/Shell';
import Dashboard from './staff/Dashboard';
import { Registrations, RegistrationDetail, Lists } from './staff/Registrations';
import Allocation from './staff/Allocation';
import { ProofReview, Payments } from './staff/Payments';
import Referrals from './staff/Referrals';
import Expenses from './staff/Expenses';
import Books from './staff/Books';
import { Imports, Messages, Audit } from './staff/Misc';
import Settings from './staff/Settings';
import CheckIn from './staff/CheckIn';
import ListConference from './platform/ListConference';
import { Explore, ConferencePage, Jobs, ApplicationStatus } from './platform/Explore';
import { StartSession } from './platform/Live';
import { ChairRoom, DelegateRoom } from './platform/Room';
import { Home as SiteHome } from './platform/Home';
import { AccountPage, SetPasswordPage, SignInPage } from './platform/Account';
import { DelegateChat } from './chat/DelegateChat';
import { CvPage } from './platform/Cv';
import { AboutPage, ContactPage, ServicesPage, TeamPage } from './platform/Site';
import { PlatformInbox } from './staff/Inbox';
import { registerServiceWorker } from './install';
import { installNativeFetch } from './native';
import { AppSettingsPage } from './platform/AppSettings';
import { VideosPage } from './prep/Videos';
import { SiteGate } from './site';
import { OwnerConsole } from './staff/Owner';
import { TeamspacePage } from './staff/Teamspace';
import { AppDownloadPage } from './platform/Site';
import { SocialDashboard } from './staff/Social';
import { ChatAdmin } from './staff/Chat';
import { SetupPage } from './platform/Setup';
import { PrepHome, ResearchHome, ProjectPage, ItemPage } from './prep/Research';
import { WritePage, CoachPage } from './prep/Write';
import { PracticePage, LearnHome, LessonPage, ExamPage, CertificatePage, DiscoverPage } from './prep/Learn';
import { CountriesPage } from './prep/Countries';
import { ToolsHome, ToolPage } from './prep/Tools';
import { Overview, ConferenceSettings, Financials, Applications, JobBoard, Documents, Sessions } from './staff/Organiser';

applyTheme(savedTheme());

const staff = (el: React.ReactNode) => <StaffGate>{el}</StaffGate>;

function App() {
  return (
    <Routes>
      <Route path="/" element={<SiteHome />} />
      <Route path="/explore" element={<Explore />} />
      <Route path="/c/:slug" element={<ConferencePage />} />
      <Route path="/jobs" element={<Jobs />} />
      <Route path="/list" element={<ListConference />} />
      <Route path="/application/:token" element={<ApplicationStatus />} />
      <Route path="/session" element={<StartSession />} />
      <Route path="/session/:code" element={<DelegateRoom />} />
      <Route path="/session/:code/chair" element={<ChairRoom />} />
      <Route path="/register/:code" element={<Register />} />
      <Route path="/register/:code/delegation" element={<DelegationRegister />} />
      <Route path="/r/:token" element={<Portal />} />
      <Route path="/r/:token/chat" element={<DelegateChat />} />
      <Route path="/pay/sandbox/:orderId" element={<SandboxPay />} />
      <Route path="/consent/:token" element={<Consent />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/about" element={<AboutPage />} />
      <Route path="/team" element={<TeamPage />} />
      <Route path="/contact" element={<ContactPage />} />
      <Route path="/services" element={<ServicesPage />} />
      <Route path="/get-the-app" element={<AppDownloadPage />} />
      <Route path="/download" element={<AppDownloadPage />} />
      <Route path="/app-settings" element={<AppSettingsPage />} />
      <Route path="/delegation/:token" element={<DelegationPortal />} />
      <Route path="/referrer/:token" element={<ReferrerStatement />} />
      <Route path="/share/:token" element={<SharedList />} />
      <Route path="/login" element={<SignInPage />} />
      <Route path="/signin" element={<SignInPage />} />
      <Route path="/signup" element={<Navigate to="/login?mode=signup" replace />} />
      <Route path="/account" element={<AccountPage />} />
      <Route path="/account/cv" element={<CvPage />} />
      <Route path="/setup" element={<SetupPage />} />
      <Route path="/prep" element={<PrepHome />} />
      <Route path="/prep/research" element={<ResearchHome />} />
      <Route path="/prep/projects/:id" element={<ProjectPage />} />
      <Route path="/prep/items/:id" element={<ItemPage />} />
      <Route path="/prep/write" element={<WritePage />} />
      <Route path="/prep/coach" element={<CoachPage />} />
      <Route path="/prep/practice" element={<PracticePage />} />
      <Route path="/prep/learn" element={<LearnHome />} />
      <Route path="/prep/videos" element={<VideosPage />} />
      <Route path="/prep/learn/exam" element={<ExamPage />} />
      <Route path="/prep/learn/certificate" element={<CertificatePage />} />
      <Route path="/prep/learn/:id" element={<LessonPage />} />
      <Route path="/prep/discover" element={<DiscoverPage />} />
      <Route path="/prep/countries" element={<CountriesPage />} />
      <Route path="/prep/tools" element={<ToolsHome />} />
      <Route path="/prep/tools/:tool" element={<ToolPage />} />
      <Route path="/invite/:token" element={<SetPasswordPage kind="invite" />} />
      <Route path="/reset/:token" element={<SetPasswordPage kind="reset" />} />
      <Route path="/app" element={staff(<Home />)} />
      <Route path="/app/account" element={staff(<Account />)} />
      <Route path="/app/dashboard" element={staff(<Dashboard />)} />
      <Route path="/app/registrations" element={staff(<Registrations />)} />
      <Route path="/app/registrations/:id" element={staff(<RegistrationDetail />)} />
      <Route path="/app/lists" element={staff(<Lists />)} />
      <Route path="/app/allocation" element={staff(<Allocation />)} />
      <Route path="/app/payments/review" element={staff(<ProofReview />)} />
      <Route path="/app/payments/*" element={staff(<Payments />)} />
      <Route path="/app/referrals/*" element={staff(<Referrals />)} />
      <Route path="/app/expenses/*" element={staff(<Expenses />)} />
      <Route path="/app/books" element={staff(<Books />)} />
      <Route path="/app/imports" element={staff(<Imports />)} />
      <Route path="/app/messages" element={staff(<Messages />)} />
      <Route path="/app/settings" element={staff(<Settings />)} />
      <Route path="/app/audit" element={staff(<Audit />)} />
      <Route path="/app/checkin" element={staff(<CheckIn />)} />
      <Route path="/app/overview" element={staff(<Overview />)} />
      <Route path="/app/conference" element={staff(<ConferenceSettings />)} />
      <Route path="/app/financials" element={staff(<Financials />)} />
      <Route path="/app/applications" element={staff(<Applications />)} />
      <Route path="/app/jobs" element={staff(<JobBoard />)} />
      <Route path="/app/documents" element={staff(<Documents />)} />
      <Route path="/app/chat" element={staff(<ChatAdmin />)} />
      <Route path="/app/inbox" element={staff(<PlatformInbox />)} />
      <Route path="/app/social" element={staff(<SocialDashboard />)} />
      <Route path="/app/sessions" element={staff(<Sessions />)} />
      <Route path="/app/owner" element={staff(<OwnerConsole />)} />
      <Route path="/app/teamspace" element={staff(<TeamspacePage />)} />
      <Route path="*" element={<div className="empty"><h1>Page not found</h1><a href="/login">Go to sign-in</a></div>} />
    </Routes>
  );
}

installNativeFetch();
registerServiceWorker();
createRoot(document.getElementById('root')!).render(
  <React.StrictMode><BrowserRouter><ToastHost><SiteGate><App /></SiteGate></ToastHost></BrowserRouter></React.StrictMode>,
);

// The loading screen (in index.html) stays for at least 1.6 seconds on every load, then fades once the app has drawn.
const MIN_LOADER_MS = 1600;
requestAnimationFrame(() => requestAnimationFrame(() => {
  const el = document.getElementById('dd-preload');
  if (!el) return;
  const started = (window as any).__ddLoadStart ?? Date.now();
  setTimeout(() => { el.classList.add('done'); setTimeout(() => el.remove(), 600); }, Math.max(0, MIN_LOADER_MS - (Date.now() - started)));
}));
