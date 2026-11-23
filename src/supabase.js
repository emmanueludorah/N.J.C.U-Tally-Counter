import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY
const TABLE = 'submissions'

// A password-reset email link opens the app with "type=recovery" (or an
// error, if the link expired) in the address. Read it before the Supabase
// client reads and clears it.
const urlHash = typeof window !== 'undefined' ? (window.location.hash + window.location.search) : ''
const recoveryLinkError = /[#&?]error_code=/.test(urlHash)
  ? 'This reset link is invalid or has expired. Please request a new one.'
  : ''
const openedFromRecoveryLink = /[#&?]type=recovery/.test(urlHash) || Boolean(recoveryLinkError)

export const supabase =
  SUPABASE_URL && SUPABASE_ANON_KEY ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null

const NOT_CONFIGURED = new Error(
  'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env',
)

// Database rows use snake_case; the app uses camelCase.
function fromRow(row) {
  return {
    id: row.id,
    submittedBy: row.submitted_by,
    service: row.service ?? '',
    submittedAt: row.submitted_at,
    tallies: Array.isArray(row.tallies) ? row.tallies : [],
  }
}

/**
 * Uploads a tally submission to Supabase.
 */
export async function submitTallyToCloud(submission) {
  if (!supabase) throw NOT_CONFIGURED
  // Insert only: the phones are allowed to add submissions, never to read,
  // change or delete them. The server sets submitted_at itself.
  const { error } = await supabase.from(TABLE).insert({
    id: submission.id,
    submitted_by: submission.submittedBy,
    // Older saved-offline submissions have no service.
    ...(submission.service ? { service: submission.service } : {}),
    tallies: submission.tallies,
  })
  // 23505 = this id is already saved. That happens when an earlier attempt
  // arrived but the reply was lost, so the submission is already there.
  if (error && error.code !== '23505') throw error
}

/**
 * True when a failed send was caused by having no connection (so it is worth
 * retrying later), rather than the database rejecting the data.
 */
export function isConnectionError(err) {
  if (err === NOT_CONFIGURED || err?.message?.includes('Supabase is not configured')) return false
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  // Database errors carry a code; failed network requests do not.
  return !err?.code
}

async function fetchAll() {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .order('submitted_at', { ascending: false })
  if (error) throw error
  return data.map(fromRow)
}

/**
 * Loads all submissions, then re-loads whenever any device inserts, updates
 * or deletes one. Returns an unsubscribe function.
 */
export function subscribeToSubmissions(onUpdate, onError) {
  if (!supabase) {
    onError?.(NOT_CONFIGURED)
    return () => {}
  }

  let active = true
  const refresh = () =>
    fetchAll()
      .then((items) => active && onUpdate(items))
      .catch((err) => {
        console.warn('Supabase fetch error (falling back to local):', err)
        if (active) onError?.(err)
      })

  refresh()

  const channel = supabase
    .channel(`${TABLE}-changes`)
    .on('postgres_changes', { event: '*', schema: 'public', table: TABLE }, refresh)
    .subscribe((status, err) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.warn('Supabase realtime error:', err ?? status)
        if (active) onError?.(err ?? new Error(status))
      }
    })

  return () => {
    active = false
    supabase.removeChannel(channel)
  }
}

/**
 * Removes a single submission from Supabase.
 */
export async function deleteSubmissionFromCloud(id) {
  if (!supabase) throw NOT_CONFIGURED
  const { error } = await supabase.from(TABLE).delete().eq('id', id)
  if (error) throw error
}

/**
 * Deletes all submissions from Supabase.
 */
export async function clearAllSubmissionsFromCloud() {
  if (!supabase) throw NOT_CONFIGURED
  // Supabase requires a filter on delete; this matches every row.
  const { error } = await supabase.from(TABLE).delete().neq('id', '')
  if (error) throw error
}

// ---------------------------------------------------------------------------
// Admin login (Supabase Auth). The password is checked by Supabase's servers,
// never in this code, and only accounts listed in the admins table can read
// or delete submissions.
// ---------------------------------------------------------------------------

async function isAdmin() {
  const { data, error } = await supabase.rpc('is_admin')
  if (error) throw error
  return data === true
}

/**
 * Signs in an admin. Throws a user-friendly error if the email/password is
 * wrong or the account is not an admin.
 */
export async function signInAdmin(email, password) {
  if (!supabase) throw NOT_CONFIGURED
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) {
    throw new Error(
      error.status === 429
        ? 'Too many attempts. Please wait a few minutes and try again.'
        : 'Incorrect email or password.',
    )
  }
  if (!(await isAdmin())) {
    await supabase.auth.signOut()
    throw new Error('This account does not have admin access.')
  }
}

/**
 * Returns true if an admin is already signed in on this device.
 */
export async function hasAdminSession() {
  if (!supabase) return false
  const { data } = await supabase.auth.getSession()
  if (!data.session) return false
  try {
    return await isAdmin()
  } catch {
    return false
  }
}

/**
 * True when the app was opened from a password-reset email link.
 */
export function isPasswordRecovery() {
  return openedFromRecoveryLink
}

/** An error message if the reset link was expired or invalid, else ''. */
export function getRecoveryLinkError() {
  return recoveryLinkError
}

/**
 * Emails a password-reset link. Supabase only sends it if the account exists,
 * and the reply is the same either way so emails cannot be guessed.
 */
export async function sendPasswordReset(email) {
  if (!supabase) throw NOT_CONFIGURED
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/`,
  })
  if (error) {
    throw new Error(
      error.status === 429
        ? 'Too many reset emails. Please wait a while and try again.'
        : 'Could not send the reset email. Please try again.',
    )
  }
}

/**
 * Sets a new password for the account signed in by the reset link, then
 * confirms it is an admin.
 */
export async function setNewPassword(password) {
  if (!supabase) throw NOT_CONFIGURED
  const { data } = await supabase.auth.getSession()
  if (!data.session) {
    throw new Error('This reset link is invalid or has expired. Please request a new one.')
  }
  const { error } = await supabase.auth.updateUser({ password })
  if (error) {
    throw new Error(
      error.code === 'same_password'
        ? 'The new password must be different from the old one.'
        : error.code === 'weak_password'
          ? 'That password is too weak. Use at least 8 characters.'
          : error.message || 'Could not change the password. Please try again.',
    )
  }
  if (!(await isAdmin())) {
    await supabase.auth.signOut()
    throw new Error('Password changed, but this account does not have admin access.')
  }
}

export async function signOutAdmin() {
  if (!supabase) return
  await supabase.auth.signOut()
}
