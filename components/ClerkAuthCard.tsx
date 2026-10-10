'use client';

// Clerk sign-in / sign-up card, themed.
//
// The appearance object used to be duplicated verbatim across both auth pages
// with ~36 hardcoded dark hexes, so in light mode the auth screens stayed dark
// while the rest of the app turned light. One palette per theme, one copy.
//
// Clerk's `variables` get colour maths applied to them (it derives hover and
// alpha shades), so these have to be real hex values — a `var(--c-card)` would
// break that. Hence the explicit two-palette approach rather than CSS vars.

import { SignIn, SignUp } from '@clerk/nextjs';
import { useThemeStore } from '@/lib/themeStore';

// Mirrors the --c-* design tokens in globals.css.
const PALETTE = {
  dark: {
    card: '#0D1220', layer: '#1A2540', rim: '#1E2D4A',
    ink: '#FFFFFF', sub: '#94A3B8', dim: '#475569', footer: '#64748B',
    shadow: '0 25px 50px -12px rgba(0,0,0,0.8)',
  },
  light: {
    card: '#FFFFFF', layer: '#F8FAFC', rim: '#CBD5E1',
    ink: '#0F172A', sub: '#1E293B', dim: '#475569', footer: '#475569',
    shadow: '0 20px 40px -12px rgba(15,23,42,0.18)',
  },
} as const;

// Violet brand ramp reads correctly on both grounds, so it is theme-independent.
const ACCENT      = '#8B5CF6';
const ACCENT_LINK = '#7C3AED';
const GRADIENT    = 'linear-gradient(135deg, #7C3AED, #A78BFA)';

function buildAppearance(theme: 'dark' | 'light') {
  const p = PALETTE[theme];
  const field = { backgroundColor: p.layer, borderColor: p.rim, color: p.ink };

  return {
    variables: {
      colorPrimary:         ACCENT,
      colorBackground:      p.card,
      colorText:            p.ink,
      colorTextSecondary:   p.sub,
      colorInputBackground: p.layer,
      colorInputText:       p.ink,
      colorNeutral:         p.rim,
      borderRadius:         '0.75rem',
    },
    elements: {
      rootBox: { width: '100%', maxWidth: '480px' },
      card: { backgroundColor: p.card, border: `1px solid ${p.rim}`, boxShadow: p.shadow },
      headerTitle:    { color: p.ink, fontWeight: '900' },
      headerSubtitle: { color: p.sub },
      formFieldLabel: {
        color: p.sub, fontSize: '12px',
        textTransform: 'uppercase' as const, letterSpacing: '0.05em',
      },
      formFieldInput: field,
      formButtonPrimary: {
        background: GRADIENT, color: '#FFFFFF', fontWeight: '900', border: 'none',
      },
      socialButtonsBlockButton:     field,
      socialButtonsBlockButtonText: { color: p.ink },
      dividerLine: { backgroundColor: p.rim },
      dividerText: { color: p.dim },
      footerActionLink: { color: theme === 'light' ? ACCENT_LINK : '#A78BFA' },
      footerActionText: { color: p.footer },
      identityPreviewText:       { color: p.ink },
      identityPreviewEditButton: { color: theme === 'light' ? ACCENT_LINK : '#A78BFA' },
      formResendCodeLink:        { color: theme === 'light' ? ACCENT_LINK : '#A78BFA' },
      otpCodeFieldInput: field,
      alertText:            { color: p.sub },
      formFieldSuccessText: { color: theme === 'light' ? '#059669' : '#34D399' },
      formFieldErrorText:   { color: theme === 'light' ? '#DC2626' : '#F87171' },
    },
  };
}

export default function ClerkAuthCard({ mode }: { mode: 'sign-in' | 'sign-up' }) {
  const theme = useThemeStore((s) => s.theme);
  const appearance = buildAppearance(theme);

  return mode === 'sign-in'
    ? <SignIn appearance={appearance} />
    : <SignUp appearance={appearance} />;
}
