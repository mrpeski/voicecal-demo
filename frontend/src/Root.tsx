import { ClerkProvider, SignIn, useAuth, UserButton } from '@clerk/react';
import App from './App';

const PUBLISHABLE = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY?.trim() ?? '';

/**
 * When `VITE_CLERK_PUBLISHABLE_KEY` is set, the app is wrapped in Clerk;
 * the API layer sends session JWTs and the FastAPI backend can set CLERK_* to verify.
 * Without a key, the app runs as before (backend should keep CLERK_ENABLED=false).
 */
function ClerkGated() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  if (!isLoaded) {
    return (
      <div
        style={{
          height: '100%',
          display: 'grid',
          placeItems: 'center',
          color: 'var(--text2)',
          background: 'var(--bg)',
          fontSize: 14,
        }}
      >
        Loading…
      </div>
    );
  }
  if (!isSignedIn) {
    return (
      <div
        style={{
          minHeight: '100%',
          display: 'grid',
          placeItems: 'center',
          padding: 24,
          background: 'var(--bg)',
        }}
      >
        <SignIn routing="hash" />
      </div>
    );
  }
  return (
    <App
      getToken={getToken}
      userButton={
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <UserButton
            appearance={{
              elements: {
                userButtonAvatarBox: { width: 28, height: 28 },
              },
            }}
          />
        </div>
      }
    />
  );
}

export function Root() {
  if (PUBLISHABLE) {
    return (
      <ClerkProvider publishableKey={PUBLISHABLE} afterSignOutUrl="/">
        <ClerkGated />
      </ClerkProvider>
    );
  }
  return <App />;
}
