'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

export type Language = 'ur' | 'en';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  toggleLanguage: () => void;
  t: (key: string, fallback?: string) => string;
}

const TRANSLATIONS: Record<string, Record<Language, string>> = {
  // App & Branding
  app_title: { en: 'GateShield', ur: 'گیٹ شیلڈ' },
  app_subtitle: { en: 'Enterprise Visitor & Gate Access Control System', ur: 'سیکیورٹی اور وزیٹر رسائی کنٹرول سسٹم' },

  // Gate Control
  active_gate: { en: 'Active Gate', ur: 'موجودہ گیٹ' },
  all_gates: { en: 'All Gates', ur: 'تمام گیٹس' },
  select_gate: { en: 'Select Gate', ur: 'گیٹ منتخب کریں' },
  switch_gate: { en: 'Switch Active Gate', ur: 'گیٹ تبدیل کریں' },
  no_gate_assigned: { en: 'No Gate Assigned', ur: 'کوئی گیٹ تفویض نہیں' },
  no_gate_assigned_desc: {
    en: 'No gate is assigned to your Operator account. Please contact an Administrator to assign a gate before checking in visitors.',
    ur: 'آپ کے آپریٹر اکاؤنٹ کو کوئی گیٹ تفویض نہیں کیا گیا۔ براہ کرم وزیٹرز کی انٹری سے پہلے ایڈمنسٹریٹر سے گیٹ تفویض کروائیں۔',
  },
  gate_control_dashboard: { en: 'Gate Control Dashboard', ur: 'گیٹ کنٹرول ڈیش بورڈ' },
  gate_control_subtitle: {
    en: 'Live visitor tracking, instant CNIC & Driving License OCR check-in, and security access logs.',
    ur: 'لائیو وزیٹر ٹریکنگ، شناختی کارڈ اور ڈرائیونگ لائسنس اندراج، اور سیکیورٹی لاگز۔',
  },

  // Main Action Tiles
  register_visitor: { en: 'Register', ur: 'رجسٹر کریں' },
  register_visitor_desc: { en: 'CNIC / DLS OCR Check-in', ur: 'شناختی کارڈ یا لائسنس اسکین' },
  checkout_visitor: { en: 'Check Out Visitor', ur: 'وزیٹر کی چھٹی کریں' },
  checkout_visitor_desc: { en: 'Scan QR or enter pass', ur: 'کیو آر کوڈ یا پاس سے باہر بھیجیں' },
  check_status: { en: 'Check Visitor Status', ur: 'وزیٹر کی تفصیل دیکھیں' },
  check_status_desc: { en: 'Search badge or phone', ur: 'نام، کارڈ یا فون سے تلاش کریں' },
  add_vendor: { en: 'Guest', ur: 'مہمان' },
  add_vendor_desc: { en: 'Invited guest check-in', ur: 'مدعو مہمان کی انٹری' },
  guest_option_title: { en: 'Guest', ur: 'مہمان' },
  guest_option_desc: { en: 'Invited guest check-in', ur: 'مدعو مہمان کی انٹری' },
  parcel_tracker_title: { en: 'Parcel Tracker', ur: 'پارسل ٹریکر' },
  parcel_tracker_desc: { en: 'Expected & received parcels', ur: 'متوقع اور موصول شدہ پارسل' },
  vip_guest_title: { en: 'VIP Guest', ur: 'وی آئی پی مہمان' },
  vip_guest_desc: { en: 'VIP arrival & vehicle check-in', ur: 'وی آئی پی آمد اور گاڑی چیک اِن' },

  // Action Buttons
  add_visitor_btn: { en: 'Add Visitor', ur: 'نیا وزیٹر' },
  checkout_btn: { en: 'Check Out', ur: 'چھٹی کریں' },
  status_btn: { en: 'Check Status', ur: 'تفصیل دیکھیں' },
  vendor_btn: { en: 'Vendor', ur: 'وینڈر' },
  view_pass: { en: 'View Pass', ur: 'پاس دیکھیں' },
  view_all: { en: 'View All', ur: 'سب دیکھیں' },
  close: { en: 'Close', ur: 'بند کریں' },
  retry: { en: 'Retry', ur: 'دوبارہ کوشش کریں' },

  // Dashboard KPI Statistics
  total_visitors_today: { en: 'Total Visitors Today', ur: 'آج کے کل وزیٹرز' },
  currently_inside: { en: 'Currently Inside', ur: 'اس وقت اندر موجود' },
  currently_inside_facility: { en: 'Currently Inside Facility', ur: 'عمارت کے اندر موجود افراد' },
  total_checkouts: { en: 'Total Check-Outs', ur: 'کل چھٹی (باہر گئے)' },
  overstay_alerts: { en: 'Overstay Alerts (>8h)', ur: 'وقت سے زیادہ اندر موجود (>8 گھنٹے)' },
  vendors: { en: 'Vendors', ur: 'وینڈرز' },
  interviews: { en: 'Interviews', ur: 'انٹرویو والے' },
  special_guests: { en: 'Guests', ur: 'مہمان' },
  contractors: { en: 'Contractors', ur: 'ٹھیکیدار / ورکرز' },
  deliveries: { en: 'Deliveries', ur: 'ڈلیوری والے' },
  live_indicator: { en: 'Live', ur: 'لائیو' },
  active_on_site: { en: 'Active on site', ur: 'گیٹ کے اندر موجود' },
  exited_premises: { en: 'Exited premises', ur: 'باہر جا چکے ہیں' },
  flagged_badges: { en: 'Flagged badges', ur: 'الرٹ کارڈز' },

  // Table Headers
  visitor: { en: 'Visitor', ur: 'وزیٹر کا نام' },
  category: { en: 'Category', ur: 'قسم' },
  host_and_dept: { en: 'Host & Department', ur: 'میزبان اور شعبہ' },
  card_badge: { en: 'Card / Badge', ur: 'پاس / کارڈ نمبر' },
  entry_time: { en: 'Entry Time', ur: 'داخلے کا وقت' },
  exit_time: { en: 'Exit Time', ur: 'باہر جانے کا وقت' },
  actions: { en: 'Action', ur: 'کارروائی' },
  status: { en: 'Status', ur: 'حالت' },

  // Currently Inside Section
  real_time_occupancy: { en: 'Real-time occupancy', ur: 'موجودہ تعداد' },
  no_visitors_inside: { en: 'No visitors currently inside the facility.', ur: 'اس وقت عمارت کے اندر کوئی وزیٹر موجود نہیں ہے۔' },
  recent_activity: { en: 'Recent Activity', ur: 'حالیہ نقل و حرکت' },
  no_activity_today: { en: 'No activity recorded today yet.', ur: 'آج کی کوئی سرگرمی ریکارڈ نہیں ہوئی۔' },

  // Header & Profile / Logout
  operator_profile: { en: 'Operator Profile', ur: 'آپریٹر پروفائل' },
  operator_number: { en: 'Operator ID', ur: 'آپریٹر نمبر' },
  role_operator: { en: 'Security Operator', ur: 'سیکیورٹی آپریٹر' },
  role_admin: { en: 'Administrator', ur: 'ایڈمنسٹریٹر' },
  logout: { en: 'Logout', ur: 'لاگ آؤٹ' },
  exit_checkpoint: { en: 'Exit', ur: 'چھٹی' },
  confirm_logout: { en: 'Are you sure you want to log out of the checkpoint?', ur: 'کیا آپ واقعی اس گیٹ سے لاگ آؤٹ کرنا چاہتے ہیں؟' },
  switch_theme: { en: 'Switch Theme', ur: 'تھیم تبدیل کریں' },
  switch_language: { en: 'Language', ur: 'زبان' },

  // Operator QR Login Screen & Scanner
  operator_login_title: { en: 'Operator Login', ur: 'آپریٹر لاگ ان' },
  operator_login_subtitle: {
    en: 'Scan your physical Operator Access Card to open your checkpoint dashboard',
    ur: 'ڈیش بورڈ کھولنے کے لیے اپنا آپریٹر کارڈ اسکین کریں',
  },
  auth_failed_title: { en: 'Authentication Failed', ur: 'لاگ ان نہیں ہو سکا' },
  auth_failed_default: {
    en: 'Login verification failed. Please scan your card again.',
    ur: 'آپریٹر کارڈ کی تصدیق نہیں ہو سکی۔ براہ کرم دوبارہ اسکین کریں۔',
  },
  scan_your_qr_code: { en: 'Scan Your QR Code', ur: 'اپنا کیو آر کارڈ اسکین کریں' },
  tap_to_open_camera: { en: 'Tap anywhere to open camera', ur: 'کیمرہ کھولنے کے لیے یہاں دبائیں' },
  instant_mobile_login: {
    en: 'Instant mobile login • No password required',
    ur: 'فوری موبائل لاگ ان • پاس ورڈ کی ضرورت نہیں',
  },
  login_footer: {
    en: 'GateShield • Checkpoint Access Control',
    ur: 'گیٹ شیلڈ • سیکیورٹی چیک پوائنٹ سسٹم',
  },
  starting_camera: { en: 'Starting Camera...', ur: 'کیمرہ کھل رہا ہے...' },
  qr_code_detected: { en: 'QR Code Detected', ur: 'کیو آر کوڈ اسکین ہو گیا' },
  verifying_credentials: {
    en: 'Verifying Operator Credentials...',
    ur: 'آپریٹر کارڈ کی تصدیق ہو رہی ہے...',
  },
  camera_access_error: { en: 'Camera Access Error', ur: 'کیمرہ چلنے میں مسئلہ' },
  camera_permission_denied: {
    en: 'Camera access denied. Please enable camera permission in your mobile browser.',
    ur: 'کیمرہ کی اجازت نہیں ملی۔ براہ کرم موبائل براؤزر میں کیمرہ آن کریں۔',
  },
  camera_unavailable: {
    en: 'Camera is currently unavailable. Ensure no other app is using it.',
    ur: 'کیمرہ دستیاب نہیں ہے۔ یقینی بنائیں کہ کوئی دوسری ایپ کیمرہ استعمال نہ کر رہی ہو۔',
  },
  retry_camera: { en: 'Retry Camera', ur: 'دوبارہ کیمرہ چلائیں' },
  position_qr_in_frame: {
    en: 'Position your Operator QR Card in the center frame',
    ur: 'اپنا آپریٹر کیو آر کارڈ درمیانی خانے کے سامنے رکھیں',
  },
  flip_camera: { en: 'Flip Camera', ur: 'کیمرہ تبدیل کریں' },
  cancel_scan: { en: 'Cancel Scan', ur: 'اسکین بند کریں' },
  theme_light: { en: 'Light', ur: 'لائٹ' },
  theme_dark: { en: 'Dark', ur: 'ڈارک' },
  visiting_host: { en: 'Visiting', ur: 'ملاقات:' },
  gate_label: { en: 'Gate', ur: 'گیٹ' },
  gate_prefix: { en: 'Gate', ur: 'گیٹ' },
  card_label: { en: 'Card', ur: 'کارڈ' },
  check_in_badge: { en: 'CHECK-IN', ur: 'انٹری' },
  check_out_badge: { en: 'CHECK-OUT', ur: 'چھٹی' },
  no_records_hint: {
    en: 'Try searching with a different visitor name, CNIC number, badge, or changing the status filter.',
    ur: 'کسی دوسرے نام، شناختی کارڈ نمبر، یا پاس نمبر سے تلاش کریں۔',
  },

  // Modals & Search
  search_placeholder: {
    en: 'Search by visitor name, CNIC, pass number, or phone...',
    ur: 'نام، شناختی کارڈ، پاس نمبر یا فون سے تلاش کریں...',
  },
  filter_all: { en: 'All', ur: 'تمام' },
  filter_inside: { en: 'Inside', ur: 'اندر موجود' },
  filter_checked_out: { en: 'Checked Out', ur: 'باہر گئے' },
  filter_overstay: { en: 'Overstay', ur: 'وقت سے زیادہ' },
  loading_records: { en: 'Loading records...', ur: 'ریکارڈز لوڈ ہو رہے ہیں...' },
  no_records_found: { en: 'No matching records found.', ur: 'کوئی ریکارڈ نہیں ملا۔' },
  total_records: { en: 'Total Records', ur: 'کل ریکارڈز' },
  showing: { en: 'Showing', ur: 'دکھا رہے ہیں' },
  page: { en: 'Page', ur: 'صفحہ' },
  previous: { en: 'Previous', ur: 'پچھلا' },
  next: { en: 'Next', ur: 'اگلا' },

  // ── Operator Registration Workflow (6 Steps + Final Success Screen) ──
  new_checkin_title: { en: 'New Check-In Registration', ur: 'نئی انٹری رجسٹریشن' },
  step_progress_label: { en: 'Step', ur: 'مرحلہ' },

  // Step Headings & Core Navigation Buttons (Exact Required Labels)
  select_category_title: { en: 'Select Visitor Category', ur: 'وزیٹر کی قسم منتخب کریں' },
  visit_info_title: { en: 'Visit Information', ur: 'وزٹ کی معلومات' },
  scan_id_card_title: { en: 'Scan ID Card', ur: 'شناختی کارڈ اسکین کریں' },
  scan_complete_status: { en: 'Scan Complete', ur: 'اسکین مکمل ہوگیا' },
  scan_complete_line: { en: '✓ Scan Complete', ur: '✓ اسکین مکمل ہوگیا' },
  review_scanned_details_title: { en: 'Review Scanned Details', ur: 'اسکین کی گئی معلومات دیکھیں' },
  capture_visitor_photo: { en: 'Capture Visitor Photo', ur: 'وزیٹر کی تصویر لیں' },
  registration_details_title: { en: 'Registration Details', ur: 'رجسٹریشن کی معلومات' },
  back_btn: { en: 'Back', ur: 'پیچھے جائیں' },
  continue_btn: { en: 'Continue', ur: 'جاری رکھیں' },
  submit_registration_btn: { en: 'Submit Registration', ur: 'رجسٹریشن مکمل کریں' },
  print_badge_btn: { en: 'Print Badge', ur: 'بیج پرنٹ کریں' },
  view_card_btn: { en: 'View Card', ur: 'کارڈ دیکھیں' },

  // Step 1: Select Visitor Category
  select_category_subtitle: {
    en: 'Tap a category card to continue automatically',
    ur: 'آگے بڑھنے کے لیے وزیٹر کی قسم پر ٹیپ کریں',
  },
  cat_visitor: { en: 'Visitor', ur: 'عام وزیٹر' },
  cat_vendor: { en: 'Vendor', ur: 'وینڈر / سپلائر' },
  cat_interview: { en: 'Interview', ur: 'انٹرویو امیدوار' },
  cat_special_guest: { en: 'Guest', ur: 'مہمان' },
  cat_parcel: { en: 'Parcel', ur: 'پارسل' },
  cat_contractor: { en: 'Contractor', ur: 'ٹھیکیدار / ورکر' },
  cat_delivery: { en: 'Delivery', ur: 'ڈلیوری / کوریئر' },

  // Step 2: Visit Information
  visit_info_subtitle: {
    en: 'Select who the visitor is meeting and their department',
    ur: 'میزبان کا نام اور شعبہ منتخب کریں',
  },
  meet_name_label: { en: 'Visitor to Meet', ur: 'کس سے ملنا ہے (میزبان کا نام)' },
  meet_name_placeholder: {
    en: 'Search or enter host name (e.g. Muhammad Asif)',
    ur: 'میزبان کا نام تلاش کریں یا لکھیں (مثلاً محمد آصف)',
  },
  department_label: { en: 'Department', ur: 'شعبہ (ڈیپارٹمنٹ)' },
  department_placeholder: {
    en: 'Or type another department...',
    ur: 'یا کوئی اور شعبہ یہاں لکھیں...',
  },
  missing_meet_name_hint: {
    en: 'Please enter or select Visitor to Meet',
    ur: 'براہ کرم میزبان کا نام منتخب کریں یا لکھیں',
  },
  missing_department_hint: {
    en: 'Please select a Department to continue',
    ur: 'آگے بڑھنے کے لیے شعبہ منتخب کریں',
  },
  dept_accounts: { en: 'Accounts', ur: 'اکاؤنٹس' },
  dept_production: { en: 'Production', ur: 'پروڈکشن' },
  dept_it: { en: 'IT', ur: 'آئی ٹی' },
  dept_admin: { en: 'Admin', ur: 'ایڈمن' },
  dept_operations: { en: 'Operations', ur: 'آپریشنز' },
  dept_procurement: { en: 'Procurement', ur: 'پروکیورمنٹ' },
  dept_supply_chain: { en: 'Supply Chain', ur: 'سپلائی چین' },
  dept_executive_office: { en: 'Executive Office', ur: 'ایگزیکٹو آفس' },
  dept_hr: { en: 'HR', ur: 'ایچ آر' },
  loading_departments: { en: 'Loading departments...', ur: 'شعبے لوڈ ہو رہے ہیں...' },
  no_departments_configured: {
    en: 'Departments have not been configured yet.',
    ur: 'ابھی تک کوئی شعبہ (ڈیپارٹمنٹ) شامل نہیں کیا گیا۔',
  },
  departments_load_error: {
    en: 'Unable to load departments. Please try again.',
    ur: 'شعبے لوڈ نہیں ہو سکے۔ براہ کرم دوبارہ کوشش کریں۔',
  },

  // Step 3: Scan ID Card
  choose_id_scan_title: {
    en: 'Scan ID Card',
    ur: 'شناختی کارڈ اسکین کریں',
  },
  choose_id_scan_subtitle: {
    en: 'Tap a card below to open the camera and scan the visitor ID',
    ur: 'کیمرہ کھولنے اور کارڈ اسکین کرنے کے لیے نیچے بٹن دبائیں',
  },
  scan_cnic_title: { en: 'Scan CNIC', ur: 'شناختی کارڈ اسکین کریں' },
  scan_cnic_subtitle: {
    en: 'Pakistani Smart Card or NADRA CNIC',
    ur: 'پاکستانی شناختی کارڈ کی تصویر لیں',
  },
  scan_dls_title: { en: 'Scan Driving Licence', ur: 'ڈرائیونگ لائسنس اسکین کریں' },
  scan_dls_subtitle: {
    en: 'Driving Licence Card',
    ur: 'ڈرائیونگ لائسنس کی تصویر لیں',
  },
  ocr_scanning_title: { en: 'Reading Card Details...', ur: 'کارڈ پڑھا جا رہا ہے...' },
  ocr_scanning_subtitle: {
    en: 'Please wait a moment while OCR extracts the information',
    ur: 'براہ کرم انتظار کریں، کارڈ سے معلومات نکالی جا رہی ہیں',
  },
  scan_failed_title: {
    en: 'Scan failed. Please scan again.',
    ur: 'اسکین نہیں ہوا، دوبارہ اسکین کریں۔',
  },
  scan_failed_subtitle: {
    en: 'No readable ID details could be extracted. Please retry with the camera or upload a clearer image.',
    ur: 'کارڈ سے قابلِ مطالعہ معلومات حاصل نہیں ہو سکیں۔ براہ کرم کیمرے سے دوبارہ کوشش کریں یا واضح تصویر اپ لوڈ کریں۔',
  },
  scan_service_error_subtitle: {
    en: 'Unable to connect to the OCR scanning service. Please try scanning again or upload an image.',
    ur: 'اسکیننگ سروس سے رابطہ نہیں ہو سکا۔ براہ کرم دوبارہ کوشش کریں یا تصویر اپ لوڈ کریں۔',
  },
  scan_again_btn: { en: 'Scan Again', ur: 'دوبارہ اسکین کریں' },
  upload_id_image_btn: { en: 'Upload Image', ur: 'تصویر اپ لوڈ کریں' },

  // Step 4: Review Scanned Details
  scan_success_badge: { en: '✓ Scan Complete', ur: '✓ اسکین مکمل ہوگیا' },
  rescan_card_btn: { en: 'Rescan Card', ur: 'دوبارہ اسکین کریں' },
  extracted_cnic_title: { en: 'Extracted CNIC Information', ur: 'شناختی کارڈ کی معلومات' },
  extracted_dls_title: { en: 'Driving Licence Information', ur: 'ڈرائیونگ لائسنس کی معلومات' },
  field_full_name: { en: 'Full Name', ur: 'پورا نام' },
  field_father_husband_name: { en: 'Father / Husband Name', ur: 'والد / شوہر کا نام' },
  field_cnic_number: { en: 'CNIC Number', ur: 'شناختی کارڈ نمبر' },
  field_gender: { en: 'Gender', ur: 'جنس' },
  field_gender_select: { en: 'Select Gender', ur: 'جنس منتخب کریں' },
  field_gender_male: { en: 'Male', ur: 'مرد (Male)' },
  field_gender_female: { en: 'Female', ur: 'خاتون (Female)' },
  field_dob: { en: 'Date of Birth', ur: 'تاریخ پیدائش' },
  field_issue_date: { en: 'Date of Issue', ur: 'تاریخ اجراء' },
  field_expiry_date: { en: 'Date of Expiry', ur: 'تاریخ تنسیخ' },
  field_identification: { en: 'Identification Mark', ur: 'شناختی علامت' },
  field_license_no: { en: 'Licence Number', ur: 'لائسنس نمبر' },
  field_license_category: { en: 'Vehicle Category', ur: 'گاڑی کی قسم' },
  field_valid_upto: { en: 'Valid Upto', ur: 'میعاد ختم ہونے کی تاریخ' },
  field_licensing_authority: { en: 'Licensing Authority', ur: 'جاری کرنے والا ادارہ' },

  // Step 5: Capture Visitor Photo
  host_summary_label: { en: 'Visitor to Meet', ur: 'میزبان' },
  dept_label: { en: 'Dept', ur: 'شعبہ' },
  cnic_title: { en: 'Pakistani CNIC', ur: 'شناختی کارڈ' },
  dls_title: { en: 'Driving Licence', ur: 'ڈرائیونگ لائسنس' },
  visitor_photo_title: { en: 'Capture Visitor Photo', ur: 'وزیٹر کی تصویر لیں' },
  capture_visitor_photo_sub: {
    en: 'Tap below to open camera and take a clear photo of the visitor',
    ur: 'کیمرہ کھولنے اور وزیٹر کی صاف تصویر لینے کے لیے یہاں دبائیں',
  },
  photo_required_badge: { en: 'Required', ur: 'ضروری ہے' },
  photo_attached_badge: { en: 'Photo Attached ✓', ur: 'تصویر لگ گئی ✓' },
  capture_photo_btn: { en: 'Capture Photo', ur: 'تصویر لیں' },
  retake_photo_btn: { en: 'Retake Photo', ur: 'دوبارہ تصویر لیں' },
  photo_confirmed_title: { en: 'Visitor Photo Captured', ur: 'وزیٹر کی تصویر محفوظ ہو گئی' },

  // Step 6: Registration Details
  phone_number_label: { en: 'Phone Number', ur: 'موبائل فون نمبر' },
  phone_number_hint: {
    en: '11-digit mobile number starting with 03 (e.g. 03001234567)',
    ur: '03 سے شروع ہونے والا 11 ہندسوں کا نمبر لکھیں (مثلاً 03001234567)',
  },
  phone_number_error: {
    en: 'Please enter a valid 11-digit mobile number starting with 03.',
    ur: 'براہ کرم 03 سے شروع ہونے والا مکمل 11 ہندسوں کا نمبر درج کریں۔',
  },
  visitor_card_no_label: { en: 'Visitor Card Number', ur: 'وزیٹر کارڈ نمبر' },
  visitor_card_no_hint: {
    en: 'Enter the physical card number handed to the visitor (e.g. VC-12)',
    ur: 'وزیٹر کو دیے جانے والے کارڈ پر لکھا ہوا نمبر درج کریں (مثلاً VC-12)',
  },
  visitor_card_no_placeholder: { en: 'e.g. VC-12 or 104', ur: 'مثلاً VC-12 یا 104' },
  visitor_card_already_assigned: {
    en: 'This card is already assigned. Please choose another available card.',
    ur: 'یہ کارڈ پہلے سے استعمال میں ہے، دوسرا دستیاب کارڈ منتخب کریں۔',
  },
  visitor_card_available_badge: {
    en: 'Assigned Physical Card:',
    ur: 'جاری کردہ کارڈ نمبر:',
  },
  carrying_items_title: { en: 'Carrying Items', ur: 'ساتھ لایا گیا سامان' },
  optional_badge: { en: 'Optional', ur: 'اختیاری' },
  carrying_items_subtitle: {
    en: 'Turn on if the visitor has a laptop, bag, or tools',
    ur: 'اگر وزیٹر کے پاس لیپ ٹاپ، بیگ یا اوزار ہیں تو آن کریں',
  },
  list_carried_items_label: {
    en: 'List Carried Items',
    ur: 'سامان کی تفصیل لکھیں',
  },
  carried_items_placeholder: {
    en: 'e.g. Laptop, Backpack, Tool Kit',
    ur: 'مثلاً لیپ ٹاپ، بیگ، ٹول کٹ',
  },
  submitting_btn: { en: 'Submitting...', ur: 'محفوظ ہو رہا ہے...' },
  submitted_btn: { en: 'Submitted ✓', ur: 'مکمل ہو گیا ✓' },
  try_again_btn: { en: 'Try Again', ur: 'دوبارہ کوشش کریں' },

  // Step 7: Final Registration Success Screen & Checkout Notice
  reg_success_title: {
    en: 'Registration Successful',
    ur: 'وزیٹر رجسٹریشن مکمل ہو گئی',
  },
  reg_success_subtitle: {
    en: 'Visitor entry is registered. Hand over the physical card and print the badge.',
    ur: 'وزیٹر کا اندراج ہو گیا ہے۔ کارڈ حوالے کریں اور بیج پرنٹ کریں۔',
  },
  reg_visitor_name: { en: 'Visitor Name', ur: 'وزیٹر کا نام' },
  reg_card_badge_no: { en: 'Visitor Card #', ur: 'وزیٹر کارڈ نمبر' },
  reg_visit_to: { en: 'Visit To', ur: 'ملاقات' },
  reg_entry_gate: { en: 'Entry Gate', ur: 'انٹری گیٹ' },
  register_next_visitor_btn: { en: 'Register Next Visitor', ur: 'اگلا وزیٹر درج کریں' },
  collect_physical_card_label: {
    en: 'Collect Physical Visitor Card:',
    ur: 'وزیٹر سے یہ کارڈ واپس لیں:',
  },

  // ── Identity Document Images (CNIC / Driving Licence) ──
  identity_documents_title: {
    en: 'Scanned ID Card Images',
    ur: 'اسکین شدہ شناختی کارڈ کی تصاویر',
  },
  cnic_image_label: {
    en: 'CNIC Image',
    ur: 'شناختی کارڈ کی تصویر',
  },
  dls_image_label: {
    en: 'Driving Licence Image',
    ur: 'ڈرائیونگ لائسنس کی تصویر',
  },
  image_not_available: {
    en: 'Image not available',
    ur: 'تصویر دستیاب نہیں ہے',
  },
  image_load_error: {
    en: 'Could not load document image',
    ur: 'تصویر لوڈ نہیں ہو سکی',
  },
  retry_load_image_btn: {
    en: 'Retry',
    ur: 'دوبارہ لوڈ کریں',
  },
  view_full_image: {
    en: 'Tap to enlarge',
    ur: 'بڑا کرنے کے لیے ٹیپ کریں',
  },
  image_save_failed_warning: {
    en: 'Visitor registered, but saving the scanned ID card image failed.',
    ur: 'وزیٹر رجسٹر ہو گیا، لیکن شناختی کارڈ کی تصویر محفوظ نہیں ہو سکی۔',
  },
  retry_save_image_btn: {
    en: 'Retry Saving ID Image',
    ur: 'تصویر دوبارہ محفوظ کریں',
  },
  saving_id_image: {
    en: 'Saving ID image...',
    ur: 'تصویر محفوظ کی جا رہی ہے...',
  },
  id_image_saved_badge: {
    en: 'ID Card Image Saved ✓',
    ur: 'شناختی کارڈ کی تصویر محفوظ ہو گئی ✓',
  },
  view_person_details_btn: {
    en: 'View Person Details',
    ur: 'مکمل معلومات دیکھیں',
  },

  // ── Operator Interaction Sounds ──
  sound_on: {
    en: 'Interaction Sounds: On',
    ur: 'آوازیں: آن',
  },
  sound_off: {
    en: 'Interaction Sounds: Off',
    ur: 'آوازیں: آف',
  },
  sound_toggle_short: {
    en: 'Sounds',
    ur: 'آواز',
  },

  // ── Branded Loading Messages ──
  loading_gatekeeper: {
    en: 'Loading GateShield...',
    ur: 'گیٹ شیلڈ لوڈ ہو رہا ہے...',
  },
  loading_dashboard: {
    en: 'Loading dashboard...',
    ur: 'ڈیش بورڈ لوڈ ہو رہا ہے...',
  },
  loading_person_details: {
    en: 'Loading person details...',
    ur: 'معلومات لوڈ ہو رہی ہیں...',
  },
  slow_operation_hint: {
    en: 'Still working, please wait a moment...',
    ur: 'کارروائی جاری ہے، براہ کرم تھوڑا انتظار کریں...',
  },

  // ── Employee Portal & Shared Guest Invitation System ──
  emp_portal_title: {
    en: 'Employee Guest Portal',
    ur: 'ایمپلائی گیسٹ پورٹل',
  },
  emp_portal_subtitle: {
    en: 'Invite guests and view your visited guest history',
    ur: 'مہمانوں کو مدعو کریں اور اپنے مہمانوں کا ریکارڈ دیکھیں',
  },
  emp_sign_in_tab: {
    en: 'Employee Sign In',
    ur: 'ایمپلائی لاگ اِن',
  },
  emp_register_tab: {
    en: 'First-Time Registration',
    ur: 'نئی ایمپلائی رجسٹریشن',
  },
  emp_full_name: {
    en: 'Full Name',
    ur: 'مکمل نام',
  },
  emp_department: {
    en: 'Department',
    ur: 'شعبہ',
  },
  emp_position: {
    en: 'Position / Designation',
    ur: 'عہدہ',
  },
  emp_phone: {
    en: 'Phone Number',
    ur: 'فون نمبر',
  },
  emp_email: {
    en: 'Email Address',
    ur: 'ای میل ایڈریس',
  },
  emp_password: {
    en: 'Password',
    ur: 'پاس ورڈ',
  },
  emp_confirm_password: {
    en: 'Confirm Password',
    ur: 'پاس ورڈ کی تصدیق کریں',
  },
  emp_submit_registration: {
    en: 'Submit Registration Request',
    ur: 'رجسٹریشن کی درخواست جمع کریں',
  },
  emp_status_pending_title: {
    en: 'Registration Pending Approval',
    ur: 'رجسٹریشن کی منظوری زیرِ التواء ہے',
  },
  emp_status_pending_desc: {
    en: 'Your employee account request has been received. This screen updates automatically as soon as an administrator approves your request.',
    ur: 'آپ کی درخواست موصول ہو گئی ہے۔ ایڈمن کی منظوری ملتے ہی یہ اسکرین خودکار طور پر اپ ڈیٹ ہو جائے گی۔',
  },
  emp_status_rejected_title: {
    en: 'Registration Request Not Approved',
    ur: 'رجسٹریشن کی درخواست منظور نہیں ہوئی',
  },
  emp_status_rejected_desc: {
    en: 'Your employee registration request was not approved by the administrator.',
    ur: 'آپ کی ایمپلائی رجسٹریشن کی درخواست ایڈمن کی جانب سے منظور نہیں کی گئی۔',
  },
  emp_status_approved_banner: {
    en: 'Your account has been approved! Entering Employee Dashboard...',
    ur: 'آپ کا اکاؤنٹ منظور ہو گیا ہے! ایمپلائی ڈیش بورڈ کھولا جا رہا ہے...',
  },
  emp_action_invite_guest: {
    en: 'Invite Guest',
    ur: 'مہمان کو مدعو کریں',
  },
  emp_action_invite_guest_desc: {
    en: 'Pre-register an upcoming guest for gate check-in',
    ur: 'گیٹ چیک اِن کے لیے آنے والے مہمان کا اندراج کریں',
  },
  emp_action_visited_guests: {
    en: 'Visited Guests',
    ur: 'آنے والے مہمانوں کا ریکارڈ',
  },
  emp_action_visited_guests_desc: {
    en: 'View your invited and visited guest history and re-invite returning guests',
    ur: 'اپنے مدعو کردہ مہمانوں کی آمد و اخراج کا ریکارڈ دیکھیں اور دوبارہ مدعو کریں',
  },
  emp_guest_name: {
    en: 'Guest Name',
    ur: 'مہمان کا نام',
  },
  emp_guest_phone: {
    en: 'Guest Phone Number',
    ur: 'مہمان کا فون نمبر',
  },
  emp_guest_card_no: {
    en: 'VC Card No.',
    ur: 'وزیٹر کارڈ نمبر',
  },
  emp_guest_cnic: {
    en: 'CNIC',
    ur: 'شناختی کارڈ نمبر',
  },
  emp_guest_cnic_optional: {
    en: 'CNIC',
    ur: 'شناختی کارڈ نمبر',
  },
  emp_guest_photo: {
    en: 'Guest Photo',
    ur: 'مہمان کی تصویر',
  },
  emp_guest_photo_optional: {
    en: 'Guest Photo',
    ur: 'مہمان کی تصویر',
  },
  emp_visit_date: {
    en: 'Visit Date',
    ur: 'ملاقات کی تاریخ',
  },
  emp_expected_arrival: {
    en: 'Arrival Time',
    ur: 'آمد کا وقت',
  },
  emp_expected_window: {
    en: 'Arrival Time',
    ur: 'آمد کا وقت',
  },
  estimated_arrival_slot: {
    en: 'Arrival Time',
    ur: 'آمد کا وقت',
  },
  visit_duration_label: {
    en: 'Visit Duration',
    ur: 'ملاقات کا دورانیہ',
  },
  emp_create_invitation_btn: {
    en: 'Send Guest Invitation',
    ur: 'دعوت نامہ بھیجیں',
  },
  emp_reinvite_btn: {
    en: 'Re-invite',
    ur: 'دوبارہ مدعو کریں',
  },
  emp_arrival_notifications: {
    en: 'Guest Arrival Notifications',
    ur: 'مہمانوں کی آمد کی اطلاعات',
  },

  // ── Operator Shared Guests / Invited Guests ──
  upcoming_guests_title: {
    en: 'Guest List',
    ur: 'مہمانوں کی فہرست',
  },
  upcoming_guests_subtitle: {
    en: 'Select an invited guest and assign a VC Card No. to complete check-in',
    ur: 'مہمان منتخب کریں اور کارڈ نمبر دے کر چیک اِن مکمل کریں',
  },
  upcoming_guests_btn: {
    en: 'Guest',
    ur: 'مہمان',
  },
  upcoming_guests_search_placeholder: {
    en: 'Search by guest name or inviting employee...',
    ur: 'مہمان یا میزبان کے نام سے تلاش کریں...',
  },
  special_guest_search_placeholder: {
    en: 'Search by guest name or inviting employee...',
    ur: 'مہمان یا میزبان کے نام سے تلاش کریں...',
  },
  upcoming_guests_empty: {
    en: 'No pending guest invitations right now.',
    ur: 'اس وقت کوئی متوقع مہمان زیرِ التواء نہیں ہے۔',
  },
  invited_by_host: {
    en: 'Inviting Employee',
    ur: 'میزبان',
  },
  inviting_employee_label: {
    en: 'Inviting Employee',
    ur: 'میزبان',
  },
  expected_schedule: {
    en: 'Arrival Time',
    ur: 'آمد کا وقت',
  },
  enter_vc_card_no: {
    en: 'VC Card No.',
    ur: 'وزیٹر کارڈ نمبر',
  },
  enter_vc_card_hint: {
    en: 'Assign an available physical visitor card to complete check-in',
    ur: 'چیک اِن مکمل کرنے کے لیے دستیاب وزیٹر کارڈ نمبر درج کریں',
  },
  not_provided_optional: {
    en: 'Not provided',
    ur: 'فراہم نہیں کیا گیا',
  },
  select_guest_btn: {
    en: 'Select & Assign Card',
    ur: 'منتخب کریں اور کارڈ دیں',
  },
  verify_and_checkin_btn: {
    en: 'Select & Assign Card',
    ur: 'منتخب کریں اور کارڈ دیں',
  },
  confirm_guest_checkin_title: {
    en: 'Guest Details & Card Assignment',
    ur: 'مہمان کی تفصیل اور کارڈ اجرا',
  },
  new_guest_invitation_alert: {
    en: 'New Guest Invitation',
    ur: 'نئے مہمان کا دعوت نامہ',
  },
  along_with_label: {
    en: 'Along With',
    ur: 'ہمراہ افراد',
  },
  along_with_placeholder: {
    en: 'Accompanying persons (if any)',
    ur: 'ہمراہ آنے والے افراد (اگر کوئی ہوں)',
  },

  // ── Sidebar Navigation & Admin Menu ──
  nav_dashboard: { en: 'Dashboard', ur: 'ڈیش بورڈ' },
  nav_visitors: { en: 'Visitors & Logs', ur: 'وزیٹرز اور ریکارڈز' },
  nav_guest: { en: 'Guest', ur: 'مہمان' },
  nav_parcel_tracker: { en: 'Parcel Tracker', ur: 'پارسل ٹریکر' },
  nav_vip_guest: { en: 'VIP Guest', ur: 'وی آئی پی مہمان' },
  nav_operators: { en: 'Operators', ur: 'آپریٹرز' },
  nav_employees: { en: 'Employees', ur: 'ملازمین' },
  nav_departments: { en: 'Departments', ur: 'شعبے' },
  nav_gates: { en: 'Gates & Checkpoints', ur: 'گیٹس اور چیک پوائنٹس' },
  nav_reports: { en: 'Reports & Export', ur: 'رپورٹس اور ایکسپورٹ' },
  nav_audit_logs: { en: 'Audit Logs', ur: 'آڈٹ لاگز' },
  nav_settings: { en: 'System Settings', ur: 'سسٹم سیٹنگز' },
  nav_Administration: { en: 'Administration', ur: 'ایڈمنسٹریشن' },

  // ── Notifications ──
  notifications_title: { en: 'Notifications', ur: 'اطلاعات' },
  mark_all_read: { en: 'Mark all read', ur: 'سب پڑھی ہوئی کریں' },
  no_notifications: { en: 'No notifications yet', ur: 'ابھی کوئی اطلاع نہیں ہے' },
  new_badge: { en: 'New', ur: 'نئی' },
  pending_operator_requests: { en: 'Operator Requests', ur: 'آپریٹر درخواستیں' },
  pending_employee_requests: { en: 'Employee Requests', ur: 'ملازمین کی درخواستیں' },

  // ── Parcel Management & Unexpected Parcel Form ──
  parcel_management_title: { en: 'Parcel Tracker', ur: 'پارسل ٹریکر' },
  register_unexpected_parcel: { en: 'Unexpected Parcel', ur: 'غیر متوقع پارسل' },
  unexpected_parcel_title: { en: 'Unexpected Parcel', ur: 'غیر متوقع پارسل' },
  parcel_tab_expected_short: { en: 'Expected', ur: 'متوقع' },
  parcel_tab_received_short: { en: 'Received', ur: 'موصول' },
  parcel_tab_delivered_short: { en: 'Delivered', ur: 'حوالے' },
  parcel_tab_all_short: { en: 'History', ur: 'ریکارڈ' },
  employee_label: { en: 'Employee', ur: 'ملازم' },
  select_employee_placeholder: { en: 'Select Employee', ur: 'ملازم منتخب کریں' },
  search_employee_placeholder: { en: 'Search employee name...', ur: 'ملازم کا نام تلاش کریں...' },
  parcel_sender_name_label: { en: 'Parcel Sender Name', ur: 'پارسل بھیجنے والے کا نام' },
  parcel_sender_name_placeholder: { en: 'Enter parcel sender name', ur: 'پارسل بھیجنے والے کا نام درج کریں' },
  parcel_sender_phone_label: { en: 'Parcel Sender Phone Number', ur: 'پارسل بھیجنے والے کا فون نمبر' },
  parcel_sender_phone_placeholder: { en: 'e.g. 03001234567', ur: 'مثلاً 03001234567' },
  employee_name_label: { en: 'Employee Name', ur: 'ملازم کا نام' },
  employee_name_placeholder: { en: 'Enter employee name', ur: 'ملازم کا نام درج کریں' },
  employee_phone_label: { en: 'Employee Phone Number', ur: 'ملازم کا فون نمبر' },
  employee_phone_placeholder: { en: 'e.g. 03001234567', ur: 'مثلاً 03001234567' },
  employee_department_label: { en: 'Employee Department', ur: 'ملازم کا شعبہ (ڈیپارٹمنٹ)' },
  select_department_placeholder: { en: 'Select Department', ur: 'شعبہ منتخب کریں' },
  no_departments_available: {
    en: 'No departments available. Please configure departments in the Admin Panel.',
    ur: 'کوئی شعبہ دستیاب نہیں ہے۔ براہ کرم ایڈمن پینل میں شعبے شامل کریں۔',
  },
  parcel_from_label: { en: 'Parcel From', ur: 'پارسل کا ذریعہ (Parcel From)' },
  select_parcel_from: { en: 'Select Sender', ur: 'بھیجنے والا منتخب کریں' },
  other_sender_label: { en: 'Sender Name', ur: 'بھیجنے والے کا نام' },
  other_sender_placeholder: { en: 'Enter sender name', ur: 'بھیجنے والے کا نام لکھیں' },
  parcel_photo_label: { en: 'Parcel Photo', ur: 'پارسل کی تصویر' },
  open_camera_btn: { en: 'Open Camera', ur: 'کیمرہ کھولیں' },
  capture_parcel_photo_btn: { en: 'Capture Photo', ur: 'تصویر لیں' },
  receive_parcel_btn: { en: 'Receive Parcel', ur: 'پارسل وصول کریں' },
  deliver_parcel_btn: { en: 'Mark Delivered', ur: 'حوالے کریں (ڈیلیور)' },
  expected_parcels_tab: { en: 'Expected', ur: 'متوقع پارسل' },
  received_parcels_tab: { en: 'Received at Gate', ur: 'گیٹ پر موصول' },
  delivered_parcels_tab: { en: 'Delivered', ur: 'حوالے شدہ' },
  all_parcels_tab: { en: 'All Parcels', ur: 'تمام پارسل' },
  source_expected: { en: 'Expected', ur: 'متوقع' },
  source_unexpected: { en: 'Unexpected', ur: 'غیر متوقع' },
  status_expected: { en: 'Expected', ur: 'متوقع' },
  status_received: { en: 'Received', ur: 'موصول شدہ' },
  status_delivered: { en: 'Delivered', ur: 'حوالے شدہ' },
  arrival_date_label: { en: 'Arrival Date', ur: 'آمد کی تاریخ' },
  receiving_gate_label: { en: 'Receiving Gate', ur: 'وصولی کا گیٹ' },
  delivery_gate_label: { en: 'Delivery Gate', ur: 'حوالگی کا گیٹ' },
  notes_label: { en: 'Notes', ur: 'نوٹس' },
  notes_placeholder: { en: 'Additional details', ur: 'مزید تفصیل' },
  add_parcel_reminder_title: { en: 'Add Parcel Reminder', ur: 'پارسل ریمائنڈر شامل کریں' },
  save_parcel_reminder_btn: { en: 'Save Parcel Reminder', ur: 'پارسل ریمائنڈر محفوظ کریں' },
  arrived_parcels_title: { en: 'Arrived Parcels', ur: 'موصول شدہ پارسل' },
  my_parcel_reminders_title: { en: 'Expected Reminders', ur: 'متوقع پارسل ریمائنڈرز' },

  // ── VIP Guest List & Management ──
  vip_guest_list_title: { en: 'VIP Guest List', ur: 'وی آئی پی مہمانوں کی فہرست' },
  add_vip_guest_btn: { en: 'Add VIP Guest', ur: 'نیا وی آئی پی مہمان' },
  edit_vip_guest_title: { en: 'Edit VIP Guest', ur: 'وی آئی پی مہمان میں ترمیم' },
  new_vip_guest_title: { en: 'Add VIP Guest', ur: 'نیا وی آئی پی مہمان شامل کریں' },
  vip_name_label: { en: 'VIP Name', ur: 'وی آئی پی مہمان کا نام' },
  vip_designation_label: { en: 'Designation', ur: 'عہدہ' },
  vip_vehicle_label: { en: 'Vehicle Number', ur: 'گاڑی کا نمبر' },
  vip_planned_arrival_label: { en: 'Planned Arrival Time', ur: 'آمد کا مقررہ وقت' },
  vip_search_placeholder: {
    en: 'Search by VIP name, vehicle number, or designation...',
    ur: 'نام، گاڑی نمبر، یا عہدے سے تلاش کریں...',
  },
  vip_status_upcoming: { en: 'Upcoming', ur: 'متوقع آمد' },
  vip_status_checked_in: { en: 'Inside', ur: 'اندر موجود' },
  vip_status_checked_out: { en: 'Checked Out', ur: 'باہر گئے' },
  vip_checkin_btn: { en: 'Check In VIP', ur: 'چیک اِن کریں' },
  vip_checkout_btn: { en: 'Check Out VIP', ur: 'چیک آؤٹ کریں' },
  save_vip_btn: { en: 'Save VIP Guest', ur: 'وی آئی پی محفوظ کریں' },
  update_vip_btn: { en: 'Update VIP Guest', ur: 'وی آئی پی اپ ڈیٹ کریں' },
  cancel_btn: { en: 'Cancel', ur: 'منسوخ کریں' },
  no_vip_found: { en: 'No VIP guests found.', ur: 'کوئی وی آئی پی مہمان نہیں ملا۔' },

  // ── Operator Login Screen (QR & Email/Password Screens) ──
  login_with_email_link: { en: 'Login with Email', ur: 'ای میل کے ذریعے لاگ ان کریں' },
  login_with_qr_link: { en: 'Login with QR Code', ur: 'کیو آر کوڈ کے ذریعے لاگ ان کریں' },
  operator_email_login_subtitle: {
    en: 'Sign in using your approved Operator email and password',
    ur: 'اپنے منظور شدہ آپریٹر ای میل اور پاس ورڈ کے ذریعے لاگ ان کریں',
  },
  operator_email_label: { en: 'Operator Email', ur: 'آپریٹر ای میل' },
  operator_password_label: { en: 'Password', ur: 'پاس ورڈ' },
  operator_password_placeholder: { en: 'Enter your password', ur: 'اپنا پاس ورڈ درج کریں' },
  signing_in_btn: { en: 'Signing in...', ur: 'لاگ ان ہو رہا ہے...' },
  login_to_operator_dashboard_btn: {
    en: 'Login to Operator Dashboard',
    ur: 'آپریٹر ڈیش بورڈ میں لاگ ان کریں',
  },
  no_operator_account_prompt: {
    en: "Don't have an Operator account yet?",
    ur: 'کیا آپ کا آپریٹر اکاؤنٹ ابھی نہیں بنا؟',
  },
  register_as_operator_btn: { en: 'Register as Operator', ur: 'بطور آپریٹر رجسٹر کریں' },
  register_operator_subtitle: {
    en: 'Submit your operator account request for Administrator approval',
    ur: 'ایڈمن کی منظوری کے لیے اپنے آپریٹر اکاؤنٹ کی درخواست جمع کروائیں',
  },
  operator_request_status_title: {
    en: 'Operator Request Status',
    ur: 'آپریٹر درخواست کی حیثیت',
  },
  operator_request_status_subtitle: {
    en: 'Live status of your Operator registration request',
    ur: 'آپ کی آپریٹر رجسٹریشن درخواست کی موجودہ صورتحال',
  },
  operator_name_label: { en: 'Operator Name', ur: 'آپریٹر کا نام' },
  operator_name_placeholder: {
    en: 'Full Name (e.g. Officer Bilal)',
    ur: 'پورا نام (مثلاً آفیسر بلال)',
  },
  email_address_label: { en: 'Email Address', ur: 'ای میل ایڈریس' },
  confirm_password_label: { en: 'Confirm Password', ur: 'پاس ورڈ کی تصدیق کریں' },
  min_6_chars_placeholder: { en: 'Min 6 chars', ur: 'کم از کم 6 حروف' },
  reenter_password_placeholder: { en: 'Re-enter password', ur: 'پاس ورڈ دوبارہ درج کریں' },
  submitting_request_btn: { en: 'Submitting Request...', ur: 'درخواست جمع ہو رہی ہے...' },
  submit_registration_request_btn: {
    en: 'Submit Registration Request',
    ur: 'رجسٹریشن کی درخواست جمع کروائیں',
  },
  back_to_login_btn: { en: 'Back to Login', ur: 'واپس لاگ ان پر جائیں' },

  // Delivery Registration Workflow
  delivery_source_title: {
    en: 'Delivery Source / Company Name',
    ur: 'ڈلیوری سورس / کمپنی کا نام',
  },
  delivery_source_subtitle: {
    en: 'Enter the name of the cargo company, courier service, or source from which the delivery arrived',
    ur: 'اس کارگو کمپنی، کوریئر سروس یا ادارے کا نام درج کریں جہاں سے ڈلیوری آئی ہے',
  },
  delivery_source_label: {
    en: 'Delivery Source / Company Name',
    ur: 'ڈلیوری سورس / کمپنی کا نام',
  },
  delivery_source_placeholder: {
    en: 'e.g. TCS, DHL, Leopards, Daraz, Supplier Name',
    ur: 'مثلاً ٹی سی ایس، ڈی ایچ ایل، لیپرڈز، دراز یا کمپنی کا نام',
  },
  delivery_source_required_hint: {
    en: 'Please enter Delivery Source / Company Name to continue',
    ur: 'آگے بڑھنے کے لیے ڈلیوری سورس / کمپنی کا نام درج کریں',
  },
  capture_image_title: {
    en: 'Capture Image',
    ur: 'تصویر لیں',
  },
  capture_image_optional_sub: {
    en: 'Capture a photo of the delivery person (optional) or tap Next to continue',
    ur: 'ڈلیوری لانے والے شخص کی تصویر لیں (اختیاری) یا آگے بڑھنے کے لیے اگلا بٹن دبائیں',
  },
  capture_document_title: {
    en: 'Capture Document',
    ur: 'ڈلیوری دستاویز کی تصویر لیں',
  },
  capture_document_subtitle: {
    en: 'Capture a clear picture of the delivery slip, parcel receipt, or document provided by the delivery person',
    ur: 'ڈلیوری والے شخص کی فراہم کردہ ڈلیوری سلپ، رسید یا دستاویز کی صاف تصویر لیں',
  },
  capture_document_btn: {
    en: 'Capture Document',
    ur: 'دستاویز کی تصویر لیں',
  },
  retake_document_btn: {
    en: 'Retake Document',
    ur: 'دوبارہ تصویر لیں',
  },
  document_captured_title: {
    en: 'Delivery Document Captured',
    ur: 'ڈلیوری دستاویز کی تصویر محفوظ ہو گئی',
  },
  document_attached_badge: {
    en: 'Document Attached ✓',
    ur: 'دستاویز منسلک ✓',
  },
  delivery_document_required_hint: {
    en: 'Please capture the delivery document image to continue',
    ur: 'آگے بڑھنے کے لیے ڈلیوری دستاویز کی تصویر لینا ضروری ہے',
  },
  delivery_document_image_label: {
    en: 'Delivery Document Image',
    ur: 'ڈلیوری دستاویز کی تصویر',
  },
  incoming_delivery_doc_label: {
    en: 'Incoming Delivery Document (Check-in)',
    ur: 'آمد کی ڈلیوری دستاویز (چیک اِن)',
  },
  outgoing_delivery_doc_label: {
    en: 'Outgoing Delivery Document (Checkout)',
    ur: 'اخراج کی ڈلیوری دستاویز (چیک آؤٹ)',
  },
  captured_at_checkin_label: {
    en: 'Captured at Check-in',
    ur: 'چیک اِن کے وقت محفوظ کردہ',
  },
  captured_at_checkout_label: {
    en: 'Captured at Checkout',
    ur: 'چیک آؤٹ کے وقت محفوظ کردہ',
  },
  next_btn: {
    en: 'Next',
    ur: 'اگلا',
  },
  phone_and_vc_title: {
    en: 'Phone Number & VC Card Number',
    ur: 'فون نمبر اور وزیٹر کارڈ نمبر',
  },
  phone_and_vehicle_title: {
    en: 'Phone Number & Vehicle Number',
    ur: 'فون نمبر اور گاڑی کا نمبر',
  },
  vehicle_no_label: {
    en: 'Vehicle Number',
    ur: 'گاڑی کا نمبر (Vehicle Number)',
  },
  vehicle_no_hint: {
    en: 'Enter the delivery vehicle registration number (e.g. KHI-1234 or LEB-4589)',
    ur: 'ڈلیوری والی گاڑی کا رجسٹریشن نمبر درج کریں (مثلاً KHI-1234 یا LEB-4589)',
  },
  vehicle_no_placeholder: {
    en: 'e.g. KHI-1234 or LEB-4589',
    ur: 'مثلاً KHI-1234 یا LEB-4589',
  },
  vehicle_no_error: {
    en: 'Please enter a valid Vehicle Number (at least 3 alphanumeric characters).',
    ur: 'براہ کرم گاڑی کا درست نمبر درج کریں (کم از کم 3 حروف یا ہندسے)۔',
  },
  delivery_checkout_title: {
    en: 'Delivery Checkout',
    ur: 'ڈلیوری چیک آؤٹ',
  },
  delivery_checkout_instruction: {
    en: 'Capture a clear picture of the outgoing goods list, dispatch slip, gate pass, or invoice provided by the delivery person before confirming checkout.',
    ur: 'چیک آؤٹ کی تصدیق سے پہلے ڈلیوری والے شخص کی فراہم کردہ آؤٹ گوئنگ سامان کی فہرست، ڈسپیچ سلپ، گیٹ پاس یا رسید کی صاف تصویر لیں۔',
  },
  capture_outgoing_doc_label: {
    en: 'Outgoing Delivery Document',
    ur: 'آؤٹ گوئنگ ڈلیوری دستاویز',
  },
  capture_outgoing_doc_btn: {
    en: 'Capture Outgoing Document',
    ur: 'آؤٹ گوئنگ دستاویز کی تصویر لیں',
  },
  retake_outgoing_doc_btn: {
    en: 'Retake Outgoing Document',
    ur: 'دوبارہ تصویر لیں',
  },
  outgoing_doc_captured_badge: {
    en: 'Outgoing Document Captured ✓',
    ur: 'آؤٹ گوئنگ دستاویز محفوظ ہو گئی ✓',
  },
  confirm_checkout_btn: {
    en: 'Confirm Checkout',
    ur: 'چیک آؤٹ کی تصدیق کریں',
  },
  information_form_title: {
    en: 'Information Form',
    ur: 'معلومات کا فارم',
  },
  admin_qa_employee_requests: {
    en: 'Employee Requests',
    ur: 'ملازمین کی درخواستیں',
  },
  admin_qa_employee_requests_desc: {
    en: 'Review & approve employee registrations',
    ur: 'ملازمین کی رجسٹریشن درخواستوں کی منظوری',
  },
  admin_qa_operator_requests: {
    en: 'Operator Requests',
    ur: 'آپریٹر کی درخواستیں',
  },
  admin_qa_operator_requests_desc: {
    en: 'Approve operators & assign gate access',
    ur: 'آپریٹر رجسٹریشن اور گیٹ رسائی کی منظوری',
  },
  admin_qa_departments: {
    en: 'Departments',
    ur: 'شعبہ جات (Departments)',
  },
  admin_qa_departments_desc: {
    en: 'Manage departments & HOD contacts',
    ur: 'شعبہ جات اور سربراہان کی تفصیلات',
  },
  admin_qa_invite_vip: {
    en: 'Invite VIP Guest',
    ur: 'وی آئی پی مہمان مدعو کریں',
  },
  admin_qa_invite_vip_desc: {
    en: 'Register VIP arrival & vehicle pass',
    ur: 'وی آئی پی مہمان کی آمد اور گاڑی رجسٹر کریں',
  },
  admin_qa_pending_badge: {
    en: 'Pending',
    ur: 'زیر التواء',
  },
  admin_qa_no_pending: {
    en: 'No Pending',
    ur: 'کوئی زیر التواء نہیں',
  },
  admin_profile_label: {
    en: 'Admin Profile & Access',
    ur: 'ایڈمن پروفائل اور رسائی',
  },
};

const LanguageContext = createContext<LanguageContextType>({
  language: 'ur',
  setLanguage: () => {},
  toggleLanguage: () => {},
  t: (key: string, fallback?: string) => fallback || key,
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  // Urdu is the primary default language
  const [language, setLanguageState] = useState<Language>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('gk_lang') as Language | null;
      if (saved === 'en' || saved === 'ur') {
        return saved;
      }
    }
    return 'ur';
  });

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('gk_lang', lang);
  };

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = language;
      // Keep structural layout direction fixed as LTR so UI elements, logos, headers,
      // sidebars, cards, and buttons never flip or mirror positions when switching languages.
      document.documentElement.dir = 'ltr';
      document.documentElement.dataset.lang = language;
    }
  }, [language]);

  const toggleLanguage = () => {
    const next: Language = language === 'ur' ? 'en' : 'ur';
    setLanguage(next);
  };

  const t = (key: string, fallback?: string): string => {
    const dict = TRANSLATIONS[key];
    if (dict && dict[language]) {
      return dict[language];
    }
    return fallback || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, toggleLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
