import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import '@fontsource-variable/inter';
import 'flag-icons/css/flag-icons.min.css';
import './styles.css';
import './platform.css';
import { applyTheme, savedTheme } from './ui';
import { ToastHost } from './ui';
import Register from './pages/Register';
import Portal, { SandboxPay, Consent, Privacy } from './pages/Portal';
import { DelegationRegister, DelegationPortal, ReferrerStatement, SharedList } from './pages/Other';
import { StaffGate, Login, Account, Home } from './staff/Shell';
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
import { StartSession, SessionView, ChairConsole } from './platform/Live';
import { Overview, ConferenceSettings, Financials, Applications, JobBoard, Documents, Sessions } from './staff/Organiser';

applyTheme(savedTheme());

const staff = (el: React.ReactNode) => <StaffGate>{el}</StaffGate>;

function App() {
  return (
    <Routes>
      <Route path="/" element={<Explore home />} />
      <Route path="/explore" element={<Explore />} />
      <Route path="/c/:slug" element={<ConferencePage />} />
      <Route path="/jobs" element={<Jobs />} />
      <Route path="/list" element={<ListConference />} />
      <Route path="/application/:token" element={<ApplicationStatus />} />
      <Route path="/session" element={<StartSession />} />
      <Route path="/session/:code" element={<SessionView />} />
      <Route path="/session/:code/chair" element={<ChairConsole />} />
      <Route path="/register/:code" element={<Register />} />
      <Route path="/register/:code/delegation" element={<DelegationRegister />} />
      <Route path="/r/:token" element={<Portal />} />
      <Route path="/pay/sandbox/:orderId" element={<SandboxPay />} />
      <Route path="/consent/:token" element={<Consent />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/delegation/:token" element={<DelegationPortal />} />
      <Route path="/referrer/:token" element={<ReferrerStatement />} />
      <Route path="/share/:token" element={<SharedList />} />
      <Route path="/login" element={<Login />} />
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
      <Route path="/app/sessions" element={staff(<Sessions />)} />
      <Route path="*" element={<div className="empty"><h1>Page not found</h1><a href="/login">Go to sign-in</a></div>} />
    </Routes>
  );
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode><BrowserRouter><ToastHost><App /></ToastHost></BrowserRouter></React.StrictMode>,
);
