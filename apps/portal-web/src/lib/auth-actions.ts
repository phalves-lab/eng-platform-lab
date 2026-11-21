'use server'

import { signIn, signOut } from '@/auth'
import { SIGN_IN_PATH, safeCallbackUrl } from '@/lib/access'

/** Starts the Entra ID sign-in and comes back to the page the person asked for. */
export async function signInWithEntra(formData: FormData) {
  await signIn('microsoft-entra-id', { redirectTo: safeCallbackUrl(formData.get('callbackUrl')) })
}

/** Ends the portal session and clears the session cookie. */
export async function signOutOfPortal() {
  await signOut({ redirectTo: SIGN_IN_PATH })
}
