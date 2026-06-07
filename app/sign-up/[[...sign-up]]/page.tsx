import { SignUp } from '@clerk/nextjs';

const clerkAppearance = {
  variables: {
    colorPrimary:       '#8B5CF6',
    colorBackground:    '#0D1220',
    colorText:          '#ffffff',
    colorTextSecondary: '#94a3b8',
    colorInputBackground: '#1A2540',
    colorInputText:     '#ffffff',
    colorNeutral:       '#1E2D4A',
    borderRadius:       '0.75rem',
  },
  elements: {
    rootBox:  { width: '100%', maxWidth: '480px' },
    card: {
      backgroundColor: '#0D1220',
      border:          '1px solid #1E2D4A',
      boxShadow:       '0 25px 50px -12px rgba(0,0,0,0.8)',
    },
    headerTitle:    { color: '#ffffff', fontWeight: '900' },
    headerSubtitle: { color: '#94a3b8' },
    formFieldLabel: { color: '#94a3b8', fontSize: '12px', textTransform: 'uppercase' as const, letterSpacing: '0.05em' },
    formFieldInput: {
      backgroundColor: '#1A2540',
      borderColor:     '#1E2D4A',
      color:           '#ffffff',
    },
    formButtonPrimary: {
      background:  'linear-gradient(135deg, #7C3AED, #A78BFA)',
      color:       '#ffffff',
      fontWeight:  '900',
      border:      'none',
    },
    socialButtonsBlockButton: {
      backgroundColor: '#1A2540',
      borderColor:     '#1E2D4A',
      color:           '#ffffff',
    },
    socialButtonsBlockButtonText: { color: '#ffffff' },
    dividerLine:    { backgroundColor: '#1E2D4A' },
    dividerText:    { color: '#475569' },
    footerActionLink:       { color: '#A78BFA' },
    footerActionText:       { color: '#64748b' },
    identityPreviewText:    { color: '#ffffff' },
    identityPreviewEditButton: { color: '#A78BFA' },
    formResendCodeLink:     { color: '#A78BFA' },
    otpCodeFieldInput: {
      backgroundColor: '#1A2540',
      borderColor:     '#1E2D4A',
      color:           '#ffffff',
    },
    alertText: { color: '#94a3b8' },
    formFieldSuccessText: { color: '#34d399' },
    formFieldErrorText:   { color: '#f87171' },
  },
} as const;

export default function SignUpPage() {
  return (
    <main
      className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{ background: '#06080F' }}
    >
      <div className="mb-8 text-center">
        <h1 className="text-4xl font-black tracking-tight text-white leading-none">
          Ball<span className="text-accent">IQ</span>
        </h1>
        <p className="text-xs text-slate-500 mt-1 uppercase tracking-widest">Sports Elo Platform</p>
      </div>
      <SignUp appearance={clerkAppearance} />
    </main>
  );
}
