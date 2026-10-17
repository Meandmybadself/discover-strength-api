// Types derived from observed responses on api-fit-mbo.axl3.io.
// All fields are best-effort; the underlying service is undocumented.

export interface UserRef {
  ClientID: string;
  PersonID: string;
}

export interface Location {
  ClientID: string;
  LocationID: string;
  GroupID: string;
  Status: string;
  Nickname: string;
  Slug: string;
  Description: string;
  ClientName: string;
  MarketName: string;
  MarketSlug: string | null;
  AltName: string | null;
  Address: string;
  City: string;
  State: string;
  StateLong: string;
  Zip: string;
  Country: string;
  Phone: string | null;
  SMSNumber: string | null;
  Email: string;
  Latitude: string;
  Longitude: string;
  Virtual: string;
  mboSiteID: string;
}

export interface Studio extends Location {
  hasFutureClasses: boolean;
  hasAppointments: boolean;
  hideIfNoAppointments: boolean;
  hideIfNoClasses?: boolean;
  TimeZone: string;
}

export interface Coach {
  GroupID: string;
  ClientID: string;
  CoachID: string;
  FirstName: string;
  Nickname?: string;
  LastName: string;
  Headshot: string;
  Title: string | null;
  Biography: string | null;
  LocationIDs?: string[];
  Type?: string;
}

export interface SessionType {
  SessionTypeID: string;
  SessionName: string;
  CategoryID: string;
  SortOrder: string;
}

export interface SessionCategory {
  id: string;
  Name: string;
  Description: string;
  SortOrder: string;
  SessionTypes: SessionType[];
}

export interface SessionTimeSlot {
  Start: string; // "YYYY-MM-DD HH:mm:ss"
  End: string;
}

export interface AvailableTimeBlock {
  ClientID: string;
  LocationID: string;
  CoachID: number;
  AppointmentID: number;
  SessionTypeID: string;
  SessionTimes: SessionTimeSlot[];
}

export interface Package {
  Name: string;
  ID: number;
  FinePrint: string;
  Expires: string; // "YYYY-MM-DD"
  Remaining: number;
}

export interface ActivePackage {
  type: string;
  pricingOptionName: string;
  totalRemaining: string;
  activeDate: string;
  expDate: string;
  unbooked: string;
  purchased: string;
}

export interface UserClassCoach {
  GroupID: string;
  ClientID: string;
  mboSiteID: string;
  CoachID: string;
  FirstName: string;
  LastName: string;
  Title: string | false;
  Headshot: string;
  Biography: string | null;
}

export interface UserClassLocation {
  ClientID: string;
  LocationID: string;
  mboSiteID: string;
  Status: string;
  Nickname: string;
  MarketName: string;
  Slug: string;
  Address: string;
  City: string;
  State: string;
  Zip: string;
  Country: string;
  Phone: string | null;
  Email: string;
  TimeZone: string;
  Latitude: string;
  Longitude: string;
  Description: string;
}

export interface UserClass {
  GroupID: string;
  ClientID: string;
  mboSiteID: string;
  LocationID: string;
  PersonID: string;
  AltPersonID: string;
  Status: string;
  VisitRefNo: string;
  RegistrationID: string;
  StartDateTime: string;
  EndDateTime: string;
  Name: string;
  Substitute: string | null;
  Available: number | null;
  CoachID: string;
  Nickname: string;
  ClientName: string;
  MarketSlug: string | null;
  VirtualStreamLink: string | false;
  RoomName: string | null;
  FirstName: string;
  LastName: string;
  AddOnsPurchased: unknown[];
  AddOnsAvailable: number;
  isWaitlist: boolean;
  Type: string;
  TimeZone: string;
  Coach: UserClassCoach;
  Location: UserClassLocation;
  bringFriendAvailable: boolean;
  bringPlusOneAvailable: boolean;
  isCancellable: boolean;
  IsLateCancel: boolean;
  onlineBookingAvailable: boolean;
  ShareText: string;
}

export interface UserStatus {
  hasUpcomingClass: boolean;
  hasPastClass: boolean;
  hasActivePackage: boolean;
  hasFutureAutopay: boolean;
  numAccounts: number;
  nextClassDateTime: string | null;
  lastClassDateTime: string | null;
  totalClasses: number;
  totalClassesLast30: number;
  weekStreak: number;
  inRewardsProgram: boolean;
  rewardsBalance: number;
  supportsAppointments: boolean;
  hasPricingOptions: boolean;
  liabilityReleased: boolean;
  liabilityWaivers: unknown[];
  referAFriend: boolean;
  hasUpcomingFriendBookings: boolean;
  MembershipContract: unknown | null;
  hasFamilyOptions: boolean;
  homeStudio: Studio;
  promptReview: boolean;
  ActivePackages: ActivePackage[];
}

// ---------- Request bodies ----------

export interface UserStatusRequest extends UserRef {
  appVersion?: string;
}

export interface UserClassesRequest extends UserRef {
  FutureOnly?: boolean;
  Type?: 'Both' | 'Class' | 'Appointment';
}

export interface ContentGetRequest {
  Label: string;
  User: UserRef;
}

export interface ContentGetResponse {
  code: number;
  message: string;
  [extra: string]: unknown;
}

export interface AppointmentFiltersRequest {
  Locations: string; // e.g. "100946-1"
}

export interface AppointmentFiltersResponse {
  SessionCategories: SessionCategory[];
}

export interface AvailableTimesRequest {
  Date: string; // "YYYY-MM-DD"
  StartTime?: string; // "0:00:00"
  EndTime?: string; // "23:00:00"
  Locations: string; // "100946-1"
  SessionName: string; // e.g. "Group"
  ShowUTCTime?: boolean;
}

export interface AvailableTimesResponse {
  AvailableTimes: AvailableTimeBlock[];
  Coaches: Coach[];
  Locations: Location[];
}

export interface PrebookRequest {
  ClientID: string;
  LocationID: string;
  SessionTypeID: string;
  StartDateTime: string;
  User: UserRef;
}

export interface PrebookResponse {
  PackageCount: number;
  Packages: Package[];
  PackageOptions: unknown[];
  AllowUnpaid: boolean;
  AllowAddons: boolean;
  AllowNotes: boolean;
  InformationRequired: unknown | null;
}

export interface BookRequest {
  AppointmentDescription: string;
  ClientID: string;
  CoachID: string;
  EndDateTime: string;
  LocationID: string;
  Notes?: string;
  SessionTypeID: string;
  StartDateTime: string;
  User: UserRef;
}

export interface BookResponse {
  GenderPreference: string;
  Duration: number;
  CoachID: number | null;
  AppointmentID: number;
  Status: string;
  StartDateTime: string;
  EndDateTime: string;
  Notes: string;
  StaffRequested: boolean;
  ProgramID: number;
  SessionTypeID: number;
  LocationID: number;
  StaffID: number;
  PersonID: string;
  FirstAppointment: boolean;
  ClientServiceID: number | null;
  Resources: unknown[];
  bringPlusOneAvailable: boolean;
}

export interface CancelAppointmentRequest {
  Appointment: {
    AppointmentID: string;
    ClientID: string;
  };
  User: UserRef;
}

export interface CancelAppointmentResponse {
  code: number;
  message: string; // "Success"
}

export interface ClassFiltersResponse {
  Locations: Location[];
}
