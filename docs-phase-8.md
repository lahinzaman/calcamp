# Phase 8 — CalCamp

CalCamp's presentation and expanded authentication are implemented. No hosted Supabase settings, provider credentials, migration deployment, backend deployment, or OTA publication was changed in this phase.

## Delivered

- CalCamp app/package names, permission copy, notifications, onboarding, headings, native display names and a new geometric launcher/splash mark. The generated local Xcode target is `CalCampDev`; Android displays `CalCamp Dev` for development.
- Manjari Thin/Regular/Bold bundled with `expo-font` and loaded before normal routes appear. App-owned Text and TextInput primitives apply the font and enforce dark text in Light and white text in Dark/Gray. Native navigation uses Manjari too. Operating-system/provider-owned dialogs retain their platform typography.
- Explicit Light, Dark and Gray preferences, persisted on the device. Semantic surface colors replace scarlet and hard-coded light cards throughout the app, including modal content. Contrast tests cover every theme's background, card, raised surface and button surface.
- Five tabs: Today, Dining, Workout, Campus, Settings. Today shows real intake/targets, remaining energy, animated macro progress and the four-day Upper/Lower plan. Walk remains reachable from Today and has its own back navigation.
- Dining retains the campus feed, manual portion correction and offline diary behavior, with food-name emoji mapping, horizontally scrollable hall selection, and animated FlashList cells. Emojis are decorative classifications; they never determine nutrition or allergens.
- Four actual Upper/Lower workout templates with three editable sets per lift, existing RPE/Brzycki/rest timer behavior, a catalog seed migration, and animated insertion/removal. Exercise identity and mechanical variation remain stable.
- Reanimated button feedback, macro fills and positioned FlashList cell transitions. Reanimated animations use the system reduced-motion preference; the existing isolated rest countdown remains separate from the rest of the app.
- Google and Apple OAuth through the platform authentication browser, Supabase PKCE code exchange, a callback route, SMS OTP request/verification, resend cooldown, sanitized errors and shared profile hydration.

### Identity compatibility

The EAS project UUID, Supabase project, backend URL, `com.rulocked.app` bundle/application IDs, durable diary keys, background task IDs and legacy `rulocked` deep-link alias deliberately remain stable. Changing these would disconnect installed apps or their stored data.

The visible project/app name is CalCamp. `app.json` uses the new `calcamp` slug; dynamic config retains the existing remote EAS slug `rulocked` until the owner renames that project in the Expo dashboard. After that rename, set `EXPO_PROJECT_SLUG=calcamp` consistently in local and all EAS environments. Keep project ID `83bb9069-dd83-4d41-bfa5-a760d7d1c06a`. EAS profile names/channels (`development`, `testing`, `production`) are deployment labels, not consumer branding, and remain unchanged.

Rutgers location/menu names remain factual campus data. The university name no longer serves as the app's branding or visual theme.

## Authentication setup

The mobile app only needs the existing public Supabase URL/key. Provider secrets belong in Supabase's provider configuration, never in `EXPO_PUBLIC_*` variables or the repository.

Read-only verification on September 9, 2026 confirmed Email enabled and Google, Apple, and Phone disabled in the hosted project's public Auth settings. Enable and configure those providers before testing the new sign-in options.

1. Add exact Supabase Auth redirect allow-list entries:

   ```text
   calcamp://auth-callback
   calcamp-preview://auth-callback
   calcamp-development://auth-callback
   ```

   Add the deployed web origin's `/auth-callback` URL. For local web testing, allow only the development origin/port being used, for example `http://localhost:8093/auth-callback`. Native variants have separate schemes to prevent a preview install from receiving production auth callbacks. Use development or release binaries, not Expo Go, for native OAuth callback testing.

2. Google: configure a Web OAuth client in Google Cloud, authorized origins, consent-screen branding and the Supabase callback `https://obefcsiwmpsrhgghjwbe.supabase.co/auth/v1/callback`. Enable Google in Supabase with that client ID/secret. This is hosted OAuth, not a native Google SDK flow. See [Supabase Google setup](https://supabase.com/docs/guides/auth/social-login/auth-google).
3. Apple: configure an Apple Services ID, domain and the same Supabase HTTPS callback, then enable Apple in Supabase with the Services ID and generated client secret. Put the Services ID first if multiple client IDs are configured. Rotate the OAuth client secret before its six-month expiry. This implementation uses Apple OAuth in an authentication browser; it does not add `expo-apple-authentication` or claim native Apple AuthenticationServices behavior. See [Supabase Apple setup](https://supabase.com/docs/guides/auth/social-login/auth-apple).
4. Phone: enable Phone Auth and configure an SMS provider and production delivery/rate-limit settings in Supabase. Use six-digit OTPs. The UI accepts E.164 numbers, locks the destination during verification, uses the OS one-time-code hint, and limits resends for 60 seconds. Client cooldown is a usability measure; Supabase must enforce server limits. Test with your provider's approved test numbers before live SMS delivery. See [Supabase phone sign-in](https://supabase.com/docs/guides/auth/phone-login).
5. Email/password remains available. Email confirmation requirements are not disabled. Verified OAuth/phone sessions enter the existing profile-loading path without requiring an email confirmation field; first-time users proceed to onboarding. A failed or missing session never unlocks routes. Sign in with the original method to reach an existing account; the app does not silently merge accounts using editable metadata.

The callback accepts only the exact configured callback origin/path and a PKCE code. It rejects token-fragment injection, coalesces concurrent code exchanges, allows retries after failure, and does not repeat a successful exchange. Do not log callback URLs, verification codes or provider tokens.

**Apple launch dependency:** the existing Phase 7 deletion endpoint deletes the Supabase identity and app data; it does not yet revoke Apple provider grants through Apple's REST API. Complete provider-token revocation and test deletion with an Apple-created account before enabling Apple sign-in for public launch. This remains a separate server credential/token-lifecycle integration; deleting a Supabase identity must not be described as revoking Apple's grant. [Apple's account-deletion guidance](https://developer.apple.com/support/offering-account-deletion-in-your-app/) describes this requirement.

## Catalog migration and native build

Apply `supabase/migrations/20260909220937_phase8_upper_lower_catalog.sql` before using the new templates against the hosted database. It seeds six shared lifts with stable UUIDs and preserves existing RLS policies. Existing row and pulldown catalog IDs are unchanged. Review pending migrations before pushing:

```sh
npx supabase migration list --linked
npx supabase db push --linked --dry-run
npx supabase db push --linked
```

The native app name, font resources, launcher assets and URL schemes require a **new native binary**. Do not publish this entire phase as an OTA patch to a Phase 7 binary. Runtime fingerprints will differ.

```sh
npm ci
npm run typecheck
npm test
npm run verify:native
APP_VARIANT=development npx expo prebuild --no-clean --no-install
pod install --project-directory=ios
open ios/CalCampDev.xcworkspace
```

Expo 57 prebuild recreates native directories by default; `--no-clean` is the incremental option. The initial regeneration in this phase was backed up at `/private/tmp/calcamp-native-before.tgz`. The previous Podfile lockfile and Node environment file were restored before successful pod installation; existing signing-team settings were preserved where present. Use the new CalCamp workspace instead of the old RULocked workspace. The HealthKit `patch-package` fix remains unchanged.

Cloud builds retain the Phase 7 profiles:

```sh
npm run eas -- build --platform ios --profile preview
npm run eas -- build --platform ios --profile production
npm run eas -- build --platform android --profile preview
```

Review and commit the application/configuration changes before EAS builds. Generated `ios/` and `android/` remain ignored by Git as before; app config, plugins and the lockfile reproduce them for EAS. Supabase provider setup and EAS remote-project renaming are owner-side configuration steps, not actions already performed here.

## Explicit UI bug changelog

| Observed issue | Structural fix |
| --- | --- |
| Auth lacked safe-area protection and keyboard-aware bottom reachability. | Safe-area wrapper around KeyboardAvoidingView and a scrollable form with bottom padding. |
| Four dining hall labels were compressed into equal-width columns. | Horizontal selection strip with padded, minimum-height buttons; names no longer depend on fitting one quarter of a narrow screen. |
| Food sheet used a fixed 90% height and bottom padding that could conflict with the keyboard/home indicator. | Page-sheet presentation, safe-area container, keyboard avoidance and scrollable fields/actions. |
| Workout columns became too narrow on small screens or at accessibility font sizes. | Minimum 44-pixel input width and 48-pixel height; narrow/large-font layouts wrap into individually labeled fields. |
| Rest/diary cards used white text on fixed light or dark surfaces when theme changed. | Semantic surfaces plus centralized theme-aware text/input colors across all screens and modals. |
| Conflict-review and health-permission dialogs could overflow on large text. | Safe-area page sheets with scrollable content and reachable dismiss/confirm controls. |
| Notification settings used fixed top padding rather than physical insets. | Safe-area modal content; onboarding also gets side/bottom safe areas beneath its native header. |
| Review/discard links and common form actions had small hit areas. | At least 48-pixel primary action height; padded review/discard controls and inputs. |
| Global font defaults initially flattened the heading hierarchy in web rendering. | Removed inline font-size/line-height defaults that overrode NativeWind classes; font-family/color remain centralized. |
| Moving Walk out of tabs would have left it without visible return navigation. | Native stack header/back button, with screen top inset adjusted to avoid double padding. |
| Shared auth URL schemes could route a callback into another installed variant. | Unique production, preview and development callback schemes; legacy aliases only for compatibility. |

## Verification and remaining checks

Completed locally:

- 121 tests pass: existing sync/health/RLS/cascade coverage, phone validation and verified-session requirement, PKCE callback rejection/concurrency/retry, provider-agnostic hydration, theme contrast/persistence, dashboard targets, new workout templates/removal, and catalog IDs under existing RLS.
- Client/backend TypeScript checks and backend compilation pass.
- Production iOS, Android and web bundles export successfully.
- All three native variants introspect successfully, including CalCamp names, Manjari resources, unique schemes, OTA and existing HealthKit/Health Connect/Mapbox/background permissions.
- Native prebuild and CocoaPods installation succeed; Xcode lists the `CalCampDev` workspace/scheme.
- Browser-rendered auth inspected in Light, Dark and Gray, including a 360×780 phone viewport and the phone sign-in form. Corrected heading hierarchy was visually confirmed.

Still requires real-device/provider testing:

- Google/Apple success, cancellation, expired callbacks and cold-start callbacks on each installed variant; SMS delivery, invalid/expired OTP and resend limits. No live SMS or sign-in submissions were sent during implementation.
- Apple provider grant revocation on account deletion before public Apple sign-in launch.
- Full signed native build and physical iPhone/Android verification. Introspection and bundling do not prove native runtime behavior.
- VoiceOver/TalkBack, Dynamic Type at maximum sizes, keyboard/home-indicator clearance, Reduce Motion, long menu scrolling and recycled set editing. Host-component tests and desktop web rendering do not establish 60fps on older phones.
- Confirm offline queues, health imports, notification navigation and OTA checks remain correct in the new binary. Never infer user-data migration from the visual rename: IDs/storage keys intentionally stay stable.

Relevant versioned guidance: [Expo 57 SDK](https://docs.expo.dev/versions/v57.0.0/), [fonts](https://docs.expo.dev/versions/v57.0.0/sdk/font/), [AuthSession](https://docs.expo.dev/versions/v57.0.0/sdk/auth-session/), [Supabase mobile deep linking](https://supabase.com/docs/guides/auth/native-mobile-deep-linking), [Reanimated layout transitions](https://docs.swmansion.com/react-native-reanimated/docs/layout-animations/layout-transitions/).
