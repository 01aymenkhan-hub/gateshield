# GateShield — Complete Project File Structure & Developer Documentation

This guide maps every dashboard, screen, feature, component, translation key, API route, backend file, and database model in the **GateShield** codebase so you can locate and edit UI text, labels, headings, descriptions, icons, and theme settings independently without affecting business logic or stored records.

---

## Safety Legend (Har File Ke Saath Safety Indicator)

Throughout this guide, every file is marked with one of three safety levels:

- **`[Safe to edit: Text/labels only]`** — Safe to change English/Urdu strings, headings, descriptions, or static labels inside this file without breaking other screens or backend logic.
- **`[Careful: Shared component — multiple screens affect ho sakti hain]`** — Used across multiple dashboards, modals, or portals. Editing UI text or classes here updates every screen that renders this component.
- **`[Developer only: Backend, authentication, database ya business logic]`** — Controls APIs, database queries, authentication tokens, OCR pipelines, or file storage. Do not edit for simple UI text changes.

---

## 1. Quick Navigation Index (Frequently Edited Content)

| I Want to Change | Open This File | Exact Location / Key | Safety Level |
|---|---|---|---|
| **Admin dashboard heading** (`"Gate Control Dashboard"`) | `src/context/LanguageContext.tsx` & `src/app/dashboard/page.tsx` | Key `gate_control_dashboard` (line 29 in `LanguageContext.tsx`), rendered at line 263 in `src/app/dashboard/page.tsx` | `[Safe to edit: Text/labels only]` |
| **Admin dashboard subtitle** | `src/context/LanguageContext.tsx` & `src/app/dashboard/page.tsx` | Key `gate_control_subtitle` (lines 30–33 in `LanguageContext.tsx`), rendered at line 266 in `src/app/dashboard/page.tsx` | `[Safe to edit: Text/labels only]` |
| **Operator dashboard heading** (`"Gate Control Dashboard"` / `"گیٹ کنٹرول ڈیش بورڈ"`) | `src/context/LanguageContext.tsx` & `src/app/dashboard/page.tsx` | Key `gate_control_dashboard` (line 29 in `LanguageContext.tsx`), rendered at line 731 in `src/app/dashboard/page.tsx` | `[Safe to edit: Text/labels only]` |
| **Operator dashboard top 6 action button titles & descriptions** (`Register`, `Visitor Check Out`, `Check Visitor Status`, `Guest`, `Parcel Tracker`, `VIP Guest`) | `src/context/LanguageContext.tsx` & `src/app/dashboard/page.tsx` | Keys `register_visitor`, `checkout_visitor`, `check_status`, `guest_option_title`, `parcel_tracker_title`, `vip_guest_title` (lines 36–50 in `LanguageContext.tsx`), rendered at lines 764–917 in `src/app/dashboard/page.tsx` | `[Safe to edit: Text/labels only]` |
| **Operator dashboard KPI card labels** (`Total Visitors`, `Currently Inside`, `Total Checkouts`, `Overstay Alerts`, `Total Vendors`, `Total Interviews`, `Total Guests`, `Total Deliveries`) | `src/app/dashboard/page.tsx` & `src/context/LanguageContext.tsx` | Rendered directly at lines 920–1160 in `src/app/dashboard/page.tsx` (inline `language === 'ur' ? '...' : '...'`) and lines 61–76 in `LanguageContext.tsx` | `[Safe to edit: Text/labels only]` |
| **Visitor category names** (`Visitor`, `Vendor`, `Interview`, `Guest`, `Parcel`, `Contractor`, `Delivery`) | `src/context/LanguageContext.tsx` & `src/components/VisitInfoStep.tsx` | Keys `cat_visitor`, `cat_vendor`, `cat_interview`, `cat_special_guest`, `cat_parcel`, `cat_contractor`, `cat_delivery` (lines 201–207 in `LanguageContext.tsx`), category cards defined in `CATEGORY_CARDS` at lines 36–89 of `src/components/VisitInfoStep.tsx` | `[Careful: Shared component — multiple screens affect ho sakti hain]` |
| **VIP Guest button label** (`"Invite VIP Guest"` on Admin banner / `"VIP Guest"` on Operator tile / `"Add VIP Guest"` inside VIP view) | `src/context/LanguageContext.tsx` & `src/components/vip/VipGuestManagementView.tsx` | Keys `admin_qa_invite_vip` (line 999), `vip_guest_title` (line 48), `add_vip_guest_btn` (line 768) in `LanguageContext.tsx` | `[Safe to edit: Text/labels only]` |
| **Operator / Admin sidebar menu items** (`Dashboard`, `Visitors & Logs`, `Vendors`, `Parcel Tracker`, `Received Parcels`, etc.) | `src/components/layout/Sidebar.tsx` & `src/context/LanguageContext.tsx` | `NAV_ITEMS` (lines 44–59) and `PARCEL_NAV_ITEMS` (lines 61–66) in `src/components/layout/Sidebar.tsx`; translations in `LanguageContext.tsx` (lines 690–704) | `[Careful: Shared component — multiple screens affect ho sakti hain]` |
| **English translation (any UI string using `t('key')`)** | `src/context/LanguageContext.tsx` | `TRANSLATIONS[key].en` (lines 14–1034) | `[Safe to edit: Text/labels only]` |
| **Urdu translation (any UI string using `t('key')`)** | `src/context/LanguageContext.tsx` | `TRANSLATIONS[key].ur` (lines 14–1034) | `[Safe to edit: Text/labels only]` |
| **Global primary brand color (`#354F96`)** | `src/app/globals.css` | `:root` CSS variables `--brand-primary` through `--brand-primary-950` (lines 46–59) | `[Careful: Shared component — multiple screens affect ho sakti hain]` |
| **Urdu font family (`Jameel Noori Nastaleeq Regular`) & base scale** | `src/app/globals.css` & `public/fonts/JameelNooriNastaleeq-Regular.woff2` | `@font-face` (`size-adjust: 108%` at lines 5–29) and `--font-ur` (line 33) in `src/app/globals.css` | `[Careful: Shared component — multiple screens affect ho sakti hain]` |
| **Urdu label font sizes (+2–3px on Operator labels)** | `src/app/dashboard/page.tsx`, `src/components/VisitInfoStep.tsx`, `src/components/VisitorStep.tsx`, `src/components/modals/CheckInModal.tsx` | Conditional `language === 'ur'` / `isUr` classes on label elements (e.g. `text-[17px] sm:text-[18px] leading-[1.6]`) | `[Safe to edit: Text/labels only]` |
| **Operator dashboard SVG icons (Top 6 & Bottom 8)** | `public/icons/operator/` & `src/components/icons/OperatorDashboardSvgIcons.tsx` | Static SVG files in `public/icons/operator/Top 6 Main Icons/` & `Bottom 8 Icons/`; React SVG components in `src/components/icons/OperatorDashboardSvgIcons.tsx` | `[Careful: Shared component — multiple screens affect ho sakti hain]` |
| **Admin login page** (`/admin`) | `src/app/admin/page.tsx` | Lines 1–205 | `[Safe to edit: Text/labels only]` |
| **Operator login page** (`/login` — QR & Email login) | `src/app/login/page.tsx` | Lines 1–520 | `[Safe to edit: Text/labels only]` |
| **Employee portal page** (`/employee` — Login, Registration, Guest Invite, Parcel Reminder) | `src/app/employee/page.tsx` | Lines 1–2762 | `[Safe to edit: Text/labels only]` |

---

## 2. Complete Project Folder & File Structure

### 2.1 Root & Configuration Files

| File Path | Purpose | Used By | Safety Level |
|---|---|---|---|
| `package.json` | Node.js dependencies, Next.js scripts (`dev`, `build`, `start`) | Entire frontend & Next.js server | `[Developer only: Backend, authentication, database ya business logic]` |
| `tsconfig.json` | TypeScript compiler configuration and `@/*` path alias (`./src/*`) | TypeScript & Next.js build | `[Developer only: Backend, authentication, database ya business logic]` |
| `next.config.ts` | Next.js framework configuration | Next.js server & build | `[Developer only: Backend, authentication, database ya business logic]` |
| `prisma/schema.prisma` | Complete PostgreSQL database schema, enums, models, and indexes | Prisma ORM & all `/api/*` routes | `[Developer only: Backend, authentication, database ya business logic]` |
| `prisma/seed.js` | Database seeder for initial Admin/Operator accounts and default gates | CLI setup (`node prisma/seed.js`) | `[Developer only: Backend, authentication, database ya business logic]` |

---

### 2.2 Global App Shell, Styles & Context Providers (`src/app/` & `src/context/`)

| File Path | Purpose | Used By | Safety Level |
|---|---|---|---|
| `src/app/layout.tsx` | Root HTML shell, font preloading (`JameelNooriNastaleeq-Regular.woff2`), theme/language hydration script, and context providers | Every page in the application | `[Careful: Shared component — multiple screens affect ho sakti hain]` |
| `src/app/globals.css` | Global CSS, Tailwind v4 `@theme` tokens, `#354F96` brand palette, Light/Dark mode variables, `@font-face` for Urdu, custom scrollbars (`.sidebar-scroll`), print styles, and animations | Every page and component | `[Careful: Shared component — multiple screens affect ho sakti hain]` |
| `src/app/page.tsx` | Root entry point (`/`) — redirects users based on authentication state | Browser root URL `/` | `[Developer only: Backend, authentication, database ya business logic]` |
| `src/context/LanguageContext.tsx` | Central bilingual dictionary (`TRANSLATIONS`) with English (`en`) and Urdu (`ur`) strings, `t(key, fallback)` helper, and `toggleLanguage` | All translated pages, modals, headers, sidebars, and forms | `[Safe to edit: Text/labels only]` (inside `TRANSLATIONS` object, lines 14–1034) |
| `src/context/AuthContext.tsx` | Manages logged-in `user` (`ADMIN` or `OPERATOR`), active `currentGate`, `gates` list, `theme` (`light`/`dark`), `login`, and `logout` | All Admin and Operator screens | `[Developer only: Backend, authentication, database ya business logic]` |
| `src/context/LayoutContext.tsx` | Manages sidebar collapse/mobile drawer states (`isMobileSidebarOpen`, `isDesktopCollapsed`) and live pending request badge counts (`pendingEmployeeCount`, `pendingOperatorCount`) | `Sidebar.tsx`, `Header.tsx`, `dashboard/page.tsx` | `[Developer only: Backend, authentication, database ya business logic]` |

---

### 2.3 Application Pages (`src/app/*/page.tsx`)

| File Path | URL Route | What the File Does | Dashboard / Portal | Safety Level |
|---|---|---|---|---|
| `src/app/admin/page.tsx` | `/admin` | Dedicated Administrator email/password login screen with forgot-password recovery trigger | Admin Portal Login | `[Safe to edit: Text/labels only]` |
| `src/app/login/page.tsx` | `/login` | Operator login screen supporting QR Card camera login, Email/Password login, Operator self-registration request form, and live approval status screen | Operator Checkpoint Login | `[Safe to edit: Text/labels only]` |
| `src/app/signup/page.tsx` | `/signup` | Standalone account signup/registration page | Auth / Registration | `[Safe to edit: Text/labels only]` |
| `src/app/reset-password/page.tsx` | `/reset-password` | Password reset completion screen after Admin approves a password recovery request | Admin, Operator, Employee | `[Safe to edit: Text/labels only]` |
| `src/app/dashboard/page.tsx` | `/dashboard` | Main dashboard page containing **both** the Admin Dashboard (`isAdmin === true`, lines 234–639) and the Operator Dashboard (`isAdmin === false`, lines 640–1395), plus dashboard modals (lines 1396–1545) | Admin Dashboard & Operator Dashboard | `[Safe to edit: Text/labels only]` |
| `src/app/visitors/page.tsx` | `/visitors` | Displays all registered visitors across all categories using `VisitorCategoryView` (`category="ALL"`) | Admin & Operator Sidebar | `[Safe to edit: Text/labels only]` |
| `src/app/vendors/page.tsx` | `/vendors` | Displays Vendor records using `VisitorCategoryView` (`category="VENDOR"`) | Admin & Operator Sidebar | `[Safe to edit: Text/labels only]` |
| `src/app/interviews/page.tsx` | `/interviews` | Displays Interview candidate records using `VisitorCategoryView` (`category="INTERVIEW"`) | Admin & Operator Sidebar | `[Safe to edit: Text/labels only]` |
| `src/app/special-guests/page.tsx` | `/special-guests` | Displays Guest (`SPECIAL_GUEST`) records and Upcoming Invited Guests tab using `VisitorCategoryView` | Admin & Operator Sidebar | `[Safe to edit: Text/labels only]` |
| `src/app/vip-guests/page.tsx` | `/vip-guests` | Displays VIP Guest list, search/filters, check-in/out actions, and Admin VIP creation modal via `VipGuestManagementView` | Admin & Operator Sidebar | `[Safe to edit: Text/labels only]` |
| `src/app/contractors/page.tsx` | `/contractors` | Displays Contractor records using `VisitorCategoryView` (`category="CONTRACTOR"`) | Admin & Operator Sidebar | `[Safe to edit: Text/labels only]` |
| `src/app/deliveries/page.tsx` | `/deliveries` | Displays Delivery records using `VisitorCategoryView` (`category="DELIVERY"`) | Admin & Operator Sidebar | `[Safe to edit: Text/labels only]` |
| `src/app/person/[id]/page.tsx` | `/person/[id]` | Full profile and visit history page for an individual visitor/person, including CNIC/DLS images, delivery documents (for `DELIVERY` only), blacklist toggle, and VIP toggle | Admin & Operator (via Visitor tables & search) | `[Safe to edit: Text/labels only]` |
| `src/app/departments/page.tsx` | `/departments` | Admin-only Department Management screen (create/edit/toggle departments, HOD name, WhatsApp number) | Admin Dashboard Sidebar | `[Safe to edit: Text/labels only]` |
| `src/app/employees/page.tsx` | `/employees` | Admin-only Employee Management screen with two tabs: `Employee Requests` (Registration + Password Reset approvals) and `Approved Employees` list + Add Employee modal | Admin Dashboard Sidebar & Top Banner | `[Safe to edit: Text/labels only]` |
| `src/app/access/page.tsx` | `/access` | Admin-only Operator & Access Management screen with two tabs: `Operators & Admins` (create/edit operators, assign gates, view/print Operator QR Card) and `Operator Requests` (Registration + Password Reset approvals) | Admin Dashboard Sidebar & Top Banner | `[Safe to edit: Text/labels only]` |
| `src/app/reports/page.tsx` | `/reports` | Admin-only Reports & Analytics screen with date filters, category/gate breakdowns, and CSV export | Admin Dashboard Sidebar | `[Safe to edit: Text/labels only]` |
| `src/app/audit-logs/page.tsx` | `/audit-logs` | Admin-only security Audit Logs viewer with action/entity filters and search | Admin Dashboard Sidebar | `[Safe to edit: Text/labels only]` |
| `src/app/settings/page.tsx` | `/settings` | Admin-only System Settings & Gate Management screen (badge prefix, auto-checkout hours, company name, add/view gates, and Admin password reset section) | Admin Dashboard Sidebar | `[Safe to edit: Text/labels only]` |
| `src/app/parcels/page.tsx` | `/parcels` | Parcel Management page (`?tab=expected`, `?tab=received`, `?tab=delivered`, `?tab=history`) rendering `ParcelManagementView` | Admin & Operator Sidebar | `[Safe to edit: Text/labels only]` |
| `src/app/employee/page.tsx` | `/employee` | Complete standalone Employee Portal (Employee Sign In, First-Time Registration, Forgot Password, Approval Waiting Screen, Guest Invitations, Visited Guests History, Re-Invite Modal, Add Parcel Reminder, Arrived Parcels, and Employee Notifications) | Employee Portal | `[Safe to edit: Text/labels only]` |

---

### 2.4 Shared Layout, Form, Modal, Scanner & UI Components (`src/components/`)

| File Path | What the Component Does | Screens Affected When Edited | Safety Level |
|---|---|---|---|
| `src/components/layout/AppLayout.tsx` | Main authenticated wrapper combining `Sidebar`, `Header`, page `<main>` content, and global `CheckInModal`, `CheckOutModal`, `CheckStatusModal` | Every Admin & Operator page | `[Careful: Shared component — multiple screens affect ho sakti hain]` |
| `src/components/layout/Header.tsx` | Sticky top bar containing Mobile menu button, Gate selector dropdown, Live clock, Sound toggle (Operator), Notification bell & dropdown, Language toggle (`اردو` / `English`), Theme toggle, Admin quick action buttons (`Add Visitor`, `Check Out`, `Check Status`, `Vendor`), and User profile / Logout controls | Every Admin & Operator page | `[Careful: Shared component — multiple screens affect ho sakti hain]` |
| `src/components/layout/Sidebar.tsx` | Left navigation sidebar (fixed top logo header, independently scrollable middle menu area, fixed bottom theme/user/logout footer) for Desktop and Mobile drawer | Every Admin & Operator page | `[Careful: Shared component — multiple screens affect ho sakti hain]` |
| `src/components/modals/CheckInModal.tsx` | 6-step Visitor/Vendor/Delivery/Contractor/Interview Check-In wizard modal (`Step 1: Category` -> `Step 2: Visit Info / Delivery Source` -> `Step 3: Scan ID Card` -> `Step 4: Review Scanned Details` -> `Step 5: Capture Photo / Delivery Doc` -> `Step 6: Phone & Card/Vehicle Details` -> `RegistrationSuccessModal`) | Dashboard (`Register`), Header (`Add Visitor` / `Vendor`), Category pages | `[Careful: Shared component — multiple screens affect ho sakti hain]` |
| `src/components/VisitInfoStep.tsx` | Renders **Step 1** (6 Visitor Category cards: `Visitor`, `Vendor`, `Interview`, `Delivery`, `Parcel`, `Contractor`) and **Step 2** (Host Name & Department selection, or Delivery Source & Department for `DELIVERY`) | `CheckInModal.tsx` and `/scan` workflow | `[Careful: Shared component — multiple screens affect ho sakti hain]` |
| `src/components/CnicScanner.tsx` | Orchestrates multi-step OCR scanning workflow, tabs, and state between ID scanning and visitor registration | Standalone scanner & check-in workflows | `[Careful: Shared component — multiple screens affect ho sakti hain]` |
| `src/components/CnicCameraModal.tsx` | Live camera modal for capturing CNIC or Driving Licence card images | Step 3 of Check-In (`CheckInModal.tsx` & `CnicScanner.tsx`) | `[Careful: Shared component — multiple screens affect ho sakti hain]` |
| `src/components/VisitorPhotoCameraModal.tsx` | Live camera modal for capturing Visitor Portrait Photos, Delivery Documents (Check-in & Checkout), and Parcel Photos | `VisitorStep.tsx`, `CheckOutModal.tsx`, `ParcelManagementView.tsx`, `UnexpectedParcelModal.tsx` | `[Careful: Shared component — multiple screens affect ho sakti hain]` |
| `src/components/CnicForm.tsx` | Editable form displaying OCR-extracted Pakistani CNIC fields (Full Name, Father/Husband Name, CNIC Number, Gender, DOB, Issue/Expiry Dates) | Step 4 of Check-In (`CheckInModal.tsx` & `CnicScanner.tsx`) | `[Careful: Shared component — multiple screens affect ho sakti hain]` |
| `src/components/DlsForm.tsx` | Editable form displaying OCR-extracted Driving Licence fields (Full Name, Father/Husband Name, CNIC, Licence Number, Vehicle Category, Valid Upto, Licensing Authority) | Step 4 of Check-In (`CheckInModal.tsx` & `CnicScanner.tsx`) | `[Careful: Shared component — multiple screens affect ho sakti hain]` |
| `src/components/VisitorStep.tsx` | Renders **Step 5** (Capture Visitor Photo + optional Incoming Delivery Document for `DELIVERY`) and **Step 6** (Phone Number, Physical Visitor Card Number or Vehicle Number for `DELIVERY`, Carrying Items toggle, and Submit button) | `CheckInModal.tsx` & `CnicScanner.tsx` | `[Careful: Shared component — multiple screens affect ho sakti hain]` |
| `src/components/modals/RegistrationSuccessModal.tsx` | Final confirmation screen after check-in showing visitor summary, assigned card/vehicle number, `Print Badge` button, and `Register Next Visitor` button | `CheckInModal.tsx` | `[Careful: Shared component — multiple screens affect ho sakti hain]` |
| `src/components/modals/CheckOutModal.tsx` | Visitor & Delivery Checkout modal supporting QR Pass scanning, search by name/CNIC/card/vehicle, physical card collection reminder, and optional Outgoing Delivery Document capture for `DELIVERY` records | Dashboard (`Check Out Visitor`), Header (`Check Out`), Currently Inside table (`Check Out` button) | `[Careful: Shared component — multiple screens affect ho sakti hain]` |
| `src/components/modals/CheckStatusModal.tsx` | Search & status lookup modal (search by visitor name, CNIC, badge/card number, or phone; displays current status, visit details, scanned ID images, and delivery documents only for `DELIVERY` category) | Dashboard (`Check Visitor Status`) & Header (`Check Status`) | `[Careful: Shared component — multiple screens affect ho sakti hain]` |
| `src/components/modals/CategoryRecordsModal.tsx` | Popup modal on Operator Dashboard when clicking any of the 8 KPI/category stat cards (`Total Visitors`, `Currently Inside`, `Total Checkouts`, `Overstay Alerts`, `Vendors`, `Interviews`, `Guests`, `Deliveries`) | Operator Dashboard (`src/app/dashboard/page.tsx`) | `[Safe to edit: Text/labels only]` |
| `src/components/modals/UpcomingGuestsModal.tsx` | Modal opened from the Operator Dashboard `Guest` tile showing employee-invited guests (`PENDING`), search bar, and 1-step `VC Card No.` assignment to check in an invited guest | Operator Dashboard (`Guest` tile) & `/special-guests` | `[Careful: Shared component — multiple screens affect ho sakti hain]` |
| `src/components/modals/UnexpectedParcelModal.tsx` | Modal for registering an unscheduled/walk-in parcel (`Parcel`) at the gate (select employee or enter recipient details, sender info, and capture parcel photo) | `CheckInModal.tsx` (when `Parcel` category is tapped) & `ParcelManagementView.tsx` | `[Careful: Shared component — multiple screens affect ho sakti hain]` |
| `src/components/modals/VisitorBadgeModal.tsx` | Printable visitor pass/badge modal with QR code, visitor photo, host/department, entry gate, and timestamp | Dashboard (`View Pass`), `RegistrationSuccessModal.tsx`, `VisitorCategoryView.tsx` | `[Careful: Shared component — multiple screens affect ho sakti hain]` |
| `src/components/modals/OperatorQrCardModal.tsx` | Admin modal to view, regenerate, download, or print an Operator's physical QR Login Access Card | `src/app/access/page.tsx` (`Manage Access`) | `[Safe to edit: Text/labels only]` |
| `src/components/visitors/VisitorCategoryView.tsx` | Shared full-page visitor registry table with search, status filter (`ALL`, `CHECKED_IN`, `CHECKED_OUT`, `OVERSTAY`), date filter, pagination, badge viewing, and checkout buttons | `/visitors`, `/vendors`, `/interviews`, `/special-guests`, `/contractors`, `/deliveries` | `[Careful: Shared component — multiple screens affect ho sakti hain]` |
| `src/components/visitors/IdentityDocumentImagesCard.tsx` | Displays saved CNIC image, Driving Licence image, and (for `DELIVERY` category only) Incoming/Outgoing Delivery Document images with full-screen lightbox zoom | `/person/[id]/page.tsx` & `CheckStatusModal.tsx` | `[Careful: Shared component — multiple screens affect ho sakti hain]` |
| `src/components/parcels/ParcelManagementView.tsx` | Complete Parcel Tracker interface with 4 tabs (`Expected`, `Received at Gate`, `Delivered`, `All Parcels / History`), camera capture for receiving parcels, and 1-click delivery confirmation | `/parcels` page & Operator Dashboard `Parcel Tracker` modal | `[Careful: Shared component — multiple screens affect ho sakti hain]` |
| `src/components/vip/VipGuestManagementView.tsx` | Complete VIP Guest interface with search, status tabs (`ALL`, `UPCOMING`, `CHECKED_IN`, `CHECKED_OUT`), Admin create/edit VIP form, and Operator 1-tap `Check In VIP` / `Check Out VIP` buttons | `/vip-guests` page & Operator Dashboard `VIP Guest` modal | `[Careful: Shared component — multiple screens affect ho sakti hain]` |
| `src/components/admin/AdminPasswordResetSection.tsx` | Admin password recovery review table embedded in System Settings | `src/app/settings/page.tsx` | `[Safe to edit: Text/labels only]` |
| `src/components/auth/PasswordRecoveryPanel.tsx` | Reusable "Forgot Password?" request and live approval polling panel | `/admin`, `/login`, `/employee` | `[Careful: Shared component — multiple screens affect ho sakti hain]` |
| `src/components/auth/AdminGuard.tsx` | Route guard restricting Admin-only pages (`role === 'ADMIN'`) | `/departments`, `/employees`, `/access`, `/reports`, `/audit-logs`, `/settings` | `[Developer only: Backend, authentication, database ya business logic]` |
| `src/components/scanner/OperatorQrScanner.tsx` | Live QR code camera scanner used on the Operator Login screen | `src/app/login/page.tsx` | `[Careful: Shared component — multiple screens affect ho sakti hain]` |
| `src/components/scanner/QrScanner.tsx` | QR code scanner used inside `CheckOutModal.tsx` to scan visitor passes on exit | `src/components/modals/CheckOutModal.tsx` | `[Careful: Shared component — multiple screens affect ho sakti hain]` |
| `src/components/icons/OperatorDashboardSvgIcons.tsx` | React SVG icon components for the Operator Dashboard Top 6 Action Tiles (`OpSvgRegister`, `OpSvgCheckout`, `OpSvgCheckStatus`, `OpSvgGuest`, `OpSvgParcelTracker`, `OpSvgVipGuest`) and Bottom 8 KPI/Category Cards (`OpSvgTotalVisitors`, `OpSvgCurrentlyInside`, `OpSvgTotalCheckouts`, `OpSvgOverstayAlerts`, `OpSvgTotalVendors`, `OpSvgTotalInterviews`, `OpSvgTotalGuests`, `OpSvgTotalDeliveries`) + `OpSvgContractor` | `src/app/dashboard/page.tsx` & `src/components/VisitInfoStep.tsx` | `[Careful: Shared component — multiple screens affect ho sakti hain]` |
| `src/components/icons/OperatorTaskIcons.tsx` | Additional operator workflow vector icons | Operator workflow components | `[Careful: Shared component — multiple screens affect ho sakti hain]` |
| `src/components/ui/GateShieldLogo.tsx` | Renders the official GateShield hexagonal shield logo (`icon` or `full` variant, automatically switches between light/dark brand assets) | `Sidebar.tsx`, `Header.tsx`, Login pages, `GatekeeperLoader.tsx` | `[Careful: Shared component — multiple screens affect ho sakti hain]` |
| `src/components/ui/GatekeeperLoader.tsx` | Branded loading spinner (`fullscreen`, `section`, or `overlay` variants) | All pages and modals during async loading | `[Careful: Shared component — multiple screens affect ho sakti hain]` |
| `src/components/ui/DateFilterInput.tsx` | Date range / single date picker input used in visitor logs and reports | `VisitorCategoryView.tsx`, `reports/page.tsx` | `[Careful: Shared component — multiple screens affect ho sakti hain]` |
| `src/components/ui/PasswordInput.tsx` | Password input field with show/hide eye toggle | `/admin`, `/login`, `/employee`, `/access`, `/employees`, `/reset-password` | `[Careful: Shared component — multiple screens affect ho sakti hain]` |

---

### 2.5 Public Static Assets (`public/`)

| File / Folder Path | Purpose | Used By | Safety Level |
|---|---|---|---|
| `public/fonts/JameelNooriNastaleeq-Regular.woff2` | Official Urdu Nastaleeq webfont preloaded in `src/app/layout.tsx` and declared in `src/app/globals.css` | All Urdu text when `language === 'ur'` | `[Careful: Shared component — multiple screens affect ho sakti hain]` |
| `public/brand/gateshield-logo-light.png` | Full GateShield logo for Light Mode | `GateShieldLogo.tsx` | `[Careful: Shared component — multiple screens affect ho sakti hain]` |
| `public/brand/gateshield-logo-dark.png` | Full GateShield logo for Dark Mode | `GateShieldLogo.tsx` | `[Careful: Shared component — multiple screens affect ho sakti hain]` |
| `public/brand/gateshield-icon-light.png` | Compact shield icon for Light Mode & favicon | `GateShieldLogo.tsx`, `layout.tsx` | `[Careful: Shared component — multiple screens affect ho sakti hain]` |
| `public/brand/gateshield-icon-dark.png` | Compact shield icon for Dark Mode | `GateShieldLogo.tsx` | `[Careful: Shared component — multiple screens affect ho sakti hain]` |
| `public/icons/operator/Top 6 Main Icons/*.svg` | Source SVG files for Top 6 Operator icons (`Register icon.svg`, `Checkout icon.svg`, `check visitor status.svg`, `Guest.svg`, `Parcel tracker.svg`, `VIP Guest.svg`) | Source assets mirrored in `OperatorDashboardSvgIcons.tsx` | `[Safe to edit: Text/labels only]` |
| `public/icons/operator/Bottom 8 Icons/*.svg` | Source SVG files for Bottom 8 Operator KPI/category icons (`total visitors.svg`, `currently inside.svg`, `total checkouts.svg`, `overstay alrets.svg`, `total vendors.svg`, `Total interviews.svg`, `total guests.svg`, `total deliveries.svg`) | Source assets mirrored in `OperatorDashboardSvgIcons.tsx` | `[Safe to edit: Text/labels only]` |

---

### 2.6 Frontend Services, Types & Utilities (`src/services/`, `src/types/`, `src/utils/`, `src/lib/`)

| File Path | Purpose | Safety Level |
|---|---|---|
| `src/services/cnicApi.ts` | Calls `/api/scan-cnic` and `/api/submit-visitor` from the browser | `[Developer only: Backend, authentication, database ya business logic]` |
| `src/services/dlsApi.ts` | Calls `/api/scan-dls` for Driving Licence OCR from the browser | `[Developer only: Backend, authentication, database ya business logic]` |
| `src/types/cnic.ts` | TypeScript interfaces for CNIC OCR response (`CNICData`) | `[Developer only: Backend, authentication, database ya business logic]` |
| `src/types/dls.ts` | TypeScript interfaces for Driving Licence OCR response (`DLSData`) | `[Developer only: Backend, authentication, database ya business logic]` |
| `src/types/visitor.ts` | TypeScript interfaces for Visitor form state (`VisitorFormData`) | `[Developer only: Backend, authentication, database ya business logic]` |
| `src/utils/cameraCapture.ts` | Browser `getUserMedia` camera stream helper & frame capture | `[Developer only: Backend, authentication, database ya business logic]` |
| `src/utils/cnicParser.ts` | Client-side CNIC string formatting and validation helpers | `[Developer only: Backend, authentication, database ya business logic]` |
| `src/utils/documentImageCompression.ts` | Compresses captured CNIC/DLS/Delivery document images before upload | `[Developer only: Backend, authentication, database ya business logic]` |
| `src/utils/interactionSound.ts` | Web Audio API synthesized tap/success sound effects for Operator actions (`playSelectSound`, `isInteractionSoundEnabled`) | `[Developer only: Backend, authentication, database ya business logic]` |
| `src/lib/prisma.ts` | Singleton Prisma client instance connected to PostgreSQL | `[Developer only: Backend, authentication, database ya business logic]` |
| `src/lib/auth.ts` | JWT session signing/verification (`gk_token` for Admin/Operator, `gk_emp_token` for Employee) | `[Developer only: Backend, authentication, database ya business logic]` |
| `src/lib/operatorQr.ts` | Cryptographic generation and verification of Operator QR Login tokens | `[Developer only: Backend, authentication, database ya business logic]` |
| `src/lib/passwordReset.ts` | Token hashing, expiration, and authorization helpers for Password Reset requests | `[Developer only: Backend, authentication, database ya business logic]` |
| `src/lib/fileStorage.ts` | Server-side disk storage handler saving uploaded photos/documents under `uploads/` and serving via `/api/files/[...key]` | `[Developer only: Backend, authentication, database ya business logic]` |
| `src/lib/ocrProxy.ts` | Forwards Next.js `/api/scan-cnic` and `/api/scan-dls` requests to the Python FastAPI OCR server (`http://127.0.0.1:8000`) | `[Developer only: Backend, authentication, database ya business logic]` |
| `src/lib/notifications.ts` | Creates `AppNotification` records for Admins, Operators, and Employees | `[Developer only: Backend, authentication, database ya business logic]` |
| `src/lib/emailService.ts` | SMTP email notification sender with `EmailOutbox` logging | `[Developer only: Backend, authentication, database ya business logic]` |
| `src/lib/audit.ts` | Writes security audit trail entries to `AuditLog` table | `[Developer only: Backend, authentication, database ya business logic]` |
| `src/lib/cardUtils.ts` | Normalizes physical Visitor Card numbers (`VC-12`, etc.) to prevent duplicate active card assignments | `[Developer only: Backend, authentication, database ya business logic]` |
| `src/lib/departmentUtils.ts` | Department name normalization and default seeding helpers | `[Developer only: Backend, authentication, database ya business logic]` |
| `src/lib/personSanitizer.ts` | Sanitizes person payloads and strips raw binary blobs from list responses | `[Developer only: Backend, authentication, database ya business logic]` |
| `src/lib/qrUtils.ts` | Generates QR code data URLs for visitor badges and operator cards | `[Developer only: Backend, authentication, database ya business logic]` |
| `src/lib/searchUtils.ts` | Search query normalization for CNIC, phone numbers, and names | `[Developer only: Backend, authentication, database ya business logic]` |

---

## 3. Admin Dashboard File Map

When logged in as an **Administrator** (`user.role === 'ADMIN'`), here is the exact file map for every Admin screen and feature:

| Admin Feature / Section | Primary Page File | Reusable Components Used | Where Headings / Labels Are Defined | Safety Level |
|---|---|---|---|---|
| **Admin Dashboard Main Screen** | `src/app/dashboard/page.tsx` (lines 234–639, rendered when `isAdmin` is `true`) | `AppLayout.tsx`, `Header.tsx`, `Sidebar.tsx`, `VisitorBadgeModal.tsx`, `CheckOutModal.tsx` | Banner title & subtitle use `t('gate_control_dashboard')` and `t('gate_control_subtitle')` from `src/context/LanguageContext.tsx` (lines 29–33) | `[Safe to edit: Text/labels only]` |
| **Admin Hero Banner Quick Action Buttons** (`Employee Requests`, `Operator Requests`, `Invite VIP Guest`) | `src/app/dashboard/page.tsx` (lines 273–313) | Inline modal for `Invite VIP Guest` (lines 1456–1542 of `src/app/dashboard/page.tsx`) | `LanguageContext.tsx` keys: `admin_qa_employee_requests` (line 974), `admin_qa_operator_requests` (line 982), `admin_qa_invite_vip` (line 998) | `[Safe to edit: Text/labels only]` |
| **Admin 4 Main KPI Cards & 4 Secondary Category Cards** | `src/app/dashboard/page.tsx` (lines 316–456) | None (inline in `dashboard/page.tsx`) | `LanguageContext.tsx` keys: `total_visitors_today`, `currently_inside`, `total_checkouts`, `overstay_alerts`, `vendors`, `interviews`, `special_guests`, `deliveries` (lines 62–76) | `[Safe to edit: Text/labels only]` |
| **Currently Inside Facility Table & Recent Activity** | `src/app/dashboard/page.tsx` (lines 458–637) | `VisitorBadgeModal.tsx` (on `View Pass`), `CheckOutModal.tsx` (on `Check Out`) | Table column keys in `LanguageContext.tsx` (lines 78–92): `visitor`, `category`, `host_and_dept`, `card_badge`, `entry_time`, `actions` | `[Safe to edit: Text/labels only]` |
| **Visitor Management (`Visitors & Logs`)** | `src/app/visitors/page.tsx` | `src/components/visitors/VisitorCategoryView.tsx` | Page title `"All Registered Visitors"` in `src/app/visitors/page.tsx` (line 7); table & filter UI in `VisitorCategoryView.tsx` | `[Careful: Shared component — multiple screens affect ho sakti hain]` |
| **Visitor Registration (Admin Quick Check-In)** | Triggered from `src/components/layout/Header.tsx` (`Add Visitor` button at line 631) | `src/components/modals/CheckInModal.tsx`, `VisitInfoStep.tsx`, `CnicForm.tsx`, `DlsForm.tsx`, `VisitorStep.tsx` | Step labels in `LanguageContext.tsx` (lines 178–386) | `[Careful: Shared component — multiple screens affect ho sakti hain]` |
| **Visitor / Person Details Screen** | `src/app/person/[id]/page.tsx` | `src/components/visitors/IdentityDocumentImagesCard.tsx`, `VisitorBadgeModal.tsx` | Labels in `src/app/person/[id]/page.tsx` and `IdentityDocumentImagesCard.tsx` (lines 389–436 of `LanguageContext.tsx`) | `[Safe to edit: Text/labels only]` |
| **Vendor Management** | `src/app/vendors/page.tsx` | `src/components/visitors/VisitorCategoryView.tsx` (`category="VENDOR"`) | Title `"Vendors & Suppliers"` in `src/app/vendors/page.tsx` (line 7) | `[Safe to edit: Text/labels only]` |
| **Vendor Registration** | Triggered from `Header.tsx` (`Vendor` button at line 662) or `CheckInModal.tsx` | `src/components/modals/CheckInModal.tsx` (`defaultCategory="VENDOR"`) | Category & step labels in `LanguageContext.tsx` (lines 178–386) | `[Careful: Shared component — multiple screens affect ho sakti hain]` |
| **VIP Guest Management & Invitation Form** | `src/app/vip-guests/page.tsx` & `src/app/dashboard/page.tsx` (lines 1456–1542) | `src/components/vip/VipGuestManagementView.tsx` | `LanguageContext.tsx` keys `vip_guest_list_title` to `no_vip_found` (lines 767–787) and inline labels in `VipGuestManagementView.tsx` | `[Careful: Shared component — multiple screens affect ho sakti hain]` |
| **Employee Management & Employee Requests** | `src/app/employees/page.tsx` | `AppLayout.tsx`, `AdminGuard.tsx`, `PasswordInput.tsx` | Hardcoded English headings/tabs in `src/app/employees/page.tsx` (`"Employees & Portal Access"`, `"Employee Requests"`, `"Approved Employees"`, `"Add Employee"`) | `[Safe to edit: Text/labels only]` |
| **Operator Requests & Manage Access (`Operators`)** | `src/app/access/page.tsx` | `OperatorQrCardModal.tsx`, `PasswordInput.tsx`, `AdminGuard.tsx` | Hardcoded English headings/tabs in `src/app/access/page.tsx` (`"Access & Operator Management"`, `"Operators & Admins"`, `"Operator Requests"`) | `[Safe to edit: Text/labels only]` |
| **Password Reset Requests (Admin Review)** | `src/app/employees/page.tsx` (Employee resets), `src/app/access/page.tsx` (Operator resets), `src/app/settings/page.tsx` (All resets) | `src/components/admin/AdminPasswordResetSection.tsx` | Labels in `AdminPasswordResetSection.tsx`, `employees/page.tsx`, and `access/page.tsx` | `[Safe to edit: Text/labels only]` |
| **Department Management** | `src/app/departments/page.tsx` | `AppLayout.tsx`, `AdminGuard.tsx` | Headings and form labels directly in `src/app/departments/page.tsx` | `[Safe to edit: Text/labels only]` |
| **Gate Management & System Settings** | `src/app/settings/page.tsx` | `AdminPasswordResetSection.tsx`, `AdminGuard.tsx` | Gate creation modal and system configuration labels directly in `src/app/settings/page.tsx` (lines 100–305) | `[Safe to edit: Text/labels only]` |
| **Reports & Export** | `src/app/reports/page.tsx` | `DateFilterInput.tsx`, `AdminGuard.tsx` | Headings, summary cards, and CSV export button labels in `src/app/reports/page.tsx` | `[Safe to edit: Text/labels only]` |
| **Audit Logs** | `src/app/audit-logs/page.tsx` | `AdminGuard.tsx` | Headings, filter dropdowns, and table headers in `src/app/audit-logs/page.tsx` | `[Safe to edit: Text/labels only]` |
| **Notifications (Bell Icon, Dropdown & Live Toast)** | `src/components/layout/Header.tsx` (lines 306–462) | Built into `Header.tsx` | Dropdown labels in `LanguageContext.tsx` (`notifications_title`, `mark_all_read`, `no_notifications`, lines 706–709); notification titles/messages come dynamically from the database (`AppNotification`) | `[Careful: Shared component — multiple screens affect ho sakti hain]` |
| **Package / Parcel Management** | `src/app/parcels/page.tsx` | `src/components/parcels/ParcelManagementView.tsx`, `UnexpectedParcelModal.tsx` | `LanguageContext.tsx` keys (lines 714–765) and `ParcelManagementView.tsx` | `[Careful: Shared component — multiple screens affect ho sakti hain]` |
| **Delivery Management** | `src/app/deliveries/page.tsx` | `src/components/visitors/VisitorCategoryView.tsx` (`category="DELIVERY"`) | Title `"Deliveries & Logistics"` in `src/app/deliveries/page.tsx` | `[Safe to edit: Text/labels only]` |
| **Header, Sidebar, Footer, Profile & Logout** | `src/components/layout/Header.tsx` & `src/components/layout/Sidebar.tsx` | `GateShieldLogo.tsx` | Admin Profile dropdown at lines 887–984 of `Header.tsx`; Sidebar user footer at lines 262–328 of `Sidebar.tsx` | `[Careful: Shared component — multiple screens affect ho sakti hain]` |

---

## 4. Operator Dashboard File Map

When logged in as a **Security Operator** (`user.role === 'OPERATOR'`), here is the exact file map for every Operator screen, tile, modal, and workflow:

| Operator Feature / Screen | Primary File | Supporting Components | Where Labels & Descriptions Are Defined | Safety Level |
|---|---|---|---|---|
| **Operator Dashboard Main Screen** | `src/app/dashboard/page.tsx` (lines 640–1395, rendered when `isAdmin` is `false`) | `AppLayout.tsx`, `Header.tsx`, `Sidebar.tsx`, `OperatorDashboardSvgIcons.tsx` | `src/app/dashboard/page.tsx` & `src/context/LanguageContext.tsx` | `[Safe to edit: Text/labels only]` |
| **Gate Control Hero Banner & Live Clock** | `src/app/dashboard/page.tsx` (lines 707–762) | None | `LanguageContext.tsx` keys `active_gate`, `gate_control_dashboard`, `gate_control_subtitle` (lines 20–33) | `[Safe to edit: Text/labels only]` |
| **Top 6 Main Action Tiles** (`Register`, `Check Out Visitor`, `Check Visitor Status`, `Guest`, `Parcel Tracker`, `VIP Guest`) | `src/app/dashboard/page.tsx` (lines 764–917) | Icons from `src/components/icons/OperatorDashboardSvgIcons.tsx` | `LanguageContext.tsx` keys: `register_visitor` / `register_visitor_desc` (lines 36–37), `checkout_visitor` / `checkout_visitor_desc` (lines 38–39), `check_status` / `check_status_desc` (lines 40–41), `guest_option_title` / `guest_option_desc` (lines 44–45), `parcel_tracker_title` / `parcel_tracker_desc` (lines 46–47), `vip_guest_title` / `vip_guest_desc` (lines 48–49) | `[Safe to edit: Text/labels only]` |
| **8 KPI & Category Stat Cards** (`Total Visitors`, `Currently Inside`, `Total Checkouts`, `Overstay Alerts`, `Total Vendors`, `Total Interviews`, `Total Guests`, `Total Deliveries`) | `src/app/dashboard/page.tsx` (lines 920–1160) | Clicking any card opens `src/components/modals/CategoryRecordsModal.tsx`; icons from `OperatorDashboardSvgIcons.tsx` | Card titles are written inline in `src/app/dashboard/page.tsx` (`language === 'ur' ? '...' : '...'` at lines 940, 970, 1001, 1031, 1063, 1090, 1117, 1144); sub-labels use `t('live_indicator')`, `t('active_on_site')`, `t('exited_premises')`, `t('flagged_badges')` | `[Safe to edit: Text/labels only]` |
| **Register Visitor (6-Step Check-In Wizard)** | `src/components/modals/CheckInModal.tsx` | `VisitInfoStep.tsx`, `CnicCameraModal.tsx`, `CnicForm.tsx`, `DlsForm.tsx`, `VisitorStep.tsx`, `VisitorPhotoCameraModal.tsx`, `RegistrationSuccessModal.tsx` | Step titles, subtitles, and field labels in `src/context/LanguageContext.tsx` (lines 178–386) | `[Careful: Shared component — multiple screens affect ho sakti hain]` |
| **Visitor Categories (Step 1 of Registration)** | `src/components/VisitInfoStep.tsx` (lines 36–89 & lines 490–575) | `UnexpectedParcelModal.tsx` (when `Parcel` is tapped) | `CATEGORY_CARDS` array in `src/components/VisitInfoStep.tsx` (lines 36–89) using `LanguageContext.tsx` keys `cat_visitor`, `cat_vendor`, `cat_interview`, `cat_delivery`, `cat_parcel`, `cat_contractor` (lines 201–207) | `[Careful: Shared component — multiple screens affect ho sakti hain]` |
| **Vendor Registration** | `src/components/modals/CheckInModal.tsx` & `src/components/VisitInfoStep.tsx` | Same 6-step flow with `category = 'VENDOR'` | `cat_vendor` in `LanguageContext.tsx` (line 202) | `[Careful: Shared component — multiple screens affect ho sakti hain]` |
| **Delivery Registration (Check-In)** | `src/components/VisitInfoStep.tsx` (Step 2: Delivery Source & Dept, lines 580–730) & `src/components/VisitorStep.tsx` (Step 5: Optional Photo + Optional Incoming Delivery Doc, Step 6: Phone & Vehicle Number) | `VisitorPhotoCameraModal.tsx` | `LanguageContext.tsx` keys `delivery_source_title` through `vehicle_no_error` (lines 838–941) | `[Careful: Shared component — multiple screens affect ho sakti hain]` |
| **Visitor Checkout & Delivery Checkout** | `src/components/modals/CheckOutModal.tsx` | `QrScanner.tsx`, `VisitorPhotoCameraModal.tsx` (for optional Outgoing Delivery Document capture when `category === 'DELIVERY'`) | `LanguageContext.tsx` keys `delivery_checkout_title` through `confirm_checkout_btn` (lines 942–969) and inline strings in `CheckOutModal.tsx` | `[Careful: Shared component — multiple screens affect ho sakti hain]` |
| **Check Visitor Status** | `src/components/modals/CheckStatusModal.tsx` | `IdentityDocumentImagesCard.tsx` | Search placeholder & status labels in `CheckStatusModal.tsx` and `LanguageContext.tsx` (`check_status`, `search_placeholder`, lines 40, 161) | `[Careful: Shared component — multiple screens affect ho sakti hain]` |
| **Invited Guest Check-In (`Guest` Tile)** | `src/components/modals/UpcomingGuestsModal.tsx` | Opened from `src/app/dashboard/page.tsx` (line 828) | `LanguageContext.tsx` keys `upcoming_guests_title` through `along_with_placeholder` (lines 617–688) | `[Careful: Shared component — multiple screens affect ho sakti hain]` |
| **Parcel Tracker / Received Parcels / Delivered Parcels / Parcel History** | `src/components/parcels/ParcelManagementView.tsx` & `src/app/parcels/page.tsx` | `UnexpectedParcelModal.tsx`, `VisitorPhotoCameraModal.tsx` | `LanguageContext.tsx` keys `parcel_management_title` through `all_parcels_tab` (lines 714–760) and `ParcelManagementView.tsx` | `[Careful: Shared component — multiple screens affect ho sakti hain]` |
| **Operator Header, Gate Selector, Notifications, Profile & Logout** | `src/components/layout/Header.tsx` | `GateShieldLogo.tsx` | Operator Profile dropdown at lines 730–885 and Logout confirmation modal at lines 986–990 in `Header.tsx`; translations in `LanguageContext.tsx` (lines 94–103) | `[Careful: Shared component — multiple screens affect ho sakti hain]` |
| **Operator Sidebar** | `src/components/layout/Sidebar.tsx` | `GateShieldLogo.tsx` | `NAV_ITEMS` (items without `adminOnly: true`, lines 44–52) and `PARCEL_NAV_ITEMS` (lines 61–66) in `Sidebar.tsx` | `[Careful: Shared component — multiple screens affect ho sakti hain]` |

---

## 5. Employee Portal File Map

The **Employee Portal** (`/employee`) is self-contained inside `src/app/employee/page.tsx` (with shared password recovery in `src/components/auth/PasswordRecoveryPanel.tsx` and bilingual keys in `src/context/LanguageContext.tsx` lines 470–615 & 761–765):

| Employee Portal Feature | File Path & Exact Line Range | Where Text / Labels Are Controlled | Safety Level |
|---|---|---|---|
| **Employee Portal Header, Language Toggle, Theme Toggle, Profile & Logout** | `src/app/employee/page.tsx` (lines 990–1250) | `LanguageContext.tsx` keys `emp_portal_title`, `emp_portal_subtitle`, `logout` + inline labels in `src/app/employee/page.tsx` | `[Safe to edit: Text/labels only]` |
| **Employee Login & First-Time Registration Tabs** | `src/app/employee/page.tsx` (lines 620–880) | `LanguageContext.tsx` keys `emp_sign_in_tab`, `emp_register_tab`, `emp_full_name`, `emp_department`, `emp_position`, `emp_phone`, `emp_email`, `emp_password`, `emp_confirm_password`, `emp_submit_registration` (lines 479–518) | `[Safe to edit: Text/labels only]` |
| **Forgot Password / Password Reset Request** | `src/app/employee/page.tsx` (lines 881–910) & `src/components/auth/PasswordRecoveryPanel.tsx` | `PasswordRecoveryPanel.tsx` (shared with Admin and Operator login screens) | `[Careful: Shared component — multiple screens affect ho sakti hain]` |
| **Pending / Rejected Registration Waiting Screen** | `src/app/employee/page.tsx` (lines 912–988) | `LanguageContext.tsx` keys `emp_status_pending_title`, `emp_status_pending_desc`, `emp_status_rejected_title`, `emp_status_rejected_desc` (lines 519–538) | `[Safe to edit: Text/labels only]` |
| **Employee Dashboard Home (2 Main Cards: `Guest Management` & `Parcel Management`)** | `src/app/employee/page.tsx` (lines 1295–1475) | Inline English/Urdu strings (`isUrdu ? '...' : '...'`) in `src/app/employee/page.tsx` (lines 1330–1470) | `[Safe to edit: Text/labels only]` |
| **Invite Guest Form (`Guest Invitations`)** | `src/app/employee/page.tsx` (lines 1535–1835) | `LanguageContext.tsx` keys `emp_action_invite_guest`, `emp_guest_name`, `emp_guest_phone`, `emp_guest_cnic`, `along_with_label`, `emp_guest_photo`, `emp_visit_date`, `estimated_arrival_slot`, `emp_create_invitation_btn` (lines 539–606, 681–688) | `[Safe to edit: Text/labels only]` |
| **Visited / Pending Guests History & Re-Invite Modal** | `src/app/employee/page.tsx` (lines 1836–2150 & Re-invite modal at lines 2530–2715) | `LanguageContext.tsx` keys `emp_action_visited_guests`, `emp_reinvite_btn` + inline table/card labels in `src/app/employee/page.tsx` | `[Safe to edit: Text/labels only]` |
| **Add Parcel Reminder & Arrived Parcels (`Package Notifications`)** | `src/app/employee/page.tsx` (lines 2155–2525) | `LanguageContext.tsx` keys `add_parcel_reminder_title`, `save_parcel_reminder_btn`, `arrived_parcels_title`, `my_parcel_reminders_title` (lines 761–765) + inline labels in `src/app/employee/page.tsx` | `[Safe to edit: Text/labels only]` |
| **Employee Live Arrival Banner & Notification Bell Dropdown** | `src/app/employee/page.tsx` (lines 1045–1195 & 1255–1294) | Bell dropdown UI in `src/app/employee/page.tsx`; notification titles/messages come dynamically from `/api/employee/notifications` | `[Safe to edit: Text/labels only]` |

---

## 6. Content Editing Reference (How & Where to Change UI Text Safely)

### 6.1 The 4 Types of Text in GateShield

Before editing any text, check which of these 4 categories it belongs to:

1. **Translation Dictionary Text (`t('key', 'Fallback')`) — `[Safe to edit]`**
   - Stored in `src/context/LanguageContext.tsx` inside the `TRANSLATIONS` object (lines 14–1034).
   - **Rule:** When a component uses `t('register_visitor')`, editing the fallback string inside the component will **not** change the text if the key exists in `LanguageContext.tsx`. Always edit `en` and `ur` inside `src/context/LanguageContext.tsx`.
2. **Inline Component Bilingual Text (`language === 'ur' ? 'اردو' : 'English'`) — `[Safe to edit]`**
   - Written directly inside JSX in files like `src/app/dashboard/page.tsx` (e.g. KPI card labels) or `src/app/employee/page.tsx`.
   - **Rule:** Edit the string directly inside that `.tsx` file.
3. **Component Constants / Configuration Arrays — `[Safe to edit labels only]`**
   - Stored in arrays at the top of a component, such as `NAV_ITEMS` in `src/components/layout/Sidebar.tsx` (lines 44–66), `CATEGORY_CARDS` in `src/components/VisitInfoStep.tsx` (lines 36–89), or `ESTIMATED_ARRIVAL_SLOTS` in `src/app/employee/page.tsx` (lines 54–79).
   - **Rule:** Only edit `defaultLabel`, `labelKey`, or display labels. **Never** change enum IDs (`'VISITOR'`, `'VENDOR'`, `'DELIVERY'`, `'SPECIAL_GUEST'`) or `href` routes, as those are linked to database enums and Next.js routes.
4. **Dynamic Database / API Text — `[Do NOT hardcode in frontend]`**
   - Gate names (`currentGate.name`), Department names (`dept.name`), Visitor names (`visit.person.fullName`), Notification messages (`notif.title`, `notif.message`), and System Settings (`company_name`).
   - **Rule:** These come from PostgreSQL via `/api/*`. Edit them through the Admin UI (`/departments`, `/settings`, `/access`) rather than hardcoding them in JSX.

---

### 6.2 Reference Table by Content Type (With Real Code Examples)

| Content Type | File to Open | Exact Variable / Location | Current Code Example & What to Edit |
|---|---|---|---|
| **Page Headings (Dashboard)** | `src/context/LanguageContext.tsx` | `TRANSLATIONS.gate_control_dashboard` (line 29) | `gate_control_dashboard: { en: 'Gate Control Dashboard', ur: 'گیٹ کنٹرول ڈیش بورڈ' }` — Edit `'Gate Control Dashboard'` or `'گیٹ کنٹرول ڈیش بورڈ'`. |
| **Page Headings (Category Pages)** | `src/app/visitors/page.tsx`, `src/app/vendors/page.tsx`, `src/app/deliveries/page.tsx`, `src/app/contractors/page.tsx`, `src/app/interviews/page.tsx`, `src/app/special-guests/page.tsx` | `title` & `description` props on `<VisitorCategoryView />` (lines 6–8) | `title="Vendors & Suppliers"` / `description="Registry of external vendors..."` — Edit the `title` or `description` string prop. |
| **Action Tile Descriptions** | `src/context/LanguageContext.tsx` | `TRANSLATIONS.register_visitor_desc` (line 37), `checkout_visitor_desc` (line 39), `check_status_desc` (line 41), `guest_option_desc` (line 45), `parcel_tracker_desc` (line 47), `vip_guest_desc` (line 49) | `register_visitor_desc: { en: 'CNIC / DLS OCR Check-in', ur: 'شناختی کارڈ یا لائسنس اسکین' }` — Edit the `en` or `ur` string. |
| **Button Labels (Check-In / Checkout / Modals)** | `src/context/LanguageContext.tsx` | `back_btn` (line 190), `continue_btn` (line 191), `submit_registration_btn` (line 192), `print_badge_btn` (line 193), `confirm_checkout_btn` (line 966), `add_vip_guest_btn` (line 768) | `submit_registration_btn: { en: 'Submit Registration', ur: 'رجسٹریشن مکمل کریں' }` — Edit the `en` or `ur` value. |
| **Sidebar Menu Names** | `src/context/LanguageContext.tsx` & `src/components/layout/Sidebar.tsx` | Keys `nav_dashboard` through `nav_settings` (lines 691–703 in `LanguageContext.tsx`); `NAV_ITEMS` & `PARCEL_NAV_ITEMS` (lines 44–66 in `Sidebar.tsx`) | `nav_visitors: { en: 'Visitors & Logs', ur: 'وزیٹرز اور ریکارڈز' }` — Edit in `LanguageContext.tsx`. For Parcel submenu items (`Parcel Tracker`, `Received Parcels`, `Delivered Parcels`, `Parcel History`), edit `defaultLabel` in `Sidebar.tsx` (lines 61–66) or add keys `parcel_tab_received`, `parcel_tab_delivered`, `parcel_tab_history` in `LanguageContext.tsx`. |
| **Visitor Categories (Step 1 Cards)** | `src/context/LanguageContext.tsx` | Keys `cat_visitor`, `cat_vendor`, `cat_interview`, `cat_special_guest`, `cat_parcel`, `cat_contractor`, `cat_delivery` (lines 201–207) | `cat_delivery: { en: 'Delivery', ur: 'ڈلیوری / کوریئر' }` — Edit the `en` or `ur` display name. (**Do not** change the database enum `DELIVERY`). |
| **Form Field Labels (CNIC, DLS, Phone, Card, Vehicle)** | `src/context/LanguageContext.tsx` | Lines 214–223 (`meet_name_label`, `department_label`), lines 295–310 (`field_full_name`, `field_cnic_number`, etc.), lines 328–364 (`phone_number_label`, `visitor_card_no_label`), lines 926–941 (`vehicle_no_label`) | `visitor_card_no_label: { en: 'Visitor Card Number', ur: 'وزیٹر کارڈ نمبر' }` — Edit `en` or `ur`. |
| **Dropdown Options (Gender, Arrival Time Slots, Gate Types)** | `src/context/LanguageContext.tsx` & `src/app/employee/page.tsx` | Gender: `field_gender_male`, `field_gender_female` (lines 300–301 in `LanguageContext.tsx`); Employee Arrival Slots: `ESTIMATED_ARRIVAL_SLOTS` (lines 54–79 in `src/app/employee/page.tsx`) | Edit display text in `LanguageContext.tsx` or `ESTIMATED_ARRIVAL_SLOTS` in `src/app/employee/page.tsx`. |
| **Table Headings** | `src/context/LanguageContext.tsx` | Lines 77–86 (`visitor`, `category`, `host_and_dept`, `card_badge`, `entry_time`, `exit_time`, `actions`, `status`) | `card_badge: { en: 'Card / Badge', ur: 'پاس / کارڈ نمبر' }` — Edit `en` or `ur`. |
| **Notification Messages (Generated on Events)** | `src/lib/notifications.ts` & API routes (`src/app/api/employee/invitations/route.ts`, `src/app/api/parcels/route.ts`, `src/app/api/invitations/[id]/check-in/route.ts`) | Created on the server when a guest arrives, parcel is received, or operator/employee registers | Static UI headers (`Notifications`, `Mark all read`) are in `LanguageContext.tsx` (lines 706–709). Event notification templates are in `src/lib/notifications.ts` (`[Developer only]`). |
| **Empty-State Messages** | `src/context/LanguageContext.tsx` | `no_visitors_inside` (line 89), `no_activity_today` (line 91), `no_records_found` (line 170), `upcoming_guests_empty` (line 637), `no_notifications` (line 708), `no_vip_found` (line 787) | `no_visitors_inside: { en: 'No visitors currently inside the facility.', ur: 'اس وقت عمارت کے اندر کوئی وزیٹر موجود نہیں ہے۔' }` |
| **Success & Error Messages** | `src/context/LanguageContext.tsx` | `reg_success_title` / `reg_success_subtitle` (lines 370–377), `scan_failed_title` / `scan_failed_subtitle` (lines 275–282), `phone_number_error` (line 333), `vehicle_no_error` (line 938) | Edit `en` or `ur` in `LanguageContext.tsx`. |

---

## 7. Global Design, Typography, Fonts & Theme Files

| Design Element | File to Open | Exact Lines / Details | Safety Level |
|---|---|---|---|
| **Primary Brand Color (`#354F96`)** | `src/app/globals.css` | Lines 46–59 (`--brand-primary: #354F96` and shades `50`–`950`). Lines 112–148 map Tailwind's `brand-*`, `blue-*`, and `indigo-*` classes directly to these variables so changing `--brand-primary-*` updates the theme across the entire app. | `[Careful: Shared component — multiple screens affect ho sakti hain]` |
| **Light Mode & Dark Mode Colors** | `src/app/globals.css` | `:root` (Light Mode, lines 35–68) and `.dark` (Dark Mode, lines 70–90). Also `--color-slate-850: #172033` at line 110. Theme toggle logic is in `src/context/AuthContext.tsx` (`toggleTheme`). | `[Careful: Shared component — multiple screens affect ho sakti hain]` |
| **English Font (`Inter`)** | `src/app/globals.css` | Line 1 (`@import` for Google Fonts `Inter`) and line 32 (`--font-en: 'Inter', ...`). Applied when `html[lang="en"]` (line 155). | `[Careful: Shared component — multiple screens affect ho sakti hain]` |
| **Urdu Font (`Jameel Noori Nastaleeq Regular`)** | `src/app/globals.css` & `public/fonts/JameelNooriNastaleeq-Regular.woff2` | `@font-face` declarations at lines 5–29 of `src/app/globals.css` (`size-adjust: 108%` and Arabic/Urdu `unicode-range`). Preloaded in `src/app/layout.tsx` (lines 27–33). Applied when `html[lang="ur"]` (line 159). | `[Careful: Shared component — multiple screens affect ho sakti hain]` |
| **Urdu Label Font Sizes (+2–3px)** | `src/app/dashboard/page.tsx`, `src/components/VisitInfoStep.tsx`, `src/components/VisitorStep.tsx`, `src/components/modals/CheckInModal.tsx`, `src/components/CnicForm.tsx`, `src/components/DlsForm.tsx` | Controlled via conditional `language === 'ur'` / `isUr` classes on labels only (e.g., `${language === 'ur' ? 'text-[17px] sm:text-[18px] leading-[1.6]' : 'text-sm sm:text-base leading-snug'}`). Descriptions and English typography remain untouched. | `[Safe to edit: Text/labels only]` |
| **Responsive Breakpoints** | Standard Tailwind v4 breakpoints across `.tsx` files | `sm:` (`640px`), `md:` (`768px`), `lg:` (`1024px` — desktop sidebar breakpoint), `xl:` (`1280px`). | `[Careful: Shared component — multiple screens affect ho sakti hain]` |
| **Operator SVG Icons & Brand Logos** | `src/components/icons/OperatorDashboardSvgIcons.tsx`, `src/components/ui/GateShieldLogo.tsx`, `public/icons/operator/`, `public/brand/` | Dashboard tiles render React SVG components from `OperatorDashboardSvgIcons.tsx`. Brand logos render via `GateShieldLogo.tsx`. | `[Careful: Shared component — multiple screens affect ho sakti hain]` |

---

## 8. Backend, API Routes, OCR Engine & Database Reference

> **Important:** All files in this section are **`[Developer only: Backend, authentication, database ya business logic]`**. Modifying them can affect authentication, database integrity, OCR accuracy, or stored visitor records.

### 8.1 Prisma Schema & Database Models (`prisma/schema.prisma`)

| Model / Enum | Lines in `prisma/schema.prisma` | What It Stores |
|---|---|---|
| `Role`, `EmployeeApprovalStatus`, `InvitationStatus`, `GateType`, `PersonCategory`, `VisitStatus`, `ParcelSource`, `ParcelStatus`, `VipVisitStatus`, `PasswordResetStatus` | Lines 10–74 | Database enums used across all tables. **Never rename enum values without a database migration.** |
| `User` (`users`) | Lines 76–110 | Admin, Operator, and Employee accounts, approval status, department, and Operator QR login credentials. |
| `Gate` (`gates`) & `UserGateAccess` (`user_gate_access`) | Lines 112–137 | Physical security gates (`ENTRY`, `EXIT`, `BOTH`) and operator-to-gate assignments. |
| `Person` (`persons`) | Lines 139–183 | Unique visitor/vendor/delivery/contractor profiles, CNIC/DLS numbers, portrait `photoUrl`, and scanned document file paths (`cnicImagePath`, `dlsImagePath`, `deliveryDocImagePath`). |
| `Visit` (`visits`) | Lines 185–234 | Individual check-in/check-out records, `visitNumber`, `passCode`, `hostName`, `department`, `visitorCardNo`, `vehicleNo`, optional `incomingDocPath` (Check-in) and `outgoingDocPath` (Checkout), `entryGateId`, `exitGateId`, and timestamps. |
| `Department` (`departments`) | Lines 236–249 | Company departments, HOD names, and WhatsApp contact numbers. |
| `AuditLog` (`audit_logs`) | Lines 251–267 | Immutable log of logins, check-ins, check-outs, approvals, and settings changes. |
| `SystemSetting` (`system_settings`) | Lines 269–277 | Key-value system configuration settings. |
| `GuestInvitation` (`guest_invitations`) | Lines 279–313 | Employee pre-registered guest invitations (`PENDING`, `CHECKED_IN`, `CHECKED_OUT`). |
| `AppNotification` (`app_notifications`) | Lines 315–335 | In-app notifications targeted by `recipientUserId` or `recipientRole`. |
| `Parcel` (`parcels`) | Lines 337–372 | Expected and unexpected parcels (`EXPECTED`, `RECEIVED`, `DELIVERED`), photos, and gate handoff logs. |
| `VipGuest` (`vip_guests`) | Lines 374–405 | Admin-scheduled VIP arrivals, vehicle numbers, and fast check-in/out timestamps. |
| `EmailOutbox` (`email_outbox`) | Lines 407–425 | Outgoing email queue and delivery status log. |
| `PasswordResetRequest` (`password_reset_requests`) | Lines 427–457 | Admin-reviewed password reset requests and one-time reset token hashes. |

---

### 8.2 Next.js API Routes (`src/app/api/`)

| API Route File | HTTP Methods | What It Controls |
|---|---|---|
| `src/app/api/auth/login/route.ts` | `POST` | Admin & Operator email/password authentication |
| `src/app/api/auth/qr-login/route.ts` | `POST` | Operator QR Access Card authentication |
| `src/app/api/auth/logout/route.ts` | `POST` | Clears `gk_token` session cookie |
| `src/app/api/auth/me/route.ts` | `GET` | Returns currently logged-in Admin/Operator user and assigned gates |
| `src/app/api/auth/signup/route.ts` | `POST` | Account registration endpoint |
| `src/app/api/auth/password-reset/request/route.ts` | `POST` | Submits a new password reset request for Admin approval |
| `src/app/api/auth/password-reset/status/route.ts` | `GET` | Polls live approval status of a password reset request |
| `src/app/api/auth/password-reset/authorize/route.ts` | `POST` | Exchanges an approved tracker token for a one-time reset token |
| `src/app/api/auth/password-reset/complete/route.ts` | `POST` | Sets the user's new password and invalidates old tokens |
| `src/app/api/admin/employees/route.ts` & `[id]/route.ts` | `GET`, `POST`, `PATCH` | Admin listing, creation, approval, rejection, and activation of Employees |
| `src/app/api/admin/operators/route.ts` & `[id]/route.ts` | `GET`, `PATCH` | Admin listing, approval (with gate assignment), and rejection of Operator requests |
| `src/app/api/admin/password-resets/route.ts` & `[id]/route.ts` | `GET`, `PATCH` | Admin listing, approval, and rejection of Password Reset requests |
| `src/app/api/operator/register/route.ts` & `status/route.ts` | `POST`, `GET` | Operator self-registration request submission and live status polling |
| `src/app/api/employee/register/route.ts`, `login/route.ts`, `logout/route.ts`, `status/route.ts` | `POST`, `GET` | Employee Portal authentication and live approval status polling |
| `src/app/api/employee/invitations/route.ts` | `GET`, `POST` | Employee guest invitation creation and history |
| `src/app/api/employee/parcels/route.ts` | `GET`, `POST` | Employee parcel reminder creation and arrived parcel listing |
| `src/app/api/employee/notifications/route.ts` | `GET`, `PATCH` | Employee portal notifications |
| `src/app/api/dashboard/stats/route.ts` | `GET` | Real-time KPI counts, active visitors inside, and recent gate activity |
| `src/app/api/visitors/route.ts`, `[id]/route.ts`, `[id]/document-image/route.ts` | `GET`, `PATCH`, `POST` | Visitor/Vendor/Delivery record listing, profile details, and document image storage |
| `src/app/api/submit-visitor/route.ts` & `src/app/api/visits/check-in/route.ts` | `POST` | Creates/updates `Person` and `Visit` records during check-in (including optional incoming delivery documents) |
| `src/app/api/visits/check-out/route.ts` | `POST` | Completes visitor or delivery checkout (and saves optional outgoing delivery document) |
| `src/app/api/visits/status/route.ts` & `qr-lookup/route.ts` | `GET` | Searches visits for `CheckStatusModal` and `CheckOutModal` |
| `src/app/api/visits/card-availability/route.ts` | `GET` | Checks if a physical `VC` card number is currently in use |
| `src/app/api/invitations/upcoming/route.ts` & `[id]/check-in/route.ts` | `GET`, `POST` | Lists pending employee guest invitations for Operators and completes guest check-in |
| `src/app/api/parcels/route.ts` & `[id]/route.ts` | `GET`, `POST`, `PATCH` | Lists parcels, registers walk-in parcels, marks parcels `RECEIVED` (with photo) or `DELIVERED` |
| `src/app/api/vip-guests/route.ts` & `[id]/route.ts` | `GET`, `POST`, `PATCH`, `DELETE` | Creates, updates, checks in, and checks out VIP Guests |
| `src/app/api/departments/route.ts` & `[id]/route.ts` | `GET`, `POST`, `PATCH`, `DELETE` | CRUD operations for Departments |
| `src/app/api/gates/route.ts` | `GET`, `POST`, `PATCH` | CRUD operations for Gates |
| `src/app/api/users/route.ts` & `[id]/qr/route.ts` | `GET`, `POST`, `PATCH` | Operator/Admin user management and Operator QR Card generation |
| `src/app/api/notifications/route.ts` | `GET`, `PATCH` | Admin & Operator real-time notifications |
| `src/app/api/reports/route.ts` | `GET` | Aggregated analytics and report exports |
| `src/app/api/audit-logs/route.ts` | `GET` | Paginated security audit logs |
| `src/app/api/settings/route.ts` | `GET`, `POST` | System settings read/write |
| `src/app/api/scan-cnic/route.ts` & `src/app/api/scan-dls/route.ts` | `POST` | Proxies uploaded ID card images to the FastAPI OCR server |
| `src/app/api/files/[...key]/route.ts` | `GET` | Securely streams stored visitor photos and document images from disk |

---

### 8.3 Python FastAPI OCR Backend (`backend/app/`)

| Backend File | What It Controls | Safety Level |
|---|---|---|
| `backend/app/main.py` | FastAPI server entry point (`port 8000`) exposing `/extract`, `/extract-cnic`, `/extract-dls`, and `/health` | `[Developer only: Backend, authentication, database ya business logic]` |
| `backend/app/pipeline.py` | End-to-end OCR orchestration pipeline for CNIC and Driving Licence images | `[Developer only: Backend, authentication, database ya business logic]` |
| `backend/app/ocr_engine.py` | PaddleOCR engine initialization and text detection/recognition | `[Developer only: Backend, authentication, database ya business logic]` |
| `backend/app/preprocessor.py` | OpenCV image deskewing, contrast enhancement, and cropping | `[Developer only: Backend, authentication, database ya business logic]` |
| `backend/app/parser.py` | Regex and heuristic parser for Pakistani Smart CNIC fields | `[Developer only: Backend, authentication, database ya business logic]` |
| `backend/app/old_cnic.py` | Specialized detector and parser for older Urdu-layout NADRA CNIC cards | `[Developer only: Backend, authentication, database ya business logic]` |
| `backend/app/dls_parser.py` | Parser for Pakistani Driving Licence cards | `[Developer only: Backend, authentication, database ya business logic]` |
| `backend/app/transliteration.py` | Urdu-to-English name transliteration engine (`IndicXlit`) | `[Developer only: Backend, authentication, database ya business logic]` |
| `backend/app/workers.py` | Parallel worker pool for fast multi-pass OCR execution | `[Developer only: Backend, authentication, database ya business logic]` |

---

## 9. Shared Component Dependencies (Watch Out Before Editing!)

When editing any of the shared files below, keep in mind which screens will be updated simultaneously:

| Shared File | Screens That Use It | What Happens If You Edit It |
|---|---|---|
| `src/context/LanguageContext.tsx` | **Admin Dashboard, Operator Dashboard, Employee Portal, Header, Sidebar, Login screens, all Modals** | Editing a key in `TRANSLATIONS` updates that label everywhere `t('key')` is called across the app. |
| `src/components/layout/Header.tsx` | **All Admin & Operator pages** (`/dashboard`, `/visitors`, `/vendors`, `/parcels`, `/employees`, `/access`, `/settings`, etc.) | Changes to the top bar, gate selector, notification dropdown, or profile menu appear on every Admin and Operator page. |
| `src/components/layout/Sidebar.tsx` | **All Admin & Operator pages** | Changes to menu items, header logo, or footer controls appear on every Admin and Operator page (both Desktop and Mobile drawer). |
| `src/components/visitors/VisitorCategoryView.tsx` | **`/visitors`, `/vendors`, `/interviews`, `/special-guests`, `/contractors`, `/deliveries`** | All 6 sidebar category pages share this single table component! Changing a table column or filter button here changes all 6 pages at once. To change only one page's heading, edit `src/app/vendors/page.tsx` (or the specific page file) instead. |
| `src/components/modals/CheckInModal.tsx` & `src/components/VisitInfoStep.tsx` & `src/components/VisitorStep.tsx` | **Operator `Register` tile, Admin `Add Visitor` button, Admin `Vendor` button, and Category page check-in buttons** | Editing a step heading or input label here updates the check-in wizard for both Operators and Admins. |
| `src/components/modals/CheckOutModal.tsx` | **Operator `Check Out Visitor` tile, Admin `Check Out` button, Dashboard `Currently Inside` table, Category tables** | Updates the checkout popup across all dashboards and tables. |
| `src/components/parcels/ParcelManagementView.tsx` | **`/parcels` sidebar page AND Operator Dashboard `Parcel Tracker` popup modal** | Editing tabs or buttons in `ParcelManagementView.tsx` updates both the full `/parcels` page and the Operator Dashboard modal. |
| `src/components/vip/VipGuestManagementView.tsx` | **`/vip-guests` sidebar page AND Operator Dashboard `VIP Guest` popup modal** | Editing VIP cards, forms, or buttons here updates both the `/vip-guests` page and the Operator Dashboard modal. |
| `src/components/auth/PasswordRecoveryPanel.tsx` | **Admin Login (`/admin`), Operator Login (`/login`), and Employee Portal (`/employee`)** | Editing the "Forgot Password" recovery panel updates all three portals. |
| `src/components/visitors/IdentityDocumentImagesCard.tsx` | **Person Details page (`/person/[id]`) AND `CheckStatusModal.tsx`** | Updates how CNIC, Driving Licence, and Delivery Document images are displayed in both places. |
| `src/app/globals.css` | **Entire Application** | Changing CSS variables, `@font-face`, or utility classes here affects every screen in GateShield. |
